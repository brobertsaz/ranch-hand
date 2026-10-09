module Api
  module V1
    # The ranch this phone belongs to, so the Crew tab can show and share the invite code
    class RanchesController < BaseController
      def show
        render json: { id: current_ranch.id.to_s, name: current_ranch.name, invite_code: current_ranch.invite_code }
      end
    end
  end
end
