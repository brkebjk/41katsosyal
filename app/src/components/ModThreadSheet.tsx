import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { confirmAction } from '@/lib/dialog';
import { timeAgo } from '@/lib/labels';
import { adminEndThread, getThread, replyThread, THREAD_MAX, type ModThread } from '@/lib/modThreads';
import { refreshNotices } from '@/lib/notices';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  threadId: string;
  onClose: () => void;
  /** Moderatör görüşmeyi bitirince (yazışma silindi) */
  onEnded?: () => void;
};

/**
 * Moderatör yazışması. Üye kendi yazışmasını görür ve cevap yazar; moderatör üyenin adını görür, cevap yazar ve
 * görüşmeyi bitirebilir (yazışma tamamen silinir). Açıkken 15 saniyede bir yenilenir.
 */
export function ModThreadSheet({ threadId, onClose, onEnded }: Props) {
  const [thread, setThread] = useState<ModThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getThread(threadId);
    setThread(res.data);
    setError(res.error);
  }, [threadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load().then(() => refreshNotices());
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const body = text.trim();
  const canSend = !!thread && body.length > 0 && body.length <= THREAD_MAX && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setSendError(null);
    const res = await replyThread(threadId, body);
    setBusy(false);
    if (res.error) return setSendError(res.error);
    setText('');
    await load();
  }

  async function end() {
    if (!thread || busy) return;
    const ok = await confirmAction(
      'Görüşmeyi bitir',
      'Yazışma iki taraftan da tamamen silinir ve üyeye “görüşme sonlandırıldı” bilgisi gider. Geri alınamaz.',
      'Bitir ve sil',
      true,
    );
    if (!ok) return;
    setBusy(true);
    const res = await adminEndThread(threadId);
    setBusy(false);
    if (res.error) return setSendError(res.error);
    void refreshNotices();
    onEnded?.();
    onClose();
  }

  const asAdmin = thread?.as_admin ?? false;
  const otherName = asAdmin ? (thread?.member_name ?? 'Üye') : 'Moderatör';

  return (
    <Sheet
      title={thread?.title ?? 'Moderatör'}
      subtitle={
        asAdmin
          ? `${thread?.member_name ?? ''}${thread?.member_alias ? ` · ${thread.member_alias}` : ''} ile yazışma. Üye seni yalnızca “Moderatör” olarak görür.`
          : 'Moderatör ile yazışma. Görüşme bitince yazışma silinir.'
      }
      onClose={onClose}
    >
      {error && !thread ? <Text style={styles.error}>{error}</Text> : null}
      {thread === null && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {thread
        ? thread.messages.map((m) => {
            const mine = asAdmin ? m.from_admin : !m.from_admin;
            return (
              <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID="thread-message">
                <Text style={styles.who}>{`${mine ? 'Sen' : otherName} · ${timeAgo(m.created_at)}`}</Text>
                <Text style={styles.body}>{m.body}</Text>
              </View>
            );
          })
        : null}

      {thread ? (
        <View style={styles.reply}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={asAdmin ? 'Üyeye cevap yaz' : 'Moderatöre cevap yaz'}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            multiline
            maxLength={THREAD_MAX}
            style={styles.input}
            accessibilityLabel="Cevap yaz"
            testID="thread-input"
          />
          <Pressable
            onPress={() => void send()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            testID="thread-send"
            style={({ pressed }) => [styles.send, !canSend && styles.off, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.primaryText} />
            )}
          </Pressable>
        </View>
      ) : null}
      {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
      {thread && !asAdmin ? (
        <Text style={styles.note}>Moderatör cevap vermeden üst üste en çok 3 mesaj yazabilirsin.</Text>
      ) : null}
      {thread && asAdmin ? (
        <PrimaryButton label="Görüşmeyi bitir ve sil" variant="danger" onPress={() => void end()} disabled={busy} />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', gap: 2, padding: spacing.sm, borderRadius: radii.md },
  mine: { alignSelf: 'flex-end', backgroundColor: 'rgba(124, 140, 255, 0.22)' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  who: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  reply: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  note: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
