import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Popup } from '@/components/Popup';
import { eventImageUrl } from '@/lib/eventImage';
import type { EventItem } from '@/lib/events';
import { eventCategoryImages } from '@/lib/images';
import { colors, fonts, radii, spacing } from '@/theme';

/** "2 gün 3 sa", "1 sa 20 dk", "15 dk"; başladıysa "Başladı" */
export function untilText(startMs: number, now: number): string {
  const mins = Math.floor((startMs - now) / 60000);
  if (mins <= 0) return 'Başladı';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `${d} gün ${h} sa` : h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

function Thumb({ ev, size }: { ev: EventItem; size: number }) {
  const uri = ev.image_path ? eventImageUrl(ev.image_path) : null;
  const src = uri ? { uri } : eventCategoryImages[ev.category];
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {src ? (
        <Image source={src} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <Ionicons name="calendar" size={size * 0.5} color={colors.event} />
      )}
    </View>
  );
}

/**
 * Etkinlikler başlığında hak göstergesinin solundaki küçük kart: katıldığın etkinliklerden başlamasına en az süre kalanın
 * küçük görünümü ve kalan süre. Birden çok etkinliğe katıldıysan sayısı yazar; dokununca hepsi listelenir.
 */
export function JoinedEventsChip({ events, onOpen }: { events: EventItem[]; onOpen: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const list = [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const first = list[0];
  if (!first) return null;
  const left = untilText(Date.parse(first.starts_at), now);

  return (
    <>
      <Pressable
        onPress={() => (list.length > 1 ? setOpen(true) : onOpen(first.id))}
        accessibilityRole="button"
        accessibilityLabel={`Katıldığın etkinlik: ${first.title}, ${left === 'Başladı' ? 'başladı' : `başlamasına ${left}`}`}
        testID="events-joined-chip"
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Thumb ev={first} size={34} />
        <View style={styles.chipText}>
          <Text style={styles.chipTitle} numberOfLines={1}>
            {first.title}
          </Text>
          <View style={styles.chipLeftRow}>
            <Ionicons name="hourglass-outline" size={11} color={colors.event} />
            <Text style={styles.chipLeft} numberOfLines={1}>
              {left}
            </Text>
          </View>
        </View>
        {list.length > 1 ? (
          <View style={styles.count} pointerEvents="none">
            <Text style={styles.countText}>{list.length}</Text>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <Popup
          title="Katıldığın etkinlikler"
          subtitle="Başlamasına en az süre kalan en üstte."
          icon="calendar"
          onClose={() => setOpen(false)}
          testID="events-joined-list"
        >
          {list.map((ev) => {
            const at = new Date(ev.starts_at);
            return (
              <Pressable
                key={ev.id}
                onPress={() => {
                  setOpen(false);
                  onOpen(ev.id);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID={`events-joined-${ev.id}`}
              >
                <Thumb ev={ev} size={44} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text style={styles.rowWhen} numberOfLines={1}>
                    {at.toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.rowLeft}>{untilText(at.getTime(), now)}</Text>
              </Pressable>
            );
          })}
        </Popup>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 128,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.event,
  },
  thumb: {
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { flex: 1, gap: 1 },
  chipTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: 11.5 },
  chipLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipLeft: { color: colors.event, fontFamily: fonts.semi, fontSize: 10.5 },
  count: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.event,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  countText: { color: '#04211F', fontFamily: fonts.black, fontSize: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: 14 },
  rowWhen: { color: colors.textMuted, fontSize: 12 },
  rowLeft: { color: colors.event, fontFamily: fonts.extra, fontSize: 12 },
});
