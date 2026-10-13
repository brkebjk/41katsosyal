import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { confirmAction } from '@/lib/dialog';
import { categoryInfo } from '@/lib/eventCategories';
import { eventImageUrl, pickEventImage, uploadEventImage } from '@/lib/eventImage';
import { attendeeCount, type EventItem } from '@/lib/events';
import { formatWhen } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

async function confirmImage(): Promise<boolean> {
  return confirmAction(
    'Görsel bir kez eklenir',
    'Etkinlik görseli eklendikten sonra değiştirilemez ve kaldırılamaz. Moderatör onaylayınca herkese görünür; reddedilirse yenisini ekleyebilirsin.',
    'Görsel seç',
  );
}

/** “Etkinliklerim”: açtığım etkinlikler, onay durumları ve görsel ekleme. */
export function MyEventsSheet({
  userId,
  events,
  onClose,
  onChanged,
  onOpen,
}: {
  userId: string;
  events: EventItem[];
  onClose: () => void;
  onChanged: () => void;
  onOpen: (ev: EventItem) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function addImage(ev: EventItem) {
    if (busyId) return;
    const sure = await confirmImage();
    if (!sure) return;
    const pick = await pickEventImage();
    if (pick.error) return setMsg({ text: pick.error, error: true });
    if (!pick.image) return;
    setBusyId(ev.id);
    setMsg(null);
    const res = await uploadEventImage(userId, ev.id, pick.image);
    setBusyId(null);
    if (res.error) return setMsg({ text: res.error, error: true });
    setMsg({ text: 'Görsel yüklendi; moderatör onaylayınca herkese görünür.', error: false });
    onChanged();
  }

  return (
    <Sheet title="Etkinliklerim" subtitle="Açtığın yaklaşan etkinlikler. Sen de katılımcı sayılırsın (+1)." onClose={onClose}>
      {events.length === 0 ? (
        <Text style={styles.muted}>Yaklaşan bir etkinliğin yok. “Oluştur” ile yeni etkinlik açabilirsin.</Text>
      ) : (
        events.map((ev) => {
          const status =
            ev.approval === 'pending'
              ? 'Moderatör onayı bekliyor'
              : ev.image_status === 'pending'
                ? 'Görsel onay bekliyor'
                : ev.image_status === 'rejected'
                  ? 'Görsel onaylanmadı; yenisini yükleyebilirsin'
                  : null;
          return (
            <View key={ev.id} style={styles.card} testID="my-event">
              {ev.image_path ? (
                <Image source={{ uri: eventImageUrl(ev.image_path) ?? undefined }} contentFit="cover" style={styles.image} />
              ) : null}
              <Pressable onPress={() => onOpen(ev)} accessibilityRole="button" style={styles.head}>
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={2}>
                    {ev.title}
                  </Text>
                  <Text style={styles.meta}>
                    {`${formatWhen(new Date(ev.starts_at))} · ${categoryInfo(ev.category).title} · ${attendeeCount(ev)}/${ev.capacity} kişi`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              {status ? (
                <View style={styles.status}>
                  <Ionicons name="hourglass-outline" size={13} color={colors.primary} />
                  <Text style={styles.statusText}>{status}</Text>
                </View>
              ) : null}
              {!ev.image_path || ev.image_status === 'rejected' ? (
                <PrimaryButton
                  label="Görsel ekle (bir kez, sonra değiştirilemez)"
                  variant="ghost"
                  loading={busyId === ev.id}
                  onPress={() => void addImage(ev)}
                />
              ) : null}
            </View>
          );
        })
      )}
      {msg ? <Text style={msg.error ? styles.error : styles.ok}>{msg.text}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { color: colors.primary, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  btns: { flexDirection: 'row', gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  ok: { color: colors.success, fontSize: fontSizes.sm },
});
