import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import type { PointsTableData } from '@/lib/gameInfo';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Puan kazanç tablosu (küçük pencerede gösterilir): hangi sıra kaç puan alır, ve oyuncu sayısı arttıkça
 * 1. sıranın puanı nasıl büyür. Hücreler yan yana dizilir, böylece tablo uzayıp ekranı kaplamaz.
 */
export function PointsTable({ data }: { data: PointsTableData }) {
  const { size, actual, minPlayers, rows, ladder } = data;
  const tooFew = actual !== null && actual < minPlayers;
  const caption =
    actual === null
      ? `${size} kişilik oyunda hangi sıra kaç puan alır (örnek):`
      : tooFew
        ? `Odada şu an ${actual} kişi var. Puan için en az ${minPlayers} kişi gerekir; ${minPlayers} kişilik oyunda:`
        : `Şu an ${actual} kişilik oyun, her sıranın puanı:`;
  return (
    <View style={styles.wrap} testID="points-table">
      <Text style={styles.caption}>{caption}</Text>
      <Text style={styles.legend}>Yan yana ve uzaktan oyunda puan aynıdır.</Text>
      <View style={styles.grid} accessibilityRole="list">
        {rows.map((r) => (
          <View
            key={r.place}
            style={styles.cell}
            accessibilityLabel={`${r.place}. sıra ${r.points} puan`}
          >
            <Text style={styles.place}>{r.place}. sıra</Text>
            <Text style={styles.points}>{r.points}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>Oyuncu sayısı arttıkça 1. sıranın puanı:</Text>
      <View style={styles.ladder}>
        {ladder.map((l) => (
          <View
            key={l.players}
            style={[styles.step, actual !== null && actual >= l.players && styles.stepOn]}
            accessibilityLabel={`${l.players}${l.plus ? ' ve üstü' : ''} kişi: ${l.first} puan`}
          >
            <Text style={styles.stepPlayers}>
              {l.players}
              {l.plus ? '+' : ''} kişi
            </Text>
            <Text style={styles.stepPoints}>{l.first}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '23.5%',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  place: { color: colors.textMuted, fontSize: 11 },
  points: { color: colors.highlight, fontFamily: fonts.black, fontSize: 16 },
  legend: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  ladder: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  step: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepOn: { borderColor: colors.primary, backgroundColor: 'rgba(34, 211, 197, 0.1)' },
  stepPlayers: { color: colors.textMuted, fontSize: 11 },
  stepPoints: { color: colors.highlight, fontFamily: fonts.extra, fontSize: 14 },
});
