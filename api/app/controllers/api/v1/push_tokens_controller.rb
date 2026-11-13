module Api
  module V1
    # The phone says where its notifications go: its own FCM (Android) or APNs (iPhone) token.
    # It sends this again whenever the token changes, and takes it back when notifications are turned off.
    class PushTokensController < BaseController
      # Tokens run to a few hundred characters; this keeps a bad client from storing essays
      TOKEN_LIMIT = 4096

      def update
        token = params.require(:token).to_s
        return head :unprocessable_content if token.length > TOKEN_LIMIT

        current_member.register_push!(platform: params.require(:platform).to_s, token: token)
        head :no_content
      end

      def destroy
        current_member.forget_push!
        head :no_content
      end
    end
  end
end
