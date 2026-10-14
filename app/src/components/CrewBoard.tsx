import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getCrewLeaderboard, type CrewRankRow } from '@/lib/crew';
import { fmtPts } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const MEDAL: Record<number, string> = { 1: '#FFC93C', 2: '#C9D1E3', 3: '#E39A5B' };

/**
 * Ekip Sıralaması: bu ay ekipçe oynanan puanlı oyunlardan ekiplerin topladığı puan. Kişisel sıralamayı ve hediyeyi
 * etkilemez. Ekibin yoksa "Ekibim" ekranına gider.
 */
export function CrewBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<CrewRankRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getCrewLeaderboard(0).then((r) => {
        if (!alive) return;
        setError(r.error);
        setRows(r.data);
      });
      return () => {
        alive = false;
      };
      // refreshKey: yukarıdan "yenile" gelince tekrar okunur
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]),
  );

  const mine = rows?.find((r) => r.is_mine) ?? null;
  return (
    <View style={styles.wrap}>
      <View style={styles.info}>
        <Ionicons name="people" size={18} color={colors.success} />
        <Text style={styles.infoText}>
          Yalnızca ekipçe oynanan puanlı oyunlar sayılır (aynı oyunda ekipten en az 2 kişi). Yeni üyenin katkısı 3 gün
          sonra başlar.
        </Text>
      </View>
      {rows === null ? (
        <Text style={styles.muted}>{error ?? 'Ekip sıralaması yükleniyor…'}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Bu ay henüz ekip puanı yok. Arkadaşlarınla ekip kur ve birlikte oyna.</Text>
      ) : (
        rows.map((r) => (
          <View key={`${r.place}-${r.crew_name}`} style={[styles.row, r.is_mine && styles.rowMine]}>
            <View style={[styles.place, MEDAL[r.place] ? { backgroundColor: MEDAL[r.place] } : null]}>
              <Text style={[styles.placeText, MEDAL[r.place] ? styles.placeTextMedal : null]}>{r.place}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {r.crew_name}
                {r.is_mine ? <Text style={styles.mineTag}> · ekibin</Text> : null}
              </Text>
              <Text style={styles.sub}>{`${r.members} kişi`}</Text>
            </View>
            <Text style={styles.points}>{fmtPts(r.points)}</Text>
          </View>
        ))
      )}
      {rows !== null && !mine ? (
        <PrimaryButton label="Ekibim" variant="ghost" onPress={() => router.push('/ekip')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  flex: { flex: 1 },
  info: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  rowMine: { borderWidth: 1.5, borderColor: colors.success },
  place: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  placeText: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  placeTextMedal: { color: 'rgba(0,0,0,0.6)' },
  name: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  mineTag: { color: colors.success, fontFamily: fonts.extra, fontSize: 12 },
  sub: { color: colors.textMuted, fontSize: 12 },
  points: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.lg },
});
