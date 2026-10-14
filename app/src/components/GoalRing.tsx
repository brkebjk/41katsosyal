import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/AppText';
import { fonts } from '@/theme';

/**
 * Oyun kutusunun sağ üst köşesindeki yuvarlak hedef halkası: bu ay kazanıldıkça halka dolar, ortasında kazanılabilecek
 * kalan puan yazar. Hedef tamamlanınca halka yeşil dolar ve ortada ✓ görünür.
 */
export function GoalRing({ left, cap, size = 46 }: { left: number; cap: number; size?: number }) {
  const stroke = Math.max(3, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = cap > 0 && left <= 0;
  const ratio = cap > 0 ? Math.min(1, Math.max(0, (cap - left) / cap)) : 0;
  const text = done ? '✓' : left >= 10000 ? `${Math.round(left / 1000)}B` : String(Math.round(left));
  const font = text.length >= 4 ? size * 0.25 : text.length === 3 ? size * 0.29 : size * 0.34;
  return (
    <View
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel={done ? 'Bu ayın puan hedefi tamam' : `Bu ay kazanılabilecek kalan puan ${Math.round(left)}`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={done ? '#34D399' : '#FFC93C'}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.value, { fontSize: Math.round(font) }, done && styles.done]} numberOfLines={1}>
        {text}
      </Text>
      {!done ? <Text style={[styles.unit, { fontSize: Math.max(7, Math.round(size * 0.15)) }]}>puan</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 15, 26, 0.78)' },
  value: { color: '#FFFFFF', fontFamily: fonts.black, lineHeight: undefined, marginTop: -2 },
  unit: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.semi, marginTop: -3 },
  done: { color: '#34D399' },
});
