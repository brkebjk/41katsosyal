import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

/** Yan yana oyun simgesi: yan yana dört insan (baş + omuz) */
export function SideIcon({ size = 16, color = '#34D399' }: { size?: number; color?: string }) {
  // 32×20 çizim alanı; dört kişi: arkada iki (küçük), önde iki
  const w = size * 1.6;
  return (
    <Svg width={w} height={size} viewBox="0 0 32 20">
      {[
        { x: 8, y: 6.5, r: 2.6, o: 0.7 },
        { x: 24, y: 6.5, r: 2.6, o: 0.7 },
        { x: 12.5, y: 8, r: 3, o: 1 },
        { x: 19.5, y: 8, r: 3, o: 1 },
      ].map((h, i) => (
        <Path
          key={`b${i}`}
          d={`M ${h.x - h.r * 1.75} 20 Q ${h.x - h.r * 1.75} ${h.y + h.r * 1.3} ${h.x} ${h.y + h.r * 1.3} Q ${h.x + h.r * 1.75} ${h.y + h.r * 1.3} ${h.x + h.r * 1.75} 20 Z`}
          fill={color}
          opacity={h.o}
        />
      ))}
      {[
        { x: 8, y: 6.5, r: 2.6, o: 0.7 },
        { x: 24, y: 6.5, r: 2.6, o: 0.7 },
        { x: 12.5, y: 8, r: 3, o: 1 },
        { x: 19.5, y: 8, r: 3, o: 1 },
      ].map((h, i) => (
        <Circle key={`h${i}`} cx={h.x} cy={h.y} r={h.r} fill={color} opacity={h.o} />
      ))}
    </Svg>
  );
}

/** Uzaktan oyun simgesi: dünya ve etrafında dolanan yörünge çizgileri */
export function RemoteIcon({ size = 16, color = '#48CAE4' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={6.5} stroke={color} strokeWidth={1.6} fill="none" />
      <Ellipse cx={12} cy={12} rx={2.8} ry={6.5} stroke={color} strokeWidth={1.2} fill="none" />
      <Path d="M5.5 12 H18.5" stroke={color} strokeWidth={1.2} />
      <Ellipse
        cx={12}
        cy={12}
        rx={11}
        ry={3.6}
        stroke={color}
        strokeWidth={1.4}
        fill="none"
        strokeDasharray="5 2.5"
        transform="rotate(-28 12 12)"
      />
      <Circle cx={21.3} cy={7.2} r={1.4} fill={color} />
    </Svg>
  );
}
