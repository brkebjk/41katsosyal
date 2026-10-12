import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/dialog';
import { gameTileImages } from '@/lib/images';
import { formatWhen, timeAgo } from '@/lib/labels';
import {
  createRoom,
  drawRaffle,
  getRoom,
  getRoomCode,
  getRoomHost,
  leaveRoom,
  listMyEventRaffles,
  listMyOpenRaffles,
  listPlayers,
  type EventRaffle,
  setRoomStatus,
  type HostedRoom,
  type Room,
  type RoomHost,
  type RoomPlayer,
} from '@/lib/rooms';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const POLL_MS = 3000;

type Reveal = { names: string[]; winner: string };

function goToGames() {
  if (router.canGoBack()) router.back();
  else router.replace('/games');
}

export default function RaffleScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';

  return (
    <Screen
      title="Çekiliş"
      subtitle={!id && isModerator ? 'Çekiliş odaları' : undefined}
      onBack={goToGames}
      backLabel="Oyunlar"
    >
      <RaffleHero />
      {id ? <RoomView key={id} roomId={id} /> : isModerator ? <ModeratorHome /> : <EventRaffleHome />}
    </Screen>
  );
}

/** Sayfanın üstündeki çekiliş görseli. Görsel yoksa degrade ve hediye simgesi gösterilir. */
function RaffleHero() {
  const image = gameTileImages.raffle;
  return (
    <View style={styles.hero} accessible={false}>
      {image ? (
        <Image source={image} contentFit="cover" style={styles.fill} />
      ) : (
        <>
          <LinearGradient
            colors={['#9A6500', '#1A1200']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.fill}
          />
          <Ionicons name="gift" size={72} color="rgba(255,255,255,0.2)" style={styles.heroIcon} />
        </>
      )}
      <LinearGradient colors={['rgba(8,10,20,0)', 'rgba(8,10,20,0.75)']} style={[styles.fill, styles.noTouch]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Moderatör: oda aç ve açık odalarına dön
// ---------------------------------------------------------------------------

function ModeratorHome() {
  const [rooms, setRooms] = useState<HostedRoom[]>([]);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const res = await listMyOpenRaffles();
    if (res.error) setError(res.error);
    else setRooms(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function onCreate() {
    if (lock.current) return;
    lock.current = true;
    setCreating(true);
    setError(null);
    try {
      const res = await createRoom('raffle');
      if (res.error || !res.room) {
        setError(res.error ?? 'Oda açılamadı.');
        return;
      }
      router.push({ pathname: '/cekilis', params: { id: res.room.id } });
    } finally {
      setCreating(false);
      lock.current = false;
    }
  }

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Yeni çekiliş odası</Text>
        <Text style={styles.cardText}>
          Odayı açınca 5 harfli bir kod çıkar. Masadakiler bu kodu Oyunlar sekmesindeki “Odaya katıl” kutusuna yazar ya
          da açık odalar listesinden katılır. Hazır olunca çekilişi sen yaparsın.
        </Text>
        <PrimaryButton label="Oda aç" onPress={() => void onCreate()} loading={creating} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.sectionTitle}>Açık odalarım</Text>
      {!loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rooms.length === 0 ? (
        <Text style={styles.muted}>Şu an açık çekiliş odan yok.</Text>
      ) : (
        rooms.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: '/cekilis', params: { id: r.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Oda ${r.code}`}
            style={({ pressed }) => [styles.roomRow, pressed && styles.pressed]}
          >
            <View style={styles.roomRowText}>
              <Text style={styles.roomRowCode}>{r.code}</Text>
              <Text style={styles.muted}>{timeAgo(r.created_at)} açıldı</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Etkinlik düzenleyeni: en az 4 kişinin katılımını doğruladığı etkinliklerde çekiliş açar ve kendisi yapar
// ---------------------------------------------------------------------------

function isLive(e: EventRaffle) {
  return e.room_id !== null && (e.room_status === 'lobby' || e.room_status === 'playing');
}

function EventRaffleHome() {
  const [items, setItems] = useState<EventRaffle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const res = await listMyEventRaffles();
    setError(res.error);
    setItems(res.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme
    void load();
  }, [load]);

  async function open(e: EventRaffle) {
    if (busy) return;
    // Açık çekiliş varsa ona; hak bittiyse son çekilişin sonucuna gidilir; yoksa yeni çekiliş açılır
    if (e.room_id && (isLive(e) || Number(e.done) >= Number(e.max_raffles))) {
      router.push({ pathname: '/cekilis', params: { id: e.room_id } });
      return;
    }
    const ok = await confirmAction(
      'Etkinlik çekilişini aç',
      `“${e.title}” için ${Number(e.done) + 1}. çekiliş odası açılır (en çok ${e.max_raffles}). Oda kodu, katılımını doğrulamış ${e.verified} kişiye bildirimle gider; yalnızca onlar katılabilir. Çekilişi sen yaparsın. Ödülü sen belirler ve verirsin.`,
      'Çekilişi aç',
    );
    if (!ok) return;
    setBusy(e.event_id);
    const res = await createRoom('raffle', undefined, undefined, undefined, e.event_id);
    setBusy(null);
    if (res.error || !res.room) {
      setError(res.error ?? 'Çekiliş açılamadı.');
      void load();
      return;
    }
    router.push({ pathname: '/cekilis', params: { id: res.room.id } });
  }

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Etkinlik çekilişi</Text>
        <Text style={styles.cardText}>
          Düzenlediğin etkinlikte en az 4 kişi katılımını kodla doğrulayınca en çok 5 çekiliş yapabilirsin. Kod yalnızca
          doğrulanmış katılımcılara bildirimle gider. Diğer çekilişlere katılmak için kodu Oyunlar sekmesindeki “Kodla
          katıl”a yaz.
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>Şu an çekiliş açabileceğin etkinlik yok.</Text>
      ) : (
        items.map((e) => (
          <Pressable
            key={e.event_id}
            onPress={() => void open(e)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`${e.title} etkinlik çekilişi`}
            testID="event-raffle-row"
            style={({ pressed }) => [
              styles.roomRow,
              Number(e.done) === 0 && styles.roomRowNew,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.roomRowText}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {e.title}
              </Text>
              <Text style={styles.muted}>
                {`${formatWhen(new Date(e.starts_at))} · ${e.verified} doğrulanmış katılımcı · çekiliş ${e.done}/${e.max_raffles}`}
              </Text>
              <Text style={[styles.rowAction, Number(e.done) === 0 && styles.rowActionNew]}>
                {busy === e.event_id
                  ? 'Açılıyor…'
                  : isLive(e)
                    ? 'Açık çekiliş odasına git'
                    : Number(e.done) < Number(e.max_raffles)
                      ? Number(e.done) === 0
                        ? 'Çekilişi aç'
                        : 'Yeni çekiliş aç'
                      : 'Çekiliş hakkın doldu · son sonucu gör'}
              </Text>
              {e.room_id && !isLive(e) && Number(e.done) < Number(e.max_raffles) ? (
                <Text
                  style={styles.rowLink}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/cekilis', params: { id: e.room_id as string } })}
                >
                  Son çekilişin sonucunu gör
                </Text>
              ) : null}
            </View>
            {Number(e.done) === 0 ? <View style={styles.newDot} /> : null}
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))
      )}
      <PrimaryButton
        label="Açık çekilişler"
        variant="ghost"
        onPress={() => router.push({ pathname: '/acik-odalar', params: { game: 'raffle' } })}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Oda ekranı (moderatör ve katılımcı aynı odayı farklı görür)
// ---------------------------------------------------------------------------

function RoomView({ roomId }: { roomId: string }) {
  const { profile } = useAuth();
  const myId = profile?.id;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Oda kodu yalnızca odayı açan moderatöre gelir; katılımcıda boştur */
  const [code, setCode] = useState<string | null>(null);
  const [host, setHost] = useState<RoomHost | null>(null);
  const [busy, setBusy] = useState<'draw' | 'cancel' | 'leave' | 'new' | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const lastStatus = useRef<Room['status'] | null>(null);
  const playersRef = useRef<RoomPlayer[]>([]);
  const lock = useRef(false);
  const hasRoom = useRef(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const my = ++loadSeq.current;
    const [r, p] = await Promise.all([getRoom(roomId), listPlayers(roomId)]);
    // Daha yeni bir yenileme ya da çekiliş sonucu geldiyse bu eski cevap yok sayılır
    if (my !== loadSeq.current) return;
    if (r.error) {
      // Oda zaten ekrandaysa kısa bir bağlantı kopması ekranı bozmasın; sonraki yenileme düzeltir
      if (!hasRoom.current) setLoadError(r.error);
      setLoaded(true);
      return;
    }
    setLoadError(null);
    hasRoom.current = r.data !== null;
    setRoom(r.data);
    if (!p.error) setPlayers(p.data);
    // Bekleme odasındayken çekiliş yapıldıysa (başka telefonda) kazananı kısa bir geri sayımla göster
    const prev = lastStatus.current;
    lastStatus.current = r.data?.status ?? null;
    if (prev === 'lobby' && r.data?.status === 'finished' && r.data.state.winner_name) {
      const names = (p.error ? playersRef.current : p.data).map((x) => x.display_name);
      setReveal({ names, winner: r.data.state.winner_name });
      setRevealDone(false);
    }
    setLoaded(true);
  }, [roomId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  // Oda kodu (yalnızca oda sahibine gelir) ve oda sahibinin adı bir kez okunur
  useEffect(() => {
    if (!isBackendReady) return;
    let alive = true;
    void Promise.all([getRoomCode(roomId), getRoomHost(roomId)]).then(([c, h]) => {
      if (!alive) return;
      setCode(c);
      setHost(h);
    });
    return () => {
      alive = false;
    };
  }, [roomId]);

  // Oda bitene kadar birkaç saniyede bir tazelenir
  const active = room !== null && (room.status === 'lobby' || room.status === 'playing');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [active, load]);

  async function onDraw() {
    if (lock.current || !room) return;
    lock.current = true; // onay sorusu açıkken ikinci kez basılırsa ikinci soru açılmaz
    try {
      const ok = await confirmAction(
        'Çekilişi yap',
        `${players.length} kişi arasından bir kazanan seçilecek. Çekiliş yapılınca oda kapanır.`,
        'Çekilişi yap',
      );
      if (!ok) return;
      setBusy('draw');
      setActionError(null);
      const names = players.map((p) => p.display_name);
      const res = await drawRaffle(room.id);
      if (res.error || !res.winner) {
        setActionError(res.error ?? 'Çekiliş yapılamadı.');
        void load();
        return;
      }
      loadSeq.current += 1; // yolda olan eski yenilemeler sonucu ezmesin
      lastStatus.current = 'finished';
      setReveal({ names, winner: res.winner.winner_name });
      setRevealDone(false);
      setRoom({
        ...room,
        status: 'finished',
        state: {
          ...room.state,
          winner_user_id: res.winner.winner_user_id,
          winner_name: res.winner.winner_name,
        },
      });
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  async function onCancel() {
    if (lock.current || !room) return;
    lock.current = true;
    try {
      const ok = await confirmAction(
        'Odayı iptal et',
        'Oda kapanır ve katılanlar çekilişe giremez.',
        'Odayı iptal et',
        true,
      );
      if (!ok) return;
      setBusy('cancel');
      setActionError(null);
      const res = await setRoomStatus(room.id, 'cancelled');
      if (res.error) {
        setActionError(res.error);
        return;
      }
      void load();
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  async function onLeave() {
    if (lock.current || !room) return;
    lock.current = true;
    setBusy('leave');
    setActionError(null);
    try {
      const res = await leaveRoom(room.id);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      goToGames();
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  async function onNewRaffle() {
    if (lock.current) return;
    lock.current = true;
    setBusy('new');
    setActionError(null);
    try {
      const res = await createRoom('raffle');
      if (res.error || !res.room) {
        setActionError(res.error ?? 'Oda açılamadı.');
        return;
      }
      router.replace({ pathname: '/cekilis', params: { id: res.room.id } });
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  if (!loaded) return <Text style={styles.muted}>Oda yükleniyor…</Text>;

  if (loadError) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardText}>{loadError}</Text>
        <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Oda bulunamadı</Text>
        <Text style={styles.cardText}>Bu oda kapanmış olabilir ya da odada değilsin.</Text>
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      </View>
    );
  }

  // Çekilişi moderatör, etkinlik çekilişini ise odayı açan düzenleyen yapar (sunucu da denetler)
  const isModerator = profile?.role === 'admin' || (Boolean(myId) && room.host_id === myId);
  const winnerName = room.state.winner_name;
  const iWon = Boolean(myId) && room.state.winner_user_id === myId;
  const showResult = room.status === 'finished' && Boolean(winnerName);
  const inLobby = room.status === 'lobby';

  return (
    <>
      <View style={styles.codeCard}>
        {code ? (
          <>
            <Text style={styles.codeLabel}>Oda kodu · yalnızca sende görünür</Text>
            <Text style={styles.code} selectable accessibilityLabel={`Oda kodu ${code.split('').join(' ')}`}>
              {code}
            </Text>
          </>
        ) : null}
        <Text style={styles.codeHint}>
          {inLobby
            ? code
              ? 'Bu kodu masadakilere söyle. Oyunlar sekmesine yazıp katılırlar; kod başka hiçbir yerde gösterilmez.'
              : 'Çekilişe katıldın. Çekiliş yapılınca kazanan burada görünür.'
            : room.status === 'cancelled'
              ? 'Bu çekiliş iptal edildi.'
              : 'Çekiliş tamamlandı.'}
        </Text>
      </View>

      {reveal && !revealDone ? (
        <RevealCard reveal={reveal} onDone={() => setRevealDone(true)} />
      ) : showResult ? (
        <View style={[styles.winnerCard, iWon && styles.winnerCardMe]} accessibilityLiveRegion="polite">
          <Ionicons name="trophy" size={36} color={colors.primary} />
          <Text style={styles.winnerLabel}>Kazanan</Text>
          <Text style={styles.winnerName}>{winnerName}</Text>
          {iWon ? <Text style={styles.winnerMe}>Tebrikler, kazanan sensin!</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Katılanlar ({players.length})</Text>
        <View style={styles.playerList}>
          {host ? (
            <View style={styles.playerRow}>
              <Ionicons name="star" size={16} color={colors.primary} style={styles.hostStar} />
              <Text style={styles.playerName} numberOfLines={1}>
                {host.name}
                {host.is_me ? ' (sen)' : ''}
              </Text>
              <View style={styles.hostChip}>
                <Text style={styles.hostChipText}>Oda sahibi</Text>
              </View>
            </View>
          ) : null}
          {players.length === 0 ? (
            <Text style={styles.cardText}>
              {inLobby ? 'Henüz kimse katılmadı. Katılanlar burada görünür.' : 'Bu odada katılımcı yok.'}
            </Text>
          ) : (
            players.map((p, i) => (
              <View key={p.user_id} style={styles.playerRow}>
                <Text style={styles.playerNo}>{i + 1}</Text>
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.display_name}
                  {p.user_id === myId ? ' (sen)' : ''}
                </Text>
                {room.state.winner_user_id === p.user_id ? (
                  <Ionicons name="trophy" size={16} color={colors.primary} />
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>

      {actionError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}

      {isModerator ? (
        inLobby ? (
          <View style={styles.actions}>
            <PrimaryButton
              label="Çekilişi yap"
              onPress={() => void onDraw()}
              loading={busy === 'draw'}
              disabled={players.length === 0 || busy !== null}
            />
            <PrimaryButton
              label="Odayı iptal et"
              variant="danger"
              onPress={() => void onCancel()}
              loading={busy === 'cancel'}
              disabled={busy !== null}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            {profile?.role === 'admin' ? (
              <PrimaryButton label="Yeni çekiliş" onPress={() => void onNewRaffle()} loading={busy === 'new'} />
            ) : null}
            <PrimaryButton
              label={profile?.role === 'admin' ? 'Odalarıma dön' : 'Çekilişlerime dön'}
              variant="ghost"
              onPress={() => router.replace('/cekilis')}
            />
          </View>
        )
      ) : inLobby ? (
        <PrimaryButton label="Odadan ayrıl" variant="ghost" onPress={() => void onLeave()} loading={busy === 'leave'} />
      ) : (
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      )}
    </>
  );
}

/** Kazananın adını isimler arasında hızlı dönerek yavaşça bulduğu kısa gösteri. */
function RevealCard({ reveal, onDone }: { reveal: Reveal; onDone: () => void }) {
  const pool = useMemo(() => (reveal.names.length > 0 ? reveal.names : [reveal.winner]), [reveal]);
  const [text, setText] = useState(pool[0]);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let step = 0;
    const total = 26;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      step += 1;
      if (step >= total) {
        setText(reveal.winner);
        timer = setTimeout(() => doneRef.current(), 500);
        return;
      }
      setText(pool[Math.floor(Math.random() * pool.length)]);
      timer = setTimeout(tick, 60 + step * step * 0.35);
    };
    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [pool, reveal.winner]);

  return (
    <View style={styles.winnerCard} accessibilityLiveRegion="polite">
      <Ionicons name="gift" size={36} color={colors.primary} />
      <Text style={styles.winnerLabel}>Kazanan belirleniyor…</Text>
      <Text style={styles.winnerName}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  hero: {
    height: 150,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIcon: { position: 'absolute' },
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  cardText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  pressed: { opacity: 0.8 },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  roomRowText: { flex: 1, gap: 2 },
  roomRowNew: { borderWidth: 1.5, borderColor: colors.danger },
  rowAction: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginTop: 4 },
  rowActionNew: { color: colors.danger },
  rowLink: { color: colors.textMuted, fontSize: fontSizes.xs, textDecorationLine: 'underline', marginTop: 2 },
  newDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },
  roomRowCode: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.lg, letterSpacing: 4 },
  codeCard: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontFamily: fonts.semi,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: 40, letterSpacing: 8 },
  codeHint: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  winnerCard: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  winnerCardMe: { borderColor: colors.primary, borderWidth: 2 },
  winnerLabel: { color: colors.textMuted, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  winnerName: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  winnerMe: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md, marginTop: spacing.xs },
  playerList: { gap: spacing.sm },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  playerNo: {
    width: 24,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontFamily: fonts.semi,
    textAlign: 'right',
  },
  playerName: { flex: 1, color: colors.text, fontSize: fontSizes.md },
  hostStar: { width: 24, textAlign: 'right' },
  hostChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: 'rgba(255, 176, 32, 0.16)',
  },
  hostChipText: { color: colors.primary, fontFamily: fonts.semi, fontSize: 10 },
  actions: { gap: spacing.md },
});
