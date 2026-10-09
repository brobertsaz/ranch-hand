module Api
  module V1
    # MapLibre style for the app. Offline packs are downloaded against this URL,
    # so the tile source can move to self-hosted NAIP tiles without an app release.
    class MapStylesController < BaseController
      skip_before_action :authenticate_member!

      # USGS imagery is public domain (it includes NAIP) and is served up to zoom 16
      DEFAULT_TILE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}".freeze
      # USGS Topo (contours, creeks, section lines), also public domain and also cached to zoom 16
      DEFAULT_TOPO_TILE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}".freeze

      def show
        # Rails' default must-revalidate makes MapLibre refuse the copy stored in an offline pack
        # when there's no network, so a cold start offline shows no map
        expires_in 1.hour, public: true
        render json: {
          version: 8,
          name: "Ranch Hand imagery",
          sources: {
            imagery: {
              type: "raster",
              tiles: [ ENV.fetch("MAP_TILE_URL", DEFAULT_TILE_URL) ],
              tileSize: 256,
              maxzoom: ENV.fetch("MAP_TILE_MAXZOOM", 16).to_i,
              attribution: "USGS The National Map"
            },
            # No layer here: the app draws it when a hand picks Topo. Being in the style is what
            # makes offline downloads include it, so the switch works with no signal.
            topo: {
              type: "raster",
              tiles: [ ENV.fetch("MAP_TOPO_TILE_URL", DEFAULT_TOPO_TILE_URL) ],
              tileSize: 256,
              maxzoom: 16,
              attribution: "USGS The National Map"
            }
          },
          layers: [
            { id: "background", type: "background", paint: { "background-color": "#d9d3c3" } },
            { id: "imagery", type: "raster", source: "imagery" }
          ]
        }
      end
    end
  end
end
