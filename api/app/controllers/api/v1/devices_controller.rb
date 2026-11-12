module Api
  module V1
    # A phone joins a ranch with its invite code and gets a device token back, while the ranch has room.
    # Deleting the device is the hand leaving the ranch.
    class DevicesController < BaseController
      skip_before_action :authenticate_member!, only: :create
      # A code is six characters; this keeps anyone from walking through them
      rate_limit to: 10, within: 1.minute, only: :create

      def create
        ranch = Ranch.find_by!(invite_code: params.require(:invite_code).to_s.strip.upcase)
        # The lock keeps two hands joining at once from both taking the last spot
        member = ranch.with_lock { ranch.members.create!(name: params.require(:name)) unless ranch.full? }
        return render json: { error: "ranch_full", hand_limit: ranch.hand_limit }, status: :forbidden unless member

        render json: member.device_json, status: :created
      end

      # An owner can't walk away from their ranch: nobody would be left to run it
      def destroy
        return render json: { error: "owner" }, status: :unprocessable_content if current_member.owner?

        current_member.remove!
        head :no_content
      end
    end
  end
end
