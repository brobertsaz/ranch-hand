module Api
  module V1
    # The owner lets a hand go. Their phone is signed out on its next request; what they logged stays.
    class MembersController < BaseController
      before_action :require_owner!

      def destroy
        if params[:id] == current_member.id.to_s
          return render json: { error: "An owner can't remove themself" }, status: :unprocessable_content
        end

        # A hand who is already gone answers 204 again, so a retry after a dropped reply isn't an error
        current_ranch.members.hand.find(params[:id]).remove!
        head :no_content
      end
    end
  end
end
