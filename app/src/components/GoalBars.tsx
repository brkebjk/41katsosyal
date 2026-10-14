import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { fmtPts } from '@/lib/labels';
import { fonts } from '@/theme';

export type GoalBar = {
  key: string;
  /** Satırın başındaki kısa ad (ör. "🏖️ Yan yana ×7") */
  label: string;
  earned: number;
  cap: number;
  color: string;
};

/**
 * Bu ayın puan hedefi: her satır bir ilerleme çubuğu (kazanılan / aylık hedef). Oyunların giriş ekranlarında koyu
 * zeminin üstünde durur. Hedefe ulaşan satır "tamam" yazar.
 */
export function GoalBars({ bars, title = '🎯 Bu ayın puan hedefi', note }: { bars: GoalBar[]; title?: string; note?: string }) {
  return (
    <View style={styles.card} testID="goal-bars">
      <Text style={styles.title}>{title}</Text>
      {bars.map((b) => {
        const ratio = b.cap > 0 ? Math.min(1, Math.max(0, b.earned / b.cap)) : 0;
        const done = b.cap > 0 && b.earned >= b.cap;
        return (
          <View
            key={b.key}
            style={styles.row}
            accessibilityLabel={`${b.label}: ${fmtPts(b.earned)} / ${fmtPts(b.cap)} puan${done ? ', hedef tamam' : ''}`}
          >
            <View style={styles.head}>
              <Text style={styles.label} numberOfLines={1}>
                {b.label}
              </Text>
              <Text style={[styles.count, done && { color: b.color }]}>
                {done ? `✓ ${fmtPts(b.cap)} tamam` : `${fmtPts(b.earned)} / ${fmtPts(b.cap)}`}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: b.color }]} />
            </View>
          </View>
        );
      })}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(11, 19, 43, 0.82)',
  },
  title: { color: '#FFC93C', fontFamily: fonts.extra, fontSize: 12.5 },
  row: { gap: 3 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { flex: 1, color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 12 },
  count: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.extra, fontSize: 12 },
  track: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  note: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.semi, fontSize: 10.5 },
});
