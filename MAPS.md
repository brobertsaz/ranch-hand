# Sharper maps: self-hosted NAIP tiles per ranch

## Problem
The style uses the USGS cached imagery basemap, which stops at zoom 16 (~1.7 m/px at 43° N).
Past that MapLibre stretches zoom-16 tiles, so the field test looked blurry, with or without a download.
The cache is also old: at the test point it shows a bare field where current NAIP shows a built-out street.

## Why not a paid server
- Esri: "Systematically requesting ArcGIS tiles for offline use through other apps or services is prohibited."
- MapTiler: no bulk download or export outside the service without a custom contract.
- Mapbox and Google: offline only inside their own SDKs, or not at all.

Offline-first rules them out. NAIP is public domain and goes to 0.3–0.6 m/px. It's just slow to serve
(~10 s per tile from the USGS ImageServer), so we render it ahead of time.

## Design
1. **Map areas.** Pastures can sit miles apart, so a ranch has many areas, not one box:
   `map_areas` (ranch, name, west/south/east/north, status, rendered_at). Edges don't need to be exact.
   Each area gets a quarter-mile margin, and once the imagery is sharp the fences show where pastures end.
   Ways to add one, in build order:
   - **Sharpen this area**, next to the download button: queues what's on screen plus the margin.
   - Pin plus radius (½, 1 or 2 miles) at sign-up.
   - Later, automatically from where rides, waypoints and sightings cluster, to catch pastures nobody marked.
   For the test, one area is created by hand.
2. **Render job.** `RenderMapAreaJob` walks every zoom 17–18 tile in an area and fetches it from
   `USGSNAIPImagery/ImageServer/exportImage` with the tile's EPSG:3857 bbox, 256×256 JPEG.
   It writes the tiles to the Active Storage service under `naip/<z>/<x>/<y>.jpg`. These are plain keys,
   not blobs, because a big ranch is 45k tiles. All ranches share one tile tree, so overlap
   is fetched once. It runs 8 requests at a time, retries, and skips tiles that already exist,
   so a rerun resumes.
3. **Tile route.** `GET /api/v1/map/tiles/:z/:x/:y.jpg` is public (the imagery is public domain) and cached for a year.
4. **Style.** `map/style` reads the app's token when it's sent and adds that ranch's areas.
   Old apps send no token and get today's plain style. Each rendered area gets its own `naip` raster source with
   `bounds` set to that area and `minzoom 17` / `maxzoom 18`, drawn above the USGS layer.
   `bounds` keeps MapLibre from asking for tiles between pastures. Outside the areas, the map behaves
   as it does today. Topo stays at 16.
5. **App.** This part needs an app build:
   - send the device token on MapLibre's requests to our API (`TransformRequestManager`)
   - add the Sharpen button
   - offer one offline download per area, so the empty miles between pastures aren't fetched
   - raise `PACK_MAX_ZOOM` to 18
   - have `estimateTiles` count each source's own zoom range
   - call `OfflineManager.setTileCountLimit` to raise the 6,000 default

## Test: Bob's place
One map area: center 43.003191, -89.457259, 1 mile radius (~2,560 acres).
Bounds: -89.47703, 42.98873, -89.43749, 43.01765.

| Zoom | Tiles |
|---|---|
| 10–16 | 101 (already served by USGS) |
| 17 | 225 |
| 18 | 870 |

That's 1,095 tiles to render, about 25 min with 8 requests at a time, and ~15 MB on the phone.

Acceptance:
1. With signal, zoom past 16 inside the area: individual houses, cars and fence lines are crisp.
2. Download the area, turn on airplane mode, force-quit, reopen: same detail at zoom 18.
3. Outside the area, the map looks like it does today (no gray holes, no errors).

## Tile source
Tiles now come from Microsoft Planetary Computer's NAIP mosaic (`/api/data/v1/mosaic`), about 0.1 s a tile against ~10 s from the
ImageServer (measured on Area 1, Oct 2026). Where the mosaic has no imagery (HTTP 204), `NaipTiles` falls back to the ImageServer.

## Later
- For huge ranches: zoom 18 only around headquarters and water, zoom 17 elsewhere.
- Rerender when a new NAIP year is flown for the ranch's state (every 3–5 years).
