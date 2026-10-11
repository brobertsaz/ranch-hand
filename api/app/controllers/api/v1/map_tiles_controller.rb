module Api
  module V1
    # Pre-rendered NAIP tiles. Public like the USGS tiles they stand in for: the imagery is
    # public domain, and MapLibre fetches tiles without the app's token.
    class MapTilesController < BaseController
      skip_before_action :authenticate_member!

      def show
        z, x, y = params.values_at(:z, :x, :y).map(&:to_i)
        # A tile is never re-rendered in place (a new NAIP year would get new keys), so it can be cached for good
        expires_in 1.year, public: true
        send_data NaipTiles.read(z, x, y), type: "image/jpeg", disposition: "inline"
      rescue ActiveStorage::FileNotFoundError
        head :not_found
      end
    end
  end
end
