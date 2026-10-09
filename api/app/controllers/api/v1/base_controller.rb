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
        head :unauthorized unless @current_member
      end
    end
  end
end
