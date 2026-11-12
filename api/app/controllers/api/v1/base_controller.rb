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

      attr_reader :current_member

      def current_ranch = current_member.ranch

      def authenticate_member!
        @current_member = authenticate_with_http_token { |token| Member.find_by(device_token: token) }
        return head :unauthorized unless @current_member

        # A body, unlike an unknown token's bare 401, so the app can tell the hand they're off the crew
        render json: { error: "removed" }, status: :unauthorized if @current_member.removed?
      end

      def require_owner!
        head :forbidden unless current_member.owner?
      end
    end
  end
end
