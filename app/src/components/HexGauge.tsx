import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/AppText';
import { colors, fonts } from '@/theme';

type Props = {
  /** Kalan hak. `null` = sınırsız (moderatör) */
  remaining: number | null;
  /** Aylık toplam hak (doluluk oranı için). `null` ise dolu görünür */
  limit: number | null;
  onPress: () => void;
  /** Dokunulabilir olduğunu gösteren küçük “+” işareti (mekân kodu girişi için) */
  plus?: boolean;
  /** Renk: oyun hakkı sarı (varsayılan), etkinlik hakkı mor */
  tone?: 'yellow' | 'purple';
  /** Sesli okuyucu için hakkın adı (ör. “oyun”, “etkinlik”) */
  kind?: string;
  testID?: string;
};

/** Hakkı biten göstergenin çerçevesi: açık kırmızı */
const EMPTY_STROKE = '#F4A3A3';

const TONES = {
  yellow: { top: '#FFC94D', bottom: '#E88A00', stroke: colors.primary, plusBg: colors.primary, plusText: colors.primaryText },
  purple: { top: '#C3AEFF', bottom: '#7C5CFF', stroke: colors.accent, plusBg: colors.accent, plusText: '#FFFFFF' },
} as const;

const W = 60;
const H = 68;

/** Dikey (sivri uçlu) altıgenin köşe noktaları */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * Kalan oyun başlatma hakkı göstergesi: bal peteği. Petek, kalan hakka göre aşağıdan yukarı bal rengiyle dolar;
 * ortada kalan hak sayısı yazar. Hak bitince çerçeve kırmızıya döner. Dokununca açıklama penceresi açılır.
 */
export function HexGauge({
  remaining,
  limit,
  onPress,
  plus = false,
  tone = 'yellow',
  kind = 'oyun',
  testID = 'hex-gauge',
}: Props) {
  const t = TONES[tone];
  const unlimited = remaining === null;
  const ratio = unlimited ? 1 : limit && limit > 0 ? Math.min(1, Math.max(0, remaining / limit)) : 0;
  const empty = !unlimited && remaining <= 0;
  // Hak bitince çerçeve yumuşak, açık bir kırmızı olur (göz yormasın)
  const stroke = empty ? EMPTY_STROKE : t.stroke;
  const cx = W / 2;
  const cy = H / 2;
  const r = 30;
  const top = cy - r;
  const fillH = 2 * r * ratio;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        unlimited ? `${kind[0].toUpperCase()}${kind.slice(1)} hakkın sınırsız` : `Kalan ${kind} hakkın ${remaining}. Ayrıntı için dokun`
      }
      testID={testID}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Svg width={W} height={H}>
        <Defs>
          <ClipPath id={`hexclip-${tone}`}>
            <Polygon points={hexPoints(cx, cy, r - 2.5)} />
          </ClipPath>
          <LinearGradient id={`honey-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.top} />
            <Stop offset="1" stopColor={t.bottom} />
          </LinearGradient>
        </Defs>
        <Polygon points={hexPoints(cx, cy, r)} fill={colors.surface} />
        <Rect
          x={0}
          y={top + 2 * r - fillH}
          width={W}
          height={fillH}
          fill={`url(#honey-${tone})`}
          opacity={0.55}
          clipPath={`url(#hexclip-${tone})`}
        />
        <Polygon
          points={hexPoints(cx, cy, r - 1.5)}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.count, unlimited && styles.countInf, empty && styles.countEmpty]}>
          {unlimited ? '∞' : String(remaining)}
        </Text>
        <Text style={styles.label}>hak</Text>
      </View>
      {plus ? (
        <View style={[styles.plus, { backgroundColor: t.plusBg }]} pointerEvents="none">
          <Text style={[styles.plusText, { color: t.plusText }]}>+</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: W, height: H, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: colors.text, fontFamily: fonts.black, fontSize: 22, lineHeight: 24 },
  countInf: { fontSize: 26 },
  countEmpty: { color: colors.alert },
  label: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 9, lineHeight: 10, marginTop: -1 },
  plus: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { color: colors.primaryText, fontFamily: fonts.black, fontSize: 14, lineHeight: 16 },
});
