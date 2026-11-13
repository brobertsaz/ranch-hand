module Api
  module V1
    class SyncsController < BaseController
      # Weeks of offline work is a few hundred KB; a long ride's track is the bulk of it
      MAX_PUSH_BYTES = 20.megabytes

      rescue_from SyncPush::Malformed do |error|
        render json: { error: error.message }, status: :unprocessable_content
      end

      def show
        last_pulled_at = params[:last_pulled_at]
        unless last_pulled_at.blank? || (last_pulled_at.is_a?(String) && last_pulled_at.match?(/\A\d{1,15}\z/))
          return render json: { error: "last_pulled_at must be a time in milliseconds" }, status: :unprocessable_content
        end

        render json: SyncPull.new(ranch: current_ranch, last_pulled_at: last_pulled_at.presence).call
      end

      # Always 200 when the payload is the right shape: records that couldn't be applied are listed, not fatal
      def create
        # shortcut: Rails has parsed the JSON by the time this runs, so it limits the database work, not memory.
        # Cap request bodies at the proxy when one sits in front for real.
        return head :content_too_large if request.content_length.to_i > MAX_PUSH_BYTES

        changes = params[:changes]
        raise SyncPush::Malformed, "changes must be an object" unless changes.is_a?(ActionController::Parameters)

        render json: { rejected: SyncPush.new(member: current_member, changes: changes.to_unsafe_h).call }
      end
    end
  end
end
