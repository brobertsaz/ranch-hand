module Api
  module V1
    # The ranch this phone belongs to, so the Crew tab can show and share the invite code. The owner sets
    # headquarters here, which sharpens the map around it, and can swap the invite code for a new one.
    class RanchesController < BaseController
      before_action :require_owner!, only: %i[update invite_code]

      def show
        render json: ranch_json
      end

      def update
        headquarters = params.require(:headquarters)
        area = current_ranch.place_headquarters!(
          lat: Float(headquarters.require(:lat)), lng: Float(headquarters.require(:lng)), miles: Integer(headquarters.fetch(:miles, 3))
        )
        render json: ranch_json.merge(map_area_id: area&.id&.to_s)
      rescue ArgumentError, TypeError
        render json: { error: "Headquarters needs a lat, lng and one of #{Ranch::HEADQUARTERS_MILES.join(", ")} miles" }, status: :unprocessable_content
      end

      def invite_code
        render json: { invite_code: current_ranch.regenerate_invite_code! }
      end

      private

      def ranch_json
        {
          id: current_ranch.id.to_s, name: current_ranch.name, invite_code: current_ranch.invite_code,
          hand_count: current_ranch.hand_count, hand_limit: current_ranch.hand_limit,
          plan: current_ranch.plan, unlimited_hands: current_ranch.unlimited_hands?,
          headquarters: current_ranch.headquarters
        }
      end
    end
  end
end
