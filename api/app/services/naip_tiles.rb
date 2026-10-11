require "net/http"

# Zoom 17-18 aerial tiles cut from USGS NAIP imagery (public domain, 0.3-0.6 m).
# The USGS basemap cache stops at 16, and the ImageServer takes ~10 s a tile,
# so tiles are rendered ahead of time and served from our own storage.
class NaipTiles
  ZOOMS = (17..18)
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

    def fetch(z, x, y)
      uri = URI(EXPORT_URL)
      uri.query = URI.encode_www_form(
        bbox: mercator_bbox(z, x, y).join(","), bboxSR: 3857, imageSR: 3857,
        size: "256,256", format: "jpg", f: "image"
      )
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 60) { |http| http.get(uri.request_uri) }
      # The server answers errors with a 200 and a JSON body
      unless response.is_a?(Net::HTTPSuccess) && response.content_type == "image/jpeg"
        raise "NAIP tile #{z}/#{x}/#{y}: HTTP #{response.code} #{response.content_type}"
      end
      response.body
    end
  end
end
