import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';

import { PrimaryButton } from '@/components/PrimaryButton';
import { CloseX } from '@/components/CloseX';
import { cellName } from '@/lib/cellNames';
import { isLand, type Cell } from '@/lib/hex';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const SQ3 = Math.sqrt(3);
const RING: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** Petek adını altıgenin içine sığacak 2 satıra böler. */
function lines(name: string): string[] {
  const words = name.split(' ');
  if (words.length <= 1) return [name];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/**
 * Yakınımdaki petekler için mini petek haritası: bulunduğum petek ortada (sarı, “Buradasın”), çevresindeki 6 petek
 * adlarıyla. Bir peteğe dokununca o peteğin akışı açılır. Denizdeki/Kocaeli dışındaki petekler soluk ve seçilemez.
 */
export function MiniHexPicker({
  visible,
  my,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  my: Cell | null;
  selected: Cell | null;
  onPick: (cell: Cell | null) => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - spacing.lg * 4, 340);
  const R = w / (3 * SQ3);
  const h = 5 * R + 8;
  const cx = w / 2;
  const cy = h / 2;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={styles.card} testID="mini-hex-picker">
          <View style={styles.head}>
            <Ionicons name="grid" size={18} color={colors.primary} />
            <Text style={styles.title}>Hangi peteğin akışı?</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={16} />
            </Pressable>
          </View>
          <Text style={styles.sub}>Bulunduğun petek ve yanındaki petekler. Birine dokun.</Text>
          {my ? (
            <Svg width={w} height={h}>
              {RING.map(([dq, dr]) => {
                const c = { q: my.q + dq, r: my.r + dr };
                const land = isLand(c.q, c.r);
                const here = dq === 0 && dr === 0;
                const on = selected !== null && selected.q === c.q && selected.r === c.r;
                const x = cx + R * SQ3 * (dq + dr / 2);
                const y = cy - R * 1.5 * dr;
                const r = R * 0.94;
                const dx = (r * SQ3) / 2;
                const pts = `${x},${y - r} ${x + dx},${y - r / 2} ${x + dx},${y + r / 2} ${x},${y + r} ${x - dx},${y + r / 2} ${x - dx},${y - r / 2}`;
                const name = land ? cellName(c) : 'Deniz';
                const ls = lines(name);
                return (
                  <G key={`${dq},${dr}`} onPress={land ? () => onPick(c) : undefined}>
                    <Polygon
                      points={pts}
                      fill={here ? 'rgba(255, 200, 61, 0.35)' : land ? '#1B2440' : '#0E1424'}
                      stroke={on ? colors.primary : here ? '#FFC83D' : land ? '#3A4870' : '#1B2440'}
                      strokeWidth={on || here ? 3 : 1.5}
                    />
                    {here ? (
                      <SvgText x={x} y={y - r * 0.42} fontSize={10} fontFamily={fonts.black} fill="#FFC83D" textAnchor="middle">
                        BURADASIN
                      </SvgText>
                    ) : null}
                    {ls.map((t, i) => (
                      <SvgText
                        key={i}
                        x={x}
                        y={y + (i - (ls.length - 1) / 2) * 12 + 4}
                        fontSize={10.5}
                        fontFamily={fonts.semi}
                        fill={land ? colors.text : colors.textMuted}
                        textAnchor="middle"
                      >
                        {t}
                      </SvgText>
                    ))}
                  </G>
                );
              })}
            </Svg>
          ) : (
            <Text style={styles.sub}>Konumun alınamadı.</Text>
          )}
          <View style={styles.stretch}>
            <PrimaryButton label="Hepsinin akışını göster" variant="ghost" onPress={() => onPick(null)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.78)' },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  sub: { color: colors.textMuted, fontSize: fontSizes.xs, alignSelf: 'stretch' },
  stretch: { alignSelf: 'stretch' },
});
