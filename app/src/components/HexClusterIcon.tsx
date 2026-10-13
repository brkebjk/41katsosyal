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

/**
 * Petek simgesi (üç petek): uygulamada "petek" anlatan her yerde kare ızgara simgesi yerine kullanılır.
 * `outline` verilirse yalnızca çizgi, verilmezse dolu.
 */
export function PetekIcon({ size, color, outline = false }: { size: number; color: ColorValue; outline?: boolean }) {
  const r = size / 3.5;
  const w = r * SQ3;
  const c = size / 2;
  const cells = [
    [c, c - 0.75 * r],
    [c - w / 2, c + 0.75 * r],
    [c + w / 2, c + 0.75 * r],
  ];
  return (
    <Svg width={size} height={size}>
      {cells.map(([x, y], i) => (
        <Polygon
          key={i}
          points={hex(x, y, r * 0.88)}
          fill={outline ? 'none' : color}
          stroke={color}
          strokeWidth={outline ? Math.max(1, size / 14) : 0}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** Ionicons "grid" adlı simge yerine petek simgesi kullanılsın mı? (petek anlatan yerler) */
export function isPetekIconName(name: string | undefined): boolean {
  return name === 'grid' || name === 'grid-outline';
}

/** Tek petek (renk açıklamasında peteğin rengini göstermek için) */
export function HexSwatch({ size, color, stroke }: { size: number; color: ColorValue; stroke?: ColorValue }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Polygon points={hex(c, c, size / 2 - 0.5)} fill={color} stroke={stroke ?? 'none'} strokeWidth={stroke ? 1 : 0} />
    </Svg>
  );
}
