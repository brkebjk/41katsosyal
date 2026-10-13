import type { ColorValue } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

const SQ3 = Math.sqrt(3);

/** Sivri tepeli altıgenin köşe noktaları */
function hex(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/**
 * Harita sekmesinin simgesi: küçük peteklerden oluşan bir küme (ortada bir, çevresinde altı petek).
 * Seçiliyken ortadaki petek dolu, çevresi yarı saydam dolu; değilken yalnızca çizgi.
 */
export function HexClusterIcon({ size, color, focused }: { size: number; color: ColorValue; focused: boolean }) {
  const r = size / 6.2;
  const w = r * SQ3;
  const c = size / 2;
  const cells = [
    [c, c],
    [c + w, c],
    [c - w, c],
    [c + w / 2, c - 1.5 * r],
    [c - w / 2, c - 1.5 * r],
    [c + w / 2, c + 1.5 * r],
    [c - w / 2, c + 1.5 * r],
  ];
  const inner = r * 0.86;
  return (
    <Svg width={size} height={size}>
      {cells.map(([x, y], i) => (
        <Polygon
          key={i}
          points={hex(x, y, inner)}
          fill={focused ? color : 'none'}
          fillOpacity={focused ? (i === 0 ? 1 : 0.45) : 0}
          stroke={color}
          strokeWidth={focused ? 1 : 1.4}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
