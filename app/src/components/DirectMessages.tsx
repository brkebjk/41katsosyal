import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CloseX } from '@/components/CloseX';
import { KeyboardLift } from '@/components/KeyboardLift';
import { OverlayPanel } from '@/components/OverlayPanel';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { confirmAction, notify, notifyReportSent, showDialog } from '@/lib/dialog';
import { blockDm, DM_MAX, DM_STREAK, listDms, reportDm, sendDm, viewDm, type DmThread, type DmView } from '@/lib/dm';
import { timeAgo } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const CHAT_POLL_MS = 4000;
const LIST_POLL_MS = 15000;

/**
 * Akış ekranındaki mesaj kutusu: yazışmalar listesi (büyük, tam sayfa). Bir yazışmaya dokununca sohbet açılır.
 * `openId` verilirse (bildirim, rumuz profili, arkadaş listesi) doğrudan o sohbet açılır.
 */
export function DmInbox({
  visible,
  openId,
  subscribed,
  onClose,
  onUnread,
}: {
  visible: boolean;
  openId: string | null;
  subscribed: boolean;
  onClose: () => void;
  /** Liste yenilenince toplam okunmamış sayısı (rozet için) */
  onUnread: (n: number) => void;
}) {
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(openId);
  const [appliedOpen, setAppliedOpen] = useState<string | null>(openId);
  if (openId !== appliedOpen) {
    setAppliedOpen(openId);
    if (openId) setChatId(openId);
  }
  const unreadRef = useRef(onUnread);
  useEffect(() => {
    unreadRef.current = onUnread;
  }, [onUnread]);

  const load = useCallback(async () => {
    const res = await listDms();
    setError(res.error);
    if (!res.error) {
      setThreads(res.data);
      unreadRef.current(res.data.reduce((n, t) => n + t.unread, 0));
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme
    void load();
    const t = setInterval(() => void load(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [visible, load]);

  return (
    <>
      <OverlayPanel visible={visible && chatId === null} onClose={onClose}>
        <DragScreen onClose={onClose}>
          <SafeAreaView style={styles.safe} edges={['top']}>
            <DragGrab />
            <View style={styles.header}>
              <Ionicons name="chatbubbles" size={22} color={colors.primary} />
              <Text style={styles.headerTitle} accessibilityRole="header">
                Mesajlar
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
                <CloseX size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.listBody}>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color={colors.primary} />
                <Text style={styles.infoText}>
                  {subscribed
                    ? 'Rumuz profilinden ya da arkadaş listenden yeni yazışma başlatabilirsin. '
                    : 'Yeni yazışmayı aboneler başlatır; sana gelen mesajlara cevap verebilirsin. '}
                  Karşı taraf cevap verene kadar en çok {DM_STREAK} mesaj. Arkadaş olmayanların yazışması her Pazartesi
                  kapanır.
                </Text>
              </View>
              {threads === null ? (
                error ? (
                  <Text style={styles.muted}>{error}</Text>
                ) : (
                  <ActivityIndicator color={colors.primary} style={styles.loader} />
                )
              ) : threads.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="mail-open-outline" size={34} color={colors.textMuted} />
                  <Text style={styles.muted}>Henüz mesajın yok.</Text>
                </View>
              ) : (
                threads.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setChatId(t.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.other_name} ile yazışma${t.unread ? `, ${t.unread} okunmamış` : ''}`}
                    testID="dm-thread"
                    style={({ pressed }) => [
                      styles.thread,
                      t.unread > 0 && styles.threadUnread,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Avatar index={t.other_avatar} size={50} />
                    <View style={styles.threadText}>
                      <View style={styles.threadTop}>
                        <Text style={styles.threadName} numberOfLines={1}>
                          {t.other_name}
                        </Text>
                        {t.is_friend ? <Ionicons name="people" size={14} color={colors.success} /> : null}
                        <Text style={styles.threadTime}>{timeAgo(t.last_at)}</Text>
                      </View>
                      <Text style={[styles.threadLast, t.unread > 0 && styles.threadLastUnread]} numberOfLines={1}>
                        {t.last_body
                          ? `${t.last_mine ? 'Sen: ' : ''}${t.last_body}`
                          : 'Henüz mesaj yok · ilk mesajı yaz'}
                      </Text>
                    </View>
                    {t.unread > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{t.unread > 9 ? '9+' : t.unread}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </DragScreen>
      </OverlayPanel>
      <DmChat
        threadId={visible ? chatId : null}
        onClose={() => {
          setChatId(null);
          void load();
        }}
      />
    </>
  );
}

/** Sohbet penceresi: büyük mesaj balonları, altta yüzen yazı kutusu. Birkaç saniyede bir yenilenir. */
function DmChat({ threadId, onClose }: { threadId: string | null; onClose: () => void }) {
  const [view, setView] = useState<DmView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const lastCount = useRef(0);

  const load = useCallback(async (id: string) => {
    const res = await viewDm(id);
    if (res.error || !res.data) {
      setError(res.error ?? 'Yazışma açılamadı.');
      return;
    }
    setError(null);
    setView(res.data);
  }, []);

  useEffect(() => {
    if (!threadId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pencere kapanınca temizlenir
      setView(null);
      setError(null);
      setText('');
      lastCount.current = 0;
      return;
    }
    void load(threadId);
    const t = setInterval(() => void load(threadId), CHAT_POLL_MS);
    return () => clearInterval(t);
  }, [threadId, load]);

  async function send() {
    const body = text.trim();
    if (!threadId || !body || sending) return;
    setSending(true);
    const res = await sendDm(threadId, body);
    setSending(false);
    if (res.error) {
      void notify('Mesaj gönderilemedi', res.error, { icon: 'alert-circle', tone: 'danger' });
      return;
    }
    setText('');
    setInputKey((k) => k + 1);
    void load(threadId);
  }

  async function report(m: { id: string; body: string }) {
    const reason = await showDialog<string | null>({
      title: 'Mesajı şikayet et',
      message: `“${m.body}”\n\nBu mesaj moderatörlere iletilir. Karşı taraf kimin bildirdiğini bilmez.`,
      icon: 'flag',
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        { label: 'Spam / reklam', value: 'Spam ya da reklam', style: 'primary' },
        {
          label: 'Kişisel bilgi / dolandırıcılık',
          value: 'Kişisel bilgi isteme ya da dolandırıcılık',
          style: 'primary',
        },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportDm(m.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notifyReportSent();
  }

  async function block() {
    if (!threadId || !view) return;
    const ok = await confirmAction(
      'Engellensin mi?',
      `${view.other_name} sana bir daha mesaj gönderemez ve içerikleri sana görünmez. Arkadaşsanız arkadaşlık da biter. Engeli Profil > Engellediklerim’den kaldırabilirsin.`,
      'Engelle',
      true,
    );
    if (!ok) return;
    const res = await blockDm(threadId);
    if (res.error) return void notify('Engellenemedi', res.error, { icon: 'alert-circle' });
    onClose();
  }

  const messages = view?.messages ?? [];
  const lockText = !view
    ? null
    : view.blocked
      ? 'Bu yazışma engellendi.'
      : view.can_send
        ? null
        : !view.i_started && messages.every((m) => m.mine)
          ? 'Karşı taraf yazınca cevap verebilirsin.'
          : `Karşı taraf cevap verene kadar en çok ${DM_STREAK} mesaj gönderebilirsin.`;

  return (
    <OverlayPanel visible={threadId !== null} onClose={onClose}>
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <DragGrab />
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mesajlara dön">
              <Ionicons name="chevron-back" size={26} color={colors.primary} />
            </Pressable>
            {view ? <Avatar index={view.other_avatar} size={40} /> : null}
            <View style={styles.headText}>
              <Text style={styles.chatName} numberOfLines={1}>
                {view?.other_name ?? '…'}
              </Text>
              <Text style={styles.chatSub} numberOfLines={1}>
                {view
                  ? view.is_friend
                    ? 'Arkadaşın · yazışma kapanmaz'
                    : `Sen: ${view.my_alias} · Pazartesi kapanır`
                  : ''}
              </Text>
            </View>
            {view && !view.blocked ? (
              <Pressable
                onPress={() => void block()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Bu kişiyi engelle"
                testID="dm-block"
                style={({ pressed }) => [styles.blockBtn, pressed && styles.pressed]}
              >
                <Ionicons name="ban" size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <KeyboardLift style={styles.flex}>
            <View style={styles.flex}>
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={[styles.chatBody, lockText === null && styles.chatBodyFloat]}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => {
                  if (messages.length !== lastCount.current) {
                    lastCount.current = messages.length;
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                {error && !view ? <Text style={styles.muted}>{error}</Text> : null}
                {view && messages.length === 0 ? (
                  <Text style={styles.muted}>
                    {view.i_started ? 'İlk mesajı yaz. Karşı taraf yalnızca rumuzunu görür.' : 'Henüz mesaj yok.'}
                  </Text>
                ) : null}
                {messages.map((m) => (
                  <Pressable
                    key={m.id}
                    onLongPress={m.mine ? undefined : () => void report(m)}
                    delayLongPress={450}
                    accessibilityHint={m.mine ? undefined : 'Şikayet etmek için uzun bas'}
                    style={[styles.msg, m.mine ? styles.msgMine : styles.msgTheirs]}
                  >
                    <Text style={[styles.msgText, m.mine && styles.msgTextMine]}>{m.body}</Text>
                    <Text style={[styles.msgTime, m.mine && styles.msgTimeMine]}>{timeAgo(m.created_at)}</Text>
                  </Pressable>
                ))}
                {view && messages.some((m) => !m.mine) ? (
                  <Text style={styles.hint}>Bir mesajı şikayet etmek için üzerine uzun bas.</Text>
                ) : null}
              </ScrollView>
              {lockText === null && view ? (
                <View style={styles.composer}>
                  <TextInput
                    key={inputKey}
                    value={text}
                    onChangeText={setText}
                    placeholder="Mesaj yaz…"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.primary}
                    maxLength={DM_MAX}
                    multiline
                    style={styles.input}
                    accessibilityLabel="Mesaj yaz"
                    testID="dm-input"
                  />
                  <Pressable
                    onPress={() => void send()}
                    disabled={sending || text.trim().length === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Gönder"
                    testID="dm-send"
                    style={[styles.send, (sending || text.trim().length === 0) && styles.off]}
                  >
                    {sending ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Ionicons name="send" size={22} color={colors.primaryText} />
                    )}
                  </Pressable>
                </View>
              ) : lockText ? (
                <View style={styles.lock}>
                  <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                  <Text style={styles.lockText}>{lockText}</Text>
                </View>
              ) : null}
            </View>
          </KeyboardLift>
        </SafeAreaView>
      </DragScreen>
    </OverlayPanel>
  );
}

/** Rumuz profili ve arkadaş listesinden: yazışmayı akış ekranında açar */
export function goToDm(id: string) {
  router.navigate({ pathname: '/akis', params: { dm: id, t: String(Date.now()) } });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl },
  headText: { flex: 1, gap: 1 },
  chatName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  chatSub: { color: colors.textMuted, fontSize: 12 },
  blockBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  listBody: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  loader: { paddingVertical: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.md },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  threadUnread: { borderWidth: 1.5, borderColor: colors.primary },
  threadText: { flex: 1, gap: 3 },
  threadTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadName: { flexShrink: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  threadTime: { marginLeft: 'auto', color: colors.textMuted, fontSize: 12 },
  threadLast: { color: colors.textMuted, fontSize: fontSizes.sm },
  threadLastUnread: { color: colors.text, fontFamily: fonts.semi },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
  chatBody: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  chatBodyFloat: { paddingBottom: 100 },
  msg: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, gap: 4 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  msgText: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  msgTextMine: { color: colors.primaryText },
  msgTime: { color: colors.textMuted, fontSize: 11, alignSelf: 'flex-end' },
  msgTimeMine: { color: colors.primaryText, opacity: 0.7 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: spacing.sm },
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
  lock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  lockText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  pressed: { opacity: 0.75 },
});
