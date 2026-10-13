import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaView, cardLook, type ArenaLive } from '@/components/ArenaView';
import { Avatar } from '@/components/Avatar';
import { GameLinks } from '@/components/GameLinks';
import { HoneycombMap } from '@/components/HoneycombMap';
import { InfoModal } from '@/components/InfoModal';
import { KeyboardLift } from '@/components/KeyboardLift';
import { Popup } from '@/components/Popup';
import { JokerPreview, jokerLook, LivesBar, PlayButton, PointGoal } from '@/components/QuizBits';
import { SideBySideView } from '@/components/SideBySideView';
import { SoloMarathonView } from '@/components/SoloMarathonView';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import { confirmAction, notify } from '@/lib/dialog';
import { quizInfo } from '@/lib/gameInfo';
import type { Cell } from '@/lib/hex';
import { quizImages } from '@/lib/images';
import { fmtPts } from '@/lib/labels';
import {
  arenaCreateRoom,
  arenaJoinRoom,
  arenaLeave,
  cancelSearch,
  findMatch,
  getQuizLobby,
  mmss,
  quietCell,
  quizPing,
  sideLeave,
  sideStart,
  soloLeave,
  startSolo,
  type QuizLobby,
  CARD_INFO,
  JOKER_INFO,
  TONE_LABEL,
  type CardKind,
  type JokerKind,
} from '@/lib/quiz';
import { DEFAULT_RULES, getPointRules, type PointRules } from '@/lib/ranking';
import { initSounds, onSoundChange, playSound, releaseSounds, setSoundOn, soundOn } from '@/lib/sounds';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type ViewMode = 'lobby' | 'searching' | 'match' | 'solo' | 'side';
const nowMs = () => Date.now();
/** Uzaktan'da sandıktan çıkabilen jokerler (Bomba ve takas kaldırıldı) */
const ARENA_JOKERS: CardKind[] = ['roulette', 'shield', 'fifty', 'thief', 'freeze'];
/** Solo Maraton jokerleri */
const SOLO_JOKERS: JokerKind[] = ['freeze', 'double', 'fifty'];
/** Rastgele eşleşmede herkes en az bu kadar sn aranır (sunucu da uygular) */
const SEARCH_MIN = 10;
/** Solo Başla'dan sonra geri sayım (sn) */
const COUNTDOWN = 3;
/** Bu kadar saniye kimse bulunamazsa “Solo Maraton oyna” önerilir */
const SUGGEST_SOLO_AFTER = 30;
/** Uzaktan maç için gereken en az soru (10 soru + ani ölüm) */
const MIN_QUESTIONS = 14;

type Live = { live: boolean; kind: 'arena' | 'solo' | 'side' | null; phase: ArenaLive['phase'] };

/**
 * Bilgi Yarışması: ana ekran (can göstergesi, mod düğmeleri, puan hedefleri, haftalık Solo sıralaması),
 * rakip arama, Uzaktan maç / özel oda ve Solo Maraton ekranları. Oyun sürerken ekrandan çıkmak önce sorulur;
 * hiçbir moda girilmemişken geri tuşu ve kaydırarak geri dönme normal çalışır.
 */
export default function QuizScreen() {
  const { profile } = useAuth();
  // Oyunlar → Oda Oluştur → Bilgi Yarışması: ekran açılınca doğrudan özel Uzaktan odası kurulur (can / günlük hak
  // yoksa kurulmaz, nedeni söylenir). Sunucu da aynı kontrolleri yapar.
  const { create } = useLocalSearchParams<{ create?: string }>();
  const [wantCreate] = useState(() => create === '1');
  const createRef = useRef<(l: QuizLobby) => void>(() => {});
  const [view, setView] = useState<ViewMode>('lobby');
  const [lobby, setLobby] = useState<QuizLobby | null>(null);
  const [offset, setOffset] = useState(0);
  const [lobbyErr, setLobbyErr] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [sideId, setSideId] = useState<string | null>(null);
  const [sound, setSound] = useState(soundOn);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [soloOpen, setSoloOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  /** “Şu an oyunda” (Bilgi Yarışması ekranındakiler dahil), 20 sn'de bir yenilenir */
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [search, setSearch] = useState<{ since: number; waiting: number; startsIn: number | null } | null>(null);
  const [now, setNow] = useState(nowMs);
  const liveRef = useRef<Live>({ live: false, kind: null, phase: null });
  const searchingRef = useRef(false);
  const matchRef = useRef<string | null>(null);
  const runRef = useRef<string | null>(null);
  const sideRef = useRef<string | null>(null);

  // Sesler: ayar yüklenir; ekrandan çıkınca çalarlar serbest bırakılır
  useEffect(() => {
    void initSounds();
    const off = onSoundChange(setSound);
    return () => {
      off();
      releaseSounds();
    };
  }, []);

  const loadLobby = useCallback(async () => {
    const t0 = Date.now();
    const res = await getQuizLobby();
    if (res.data) setOffset(Date.parse(res.data.server_now) - (t0 + Date.now()) / 2);
    setLobby(res.data);
    setLobbyErr(res.error);
    return res.data;
  }, []);

  // Açılışta: devam eden bir oyun (ya da beklenen özel oda) varsa ona dönülür
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void loadLobby().then((l) => {
      if (!alive || !l) return;
      if (l.live_solo) {
        runRef.current = l.live_solo;
        setRunId(l.live_solo);
        setView('solo');
      } else if (l.live_side) {
        sideRef.current = l.live_side;
        setSideId(l.live_side);
        setView('side');
      } else if (l.live_match) {
        matchRef.current = l.live_match;
        setMatchId(l.live_match);
        setView('match');
      } else if (wantCreate) {
        createRef.current(l);
      }
    });
    void getPointRules().then((r) => {
      if (alive) setRules(r);
    });
    return () => {
      alive = false;
    };
  }, [loadLobby, wantCreate]);

  // Ekran kapanırken: aramadaysan kuyruktan çıkılır; Uzaktan maçtaysan maçtan çıkılır (başladıysa kaybedilir)
  useEffect(
    () => () => {
      if (searchingRef.current) void cancelSearch();
      if (matchRef.current && liveRef.current.live && liveRef.current.kind === 'arena')
        void arenaLeave(matchRef.current);
    },
    [],
  );

  // Rakip arama: 2 saniyede bir sor (bu aynı zamanda “hâlâ bekliyorum” işaretidir)
  useEffect(() => {
    if (view !== 'searching') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cell: Cell | null = null;
    const tick = async () => {
      const res = await findMatch(cell);
      if (!alive) return;
      if (res.error) {
        searchingRef.current = false;
        setView('lobby');
        void loadLobby();
        void notify('Eşleşme yapılamadı', res.error, { icon: 'alert-circle' });
        return;
      }
      if (res.data?.status === 'matched') {
        searchingRef.current = false;
        playSound('match', 0.9);
        matchRef.current = res.data.match_id;
        setMatchId(res.data.match_id);
        setView('match');
        return;
      }
      if (res.data?.status === 'waiting') {
        const { waiting, starts_in: startsIn } = res.data;
        setSearch((p) => (p ? { ...p, waiting, startsIn } : p));
      }
      timer = setTimeout(() => void tick(), 2000);
    };
    void quietCell().then((c) => {
      cell = c;
      if (alive) void tick();
    });
    const clock = setInterval(() => setNow(nowMs()), 1000);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      clearInterval(clock);
    };
  }, [view, loadLobby]);

  const onArenaLive = useCallback((l: ArenaLive) => {
    liveRef.current = { live: l.live, kind: 'arena', phase: l.phase };
  }, []);
  const onSideLive = useCallback((live: boolean) => {
    liveRef.current = { live, kind: 'side', phase: null };
  }, []);
  const onSideGame = useCallback((id: string | null) => {
    sideRef.current = id;
    setSideId(id);
  }, []);
  const onSoloLive = useCallback((live: boolean) => {
    liveRef.current = { live, kind: 'solo', phase: null };
  }, []);

  const backToLobby = useCallback(() => {
    matchRef.current = null;
    runRef.current = null;
    liveRef.current = { live: false, kind: null, phase: null };
    setMatchId(null);
    setRunId(null);
    setView('lobby');
    void loadLobby();
  }, [loadLobby]);

  /** Geri / çarpı: oyun sürüyorsa önce sorulur */
  const requestBack = useCallback(async () => {
    if (view === 'side') {
      if (sideRef.current && liveRef.current.live && liveRef.current.kind === 'side') {
        const ok = await confirmAction(
          'Oyunu bitir',
          'Yan Yana oyunu burada biter. Puan ya da can etkilenmez.',
          'Bitir',
          true,
        );
        if (!ok) return;
        await sideLeave(sideRef.current);
      }
      sideRef.current = null;
      liveRef.current = { live: false, kind: null, phase: null };
      setSideId(null);
      setView('lobby');
      void loadLobby();
      return;
    }
    if (view === 'searching') {
      searchingRef.current = false;
      void cancelSearch();
      setView('lobby');
      void loadLobby();
      return;
    }
    if (view === 'match' && matchRef.current) {
      const l = liveRef.current;
      if (l.live && l.phase === 'ready') {
        // Bekleme odasından çıkmak serbest (can harcanmadı)
        await arenaLeave(matchRef.current);
      } else if (l.live) {
        const ok =
          l.phase === 'lobby'
            ? await confirmAction('Odadan çık', 'Odadan çıkmak istiyor musun? Kurucuysan oda kapanır.', 'Çık', true)
            : l.phase === 'intro'
              ? await confirmAction('Vazgeç', 'Maç başlamadan vazgeçiyorsun. Canın geri verilir.', 'Vazgeç', true)
              : await confirmAction('Maçtan çık', 'Şimdi çıkarsan maçı kaybedersin.', 'Çık', true);
        if (!ok) return;
        await arenaLeave(matchRef.current);
      }
      backToLobby();
      return;
    }
    if (view === 'solo' && runRef.current) {
      if (liveRef.current.live) {
        const ok = await confirmAction(
          'Maratonu bitir',
          'Maraton burada biter. Ulaştığın basamağın (5, 8 ya da 12 doğru) puanı yazılır.',
          'Bitir',
          true,
        );
        if (!ok) return;
        await soloLeave(runRef.current);
      }
      backToLobby();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/games');
  }, [view, loadLobby, backToLobby]);

  // Bilgi Yarışması ekranındayken 20 sn'de bir “buradayım” (şu an oyunda sayısına girer)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const ping = () =>
        void quizPing().then((n) => {
          if (alive && n !== null) setOnlineNow(n);
        });
      ping();
      const t = setInterval(ping, 20000);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }, []),
  );

  // Android geri tuşu: bir moddayken önce sorulur; ana ekranda normal geri gider
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (view === 'lobby') return false;
        // Oyun başladıktan sonra geri tuşu çalışmaz; yalnızca X ile çıkılır (yanlışlıkla maç kaybını önler)
        const l = liveRef.current;
        if (
          l.live &&
          (l.kind === 'solo' || l.kind === 'side' || (l.kind === 'arena' && l.phase !== 'ready' && l.phase !== 'lobby'))
        ) {
          return true;
        }
        void requestBack();
        return true;
      });
      return () => sub.remove();
    }, [requestBack, view]),
  );

  // iPhone'da kaydırarak geri (ve başka her türlü ekrandan çıkış): bir moddayken Bilgi Yarışması ekranı kapanmaz;
  // ana Bilgi Yarışması ekranına dönülür. Oyun sürerken yalnızca X çalışır. (Solo, Uzaktan ve Yan Yana pencereleri
  // geri tuşu, kaydırarak geri ya da çarpı ile kapanır.)
  usePreventRemove(view !== 'lobby', () => {
    const l = liveRef.current;
    if (
      l.live &&
      (l.kind === 'solo' || l.kind === 'side' || (l.kind === 'arena' && l.phase !== 'ready' && l.phase !== 'lobby'))
    ) {
      return;
    }
    void requestBack();
  });

  /** Can / günlük sınır yoksa oyunu başlatmadan açıklama gösterir */
  function blocked(l: QuizLobby | null = lobby): boolean {
    const lobby = l;
    if (!lobby) return false;
    if (lobby.questions < MIN_QUESTIONS) {
      void notify('Sorular hazırlanıyor', 'Yeterli soru yok. Moderatör sorular eklediğinde oynayabilirsin.', {
        icon: 'help-circle',
      });
      return true;
    }
    if (lobby.games_today >= lobby.daily_games) {
      void notify('Bugünlük bu kadar', `Günde en çok ${lobby.daily_games} oyun oynanabilir. Yarın yeniden!`, {
        icon: 'moon',
      });
      return true;
    }
    if (lobby.lives < 1 && !lobby.unlimited_lives) {
      const left = lobby.next_life_at ? Date.parse(lobby.next_life_at) - (nowMs() + offset) : 0;
      void notify('Canın kalmadı', `Yeni can ${mmss(left)} sonra dolacak.`, { icon: 'heart-dislike' });
      return true;
    }
    return false;
  }

  function startSearch() {
    if (busy || blocked()) return;
    setRemoteOpen(false);
    searchingRef.current = true;
    setSearch({ since: nowMs(), waiting: 1, startsIn: null });
    setView('searching');
  }

  async function createRoom(l?: QuizLobby) {
    if (busy || blocked(l ?? lobby)) return;
    setBusy(true);
    const res = await arenaCreateRoom(null, await quietCell());
    setBusy(false);
    if (res.error || !res.data)
      return void notify('Oda kurulamadı', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'alert-circle' });
    setRemoteOpen(false);
    matchRef.current = res.data.match_id;
    setMatchId(res.data.match_id);
    setView('match');
  }

  // Açılışta kendiliğinden oda kurmak için en güncel createRoom (ilk yükleme bitince çağrılır)
  useEffect(() => {
    createRef.current = (l) => void createRoom(l);
  });

  async function joinRoom(code: string): Promise<string | null> {
    if (busy) return null;
    if (blocked()) return null;
    setBusy(true);
    const res = await arenaJoinRoom(code, await quietCell());
    setBusy(false);
    if (res.error || !res.data) return res.error ?? 'Odaya girilemedi.';
    setRemoteOpen(false);
    matchRef.current = res.data;
    setMatchId(res.data);
    setView('match');
    return null;
  }

  /** Solo Maraton penceresi (kurallar + Başla). Can, Başla'ya basınca harcanır. */
  function openSoloIntro() {
    if (busy || blocked()) return;
    setSoloOpen(true);
  }

  /** Yan Yana penceresinden oyun başladı: oyun ekranına geçilir */
  function onSideStarted(id: string) {
    setSideOpen(false);
    sideRef.current = id;
    setSideId(id);
    setView('side');
  }

  async function startMarathon() {
    if (busy) return;
    if (view !== 'searching' && blocked()) return;
    if (view === 'searching') {
      searchingRef.current = false;
      await cancelSearch();
    }
    setBusy(true);
    const cell = await quietCell();
    const res = await startSolo(cell);
    setBusy(false);
    if (res.error || !res.data) {
      setView('lobby');
      void loadLobby();
      return void notify('Maraton başlamadı', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'alert-circle' });
    }
    runRef.current = res.data;
    setRunId(res.data);
    setView('solo');
  }

  const canPlay = profile?.role !== 'sponsor';
  const info_ = quizInfo(rules, true);
  const pts = lobby?.arena_points ?? [1.25, 1.5, 1.75, 2];

  return (
    <View style={styles.root}>
      {/* Kaydırarak geri: ana ekranda Oyunlar'a, Yan Yana kurulumunda Bilgi Yarışması ana ekranına döner.
          Oyun sürerken kapalı (yalnızca X ile çıkılır). */}
      <Stack.Screen options={{ gestureEnabled: view === 'lobby' || (view === 'side' && !sideId) }} />
      <LinearGradient
        colors={['rgba(124, 140, 255, 0.35)', 'rgba(124, 140, 255, 0.06)', 'rgba(7, 22, 34, 0)']}
        locations={[0, 0.45, 1]}
        style={styles.glow}
      />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardLift style={styles.flex}>
          {view === 'solo' && runId ? (
            <SoloMarathonView
              key={runId}
              runId={runId}
              onLive={onSoloLive}
              onLeave={() => void requestBack()}
              onExit={backToLobby}
              onAgain={() => {
                runRef.current = null;
                setRunId(null);
                setView('lobby');
                void loadLobby().then(() => void startMarathon());
              }}
            />
          ) : view === 'match' && matchId ? (
            <ArenaView
              key={matchId}
              matchId={matchId}
              groupDaily={lobby?.private_group_daily ?? 5}
              onLive={onArenaLive}
              onLeave={() => void requestBack()}
              onExit={backToLobby}
              onAgain={() => {
                matchRef.current = null;
                setMatchId(null);
                setView('lobby');
                void loadLobby().then(() => startSearch());
              }}
              onRequeue={() => {
                matchRef.current = null;
                liveRef.current = { live: false, kind: null, phase: null };
                setMatchId(null);
                searchingRef.current = true;
                setSearch({ since: nowMs(), waiting: 1, startsIn: null });
                setView('searching');
              }}
              onRemoved={() => {
                backToLobby();
                void notify(
                  'Bekleme odasından çıkarıldın',
                  'Süre içinde “Hazırım” demediğin ya da bağlantın koptuğu için odadan çıkarıldın. Canın harcanmadı.',
                  { icon: 'time' },
                );
              }}
            />
          ) : view === 'side' ? (
            <SideBySideView
              key={sideId ?? 'setup'}
              gameId={sideId}
              defaultName={profile?.alias ?? ''}
              todayCount={lobby?.side_today ?? 0}
              dailyLimit={lobby?.side_daily ?? 10}
              onGame={onSideGame}
              onLive={onSideLive}
              onLeave={() => void requestBack()}
              onExit={() => {
                sideRef.current = null;
                liveRef.current = { live: false, kind: null, phase: null };
                setSideId(null);
                setView('lobby');
                void loadLobby();
              }}
            />
          ) : view === 'searching' && search ? (
            <Searching
              seconds={Math.max(0, Math.floor((now - search.since) / 1000))}
              waiting={search.waiting}
              startsIn={search.startsIn}
              avatar={profile?.avatar_index ?? 1}
              onCancel={() => void requestBack()}
              onSolo={() => void startMarathon()}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.header}>
                <Pressable
                  onPress={() => void requestBack()}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={styles.back}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                  <Text style={styles.backText}>Oyunlar</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSoundOn(!sound)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={sound ? 'Sesi kapat' : 'Sesi aç'}
                  testID="quiz-sound"
                  style={({ pressed }) => [styles.soundBtn, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={sound ? 'volume-high' : 'volume-mute'}
                    size={18}
                    color={sound ? colors.highlight : colors.textMuted}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setInfo(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Nasıl oynanır"
                  style={({ pressed }) => [styles.howBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="help-circle" size={16} color={colors.highlight} />
                  <Text style={styles.howText}>Nasıl oynanır?</Text>
                </Pressable>
              </View>

              {/* Başlık kartı (görsel eklenince arka planda görünür) */}
              {/* Küçük başlık kartı: ad ve şu an oynayan kişi sayısı */}
              <LinearGradient
                colors={['#3B1F8F', '#1C1640', '#0A1D2B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                {quizImages.hero ? <Image source={quizImages.hero} contentFit="cover" style={styles.fill} /> : null}
                <Text style={styles.heroTitle} numberOfLines={1}>
                  Bilgi Yarışması
                </Text>
                <View
                  style={styles.onlineChip}
                  accessibilityLabel={`Şu an ${onlineNow ?? lobby?.online ?? 0} kişi oynuyor`}
                >
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineCount}>{lobby ? String(onlineNow ?? lobby.online) : '…'}</Text>
                  <Text style={styles.onlineText}>kişi oynuyor</Text>
                </View>
              </LinearGradient>

              {lobbyErr ? <Text style={styles.err}>{lobbyErr}</Text> : null}
              {!canPlay ? <Text style={styles.err}>Mekân hesapları yarışmaya katılamaz.</Text> : null}

              {lobby ? (
                <LivesBar
                  lives={lobby.lives}
                  max={lobby.max_lives}
                  nextAt={lobby.next_life_at}
                  offsetMs={offset}
                  gamesToday={lobby.games_today}
                  dailyGames={lobby.daily_games}
                  onRefill={() => void loadLobby()}
                  unlimited={lobby.unlimited_lives === true}
                />
              ) : null}
              {lobby && (lobby.points_mult ?? 1) > 1 ? (
                <View style={styles.multNote} testID="quiz-level-mult">
                  <Ionicons name="trending-up" size={16} color={colors.highlight} />
                  <Text style={styles.multNoteText}>
                    {`Seviye 4 ödülü: kazandığın puan ve puan sınırları ×${String(lobby.points_mult).replace('.', ',')}`}
                  </Text>
                </View>
              ) : null}
              {lobby?.champion ? (
                <View style={styles.champBanner}>
                  <Ionicons name="trophy" size={18} color="#1A1200" />
                  <Text style={styles.champText}>
                    {`Geçen hafta Solo Maraton'da ilk 3'tesin! Bu hafta en çok ${lobby.champion_lives} canın var.`}
                  </Text>
                </View>
              ) : null}

              {/* Oyun modları: ortada büyük Solo, yanlarda Uzaktan ve Yan Yana */}
              <View style={styles.modes}>
                <ModeCircle
                  size={92}
                  title="Uzaktan"
                  sub="2–5 kişi"
                  icon="people"
                  colors={['#FF8A1A', '#C2410C']}
                  disabled={!canPlay || busy}
                  onPress={() => setRemoteOpen(true)}
                  testID="quiz-remote"
                />
                <ModeCircle
                  size={132}
                  title="Solo Maraton"
                  sub="12 soru · sandık"
                  icon="trophy"
                  colors={['#9B7BFF', '#4B2FB8']}
                  disabled={!canPlay || busy}
                  onPress={openSoloIntro}
                  testID="quiz-solo"
                  big
                />
                <ModeCircle
                  size={92}
                  title="Yan Yana"
                  sub="Puan kazandırmaz"
                  icon="phone-portrait"
                  colors={['#3B82F6', '#1E3A8A']}
                  disabled={!canPlay || busy}
                  onPress={() => {
                    if (lobby && lobby.questions < MIN_QUESTIONS) return void blocked();
                    setSideOpen(true);
                  }}
                  testID="quiz-side"
                />
              </View>

              {/* Puan hedefleri */}
              <View style={styles.goals}>
                <PointGoal
                  label="Bugünkü hedef"
                  value={Number(lobby?.points_today ?? 0)}
                  max={lobby?.daily_points ?? 10}
                  icon="today"
                />
                <PointGoal
                  label="Bu ayın hedefi"
                  value={Number(lobby?.points_month ?? 0)}
                  max={lobby?.month_points ?? 125}
                  icon="calendar"
                />
                <Pressable
                  onPress={() => setPointsOpen(true)}
                  accessibilityRole="button"
                  testID="quiz-points"
                  style={({ pressed }) => [styles.pointsBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="stats-chart" size={16} color="#1A1200" />
                  <Text style={styles.pointsBtnText}>Puan sistemi</Text>
                </Pressable>
              </View>

              <View style={styles.stats}>
                <StatBox label="Oyun" value={String(lobby?.plays ?? 0)} icon="game-controller" />
                <StatBox label="Kazanma" value={String(lobby?.wins ?? 0)} icon="ribbon" />
                <StatBox
                  label={lobby?.week_place ? `Bu hafta · ${lobby.week_place}. sıra` : 'Bu hafta (Solo)'}
                  value={`${lobby?.week_total ?? 0} doğru`}
                  icon="podium"
                />
              </View>

              {/* Sıralamalar artık genel Sıralama ekranında (Oyunlar → Bilgi Yarışması), ödülleriyle */}
              <Pressable
                onPress={() => router.push({ pathname: '/siralama', params: { game: 'quiz' } })}
                accessibilityRole="button"
                testID="quiz-rank-link"
                style={({ pressed }) => [styles.rankLink, pressed && styles.pressed]}
              >
                <Ionicons name="podium" size={20} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.rankLinkTitle}>Sıralamalar ve ödüller</Text>
                  <Text style={styles.rankLinkSub}>Solo / Hafta · Çoklu / Ay</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              {lobby && lobby.champions.length > 0 ? (
                <Text style={styles.rankNote}>
                  {`Geçen haftanın Solo şampiyonları: ${lobby.champions.map((c) => `${c.place}. ${c.alias}`).join(' · ')}`}
                </Text>
              ) : null}

              <GameLinks game="quiz" />
            </ScrollView>
          )}
        </KeyboardLift>
      </SafeAreaView>

      <InfoModal
        visible={info}
        onClose={() => setInfo(false)}
        title={info_.title}
        icon={info_.icon}
        items={info_.items}
      />
      {pointsOpen ? <PointsPopup lobby={lobby} onClose={() => setPointsOpen(false)} /> : null}
      {soloOpen ? (
        <SoloMenu
          lobby={lobby}
          busy={busy}
          onClose={() => setSoloOpen(false)}
          onStart={() => {
            setSoloOpen(false);
            void startMarathon();
          }}
        />
      ) : null}
      {sideOpen ? (
        <SideMenu
          defaultName={profile?.alias ?? ''}
          todayCount={lobby?.side_today ?? 0}
          dailyLimit={lobby?.side_daily ?? 10}
          onClose={() => setSideOpen(false)}
          onStarted={onSideStarted}
        />
      ) : null}
      {remoteOpen ? (
        <RemoteMenu
          busy={busy}
          points={pts}
          groupDaily={lobby?.private_group_daily ?? 5}
          waitSeconds={lobby?.arena_ready_seconds ?? 30}
          onClose={() => setRemoteOpen(false)}
          onRandom={startSearch}
          onCreate={() => void createRoom()}
          onJoin={joinRoom}
        />
      ) : null}
    </View>
  );
}

/** Yuvarlak mod düğmesi (Solo büyük, diğerleri küçük) */
function ModeCircle({
  size,
  title,
  sub,
  icon,
  colors: grad,
  disabled,
  onPress,
  testID,
  big = false,
  badge,
  note,
}: {
  size: number;
  title: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  colors: [string, string];
  disabled: boolean;
  onPress: () => void;
  testID: string;
  big?: boolean;
  badge?: string;
  /** Alt satırda küçük uyarı (ör. "Puan kazanılmaz") */
  note?: string;
}) {
  return (
    <View style={[styles.modeCol, { width: Math.max(size, 100) }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${sub}`}
        testID={testID}
        style={({ pressed }) => [
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, shadowColor: grad[0] },
          disabled && styles.disabled,
          pressed && styles.circlePressed,
        ]}
      >
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius: size / 2 }]}
        />
        <View style={[styles.circleInner, { borderRadius: size / 2 }]} />
        <Ionicons name={icon} size={big ? 50 : 34} color="#FFFFFF" />
        {big ? <Text style={styles.circleGo}>OYNA</Text> : null}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={[styles.modeTitle, big && styles.modeTitleBig]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.modeSub} numberOfLines={1}>
        {sub}
      </Text>
      {note ? (
        <View style={styles.modeNote}>
          <Text style={styles.modeNoteText} numberOfLines={2}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Uzaktan: rastgele eşleş, oda kur ya da kodla katıl */
function RemoteMenu({
  busy,
  points,
  groupDaily,
  waitSeconds,
  onClose,
  onRandom,
  onCreate,
  onJoin,
}: {
  busy: boolean;
  points: number[];
  groupDaily: number;
  waitSeconds: number;
  onClose: () => void;
  onRandom: () => void;
  onCreate: () => void;
  onJoin: (code: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const clean = code
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  return (
    <Popup title="Uzaktan oyna" subtitle="2–5 kişi · 5 raunt · yaklaşık 5 dakika" icon="people" onClose={onClose}>
      {/* Arkadaşlarınla: kodla katıl / oda kur (küçük) */}
      <View style={styles.friendBox}>
        <Text style={styles.friendLabel}>Arkadaşlarınla</Text>
        <View style={styles.joinRow}>
          <TextInput
            value={clean}
            onChangeText={(v) => {
              setCode(v);
              setErr(null);
            }}
            placeholder="ODA KODU"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            style={[styles.codeInput, clean.length > 0 && styles.codeInputFilled]}
            accessibilityLabel="Oda kodu"
            testID="quiz-room-code"
          />
          <Pressable
            onPress={async () => setErr(await onJoin(clean))}
            disabled={busy || clean.length !== 5}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.joinBtn,
              (busy || clean.length !== 5) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.joinText}>Katıl</Text>
          </Pressable>
          <Pressable
            onPress={onCreate}
            disabled={busy}
            accessibilityRole="button"
            testID="quiz-create-room"
            style={({ pressed }) => [styles.createBtn, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={16} color={colors.text} />
            <Text style={styles.createText}>Oda kur</Text>
          </Pressable>
        </View>
        {err ? <Text style={styles.err}>{err}</Text> : null}
      </View>

      {/* Asıl seçenek: rastgele eşleş (oynat düğmesi) */}
      <View style={styles.playWrap}>
        <PlayButton
          label="Rastgele eşleş"
          iconOnly
          size={112}
          disabled={busy}
          onPress={onRandom}
          testID="quiz-random"
        />
        <Text
          style={styles.playSub}
        >{`Haritanın her yerinden 2–5 kişi · bekleme odasında ${waitSeconds} sn içinde “Hazırım”`}</Text>
      </View>

      <JokerPreview
        title="Sandıktan çıkan jokerler"
        size="xxs"
        items={ARENA_JOKERS.map((k) => ({
          key: k,
          look: cardLook(k),
          desc: CARD_INFO[k].desc,
          tag: TONE_LABEL[CARD_INFO[k].tone],
        }))}
      />

      {/* Kazanana puan: kaydırmadan görünsün diye 4 kutu yan yana */}
      <View style={styles.ptable}>
        <Text style={styles.ptableTitle}>Kazanana puan</Text>
        <View style={styles.pgrid}>
          {[2, 3, 4, 5].map((n, i) => (
            <View key={n} style={[styles.pcell, i > 0 && styles.pcellLine]}>
              <Text style={styles.pcellKey}>{`${n} kişi`}</Text>
              <Text style={styles.pcellVal}>{`+${fmtPts(points[i])}`}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.pfoot}>
          {'Kaybeden: '}
          <Text style={styles.pfootStrong}>0 (puan düşmez)</Text>
          {' · Özel oda, aynı kişilerle: '}
          <Text style={styles.pfootStrong}>{`günde en çok ${groupDaily}`}</Text>
        </Text>
      </View>
    </Popup>
  );
}

/** İki sütunlu küçük puan tablosu */
function PointsTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <View style={styles.ptable}>
      <Text style={styles.ptableTitle}>{title}</Text>
      {rows.map(([k, v], i) => (
        <View key={k} style={[styles.prow, i % 2 === 1 && styles.prowAlt]}>
          <Text style={styles.pkey}>{k}</Text>
          <Text style={styles.pval}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** “Puan sistemi” penceresi: Bilgi Yarışması'nda puanın nasıl kazanıldığı, tablolarla */
function PointsPopup({ lobby, onClose }: { lobby: QuizLobby | null; onClose: () => void }) {
  const p = lobby?.arena_points ?? [1.25, 1.5, 1.75, 2];
  return (
    <Popup
      title="Puan sistemi"
      subtitle="Bilgi Yarışması'nda genel puan nasıl kazanılır?"
      icon="stats-chart"
      onClose={onClose}
    >
      <PointsTable
        title="Solo Maraton (ulaştığın en yüksek basamak)"
        rows={[
          ['4 doğru ve altı', '0'],
          ['5 doğru', '+1'],
          ['8 doğru', '+1.2'],
          ['12 doğru (tamamı)', '+1.5'],
        ]}
      />
      <PointsTable
        title="Uzaktan (yalnızca kazanan alır)"
        rows={[
          ['2 kişilik maç', `+${fmtPts(p[0])}`],
          ['3 kişilik maç', `+${fmtPts(p[1])}`],
          ['4 kişilik maç', `+${fmtPts(p[2])}`],
          ['5 kişilik maç', `+${fmtPts(p[3])}`],
          ['Kaybeden / berabere', '0 (puan düşmez)'],
          ['Puan için en az', '4 doğru'],
        ]}
      />
      <PointsTable
        title="Sınırlar"
        rows={[
          ['Günde en çok', `${lobby?.daily_points ?? 10} puan`],
          ['Ayda en çok', `${lobby?.month_points ?? 125} puan`],
          ['Özel oda (aynı kişilerle)', `günde ${lobby?.private_group_daily ?? 5} puan`],
          ['Günde en çok oyun', `${lobby?.daily_games ?? 25}`],
          ['Can', `en çok ${lobby?.max_lives ?? 5}, ${lobby?.life_minutes ?? 30} dk'da 1 dolar`],
        ]}
      />
      <PointsTable
        title="Sıralama ödülleri"
        rows={[
          ['Solo / Hafta ilk 3', `sonraki hafta ${lobby?.champion_lives ?? 10} can`],
          ['Çoklu / Ay ilk 3', '1 aylık abonelik'],
          ['Hesabı doğrulanmamış üye', 'ödül alamaz (sıradaki doğrulanmış üyeye geçer)'],
        ]}
      />
      <Text style={styles.ptableNote}>
        Solo / Hafta sıralamasında haftanın bütün doğruları toplanır; yalnızca en az 5 doğrulu (puan getiren) koşular
        sayılır. Bilgi Yarışması puanları genel puanına eklenir ama petek sıralamasına sayılmaz.
      </Text>
    </Popup>
  );
}

/** Solo Maraton penceresi: kurallar, basamak puanları, jokerler, Başla. Başla'ya basınca 3'ten geri sayılır;
 * bu sırada büyük kırmızı Vazgeç ile çıkılabilir (can, geri sayım bitince harcanır). Pencere kapanırsa da vazgeçilmiş olur. */
function SoloMenu({
  lobby,
  busy,
  onClose,
  onStart,
}: {
  lobby: QuizLobby | null;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [pop] = useState(() => new Animated.Value(1));
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);
  useEffect(() => {
    if (count === null) return;
    pop.setValue(1.6);
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    if (count > 1) playSound('tick', 0.7);
    const t = setTimeout(() => {
      if (count <= 1) {
        setCount(null);
        onStartRef.current();
      } else setCount(count - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [count, pop]);

  if (count !== null) {
    return (
      <Popup title="Solo Maraton" icon="trophy" onClose={onClose} testID="solo-menu">
        <View style={styles.countRoot} testID="solo-countdown">
          <Text style={styles.countLabel}>Solo Maraton başlıyor</Text>
          <Animated.Text style={[styles.countNum, { transform: [{ scale: pop }] }]}>{count}</Animated.Text>
          <Pressable
            onPress={() => setCount(null)}
            accessibilityRole="button"
            testID="solo-countdown-cancel"
            style={({ pressed }) => [styles.cancelBtn, styles.countCancel, pressed && styles.pressed]}
          >
            <Ionicons name="close-circle" size={26} color="#FFFFFF" />
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
          <Text style={styles.countHint}>Vazgeçersen can harcanmaz.</Text>
        </View>
      </Popup>
    );
  }

  return (
    <Popup
      title="Solo Maraton"
      subtitle="12 soru · kolaydan zora · ilk yanlışta biter · 1 can"
      icon="trophy"
      onClose={onClose}
      testID="solo-menu"
    >
      <LinearGradient
        colors={['#9B7BFF', '#4B2FB8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.introHero}
      >
        <PlayButton
          label="Solo Maratonu başlat"
          iconOnly
          size={100}
          disabled={busy}
          onPress={() => {
            playSound('start');
            setCount(COUNTDOWN);
          }}
          testID="solo-start"
        />
        <Text style={styles.introLives}>
          {lobby?.unlimited_lives ? 'Sınırsız can' : `${lobby?.lives ?? 0}/${lobby?.max_lives ?? 5} can`}
        </Text>
      </LinearGradient>
      <View style={styles.introCard}>
        <IntroLine icon="speedometer" text="İlk soru 20 sn; her soruda 1 sn kısalır (en az 9 sn)." />
        <IntroLine icon="close-circle" text="Yanlış cevap ya da süre dolması maratonu bitirir." />
        <IntroLine
          icon="podium"
          text="Haftalık sıralamaya en az 5 doğrulu koşular sayılır. İlk 3'e sonraki hafta 10 can!"
        />
      </View>
      <View style={styles.milestones}>
        {[
          { at: 5, pts: '+1' },
          { at: 8, pts: '+1.2' },
          { at: 12, pts: '+1.5' },
        ].map((m) => (
          <View key={m.at} style={styles.milestone}>
            <Text style={styles.milestoneAt}>{`${m.at} doğru`}</Text>
            <Text style={styles.milestonePts}>{`${m.pts} puan`}</Text>
          </View>
        ))}
      </View>
      <JokerPreview
        title="Sandıktan çıkabilecek jokerler"
        size="xxs"
        items={SOLO_JOKERS.map((k) => ({ key: k, look: jokerLook(k), desc: JOKER_INFO[k].desc }))}
      />
    </Popup>
  );
}

/** Yan Yana penceresi: iki oyuncunun adı ve Başla. Oyun başlayınca Yan Yana oyun ekranı açılır. */
function SideMenu({
  defaultName,
  todayCount,
  dailyLimit,
  onClose,
  onStarted,
}: {
  defaultName: string;
  todayCount: number;
  dailyLimit: number;
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [name1, setName1] = useState(defaultName);
  const [name2, setName2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = Math.max(0, dailyLimit - todayCount);

  async function start() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await sideStart(name1, name2);
    setBusy(false);
    if (res.error || !res.data) return setErr(res.error ?? 'Oyun başlatılamadı.');
    playSound('start');
    onStarted(res.data);
  }

  return (
    <Popup
      title="Yan Yana"
      subtitle="Tek telefonda 2 kişi · 3 raunt × 3 soru · puan vermez, can harcamaz"
      icon="phone-portrait"
      onClose={onClose}
      testID="side-menu"
    >
      <View style={styles.sideStart}>
        <PlayButton
          label="BAŞLA"
          size={104}
          disabled={busy || left < 1}
          onPress={() => void start()}
          testID="side-start"
          colors={['#5EA8FF', '#1E40AF']}
        />
      </View>
      <Text style={styles.sideText}>
        Telefonu ikinizin ortasına koyun. Ekran ikiye bölünür; üst yarı karşıda oturan için ters döner. Her raunt başında
        kategori seçin. Şıkların yeri ve rengi ikinizde farklıdır.
      </Text>
      <View style={styles.sideNames}>
        <View style={styles.flex}>
          <TextField label="Alttaki oyuncu" value={name1} onChangeText={setName1} maxLength={14} placeholder="1. Oyuncu" />
        </View>
        <View style={styles.flex}>
          <TextField label="Üstteki oyuncu" value={name2} onChangeText={setName2} maxLength={14} placeholder="2. Oyuncu" />
        </View>
      </View>
      <Text style={styles.sideNote}>
        {'Bugün '}
        <Text style={styles.sideNoteStrong}>{`${todayCount}/${dailyLimit}`}</Text>
        {' Yan Yana oyunu'}
      </Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </Popup>
  );
}

function IntroLine({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.introLine}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.introLineText}>{text}</Text>
    </View>
  );
}

/** Arama ekranındaki harita: Kocaeli peteklerinin üzerinde büyüteçli avatar dolaşır */
function SearchMap({ avatar }: { avatar: number }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  useEffect(() => {
    if (box.w === 0) return;
    let alive = true;
    const go = () => {
      if (!alive) return;
      Animated.timing(pos, {
        toValue: { x: 30 + Math.random() * Math.max(0, box.w - 110), y: 20 + Math.random() * Math.max(0, box.h - 110) },
        duration: 1300 + Math.random() * 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setTimeout(go, 250);
      });
    };
    go();
    return () => {
      alive = false;
      pos.stopAnimation();
    };
  }, [box, pos]);
  return (
    <View
      style={styles.searchMap}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      pointerEvents="none"
    >
      <HoneycombMap density={[]} selected={null} onSelect={() => {}} hideControls />
      <Animated.View style={[styles.seeker, { transform: pos.getTranslateTransform() }]}>
        <Avatar index={avatar} size={58} ring />
        <View style={styles.lens}>
          <Ionicons name="search" size={26} color="#1A1200" />
        </View>
      </Animated.View>
    </View>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Rakip aranırken: nabız gibi büyüyen halkalar, toplanan kişi sayısı, başlama sayacı, vazgeç ve Solo önerisi */
function Searching({
  seconds,
  waiting,
  startsIn,
  avatar,
  onCancel,
  onSolo,
}: {
  seconds: number;
  waiting: number;
  startsIn: number | null;
  avatar: number;
  onCancel: () => void;
  onSolo: () => void;
}) {
  return (
    <View style={styles.search} testID="quiz-searching">
      <Text style={styles.searchTitle}>Rakipler aranıyor…</Text>
      <SearchMap avatar={avatar} />
      <View style={styles.seats}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={[styles.seat, i < waiting && styles.seatOn]}>
            <Ionicons
              name={i < waiting ? 'person' : 'person-outline'}
              size={16}
              color={i < waiting ? '#1A1200' : colors.textMuted}
            />
          </View>
        ))}
      </View>
      <Text style={styles.searchSub}>
        {waiting >= 2 && startsIn !== null && seconds >= SEARCH_MIN
          ? `${waiting} kişi bekliyor`
          : 'Haritanın her yerinden rakip aranıyor. 2 kişi olunca bekleme odası açılır.'}
      </Text>
      <Text style={styles.searchTime}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
      <Text style={styles.searchHint}>Bekleme odasında “Hazırım” deyince maç başlar; can o zaman harcanır.</Text>
      <View style={styles.privacy}>
        <Ionicons name="eye-off" size={16} color={colors.event} />
        <Text style={styles.privacyText}>Gerçek adın görünmez; rakiplerin yalnızca rumuzunu ve avatarını görür.</Text>
      </View>
      {seconds >= SUGGEST_SOLO_AFTER && waiting < 2 ? (
        <Pressable
          onPress={onSolo}
          accessibilityRole="button"
          style={({ pressed }) => [styles.soloBtn, pressed && styles.pressed]}
        >
          <Ionicons name="trophy" size={18} color={colors.text} />
          <Text style={styles.soloText}>Beklemek yerine Solo Maraton oyna</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        testID="quiz-search-cancel"
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
      >
        <Ionicons name="close-circle" size={22} color="#FFFFFF" />
        <Text style={styles.cancelText}>Vazgeç</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, pointerEvents: 'none' },
  flex: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  err: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -4, paddingVertical: 4 },
  backText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  /** Kod yazılınca harf aralığı açılır (örnek yazı bozulmasın diye yalnızca doluyken) */
  codeInputFilled: { fontFamily: fonts.black, fontSize: fontSizes.md, letterSpacing: 4 },
  soundBtn: {
    marginLeft: 'auto',
    marginRight: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  howBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  howText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  heroTitle: { flexShrink: 1, color: '#F2FAFF', fontFamily: fonts.black, fontSize: fontSizes.lg, letterSpacing: 0.5 },
  onlineCount: {
    color: '#4ADE80',
    fontFamily: fonts.black,
    fontSize: fontSizes.md,
    fontVariant: ['tabular-nums'],
  },
  rankLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.4)',
  },
  rankLinkTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  rankLinkSub: { color: colors.textMuted, fontSize: 12 },
  countRoot: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.lg },
  countLabel: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: fontSizes.md },
  countNum: { color: colors.primary, fontFamily: fonts.black, fontSize: 140, lineHeight: 160 },
  countCancel: { alignSelf: 'stretch' },
  countHint: { color: colors.textMuted, fontSize: fontSizes.sm },
  heroSub: { color: 'rgba(244, 246, 251, 0.85)', fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 19 },
  onlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    // Koyu başlık kartının üstünde: açık/koyu temada hep okunur sabit renkler
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  onlineText: { color: '#F2FAFF', fontSize: 12, fontFamily: fonts.semi },
  modes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  modeCol: { alignItems: 'center', gap: 4 },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  circleInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  circlePressed: { transform: [{ scale: 0.95 }] },
  circleGo: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12, letterSpacing: 2, marginTop: 2 },
  badge: {
    position: 'absolute',
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: fonts.black },
  modeTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  modeTitleBig: { fontFamily: fonts.black, fontSize: fontSizes.md },
  modeSub: { color: colors.textMuted, fontSize: 10 },
  modeNote: {
    maxWidth: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  modeNoteText: { color: '#93C5FD', fontSize: 12, lineHeight: 15, fontFamily: fonts.extra, textAlign: 'center' },
  goals: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.35)',
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  statLabel: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  rankCard: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  rankTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
  },
  rankRowMe: { backgroundColor: 'rgba(124, 140, 255, 0.18)' },
  rankPlace: {
    width: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.extra,
    fontSize: fontSizes.sm,
  },
  rankAlias: { flex: 1, color: colors.text, fontSize: fontSizes.md },
  rankScore: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  rankTime: { width: 74, textAlign: 'right', color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  rankNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2, lineHeight: 16 },
  remoteBig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  remoteTitle: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.lg },
  remoteSub: { color: '#1A1200', fontSize: 12, fontFamily: fonts.semi, opacity: 0.85 },
  remoteNote: { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 15, marginTop: 6 },
  remoteLabel: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginBottom: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  joinRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  codeInput: {
    flex: 1,
    height: 40,
    color: colors.text,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  joinBtn: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { color: colors.primaryText, fontFamily: fonts.black, fontSize: fontSizes.md },
  search: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  searchMap: {
    alignSelf: 'stretch',
    height: 300,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  seeker: { position: 'absolute', top: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  lens: {
    position: 'absolute',
    right: -14,
    bottom: -12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  champBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  champText: { flex: 1, color: '#1A1200', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  rankTabs: { flexDirection: 'row', gap: spacing.sm },
  rankTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankTabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rankTabText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  rankTabTextOn: { color: '#1A1200' },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.md,
    backgroundColor: 'rgba(34, 211, 197, 0.1)',
  },
  prizeText: { flex: 1, color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  medal: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 12 },
  introRoot: { flex: 1, padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  introLives: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  introHero: { alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radii.lg, overflow: 'hidden' },
  introTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.xl, marginTop: 4 },
  introSub: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.semi, fontSize: fontSizes.sm },
  introCard: { gap: 8, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt },
  introLine: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  introLineText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  milestones: { flexDirection: 'row', gap: spacing.sm },
  milestone: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.45)',
  },
  milestoneAt: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  milestonePts: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.lg },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 62,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  startText: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.xl },
  introNote: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  searchTitle: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.xxl, textAlign: 'center' },
  seats: { flexDirection: 'row', gap: spacing.sm },
  seat: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  seatOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  searchSub: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  searchTime: { color: colors.primary, fontFamily: fonts.black, fontSize: 44, fontVariant: ['tabular-nums'] },
  searchHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(53, 214, 195, 0.12)',
  },
  privacyText: { flexShrink: 1, color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  soloBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  soloText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  cancelBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: colors.danger,
  },
  cancelText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.lg },
  pointsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  pointsBtnText: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.sm },
  friendBox: { gap: 6, marginBottom: spacing.md },
  friendLabel: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: 12 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12 },
  playWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  playBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#FF8A1A',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  playIcon: { marginLeft: 8 },
  playLabel: { color: '#1A1200', fontFamily: fonts.black, fontSize: 13, letterSpacing: 1, marginTop: -2 },
  playSub: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  ptable: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  ptableTitle: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
  },
  prow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8 },
  prowAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  pkey: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
  pval: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.sm, textAlign: 'right' },
  ptableNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  pgrid: { flexDirection: 'row' },
  multNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.45)',
    backgroundColor: 'rgba(255, 200, 61, 0.08)',
  },
  multNoteText: { flex: 1, color: colors.highlight, fontFamily: fonts.semi, fontSize: 12 },
  pcell: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  pcellLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  pcellKey: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 12 },
  pcellVal: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.md },
  pfoot: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pfootStrong: { color: colors.text, fontFamily: fonts.extra },
  sideStart: { alignItems: 'center', paddingVertical: spacing.xs },
  sideText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  sideNames: { flexDirection: 'row', gap: spacing.sm },
  sideNote: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  sideNoteStrong: { color: colors.highlight, fontFamily: fonts.extra },
});
