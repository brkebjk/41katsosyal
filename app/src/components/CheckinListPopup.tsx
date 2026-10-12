import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { cellName } from '@/lib/cellNames';
import { categoryInfo } from '@/lib/eventCategories';
import type { EventItem } from '@/lib/events';
import { formatWhen } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Kod girişi başlangıçtan bu kadar dakika önce açılır (sunucu ayarıyla aynı) */
const OPEN_BEFORE_MIN = 5;
/** Kod girişinin kapanışı: Konser & Festival başlangıçtan 45 dk, diğerleri 3 saat sonra */
const closeAfterMin = (category: string) => (category === 'konser_festival' ? 45 : 180);

function span(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} gün ${h} sa ${m} dk`;
  if (h > 0) return `${h} sa ${two(m)} dk ${two(s)} sn`;
  return `${two(m)}:${two(s)}`;
}

const nowMs = () => Date.now();

type Props = {
  events: EventItem[];
  onEnterCode: (ev: EventItem) => void;
  onClose: () => void;
};

/**
 * “Katılım Doğrula”: ön kayıt yaptığın etkinlikler, en yakını üstte. Her birinde kod girişine kalan süre (canlı sayaç),
 * kod girişi açıksa “Kodu gir”, bölgesi varsa “Haritada gör”.
 */
export function CheckinListPopup({ events, onEnterCode, onClose }: Props) {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(t);
  }, []);

  const list = [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  return (
    <Popup
      title="Katılım Doğrula"
      subtitle={`Ön kayıt yaptığın etkinlikler. Kod girişi etkinlik başlamadan ${OPEN_BEFORE_MIN} dakika önce açılır; kodu etkinlik yerinde düzenleyenden alırsın.`}
      icon="key"
      onClose={onClose}
      testID="checkin-popup"
    >
      {list.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
          <Text style={styles.muted}>Henüz bir etkinliğe ön kayıt yapmadın. Listeden bir etkinlik seçip “Katıl”a bas.</Text>
        </View>
      ) : (
        list.map((ev) => {
          const starts = Date.parse(ev.starts_at);
          const opens = starts - OPEN_BEFORE_MIN * 60_000;
          const closes = starts + closeAfterMin(ev.category) * 60_000;
          const open = !ev.checked_in && (ev.checkin_open || (now >= opens && now < closes));
          const missed = !ev.checked_in && !open && now >= closes;
          const cat = categoryInfo(ev.category);
          return (
            <View
              key={ev.id}
              style={[styles.card, open && styles.cardOpen, ev.checked_in && styles.cardDone]}
              testID="checkin-row"
            >
              <View style={styles.head}>
                <View style={[styles.catDot, { backgroundColor: cat.fallback[0] }]} />
                <Text style={styles.title} numberOfLines={2}>
                  {ev.title}
                </Text>
              </View>
              <Text style={styles.meta} numberOfLines={2}>
                {`${formatWhen(new Date(starts))} · ${cat.title}${
                  ev.cell_q !== null && ev.cell_r !== null ? ` · ${cellName({ q: ev.cell_q, r: ev.cell_r })}` : ''
                }`}
              </Text>

              {ev.checked_in ? (
                <View style={styles.status}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                  <Text style={[styles.statusText, { color: colors.success }]}>Katılımın doğrulandı</Text>
                </View>
              ) : open ? (
                <View style={styles.status}>
                  <Ionicons name="key" size={16} color={colors.primary} />
                  <Text style={[styles.statusText, { color: colors.primary }]}>
                    {`Kod girişi açık · kapanmasına ${span(closes - now)}`}
                  </Text>
                </View>
              ) : missed ? (
                <View style={styles.status}>
                  <Ionicons name="close-circle" size={16} color={colors.danger} />
                  <Text style={[styles.statusText, { color: colors.danger }]}>Kod girişi süresi doldu</Text>
                </View>
              ) : (
                <View style={styles.timerBox}>
                  <Text style={styles.timerLabel}>Kod girişine kalan</Text>
                  <Text style={styles.timer} accessibilityLabel={`Kod girişine ${span(opens - now)} kaldı`}>
                    {span(opens - now)}
                  </Text>
                </View>
              )}

              <View style={styles.actions}>
                {open ? (
                  <Pressable
                    onPress={() => onEnterCode(ev)}
                    accessibilityRole="button"
                    testID="checkin-enter"
                    style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
                  >
                    <Ionicons name="key" size={15} color={colors.primaryText} />
                    <Text style={[styles.btnText, { color: colors.primaryText }]}>Kodu gir</Text>
                  </Pressable>
                ) : null}
                {ev.cell_q !== null && ev.cell_r !== null ? (
                  <Pressable
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: '/',
                        params: { q: String(ev.cell_q), r: String(ev.cell_r), t: String(nowMs()) },
                      });
                    }}
                    accessibilityRole="button"
                    testID="checkin-map"
                    style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                  >
                    <Ionicons name="map" size={15} color={colors.primary} />
                    <Text style={styles.btnText}>Haritada gör</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </Popup>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 19 },
  card: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOpen: { borderColor: colors.primary },
  cardDone: { borderColor: 'rgba(52, 211, 153, 0.5)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { flex: 1, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  timerBox: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(53, 214, 195, 0.10)',
  },
  timerLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  timer: { color: colors.event, fontFamily: fonts.black, fontSize: fontSizes.lg, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
});
