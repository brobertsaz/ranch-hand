module Api
  module V1
    # A phone joins a ranch with its invite code and gets a device token back
    class DevicesController < BaseController
      skip_before_action :authenticate_member!

      def create
        ranch = Ranch.find_by!(invite_code: params.require(:invite_code).strip.upcase)
        member = ranch.members.create!(name: params.require(:name))

        render json: {
          token: member.device_token,
          member_id: member.id.to_s,
          ranch: { id: ranch.id.to_s, name: ranch.name }
        }, status: :created
      end
    end
  end
end
