module Api
  module V1
    class SyncsController < BaseController
      rescue_from SyncPush::Forbidden, with: -> { head :forbidden }

      def show
        render json: SyncPull.new(ranch: current_ranch, last_pulled_at: params[:last_pulled_at]).call
      end

      def create
        SyncPush.new(member: current_member, changes: params.require(:changes).to_unsafe_h).call
        head :no_content
      end
    end
  end
end
