import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Meter } from '@/components/Panel';
import { fmtPts } from '@/lib/labels';
import { onlineLeaderboard, soloLeaderboard, type OnlineRankRow, type SoloRankRow } from '@/lib/quiz';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const OFFSET = 3 * 3600 * 1000; // Türkiye saati (UTC+3)

/** Haftanın (Pazartesi 00:00) ve ayın başlangıç/bitişi, Türkiye saatine göre (ms) */
function periods(now: number) {
  const t = new Date(now + OFFSET);
  const dow = (t.getUTCDay() + 6) % 7; // Pazartesi = 0
  const weekStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow) - OFFSET;
  const weekEnd = weekStart + 7 * 86400000;
  const monthStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - OFFSET;
  const monthEnd = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - OFFSET;
  return { weekStart, weekEnd, monthStart, monthEnd };
}

function left(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${mins % 60} dk`;
  return `${mins} dk`;
}

/**
 * Bilgi Yarışması sıralamaları (yalnızca rumuzla): Solo / Hafta ve Çoklu / Ay, ödülleriyle birlikte. İki sıralama
 * birbirinden ayrıdır; en üstte ikisinin sıfırlanmasına kalan süre, altında sistemin kısa açıklaması durur.
 * Sıralama ekranında Bilgi Yarışması seçilince gösterilir.
 */
export function QuizRankCard({ championLives = 10 }: { championLives?: number }) {
  const [tab, setTab] = useState<'solo' | 'online'>('solo');
  const [solo, setSolo] = useState<SoloRankRow[] | null>(null);
  const [online, setOnline] = useState<OnlineRankRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const per = periods(now);

  useEffect(() => {
    let alive = true;
    void soloLeaderboard().then((r) => {
      if (alive) setSolo(r.data);
    });
    void onlineLeaderboard(0).then((r) => {
      if (alive) setOnline(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.wrap}>
      {/* Sıfırlanma süreleri: iki sıralama ayrı ayrı (canlı tablolar; ara güncelleme beklenmez) */}
      <View style={styles.card} testID="quiz-rank-timers">
        <View style={styles.timer}>
          <View style={styles.timerHead}>
            <Ionicons name="trophy" size={14} color={colors.primary} />
            <Text style={styles.timerLabel}>Solo / Hafta sıfırlanmasına</Text>
            <Text style={[styles.timerValue, { color: colors.primary }]}>{left(per.weekEnd - now)}</Text>
          </View>
          <Meter value={(now - per.weekStart) / (per.weekEnd - per.weekStart)} />
        </View>
        <View style={styles.timer}>
          <View style={styles.timerHead}>
            <Ionicons name="globe" size={14} color={colors.accent} />
            <Text style={styles.timerLabel}>Çoklu / Ay sıfırlanmasına</Text>
            <Text style={[styles.timerValue, { color: colors.accent }]}>{left(per.monthEnd - now)}</Text>
          </View>
          <Meter value={(now - per.monthStart) / (per.monthEnd - per.monthStart)} color={colors.accent} />
        </View>
        <Text style={styles.live}>İki tablo da canlıdır; her oyundan sonra hemen güncellenir.</Text>
      </View>

      {/* Sistem: iki ayrı sıralama */}
      <View style={styles.card} testID="quiz-rank-how">
        <Text style={styles.title}>Bilgi Yarışması sıralaması nasıl çalışır?</Text>
        <View style={styles.howRow}>
          <Ionicons name="trophy" size={16} color={colors.primary} />
          <Text style={styles.howText}>
            <Text style={styles.howLead}>Solo / Hafta: </Text>
            Solo Maraton’da bu hafta bilinen bütün doğrular toplanır (yalnızca en az 5 doğrulu koşular sayılır). Her
            Pazartesi 00:00’da sıfırlanır. İlk 3, sonraki hafta daha çok can taşır.
          </Text>
        </View>
        <View style={styles.howRow}>
          <Ionicons name="globe" size={16} color={colors.accent} />
          <Text style={styles.howText}>
            <Text style={styles.howLead}>Çoklu / Ay: </Text>
            Uzaktan (2–5 kişi) maçlarda ay boyunca kazanılan puanlar toplanır; eşitlikte galibiyet sayısı öne geçer. Her
            ayın 1’inde sıfırlanır. İlk 3’e 1 aylık abonelik verilir.
          </Text>
        </View>
        <Text style={styles.live}>
          İki sıralama birbirinden bağımsızdır; biri diğerini etkilemez. Yan Yana puan getirmez.
        </Text>
      </View>

      <View style={styles.card} testID="quiz-rank">
        <View style={styles.head}>
          <Ionicons name="help-circle" size={18} color={colors.primary} />
          <Text style={styles.title}>Bilgi Yarışması sıralamaları</Text>
        </View>
        <View style={styles.tabs}>
          {(
            [
              { v: 'solo', label: 'Solo / Hafta', icon: 'trophy' },
              { v: 'online', label: 'Çoklu / Ay', icon: 'globe' },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.v}
              onPress={() => setTab(t.v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.v }}
              style={[styles.tab, tab === t.v && styles.tabOn]}
            >
              <Ionicons name={t.icon} size={15} color={tab === t.v ? '#1A1200' : colors.text} />
              <Text style={[styles.tabText, tab === t.v && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        {/* Ödül */}
        <View style={styles.prize}>
          <Ionicons name="gift" size={16} color={colors.primary} />
          <Text style={styles.prizeText}>
            {tab === 'solo'
              ? `Ödül: haftanın ilk 3'üne sonraki hafta en çok ${championLives} can`
              : 'Ödül: ayın ilk 3’üne 1 aylık abonelik (moderatör onayıyla)'}
          </Text>
        </View>
        {tab === 'solo' ? (
          solo === null ? (
            <Text style={styles.muted}>Yükleniyor…</Text>
          ) : solo.length === 0 ? (
            <Text style={styles.muted}>Bu hafta henüz kimse koşmadı.</Text>
          ) : (
            solo.slice(0, 10).map((r) => (
              <View key={`${r.place}-${r.alias}`} style={[styles.row, r.is_me && styles.rowMe]}>
                <Medal place={r.place} />
                <Avatar index={r.avatar} size={28} />
                <Text style={styles.alias} numberOfLines={1}>
                  {r.is_me ? `${r.alias} (sen)` : r.alias}
                </Text>
                <Text style={styles.score}>{`${r.correct} doğru`}</Text>
              </View>
            ))
          )
        ) : online === null ? (
          <Text style={styles.muted}>Yükleniyor…</Text>
        ) : online.length === 0 ? (
          <Text style={styles.muted}>Bu ay henüz kimse Çoklu (Uzaktan) puanı kazanmadı.</Text>
        ) : (
          online.slice(0, 10).map((r) => (
            <View key={`${r.place}-${r.alias}`} style={[styles.row, r.is_me && styles.rowMe]}>
              <Medal place={r.place} />
              <Avatar index={r.avatar} size={28} />
              <Text style={styles.alias} numberOfLines={1}>
                {r.is_me ? `${r.alias} (sen)` : r.alias}
              </Text>
              <Text style={styles.score}>{`${fmtPts(r.points)} p · ${r.wins} G`}</Text>
            </View>
          ))
        )}
        <Text style={styles.note}>
          {tab === 'solo'
            ? 'Haftanın bütün doğruları toplanır (yalnızca en az 5 doğrulu koşular). Her pazartesi sıfırlanır.'
            : 'Uzaktan maçlardan ay boyunca kazanılan puana göre; eşitlikte galibiyet sayısı öne geçer.'}
        </Text>
      </View>
    </View>
  );
}

function Medal({ place }: { place: number }) {
  if (place > 3) return <Text style={styles.place}>{place}</Text>;
  const c = place === 1 ? '#FFC83D' : place === 2 ? '#C9D1E0' : '#E0915B';
  return (
    <View style={[styles.medal, { backgroundColor: c }]}>
      <Text style={styles.medalText}>{place}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  timer: { gap: 4 },
  timerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerLabel: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: 13 },
  timerValue: { fontFamily: fonts.black, fontSize: 13 },
  live: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  howRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  howText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  howLead: { color: colors.text, fontFamily: fonts.extra },
  card: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  tabTextOn: { color: '#1A1200' },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 176, 32, 0.12)',
  },
  prizeText: { flex: 1, color: colors.text, fontSize: 13, fontFamily: fonts.semi },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
  },
  rowMe: { backgroundColor: 'rgba(124, 92, 255, 0.18)' },
  place: { width: 24, textAlign: 'center', color: colors.textMuted, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  medal: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 12 },
  alias: { flex: 1, color: colors.text, fontSize: fontSizes.md },
  score: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: 6 },
  note: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 16 },
});
