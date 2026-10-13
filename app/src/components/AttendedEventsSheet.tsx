import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Sheet } from '@/components/Sheet';
import { notify } from '@/lib/dialog';
import { categoryInfo } from '@/lib/eventCategories';
import { listAttendedEvents, rateEvent, type AttendedEvent } from '@/lib/events';
import { formatWhen } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * “Katıldığım etkinlikler”: son 30 günde katıldığım etkinlikler. Kodla doğruladığım ve bitmiş etkinlikleri 7 gün içinde
 * 1–5 yıldızla puanlayabilirim (bir kez). Konum gerekmez.
 */
export function AttendedEventsSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<AttendedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listAttendedEvents();
    setRows(res.data);
    setError(res.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function rate(ev: AttendedEvent, stars: number) {
    if (busyId) return;
    setBusyId(ev.id);
    const res = await rateEvent(ev.id, stars);
    setBusyId(null);
    if (res.error) return void notify('Puanlanamadı', res.error, { icon: 'alert-circle' });
    setRows((prev) => (prev ? prev.map((x) => (x.id === ev.id ? { ...x, my_stars: stars, can_rate: false } : x)) : prev));
    void notify(
      'Teşekkürler!',
      res.points && res.points > 0
        ? `Puanın kaydedildi; +${res.points} puan kazandın.`
        : 'Puanın kaydedildi. (Bu ayki puanlama puanı sınırına ulaştın.)',
      { icon: 'star', tone: 'success' },
    );
  }

  return (
    <Sheet
      title="Katıldığım etkinlikler"
      subtitle="Kodla katılımını doğruladığın etkinlikleri, bittikten sonra 7 gün içinde puanlayabilirsin."
      onClose={onClose}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Son 30 günde katıldığın bir etkinlik yok.</Text>
      ) : (
        rows.map((ev) => (
          <View key={ev.id} style={styles.card} testID="attended-event">
            <Text style={styles.title} numberOfLines={2}>
              {ev.title}
            </Text>
            <Text style={styles.meta}>
              {`${formatWhen(new Date(ev.starts_at))} · ${categoryInfo(ev.category).title} · ${ev.host_name}`}
            </Text>
            <Text style={styles.status}>
              {!ev.checked_in
                ? 'Katılımın kodla doğrulanmadı; puanlayamazsın.'
                : !ev.ended
                  ? 'Etkinlik bitince puanlayabilirsin.'
                  : ev.my_stars !== null
                    ? `Puanın: ${'★'.repeat(ev.my_stars)}${'☆'.repeat(5 - ev.my_stars)}`
                    : ev.can_rate
                      ? 'Etkinliği puanla:'
                      : 'Puanlama süresi doldu.'}
            </Text>
            {ev.can_rate ? (
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => void rate(ev, n)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} yıldız`}
                    hitSlop={6}
                    style={({ pressed }) => [styles.star, pressed && styles.pressed]}
                  >
                    <Ionicons name="star" size={28} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {ev.rating_count > 0 && ev.avg_stars !== null ? (
              <Text style={styles.meta}>{`Ortalama ${ev.avg_stars.toFixed(1)} ★ · ${ev.rating_count} puanlama`}</Text>
            ) : null}
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs },
  status: { color: colors.text, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  stars: { flexDirection: 'row', gap: 6, marginTop: 2 },
  star: { padding: 2 },
  pressed: { opacity: 0.6 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
