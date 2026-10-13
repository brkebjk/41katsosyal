import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { KeyboardLift } from '@/components/KeyboardLift';
import { OverlayPanel } from '@/components/OverlayPanel';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { Avatar } from '@/components/Avatar';
import { isModeratorName, ModeratorMark } from '@/components/ModeratorMark';
import { ChatBubble } from '@/components/ChatBubble';
import { ContentActions, type ContentResult, type ContentTarget } from '@/components/ContentActions';
import { FriendTag } from '@/components/FriendTag';
import { PostCard } from '@/components/PostCard';
import { SponsorMark } from '@/components/SponsorMark';
import { useSponsorMenu } from '@/components/useSponsorMenu';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { CloseX } from '@/components/CloseX';
import { anchorOf, type MenuAnchor } from '@/lib/menuAnchor';
import { skinColors } from '@/lib/bubbleSkins';
import { COMMENT_MAX, createComment, displayName, listComments, type Comment, type Post } from '@/lib/feed';
import { timeAgo } from '@/lib/labels';
import { profilePhotoUrl } from '@/lib/profilePhoto';
import { venueImageUrl } from '@/lib/venueImage';
import { colors, fonts, fontSizes, spacing } from '@/theme';

type Props = {
  /** null ise pencere kapalıdır */
  post: Post | null;
  canWrite: boolean;
  /** Yazma kapalıyken gösterilecek açıklama */
  writeLockText: string;
  isModerator: boolean;
  likeBusy: boolean;
  onClose: () => void;
  onLike: (post: Post) => void;
  /** Yorum eklenince +1, silinince -1 bildirilir (akıştaki sayı hemen güncellensin diye) */
  onCommentDelta: (postId: string, delta: number) => void;
  /** Gönderi silindi / engellendi / gizlendi: pencere kapanır, akış mesajı gösterir */
  onPostGone: (postId: string, result: ContentResult, message: string) => void;
  /** Gönderinin kendi durumu değişti (ör. moderatör gizleme/gösterme) */
  onPostPatch: (postId: string, patch: Partial<Post>) => void;
  /** Bir yorumun yazarı engellendi: o kişinin gönderileri akıştan da kalkacağı için akış yenilenmeli */
  onAuthorBlocked: () => void;
};

/**
 * Gönderi penceresi. Her gönderi için ayrı bir kopya açılır; böylece yorumlar ve yazı kutusu
 * her seferinde temiz başlar.
 */
export function PostDetail(props: Props) {
  return <PostDetailBody key={props.post?.id ?? 'closed'} {...props} />;
}

function PostDetailBody({
  post,
  canWrite,
  writeLockText,
  isModerator,
  likeBusy,
  onClose,
  onLike,
  onCommentDelta,
  onPostGone,
  onPostPatch,
  onAuthorBlocked,
}: Props) {
  const sponsorMenu = useSponsorMenu(isModerator);
  const postId = post?.id ?? null;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(post !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [target, setTarget] = useState<ContentTarget | null>(null);
  const sendLock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!postId) return;
    const my = ++requestId.current;
    const res = await listComments(postId);
    if (my !== requestId.current) return; // daha yeni bir yükleme başladı
    setLoadError(res.error);
    if (!res.error) setComments(res.data);
    setLoading(false);
  }, [postId]);

  // Pencere açılınca yorumları getir
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    if (postId) void load();
  }, [postId, load]);

  async function onSend() {
    if (!post || sendLock.current) return;
    const body = text.trim();
    if (!body) return;
    sendLock.current = true;
    setSending(true);
    setNotice(null);
    try {
      const res = await createComment(post.id, body);
      if (res.error) {
        setNotice({ text: res.error, error: true });
        return;
      }
      setText('');
      onCommentDelta(post.id, 1);
      await load();
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  function handleDone(result: ContentResult, message: string) {
    if (!target) return;
    if (target.type === 'post') {
      if (result === 'hidden') onPostPatch(target.id, { is_hidden: true });
      else if (result === 'unhidden') onPostPatch(target.id, { is_hidden: false });
      if (result === 'deleted' || result === 'blocked') {
        onPostGone(target.id, result, message);
        return;
      }
      setNotice({ text: message, error: false });
      return;
    }
    // yorum
    setNotice({ text: message, error: false });
    if (result === 'deleted' && post) onCommentDelta(post.id, -1);
    if (result === 'blocked') onAuthorBlocked();
    void load();
  }

  const postTarget = (p: Post): ContentTarget => ({
    type: 'post',
    id: p.id,
    alias: displayName(p),
    is_mine: p.is_mine,
    is_hidden: p.is_hidden,
    is_friend: p.author_name !== null || !!p.sponsor_id,
    profile: !p.sponsor_id && !p.event_id && p.alias !== 'Moderatör',
  });

  return (
    <OverlayPanel visible={post !== null} onClose={onClose}>
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={[]}>
          <DragGrab />
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Gönderi
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={20} />
            </Pressable>
          </View>

          {post ? (
            <KeyboardLift style={styles.flex}>
              <View style={styles.flex}>
                <KeyboardAwareScroll
                  contentContainerStyle={[styles.content, styles.contentFloat]}
                  keyboardShouldPersistTaps="handled"
                >
                  <PostCard
                    post={post}
                    likeBusy={likeBusy}
                    onLike={() => onLike(post)}
                    onMenu={(at) => setTarget({ ...postTarget(post), anchor: at })}
                    onAlias={(at) => setTarget({ ...postTarget(post), anchor: at })}
                    onSponsor={sponsorMenu.open}
                  />

                  {notice ? (
                    <Text
                      style={[styles.notice, notice.error ? styles.noticeError : styles.noticeOk]}
                      accessibilityLiveRegion="polite"
                    >
                      {notice.text}
                    </Text>
                  ) : null}

                  <Text style={styles.sectionTitle}>Yorumlar</Text>
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
                      <CommentRow
                        key={c.id}
                        comment={c}
                        onSponsor={sponsorMenu.open}
                        onMenu={(at) =>
                          setTarget({
                            anchor: at,
                            type: 'comment',
                            id: c.id,
                            alias: displayName(c),
                            is_mine: c.is_mine,
                            is_hidden: c.is_hidden,
                            is_friend: c.author_name !== null || !!c.sponsor_id,
                            profile: !c.sponsor_id && c.alias !== 'Moderatör',
                          })
                        }
                      />
                    ))
                  )}
                </KeyboardAwareScroll>

                {canWrite ? (
                  <View style={styles.composer}>
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      placeholder="Yorum yaz…"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.primary}
                      maxLength={COMMENT_MAX}
                      multiline
                      style={styles.input}
                      accessibilityLabel="Yorum yaz"
                    />
                    <Pressable
                      onPress={onSend}
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
                    <Text style={styles.lockText}>{writeLockText}</Text>
                  </View>
                )}
              </View>
            </KeyboardLift>
          ) : null}

          {target ? (
            <ContentActions
              key={`${target.type}:${target.id}`}
              target={target}
              isModerator={isModerator}
              onClose={() => setTarget(null)}
              onNavigate={onClose}
              onDone={handleDone}
              onError={(m) => setNotice({ text: m, error: true })}
            />
          ) : null}
          {sponsorMenu.nodes}
        </SafeAreaView>
      </DragScreen>
    </OverlayPanel>
  );
}

function CommentRow({
  comment,
  onMenu,
  onSponsor,
}: {
  comment: Comment;
  onMenu: (at?: MenuAnchor) => void;
  onSponsor: (sponsorId: string, name: string) => void;
}) {
  const c = skinColors(comment.author_skin);
  return (
    <View style={styles.comment}>
      {/* Avatara dokunmak rumuza dokunmak gibidir */}
      <Pressable
        onPress={
          comment.sponsor_id ? () => onSponsor(comment.sponsor_id!, displayName(comment)) : (e) => onMenu(anchorOf(e))
        }
        accessibilityRole="button"
        accessibilityLabel={`${displayName(comment)}. Rumuz profili ve seçenekler`}
        testID="comment-avatar"
      >
        <Avatar index={comment.avatar_index} size={34} uri={venueImageUrl(comment.author_image) ?? profilePhotoUrl(comment.author_photo)} />
      </Pressable>
      <View style={styles.commentBody}>
        <View style={styles.commentHead}>
          {comment.sponsor_id ? (
            <Pressable
              onPress={() => onSponsor(comment.sponsor_id!, displayName(comment))}
              accessibilityRole="button"
              accessibilityLabel={`${displayName(comment)}, mekân hesabı. Mekân profilini aç`}
              style={styles.sponsorName}
            >
              <SponsorMark size={14} />
              <Text style={[styles.commentAlias, styles.sponsorAlias]} numberOfLines={1}>
                {displayName(comment)}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={(e) => onMenu(anchorOf(e))}
              accessibilityRole="button"
              accessibilityLabel={`${displayName(comment)}. Rumuz profili ve seçenekler`}
              style={styles.aliasPress}
            >
              <Text style={styles.commentAlias} numberOfLines={1}>
                {displayName(comment)}
              </Text>
            </Pressable>
          )}
          {isModeratorName(displayName(comment)) ? <ModeratorMark size={13} /> : null}
          {comment.author_name ? <FriendTag /> : null}
          <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
          <View style={styles.flex} />
          <Pressable
            onPress={(e) => onMenu(anchorOf(e))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Yorum menüsü"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        {comment.is_hidden ? <Text style={styles.hiddenText}>Gizli · yalnızca moderatörler görür</Text> : null}
        <ChatBubble skin={comment.author_skin} hidden={comment.is_hidden}>
          <Text style={[styles.commentText, { color: c.text }]}>{comment.body}</Text>
        </ChatBubble>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aliasPress: { flexShrink: 1 },
  sponsorName: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sponsorAlias: { color: colors.venue },
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
  headerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
    marginTop: spacing.sm,
  },
  loader: { paddingVertical: spacing.lg },
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  stateText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '800', fontSize: fontSizes.sm },
  notice: { fontSize: fontSizes.sm, lineHeight: 20 },
  noticeError: { color: colors.danger },
  noticeOk: { color: colors.success },
  comment: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  commentBody: { flex: 1, minWidth: 0, gap: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentAlias: { color: colors.text, fontFamily: fonts.extra, fontSize: 13, flexShrink: 1 },
  commentTime: { color: colors.textMuted, fontSize: 12 },
  commentText: { fontSize: fontSizes.sm, lineHeight: 21 },
  hiddenText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
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
