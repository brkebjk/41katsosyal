import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { DEFAULT_CONTEST, contestOn, getContest, type Contest } from '@/lib/contest';
import { monthTitle } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const PLACES = [
  { place: 2, color: '#C9D1E3', dark: '#5B6378', height: 120 },
  { place: 1, color: '#FFC93C', dark: '#8A5A00', height: 156 },
  { place: 3, color: '#E39A5B', dark: '#7A3E12', height: 100 },
] as const;

/**
 * Hediye metnini 1./2./3. olarak ayırmaya çalışır (ör. “1. Kulaklık, 2. Kahve kartı, 3. Sinema bileti”).
 * Ayrılamazsa metnin tamamı alttaki kutuda gösterilir.
 */
function splitPrizes(text: string): Record<number, string> | null {
  const out: Record<number, string> = {};
  const re = /(?:^|[\n;,])\s*([123])\s*(?:\.|:|\)|-|\.\s*:)\s*([^\n;,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    const v = m[2].trim().replace(/[.\s]+$/, '');
    if (v && !out[n]) out[n] = v;
  }
  return out[1] ? out : null;
}

/** Aylık ödül podyumu: bu dönemin hediyeleri ve yarışma kurallarına bağlantı. */
export default function PrizesScreen() {
  const [contest, setContest] = useState<Contest>(DEFAULT_CONTEST);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getContest().then((c) => {
        setContest(c);
        setLoaded(true);
      });
    }, []),
  );

  const on = contestOn(contest);
  const split = on ? splitPrizes(contest.prizes) : null;

  return (
    <Screen
      title="Ödüller"
      subtitle={`Aylık ödül podyumu · ${monthTitle(0)}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
      backLabel="Geri"
    >
      <LinearGradient colors={['#3A1F7A', '#141A2B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="trophy" size={34} color="#FFC93C" />
        <Text style={styles.heroTitle}>Ayın ilk 3’ü ödül kazanır</Text>
        <Text style={styles.heroSub}>
          Genel puan sıralamasında ay sonunda ilk 3’e giren üyeler aşağıdaki ödülleri alır. Katılım ücretsizdir.
        </Text>
      </LinearGradient>

      {!loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : !on ? (
        <View style={styles.card}>
          <Ionicons name="hourglass-outline" size={22} color={colors.textMuted} />
          <Text style={styles.cardText}>Bu ayın ödülleri henüz açıklanmadı. Puan toplamaya devam et; açıklanınca burada görünür.</Text>
        </View>
      ) : (
        <>
          <View style={styles.podium} accessibilityLabel="Ödül podyumu">
            {PLACES.map((p) => (
              <View key={p.place} style={styles.col}>
                <View style={[styles.medal, { backgroundColor: p.color }]}>
                  <Text style={styles.medalText}>{p.place}</Text>
                </View>
                <Text style={styles.prize} numberOfLines={3}>
                  {split?.[p.place] ?? (p.place === 1 ? 'Ödül' : '—')}
                </Text>
                <LinearGradient colors={[p.color, p.dark]} style={[styles.block, { height: p.height }]}>
                  <Ionicons name={p.place === 1 ? 'trophy' : 'medal'} size={p.place === 1 ? 30 : 24} color="rgba(0,0,0,0.35)" />
                  <Text style={styles.blockText}>{`${p.place}.`}</Text>
                </LinearGradient>
              </View>
            ))}
          </View>
          {!split ? (
            <View style={styles.card}>
              <Ionicons name="gift" size={22} color={colors.primary} />
              <Text style={styles.cardText}>{contest.prizes}</Text>
            </View>
          ) : null}
          <View style={styles.card}>
            <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
            <Text style={styles.cardText}>
              {`Dönem ay sonunda biter. Kazananlar en geç ${contest.awardDays} gün içinde duyurulur. Düzenleyen: ${contest.organizer}.`}
            </Text>
          </View>
        </>
      )}

      <Pressable
        onPress={() => router.push('/kurallar')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.rulesLink, pressed && styles.pressed]}
        testID="prizes-rules"
      >
        <Ionicons name="document-text-outline" size={20} color={colors.primary} />
        <Text style={styles.rulesText}>Yarışma kuralları</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  heroTitle: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  heroSub: { color: 'rgba(230,234,245,0.85)', fontSize: fontSizes.sm, lineHeight: 19, textAlign: 'center' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.md },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  medal: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.md },
  prize: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm, textAlign: 'center', minHeight: 36 },
  block: {
    alignSelf: 'stretch',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  blockText: { color: 'rgba(0,0,0,0.45)', fontFamily: fonts.black, fontSize: fontSizes.xl },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  rulesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  rulesText: { flex: 1, color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
});
