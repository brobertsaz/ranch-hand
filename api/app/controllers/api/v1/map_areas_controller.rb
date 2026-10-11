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
        area = current_ranch.map_areas.create!(name: params.dig(:map_area, :name).presence || default_name, **MapArea.padded(**bounds))
        RenderMapAreaJob.perform_later(area)
        render json: area_json(area), status: :created
      rescue ArgumentError, TypeError
        render json: { error: "Bounds must be numbers" }, status: :unprocessable_content
      end

      private

      def default_name = "Area #{current_ranch.map_areas.count + 1}"

      def area_json(area)
        area.slice(:name, :west, :south, :east, :north, :status, :tile_count)
          .merge(id: area.id.to_s, estimated_tiles: area.estimated_tiles, rendered_at: area.rendered_at&.iso8601)
      end
    end
  end
end
