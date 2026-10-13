# Where a sharp area's zoom 17+ tiles come from. Some states publish imagery that is sharper or newer than
# the nationwide NAIP, so an area inside one of them renders from the state's own ArcGIS ImageServer.
# Everywhere else it's NAIP (see NaipTiles).
#
# A state's box is its bounding box, checked in order, so where two boxes overlap the first one wins:
# Wyoming comes before Montana because Montana's box dips below 45° only west of Wyoming.
class ImagerySource
  attr_reader :key, :name, :attribution, :url, :max_zoom, :box, :seconds_per_tile

  # seconds_per_tile: measured with the render job's 8 requests at a time, for the app's time estimate
  def initialize(key:, name:, attribution:, max_zoom:, seconds_per_tile:, url: nil, box: nil)
    @key, @name, @attribution, @url, @max_zoom, @box, @seconds_per_tile = key, name, attribution, url, max_zoom, box, seconds_per_tile
  end

  NAIP = new(key: "naip", name: "NAIP", attribution: "USDA NAIP", max_zoom: 18, seconds_per_tile: 0.11)

  STATES = [
    # 60 cm, two years newer than the NAIP copies elsewhere
    new(key: "wy-naip-2024", name: "Wyoming 2024", attribution: "USDA NAIP 2024 via WyGISC", max_zoom: 18, seconds_per_tile: 0.21,
        url: "https://services.wygisc.org/imagery1/rest/services/StateAerialImagery/NAIP_2024_WebMercator/ImageServer",
        box: { west: -111.06, south: 40.99, east: -104.05, north: 45.01 }),
    # 30 cm, twice as sharp as NAIP elsewhere
    new(key: "mt-naip-2025", name: "Montana 2025", attribution: "USDA NAIP 2025 via Montana State Library", max_zoom: 19, seconds_per_tile: 0.16,
        url: "https://gisservice.mt.gov/ArcGIS/rest/services/MSDI_Framework/msdi_naip2025_provisional_image_v1/ImageServer",
        box: { west: -116.05, south: 44.36, east: -104.04, north: 49.0 }),
    # 3-6 inch county flights (WROC 2020/2025), flown leaf-off in spring, so fields look brown
    new(key: "wi-dnr-leaf-off", name: "Wisconsin leaf-off", attribution: "WROC via Wisconsin DNR", max_zoom: 19, seconds_per_tile: 1.6,
        url: "https://dnrmaps.wi.gov/arcgis_image/rest/services/DW_Imagery/EN_Image_Basemap_Latest_Leaf_Off/ImageServer",
        box: { west: -92.89, south: 42.49, east: -86.25, north: 47.31 })
  ].freeze

  ALL = [ NAIP, *STATES ].index_by(&:key).freeze

  def self.find(key) = ALL.fetch(key)

  def self.for(lng:, lat:)
    STATES.find { |source| source.covers?(lng, lat) } || NAIP
  end

  def covers?(lng, lat) = box && lng.between?(box[:west], box[:east]) && lat.between?(box[:south], box[:north])

  def zooms = (NaipTiles::MIN_ZOOM..max_zoom)

  def naip? = self == NAIP
end
