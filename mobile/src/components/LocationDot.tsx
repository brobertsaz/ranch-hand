import { Layer, UserLocation, useCurrentPosition } from '@maplibre/maplibre-react-native';

import { palette } from '../theme';

const DOT_RADIUS = 6;
const RING_RADIUS = 9;

// Where you are, like MapLibre's own dot, but its "how sure is GPS" circle is a thin outline with a faint fill.
// Indoors on Wi-Fi that circle can cover a whole neighborhood, and the library's solid blue hid the map under it.
export default function LocationDot() {
  const accuracy = useCurrentPosition()?.coords.accuracy;

  return (
    <UserLocation>
      {typeof accuracy === 'number' && (
        <Layer
          type="circle"
          id="location-accuracy"
          source="mlrn-user-location"
          paint={{
            'circle-color': palette.creek,
            'circle-opacity': 0.06,
            'circle-stroke-color': palette.creek,
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.55,
            'circle-pitch-alignment': 'map',
            // The library's own sizing: meters of accuracy become pixels that grow with zoom
            'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, RING_RADIUS, 22, RING_RADIUS + accuracy * 100],
          }}
        />
      )}
      <Layer type="circle" id="location-ring" source="mlrn-user-location" paint={{ 'circle-radius': RING_RADIUS, 'circle-color': palette.white, 'circle-pitch-alignment': 'map' }} />
      <Layer type="circle" id="location-dot" source="mlrn-user-location" paint={{ 'circle-radius': DOT_RADIUS, 'circle-color': palette.creek, 'circle-pitch-alignment': 'map' }} />
    </UserLocation>
  );
}
