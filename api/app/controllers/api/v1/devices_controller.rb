module Api
  module V1
    # A phone joins a ranch with its invite code and gets a device token back, while the ranch has room.
    # Deleting the device is the hand leaving the ranch, or an owner signing this phone out.
    #
    # A hand who already joined (a new phone, a reinstall) gets their own spot back instead of taking another:
    # a name the crew already has answers 409 "name_taken", and the app asks whether that's them. `rejoin: true`
    # signs this phone in as that hand and the old phone out; `rejoin: false` is a second hand of the same name.
    #
    # shortcut: anyone holding the invite code can take a hand's spot by giving their name, the same code that
    # already lets them join and read everything, upgrade to a rejoin code per hand when a ranch asks for it
    class DevicesController < BaseController
      skip_before_action :authenticate_member!, only: :create
      # A code is six characters; this keeps anyone from walking through them
      rate_limit to: 10, within: 1.minute, only: :create

      def create
        ranch = Ranch.find_by!(invite_code: params.require(:invite_code).to_s.strip.upcase)
        name = params.require(:name).to_s.strip
        known = ranch.members.hand.active.named(name).order(:id).last

        if known && params[:rejoin].nil?
          return render json: { error: "name_taken", name: known.name, joined_at: known.created_at.iso8601 }, status: :conflict
        end
        return render json: known.device_json(known.sign_in!(only: true)), status: :ok if known && rejoin?

        # The lock keeps two hands joining at once from both taking the last spot
        member = ranch.with_lock { ranch.members.create!(name: name) unless ranch.full? }
        return render json: { error: "ranch_full", hand_limit: ranch.hand_limit }, status: :forbidden unless member

        render json: member.device_json(member.sign_in!), status: :created
      end

      # A hand leaves the crew. An owner can't walk away from their ranch (nobody would be left to run it),
      # so for them this only signs this phone out; their other phones stay signed in.
      def destroy
        current_member.owner? ? current_device.destroy! : current_member.remove!
        head :no_content
      end

      private

      def rejoin? = ActiveModel::Type::Boolean.new.cast(params[:rejoin])
    end
  end
end
