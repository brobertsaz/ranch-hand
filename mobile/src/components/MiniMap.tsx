import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import type { LngLat } from '../format';
import { colors, palette } from '../theme';

type Props = { mapStyle: string; lngLat: LngLat; color: string; square?: boolean };

// A small, still map of where something is. Uses the same style as the main map,
// so it draws from the offline pack when there's no signal.
export default function MiniMap({ mapStyle, lngLat, color, square = false }: Props) {
  return (
    <View style={styles.thumb} pointerEvents="none">
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
        attribution={false}
        logo={false}
        compass={false}
      >
        <Camera initialViewState={{ center: lngLat, zoom: 15 }} />
        <Marker lngLat={lngLat}>
          <View style={[styles.pin, { backgroundColor: color, borderRadius: square ? 4 : 8 }]} />
        </Marker>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 104, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  pin: { width: 16, height: 16, borderWidth: 2.5, borderColor: palette.white },
});
