module Api
  module V1
    class BaseController < ApplicationController
      include ActionController::HttpAuthentication::Token::ControllerMethods

      before_action :authenticate_member!

      rescue_from ActiveRecord::RecordNotFound, with: -> { head :not_found }
      rescue_from ActiveRecord::RecordInvalid do |error|
        render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_content
      end

      private

      attr_reader :current_member, :current_device

      def current_ranch = current_member.ranch

      def authenticate_member!
        @current_device = authenticate_with_http_token { |token| Device.includes(:member).find_by(token: token) }
        return head :unauthorized unless @current_device

        @current_member = @current_device.member
        # A body, unlike an unknown token's bare 401, so the app can tell the hand they're off the crew
        return render json: { error: "removed" }, status: :unauthorized if @current_member.removed?

        @current_device.seen!
      end

      def require_owner!
        head :forbidden unless current_member.owner?
      end
    end
  end
end
