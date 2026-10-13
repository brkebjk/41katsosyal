import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { confirmAction } from '@/lib/dialog';
import { timeAgo } from '@/lib/labels';
import {
  createAnnouncement,
  listAnnouncements,
  setAnnouncementActive,
  type Announcement,
} from '@/lib/moderation';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/**
 * Moderatör paneli > Duyuru: herkese genel duyuru. Duyuru, üyelerin harita ekranındaki bildirim kutusuna
 * düşer ve 30 gün görünür. Yayından kaldırılan duyuru kutulardan da kalkar.
 */
export function AnnouncementsTab({ onNotice }: { onNotice: (n: Notice | null) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listAnnouncements();
    setRows(res.data);
    setError(res.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function publish() {
    if (busy) return;
    const t = title.trim();
    const b = body.trim();
    if (t.length < 3) return onNotice({ text: 'Başlık en az 3 karakter olmalı.', error: true });
    if (b.length < 1) return onNotice({ text: 'Duyuru metnini yaz.', error: true });
    const ok = await confirmAction(
      'Duyuru herkese gönderilsin mi?',
      `“${t}” bütün üyelerin bildirim kutusuna düşer.`,
      'Gönder',
    );
    if (!ok) return;
    setBusy(true);
    const res = await createAnnouncement(t, b);
    setBusy(false);
    if (res.error) return onNotice({ text: res.error, error: true });
    setTitle('');
    setBody('');
    onNotice({ text: 'Duyuru yayınlandı.', error: false });
    void load();
  }

  async function toggle(a: Announcement) {
    const res = await setAnnouncementActive(a.id, !a.is_active);
    if (res.error) return onNotice({ text: res.error, error: true });
    void load();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Yeni duyuru</Text>
        <Text style={styles.muted}>
          Herkesin harita ekranındaki bildirim kutusuna düşer, 30 gün görünür. Tek bir üyeye mesaj için Üyeler
          sekmesinden üyeyi seç.
        </Text>
        <TextField
          label="Başlık"
          icon="megaphone-outline"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          placeholder="Ör. Cumartesi oyun gecesi"
        />
        <TextField
          label="Metin"
          icon="create-outline"
          value={body}
          onChangeText={setBody}
          maxLength={1000}
          multiline
          style={styles.multi}
          placeholder="Duyurunun ayrıntıları"
        />
        <PrimaryButton label="Herkese gönder" onPress={() => void publish()} loading={busy} />
      </View>

      <Text style={styles.sectionTitle}>Son duyurular</Text>
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Henüz duyuru yok.</Text>
      ) : (
        rows.map((a) => (
          <View key={a.id} style={[styles.card, !a.is_active && styles.inactive]}>
            <Text style={styles.cardTitle}>{a.title}</Text>
            <Text style={styles.body}>{a.body}</Text>
            <Text style={styles.muted}>
              {`${timeAgo(a.created_at)} · ${a.read_count} kişi gördü · ${a.is_active ? 'Yayında' : 'Kaldırıldı'}`}
            </Text>
            <PrimaryButton
              label={a.is_active ? 'Yayından kaldır' : 'Yeniden yayınla'}
              variant="ghost"
              onPress={() => void toggle(a)}
            />
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface },
  inactive: { opacity: 0.6 },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  sectionTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, paddingHorizontal: spacing.xs },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  multi: { minHeight: 80, textAlignVertical: 'top' },
});
