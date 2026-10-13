import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedRulesPopup } from '@/components/FeedRulesPopup';
import { FriendsSheet } from '@/components/FriendsSheet';
import { ContentActions, type ContentResult, type ContentTarget } from '@/components/ContentActions';
import { ImageSlot } from '@/components/ImageSlot';
import { PostCard } from '@/components/PostCard';
import { useSponsorMenu } from '@/components/useSponsorMenu';
import { InlineComposer } from '@/components/InlineComposer';
import { MiniHexPicker } from '@/components/MiniHexPicker';
import { PostDetail } from '@/components/PostDetail';
import { DmInbox } from '@/components/DirectMessages';
import { dmUnreadCount } from '@/lib/dm';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SoftGlow } from '@/components/SoftGlow';
import { useAuth } from '@/lib/auth';
import {
  displayName,
  getPost,
  listFeed,
  listFeedDistricts,
  PAGE_SIZE,
  postsRequireSubscription,
  reactToPost,
  THREAD_MAX,
  toggleLike,
  type FeedDistrict,
  type Post,
  type Reaction,
} from '@/lib/feed';
import { cellName } from '@/lib/cellNames';
import { districtOf, isLand, type Cell } from '@/lib/hex';
import { imageAspect } from '@/lib/images';
import { locateMyCell, myCellNow, nearCell, useMyCell } from '@/lib/myCell';
import { isFuture, isSubscriptionActive } from '@/lib/labels';
import { useNotices } from '@/lib/notices';
import { isBackendReady } from '@/lib/supabase';
import { useTabResetKey } from '@/lib/tabReset';
import { brand, colors, fonts, fontSizes, isLight, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/**
 * Bir kez işlenen yönlendirme bilgileri (petek akışı, bahsedilme, gönderi, mesaj). Sekmeden ayrılınca ekran baştan
 * kurulur ama adresteki bilgiler kalır; burada işaretlenen bilgi ikinci kez uygulanmaz, böylece süzgeç sıfırlanır.
 */
const consumedKeys = new Set<string>();
function takeFresh(key: string | null): string | null {
  if (!key || consumedKeys.has(key)) return null;
  consumedKeys.add(key);
  return key;
}

/** Sekmeden ayrılınca ekran baştan kurulur (açık pencereler kapanır, seçimler sıfırlanır) */
export default function FeedScreenTab() {
  const resetKey = useTabResetKey('akis');
  return <FeedScreen key={resetKey} />;
}

function FeedScreen() {
  const { profile, refreshProfile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const isSponsor = profile?.role === 'sponsor';
  const sponsorMenu = useSponsorMenu(isModerator);
  const subscribed = isSubscriptionActive(profile?.premium_until);
  const muted = isFuture(profile?.muted_until);

  const [requiresSubscription, setRequiresSubscription] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Listede olmayan, tek başına açılan gönderi (rumuz profilinden) */
  const [extraPost, setExtraPost] = useState<Post | null>(null);
  const [target, setTarget] = useState<ContentTarget | null>(null);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  // Süzgeç: yalnızca benim gönderilerim ve/veya yalnızca seçilen ilçenin (konumlu) gönderileri
  const [mine, setMine] = useState(false);
  const [mentions, setMentions] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; alias: string } | null>(null);
  /** Zincir: kendi gönderime devam ekleniyor */
  const [threadOf, setThreadOf] = useState<{ id: string; part: number } | null>(null);
  const reactLock = useRef(false);
  const [district, setDistrict] = useState<string | null>(null);
  const [districts, setDistricts] = useState<FeedDistrict[]>([]);
  /** Huni: süzgeç penceresi; sağdaki düğme: topluluk kuralları */
  const [filterOpen, setFilterOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const notices = useNotices();
  // Petek akışı: yakınımdaki petekler (bulunduğum + yanındaki 6) ya da bunlardan biri
  const [near, setNear] = useState(false);
  const [cellFilter, setCellFilter] = useState<Cell | null>(null);
  const myCell = useMyCell();
  const [appliedParam, setAppliedParam] = useState<string | null>(null);
  const [appliedMention, setAppliedMention] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const likeLock = useRef(false);
  const moreLock = useRef(false);
  const loadId = useRef(0);

  // Yeni gönderi, yorum ve beğeni herkese açıktır (susturulmamışsa); moderatör ayarıyla gönderi aboneliğe bağlanabilir
  const canPost = !muted && (isModerator || isSponsor || !requiresSubscription || subscribed);
  const canComment = !muted;

  const load = useCallback(async () => {
    if (!isBackendReady) {
      setLoaded(true);
      return;
    }
    const my = ++loadId.current;
    const here = myCellNow();
    const cellMode = near || cellFilter !== null;
    if (cellMode && (!here || (cellFilter && !nearCell(here, cellFilter)))) {
      // Konum yok ya da peteğe uzak: petek akışı gösterilmez
      setPosts([]);
      setHasMore(false);
      setLoadError(null);
      setLoaded(true);
      return;
    }
    const [feed, needsSubscription, ds] = await Promise.all([
      listFeed(undefined, feedFilter(here)),
      postsRequireSubscription(),
      listFeedDistricts(),
    ]);
    if (my !== loadId.current) return; // daha yeni bir yenileme başladı, eski cevap yok sayılır
    setRequiresSubscription(needsSubscription);
    setLoadError(feed.error);
    if (!ds.error) setDistricts(ds.data);
    if (!feed.error) {
      setPosts(feed.data);
      setHasMore(feed.data.length >= PAGE_SIZE);
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feedFilter bu durumlardan türetilir
  }, [mine, district, mentions, near, cellFilter]);

  function feedFilter(here: Cell | null) {
    if (near || cellFilter) return { cell: cellFilter, near: !cellFilter, my: here };
    return { mine, district, mentions };
  }

  // Haritadaki petek menüsündeki “Petek akışı” bir petek gönderir: akış o peteğe süzülür
  const params = useLocalSearchParams<{
    cq?: string;
    cr?: string;
    t?: string;
    m?: string;
    post?: string;
    dm?: string;
  }>();
  // Özel mesajlar: bildirim, rumuz profili ya da arkadaş listesi bir yazışma gönderir; mesaj kutusu o sohbetle açılır
  const dmKey = params.dm ? `${params.dm},${params.t ?? ''}` : null;
  const [appliedDm, setAppliedDm] = useState<string | null>(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [dmUnread, setDmUnread] = useState(0);
  if (dmKey !== appliedDm) {
    setAppliedDm(dmKey);
    if (takeFresh(dmKey ? `dm:${dmKey}` : null) && params.dm) {
      setDmTarget(params.dm);
      setDmOpen(true);
    }
  }
  // Rumuz profilinden bir gönderiye gidildi: gönderi tek başına okunup penceresi açılır
  const postKey = params.post ? `${params.post},${params.t ?? ''}` : null;
  useEffect(() => {
    if (!takeFresh(postKey ? `post:${postKey}` : null) || !postKey) return;
    const id = postKey.split(',')[0];
    let alive = true;
    void getPost(id).then((res) => {
      if (!alive) return;
      if (res.data) {
        setExtraPost(res.data);
        setDetailId(res.data.id);
      } else {
        setNotice({ text: res.error ?? 'Bu gönderi artık görünmüyor.', error: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [postKey]);
  // “Senden bahsedildi” bildirimi: akış “Benden bahsedenler” süzgeciyle açılır
  const mentionKey = params.m ?? null;
  if (mentionKey !== appliedMention) {
    setAppliedMention(mentionKey);
    if (takeFresh(mentionKey ? `m:${mentionKey}` : null)) {
      setMine(false);
      setDistrict(null);
      setNear(false);
      setCellFilter(null);
      setMentions(true);
      setPosts([]);
      setHasMore(false);
      setLoaded(false);
    }
  }
  const paramKey = params.cq && params.cr ? `${params.cq},${params.cr},${params.t ?? ''}` : null;
  if (paramKey !== appliedParam) {
    setAppliedParam(paramKey);
    const q = Number(params.cq);
    const r = Number(params.cr);
    if (takeFresh(paramKey ? `cell:${paramKey}` : null) && Number.isInteger(q) && Number.isInteger(r) && isLand(q, r)) {
      setMine(false);
      setMentions(false);
      setDistrict(null);
      setNear(true);
      setCellFilter({ q, r });
      setPosts([]);
      setLoaded(false);
    }
  }

  /** “Yakınımdaki petekler”: konuma bir kez bakılır, sonra mini petek haritasından petek seçilir. */
  async function openPicker() {
    const here = await locateMyCell('cellfeed');
    if (!here) return;
    setPickerOpen(true);
  }

  function openNear(target: Cell | null) {
    setPickerOpen(false);
    setPosts([]);
    setHasMore(false);
    setLoaded(false);
    setMine(false);
    setMentions(false);
    setDistrict(null);
    setNear(true);
    setCellFilter(target);
  }

  function closeNear() {
    setPosts([]);
    setLoaded(false);
    setNear(false);
    setCellFilter(null);
  }

  // Sekmeye her gelindiğinde akış tazelenir
  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshProfile();
      // Mesaj rozeti: okunmamış özel mesaj sayısı (açıkken yarım dakikada bir)
      const tick = () => void dmUnreadCount().then(setDmUnread);
      tick();
      const t = setInterval(tick, 30000);
      return () => clearInterval(t);
    }, [load, refreshProfile]),
  );

  // Bildirim mesajı birkaç saniye sonra kendiliğinden kaybolur
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  /** Süzgeç değişince eski liste hemen kalkar, yenisi yüklenirken “yükleniyor” görünür. */
  function changeFilter(next: { mine?: boolean; district?: string | null; mentions?: boolean }) {
    setPosts([]);
    setHasMore(false);
    setLoaded(false);
    setNear(false);
    setCellFilter(null);
    if (next.mine !== undefined) setMine(next.mine);
    if (next.district !== undefined) setDistrict(next.district);
    if (next.mentions !== undefined) setMentions(next.mentions);
  }

  const filtered = mine || mentions || district !== null || near;
  const cellFar = cellFilter !== null && !nearCell(myCell, cellFilter);
  // Petek modunda yazı o peteğe (ya da bulunduğum peteğe) gider
  const composeCell = near && myCell ? { cell: cellFilter && !cellFar ? cellFilter : myCell, my: myCell } : null;
  /** Süzgeç penceresinden seçim: pencere kapanır, sonra süzgeç uygulanır */
  function pick(fn: () => void, delay = 0) {
    setFilterOpen(false);
    if (delay > 0) setTimeout(fn, delay);
    else fn();
  }
  const activeLabel = [mine ? 'Benim gönderilerim' : null, mentions ? 'Benden bahsedilenler' : null, district]
    .filter(Boolean)
    .join(' · ');

  async function onLoadMore() {
    const last = posts[posts.length - 1];
    if (!last || moreLock.current) return;
    moreLock.current = true;
    setLoadingMore(true);
    const startedAt = loadId.current;
    const res = await listFeed(last.created_at, feedFilter(myCellNow()));
    moreLock.current = false;
    setLoadingMore(false);
    if (startedAt !== loadId.current) return; // bu arada akış yenilendi
    if (res.error) {
      setNotice({ text: res.error, error: true });
      return;
    }
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...res.data.filter((p) => !seen.has(p.id))];
    });
    setHasMore(res.data.length >= PAGE_SIZE);
  }

  const patchPost = useCallback((id: string, patch: Partial<Post>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /** Beğeniyi hemen ekranda değiştirir, sunucu hata verirse geri alır. */
  async function onLike(post: Post) {
    if (likeLock.current) return;
    likeLock.current = true;
    setLikeBusyId(post.id);
    const optimistic = !post.liked;
    patchPost(post.id, {
      liked: optimistic,
      like_count: Math.max(0, post.like_count + (optimistic ? 1 : -1)),
    });
    const res = await toggleLike(post.id);
    if (res.error || res.liked === null) {
      patchPost(post.id, { liked: post.liked, like_count: post.like_count });
      setNotice({ text: res.error ?? 'Beğeni kaydedilemedi.', error: true });
      if (res.error && res.error.includes('artık yok')) void load();
    } else if (res.liked !== optimistic) {
      patchPost(post.id, {
        liked: res.liked,
        like_count: Math.max(0, post.like_count + (res.liked ? 1 : -1)),
      });
    }
    setLikeBusyId(null);
    likeLock.current = false;
  }

  /** Tepki: hemen ekranda değişir, sunucu hata verirse geri alınır. */
  async function onReact(post: Post, kind: Reaction) {
    if (reactLock.current) return;
    reactLock.current = true;
    const before = {
      my_reaction: post.my_reaction ?? null,
      laugh_count: post.laugh_count ?? 0,
      plus_count: post.plus_count ?? 0,
      minus_count: post.minus_count ?? 0,
    };
    const next = before.my_reaction === kind ? null : kind;
    const counts = { laugh: before.laugh_count, plus: before.plus_count, minus: before.minus_count };
    if (before.my_reaction) counts[before.my_reaction] = Math.max(0, counts[before.my_reaction] - 1);
    if (next) counts[next] += 1;
    patchPost(post.id, {
      my_reaction: next,
      laugh_count: counts.laugh,
      plus_count: counts.plus,
      minus_count: counts.minus,
    });
    const res = await reactToPost(post.id, kind);
    if (res.error) {
      patchPost(post.id, before);
      setNotice({ text: res.error, error: true });
    }
    reactLock.current = false;
  }

  /** Kendi gönderime zincir devamı: petek gönderisiyse o peteğin yakınında olmak gerekir */
  function onThread(id: string) {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const parts = (p.thread?.length ?? 0) + 1;
    if (parts >= THREAD_MAX) return setNotice({ text: 'Bu zincir dolu (en çok 5 parça).', error: true });
    if (p.cell_q != null && p.cell_r != null && !composeCell) {
      return setNotice({ text: 'Petek gönderisine devam eklemek için o peteğin yakınında olmalısın.', error: true });
    }
    setReplyTo(null);
    setThreadOf({ id: p.id, part: parts + 1 });
  }

  function onReply(p: Post) {
    setThreadOf(null);
    // Petek gönderisine cevap aynı petekte yazılır
    if (
      p.cell_q != null &&
      p.cell_r != null &&
      !(cellFilter && cellFilter.q === p.cell_q && cellFilter.r === p.cell_r)
    ) {
      setCellFilter({ q: p.cell_q, r: p.cell_r });
    }
    setReplyTo({ id: p.id, alias: p.alias });
  }

  function onContentDone(result: ContentResult, message: string) {
    if (!target) return;
    setNotice({ text: message, error: false });
    if (result === 'hidden') patchPost(target.id, { is_hidden: true });
    else if (result === 'unhidden') patchPost(target.id, { is_hidden: false });
    else if (result === 'deleted') setPosts((prev) => prev.filter((p) => p.id !== target.id));
    else if (result === 'blocked' || result === 'friend') void load();
  }

  const detailPost = detailId
    ? (posts.find((p) => p.id === detailId) ?? (extraPost?.id === detailId ? extraPost : null))
    : null;

  const mutedText = 'Hesabın geçici olarak susturuldu. Bu sürede yazamazsın, okuyabilirsin.';
  const lockText = muted ? mutedText : 'Yeni gönderi paylaşmak abonelere özel. Yorum yazabilir ve beğenebilirsin.';

  return (
    <Screen
      title={brand.name}
      header={
        <View style={styles.hdr} accessibilityRole="header" accessibilityLabel={brand.name}>
          {profile ? (
            <Pressable
              onPress={() => setFilterOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={filtered ? `Akışı süz, şu an: ${activeLabel || 'petek akışı'}` : 'Akışı süz'}
              hitSlop={6}
              testID="feed-filter-open"
              style={({ pressed }) => [styles.hdrBtn, filtered && styles.hdrBtnOn, pressed && styles.pressed]}
            >
              <Ionicons name={filtered ? 'funnel' : 'funnel-outline'} size={19} color={colors.primary} />
            </Pressable>
          ) : (
            <View style={styles.hdrSpacer} />
          )}
          {profile && !isSponsor ? (
            <Pressable
              onPress={() => setRulesOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Topluluk ve yazışma kuralları"
              hitSlop={6}
              testID="feed-rules-open"
              style={({ pressed }) => [styles.hdrBtn, styles.hdrBtnRules, pressed && styles.pressed]}
            >
              <Ionicons name="document-text-outline" size={19} color={colors.highlight} />
            </Pressable>
          ) : null}
          <View style={styles.hdrLogo}>
            {/* Logonun arkasında temaya uygun hafif ışık (kenarları tamamen saydam: köşe görünmez) */}
            <SoftGlow width={104} height={76} color={colors.primary} opacity={isLight ? 0.14 : 0.2} />
            {/* Yazısız logo (41 + kule); iki yandaki düğme sayısı eşit olduğu için tam ortada durur */}
            <ImageSlot name="logoMark" style={{ height: 72, aspectRatio: imageAspect.logoMark }} />
          </View>
          {profile && !isSponsor ? (
            <Pressable
              onPress={() => {
                setDmTarget(null);
                setDmOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={dmUnread > 0 ? `Mesajlar, ${dmUnread} okunmamış` : 'Mesajlar'}
              hitSlop={6}
              testID="feed-dm-open"
              style={({ pressed }) => [styles.hdrBtn, dmUnread > 0 && styles.hdrBtnOn, pressed && styles.pressed]}
            >
              <Ionicons name={dmUnread > 0 ? 'chatbubbles' : 'chatbubbles-outline'} size={19} color={colors.primary} />
              {dmUnread > 0 ? (
                <View style={styles.dmBadge}>
                  <Text style={styles.dmBadgeText}>{dmUnread > 9 ? '9+' : dmUnread}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {profile && !isSponsor ? (
            <Pressable
              onPress={() => setFriendsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={
                notices.friendRequests > 0
                  ? `Arkadaşlarım, ${notices.friendRequests} yeni arkadaşlık isteği`
                  : 'Arkadaşlarım'
              }
              hitSlop={6}
              testID="feed-friends-open"
              style={({ pressed }) => [
                styles.hdrBtn,
                notices.friendRequests > 0 && styles.hdrBtnOn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={notices.friendRequests > 0 ? 'people' : 'people-outline'} size={19} color={colors.primary} />
              {notices.friendRequests > 0 ? (
                <View style={styles.dmBadge}>
                  <Text style={styles.dmBadgeText}>{notices.friendRequests > 9 ? '9+' : notices.friendRequests}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setRulesOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Topluluk ve yazışma kuralları"
              hitSlop={6}
              testID="feed-rules-open"
              style={({ pressed }) => [styles.hdrBtn, styles.hdrBtnRules, pressed && styles.pressed]}
            >
              <Ionicons name="document-text-outline" size={19} color={colors.highlight} />
            </Pressable>
          )}
        </View>
      }
      floatingFooter
      onRefresh={onRefresh}
      refreshing={refreshing}
      footer={
        profile && canPost && !(near && (!myCell || cellFar)) ? (
          <InlineComposer
            alias={profile.role === 'sponsor' ? profile.full_name : profile.alias}
            isSponsor={profile.role === 'sponsor'}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            threadOf={threadOf}
            onClearThread={() => setThreadOf(null)}
            cell={composeCell}
            cellLabel={composeCell ? `${cellName(composeCell.cell)} peteğine yazıyorsun` : null}
            onCreated={() => {
              setNotice({ text: 'Gönderin yayınlandı.', error: false });
              void load();
            }}
            onError={(m) => setNotice({ text: m, error: true })}
          />
        ) : undefined
      }
      overlay={
        <>
          <PostDetail
            post={detailPost}
            canWrite={canComment}
            writeLockText={mutedText}
            isModerator={isModerator}
            likeBusy={detailPost ? likeBusyId === detailPost.id : false}
            onClose={() => setDetailId(null)}
            onLike={(p) => void onLike(p)}
            onCommentDelta={(id, delta) =>
              setPosts((prev) =>
                prev.map((p) => (p.id === id ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p)),
              )
            }
            onPostPatch={patchPost}
            onPostGone={(id, result, message) => {
              setDetailId(null);
              setNotice({ text: message, error: false });
              if (result === 'deleted') setPosts((prev) => prev.filter((p) => p.id !== id));
              else void load();
            }}
            onAuthorBlocked={() => void load()}
          />
          {sponsorMenu.isOpen ? (
            sponsorMenu.nodes
          ) : target ? (
            <ContentActions
              key={`${target.type}:${target.id}`}
              target={target}
              isModerator={isModerator}
              onClose={() => setTarget(null)}
              onDone={onContentDone}
              onError={(m) => setNotice({ text: m, error: true })}
              onThread={onThread}
            />
          ) : null}
          {profile && !isSponsor ? (
            <DmInbox
              visible={dmOpen}
              openId={dmTarget}
              subscribed={subscribed}
              onClose={() => {
                setDmOpen(false);
                setDmTarget(null);
                void dmUnreadCount().then(setDmUnread);
              }}
              onUnread={setDmUnread}
            />
          ) : null}
          {friendsOpen ? <FriendsSheet onClose={() => setFriendsOpen(false)} /> : null}
        </>
      }
    >
      {__DEV__ && !isBackendReady ? (
        <View style={styles.devBanner}>
          <Ionicons name="construct-outline" size={18} color={colors.primary} />
          <Text style={styles.devBannerText}>
            Sunucu bağlantısı henüz kurulmadı. KURULUM_REHBERI.md dosyasındaki adımları tamamlayınca burası canlı akışla
            dolacak.
          </Text>
        </View>
      ) : null}

      {/* Yeni gönderi kutusu ekranın en altındadır; yazamayan için açıklama */}
      {profile ? (
        canPost ? null : (
          <View style={styles.lockCard}>
            <Ionicons name="lock-closed" size={20} color={colors.textMuted} />
            <View style={styles.lockBody}>
              <Text style={styles.lockText}>{lockText}</Text>
              {!muted ? (
                <Text style={styles.lockLink} accessibilityRole="button" onPress={() => router.push('/abonelik')}>
                  Aboneliği incele
                </Text>
              ) : null}
            </View>
          </View>
        )
      ) : null}

      {/* Etkin süzgeç (huniden seçilen): dokununca süzgeç penceresi açılır, çarpı ile temizlenir */}
      {profile && filtered && !near ? (
        <View style={styles.activeRow} testID="feed-filters">
          <FilterChip label={activeLabel} icon="funnel" active onPress={() => setFilterOpen(true)} />
          <Pressable
            onPress={() => changeFilter({ mine: false, district: null, mentions: false })}
            accessibilityRole="button"
            accessibilityLabel="Süzgeci temizle"
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {filterOpen ? (
        <Popup
          title="Akışı süz"
          subtitle="Hangi gönderileri görmek istersin?"
          icon="funnel"
          onClose={() => setFilterOpen(false)}
          testID="feed-filter-popup"
        >
          <FilterRow
            icon="albums"
            label="Tümü"
            active={!filtered}
            onPress={() => pick(() => filtered && changeFilter({ mine: false, district: null, mentions: false }))}
            testID="filter-all"
          />
          <FilterRow
            icon="person"
            label="Benim gönderilerim"
            active={mine}
            onPress={() => pick(() => changeFilter({ mine: !mine }))}
            testID="filter-mine"
          />
          <FilterRow
            icon="at"
            label="Benden bahsedilenler"
            active={mentions}
            onPress={() => pick(() => changeFilter({ mentions: !mentions }))}
            testID="filter-mentions"
          />
          {!isSponsor ? (
            <FilterRow
              icon="grid"
              label="Yakınımdaki petekler"
              sub="Bulunduğun ve yanındaki peteklerin akışı"
              active={near}
              onPress={() => pick(() => (near ? closeNear() : void openPicker()), near ? 0 : 350)}
              testID="filter-near"
            />
          ) : null}
          {districts.length > 0 || district !== null ? (
            <>
              <Text style={styles.popSection}>İlçeye göre (yer eklenmiş gönderiler)</Text>
              <View style={styles.popChips}>
                <FilterChip
                  label="Tüm ilçeler"
                  active={district === null}
                  onPress={() => pick(() => district !== null && changeFilter({ district: null }))}
                  testID="filter-district"
                />
                {districts.map((d) => (
                  <FilterChip
                    key={d.district}
                    label={`${d.district} · ${d.post_count}`}
                    icon="location"
                    active={d.district === district}
                    onPress={() => pick(() => d.district !== district && changeFilter({ district: d.district }))}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Popup>
      ) : null}
      {rulesOpen ? <FeedRulesPopup onClose={() => setRulesOpen(false)} /> : null}

      {/* Petek akışı: yakınımdaki peteklerin adları; biri seçilince en üstte “Peteği haritada gör” */}
      {near ? (
        <View style={styles.cellBox} testID="feed-cells">
          <FilterChip
            label={cellFilter ? `${cellName(cellFilter)} · değiştir` : 'Yakınımdaki tüm petekler · petek seç'}
            icon="grid-outline"
            active
            caret
            onPress={() => void openPicker()}
            testID="feed-cell-pick"
          />
          {cellFilter ? (
            <Pressable
              onPress={() =>
                router.navigate({
                  pathname: '/',
                  params: { q: String(cellFilter.q), r: String(cellFilter.r), t: String(Date.now()) },
                })
              }
              accessibilityRole="button"
              testID="feed-cell-map"
              style={({ pressed }) => [styles.cellMap, pressed && styles.pressed]}
            >
              <Ionicons name="map" size={18} color={colors.primary} />
              <View style={styles.cellMapText}>
                <Text style={styles.cellMapTitle} numberOfLines={1}>
                  {cellName(cellFilter)}
                </Text>
                <Text
                  style={styles.cellMapSub}
                >{`${districtOf(cellFilter.q, cellFilter.r) ?? 'Kocaeli'} · Peteği haritada gör`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {cellFar ? (
            <View style={styles.farBox}>
              <Text style={styles.stateText}>
                Bu peteğin akışını görmek ve yazmak için peteğin içinde ya da hemen yanında olmalısın.
              </Text>
              <PrimaryButton
                label="Konumumu kontrol et"
                variant="ghost"
                onPress={() => {
                  void locateMyCell('cellfeed', false).then(() => {
                    setLoaded(false);
                    void load();
                  });
                }}
              />
            </View>
          ) : (
            <Text style={styles.cellNote}>
              Petek akışını yalnızca peteğin içinde ya da hemen yanında olanlar görür ve yazar. Gönderilerin rumuzunla
              görünür.
            </Text>
          )}
        </View>
      ) : null}

      <MiniHexPicker
        visible={pickerOpen}
        my={myCell}
        selected={cellFilter}
        onPick={openNear}
        onClose={() => setPickerOpen(false)}
      />

      {notice ? (
        <Text
          style={[styles.notice, notice.error ? styles.noticeError : styles.noticeOk]}
          accessibilityLiveRegion="polite"
        >
          {notice.text}
        </Text>
      ) : null}

      {/* Liste */}
      {!loaded ? (
        <Text style={styles.muted}>Akış yükleniyor…</Text>
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{loadError}</Text>
          <PrimaryButton label="Tekrar dene" onPress={() => void onRefresh()} variant="ghost" />
        </View>
      ) : posts.length === 0 && filtered ? (
        <View style={styles.stateBox} testID="feed-filter-empty">
          <Ionicons name="funnel-outline" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Bu süzgeçte gönderi yok</Text>
          <Text style={styles.stateText}>
            {near
              ? 'Bu petek akışında henüz gönderi yok. İlk gönderiyi sen yaz.'
              : mentions
                ? 'Henüz kimse senden bahsetmedi (seni @rumuzunla etiketlemedi ya da gönderine cevap yazmadı).'
                : mine && district
                  ? `${district} bölgesinde yer eklediğin bir gönderin yok.`
                  : mine
                    ? 'Henüz bir gönderi paylaşmadın.'
                    : `${district} bölgesinden yer eklenmiş gönderi yok.`}
          </Text>
          <PrimaryButton
            label="Süzgeci temizle"
            variant="ghost"
            onPress={() => changeFilter({ mine: false, district: null, mentions: false })}
          />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <ImageSlot name="emptyFeed" style={styles.emptyImage} />
          <Text style={styles.emptyTitle}>Henüz gönderi yok</Text>
          <Text style={styles.emptyText}>
            {canPost ? 'İlk gönderiyi sen paylaş.' : 'İlk gönderi geldiğinde burada rumuzlarla akacak.'}
          </Text>
        </View>
      ) : (
        <>
          {posts.map((p, i) => (
            <View key={p.id} style={i > 0 ? styles.postDivider : undefined}>
              <PostCard
                post={p}
                likeBusy={likeBusyId === p.id}
                onLike={() => void onLike(p)}
                onReact={(k) => void onReact(p, k)}
                onReply={canPost ? () => onReply(p) : undefined}
                onOpen={() => setDetailId(p.id)}
                onSponsor={sponsorMenu.open}
                onMenu={(at) => setTarget({ ...postTarget(p), anchor: at })}
                onAlias={(at) => setTarget({ ...postTarget(p), anchor: at })}
                maxParts={2}
              />
            </View>
          ))}
          {hasMore ? (
            <PrimaryButton
              label="Daha eski gönderiler"
              variant="ghost"
              onPress={() => void onLoadMore()}
              loading={loadingMore}
            />
          ) : (
            <Text style={styles.muted}>Bu haftanın gönderileri bu kadar. Akış her Pazartesi 00:00’da sıfırlanır.</Text>
          )}
        </>
      )}
    </Screen>
  );
}

/** Gönderi menüsünün hedefi: profil (rumuz profili) ve zincir seçenekleriyle */
function postTarget(p: Post): ContentTarget {
  return {
    type: 'post',
    id: p.id,
    alias: displayName(p),
    is_mine: p.is_mine,
    is_hidden: p.is_hidden,
    is_friend: p.author_name !== null || !!p.sponsor_id,
    profile: !p.sponsor_id && !p.event_id && p.alias !== 'Kat Görevlisi',
    can_thread: p.is_mine && !p.event_id && !p.sponsor_id && (p.thread?.length ?? 0) + 1 < THREAD_MAX,
  };
}

function FilterRow({
  icon,
  label,
  sub,
  active,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={({ pressed }) => [styles.fRow, active && styles.fRowOn, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={active ? colors.primary : colors.textMuted} />
      <View style={styles.fRowText}>
        <Text style={[styles.fRowLabel, active && styles.fRowLabelOn]}>{label}</Text>
        {sub ? <Text style={styles.fRowSub}>{sub}</Text> : null}
      </View>
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={active ? colors.primary : colors.border}
      />
    </Pressable>
  );
}

function FilterChip({
  label,
  icon,
  active,
  caret = false,
  onPress,
  testID,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  caret?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={12} color={active ? colors.primaryText : colors.textMuted} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {caret ? <Ionicons name="chevron-down" size={12} color={active ? colors.primaryText : colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Ayraç çizgisi artık PostCard'ın alt düğme satırında; burada yalnızca gönderiler arası boşluk kalır
  postDivider: { paddingTop: spacing.xs },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hdrLogo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hdrBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.overlay,
  },
  hdrBtnOn: { borderColor: colors.primary },
  hdrBtnRules: { borderColor: 'rgba(255, 200, 61, 0.6)' },
  hdrSpacer: { width: 40, height: 40 },
  dmBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmBadgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 10 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  popSection: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi, marginTop: spacing.sm },
  popChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fRowOn: { borderColor: colors.primary },
  fRowText: { flex: 1, gap: 2 },
  fRowLabel: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  fRowLabelOn: { color: colors.primary },
  fRowSub: { color: colors.textMuted, fontSize: 11 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    maxWidth: '100%',
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { flexShrink: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  chipTextActive: { color: colors.primaryText },
  devBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  devBannerText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  cellBox: { gap: spacing.sm },
  cellMap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cellMapText: { flex: 1, gap: 2 },
  cellMapTitle: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  cellMapSub: { color: colors.textMuted, fontSize: fontSizes.xs },
  cellNote: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  farBox: { gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.md },
  pressed: { opacity: 0.8 },
  lockCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  lockBody: { flex: 1, gap: spacing.xs },
  lockText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  lockLink: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  notice: { fontSize: fontSizes.sm, lineHeight: 20 },
  noticeError: { color: colors.danger },
  noticeOk: { color: colors.success },
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  stateBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  stateText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyImage: { width: 260, aspectRatio: imageAspect.emptyFeed },
  emptyTitle: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
});
