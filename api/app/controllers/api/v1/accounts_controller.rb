module Api
  module V1
    # Delete my account, as the app stores require. For a hand that erases who they were and leaves the
    # ranch its records. For the owner it deletes the ranch itself, for the whole crew.
    #
    # shortcut: an owner who signed in with Apple isn't signed out of the app on Apple's side (Settings, Apple
    # Account, Sign in with Apple still lists it), since revoking needs a client secret from a paid developer
    # account, upgrade before the iPhone build goes to App Review, which asks for it
    class AccountsController < BaseController
      def destroy
        current_member.owner? ? current_ranch.erase! : current_member.erase!
        head :no_content
      end
    end
  end
end
