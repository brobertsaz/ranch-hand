module Api
  module V1
    # An owner signs in with Google (Android) or Apple (iPhone). The first time starts their ranch; after that
    # (a new phone, a reinstall) it finds the same owner and hands back their device token.
    #
    # shortcut: an owner who signs in with Google on one phone and Apple on another gets two ranches, since
    # nothing ties the two accounts together (Apple can hide the email), upgrade to linking them from Settings
    # when an owner asks
    class OwnersController < BaseController
      skip_before_action :authenticate_member!

      rescue_from GoogleIdentity::Invalid, AppleIdentity::Invalid, with: -> { head :unauthorized }

      def create
        column, identity = identify
        owner = Member.owner.find_by(column => identity.sub) || start_ranch(column, identity)

        render json: owner.device_json, status: owner.previously_new_record? ? :created : :ok
      end

      private

      # Which column the provider's account ID is kept in, and who they say this is
      def identify
        if params[:apple_identity_token].present?
          [ :apple_sub, AppleIdentity.verify(params[:apple_identity_token].to_s, name: params[:name]) ]
        else
          [ :google_sub, GoogleIdentity.verify(params.require(:id_token)) ]
        end
      end

      def start_ranch(column, identity)
        Ranch.transaction do
          ranch = Ranch.create!(name: params[:ranch_name].to_s.strip.presence || "#{identity.name.split.first}'s Ranch")
          ranch.members.create!(role: :owner, name: identity.name.first(Member::NAME_LIMIT), email: identity.email, column => identity.sub)
        end
      rescue ActiveRecord::RecordNotUnique
        # A double tap: the other request already started this owner's ranch
        Member.owner.find_by!(column => identity.sub)
      end
    end
  end
end
