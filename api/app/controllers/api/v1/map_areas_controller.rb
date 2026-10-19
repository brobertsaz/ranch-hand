module Api
  module V1
    # Parts of the ranch with sharp aerial tiles. Creating one queues the render.
    class MapAreasController < BaseController
      def index
        render json: current_ranch.map_areas.order(:created_at).map { |area| area_json(area) }
      end

      def create
        box = params.require(:map_area).permit(:west, :south, :east, :north)
        bounds = %i[west south east north].index_with { |side| Float(box.require(side)) }
        padded = MapArea.padded(**bounds)
        area = current_ranch.map_areas.create!(
          name: params.dig(:map_area, :name).presence || default_name, source: MapArea.source_for(**padded).key, **padded
        )
        RenderMapAreaJob.perform_later(area)
        render json: area_json(area), status: :created
      rescue ArgumentError, TypeError
        render json: { error: "Bounds must be numbers" }, status: :unprocessable_content
      end

      # What sharpening would take, so the app can ask before starting it: for a box on screen, or for
      # so many miles around a point (the headquarters screen)
      def new
        box =
          if params.key?(:miles)
            MapArea.around(lng: Float(params.require(:lng)), lat: Float(params.require(:lat)), miles: Float(params[:miles]))
          else
            MapArea.padded(**%i[west south east north].index_with { |side| Float(params.require(side)) })
          end
        area = MapArea.new(box.merge(source: MapArea.source_for(**box).key))
        render json: area.slice(:source).merge(
          source_name: area.imagery.name, max_zoom: area.max_zoom, estimated_tiles: area.estimated_tiles,
          estimated_megabytes: area.estimated_megabytes, estimated_minutes: area.estimated_minutes
        )
      rescue ArgumentError, TypeError
        render json: { error: "Bounds must be numbers" }, status: :unprocessable_content
      end

      # Cancels a render in progress too: the job stops once its area is gone
      def destroy
        current_ranch.map_areas.find(params[:id]).destroy!
        head :no_content
      end

      private

      def default_name = "Area #{current_ranch.map_areas.count + 1}"

      def area_json(area)
        area.slice(:name, :west, :south, :east, :north, :status, :tile_count, :source, :max_zoom)
          .merge(id: area.id.to_s, source_name: area.imagery.name, estimated_tiles: area.estimated_tiles, rendered_at: area.rendered_at&.iso8601)
      end
    end
  end
end
