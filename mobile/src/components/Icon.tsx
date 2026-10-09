import Svg, { Circle, Path } from 'react-native-svg';

// Stroke icons from the Ranch Hand design canvas (24×24 grid)
const PATHS = {
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14M15 6v14'],
  rides: ['M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
  crew: ['M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6', 'M16 5a3 3 0 0 1 0 6M21 20c0-3-1.5-5-4-5.7'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  locate: ['M12 2v3M12 19v3M2 12h3M19 12h3'],
  chevronRight: ['M9 5l7 7-7 7'],
  back: ['M15 5l-7 7 7 7'],
  close: ['M6 6l12 12M18 6L6 18'],
  plus: ['M12 6v12M6 12h12'],
  // "All" in the map filter
  all: [],
  // Kind icons: a cow's head (sick animal), a round hay bale (feed), barbed wire on a post (fence)
  cow: [
    'M5 3.5c0 2.5 1.5 4 4 4.8', 'M19 3.5c0 2.5-1.5 4-4 4.8',
    'M8.2 9.6L3.5 9c.6 2 2.1 3.2 4.8 3.2', 'M15.8 9.6l4.7-.6c-.6 2-2.1 3.2-4.8 3.2',
    'M8 8.5h8l-.9 6.4c1.1.6 1.6 1.5 1.6 2.6a2.6 2.6 0 0 1-2.6 2.6H9.9a2.6 2.6 0 0 1-2.6-2.6c0-1.1.5-2 1.6-2.6z',
  ],
  feed: ['M8 5.5a4.5 6.5 0 1 0 0 13 4.5 6.5 0 1 0 0-13', 'M8 5.5h8a4.5 6.5 0 0 1 0 13H8', 'M8 12a1.2 1.6 0 1 1 1.2 1.6 2.4 3 0 0 1-2.4-3'],
  fence: [
    'M12 3v18', 'M2.5 8.5h19M2.5 14.5h19',
    'M5.5 7.5l2 2M7.5 7.5l-2 2M16.5 7.5l2 2M18.5 7.5l-2 2', 'M5.5 13.5l2 2M7.5 13.5l-2 2M16.5 13.5l2 2M18.5 13.5l-2 2',
  ],
  water: ['M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z'],
  gate: ['M4 4v16M20 4v16M4 8h16M4 16h16M4 16L20 8'],
  pin: ['M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z'],
  check: ['M5 12l5 5 9-10'],
  navigate: ['M3 11l18-8-8 18-2-8z'],
  cloudOff: ['M3 3l18 18', 'M7 18h10.5a3.5 3.5 0 0 0 1-6.85A6 6 0 0 0 8.2 8', 'M5.6 10.3A4 4 0 0 0 7 18'],
  download: ['M12 4v11M7 10l5 5 5-5M5 20h14'],
  refresh: ['M20 11a8 8 0 0 0-14.6-4.5L4 8', 'M4 3v5h5', 'M4 13a8 8 0 0 0 14.6 4.5L20 16', 'M20 21v-5h-5'],
} as const;

const CIRCLES: Partial<Record<IconName, [number, number, number][]>> = {
  rides: [[6, 18, 2], [18, 6, 2]],
  camera: [[12, 13, 3.5]],
  crew: [[9, 8, 3]],
  locate: [[12, 12, 4]],
  pin: [[12, 9, 2.5]],
  all: [[7.5, 7.5, 2.2], [16.5, 7.5, 2.2], [7.5, 16.5, 2.2], [16.5, 16.5, 2.2]],
  // Nostrils
  cow: [[10.6, 17.4, 0.5], [13.4, 17.4, 0.5]],
};

export type IconName = keyof typeof PATHS;

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export default function Icon({ name, size = 24, color, strokeWidth = 2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
      {CIRCLES[name]?.map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </Svg>
  );
}
