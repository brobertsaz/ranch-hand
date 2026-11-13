module Api
  module V1
    # Delete my account, as the app stores require. For a hand that erases who they were and leaves the
    # ranch its records. For the owner it deletes the ranch itself, for the whole crew.
    class AccountsController < BaseController
      def destroy
        current_member.owner? ? current_ranch.erase! : current_member.erase!
        head :no_content
      end
    end
  end
end
