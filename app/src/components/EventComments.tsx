import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { KeyboardLift } from '@/components/KeyboardLift';
import { OverlayPanel } from '@/components/OverlayPanel';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { ActionSheet, type ActionOption } from '@/components/ActionSheet';
import { ChatBubble } from '@/components/ChatBubble';
import { RealNameNotice } from '@/components/RealNameNotice';
import { SponsorMark } from '@/components/SponsorMark';
import { useSponsorMenu } from '@/components/useSponsorMenu';
import { TitleBadge } from '@/components/TitleBadge';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { CloseX } from '@/components/CloseX';
import { isModeratorName, ModeratorMark } from '@/components/ModeratorMark';
import { confirmAction, notifyReportSent } from '@/lib/dialog';
import {
  EVENT_COMMENT_MAX,
  addEventComment,
  deleteEventComment,
  listEventComments,
  reportEventComment,
  type EventComment,
} from '@/lib/events';
import { REPORT_REASONS } from '@/lib/feed';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING, sendRequestForEventComment } from '@/lib/friends';
import { timeAgo } from '@/lib/labels';
import { setHidden } from '@/lib/moderation';
import { REAL_NAME } from '@/lib/realName';
import { colors, fonts, fontSizes, spacing } from '@/theme';

// Uyarı penceresi, uygulama açıldıktan sonra ilk yorumdan önce bir kez gösterilir
let warnedThisSession = false;

type Props = {
  /** null ise pencere kapalıdır */
  event: { id: string; title: string } | null;
  canWrite: boolean;
  isModerator: boolean;
  onClose: () => void;
  /** Yorum eklenince +1, silinince -1 bildirilir (listedeki sayı hemen güncellensin diye) */
  onCountDelta: (eventId: string, delta: number) => void;
};

/** Etkinlik yorumları: gerçek adla yazılır. Her etkinlik için ayrı bir kopya açılır (yorum kutusu temiz başlar). */
export function EventComments(props: Props) {
  return <EventCommentsBody key={props.event?.id ?? 'closed'} {...props} />;
}

type Sheet = { kind: 'menu' | 'report'; comment: EventComment } | null;

function EventCommentsBody({ event, canWrite, isModerator, onClose, onCountDelta }: Props) {
  const sponsorMenu = useSponsorMenu(isModerator);
  const eventId = event?.id ?? null;
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(event !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const sendLock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) return;
    const my = ++requestId.current;
    const res = await listEventComments(eventId);
    if (my !== requestId.current) return;
    setLoadError(res.error);
    if (!res.error) setComments(res.data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    if (eventId) void load();
  }, [eventId, load]);

  async function onSend() {
    if (!eventId || sendLock.current) return;
    const body = text.trim();
    if (!body) return;
    sendLock.current = true;
    setSending(true);
    setNotice(null);
    try {
      if (!warnedThisSession) {
        const ok = await confirmAction(
          'Gerçek adınla yorum yazıyorsun',
          'Devam etmek istiyor musun?',
          'Anladım, gönder',
          false,
          { icon: 'person-circle', warning: REAL_NAME.eventComment },
        );
        if (!ok) return;
        warnedThisSession = true;
      }
      const res = await addEventComment(eventId, body);
      if (res.error) {
        setNotice({ text: res.error, error: true });
        return;
      }
      setText('');
      onCountDelta(eventId, 1);
      await load();
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  async function onDelete(c: EventComment) {
    setSheet(null);
    const ok = await confirmAction('Yorumu sil', 'Bu işlem geri alınamaz.', 'Sil', true);
    if (!ok) return;
    const res = await deleteEventComment(c.id);
    if (res.error) {
      setNotice({ text: res.error, error: true });
    } else {
      onCountDelta(c.event_id, -1);
      setNotice({ text: 'Yorumun silindi.', error: false });
    }
    void load();
  }

  async function onReport(c: EventComment, reason: string) {
    setSheet(null);
    const res = await reportEventComment(c.id, reason);
    if (res.error) setNotice({ text: res.error, error: true });
    else await notifyReportSent();
  }

  async function onToggleHidden(c: EventComment) {
    setSheet(null);
    const hide = !c.is_hidden;
    const res = await setHidden('event_comment', c.id, hide);
    setNotice(
      res.error
        ? { text: res.error, error: true }
        : { text: hide ? 'Yorum gizlendi.' : 'Yorum yeniden gösteriliyor.', error: false },
    );
    void load();
  }

  /** Gerçek adla görünen yorum: yalnızca arkadaş ekle ve şikayet et */
  async function onFriend(c: EventComment) {
    setSheet(null);
    const ok = await confirmAction(
      'Arkadaşlık isteği gönder',
      `İstek ${c.author_name} adlı kişiye gidecek. ${FRIEND_CONSEQUENCE}`,
      'İsteği gönder',
      false,
      { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
    );
    if (!ok) return;
    const res = await sendRequestForEventComment(c.id);
    if (res.error) setNotice({ text: res.error, error: true });
    else
      setNotice({
        text: res.outcome === 'accepted' ? 'Artık arkadaşsınız.' : 'Arkadaşlık isteği gönderildi.',
        error: false,
      });
  }

  function menuOptions(c: EventComment): ActionOption[] {
    const own: ActionOption[] = c.is_mine
      ? [{ label: 'Yorumu sil', icon: 'trash-outline', destructive: true, onPress: () => void onDelete(c) }]
      : [
          ...(c.is_official || c.sponsor_id
            ? []
            : [{ label: 'Arkadaş ekle', icon: 'person-add-outline' as const, onPress: () => void onFriend(c) }]),
          {
            label: 'Şikayet et',
            icon: 'flag-outline',
            onPress: () => setSheet({ kind: 'report', comment: c }),
          },
        ];
    const mod: ActionOption[] = isModerator
      ? [
          {
            label: c.is_hidden ? 'Yeniden göster' : 'Gizle',
            icon: c.is_hidden ? 'eye' : 'eye-off-outline',
            onPress: () => void onToggleHidden(c),
          },
        ]
      : [];
    return [...own, ...mod];
  }

  return (
    <OverlayPanel visible={event !== null} onClose={onClose}>
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={[]}>
          <DragGrab />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} accessibilityRole="header">
                Yorumlar
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {event?.title}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={20} />
            </Pressable>
          </View>

          <RealNameNotice text={REAL_NAME.eventComment} style={styles.warning} />

          {event ? (
            <KeyboardLift style={styles.flex}>
              <View style={styles.flex}>
                <KeyboardAwareScroll
                  contentContainerStyle={[styles.content, styles.contentFloat]}
                  keyboardShouldPersistTaps="handled"
                >
                  {notice ? (
                    <Text
                      style={[styles.notice, notice.error ? styles.noticeError : styles.noticeOk]}
                      accessibilityLiveRegion="polite"
                    >
                      {notice.text}
                    </Text>
                  ) : null}
                  {loading ? (
                    <ActivityIndicator color={colors.primary} style={styles.loader} />
                  ) : loadError ? (
                    <View style={styles.stateBox}>
                      <Text style={styles.stateText}>{loadError}</Text>
                      <Pressable
                        onPress={() => {
                          setLoading(true);
                          void load();
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.link}>Tekrar dene</Text>
                      </Pressable>
                    </View>
                  ) : comments.length === 0 ? (
                    <Text style={styles.stateText}>Henüz yorum yok.{canWrite ? ' İlk yorumu sen yaz.' : ''}</Text>
                  ) : (
                    comments.map((c) => (
                      <View key={c.id} style={styles.comment}>
                        <View style={styles.commentHead}>
                          {c.is_official ? <Ionicons name="shield-checkmark" size={15} color={colors.primary} /> : null}
                          {c.sponsor_id ? (
                            <Pressable
                              onPress={() => sponsorMenu.open(c.sponsor_id!, c.author_name)}
                              accessibilityRole="button"
                              accessibilityLabel={`${c.author_name}, mekân hesabı. Mekân menüsünü aç`}
                              style={styles.sponsorName}
                            >
                              <SponsorMark size={14} />
                              <Text style={[styles.name, styles.nameSponsor]} numberOfLines={1}>
                                {c.author_name}
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => setSheet({ kind: 'menu', comment: c })}
                              accessibilityRole="button"
                              accessibilityLabel={`${c.author_name}. Seçenekler`}
                              style={styles.namePress}
                            >
                              <Text style={[styles.name, c.is_official && styles.nameOfficial]} numberOfLines={1}>
                                {c.author_name}
                              </Text>
                            </Pressable>
                          )}
                          {isModeratorName(c.author_name) ? <ModeratorMark size={13} /> : null}
                          <Text style={styles.time}>{timeAgo(c.created_at)}</Text>
                          <View style={styles.flex} />
                          <Pressable
                            onPress={() => setSheet({ kind: 'menu', comment: c })}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Yorum menüsü"
                          >
                            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                          </Pressable>
                        </View>
                        <TitleBadge label={c.author_title} />
                        {c.is_hidden ? (
                          <Text style={styles.hiddenText}>Gizli · yalnızca moderatörler görür</Text>
                        ) : null}
                        <ChatBubble hidden={c.is_hidden}>
                          <Text style={styles.body}>{c.body}</Text>
                        </ChatBubble>
                      </View>
                    ))
                  )}
                </KeyboardAwareScroll>

                {canWrite ? (
                  <View style={styles.composer}>
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      placeholder="Gerçek adınla yorum yaz…"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.primary}
                      maxLength={EVENT_COMMENT_MAX}
                      multiline
                      style={styles.input}
                      accessibilityLabel="Yorum yaz"
                    />
                    <Pressable
                      onPress={() => void onSend()}
                      disabled={sending || text.trim().length === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Yorumu gönder"
                      style={[styles.send, (sending || text.trim().length === 0) && styles.sendDisabled]}
                    >
                      {sending ? (
                        <ActivityIndicator color={colors.primaryText} />
                      ) : (
                        <Ionicons name="send" size={20} color={colors.primaryText} />
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.lock}>
                    <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                    <Text style={styles.lockText}>Hesabın şu an yorum yazmaya açık değil.</Text>
                  </View>
                )}
              </View>
            </KeyboardLift>
          ) : null}

          {sheet?.kind === 'menu' ? (
            <ActionSheet
              key={`menu:${sheet.comment.id}`}
              title="Yorum"
              subtitle={sheet.comment.author_name}
              options={menuOptions(sheet.comment)}
              onClose={() => setSheet(null)}
            />
          ) : null}
          {sheet?.kind === 'report' ? (
            <ActionSheet
              key={`report:${sheet.comment.id}`}
              title="Şikayet nedeni"
              subtitle="Şikayetin yalnızca moderatörlere gider. Şikayet ettiğin kişi bunu bilmez."
              options={REPORT_REASONS.map((r) => ({
                label: r,
                icon: 'flag-outline' as const,
                onPress: () => void onReport(sheet.comment, r),
              }))}
              onClose={() => setSheet(null)}
            />
          ) : null}
          {sponsorMenu.nodes}
        </SafeAreaView>
      </DragScreen>
    </OverlayPanel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, gap: 2, paddingRight: spacing.md },
  headerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  headerSub: { color: colors.textMuted, fontSize: fontSizes.sm },
  warning: { margin: spacing.md, marginBottom: 0 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  loader: { paddingVertical: spacing.lg },
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  stateText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '800', fontSize: fontSizes.sm },
  notice: { fontSize: fontSizes.sm, lineHeight: 20 },
  noticeError: { color: colors.danger },
  noticeOk: { color: colors.success },
  comment: { gap: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontFamily: fonts.extra, fontSize: 13, flexShrink: 1 },
  namePress: { flexShrink: 1 },
  nameOfficial: { color: colors.primary },
  nameSponsor: { color: colors.venue },
  sponsorName: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: colors.textMuted, fontSize: 12 },
  hiddenText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21 },
  // Yazı kutusu akıştaki gibi yüzer: arka planla bağlantısız, altta; liste altından kayar
  contentFloat: { paddingBottom: 96 },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 160,
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
  },

  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
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
});
