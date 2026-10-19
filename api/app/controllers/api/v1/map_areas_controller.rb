module Api
  module V1
    # Parts of the ranch with sharp aerial tiles. Creating one queues the render.
    class MapAreasController < BaseController
      def index
        render json: current_ranch.map_areas.order(:created_at).map { |area| area_json(area) }
      end

      # A box on screen (Sharpen this area), or so many miles around a point (a pasture on the headquarters screen)
      def create
        box = requested_box(params.require(:map_area))
        area = current_ranch.map_areas.create!(
          name: params.dig(:map_area, :name).to_s.strip.presence || default_name, source: MapArea.source_for(**box).key, **box
        )
        RenderMapAreaJob.perform_later(area)
        render json: area_json(area), status: :created
      rescue ArgumentError, TypeError
        render json: { error: "Bounds must be numbers" }, status: :unprocessable_content
      end

      # What sharpening would take, so the app can ask before starting it: for a box on screen, or for
      # so many miles around a point (the headquarters screen)
      def new
        box = requested_box(params)
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

      def requested_box(given)
        if given.key?(:miles)
          MapArea.around(lng: Float(given.require(:lng)), lat: Float(given.require(:lat)), miles: Float(given.require(:miles)))
        else
          MapArea.padded(**%i[west south east north].index_with { |side| Float(given.require(side)) })
        end
      end

      def default_name = "Area #{current_ranch.map_areas.count + 1}"

      def area_json(area)
        area.slice(:name, :west, :south, :east, :north, :status, :tile_count, :source, :max_zoom)
          .merge(id: area.id.to_s, source_name: area.imagery.name, estimated_tiles: area.estimated_tiles, rendered_at: area.rendered_at&.iso8601)
      end
    end
  end
end
