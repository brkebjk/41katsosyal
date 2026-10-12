import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { CategoryIcon } from '@/components/CategoryIcon';
import { CategoryTile } from '@/components/CategoryTile';
import { CloseRequestModal } from '@/components/CloseRequestModal';
import { EventCodeModal, type CodeRequest } from '@/components/EventCodeModal';
import { EventComments } from '@/components/EventComments';
import { SponsorMark } from '@/components/SponsorMark';
import { useSponsorMenu } from '@/components/useSponsorMenu';
import { useRoomActions } from '@/components/useRoomActions';
import { EventForm } from '@/components/EventForm';
import { EventPointsModal } from '@/components/EventPointsModal';
import { GameActionButton } from '@/components/GameActionButton';
import { HexGauge } from '@/components/HexGauge';
import { LeaderApplySheet } from '@/components/LeaderApplySheet';
import { LinearGradient } from 'expo-linear-gradient';
import { MyEventsSheet } from '@/components/MyEventsSheet';
import { AttendedEventsSheet } from '@/components/AttendedEventsSheet';
import { CheckinListPopup } from '@/components/CheckinListPopup';
import { useSafetyMenu } from '@/components/SafetyMenu';
import { TeamSheet } from '@/components/TeamSheet';
import { NoticeDot } from '@/components/NoticeDot';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { TitleBadge } from '@/components/TitleBadge';
import { useAuth } from '@/lib/auth';
import { districtOf } from '@/lib/hex';
import { confirmAction, notify } from '@/lib/dialog';
import { gameButtonImages } from '@/lib/images';
import { shareEventToFeed } from '@/lib/feed';
import { multiplierText, setTeamSeeking, teamMultiplier } from '@/lib/invites';
import { confirmMeetupSafety } from '@/lib/safety';
import { eventImageUrl } from '@/lib/eventImage';
import { eventGaugeAction } from '@/lib/eventQuota';
import { locateMyCell } from '@/lib/myCell';
import { ShareCooldownModal } from '@/components/ShareCooldownModal';
import {
  EVENT_TAGS,
  eventShareWait,
  hostCloseEvent,
  setEventTag,
  attendeeCount,
  cancelRegistration,
  getQuota,
  listEvents,
  pointsNoteText,
  registerForEvent,
  removeEvent,
  toggleEventLike,
  type EventItem,
  type Quota,
} from '@/lib/events';
import { syncEventReminders } from '@/lib/localNotify';
import { EVENT_CATEGORIES, ageText, categoryInfo, type EventCategory } from '@/lib/eventCategories';
import {
  DAY_SHORT,
  MONTH_SHORT,
  formatMoney,
  formatTime,
  formatWhen,
  isFuture,
  isSubscriptionActive,
} from '@/lib/labels';
import { refreshNotices } from '@/lib/notices';
import { DEFAULT_RULES, getPointRules } from '@/lib/ranking';
import { isBackendReady } from '@/lib/supabase';
import { useTabResetKey } from '@/lib/tabReset';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Şu anki zaman (olay işleyicilerinde) */
const nowMs = () => Date.now();

/** Ön kayıt yaptığım etkinliğin başlamasına kalan süre (30 saniyede bir güncellenir). */
function StartCountdown({ starts }: { starts: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(0, Math.floor((starts.getTime() - now) / 60000));
  if (mins <= 0) return null;
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const text = d > 0 ? `${d} gün ${h} sa` : h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
  return (
    <View style={styles.countdown} accessibilityLabel={`Başlamasına ${text}`}>
      <Ionicons name="hourglass-outline" size={13} color={colors.event} />
      <Text style={styles.countdownText}>{`Başlamasına ${text}`}</Text>
    </View>
  );
}

const CONCERT_RULES =
  'Konser & Festival kuralları: etkinlik moderatör onayından sonra yayınlanır. Katılım kodu otomatik oluşur ve katıl diyenler kodu kendisi görür. Kod, başlamadan 5 dakika önceden başlangıçtan 45 dakika sonrasına kadar girilir (etkinlik alanında, konumla). Etkinlik başlangıçtan 2 saat sonra listeden kalkar.';

/** Bir kez işlenen “Etkinliği gör” yönlendirmeleri (sekme yeniden kurulunca tekrar uygulanmaz) */
const consumedEventKeys = new Set<string>();

/** Sekmeden ayrılınca ekran baştan kurulur (açık pencereler kapanır, seçimler sıfırlanır) */
export default function EventsScreenTab() {
  const resetKey = useTabResetKey('events');
  return <EventsScreen key={resetKey} />;
}

function EventsScreen() {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  // null = kategori kutuları, 'all' = Keşfet (tüm etkinlikler), diğerleri = bir kategori
  const [category, setCategory] = useState<EventCategory | 'all' | 'team' | null>(null);
  // Haritadan “Etkinliği gör”: yalnızca o etkinlik açık (genişletilmiş) gösterilir
  const params = useLocalSearchParams<{ ev?: string; t?: string }>();
  const evKey = params.ev ? `${params.ev},${params.t ?? ''}` : null;
  const [appliedEv, setAppliedEv] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  if (evKey !== appliedEv) {
    setAppliedEv(evKey);
    if (evKey && params.ev && !consumedEventKeys.has(evKey)) {
      consumedEventKeys.add(evKey);
      setFocusId(params.ev);
    }
  }
  const [myOpen, setMyOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [attendedOpen, setAttendedOpen] = useState(false);
  const [shareWait, setShareWait] = useState<{ seconds: number; title: string; at: number } | null>(null);
  const [concertInfo, setConcertInfo] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Form her açılışta boş başlasın diye açılışta yeniden oluşturulur
  const [formKey, setFormKey] = useState(0);
  const [commentsFor, setCommentsFor] = useState<{ id: string; title: string } | null>(null);
  const [codeReq, setCodeReq] = useState<CodeRequest | null>(null);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [closeFor, setCloseFor] = useState<{ id: string; title: string } | null>(null);
  const [teamFor, setTeamFor] = useState<EventItem | null>(null);
  const [safetyFor, setSafetyFor] = useState<string | null>(null);
  const [joinListOpen, setJoinListOpen] = useState(false);
  const safety = useSafetyMenu(safetyFor ? { type: 'event', id: safetyFor } : null);
  // Puanların açılması için gereken en az kişi (sunucu ayarından; kartlardaki “bekliyor” notunda kullanılır)
  const [minAttendees, setMinAttendees] = useState(DEFAULT_RULES.eventMinAttendees);

  useEffect(() => {
    let active = true;
    void getPointRules().then((r) => {
      if (active) setMinAttendees(Math.max(1, r.eventMinAttendees));
    });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    // Sunucu bağlı değilken (önizleme) hata göstermek yerine boş liste gösterilir
    if (!isBackendReady) {
      setLoaded(true);
      return;
    }
    const [list, q] = await Promise.all([listEvents(), getQuota()]);
    setLoadError(list.error);
    if (!list.error) setEvents(list.data);
    if (q.data) setQuota(q.data);
    setLoaded(true);
    // Sekmedeki kırmızı nokta da güncel kalsın (kod girilince ya da etkinlik kalkınca kaybolur)
    void refreshNotices();
  }, []);

  // Sekmeye her gelindiğinde liste tazelenir
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Android'in geri tuşu: bir kategorinin içindeyken uygulamadan çıkmak yerine kategori listesine döner
  useFocusEffect(
    useCallback(() => {
      if (category === null && focusId === null) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (focusId !== null) setFocusId(null);
        else setCategory(null);
        return true;
      });
      return () => sub.remove();
    }, [category, focusId]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function run(id: string, action: () => Promise<{ error: string | null }>, okText: string) {
    setBusyId(id);
    setNotice(null);
    const result = await action();
    setBusyId(null);
    setNotice(result.error ? { text: result.error, error: true } : { text: okText, error: false });
    await load();
    // Kayıt iptal edilince / etkinlik kapanınca hatırlatma kalkar
    if (!result.error) void syncEventReminders();
  }

  async function onJoin(ev: EventItem) {
    if (ev.min_age > 0) {
      const ok = await confirmAction(
        'Yaş sınırı',
        `Bu etkinlik ${ev.min_age} yaş ve üzeri içindir. ${ev.min_age} yaşından büyük olduğunu onaylıyor musun?`,
        'Onaylıyorum, katıl',
      );
      if (!ok) return;
    }
    // Tanımadığın kişilerle buluşma uyarısı ve sorumluluk notu
    if (!(await confirmMeetupSafety('event'))) return;
    setBusyId(ev.id);
    setNotice(null);
    const res = await registerForEvent(ev.id);
    setBusyId(null);
    if (res.error) {
      setNotice({ text: res.error, error: true });
      return;
    }
    await load();
    void syncEventReminders();
    await notify(
      'Katılımın kaydedildi',
      'Etkinlik başlamadan 30 dakika önce telefonuna hatırlatma gelir (bildirim izni ve hatırlatma tercihi açıksa).\n\nKatılım kodu girişi etkinlik başlamadan 5 dakika önce açılır. Etkinlik yerinde düzenleyenin söylediği kodu girdiğinde katılımın doğrulanır ve puan kazanırsın.\n\nYalnız mı geliyorsun? Etkinlik kartındaki “Ekip arıyorum”u açarak ekip kurabilirsin; ekipçe gelenler daha çok puan kazanır.',
      { icon: 'checkmark-circle', tone: 'success' },
    );
  }

  /** Katılım kodu penceresi: önce güvenlik uyarısı */
  async function openAttendeeCode(ev: { id: string; title: string; category?: string }) {
    if (!(await confirmMeetupSafety('event'))) return;
    setCodeReq({ mode: 'attendee', event: { id: ev.id, title: ev.title, category: ev.category } });
  }

  /** Etkinliği akışta paylaş (düzenleyen; başlamasına 1 saat kala). Paylaşım gerçek adla görünür. */
  async function onShare(ev: EventItem) {
    const wait = await eventShareWait(ev.id);
    if (wait > 0) {
      setShareWait({ seconds: wait, title: ev.title, at: nowMs() });
      return;
    }
    const ok = await confirmAction(
      'Akışta paylaş',
      `“${ev.title}” akışta bir gönderi olarak görünecek; dokunan Etkinlikler sekmesine gider. Daha önce paylaştıysan eski paylaşım silinir. 5 dakikada bir paylaşabilirsin.`,
      'Paylaş',
      false,
      {
        icon: 'megaphone',
        warning: 'Etkinlik paylaşımı rumuzla değil, etkinlikte düzenleyen olarak görünen gerçek adınla yayınlanır.',
      },
    );
    if (!ok) return;
    await run(ev.id, () => shareEventToFeed(ev.id), 'Etkinliğin akışta paylaşıldı.');
  }

  /** Düzenleyen etkinliği bitirir: konuma bir kez bakılır (etkinlik peteğinde olmalı) */
  async function onHostClose(ev: EventItem) {
    const ok = await confirmAction(
      'Etkinliği bitir',
      `“${ev.title}” kapanır ve listeden kalkar; artık kod girilemez. Puanlar kesinleşir. Kapatmak için etkinliğin peteğinde olmalısın.`,
      'Bitir',
      true,
      { icon: 'flag' },
    );
    if (!ok) return;
    const here = await locateMyCell('event', false);
    if (!here) return;
    await run(ev.id, () => hostCloseEvent(ev.id, here), 'Etkinliğin kapatıldı. Katılanlar artık puanlayabilir.');
  }

  async function onToggleTag(ev: EventItem) {
    const next = ev.tag ? null : 'tanitim_isbirligi';
    await run(ev.id, () => setEventTag(ev.id, next), next ? 'Etiket eklendi.' : 'Etiket kaldırıldı.');
  }

  async function onToggleSeeking(ev: EventItem) {
    await run(
      ev.id,
      () => setTeamSeeking(ev.id, !ev.my_seeking),
      ev.my_seeking
        ? 'Ekip aramayı kapattın.'
        : 'Ekip aradığın görünür oldu. Ekip arayanları görmek için “Ekip arayanlar”a dokun.',
    );
  }

  async function onRemove(ev: EventItem) {
    const ok = await confirmAction(
      'Etkinliği kaldır',
      `“${ev.title}” herkesin listesinden kalkar ve kayıtlar iptal olur. Bu işlem geri alınamaz.`,
      'Kaldır',
      true,
    );
    if (ok) await run(ev.id, () => removeEvent(ev.id), 'Etkinlik kaldırıldı.');
  }

  async function onLike(ev: EventItem) {
    if (likeBusyId) return;
    setLikeBusyId(ev.id);
    const res = await toggleEventLike(ev.id);
    setLikeBusyId(null);
    if (res.error || res.liked === null) {
      setNotice({ text: res.error ?? 'Beğeni kaydedilemedi.', error: true });
      return;
    }
    const liked = res.liked;
    setEvents((cur) =>
      cur.map((e) =>
        e.id === ev.id
          ? {
              ...e,
              liked_by_me: liked,
              like_count: Math.max(0, e.like_count + (liked === e.liked_by_me ? 0 : liked ? 1 : -1)),
            }
          : e,
      ),
    );
  }

  const onCommentDelta = (eventId: string, delta: number) =>
    setEvents((cur) =>
      cur.map((e) => (e.id === eventId ? { ...e, comment_count: Math.max(0, e.comment_count + delta) } : e)),
    );

  const isModerator = profile?.role === 'admin' || quota?.is_moderator === true;
  const sponsorMenu = useSponsorMenu(isModerator);
  // Paket 27: oyunlu etkinliğin düzenleyeni etkinlik oyunu açar (oda açma akışı Oyunlar ekranıyla aynı)
  const roomActions = useRoomActions({ isModerator });
  const canComment = !isFuture(profile?.muted_until);
  const limitReached = quota !== null && quota.events_limit !== null && quota.events_used >= quota.events_limit;

  const focused = focusId ? (events.find((e) => e.id === focusId) ?? null) : null;
  const visibleEvents = focused
    ? [focused]
    : category === 'team'
      ? events.filter((e) => (e.team_seekers ?? 0) > 0)
      : category && category !== 'all'
        ? events.filter((e) => e.category === category)
        : events;
  const myEvents = events.filter((e) => e.is_mine);
  const officialEvents = visibleEvents.filter((e) => e.is_official);
  const memberEvents = visibleEvents.filter((e) => !e.is_official);
  const countOf = (key: EventCategory) => events.filter((e) => e.category === key).length;

  // Kategori kutuları: her satırda iki dikdörtgen, aynı hizada ama hafif eğik ve yatayda kaymış
  const gap = spacing.md + 2;
  const contentWidth = Math.min(width, 560) - spacing.lg * 2;
  // Kutular eğik olmadığı için kenar payı gerekmez; biraz daha geniş ve yüksek
  const tileW = Math.floor((contentWidth - gap) / 2);
  const tileH = Math.round(tileW * 0.64);
  const tileRows = EVENT_CATEGORIES.reduce<(typeof EVENT_CATEGORIES)[]>((rows, c, i) => {
    if (i % 2 === 0) rows.push([c]);
    else rows[rows.length - 1].push(c);
    return rows;
  }, []);
  // Kod girişi şu an açık olan, katıldığım ama henüz doğrulamadığım etkinlikler: ekranın üstünde kırmızı uyarı
  const pendingCheckins = events.filter((e) => !e.is_mine && e.is_registered && !e.checked_in && e.checkin_open);
  const renderEvent = (ev: EventItem) => (
    <EventCard
      key={ev.id}
      ev={ev}
      startExpanded={ev.id === focusId}
      busy={busyId === ev.id}
      minAttendees={minAttendees}
      needsCloseRequest={ev.is_mine && !isModerator && ev.close_needs_request}
      onRequestClose={() => setCloseFor({ id: ev.id, title: ev.title })}
      canRemove={ev.is_mine || isModerator}
      isHost={ev.is_mine || (isModerator && ev.is_official)}
      likeBusy={likeBusyId === ev.id}
      onSponsor={sponsorMenu.open}
      onLike={() => void onLike(ev)}
      onComments={() => setCommentsFor({ id: ev.id, title: ev.title })}
      onShowCode={() => setCodeReq({ mode: 'host', event: { id: ev.id, title: ev.title } })}
      onEnterCode={() => void openAttendeeCode(ev)}
      onToggleSeeking={() => void onToggleSeeking(ev)}
      onShare={() => void onShare(ev)}
      onHostClose={() => void onHostClose(ev)}
      onStartGame={() =>
        void roomActions.createEventGame({
          id: ev.id,
          title: ev.title,
          cell: ev.cell_q !== null && ev.cell_r !== null ? { q: ev.cell_q, r: ev.cell_r } : null,
        })
      }
      onOpenRaffle={() => router.push('/cekilis')}
      isModerator={isModerator}
      onToggleTag={() => void onToggleTag(ev)}
      onTeam={() => setTeamFor(ev)}
      onSafety={() => {
        setSafetyFor(ev.id);
        safety.open();
      }}
      onJoin={() => void onJoin(ev)}
      onLeave={() => run(ev.id, () => cancelRegistration(ev.id), 'Katılımın iptal edildi.')}
      onRemove={() => onRemove(ev)}
    />
  );

  return (
    <Screen
      title="Etkinlikler"
      subtitle="Yüz yüze buluşmalar, masa oyunu geceleri"
      onRefresh={onRefresh}
      refreshing={refreshing}
      headerRight={
        quota ? (
          <HexGauge
            remaining={
              quota.is_moderator || quota.is_sponsor || quota.events_limit === null
                ? null
                : Math.max(0, quota.events_limit - quota.events_used)
            }
            limit={quota.events_limit}
            plus={!quota.is_moderator && !quota.is_sponsor && !quota.is_leader && !quota.leader_pending}
            tone="purple"
            kind="etkinlik"
            onPress={() => {
              void eventGaugeAction(quota, isSubscriptionActive(profile?.premium_until)).then((r) => {
                if (r === 'leader') setLeaderOpen(true);
              });
            }}
            testID="events-gauge"
          />
        ) : undefined
      }
      floatingFooter
      // Oluştur (solda) / Katılım Doğrula (sağda): Oyunlar ekranındaki gibi içeriğin üstünde yüzer (arkasında zemin yok)
      footer={
        <View style={styles.topButtons}>
          <GameActionButton
            label="Oluştur"
            sub={limitReached ? 'Bu ayki hakkın bitti' : 'Etkinliğini aç'}
            icon="add-circle"
            colors={['#FF7A59', '#E5533D']}
            edge="#A8361F"
            art={gameButtonImages.create}
            disabled={limitReached || quota === null}
            onPress={() => {
              setFormKey((k) => k + 1);
              setFormOpen(true);
            }}
            testID="events-create"
            compact
          />
          <GameActionButton
            label="Katılım Doğrula"
            sub="Ön kayıt yaptığın etkinlikler"
            icon="enter"
            colors={['#2BC4B4', '#147A8C']}
            edge="#0E5560"
            art={gameButtonImages.join}
            onPress={() => setJoinListOpen(true)}
            testID="events-join"
            compact
          />
        </View>
      }
      overlay={
        <>
          <EventComments
            event={commentsFor}
            canWrite={canComment}
            isModerator={isModerator}
            onClose={() => setCommentsFor(null)}
            onCountDelta={onCommentDelta}
          />
          {sponsorMenu.isOpen ? (
            sponsorMenu.nodes
          ) : attendedOpen ? (
            <AttendedEventsSheet onClose={() => setAttendedOpen(false)} />
          ) : leaderOpen && profile ? (
            <LeaderApplySheet
              initialName={profile.full_name}
              onClose={() => setLeaderOpen(false)}
              onDone={() => {
                setLeaderOpen(false);
                setNotice({
                  text: 'Etkinlik lideri başvurun alındı; moderatör inceleyince bildirim alırsın.',
                  error: false,
                });
                void load();
              }}
            />
          ) : myOpen && profile ? (
            <MyEventsSheet
              userId={profile.id}
              events={myEvents}
              onClose={() => setMyOpen(false)}
              onChanged={() => void load()}
              onOpen={(ev) => {
                setMyOpen(false);
                setCategory(ev.category);
              }}
            />
          ) : safety.isOpen ? (
            safety.nodes
          ) : teamFor ? (
            <TeamSheet
              event={{ id: teamFor.id, title: teamFor.title }}
              myTeamSize={teamFor.my_team_size ?? 0}
              onClose={() => setTeamFor(null)}
              onChanged={() => void load()}
            />
          ) : null}
        </>
      }
    >
      {/* Etkinlik puanları nasıl çalışır: en üstte */}
      <Pressable
        onPress={() => setPointsOpen(true)}
        accessibilityRole="button"
        testID="event-points-link"
        style={({ pressed }) => [styles.pointsPill, pressed && styles.pressed]}
      >
        <Ionicons name="help-circle" size={16} color={colors.highlight} />
        <Text style={styles.pointsPillText}>Etkinlik puanları nasıl çalışır?</Text>
      </Pressable>
      {/* Keşfet (tüm etkinlikler) ve Ekip arayanlar (ekip arayanı olan etkinlikler) */}
      <View style={styles.discoverRow}>
        <Pressable
          onPress={() => setCategory((c) => (c === 'all' ? null : 'all'))}
          accessibilityRole="button"
          accessibilityLabel="Keşfet: tüm etkinlikler"
          testID="events-discover"
          accessibilityState={{ selected: category === 'all' }}
          style={({ pressed }) => [
            styles.discover,
            styles.discoverExplore,
            category === 'all' && styles.discoverOn,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="compass" size={20} color={colors.primaryText} />
          <Text style={styles.discoverText}>Keşfet</Text>
          <View style={styles.discoverBadge}>
            <Text style={styles.discoverCount}>{events.length}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setCategory((c) => (c === 'team' ? null : 'team'))}
          accessibilityRole="button"
          accessibilityLabel="Ekip arayanların olduğu etkinlikler"
          testID="events-team"
          accessibilityState={{ selected: category === 'team' }}
          style={({ pressed }) => [
            styles.discover,
            styles.discoverTeam,
            category === 'team' && styles.discoverOn,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="people" size={20} color={colors.primaryText} />
          <Text style={styles.discoverText} numberOfLines={1}>
            Ekip Bul
          </Text>
          <View style={styles.discoverBadge}>
            <Text style={styles.discoverCount}>{events.filter((e) => (e.team_seekers ?? 0) > 0).length}</Text>
          </View>
        </Pressable>
      </View>

      {/* Etkinliklerim ve Katıldığım etkinlikler */}
      <View style={styles.myRow}>
        <Pressable
          onPress={() => setMyOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Etkinliklerim"
          testID="events-mine"
          style={({ pressed }) => [styles.myCard, pressed && styles.pressed]}
        >
          <View style={[styles.myIcon, { backgroundColor: 'rgba(34, 211, 197, 0.16)' }]}>
            <Ionicons name="albums" size={18} color={colors.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.myCardTitle}>Etkinliklerim</Text>
            <Text style={styles.myCardSub} numberOfLines={1}>
              {myEvents.some((e) => e.approval === 'pending' || e.image_status === 'pending')
                ? 'Onay bekleyen var'
                : `${myEvents.length} yaklaşan`}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setAttendedOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Katıldığım etkinlikler"
          testID="events-attended"
          style={({ pressed }) => [styles.myCard, pressed && styles.pressed]}
        >
          <View style={[styles.myIcon, { backgroundColor: 'rgba(53, 214, 195, 0.16)' }]}>
            <Ionicons name="star" size={18} color={colors.event} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.myCardTitle}>Katıldıklarım</Text>
            <Text style={styles.myCardSub} numberOfLines={1}>
              Puanla
            </Text>
          </View>
        </Pressable>
      </View>

      {notice ? (
        <Text style={[styles.notice, notice.error ? styles.noticeError : styles.noticeOk]}>{notice.text}</Text>
      ) : null}

      {/* Kod girişi açık etkinlikler: kırmızı uyarı, dokununca kod penceresi açılır */}
      {pendingCheckins.length > 0 ? (
        <View style={styles.checkinAlert} testID="checkin-alert">
          <View style={styles.checkinHead}>
            <View>
              <Ionicons name="key" size={24} color={colors.alert} />
              <NoticeDot count={pendingCheckins.length} ringColor={colors.bg} style={styles.checkinDot} />
            </View>
            <View style={styles.checkinHeadText}>
              <Text style={styles.checkinTitle}>Katıldığını doğrulaman gerekiyor</Text>
              <Text style={styles.checkinSub}>
                Etkinlik yerindeyken etkinliği açan kişinin söylediği kodu yaz; puan ancak böyle yazılır.
              </Text>
            </View>
          </View>
          {pendingCheckins.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => void openAttendeeCode(e)}
              accessibilityRole="button"
              accessibilityLabel={`${e.title} için kodu gir`}
              testID="checkin-alert-row"
              style={({ pressed }) => [styles.checkinRow, pressed && styles.pressed]}
            >
              <Text style={styles.checkinRowTitle} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={styles.checkinRowAction}>Kodu gir ›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Kategori kutuları */}
      {/* Haritadan gelinen etkinlik: üstte “Tüm etkinlikler” dönüşü */}
      {focusId ? (
        <Pressable
          onPress={() => setFocusId(null)}
          accessibilityRole="button"
          testID="event-focus-back"
          style={({ pressed }) => [styles.focusBack, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.focusBackText}>
            {focused ? 'Tüm etkinlikler' : 'Bu etkinlik artık listede değil · tüm etkinlikler'}
          </Text>
        </Pressable>
      ) : null}
      {loaded && !loadError ? (
        category === null && !focusId ? (
          <View style={styles.tileGrid}>
            {tileRows.map((row, ri) => (
              <View key={ri} style={[styles.tileRow, { gap }]}>
                {row.map((c) => (
                  <CategoryTile
                    key={c.key}
                    info={c}
                    count={countOf(c.key)}
                    width={tileW}
                    height={tileH}
                    tilt={{ deg: 0, dx: 0 }}
                    onPress={() => setCategory(c.key)}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : focusId || category === null ? null : (
          <View style={styles.selectedWrap}>
            <Pressable
              onPress={() => setCategory(null)}
              accessibilityRole="button"
              accessibilityLabel="Tüm kategorilere dön"
              testID="category-back"
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
              <Text style={styles.backBtnText}>Geri</Text>
            </Pressable>
            {category === 'konser_festival' ? (
              <>
                <Pressable
                  onPress={() => setConcertInfo((o) => !o)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: concertInfo }}
                  style={({ pressed }) => [styles.concertBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="mic" size={15} color="#FF7AD9" />
                  <Text style={styles.concertBtnText}>Konser & Festival hakkında</Text>
                  <Ionicons name={concertInfo ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
                </Pressable>
                {concertInfo ? <Text style={styles.concertNote}>{CONCERT_RULES}</Text> : null}
              </>
            ) : null}
            {category !== 'all' && category !== 'team' ? (
              <CategoryTile
                info={categoryInfo(category)}
                count={countOf(category)}
                width={contentWidth}
                height={Math.round(tileH * 0.85)}
                selected
                onPress={() => setCategory(null)}
              />
            ) : null}
          </View>
        )
      ) : null}

      {/* Liste */}
      {!loaded ? (
        <Text style={styles.muted}>Etkinlikler yükleniyor…</Text>
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{loadError}</Text>
          <PrimaryButton label="Tekrar dene" onPress={onRefresh} variant="ghost" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="calendar-outline" size={42} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Yaklaşan etkinlik yok</Text>
          <Text style={styles.stateText}>
            {isBackendReady
              ? 'Yeni bir buluşma eklendiğinde burada görünecek.'
              : 'Sunucu bağlantısı kurulunca etkinlikler burada listelenecek.'}
          </Text>
        </View>
      ) : visibleEvents.length === 0 ? (
        <View style={styles.stateBox}>
          <CategoryIcon
            info={categoryInfo(category === 'all' || category === 'team' ? null : category)}
            size={42}
            color={colors.textMuted}
          />
          <Text style={styles.stateTitle}>
            {category === 'team' ? 'Şu an ekip arayan yok' : 'Bu kategoride etkinlik yok'}
          </Text>
          <Text style={styles.stateText}>Başka bir kategoriye göz at ya da yeni bir etkinlik oluştur.</Text>
        </View>
      ) : (
        <>
          {officialEvents.length > 0 ? (
            <SectionHeader
              title="41. Kat Özel"
              official
              count={officialEvents.length}
              hint="41. Kat Sosyal moderatörlerinin düzenlediği etkinlikler"
            />
          ) : null}
          {officialEvents.map(renderEvent)}
          {officialEvents.length > 0 && memberEvents.length > 0 ? (
            <SectionHeader
              title="Üye etkinlikleri"
              count={memberEvents.length}
              hint="Üyelerin düzenlediği etkinlikler"
            />
          ) : null}
          {memberEvents.map(renderEvent)}
        </>
      )}

      {joinListOpen ? (
        <CheckinListPopup
          events={events.filter((e) => e.is_registered && !e.is_mine)}
          onClose={() => setJoinListOpen(false)}
          onEnterCode={(e) => {
            setJoinListOpen(false);
            void openAttendeeCode(e);
          }}
        />
      ) : null}
      <EventForm
        key={formKey}
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(pending, imageError) => {
          setFormOpen(false);
          setNotice({
            text:
              (pending
                ? 'Etkinliğin moderatör onayına gönderildi; onaylanınca herkese görünür.'
                : 'Etkinliğin yayınlandı.') + (imageError ? ` Görsel yüklenemedi: ${imageError}` : ''),
            error: Boolean(imageError),
          });
          void load();
        }}
        userId={profile?.id ?? ''}
        hostName={profile?.full_name ?? ''}
        isModerator={isModerator}
        isSponsor={profile?.role === 'sponsor'}
      />
      <EventPointsModal visible={pointsOpen} onClose={() => setPointsOpen(false)} />
      <ShareCooldownModal state={shareWait} onClose={() => setShareWait(null)} />
      <CloseRequestModal
        event={closeFor}
        onClose={() => setCloseFor(null)}
        onSent={() => {
          setNotice({ text: 'Kapatma talebin moderatöre gönderildi.', error: false });
          void load();
        }}
      />
      {roomActions.modals}
      <EventCodeModal
        request={codeReq}
        onClose={() => setCodeReq(null)}
        onVerified={() => {
          setNotice({ text: 'Katılımın doğrulandı.', error: false });
          void load();
        }}
      />
    </Screen>
  );
}

type CardProps = {
  ev: EventItem;
  busy: boolean;
  /** Puanların açılması için gereken en az kişi */
  minAttendees: number;
  /** Etkinliği açan üye kodla katılan olduğu için kaldıramaz; moderatöre talep gönderir */
  needsCloseRequest: boolean;
  onRequestClose: () => void;
  canRemove: boolean;
  /** Etkinliği açan kişi (ya da resmi etkinlikte moderatör): katılım kodunu görür */
  isHost: boolean;
  likeBusy: boolean;
  onSponsor: (sponsorId: string, name: string) => void;
  onLike: () => void;
  onComments: () => void;
  onShowCode: () => void;
  onEnterCode: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onRemove: () => void;
  onToggleSeeking: () => void;
  onTeam: () => void;
  onSafety: () => void;
  onShare: () => void;
  onHostClose: () => void;
  /** Oyunlu etkinlikte: etkinlik oyunu aç (düzenleyen) */
  onStartGame: () => void;
  /** Etkinlik çekilişi ekranı (düzenleyen) */
  onOpenRaffle: () => void;
  isModerator: boolean;
  onToggleTag: () => void;
  /** Haritadan “Etkinliği gör” ile gelindiyse kart açık başlar */
  startExpanded?: boolean;
};

function EventCard({
  ev,
  busy,
  minAttendees,
  needsCloseRequest,
  onRequestClose,
  canRemove,
  isHost,
  likeBusy,
  onSponsor,
  onLike,
  onComments,
  onShowCode,
  onEnterCode,
  onJoin,
  onLeave,
  onRemove,
  onToggleSeeking,
  onTeam,
  onSafety,
  onShare,
  onHostClose,
  onStartGame,
  onOpenRaffle,
  isModerator,
  onToggleTag,
  startExpanded = false,
}: CardProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  // Kart açıldığı anki zaman (ekip seçenekleri etkinlik başlayınca kapanır; sunucu da ayrıca denetler)
  const [openedAt] = useState(() => Date.now());
  const when = new Date(ev.starts_at);
  const count = attendeeCount(ev);
  const full = count >= ev.capacity;
  const ratio = Math.min(1, count / Math.max(1, ev.capacity));
  const free = ev.fee_amount <= 0;
  const official = ev.is_official;
  const sponsorId = ev.host_sponsor_id ?? null;
  // Köşedeki kurdele: 41. Kat Özel, Konser & Festival ya da Mekân Etkinliği
  const ribbon = official
    ? { label: '41. Kat Özel', color: '#FFC83D' }
    : ev.category === 'konser_festival'
      ? { label: 'Konser & Festival', color: '#FF7AD9' }
      : sponsorId
        ? { label: 'Mekân Etkinliği', color: colors.venue }
        : null;
  // Düzenleyen: başlangıçtan 45 dk sonra etkinliği bitirebilir (en az 4 doğrulama; sunucu da denetler)
  const canHostClose =
    ev.is_mine && openedAt >= when.getTime() + 45 * 60 * 1000 && (ev.checked_in_count ?? 0) >= minAttendees;

  return (
    <View style={[styles.card, official && styles.cardOfficial, sponsorId && styles.cardSponsor]}>
      {ribbon ? (
        <View style={[styles.cornerTag, { backgroundColor: ribbon.color }]} pointerEvents="none">
          <Text style={styles.cornerTagText} numberOfLines={1}>
            {ribbon.label}
          </Text>
        </View>
      ) : null}
      {ev.approval === 'pending' || ev.image_status === 'pending' ? (
        <View style={styles.pendingTag}>
          <Ionicons name="hourglass-outline" size={13} color={colors.primary} />
          <Text style={styles.pendingText}>
            {ev.approval === 'pending' ? 'Moderatör onayı bekliyor · yalnızca sen görüyorsun' : 'Görsel onay bekliyor'}
          </Text>
        </View>
      ) : null}
      <View style={ev.image_path ? styles.hero : undefined}>
        {ev.image_path ? (
          <>
            <Image
              source={{ uri: eventImageUrl(ev.image_path) ?? undefined }}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
              accessibilityLabel={`${ev.title} görseli`}
            />
            <LinearGradient
              colors={['rgba(8,10,20,0.15)', 'rgba(8,10,20,0.6)', 'rgba(8,10,20,0.92)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : null}
        <View style={[styles.cardTop, ribbon && styles.cardTopRibbon]}>
          <View style={styles.dateBox} accessibilityLabel={formatWhen(when)}>
            <Text style={styles.dateDay}>{when.getDate()}</Text>
            <Text style={styles.dateMonth}>{MONTH_SHORT[when.getMonth()].toUpperCase()}</Text>
            <Text style={styles.dateWeek}>{DAY_SHORT[when.getDay()]}</Text>
          </View>
          <View style={styles.cardHead}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, styles.flex1]}>{ev.title}</Text>
            </View>
            {sponsorId ? (
              <Pressable
                onPress={() => onSponsor(sponsorId, ev.host_name)}
                accessibilityRole="button"
                accessibilityLabel={`${ev.host_name}, mekân hesabı. Mekân menüsünü aç`}
                style={styles.hostRow}
                testID="event-host-sponsor"
              >
                <SponsorMark size={15} />
                <Text style={[styles.hostText, styles.hostSponsor]} numberOfLines={1}>
                  {ev.host_name}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.hostRow}>
                <Ionicons
                  name={official ? 'shield-checkmark' : 'person-circle-outline'}
                  size={15}
                  color={official ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.hostText, official && styles.hostOfficial]} numberOfLines={1}>
                  {ev.host_name}
                </Text>
              </View>
            )}
            <TitleBadge label={ev.host_title} />
          </View>
        </View>
        {ev.image_path ? (
          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <Ionicons name="time-outline" size={13} color="#FFFFFF" />
              <Text style={styles.heroChipText}>{formatTime(when)}</Text>
            </View>
            {ev.cell_q !== null && ev.cell_r !== null ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/',
                    params: { q: String(ev.cell_q), r: String(ev.cell_r), t: String(Date.now()) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Etkinliğin bölgesini haritada gör"
                style={({ pressed }) => [styles.heroChip, pressed && styles.pressed]}
              >
                <Ionicons name="map-outline" size={13} color={colors.event} />
                <Text
                  style={styles.heroChipText}
                >{`Haritada gör · ${districtOf(ev.cell_q, ev.cell_r) ?? 'Kocaeli'}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {!ev.is_mine && ev.is_registered && when.getTime() > openedAt ? <StartCountdown starts={when} /> : null}
      <View style={styles.tagRow}>
        {ev.tag ? (
          <View style={[styles.tag, styles.tagPromo]}>
            <Ionicons name="pricetag" size={12} color={colors.accent} />
            <Text style={[styles.tagText, styles.tagPromoText]}>{EVENT_TAGS[ev.tag] ?? ev.tag}</Text>
          </View>
        ) : null}
        {sponsorId ? (
          <View style={[styles.tag, styles.tagSponsor]}>
            <Ionicons name="storefront" size={13} color={colors.venue} />
            <Text style={[styles.tagText, styles.tagSponsorText]}>Mekân etkinliği</Text>
          </View>
        ) : null}
        <View style={styles.tag}>
          <CategoryIcon info={categoryInfo(ev.category)} size={13} color={colors.accent} />
          <Text style={styles.tagText}>{categoryInfo(ev.category).title}</Text>
        </View>
        <View style={[styles.tag, ev.min_age > 0 && styles.tagAge]}>
          <Ionicons name="person-outline" size={13} color={ev.min_age > 0 ? colors.primary : colors.textMuted} />
          <Text style={[styles.tagText, ev.min_age > 0 && styles.tagAgeText]}>{ageText(ev.min_age)}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {ev.image_path ? null : <Meta icon="time-outline" text={formatTime(when)} />}
        <Meta icon="location-outline" text={ev.location} flex />
      </View>
      <Text style={styles.closesAt} testID="event-closes-at">
        {`${formatTime(new Date(ev.closes_at))}’de kapanır (başladıktan ${Math.round(
          (new Date(ev.closes_at).getTime() - when.getTime()) / 3600000,
        )} saat sonra)`}
      </Text>
      {!ev.image_path && ev.cell_q !== null && ev.cell_r !== null ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/',
              params: { q: String(ev.cell_q), r: String(ev.cell_r), t: String(Date.now()) },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Etkinliğin bölgesini haritada gör"
          testID="event-on-map"
          style={({ pressed }) => [styles.mapLink, pressed && styles.mapLinkPressed]}
        >
          <Ionicons name="map-outline" size={16} color={colors.event} />
          <Text style={styles.mapLinkText}>{`Haritada gör · ${districtOf(ev.cell_q, ev.cell_r) ?? 'Kocaeli'}`}</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel="Açıklamayı aç veya kapat"
      >
        <Text style={styles.desc} numberOfLines={expanded ? undefined : 3}>
          {ev.description}
        </Text>
        {ev.description.length > 120 ? (
          <Text style={styles.more}>{expanded ? 'Daha az göster' : 'Devamını oku'}</Text>
        ) : null}
      </Pressable>

      <View style={styles.capacity}>
        <View style={styles.capacityLabelRow}>
          <View style={styles.seats} accessibilityLabel={`${count} kişi katılıyor, kontenjan ${ev.capacity}`}>
            <View style={[styles.seatBadge, full && styles.seatBadgeFull]}>
              <Ionicons name="people" size={15} color={full ? colors.danger : colors.accent} />
              <Text style={[styles.seatCount, full && { color: colors.danger }]}>{count}</Text>
              <Text style={styles.seatCap}>{`/ ${ev.capacity}`}</Text>
            </View>
            <View style={styles.seatDots}>
              {Array.from({ length: 10 }, (_, i) => (
                <View
                  key={i}
                  style={[styles.seatDot, i < Math.round(ratio * 10) && (full ? styles.seatDotFull : styles.seatDotOn)]}
                />
              ))}
            </View>
          </View>
          <View style={[styles.priceChip, free ? styles.priceFree : styles.pricePaid]}>
            <Ionicons
              name={free ? 'gift-outline' : 'pricetag'}
              size={13}
              color={free ? colors.success : colors.primary}
            />
            <Text style={[styles.priceText, { color: free ? colors.success : colors.primary }]}>
              {free ? 'Ücretsiz' : formatMoney(ev.fee_amount)}
            </Text>
          </View>
        </View>
      </View>

      {!free && ev.fee_waived ? (
        <Text style={styles.feeNote}>Aboneliğin sayesinde bu etkinlikte ücret ödemezsin.</Text>
      ) : null}

      <View style={styles.socialRow}>
        <Pressable
          onPress={onLike}
          disabled={likeBusy}
          testID="event-like"
          accessibilityRole="button"
          accessibilityLabel={ev.liked_by_me ? 'Beğeniyi geri al' : 'Beğen'}
          accessibilityState={{ selected: ev.liked_by_me }}
          style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
        >
          <Ionicons
            name={ev.liked_by_me ? 'heart' : 'heart-outline'}
            size={22}
            color={ev.liked_by_me ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.socialCount, ev.liked_by_me && styles.socialCountLiked]}>{ev.like_count}</Text>
        </Pressable>
        <Pressable
          onPress={onComments}
          testID="event-comments"
          accessibilityRole="button"
          accessibilityLabel={`${ev.comment_count} yorum, yorumları aç`}
          style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
          <Text style={styles.socialCount}>{ev.comment_count}</Text>
        </Pressable>
        <View style={styles.flex1} />
        {isModerator ? (
          <Pressable
            onPress={onToggleTag}
            accessibilityRole="button"
            accessibilityLabel={ev.tag ? 'Etiketi kaldır' : 'Tanıtım & İşbirliği etiketi ekle'}
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
          >
            <Ionicons name={ev.tag ? 'pricetag' : 'pricetag-outline'} size={19} color={colors.accent} />
          </Pressable>
        ) : null}
        {!isHost && !official ? (
          <Pressable
            onPress={onSafety}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Güvenlik menüsü: 112'yi ara ya da etkinliği bildir"
            testID="event-safety"
            style={({ pressed }) => [styles.safetyBtn, pressed && styles.pressed]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.safetyText}>Bildir</Text>
          </Pressable>
        ) : null}
      </View>

      {isHost ? (
        <View style={styles.codeRow}>
          <View style={styles.codeInfo}>
            <Text style={styles.codeTitle}>
              {ev.checked_in_count === null ? 'Katılım kodu' : `${ev.checked_in_count} kişi katılımını doğruladı`}
            </Text>
            <Text style={styles.codeSub}>Kodu yalnızca etkinlik yerinde katılımcılara söyle.</Text>
          </View>
          <Pressable
            onPress={onShowCode}
            accessibilityRole="button"
            accessibilityLabel="Katılım kodunu göster"
            style={({ pressed }) => [styles.codeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="key-outline" size={16} color={colors.primary} />
            <Text style={styles.codeBtnText}>Kodu göster</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Paket 27: etkinlik oyunu ve etkinlik çekilişi (düzenleyen; en az 4 doğrulanmış katılımcı) */}
      {ev.is_mine && (ev.checked_in_count ?? 0) >= minAttendees ? (
        <View style={styles.hostGames}>
          {ev.with_games ? (
            <Pressable
              onPress={onStartGame}
              disabled={openedAt < when.getTime()}
              accessibilityRole="button"
              accessibilityLabel="Etkinlik oyunu aç"
              testID="event-start-game"
              style={({ pressed }) => [
                styles.hostGameBtn,
                openedAt < when.getTime() && styles.shareOff,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="game-controller" size={20} color="#190B45" />
              <View style={styles.flex}>
                <Text style={styles.hostGameTitle}>Etkinlik oyunu aç</Text>
                <Text style={styles.hostGameSub}>
                  {openedAt < when.getTime() ? 'Etkinlik başlayınca açılır' : 'Puan 1,25 kat · kod katılımcılara gider'}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onOpenRaffle}
            accessibilityRole="button"
            accessibilityLabel="Etkinlik çekilişi"
            testID="event-open-raffle"
            style={({ pressed }) => [styles.hostRaffleBtn, pressed && styles.pressed]}
          >
            <Ionicons name="gift" size={20} color="#1A1200" />
            <View style={styles.flex}>
              <Text style={styles.hostGameTitle}>Etkinlik çekilişi</Text>
              <Text style={styles.hostGameSub}>Oyunlar &gt; Çekiliş’ten açılır</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {canHostClose ? (
        <PrimaryButton label="Etkinliği bitir" variant="ghost" onPress={onHostClose} loading={busy} />
      ) : null}

      {/* Akışta paylaş: düzenleyen, başlamasına 1 saat kala (5 dakikada bir) */}
      {isHost && when.getTime() > openedAt ? (
        <Pressable
          onPress={onShare}
          disabled={busy || when.getTime() - openedAt > 60 * 60 * 1000}
          accessibilityRole="button"
          accessibilityLabel="Etkinliği akışta paylaş"
          testID="event-share"
          style={({ pressed }) => [
            styles.shareRow,
            when.getTime() - openedAt > 60 * 60 * 1000 && styles.shareOff,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="megaphone-outline" size={14} color={colors.primary} />
          <Text style={styles.shareText} numberOfLines={2}>
            {when.getTime() - openedAt > 60 * 60 * 1000 ? 'Akışta paylaş · son 1 saatte açılır' : 'Akışta paylaş'}
          </Text>
        </Pressable>
      ) : null}

      {!isHost && ev.is_registered && ev.checked_in ? (
        <View style={styles.verifiedBox}>
          <View style={styles.verified}>
            <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            <Text style={styles.verifiedText}>Katılımın doğrulandı</Text>
          </View>
          {ev.my_points !== null && ev.my_points > 0 ? (
            <Text style={styles.pointsOk}>{`+${ev.my_points} puan hesabına yazıldı.`}</Text>
          ) : pointsNoteText(ev.my_points_note) ? (
            <Text style={styles.pointsNote}>{pointsNoteText(ev.my_points_note)}</Text>
          ) : (
            <Text style={styles.pointsWait}>
              {`Puanın, etkinlikte en az ${minAttendees} kişinin katılımı doğrulanınca yazılır.`}
            </Text>
          )}
        </View>
      ) : null}

      {!isHost && ev.is_registered && !ev.checked_in && ev.checkin_open ? (
        <View style={styles.checkinCard}>
          <View style={styles.checkinCardHead}>
            <NoticeDot size={12} ringColor={colors.surface} />
            <Text style={styles.checkinCardTitle}>Kod girişi açık: katıldığını doğrula</Text>
          </View>
          <PrimaryButton label="Kodu gir" onPress={onEnterCode} />
        </View>
      ) : null}

      {/* Ekip: arayan sayısı herkese görünür; kayıtlı üye ekip arayabilir */}
      {!isHost && ((ev.team_seekers ?? 0) > 0 || (ev.my_team_size ?? 0) > 0 || ev.is_registered) ? (
        <View style={styles.teamBox} testID="event-team">
          <View style={styles.teamHead}>
            <Ionicons name="people" size={16} color={colors.primary} />
            <Text style={styles.teamText}>
              {(ev.my_team_size ?? 0) > 1
                ? `Ekibin ${ev.my_team_size} kişi · ${multiplierText(teamMultiplier(ev.my_team_size ?? 0))} puan (hepiniz kodu doğrularsanız)`
                : `${ev.team_seekers ?? 0} kişi ekip arıyor`}
            </Text>
          </View>
          {ev.is_registered && !ev.checked_in && when.getTime() > openedAt ? (
            <View style={styles.teamBtns}>
              <Pressable
                onPress={onToggleSeeking}
                disabled={busy}
                accessibilityRole="switch"
                accessibilityState={{ checked: Boolean(ev.my_seeking) }}
                style={({ pressed }) => [styles.teamBtn, ev.my_seeking && styles.teamBtnOn, pressed && styles.pressed]}
                testID="event-team-seeking"
              >
                <Ionicons
                  name={ev.my_seeking ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={ev.my_seeking ? colors.primary : colors.textMuted}
                />
                <Text style={styles.teamBtnText}>Ekip arıyorum</Text>
              </Pressable>
              {ev.my_seeking || (ev.my_team_size ?? 0) > 1 ? (
                <Pressable
                  onPress={onTeam}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.teamBtn, pressed && styles.pressed]}
                  testID="event-team-open"
                >
                  <Ionicons name="people-outline" size={16} color={colors.primary} />
                  <Text style={styles.teamBtnText}>{(ev.my_team_size ?? 0) > 1 ? 'Ekibim' : 'Ekip arayanlar'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {ev.is_mine ? (
          <View style={styles.joined}>
            <Ionicons name="person-circle" size={18} color={colors.success} />
            <Text style={styles.joinedText}>Düzenleyen olarak katılımcısın</Text>
          </View>
        ) : ev.is_registered ? (
          <>
            <View style={styles.joined}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.joinedText}>Katılıyorsun</Text>
            </View>
            {ev.checked_in ? null : (
              <View style={styles.actionBtn}>
                <PrimaryButton label="Vazgeç" onPress={onLeave} loading={busy} variant="ghost" />
              </View>
            )}
          </>
        ) : (
          <View style={styles.actionBtnWide}>
            <PrimaryButton label={full ? 'Kontenjan doldu' : 'Katıl'} onPress={onJoin} loading={busy} disabled={full} />
          </View>
        )}
      </View>

      {canRemove && needsCloseRequest ? (
        ev.close_request === 'pending' ? (
          <View style={styles.requestPending} testID="close-request-pending">
            <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
            <Text style={styles.requestPendingText}>
              Kapatma talebin moderatörde. Karar verilene kadar etkinlik açık kalır.
            </Text>
          </View>
        ) : (
          <>
            {ev.close_request === 'rejected' ? (
              <Text style={styles.requestRejected} testID="close-request-rejected">
                {`Önceki kapatma talebin reddedildi, etkinlik devam ediyor.${
                  ev.close_request_note ? ` Moderatör notu: ${ev.close_request_note}` : ''
                }`}
              </Text>
            ) : null}
            <Pressable
              onPress={onRequestClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${ev.title} için kapatma talebi gönder`}
              testID="close-request-open"
              style={styles.removeRow}
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.danger} />
              <Text style={styles.removeText}>Kapatma talebi gönder</Text>
            </Pressable>
          </>
        )
      ) : canRemove ? (
        <Pressable
          onPress={onRemove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${ev.title} etkinliğini kaldır`}
          style={styles.removeRow}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.removeText}>Etkinliği kaldır</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Meta({
  icon,
  text,
  flex = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  flex?: boolean;
}) {
  return (
    <View style={[styles.meta, flex && styles.metaFlex]}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={styles.metaText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  discoverRow: { flexDirection: 'row', gap: spacing.sm },
  concertNote: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 17,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(176, 19, 122, 0.12)',
  },
  myRow: { flexDirection: 'row', gap: spacing.sm },
  myCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  myCardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  myCardSub: { color: colors.textMuted, fontSize: fontSizes.xs },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.55)',
    backgroundColor: 'rgba(255, 200, 61, 0.08)',
  },
  pointsPillText: { color: colors.highlight, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  cornerTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 5,
    maxWidth: '55%',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderBottomLeftRadius: 10,
  },
  cornerTagText: { color: '#071622', fontFamily: fonts.extra, fontSize: 10 },
  concertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 217, 0.5)',
  },
  concertBtnText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  safetyBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4 },
  safetyText: { color: colors.danger, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  tagPromo: { backgroundColor: 'rgba(124, 140, 255, 0.16)' },
  tagPromoText: { color: colors.accent },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(53, 214, 195, 0.14)',
  },
  countdownText: { color: colors.event, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  ribbonWrap: { position: 'absolute', top: 0, right: 0, width: 84, height: 84, overflow: 'hidden', zIndex: 5 },
  ribbon: {
    position: 'absolute',
    top: 14,
    right: -30,
    width: 120,
    paddingVertical: 2,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
  },
  ribbonText: { color: '#071622', fontFamily: fonts.black, fontSize: 7, letterSpacing: 0.2 },
  discover: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  // Dolu, tema renginde düğmeler; seçiliyken beyaz çerçeve
  discoverExplore: { backgroundColor: colors.primary },
  discoverTeam: { backgroundColor: colors.accent },
  discoverOn: { borderColor: '#FFFFFF' },
  discoverText: { flex: 1, color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.md },
  discoverBadge: {
    minWidth: 26,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(4, 33, 31, 0.22)',
    alignItems: 'center',
  },
  discoverCount: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  myBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    minWidth: '70%',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: -spacing.sm,
  },
  myBtnText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  myBtnPending: { color: colors.primary, fontSize: fontSizes.xs },
  hero: {
    minHeight: 170,
    justifyContent: 'flex-end',
    padding: spacing.md,
    margin: -spacing.sm,
    marginBottom: 0,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  pendingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34, 211, 197, 0.14)',
  },
  pendingText: { color: colors.primary, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shareOff: { borderColor: colors.border, opacity: 0.6 },
  shareText: { flexShrink: 1, color: colors.text, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  topButtons: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: spacing.sm,
    pointerEvents: 'box-none',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex1: { flex: 1 },
  teamBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamText: { flex: 1, color: colors.text, fontSize: 13, fontFamily: fonts.semi },
  teamBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  teamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamBtnOn: { borderColor: colors.primary },
  teamBtnText: { color: colors.text, fontSize: 13 },
  mapLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.event,
  },
  mapLinkPressed: { opacity: 0.7 },
  mapLinkText: { color: colors.event, fontFamily: fonts.semi, fontSize: 12 },
  createCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  createText: { gap: spacing.xs },
  createTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  createSub: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  createLink: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginTop: 2 },
  notice: { fontSize: fontSizes.sm, lineHeight: 20 },
  noticeError: { color: colors.danger },
  noticeOk: { color: colors.success },
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  stateBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  stateTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  stateText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },

  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardTopRibbon: { marginTop: 8 },
  cardOfficial: { borderColor: colors.primary },
  cardSponsor: { borderColor: colors.venue },
  tileGrid: { gap: spacing.lg + 2, paddingVertical: spacing.xs },
  tileRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  selectedWrap: { gap: spacing.md, alignItems: 'flex-start' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: 40,
    marginLeft: -4,
    paddingRight: spacing.md,
  },
  backBtnText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  tagText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tagAge: { borderColor: colors.primary },
  tagAgeText: { color: colors.primary },
  tagSponsor: { borderColor: colors.venue },
  tagSponsorText: { color: colors.venue },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  dateBox: {
    width: 62,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.45)',
  },
  dateDay: { color: colors.primary, fontFamily: fonts.black, fontSize: 24, lineHeight: 28 },
  dateMonth: { color: colors.text, fontFamily: fonts.extra, fontSize: 12, letterSpacing: 0.6 },
  dateWeek: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  cardHead: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, lineHeight: 22 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hostText: { color: colors.textMuted, fontSize: fontSizes.sm, flexShrink: 1 },
  hostOfficial: { color: colors.primary, fontWeight: '700' },
  hostSponsor: { color: colors.venue, fontWeight: '700' },
  metaRow: { gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  metaFlex: { flex: 1 },
  metaText: { flexShrink: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  desc: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  more: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: '700', marginTop: spacing.xs },
  capacity: { gap: spacing.xs },
  capacityLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  capacityText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(8, 10, 20, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroChipText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: fontSizes.xs },
  seats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  seatBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.md,
    backgroundColor: 'rgba(124, 140, 255, 0.14)',
  },
  seatBadgeFull: { backgroundColor: 'rgba(255, 92, 122, 0.14)' },
  seatCount: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  seatCap: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  seatDots: { flexDirection: 'row', gap: 3, flexShrink: 1 },
  seatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  seatDotOn: { backgroundColor: colors.accent },
  seatDotFull: { backgroundColor: colors.danger },
  barFill: { height: '100%', backgroundColor: colors.accent },
  barFull: { backgroundColor: colors.danger },
  priceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  priceFree: { backgroundColor: 'rgba(52, 211, 153, 0.14)' },
  pricePaid: { backgroundColor: 'rgba(34, 211, 197, 0.14)' },
  priceText: { fontFamily: fonts.extra, fontSize: fontSizes.sm },
  feeNote: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  focusBack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  focusBackText: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  hostGames: { flexDirection: 'row', gap: spacing.sm },
  hostGameBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.game,
    borderWidth: 1,
    borderColor: colors.game,
  },
  hostRaffleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FFC83D',
  },
  hostGameTitle: { color: '#14102A', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  hostGameSub: { color: '#14102A', fontSize: 11, opacity: 0.8 },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  socialCount: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700', minWidth: 14 },
  socialCountLiked: { color: colors.danger },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  codeInfo: { flex: 1, gap: 2 },
  codeTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  codeSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  codeBtnText: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  verifiedBox: { gap: 4 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pointsOk: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pointsNote: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  pointsWait: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  closesAt: { color: colors.textMuted, fontSize: 12, marginTop: -4 },
  checkinCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.08)',
  },
  checkinCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkinCardTitle: { flex: 1, color: colors.alert, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  checkinAlert: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.08)',
  },
  checkinHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkinDot: { position: 'absolute', top: -8, right: -10 },
  checkinHeadText: { flex: 1, gap: 2 },
  checkinTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  checkinSub: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  checkinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  checkinRowTitle: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  checkinRowAction: { color: colors.alert, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  requestPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(34, 211, 197, 0.1)',
  },
  requestRejected: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  requestPendingText: { flex: 1, color: colors.primary, fontSize: 12, lineHeight: 18 },
  verifiedText: { color: colors.success, fontWeight: '800', fontSize: fontSizes.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionBtn: { flex: 1 },
  actionBtnWide: { flex: 1 },
  joined: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  joinedText: { color: colors.success, fontWeight: '800', fontSize: fontSizes.sm },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  removeText: { color: colors.danger, fontSize: fontSizes.sm, fontWeight: '700' },
});
