import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { timeAgo } from '@/lib/labels';
import { adminListThreads, type ThreadSummary } from '@/lib/modThreads';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Moderatör: Moderatör yazışmaları. Cevap bekleyenler üstte ve vurgulu. Yeni yazışma, Üyeler sekmesinde üyeye
 * “Mesaj gönder” ile açılır. `reloadKey` değişince liste yenilenir (yazışma kapatılınca).
 */
export function ModMessagesTab({ onOpen, reloadKey }: { onOpen: (id: string) => void; reloadKey: number }) {
  const [rows, setRows] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminListThreads();
    setRows(res.data);
    setError(res.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load, reloadKey]);

  return (
    <>
      <Text style={styles.muted}>
        Üyeler seni yalnızca “Moderatör” olarak görür. Yeni yazışmayı Üyeler sekmesinde üyeye mesaj göndererek
        açarsın. “Görüşmeyi bitir” deyince yazışma tamamen silinir.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Açık yazışma yok.</Text>
      ) : (
        rows.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => onOpen(t.id)}
            accessibilityRole="button"
            testID="mod-thread-row"
            style={({ pressed }) => [styles.card, t.unread && styles.cardNew, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <Ionicons
                name={t.unread ? 'chatbubble-ellipses' : 'chatbubble-outline'}
                size={18}
                color={t.unread ? colors.primary : colors.textMuted}
              />
              <Text style={styles.title} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.time}>{timeAgo(t.last_at)}</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {`${t.member_name ?? ''}${t.member_alias ? ` · ${t.member_alias}` : ''} · ${t.message_count ?? 0} mesaj`}
            </Text>
            {t.last_body ? (
              <Text style={styles.body} numberOfLines={2}>
                {`${t.last_from_admin ? 'Sen: ' : ''}${t.last_body}`}
              </Text>
            ) : null}
            {t.unread ? <Text style={styles.badge}>Cevap bekliyor</Text> : null}
          </Pressable>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 16 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  card: {
    gap: 3,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNew: { borderColor: colors.primary },
  pressed: { opacity: 0.8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  time: { color: colors.textMuted, fontSize: 11 },
  meta: { color: colors.textMuted, fontSize: 12 },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  badge: { color: colors.primary, fontSize: 11, fontFamily: fonts.semi },
});
