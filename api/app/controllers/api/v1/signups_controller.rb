module Api
  module V1
    # The landing page's early-access form. Signing up again with the same email updates the answers.
    class SignupsController < BaseController
      skip_before_action :authenticate_member!
      rate_limit to: 5, within: 1.minute, only: :create

      def create
        fields = params.expect(signup: %i[name email state head_count rides phone])
        signup = Signup.find_or_initialize_by(email: fields[:email].to_s.strip.downcase)
        signup.update!(fields)
        head :created
      end
    end
  end
end
