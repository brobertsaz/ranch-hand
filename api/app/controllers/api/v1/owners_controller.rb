module Api
  module V1
    # An owner signs in with Google. The first time starts their ranch; after that (a new phone, a reinstall)
    # it finds the same owner and hands back their device token.
    class OwnersController < BaseController
      skip_before_action :authenticate_member!

      rescue_from GoogleIdentity::Invalid, with: -> { head :unauthorized }

      def create
        identity = GoogleIdentity.verify(params.require(:id_token))
        owner = Member.owner.find_by(google_sub: identity.sub) || start_ranch(identity)

        render json: owner.device_json, status: owner.previously_new_record? ? :created : :ok
      end

      private

      def start_ranch(identity)
        Ranch.transaction do
          ranch = Ranch.create!(name: params[:ranch_name].to_s.strip.presence || "#{identity.name.split.first}'s Ranch")
          ranch.members.create!(role: :owner, name: identity.name, email: identity.email, google_sub: identity.sub)
        end
      end
    end
  end
end
