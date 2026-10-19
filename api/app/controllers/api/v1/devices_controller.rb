module Api
  module V1
    # A phone joins a ranch with its invite code and gets a device token back, while the ranch has room
    class DevicesController < BaseController
      skip_before_action :authenticate_member!

      def create
        ranch = Ranch.find_by!(invite_code: params.require(:invite_code).strip.upcase)
        # The lock keeps two hands joining at once from both taking the last spot
        member = ranch.with_lock { ranch.members.create!(name: params.require(:name)) unless ranch.full? }
        return render json: { error: "ranch_full", hand_limit: ranch.hand_limit }, status: :forbidden unless member

        render json: member.device_json, status: :created
      end
    end
  end
end
