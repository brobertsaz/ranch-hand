require "net/http"

# Zoom 17-18 aerial tiles of NAIP imagery (public domain, 0.3-0.6 m). The USGS basemap cache stops at 16,
# so tiles are rendered ahead of time and served from our own storage.
#
# Tiles come from Microsoft Planetary Computer's NAIP mosaic (about 0.1 s a tile). Where it has no
# coverage they come from the USGS ImageServer, which has the same imagery but takes ~10 s a tile.
class NaipTiles
  ZOOMS = (17..18)
  PLANETARY_URL = "https://planetarycomputer.microsoft.com/api/data/v1".freeze
  # Every NAIP scene, newest on top. Registering returns the same id for the same search.
  MOSAIC_SEARCH = { collections: [ "naip" ], sortby: [ { field: "datetime", direction: "desc" } ] }.freeze
  EXPORT_URL = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage".freeze
  # Half the circumference of the Web Mercator world, in metres
  ORIGIN = 20_037_508.342789244

  class << self
    # Every [z, x, y] at ZOOMS that touches the box
    def tiles_in(west:, south:, east:, north:)
      ZOOMS.flat_map do |z|
        xs = tile_x(west, z)..tile_x(east, z)
        ys = tile_y(north, z)..tile_y(south, z)
        xs.to_a.product(ys.to_a).map { |x, y| [ z, x, y ] }
      end
    end

    def count_in(west:, south:, east:, north:)
      ZOOMS.sum { |z| (tile_x(east, z) - tile_x(west, z) + 1) * (tile_y(south, z) - tile_y(north, z) + 1) }
    end

    def tile_x(lng, z) = ((lng + 180) / 360 * (2**z)).floor

    def tile_y(lat, z)
      rad = lat * Math::PI / 180
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math::PI) / 2 * (2**z)).floor
    end

    # The tile's box in EPSG:3857, as the ImageServer wants it
    def mercator_bbox(z, x, y)
      size = 2 * ORIGIN / (2**z)
      [ -ORIGIN + x * size, ORIGIN - (y + 1) * size, -ORIGIN + (x + 1) * size, ORIGIN - y * size ]
    end

    def key(z, x, y) = "naip/#{z}/#{x}/#{y}.jpg"

    # Plain keys on the Active Storage service, not blobs: a big ranch is tens of thousands of tiles
    def storage = ActiveStorage::Blob.service

    def stored?(z, x, y) = storage.exist?(key(z, x, y))

    def read(z, x, y) = storage.download(key(z, x, y))

    def fetch_and_store(z, x, y)
      storage.upload(key(z, x, y), StringIO.new(fetch(z, x, y)))
    end

    def fetch(z, x, y) = fetch_planetary(z, x, y) || fetch_usgs(z, x, y)

    # nil where the mosaic has no imagery; any other failure raises so the job retries
    def fetch_planetary(z, x, y)
      uri = URI("#{PLANETARY_URL}/mosaic/#{mosaic_id}/tiles/WebMercatorQuad/#{z}/#{x}/#{y}@1x")
      uri.query = URI.encode_www_form(collection: "naip", assets: "image", asset_bidx: "image|1,2,3", format: "jpg")
      response = http_get(uri)
      return if response.is_a?(Net::HTTPNotFound) || response.is_a?(Net::HTTPNoContent)
      raise "NAIP tile #{z}/#{x}/#{y}: Planetary Computer HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
      response.body
    end

    def fetch_usgs(z, x, y)
      uri = URI(EXPORT_URL)
      uri.query = URI.encode_www_form(
        bbox: mercator_bbox(z, x, y).join(","), bboxSR: 3857, imageSR: 3857,
        size: "256,256", format: "jpg", f: "image"
      )
      response = http_get(uri)
      # The server answers errors with a 200 and a JSON body
      unless response.is_a?(Net::HTTPSuccess) && response.content_type == "image/jpeg"
        raise "NAIP tile #{z}/#{x}/#{y}: HTTP #{response.code} #{response.content_type}"
      end
      response.body
    end

    # Render threads share one registration
    def mosaic_id
      MOSAIC_LOCK.synchronize do
        @mosaic_id ||= begin
          uri = URI("#{PLANETARY_URL}/mosaic/register")
          response = Net::HTTP.post(uri, MOSAIC_SEARCH.to_json, "Content-Type" => "application/json")
          raise "Planetary Computer mosaic: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
          JSON.parse(response.body).fetch("id")
        end
      end
    end

    private

    def http_get(uri)
      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 60) { |http| http.get(uri.request_uri) }
    end
  end

  MOSAIC_LOCK = Mutex.new
end
