import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { timeAgo } from '@/lib/labels';
import { refreshNotices } from '@/lib/notices';
import { listPhotoApprovals, profilePhotoUrl, reviewPhoto, type PhotoApproval } from '@/lib/profilePhoto';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/**
 * Moderatör > Onaylar: doğrulanmış üyelerin profil resimleri. Onaylanınca yalnızca gerçek adın göründüğü yerlerde
 * (arkadaşlara) görünür. Reddedilen resim yayınlanmaz; üye bildirim alır ve yenisini ekleyebilir.
 */
export function PhotoApprovals({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<PhotoApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const res = await listPhotoApprovals();
    if (!res.error) setRows(res.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function review(r: PhotoApproval, approve: boolean) {
    if (busy) return;
    setBusy(`${r.user_id}:${approve ? 'ok' : 'no'}`);
    const res = await reviewPhoto(r, approve);
    setBusy(null);
    if (res.error) onNotice({ text: res.error, error: true });
    else onNotice({ text: approve ? 'Profil resmi onaylandı.' : 'Profil resmi reddedildi.', error: false });
    void refreshNotices();
    void load();
  }

  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap} testID="photo-approvals">
      <Text style={styles.head}>{`Profil resimleri (${rows.length})`}</Text>
      {rows.map((r) => (
        <View key={`${r.user_id}:${r.photo_path}`} style={styles.card}>
          <Image source={{ uri: profilePhotoUrl(r.photo_path) ?? undefined }} contentFit="cover" style={styles.photo} />
          <View style={styles.side}>
            <Text style={styles.name} numberOfLines={2}>
              {r.full_name}
            </Text>
            <Text style={styles.muted}>{`Doğrulanmış hesap · ${timeAgo(r.updated_at)}`}</Text>
            <PrimaryButton
              label="Onayla"
              loading={busy === `${r.user_id}:ok`}
              disabled={busy !== null}
              onPress={() => void review(r, true)}
            />
            <PrimaryButton
              label="Reddet"
              variant="ghost"
              loading={busy === `${r.user_id}:no`}
              disabled={busy !== null}
              onPress={() => void review(r, false)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: 110, height: 110, borderRadius: 55 },
  side: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  muted: { color: colors.textMuted, fontSize: fontSizes.xs },
});
