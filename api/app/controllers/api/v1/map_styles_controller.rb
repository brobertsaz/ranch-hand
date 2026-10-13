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
        # The app sends its token on map requests so the style can add the ranch's sharp areas.
        # Older apps don't, and get the plain style.
        @current_member = authenticate_with_http_token { |token| Member.find_by(device_token: token) }
        areas = current_member ? current_ranch.map_areas.ready.order(:id) : MapArea.none

        # Rails' default must-revalidate makes MapLibre refuse the copy stored in an offline pack
        # when there's no network, so a cold start offline shows no map.
        # A ranch's style is kept short so a download started once an area turns Ready includes it.
        if current_member
          expires_in 5.minutes, public: false
        else
          expires_in 1.hour, public: true
        end
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
            },
            **areas.to_h { |area| [ "naip-#{area.id}", naip_source(area) ] }
          },
          layers: [
            { id: "background", type: "background", paint: { "background-color": "#d9d3c3" } },
            { id: "imagery", type: "raster", source: "imagery" },
            *areas.map { |area| { id: "naip-#{area.id}", type: "raster", source: "naip-#{area.id}" } },
            # The app puts Topo after this, so Topo covers the sharp areas too
            { id: "aerial-top", type: "background", paint: { "background-opacity": 0 } }
          ]
        }
      end

      private

      # NAIP keeps its original URL, so offline packs saved before state imagery still match
      def tile_url(imagery)
        folder = imagery.naip? ? "" : "#{imagery.key}/"
        "#{request.base_url}/api/v1/map/tiles/#{folder}{z}/{x}/{y}.jpg"
      end

      # bounds keeps MapLibre from asking for tiles between pastures, live or in a download
      def naip_source(area)
        {
          type: "raster",
          tiles: [ tile_url(area.imagery) ],
          tileSize: 256,
          minzoom: NaipTiles::MIN_ZOOM,
          maxzoom: area.max_zoom,
          bounds: area.bounds.values_at(:west, :south, :east, :north),
          attribution: area.imagery.attribution
        }
      end
    end
  end
end
