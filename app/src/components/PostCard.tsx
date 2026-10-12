import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ChatBubble } from '@/components/ChatBubble';
import { FriendTag } from '@/components/FriendTag';
import { SponsorMark } from '@/components/SponsorMark';
import { skinColors } from '@/lib/bubbleSkins';
import { router } from 'expo-router';
import { goToDm } from '@/components/DirectMessages';
import { notify, showDialog } from '@/lib/dialog';
import { openDm } from '@/lib/dm';

import { cellName } from '@/lib/cellNames';
import { categoryInfo } from '@/lib/eventCategories';
import { eventImageUrl } from '@/lib/eventImage';
import { displayName, MENTION_RE, type Post, type Reaction } from '@/lib/feed';
import { formatWhen, timeAgo } from '@/lib/labels';
import { anchorOf, type MenuAnchor } from '@/lib/menuAnchor';
import { venueImageUrl } from '@/lib/venueImage';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  post: Post;
  onLike: () => void;
  /** Verilirse balon (ve yorum düğmesi) dokununca gönderi detayı açılır */
  onOpen?: () => void;
  onMenu: (at?: MenuAnchor) => void;
  /** Yazar bir sponsor (mekân) hesabıysa adına dokununca çağrılır (mekân menüsü) */
  onSponsor?: (sponsorId: string, name: string) => void;
  likeBusy?: boolean;
  /** Verilirse gönderinin kenarında küçük “Cevapla” yazısı çıkar */
  onReply?: () => void;
  /** Verilirse gülme / + / − tepkileri dokunulabilir olur */
  onReact?: (kind: Reaction) => void;
  /** Rumuza dokununca (profile git seçeneği olan menü) */
  onAlias?: (at?: MenuAnchor) => void;
  /** Akışta zincirin en çok kaç devam parçası görünsün (detayda hepsi) */
  maxParts?: number;
};

/** Gönderiye girmek için basılı tutma süresi (kaydırırken yanlışlıkla açılmasın) */
const OPEN_DELAY = 500;

/**
 * @rumuz etiketine dokununca: “Profili gör” ve “Özel mesaj gönder”. Rumuz yalnızca bu haftaki sahibine götürür
 * (sunucu denetler); kişinin gerçek adı ve kimliği telefona gelmez.
 */
async function onMention(tag: string) {
  const alias = tag.replace(/^@/, '').trim();
  const choice = await showDialog<'profile' | 'dm' | null>({
    title: alias,
    message: 'Etiketlenen kişi',
    icon: 'at',
    buttons: [
      { label: 'Profili gör', value: 'profile', style: 'primary' },
      { label: 'Özel mesaj gönder', value: 'dm', style: 'ghost' },
      { label: 'Vazgeç', value: null, style: 'ghost' },
    ],
    cancelValue: null,
  });
  if (choice === 'profile') {
    router.push({ pathname: '/rumuz', params: { alias } });
  } else if (choice === 'dm') {
    const res = await openDm({ alias });
    if (res.error || !res.id) {
      void notify('Mesaj gönderilemiyor', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'chatbubbles' });
      return;
    }
    goToDm(res.id);
  }
}

/** Metindeki @rumuz etiketlerini renkli gösterir; etikete dokununca profil seçenekleri açılır. */
function BodyText({ body, color }: { body: string; color: string }) {
  const parts: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: body.slice(last, i), tag: false });
    parts.push({ text: m[0], tag: true });
    last = i + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), tag: false });
  return (
    <Text style={[styles.text, { color }]}>
      {parts.map((p, i) =>
        p.tag ? (
          <Text
            key={i}
            style={styles.mention}
            onPress={() => void onMention(p.text)}
            suppressHighlighting={false}
            accessibilityRole="link"
          >
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

const REACTIONS: {
  kind: Reaction;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
}[] = [
  { kind: 'laugh', icon: 'happy', color: '#FFC83D', label: 'Güldüm' },
  { kind: 'plus', icon: 'add-circle', color: '#34C77B', label: 'Artı' },
  { kind: 'minus', icon: 'remove-circle', color: '#FF5C5C', label: 'Eksi' },
];

/**
 * Akıştaki ve detaydaki gönderi: solda avatar, üstte rumuz, altında konuşma balonu.
 * Yazarın sadece rumuzu ve avatarı görünür; balonun rengini yazar seçer.
 */
export function PostCard({
  post,
  onLike,
  onOpen,
  onMenu,
  onSponsor,
  likeBusy = false,
  onReply,
  onReact,
  onAlias,
  maxParts,
}: Props) {
  const parts = post.thread ?? [];
  const isEvent = Boolean(post.event_id);
  const c = skinColors(post.author_skin);
  const name = displayName(post);
  // Menü düğmesi, kartı açan düğmenin içinde olmamalı (iç içe düğme geçersizdir):
  // başlık, menü düğmesi ve metin yan yana / alt alta kardeş öğelerdir.
  const sponsorId = post.sponsor_id ?? null;
  const who = (
    <>
      {sponsorId ? <SponsorMark /> : null}
      <Text style={[styles.alias, sponsorId ? styles.aliasSponsor : null]} numberOfLines={1}>
        {name}
      </Text>
      {post.author_name ? <FriendTag /> : null}
      <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
    </>
  );

  return (
    <View>
      <View style={styles.row}>
        {isEvent && !post.author_image ? (
          <View style={[styles.avatar, styles.eventAvatar]}>
            <Ionicons name="calendar" size={20} color={colors.event} />
          </View>
        ) : onOpen || onAlias || (sponsorId && onSponsor) ? (
          // Avatara dokunmak rumuza dokunmak gibidir (rumuz menüsü / mekân profili); uzun basınca gönderi açılır
          <Pressable
            onPress={
              sponsorId && onSponsor
                ? () => onSponsor(sponsorId, name)
                : onAlias && !isEvent
                  ? (e) => onAlias(anchorOf(e))
                  : undefined
            }
            onLongPress={onOpen}
            delayLongPress={OPEN_DELAY}
            accessibilityRole="button"
            accessibilityLabel={`${name}. Rumuz profili ve seçenekler`}
            testID="post-avatar"
            style={styles.avatar}
          >
            <Avatar index={post.avatar_index} size={40} uri={venueImageUrl(post.author_image)} />
          </Pressable>
        ) : (
          <View style={styles.avatar}>
            <Avatar index={post.avatar_index} size={40} uri={venueImageUrl(post.author_image)} />
          </View>
        )}
        <View style={styles.main}>
          <View style={styles.head}>
            {sponsorId && onSponsor ? (
              <Pressable
                onPress={() => onSponsor(sponsorId, name)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, mekân hesabı. Mekân profilini aç`}
                style={styles.who}
                testID="post-sponsor"
              >
                {who}
              </Pressable>
            ) : onAlias && !isEvent ? (
              <Pressable
                onPress={(e) => onAlias(anchorOf(e))}
                accessibilityRole="button"
                accessibilityLabel={`${name}. Rumuz profili ve seçenekler`}
                style={styles.who}
                testID="post-alias"
              >
                {who}
              </Pressable>
            ) : onOpen ? (
              <Pressable onLongPress={onOpen} delayLongPress={OPEN_DELAY} accessible={false} style={styles.who}>
                {who}
              </Pressable>
            ) : (
              <View style={styles.who}>{who}</View>
            )}
            <Pressable
              onPress={(e) => onMenu(anchorOf(e))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Gönderi menüsü"
              style={styles.menuBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {post.mentions_me ? (
            <Text style={styles.mentionedTag} testID="post-mentioned">
              senden bahsedildi
            </Text>
          ) : null}

          {post.is_hidden ? (
            <View style={styles.hiddenTag}>
              <Ionicons name="eye-off-outline" size={14} color={colors.danger} />
              <Text style={styles.hiddenText}>Gizli · yalnızca moderatörler görür</Text>
            </View>
          ) : null}

          <ChatBubble skin={post.author_skin} hidden={post.is_hidden} full>
            {onOpen ? (
              <Pressable
                onLongPress={onOpen}
                delayLongPress={OPEN_DELAY}
                accessibilityRole="button"
                accessibilityLabel={`${name} gönderisini aç`}
                accessibilityHint="Açmak için yarım saniye basılı tut"
              >
                <BodyText body={post.body} color={c.text} />
              </Pressable>
            ) : (
              <BodyText body={post.body} color={c.text} />
            )}
            {/* Zincir: devam parçaları sırayla, ince çizgiyle ayrılır */}
            {(maxParts !== undefined ? parts.slice(0, maxParts) : parts).map((t, i) => (
              <View key={t.id} style={[styles.part, { borderTopColor: c.border }]}>
                <Text style={[styles.partNo, { color: c.text }]}>{`${i + 2}/${parts.length + 1}`}</Text>
                <BodyText body={t.body} color={c.text} />
              </View>
            ))}
            {maxParts !== undefined && parts.length > maxParts ? (
              <Text style={[styles.partMore, { color: c.text }]}>
                {`… ${parts.length - maxParts} parça daha · görmek için basılı tut`}
              </Text>
            ) : null}
            {isEvent && post.event_title && post.event_image ? (
              <Image
                source={{ uri: eventImageUrl(post.event_image) ?? undefined }}
                contentFit="cover"
                style={styles.eventImage}
                accessibilityLabel={`${post.event_title} görseli`}
              />
            ) : null}
            {isEvent && post.event_title ? (
              <Pressable
                onPress={() => router.push('/events')}
                accessibilityRole="button"
                accessibilityLabel={`${post.event_title} etkinliğini Etkinlikler sekmesinde gör`}
                style={[styles.eventBox, { borderColor: c.border }]}
                testID="post-event"
              >
                <Ionicons name="calendar" size={18} color={c.text} />
                <View style={styles.eventText}>
                  <Text style={[styles.eventTitle, { color: c.text }]} numberOfLines={2}>
                    {post.event_official ? `★ ${post.event_title}` : post.event_title}
                  </Text>
                  <Text style={[styles.placeMeta, { color: c.text }]} numberOfLines={2}>
                    {[
                      post.event_starts_at ? formatWhen(new Date(post.event_starts_at)) : null,
                      post.event_location,
                      post.event_category ? categoryInfo(post.event_category).title : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={[styles.eventLink, { color: c.text }]}>Etkinliğe git ›</Text>
                </View>
              </Pressable>
            ) : null}
            {post.cell_q != null && post.cell_r != null ? (
              <View style={[styles.place, { borderColor: c.border }]} testID="post-cell">
                <Ionicons name="grid" size={14} color={c.text} />
                <Text style={[styles.placeName, { color: c.text }]} numberOfLines={1}>
                  {`${cellName({ q: post.cell_q, r: post.cell_r })} peteği`}
                </Text>
              </View>
            ) : null}
            {post.place_name ? (
              <Pressable
                onPress={() => {
                  if (post.place_q == null || post.place_r == null) return;
                  router.navigate({
                    pathname: '/',
                    params: { q: String(post.place_q), r: String(post.place_r), t: String(Date.now()) },
                  });
                }}
                disabled={post.place_q == null}
                accessibilityRole="link"
                style={[styles.place, { borderColor: c.border }]}
                accessibilityLabel={`Yer: ${post.place_name}. Haritada göster`}
                testID="post-place"
              >
                <Ionicons name="location" size={14} color={c.text} />
                <Text style={[styles.placeName, { color: c.text }]} numberOfLines={1}>
                  {post.place_name}
                </Text>
                {post.place_label || post.place_district ? (
                  <Text style={[styles.placeMeta, { color: c.text }]} numberOfLines={1}>
                    {[post.place_label, post.place_district].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {post.place_q != null ? <Ionicons name="map-outline" size={13} color={c.text} /> : null}
              </Pressable>
            ) : null}
          </ChatBubble>

          {onReply ? (
            <Pressable
              onPress={onReply}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${name} gönderisine cevap yaz`}
              style={({ pressed }) => [styles.replyBtn, pressed && styles.pressed]}
              testID="post-reply"
            >
              <Ionicons name="arrow-undo" size={12} color={colors.primary} />
              <Text style={styles.replyText}>Cevapla</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {/* Beğeni / yorum / tepki düğmeleri gönderiler arasındaki ayraç çizgisinin üstünde durur */}
      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Pressable
          onPress={onLike}
          disabled={likeBusy}
          accessibilityRole="button"
          accessibilityLabel={post.liked ? 'Beğeniyi geri al' : 'Beğen'}
          accessibilityState={{ selected: post.liked }}
          style={({ pressed }) => [styles.action, styles.onLine, pressed && styles.pressed]}
        >
          <Ionicons
            name={post.liked ? 'heart' : 'heart-outline'}
            size={22}
            color={post.liked ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.count, post.liked && styles.countLiked]}>{post.like_count}</Text>
        </Pressable>
        <Pressable
          onPress={onOpen}
          disabled={!onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${post.comment_count} yorum`}
          style={({ pressed }) => [styles.action, styles.onLine, pressed && styles.pressed]}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
          <Text style={styles.count}>{post.comment_count}</Text>
        </Pressable>
        {REACTIONS.map((r) => {
          const mine = post.my_reaction === r.kind;
          const count =
            r.kind === 'laugh'
              ? (post.laugh_count ?? 0)
              : r.kind === 'plus'
                ? (post.plus_count ?? 0)
                : (post.minus_count ?? 0);
          return (
            <Pressable
              key={r.kind}
              onPress={onReact ? () => onReact(r.kind) : undefined}
              disabled={!onReact}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}: ${count}`}
              accessibilityState={{ selected: mine }}
              style={({ pressed }) => [styles.action, styles.onLine, styles.reaction, pressed && styles.pressed]}
              testID={`post-react-${r.kind}`}
            >
              <Ionicons
                name={mine ? r.icon : (`${r.icon}-outline` as React.ComponentProps<typeof Ionicons>['name'])}
                size={20}
                color={mine ? r.color : colors.textMuted}
              />
              <Text style={[styles.count, mine && { color: r.color }]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Alt boşluk az: beğeni / yorum / tepki satırı alttaki ayraç çizgisine yakın durur
  row: { flexDirection: 'row', gap: spacing.md, paddingTop: 2, paddingBottom: 0 },
  avatar: { paddingTop: 2 },
  main: { flex: 1, minWidth: 0, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  alias: { flexShrink: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  aliasSponsor: { color: colors.venue },
  time: { color: colors.textMuted, fontSize: 12 },
  menuBtn: { padding: spacing.xs },
  hiddenTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hiddenText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  text: { fontSize: fontSizes.md, lineHeight: 23 },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  placeName: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  placeMeta: { flexShrink: 2, fontSize: 12, opacity: 0.8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    paddingLeft: 40,
    marginTop: spacing.xs,
  },
  // Kartın tüm genişliğinde ayraç çizgisi; düğmeler zemin rengindeki kutularıyla çizginin üstüne oturur
  footerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1.5,
    backgroundColor: colors.border,
  },
  reaction: { minWidth: 36 },
  onLine: { backgroundColor: colors.bg, paddingHorizontal: 6, borderRadius: radii.pill },
  replyBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.55)',
    backgroundColor: 'rgba(34, 211, 197, 0.08)',
  },
  replyText: { color: colors.primary, fontSize: 12, fontFamily: fonts.semi },
  part: { marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  partMore: { marginTop: 4, fontSize: 11, fontFamily: fonts.semi, opacity: 0.7 },
  partNo: { fontSize: 10, fontFamily: fonts.extra, opacity: 0.6 },
  mention: { color: colors.accent, fontWeight: '800' },
  mentionedTag: { alignSelf: 'flex-end', color: colors.accent, fontSize: 11, fontStyle: 'italic', marginTop: -4 },
  eventAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  eventBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: 4,
  },
  eventText: { flex: 1, gap: 2 },
  eventImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, marginTop: spacing.sm },
  eventTitle: { fontSize: fontSizes.sm, fontWeight: '800' },
  eventLink: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  count: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700', minWidth: 14 },
  countLiked: { color: colors.danger },
  pressed: { opacity: 0.7 },
});
