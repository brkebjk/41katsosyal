import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { KeyboardLift } from '@/components/KeyboardLift';
import { OverlayPanel } from '@/components/OverlayPanel';
import { DragGrab, DragScreen } from '@/components/Sheet';
import {
  CREW_MAX_BODY,
  getCrewView,
  listCrewMessages,
  reportCrewMessage,
  sendCrewMessage,
  type CrewMember,
  type CrewMessage,
} from '@/lib/crew';
import { notify, notifyReportSent, showDialog } from '@/lib/dialog';
import { timeAgo } from '@/lib/labels';
import { colors, fonts, fontSizes, spacing } from '@/theme';

const CHAT_POLL_MS = 4000;

/**
 * Ekip sohbeti (mesaj kutusunda ekibin adıyla açılır). Üstte ekip arkadaşları: dokununca @rumuz yazıya eklenir ve
 * etiketlenen arkadaşa bildirim gider. Başkasının mesajına uzun basınca şikâyet edilir.
 */
export function CrewChat({ visible, title, onClose }: { visible: boolean; title: string; onClose: () => void }) {
  const [messages, setMessages] = useState<CrewMessage[] | null>(null);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const res = await listCrewMessages();
    setError(res.error);
    if (res.data) setMessages(res.data);
  }, []);

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pencere kapanınca temizlenir
      setMessages(null);
      setText('');
      lastCount.current = 0;
      return;
    }
    void load();
    void getCrewView().then((r) => setMembers(r.data?.crew?.members ?? []));
    const t = setInterval(() => void load(), CHAT_POLL_MS);
    return () => clearInterval(t);
  }, [visible, load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await sendCrewMessage(body);
    setSending(false);
    if (res.error) return void notify('Mesaj gönderilemedi', res.error, { icon: 'alert-circle', tone: 'danger' });
    setText('');
    void load();
  }

  async function report(m: CrewMessage) {
    const reason = await showDialog<string | null>({
      title: 'Mesajı şikayet et',
      message: `“${m.body}”\n\nBu mesaj moderatörlere iletilir. Kimin bildirdiği söylenmez.`,
      icon: 'flag',
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        { label: 'Spam / reklam', value: 'Spam ya da reklam', style: 'primary' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportCrewMessage(m.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notifyReportSent();
  }

  const mates = members.filter((m) => !m.is_me);
  const list = messages ?? [];

  return (
    <OverlayPanel visible={visible} onClose={onClose}>
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <DragGrab />
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mesajlara dön">
              <Ionicons name="chevron-back" size={26} color={colors.primary} />
            </Pressable>
            <View style={styles.crewIcon}>
              <Ionicons name="people" size={20} color={colors.primaryText} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                Ekip sohbeti · @rumuz ile etiketle
              </Text>
            </View>
            <Pressable
              onPress={() => {
                onClose();
                router.push('/ekip');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ekibim"
              style={styles.headBtn}
            >
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
          {mates.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mates}>
              {mates.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${m.alias} `)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.name} etiketle`}
                  style={({ pressed }) => [styles.mate, pressed && styles.pressed]}
                >
                  <Avatar index={m.avatar} size={22} />
                  <Text style={styles.mateText} numberOfLines={1}>{`@${m.alias}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <KeyboardLift style={styles.flex}>
            <View style={styles.flex}>
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => {
                  if (list.length !== lastCount.current) {
                    lastCount.current = list.length;
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                {messages === null ? (
                  error ? (
                    <Text style={styles.muted}>{error}</Text>
                  ) : (
                    <ActivityIndicator color={colors.primary} style={styles.loader} />
                  )
                ) : list.length === 0 ? (
                  <Text style={styles.muted}>Henüz mesaj yok. Ekibine ilk mesajı yaz.</Text>
                ) : null}
                {list.map((m) => (
                  <Pressable
                    key={m.id}
                    onLongPress={m.mine ? undefined : () => void report(m)}
                    delayLongPress={450}
                    accessibilityHint={m.mine ? undefined : 'Şikayet etmek için uzun bas'}
                    style={[styles.msg, m.mine ? styles.msgMine : styles.msgTheirs]}
                  >
                    {!m.mine ? <Text style={styles.msgFrom}>{m.alias}</Text> : null}
                    <Text style={[styles.msgText, m.mine && styles.msgTextMine]}>{m.body}</Text>
                    <Text style={[styles.msgTime, m.mine && styles.msgTimeMine]}>{timeAgo(m.created_at)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.composer}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Ekibine yaz…"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                  maxLength={CREW_MAX_BODY}
                  multiline
                  style={styles.input}
                  accessibilityLabel="Ekibine yaz"
                  testID="crew-input"
                />
                <Pressable
                  onPress={() => void send()}
                  disabled={sending || text.trim().length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Gönder"
                  testID="crew-send"
                  style={[styles.send, (sending || text.trim().length === 0) && styles.off]}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : (
                    <Ionicons name="send" size={22} color={colors.primaryText} />
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardLift>
        </SafeAreaView>
      </DragScreen>
    </OverlayPanel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: 0.75 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  crewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  name: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  sub: { color: colors.textMuted, fontSize: 12 },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  mates: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 3,
    paddingRight: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mateText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12, maxWidth: 120 },
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  loader: { paddingVertical: spacing.xl },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.md },
  msg: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, gap: 3 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  msgFrom: { color: colors.primary, fontFamily: fonts.extra, fontSize: 12 },
  msgText: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  msgTextMine: { color: colors.primaryText },
  msgTime: { color: colors.textMuted, fontSize: 11, alignSelf: 'flex-end' },
  msgTimeMine: { color: colors.primaryText, opacity: 0.7 },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 170,
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 21,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 25,
    paddingHorizontal: spacing.lg,
    paddingTop: 13,
    paddingBottom: 13,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.45 },
});
