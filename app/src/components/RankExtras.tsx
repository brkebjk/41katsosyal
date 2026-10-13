import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Meter } from '@/components/Panel';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { getGameLeaderboard, getLastWeekLeaderboard, getLeaderboard, type RankingInfo } from '@/lib/ranking';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';
import { fmtPts } from '@/lib/labels';

function left(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${mins % 60} dk`;
  return `${mins} dk`;
}

function progress(from: string | null, to: string | null, now: number): number {
  if (!from || !to) return 0;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** Tablo güncellemesine ve aylık sıfırlamaya kalan süre: iki ayrı ilerleme çubuğu. */
export function RankTimers({ info, onFinal, onMore }: { info: RankingInfo | null; onFinal: () => void; onMore: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!info) return null;
  const weekly = info.weekly && info.nextAt;
  return (
    <View style={styles.card} testID="rank-timers">
      {weekly ? (
        <View style={styles.timer}>
          <View style={styles.timerHead}>
            <Ionicons name="refresh" size={14} color={colors.accent} />
            <Text style={styles.timerLabel}>Tablo güncellemesine</Text>
            <Text style={[styles.timerValue, { color: colors.accent }]}>{left(Date.parse(info.nextAt as string) - now)}</Text>
          </View>
          <Meter value={progress(info.asOf, info.nextAt, now)} color={colors.accent} />
        </View>
      ) : null}
      <View style={styles.timer}>
        <View style={styles.timerHead}>
          <Ionicons name="hourglass-outline" size={14} color={colors.primary} />
          <Text style={styles.timerLabel}>Aylık sıfırlamaya</Text>
          <Text style={[styles.timerValue, { color: colors.primary }]}>{left(Date.parse(info.monthEnd) - now)}</Text>
        </View>
        <Meter value={progress(info.monthStart, info.monthEnd, now)} />
      </View>
      <View style={styles.links}>
        <Pressable onPress={onFinal} hitSlop={8} accessibilityRole="button" testID="rank-final-open">
          <Text style={styles.link}>Kesinleşmiş sonuçlar ›</Text>
        </Pressable>
        <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button">
          <Text style={styles.linkMuted}>Nasıl çalışır?</Text>
        </Pressable>
      </View>
    </View>
  );
}

type FinalRow = { place: number; full_name: string; score: number; is_me: boolean };

/** Kesinleşmiş sonuçlar: geçen hafta ve geçen ay (genel puan ya da seçili oyun). */
export function FinalResultsSheet({ game, gameTitle, onClose }: { game: string | null; gameTitle?: string; onClose: () => void }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [rows, setRows] = useState<FinalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let res: { data: FinalRow[]; error: string | null };
      if (period === 'week') {
        res = await getLastWeekLeaderboard(game);
      } else if (game) {
        const g = await getGameLeaderboard(game, 'last');
        res = { data: g.data.map((r) => ({ place: r.place, full_name: r.full_name, score: r.score, is_me: r.is_me })), error: g.error };
      } else {
        const g = await getLeaderboard('last');
        res = { data: g.data.map((r) => ({ place: r.place, full_name: r.full_name, score: r.points, is_me: r.is_me })), error: g.error };
      }
      if (!active) return;
      setRows(res.data.slice(0, 10));
      setError(res.error);
    })();
    return () => {
      active = false;
    };
  }, [period, game]);

  return (
    <Sheet
      title="Kesinleşmiş sonuçlar"
      subtitle={game ? `${gameTitle ?? 'Oyun'} sıralaması · bu sonuçlar artık değişmez` : 'Genel puan · bu sonuçlar artık değişmez'}
      onClose={onClose}
    >
      <Segmented<'week' | 'month'>
        options={[
          { value: 'week', label: 'Geçen hafta' },
          { value: 'month', label: 'Geçen ay' },
        ]}
        value={period}
        onChange={(p) => {
          setRows(null);
          setPeriod(p);
        }}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Bu dönem için kayıt yok.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={`${r.place}-${r.full_name}-${i}`} style={[styles.row, r.is_me && styles.rowMe]}>
            <Text style={styles.place}>{r.place}.</Text>
            <Text style={styles.name} numberOfLines={1}>
              {r.full_name}
            </Text>
            <Text style={styles.score}>{`${fmtPts(r.score)} puan`}</Text>
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface },
  timer: { gap: 4 },
  timerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerLabel: { flex: 1, color: colors.textMuted, fontSize: 12 },
  timerValue: { fontFamily: fonts.extra, fontSize: 13 },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  link: { color: colors.primary, fontFamily: fonts.semi, fontSize: 13 },
  linkMuted: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 12 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowMe: { borderWidth: 1, borderColor: colors.primary },
  place: { width: 28, color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.sm },
  name: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
  score: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 12 },
});
