# The early-access list for the owner, at /signups. A browser sign-in (HTTP Basic) guards it;
# the password comes from SIGNUPS_PASSWORD, and without one set the page doesn't exist.
class SignupsController < ActionController::Base
  include ActionController::HttpAuthentication::Basic::ControllerMethods

  before_action :require_owner

  def index
    @signups = Signup.order(created_at: :desc)
  end

  private

  def require_owner
    password = ENV["SIGNUPS_PASSWORD"].to_s
    head :not_found and return if password.empty?

    authenticate_or_request_with_http_basic("Ranch Hand sign-ups") do |_name, given|
      ActiveSupport::SecurityUtils.secure_compare(given, password)
    end
  end
end
