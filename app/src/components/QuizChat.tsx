import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ChatMsg } from '@/lib/quiz';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const QUICK = ['👋 Selam!', '🔥 Hadi bakalım', '😅 Zormuş', '😮 Vay be!', '🤝 İyi oyundu'];

type Props = {
  chat: ChatMsg[];
  /** Yazma kapalıysa (susturulmuş, maç sohbeti kapandı) nedeni */
  disabledText?: string | null;
  onSend: (body: string) => Promise<string | null>;
  onReport: (msg: ChatMsg) => void;
  /** Pencere içinde: her zaman açık (başlık şeridi yok, yazma kutusu hep görünür) */
  alwaysOpen?: boolean;
  /** Hızlı cevap gönderilince (pencereyi kapatmak için) */
  onQuickSent?: () => void;
};

/**
 * Maç sohbeti: kapalıyken tek satırlık şerit (son mesaj + hızlı cevaplar), dokununca açılır.
 * Rakibin mesajına uzun basınca bildirme seçeneği çıkar. Yalnızca rumuzlar görünür.
 */
export function QuizChat({ chat, disabledText = null, onSend, onReport, alwaysOpen = false, onQuickSent }: Props) {
  const [openState, setOpen] = useState(false);
  const open = alwaysOpen || openState;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const last = chat[chat.length - 1] ?? null;
  const unread = open ? 0 : Math.max(0, chat.filter((m) => !m.mine).length - seen);

  useEffect(() => {
    if (open) scrollRef.current?.scrollToEnd({ animated: true });
  }, [open, chat.length]);

  async function send(body: string, quick = false) {
    const v = body.trim();
    if (!v || busy || disabledText) return;
    setBusy(true);
    setError(null);
    const err = await onSend(v);
    setBusy(false);
    if (err) return setError(err);
    if (quick) onQuickSent?.();
    else setText('');
  }

  function toggle() {
    if (!open) setSeen(chat.filter((m) => !m.mine).length);
    setOpen(!open);
  }

  return (
    <View
      style={[styles.wrap, open && !alwaysOpen && styles.wrapOpen, alwaysOpen && styles.wrapPlain]}
      testID="quiz-chat"
    >
      {alwaysOpen ? null : (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Sohbeti kapat' : 'Sohbeti aç'}
          style={styles.head}
        >
          <Ionicons name="chatbubbles" size={16} color={colors.accent} />
          <Text style={styles.headText} numberOfLines={1}>
            {last ? `${last.mine ? 'Sen' : last.alias}: ${last.body}` : 'Sohbet · rakiplerine selam ver'}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread}</Text>
            </View>
          ) : null}
          <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textMuted} />
        </Pressable>
      )}

      {open ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={alwaysOpen ? styles.listTall : styles.list}
            contentContainerStyle={styles.listContent}
          >
            {chat.length === 0 ? <Text style={styles.empty}>Henüz mesaj yok.</Text> : null}
            {chat.map((m) => (
              <Pressable
                key={m.id}
                onLongPress={m.mine ? undefined : () => onReport(m)}
                delayLongPress={400}
                accessibilityHint={m.mine ? undefined : 'Bildirmek için uzun bas'}
                style={[styles.msg, m.mine ? styles.msgMine : styles.msgTheirs]}
              >
                {!m.mine ? <Text style={styles.msgAlias}>{m.alias}</Text> : null}
                <Text style={styles.msgBody}>{m.body}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.hint}>Bir mesaja uzun basarak bildirebilirsin.</Text>
        </>
      ) : null}

      {disabledText ? (
        <Text style={styles.disabled}>{disabledText}</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
            {QUICK.map((q) => (
              <Pressable
                key={q}
                onPress={() => void send(q, true)}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
              >
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {open ? (
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Mesaj yaz (en çok 80 karakter)"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => void send(text)}
                accessibilityLabel="Sohbet mesajı"
              />
              <Pressable
                onPress={() => void send(text)}
                disabled={busy || !text.trim()}
                accessibilityRole="button"
                accessibilityLabel="Gönder"
                style={({ pressed }) => [styles.send, (busy || !text.trim()) && styles.off, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-forward" size={18} color={colors.primaryText} />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20, 26, 43, 0.96)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapOpen: { borderColor: colors.accent },
  wrapPlain: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  headText: { flex: 1, color: colors.text, fontSize: 12 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  list: { maxHeight: 160 },
  listTall: { maxHeight: 260 },
  listContent: { gap: 4, paddingVertical: 2 },
  empty: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  msg: { maxWidth: '82%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(124, 92, 255, 0.28)' },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  msgAlias: { color: colors.accent, fontSize: 10, fontFamily: fonts.semi },
  msgBody: { color: colors.text, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  quick: { gap: 6, paddingHorizontal: 2 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: { color: colors.text, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 38,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  disabled: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 11, textAlign: 'center' },
});
