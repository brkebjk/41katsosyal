import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Meter } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import {
  achievementText,
  EMPTY_STATS,
  getPlayCounts,
  progressFor,
  totalEarned,
  TOTAL_ACHIEVEMENTS,
  type AchStats,
  type GameProgress,
} from '@/lib/achievements';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

export default function AchievementsScreen() {
  const [counts, setCounts] = useState<AchStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getPlayCounts();
    setError(res.error);
    if (!res.error) setCounts(res.data);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const progress = progressFor(counts);
  const earned = totalEarned(progress);

  return (
    <Screen
      title="Başarımlar"
      subtitle="Son basamakta ödül kazanırsın"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => void load()}
    >
      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text style={styles.big}>{earned}</Text>
          <Text style={styles.bigOf}>/ {TOTAL_ACHIEVEMENTS} başarım</Text>
        </View>
        <Meter value={earned / TOTAL_ACHIEVEMENTS} />
      </View>

      <Pressable
        onPress={() => router.push('/balonlar')}
        accessibilityRole="button"
        accessibilityLabel="Balonlarım sayfasına git"
        testID="achv-bubble-note"
        style={({ pressed }) => [styles.bubbleNote, pressed && styles.headPressed]}
      >
        <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
        <Text style={styles.bubbleNoteText}>
          <Text style={styles.bubbleNoteLead}>Ödül kazan. </Text>
          Bir oyunun son başarımını tamamlayınca ödülünü kazanırsın (balon rengi, Vampir’de puan çarpanı, Bilgi
          Yarışması’nda fazladan can, Hazine Avı’nda ömür boyu abonelik). Balon rengini Balonlarım sayfasından seçersin.
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
        </View>
      ) : !loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : (
        <View style={styles.list}>
          {progress.map((p) => (
            <GameCard
              key={p.game.game}
              p={p}
              open={open === p.game.game}
              onToggle={() => setOpen((cur) => (cur === p.game.game ? null : p.game.game))}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function GameCard({ p, open, onToggle }: { p: GameProgress; open: boolean; onToggle: () => void }) {
  const { game, earned, next, valueOf, rewarded } = p;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${game.title}, ${earned}/${game.items.length} başarım`}
        style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
      >
        <View style={[styles.gameIcon, earned > 0 && styles.gameIconOn]}>
          <Ionicons name={game.icon} size={20} color={earned > 0 ? colors.primaryText : colors.textMuted} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.gameTitle}>{game.title}</Text>
          <Text style={styles.gameSub} numberOfLines={1}>
            {next
              ? `${game.tasks ? 'Görev' : 'Sıradaki'}: ${next.name} · ${Math.min(valueOf(next), next.need)}/${next.need}`
              : 'Hepsini kazandın'}
          </Text>
          <View style={styles.segments}>
            {game.items.map((a) => (
              <View key={a.name} style={[styles.segment, valueOf(a) >= a.need && styles.segmentOn]} />
            ))}
          </View>
        </View>
        <Text style={styles.count}>
          {earned}/{game.items.length}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.items}>
          <View style={[styles.rewardBox, rewarded && styles.rewardBoxOn]} testID={`achv-reward-${game.game}`}>
            <Ionicons
              name={rewarded ? 'gift' : 'gift-outline'}
              size={18}
              color={rewarded ? colors.success : colors.primary}
            />
            <Text style={styles.bubbleHint}>
              {rewarded
                ? `Ödülü kazandın: ${game.reward?.text ?? 'bu oyunun balon rengi'}.`
                : `${game.tasks ? 'Beş görevin hepsini' : 'Son başarımı'} tamamlayınca ödül: ${game.reward?.text ?? 'bu oyunun balon rengi'}.`}
            </Text>
          </View>
          {game.items.map((a) => {
            const value = valueOf(a);
            const got = value >= a.need;
            return (
              <View key={a.name} style={styles.item}>
                <View style={[styles.medal, got && styles.medalOn]}>
                  <Ionicons
                    name={got ? 'ribbon' : 'lock-closed'}
                    size={got ? 17 : 14}
                    color={got ? colors.primaryText : colors.textMuted}
                  />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemName, !got && styles.itemLocked]}>{a.name}</Text>
                  <Text style={styles.itemDesc}>{achievementText(game, a)}</Text>
                </View>
                {got ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                ) : (
                  <Text style={styles.itemProgress}>
                    {Math.min(value, a.need).toLocaleString('tr-TR')}/{a.need.toLocaleString('tr-TR')}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.sm },
  summaryTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  big: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xxl },
  bigOf: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.md },
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  errorBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  errorText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  list: { gap: spacing.md },
  bubbleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  bubbleNoteText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  bubbleNoteLead: { color: colors.text, fontFamily: fonts.extra },
  rewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rewardBoxOn: { borderWidth: 1, borderColor: colors.success },
  bubbleHint: { flex: 1, color: colors.primary, fontSize: 13, lineHeight: 18, fontFamily: fonts.semi },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  headPressed: { backgroundColor: colors.surfaceAlt },
  gameIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameIconOn: { backgroundColor: colors.primary },
  headText: { flex: 1, gap: 3 },
  gameTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  gameSub: { color: colors.textMuted, fontSize: 12 },
  segments: { flexDirection: 'row', gap: 4, marginTop: 3 },
  segment: { flex: 1, height: 5, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt },
  segmentOn: { backgroundColor: colors.primary },
  count: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  items: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  medal: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalOn: { backgroundColor: colors.primary },
  itemText: { flex: 1, gap: 1 },
  itemName: { color: colors.text, fontSize: fontSizes.sm + 1, fontWeight: '700' },
  itemLocked: { color: colors.textMuted },
  itemDesc: { color: colors.textMuted, fontSize: 12 },
  itemProgress: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.xs },
});
