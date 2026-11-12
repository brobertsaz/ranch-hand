# Clears a removed map area's tiles out of storage. Tiles are keyed by source and z/x/y alone, so areas that
# overlap (on this ranch or a neighbor's) share them; a tile any remaining area still covers is left in place.
#
# shortcut: an area added over the same ground at the very moment this runs can lose a tile it skipped as
# already stored, and a render that was still winding down can leave a few behind. Removing and re-adding the
# area fixes the first; the second only costs disk. Give tiles a per-area record if either starts to matter.
class RemoveMapAreaTilesJob < ApplicationJob
  # How many tiles go by before looking again at which areas exist
  CHECK_EVERY = 200

  def perform(source, bounds)
    tiles = NaipTiles.tiles_in(**bounds.symbolize_keys, zooms: ImagerySource.find(source).zooms)
    tiles.each_slice(CHECK_EVERY) do |slice|
      remaining = MapArea.where(source: source).to_a
      slice.each do |z, x, y|
        NaipTiles.delete(z, x, y, source) unless remaining.any? { |area| area.tile?(z, x, y) }
      end
    end
  end
end
