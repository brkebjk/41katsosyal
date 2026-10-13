import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { ModThreadSheet } from '@/components/ModThreadSheet';
import { Sheet } from '@/components/Sheet';
import { timeAgo } from '@/lib/labels';
import { listMyThreads, type ThreadSummary } from '@/lib/modThreads';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Profil → Hesabım → Moderatör mesajlarım: açık yazışmalar; dokununca yazışma açılır. */
export function MyThreadsSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMyThreads();
    setRows(res.data);
    setError(res.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  if (openId) {
    return (
      <ModThreadSheet
        threadId={openId}
        onClose={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <Sheet
      title="Moderatör mesajlarım"
      subtitle="Moderatörün sana yazdığı mesajlar. Görüşme bitirilince yazışma silinir."
      onClose={onClose}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Açık bir yazışman yok.</Text>
      ) : (
        rows.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setOpenId(t.id)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, t.unread && styles.cardNew, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
              <Text style={styles.title} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.time}>{timeAgo(t.last_at)}</Text>
            </View>
            {t.last_body ? (
              <Text style={styles.body} numberOfLines={2}>
                {`${t.last_from_admin ? 'Moderatör: ' : 'Sen: '}${t.last_body}`}
              </Text>
            ) : null}
            {t.unread ? <Text style={styles.badge}>Yeni mesaj</Text> : null}
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  card: { gap: 3, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt },
  cardNew: { borderWidth: 1, borderColor: colors.primary },
  pressed: { opacity: 0.8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  time: { color: colors.textMuted, fontSize: 11 },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  badge: { color: colors.primary, fontSize: 11, fontFamily: fonts.semi },
});
