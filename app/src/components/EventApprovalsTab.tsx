import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { NoteModal } from '@/components/NoteModal';
import { PhotoApprovals } from '@/components/PhotoApprovals';
import { PrimaryButton } from '@/components/PrimaryButton';
import { categoryInfo } from '@/lib/eventCategories';
import { eventImageUrl } from '@/lib/eventImage';
import { formatWhen, timeAgo } from '@/lib/labels';
import { listEventApprovals, reviewEvent, type EventApproval } from '@/lib/moderation';
import { refreshNotices } from '@/lib/notices';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };
type Rejecting = { row: EventApproval; target: 'event' | 'image' };

/** Moderatör: onay bekleyen Konser & Festival etkinlikleri ve etkinlik görselleri. */
export function EventApprovalsTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<EventApproval[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Rejecting | null>(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const res = await listEventApprovals();
    setError(res.error);
    if (!res.error) {
      setRows(res.data);
      // Sayaç profil resimlerini de içerdiği için sunucudan okunur
      void refreshNotices();
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function approve(row: EventApproval, target: 'event' | 'image') {
    if (lock.current) return;
    lock.current = true;
    setBusy(`${row.id}:${target}`);
    const res = await reviewEvent(row.id, target, true);
    setBusy(null);
    lock.current = false;
    if (res.error) {
      onNotice({ text: res.error, error: true });
    } else {
      onNotice({ text: target === 'event' ? 'Etkinlik yayına alındı.' : 'Görsel yayına alındı.', error: false });
      void refreshNotices();
    }
    void load();
  }

  async function reject(r: Rejecting, note: string): Promise<string | null> {
    const res = await reviewEvent(r.row.id, r.target, false, note);
    if (res.error) return res.error;
    setRejecting(null);
    onNotice({
      text: r.target === 'event' ? 'Etkinlik reddedildi ve kapatıldı.' : 'Görsel reddedildi.',
      error: false,
    });
    void refreshNotices();
    void load();
    return null;
  }

  return (
    <>
      <Text style={styles.muted}>
        Konser & Festival etkinlikleri, üyelerin yüklediği etkinlik görselleri ve doğrulanmış üyelerin profil resimleri, sen
        onaylayana kadar başka kimseye görünmez.
      </Text>
      <PhotoApprovals onNotice={onNotice} />
      {!loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Onay bekleyen etkinlik yok.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.id} style={styles.card} testID="approval-card">
            <View style={styles.head}>
              <Ionicons name={categoryInfo(r.category).icon} size={18} color={colors.accent} />
              <Text style={styles.title} numberOfLines={2}>
                {r.title}
              </Text>
              <Text style={styles.muted}>{timeAgo(r.created_at)}</Text>
            </View>
            <Text style={styles.meta}>
              {`${r.host_name} · ${categoryInfo(r.category).title} · ${formatWhen(new Date(r.starts_at))} · ${r.location}`}
            </Text>
            <Text style={styles.body} numberOfLines={6}>
              {r.description}
            </Text>
            {r.approval === 'pending' ? (
              <View style={styles.block}>
                <Text style={styles.label}>Etkinlik onayı</Text>
                <View style={styles.btns}>
                  <View style={styles.flex}>
                    <PrimaryButton
                      label="Etkinliği onayla"
                      loading={busy === `${r.id}:event`}
                      onPress={() => void approve(r, 'event')}
                    />
                  </View>
                  <View style={styles.flex}>
                    <PrimaryButton label="Reddet" variant="ghost" onPress={() => setRejecting({ row: r, target: 'event' })} />
                  </View>
                </View>
              </View>
            ) : null}
            {r.image_status === 'pending' && r.image_path ? (
              <View style={styles.block}>
                <Text style={styles.label}>Görsel onayı</Text>
                <Image source={{ uri: eventImageUrl(r.image_path) ?? undefined }} contentFit="cover" style={styles.image} />
                <View style={styles.btns}>
                  <View style={styles.flex}>
                    <PrimaryButton
                      label="Görseli onayla"
                      loading={busy === `${r.id}:image`}
                      onPress={() => void approve(r, 'image')}
                    />
                  </View>
                  <View style={styles.flex}>
                    <PrimaryButton label="Reddet" variant="ghost" onPress={() => setRejecting({ row: r, target: 'image' })} />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ))
      )}
      <NoteModal
        visible={rejecting !== null}
        title={rejecting?.target === 'image' ? 'Görseli reddet' : 'Etkinliği reddet'}
        message={
          rejecting
            ? rejecting.target === 'event'
              ? `“${rejecting.row.title}” kapanır; düzenleyenin aylık hakkından düşmez. Düzenleyen bildirim alır.`
              : 'Görsel kaldırılır; düzenleyen yenisini yükleyebilir.'
            : undefined
        }
        label="Açıklama (isteğe bağlı)"
        placeholder="Örn. Görsel uygunsuz içerik barındırıyor."
        confirmLabel="Reddet"
        onClose={() => setRejecting(null)}
        onSubmit={(note) => (rejecting ? reject(rejecting, note) : Promise.resolve(null))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  block: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md },
  btns: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
});
