module Api
  module V1
    # The ranch this phone belongs to, so the Crew tab can show and share the invite code. The owner sets
    # headquarters here, which sharpens the map around it.
    class RanchesController < BaseController
      def show
        render json: ranch_json
      end

      def update
        return head :forbidden unless current_member.owner?

        headquarters = params.require(:headquarters)
        area = current_ranch.place_headquarters!(lat: Float(headquarters.require(:lat)), lng: Float(headquarters.require(:lng)))
        render json: ranch_json.merge(map_area_id: area&.id&.to_s)
      rescue ArgumentError, TypeError
        render json: { error: "Headquarters must be numbers" }, status: :unprocessable_content
      end

      private

      def ranch_json
        {
          id: current_ranch.id.to_s, name: current_ranch.name, invite_code: current_ranch.invite_code,
          hand_count: current_ranch.members.hand.count, hand_limit: current_ranch.hand_limit,
          headquarters: current_ranch.headquarters
        }
      end
    end
  end
end
