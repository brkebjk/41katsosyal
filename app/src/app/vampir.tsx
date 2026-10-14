import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Pressable, Share, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { InfoModal } from '@/components/InfoModal';
import { InviteSheet } from '@/components/InviteSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoleIcon } from '@/components/RoleIcon';
import { useSafetyMenu } from '@/components/SafetyMenu';
import { Screen } from '@/components/Screen';
import {
  CommandFlash,
  KickBar,
  KickPopup,
  PhaseFlash,
  PlayerCard,
  PlayerList,
  Prompt,
  RankTable,
  RichLine,
  RoleRoster,
  RoleWheel,
  SeatGrid,
  Shake,
  SkSheet,
  TimeBar,
  circ,
  seatTag,
  type CardButton,
  type RankRow,
  type Seat,
  type SeatEvent,
  type SeatMark,
} from '@/components/SharkStage';
import { SharkChat, type ChatTab, type ChatTabInfo } from '@/components/SharkChat';
import { PushToTalk, useClipQueue, useListeningToMe } from '@/components/SharkVoice';
import { SoundToggle } from '@/components/SoundToggle';
import { InfoCard, useElapsedSeconds } from '@/components/VampireParts';
import { G, GameButton, Glass, NextRoomButton, Pill, SkipRound, ToolButton } from '@/components/VampireStage';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { crewTargetStatus, inviteToCrew, type CrewTarget } from '@/lib/crew';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING, sendRequestInRoom } from '@/lib/friends';
import { HOW_TO_PLAY, VAMPIRE_RANK_ITEM } from '@/lib/gameInfo';
import { vampireImages } from '@/lib/images';
import { fmtPts } from '@/lib/labels';
import { getMyGameResult, getPointRules, type MyGameResult, type PointRules } from '@/lib/ranking';
import { joinRoomWithLocation, leaveRoom } from '@/lib/rooms';
import type { Result } from '@/lib/rpc';
import { kickStart, kickVote, reportVoiceClip, takeSeat, type SkMsg, type SkPlayer, type SkRole } from '@/lib/shark';
import { initSounds, playSound, releaseSounds } from '@/lib/sounds';
import { isBackendReady } from '@/lib/supabase';
import {
  addTestBots,
  beginNight,
  beginVote,
  castVote,
  endNight,
  endVote,
  getVampireHistory,
  getVampireView,
  markRoleSeen,
  nightAction,
  reportDeadMessage,
  ROLES,
  skipDiscussion,
  startVampireGame,
  VV_NOT_IN_ROOM,
  VV_ROOM_GONE,
  vvIsWinner,
  vvLobbyReady,
  vvSay,
  vvWinnerText,
  type VvLog,
  type VvPlayer,
  type VvRole,
  type VvView,
} from '@/lib/vampire';
import { fonts } from '@/theme';

// Vampir–Köylü oyun ekranı: Köpekbalığı Kafesi ekranının aynısı (numaralı avatar ızgarası, üst tabela, komut yazısı,
// yüzen yazışma, rol çarkı, oyuncu penceresi, atma oylaması, bas-konuş, sıralama tablosu). Kurallar ve roller
// Vampir–Köylü'nün kendisidir: vampirler gece ısırır, doktor korur, dedektif bakar, sabah konuşulur, oyla köyden
// çıkarılır. Ölenin rolü herkese açıklanır.

const POLL_MS = 2000;
const KEEP_AWAKE_TAG = 'vampir-koylu';
/** Çarktaki roller (yeni roller buraya eklenir) */
const VV_WHEEL: VvRole[] = ['vampire', 'doctor', 'detective', 'villager'];
const TEAM = {
  evil: { name: 'Vampirler', emoji: '🧛', color: '#9B7BFF' },
  good: { name: 'Köylüler', emoji: '🏡', color: '#FFB020' },
} as const;

type Slot = 'hunt' | 'ability' | 'vote';
type Phase = VvView['phase'];

function goToGames() {
  if (router.canGoBack()) router.back();
  else router.replace('/games');
}

function closedText(reason: string | null, isHost: boolean): string {
  if (reason === 'quit') {
    return isHost ? 'Odadan ayrıldığın için oda kapandı.' : 'Oda sahibi odadan ayrıldığı için oyun kapandı.';
  }
  if (reason === 'timeout') {
    return isHost ? 'Bağlantın uzun süre koptuğu için oda kapandı.' : 'Oda sahibinin bağlantısı koptuğu için oyun kapandı.';
  }
  if (reason === 'inactive') return 'Uzun süre kimse bir şey yapmadığı için oyun kapandı.';
  return 'Oyunu açan kişi odayı kapattı.';
}

/** Android Geri tuşu: oyundan sessizce çıkılmasın */
function BackBlocker({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true;
    });
    return () => sub.remove();
  }, [enabled]);
  return null;
}

/** Köy sahnesi: gece / sabah görseli, oyun sonunda kazanan takımın görseli; yazılar okunsun diye karartılır */
function VillageBackdrop({ phase, winner }: { phase: Phase; winner: VvView['winner'] }) {
  const src =
    phase === 'ended'
      ? winner === 'vampire'
        ? vampireImages.win_vampires
        : vampireImages.win_villagers
      : phase === 'dawn' || phase === 'vote' || phase === 'vote_result'
        ? vampireImages.scene_day
        : vampireImages.scene_night;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={src} contentFit="cover" style={StyleSheet.absoluteFill} transition={500} />
      <LinearGradient
        colors={['rgba(8,4,20,0.45)', 'rgba(8,4,20,0.6)', 'rgba(8,4,20,0.85)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function VampireScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  if (!id) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Oda bulunamadı">Oyunlar sekmesinden açılan bir odaya katıl ya da kendin bir oda aç.</InfoCard>
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      </Screen>
    );
  }
  return <Game key={id} roomId={id} />;
}

function Game({ roomId }: { roomId: string }) {
  const { width, height } = useWindowDimensions();
  const [view, setView] = useState<VvView | null>(null);
  const [viewAt, setViewAt] = useState(0);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connError, setConnError] = useState(false);
  const [gone, setGone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  /** Takım arkadaşına av denemesi: atılan simge titreyip geri döner, kısa uyarı çıkar */
  const [bounce, setBounce] = useState<{ to: string; nonce: number } | null>(null);
  const [sheet, setSheet] = useState<'role' | 'result' | 'players' | null>(null);
  const [card, setCard] = useState<string | null>(null);
  /** Oyuncu penceresi açılınca: bu kişiyi klanıma davet edebilir miyim? (arkadaşsak) */
  const [crewInfo, setCrewInfo] = useState<{ id: string; t: CrewTarget } | null>(null);
  useEffect(() => {
    if (!card) return;
    let alive = true;
    void crewTargetStatus(roomId, card).then((t) => {
      if (alive && t) setCrewInfo({ id: card, t });
    });
    return () => {
      alive = false;
    };
  }, [card, roomId]);
  const [kickSeen, setKickSeen] = useState<string | null>(null);
  const [topBottom, setTopBottom] = useState(56);
  const [resultClosed, setResultClosed] = useState(-1);
  const [chatTab, setChatTab] = useState<ChatTab | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [wheelDone, setWheelDone] = useState(false);
  const [result, setResult] = useState<{ data: MyGameResult | null; rules: PointRules } | null>(null);
  const safety = useSafetyMenu({ type: 'room', id: roomId }, { emergency: view?.remote !== true });
  const lock = useRef(false);
  const loadSeq = useRef(0);
  const hasView = useRef(false);
  const leaving = useRef(false);
  const lastKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!isBackendReady || leaving.current) return;
    const my = ++loadSeq.current;
    const res = await getVampireView(roomId);
    if (my !== loadSeq.current || leaving.current) return;
    if (res.error || !res.view) {
      if (hasView.current && (res.error === VV_NOT_IN_ROOM || res.error === VV_ROOM_GONE)) setGone(true);
      else if (hasView.current) setConnError(true);
      else setLoadError(res.error ?? 'Oyun okunamadı.');
      setLoaded(true);
      return;
    }
    setLoadError(null);
    setConnError(false);
    hasView.current = true;
    const key = `${res.view.phase}:${res.view.round}`;
    if (lastKey.current !== null && lastKey.current !== key) Vibration.vibrate(150);
    lastKey.current = key;
    setView(res.view);
    setViewAt(Date.now());
    setLoaded(true);
  }, [roomId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  const live = !gone && (view === null || (view.phase !== 'ended' && view.phase !== 'cancelled' && !view.me.left));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [live, load]);

  const ended = view?.phase === 'ended';
  const wasPlayer = view?.me.is_player === true;
  useEffect(() => {
    if (!ended || !wasPlayer) return;
    let active = true;
    void Promise.all([getMyGameResult(roomId), getPointRules()]).then(([data, rules]) => {
      if (active) setResult({ data, rules });
    });
    return () => {
      active = false;
    };
  }, [ended, wasPlayer, roomId]);

  const stayAwake = live && view !== null;
  useEffect(() => {
    if (!stayAwake) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [stayAwake]);

  const elapsed = useElapsedSeconds(
    viewAt,
    live && view !== null && (view.status === 'playing' || (view.rematch_left ?? null) !== null || (view.match_left ?? null) !== null || !!view.kick?.poll),
  );

  // ---- Bas-konuş (uzaktan oda) ------------------------------------------------------------------
  const [recording, setRecording] = useState(false);
  const voiceOn = !!view && view.remote === true && view.status === 'playing' && !view.me.left && live;
  const myPlayerId = view?.players.find((p) => p.is_me)?.id ?? null;
  const clipQueue = useClipQueue(view?.voice, myPlayerId, voiceOn, recording);
  const listeningToMe = useListeningToMe(view?.voice, myPlayerId, 0, voiceOn);

  // ---- Sesler ------------------------------------------------------------------------------------
  useEffect(() => {
    void initSounds();
    return () => releaseSounds();
  }, []);
  const soundKey = view ? `${view.phase}:${view.round}` : null;
  const lastSound = useRef<string | null>(null);
  useEffect(() => {
    if (!view || !soundKey || lastSound.current === soundKey) return;
    const first = lastSound.current === null;
    lastSound.current = soundKey;
    if (first) return;
    if (view.phase === 'reveal') playSound('vv_reveal');
    else if (view.phase === 'night') playSound('vv_night');
    else if (view.phase === 'dawn') {
      playSound('vv_day');
      if ((view.last_night?.killed.length ?? 0) > 0) setTimeout(() => playSound('vv_kill', 0.9), 1200);
    } else if (view.phase === 'vote') playSound('vv_vote');
    else if (view.phase === 'vote_result') playSound(view.last_vote?.executed ? 'vv_exile' : 'vv_vote');
    else if (view.phase === 'ended') playSound(vvIsWinner(view.winner, view.me.role) ? 'vv_win' : 'vv_lose');
  }, [soundKey, view]);
  const remain =
    view && view.status === 'playing' && view.phase_limit !== null
      ? Math.max(0, view.phase_limit - view.phase_age - elapsed)
      : -1;
  const remainSec = Math.ceil(remain);
  const lastClock = useRef(-1);
  useEffect(() => {
    if (remainSec < 1 || remainSec > 5 || lastClock.current === remainSec) return;
    lastClock.current = remainSec;
    playSound('vv_clock', 0.7);
  }, [remainSec]);

  async function act(
    key: string,
    fn: () => Promise<Result>,
    options: { confirm?: () => Promise<boolean>; after?: () => void } = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    try {
      if (options.confirm && !(await options.confirm())) return;
      setBusy(key);
      setActionError(null);
      const res = await fn();
      if (res.error) setActionError(res.error);
      else options.after?.();
      await load();
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }

  if (!loaded || (!view && !loadError && !gone)) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <Text style={styles.loading}>Oyun yükleniyor…</Text>
      </Screen>
    );
  }
  if (gone) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Odadan çıkarıldın" tone="danger">
          Bekleme odasından ayrıldığında, yeni elde “Hazırım” demediğinde ya da bağlantın uzun süre koptuğunda listeden çıkarılırsın.
        </InfoCard>
        <PrimaryButton label="Oyunlara dön" onPress={goToGames} />
      </Screen>
    );
  }
  if (!view) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Oyun açılamadı" tone="danger">
          {loadError ?? 'Oyun okunamadı.'}
        </InfoCard>
        <PrimaryButton label="Tekrar dene" onPress={() => void load()} />
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      </Screen>
    );
  }

  // ===============================================================================================
  const me = view.me;
  const phase = view.phase;
  const round = view.round;
  const phaseKey = `${phase}:${round}`;
  const playing = phase !== 'lobby' && phase !== 'ended' && phase !== 'cancelled';
  const role = me.role;
  const roleData = role ? ROLES[role] : null;
  const alivePlayer = me.is_player && me.is_alive && !me.left;
  const present = view.players.filter((p) => !p.left);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const seatOf = (id: string | null | undefined) => (id ? byId.get(id)?.seat : undefined);
  const tag = (id: string | null | undefined) => seatTag(seatOf(id));
  const plain = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : undefined;
    return p ? `${circ(p.seat)} ${p.name}` : '—';
  };
  const roleText = (r: VvRole | null | undefined) => (r ? `⟦r:${r}⟧ ${ROLES[r].name}` : '?');
  const mustConfirmLeave = !me.left && (me.is_player || me.is_host) && phase !== 'ended' && phase !== 'cancelled';
  const blocking = live && mustConfirmLeave;
  const waitLeft = me.is_omniscient ? 0 : Math.max(0, view.force_after - view.phase_age - elapsed);
  const isVamp = role === 'vampire';
  const teamOf = (r: VvRole | null | undefined) => (r ? (r === 'vampire' ? TEAM.evil : TEAM.good) : null);
  const voteMap = new Map((view.votes ?? []).map((v) => [v.from, v]));
  const killedNow = view.last_night?.round === round ? view.last_night.killed : [];
  const investigations = me.investigations ?? [];

  // ---- Gece: hangi iş için seçim yapılıyor --------------------------------------------------------
  const needHunt = phase === 'night' && alivePlayer && isVamp;
  const needAbility = phase === 'night' && alivePlayer && (role === 'doctor' || role === 'detective');
  const investigatedNow = investigations.some((x) => x.round === round);
  const defaultSlot: Slot | null =
    phase === 'night' ? (needHunt ? 'hunt' : needAbility ? 'ability' : null) : phase === 'vote' && alivePlayer ? 'vote' : null;
  const activeSlot: Slot | null = defaultSlot;
  const selected = pick && pick.key === `${phaseKey}:${activeSlot}` ? pick.id : null;

  function validFor(s: Slot | null, p: VvPlayer): boolean {
    if (!s || !p.is_alive || p.left) return false;
    if (s === 'hunt') return !p.is_me && !p.ally;
    if (s === 'vote') return !p.is_me;
    if (role === 'doctor') return p.id !== me.last_protect;
    if (role === 'detective') return !p.is_me && !investigatedNow;
    return false;
  }

  // ---- Oylar ve vampirlerin ısırma seçimleri --------------------------------------------------------
  const showVotes = phase === 'vote' || phase === 'vote_result';
  const votesIn = new Map<string, number>();
  if (showVotes) for (const v of view.votes ?? []) if (v.to) votesIn.set(v.to, (votesIn.get(v.to) ?? 0) + 1);
  const huntIn = new Map<string, number>();
  if (phase === 'night' && (isVamp || me.is_omniscient)) {
    for (const p of view.players) {
      if (p.hunt_pick && p.is_alive && !p.left) huntIn.set(p.hunt_pick, (huntIn.get(p.hunt_pick) ?? 0) + 1);
    }
  }
  // Dedektifin baktığı kişiler: adın altında sonuç
  const scanned = new Map<string, boolean>();
  for (const x of investigations) scanned.set(x.id, x.is_vampire);

  // ---- Avatar olayları --------------------------------------------------------------------------------
  const events = new Map<string, SeatEvent>();
  if (phase === 'dawn') {
    for (const d of killedNow) events.set(d.id, { icon: '🧛', text: 'ISIRILDI', color: '#7A1FA2' });
    for (const x of investigations) {
      if (x.round === round - 1 || x.round === round) {
        events.set(x.id, x.is_vampire ? { icon: '🔍', text: 'VAMPİR', color: '#7A1FA2' } : { icon: '🔍', text: 'TEMİZ', color: '#0F9D58' });
      }
    }
  }
  if (phase === 'vote_result' && view.last_vote?.executed && view.last_vote.round === round) {
    events.set(view.last_vote.executed.id, { icon: '⚖️', text: 'ÇIKARILDI', color: '#7A1020' });
  }
  if (phase === 'ended') {
    for (const p of view.players) if (p.role && vvIsWinner(view.winner, p.role)) events.set(p.id, { icon: '🏆', text: 'KAZANDI', color: '#B7791F' });
  }
  const outHow = new Map<string, 'vote'>();
  for (const e of view.log ?? []) if (e.k === 'vote' && e.id) outHow.set(e.id, 'vote');
  // Elendiysen neden: yalnızca rol yazılır, kimin yaptığı (numarası) asla
  const myDeath =
    me.is_player && !me.is_alive && !me.left
      ? myPlayerId && outHow.get(myPlayerId) === 'vote'
        ? 'Oylamayla köyden çıkarıldın'
        : 'Vampirler seni ısırdı'
      : null;

  /** Avatar çerçevesi: takımından olduğu bilinen yeşil, rakip kırmızı, bilinmeyen çerçevesiz */
  function frameOf(p: VvPlayer): string | undefined {
    if (p.is_me || phase === 'lobby') return undefined;
    if (!p.role) return undefined;
    if (!role) return teamOf(p.role)?.color;
    return (p.role === 'vampire') === isVamp ? '#34D399' : '#FF4D4D';
  }

  /** Ortak ızgara Köpekbalığı oyuncusu biçimini bekler (rol anahtarı iki oyunda çakışmaz) */
  const asSk = (p: VvPlayer): SkPlayer => ({
    id: p.id,
    seat: p.seat,
    name: p.name,
    avatar: p.avatar ?? null,
    is_alive: p.is_alive,
    left: p.left,
    is_host: p.is_host,
    is_me: p.is_me,
    role: p.role as unknown as SkRole | null,
    team: null,
    ally: !!p.ally,
    revealed: !!p.revealed,
    marshal: false,
    hunt_pick: p.hunt_pick ?? null,
    acted: me.is_omniscient ? (phase === 'reveal' ? p.ready : p.night_done) : null,
    alive_sec: p.alive_sec,
    points: p.points,
  });

  const light = false;
  const seats: Seat[] = view.players.map((p) => {
    const v = voteMap.get(p.id);
    let sign: Seat['sign'] = null;
    if (showVotes && v) {
      sign = v.to ? { text: seatTag(seatOf(v.to)), kind: 'vote', target: v.to } : { text: 'PAS', kind: 'pass' };
    } else if (phase === 'night' && (isVamp || me.is_omniscient) && p.hunt_pick && (p.ally || p.is_me || me.is_omniscient)) {
      sign = { text: `🧛 ${seatTag(seatOf(p.hunt_pick))}`, kind: 'hunt', target: p.hunt_pick };
    }
    let label: Seat['label'] = null;
    if (phase === 'vote' && p.is_alive && !p.left && !v) label = { text: '⏳ düşünüyor', color: 'rgba(255,255,255,0.75)' };
    else if (scanned.has(p.id) && !p.role) {
      label = scanned.get(p.id) ? { text: '🔍 Vampir', color: '#C9B6FF' } : { text: '🔍 Temiz', color: '#34D399' };
    } else if (phase === 'lobby' && (view.match || view.rematch_left != null)) {
      label = (view.lobby_ready ?? []).includes(p.id)
        ? { text: '✓ Hazır', color: '#34D399' }
        : { text: '… bekliyor', color: 'rgba(255,255,255,0.6)' };
    } else if (phase === 'lobby' && p.is_host) label = { text: '⭐ Oda sahibi', color: '#FFB703' };
    const how = p.left ? 'left' : outHow.get(p.id) ?? 'night';
    const deadLabel = p.left ? 'Ayrıldı' : !p.is_alive ? (how === 'vote' ? 'Çıkarıldı' : 'Isırıldı') : null;
    const selectable = validFor(activeSlot, p) && (activeSlot !== 'vote' || phase === 'vote');
    const acted = me.is_omniscient && (phase === 'night' || phase === 'reveal') ? (phase === 'reveal' ? p.ready : p.night_done) : null;
    return {
      p: asSk(p),
      deadIcon: how === 'left' ? '🚪' : how === 'vote' ? '⚖️' : '🧛',
      selectable,
      // Takım arkadaşları seçim sırasında da net görünür (soluklaşmaz)
      dim: activeSlot !== null && !selectable && p.is_alive && !p.ally,
      sign,
      votesIn: votesIn.get(p.id),
      huntIn: huntIn.get(p.id),
      badge: clipQueue.speaking?.from === p.id ? '🔊' : acted === null ? null : acted ? '✅' : '⏳',
      label,
      deadLabel,
      ally: !!p.ally,
      frame: frameOf(p),
      roleEmoji: p.role ? { emoji: '', color: ROLES[p.role].color, role: p.role } : null,
      event: events.get(p.id) ?? null,
      thinking: phase === 'vote' && p.is_alive && !p.left && !v,
      speaking: clipQueue.speaking?.from === p.id,
      alert: view.remote === true && !p.is_me && clipQueue.speaking?.from === p.id,
    };
  });

  function rejectAlly(id: string) {
    const n = Date.now();
    setBounce({ to: id, nonce: n });
    setTimeout(() => setBounce((b) => (b && b.nonce === n ? null : b)), 2000);
  }

  function pressSeat(s: Seat) {
    if (activeSlot === 'hunt' && s.p.ally && !s.p.is_me && s.p.is_alive) {
      rejectAlly(s.p.id);
      return;
    }
    if (s.selectable && activeSlot) {
      setPick({ key: `${phaseKey}:${activeSlot}`, id: s.p.id });
      return;
    }
    if (!s.p.is_me) setCard(s.p.id);
  }

  // ---- Yetenek hedefe atılır (ısırma, koruma, bakma) -----------------------------------------------
  const ABILITY_MARK: Partial<Record<VvRole, Pick<SeatMark, 'icon' | 'kind'>>> = {
    doctor: { icon: '🩹', kind: 'float' },
    detective: { icon: '🔍', kind: 'float' },
  };
  const markTo = activeSlot === 'hunt' || activeSlot === 'ability' ? (selected ?? me.night_target) : null;
  const markLook =
    activeSlot === 'hunt' ? ({ icon: '🧛', kind: 'swim' } as const) : activeSlot === 'ability' && role ? ABILITY_MARK[role] : undefined;
  const mark: SeatMark | null =
    bounce && myPlayerId
      ? { from: myPlayerId, to: bounce.to, icon: '🧛', kind: 'bounce', nonce: bounce.nonce }
      : markTo && markLook
        ? { from: myPlayerId, to: markTo, ...markLook }
        : null;

  function pickPlayer(p: SkPlayer) {
    if (p.is_me) return;
    setSheet(null);
    setCard(p.id);
  }

  function cardAction(key: 'kick' | 'friend' | 'voice' | 'crew', id: string) {
    setCard(null);
    if (key === 'crew') {
      void act('crew', async () => {
        const r = await inviteToCrew(id);
        if (!r.error) {
          void notify('Klan daveti gönderildi', `${plain(id)} kabul edince klanına katılır. Klanını Profil > Klanım’dan yönetebilirsin.`, {
            icon: null,
          });
        }
        return r;
      });
      return;
    }
    if (key === 'kick') {
      void act('kick', () => kickStart(roomId, id));
    } else if (key === 'friend') {
      void act(
        'friend',
        async () => {
          const r = await sendRequestInRoom(roomId, id);
          if (!r.error) {
            void notify(
              r.outcome === 'accepted' ? 'Artık arkadaşsınız' : 'İstek gönderildi',
              r.outcome === 'accepted' ? `${plain(id)} ile artık arkadaşsınız.` : `${plain(id)} kabul edince arkadaş olursunuz.`,
              { icon: null },
            );
          }
          return { error: r.error };
        },
        {
          confirm: () =>
            confirmAction(
              'Arkadaşlık isteği gönder',
              `İstek ${plain(id)} kişisine gidecek. ${FRIEND_CONSEQUENCE}`,
              'İsteği gönder',
              false,
              { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
            ),
        },
      );
    } else {
      const s0 = seats.find((x) => x.p.id === id);
      if (s0) setTimeout(() => longPressSeat(s0), 250);
    }
  }

  function longPressSeat(s: Seat) {
    if (s.p.is_me) return;
    const clip = [...(view?.voice ?? [])].reverse().find((c) => c.from === s.p.id);
    if (!clip) {
      void notify('Ses mesajı yok', `${plain(s.p.id)} son 2 dakikada ses mesajı göndermedi.`, { icon: null });
      return;
    }
    void reportClip(clip.id, plain(s.p.id));
  }

  // ---- Yönetici düğmesi (otomatik oyunda kimse ilerletmez) -----------------------------------------
  const nextLabel: Partial<Record<Phase, string>> = {
    reveal: '🌙 Geceyi başlat',
    night: '☀️ Geceyi bitir',
    dawn: '⚖️ Oylamayı başlat',
    vote: '⚖️ Oylamayı bitir',
    vote_result: '🌙 Yeni gece',
  };
  const nextFn: Partial<Record<Phase, () => Promise<Result>>> = {
    reveal: () => beginNight(roomId),
    night: () => endNight(roomId),
    dawn: () => beginVote(roomId),
    vote: () => endVote(roomId),
    vote_result: () => beginNight(roomId),
  };
  const gated = (phase === 'night' || phase === 'vote') && waitLeft > 0;
  const hostButton =
    me.can_control && playing && nextLabel[phase] && nextFn[phase] ? (
      <GameButton
        label={gated ? `${nextLabel[phase]} · ${Math.ceil(waitLeft)} sn` : (nextLabel[phase] as string)}
        variant="ghost"
        disabled={gated}
        loading={busy === 'next'}
        onPress={() => {
          const fn = nextFn[phase];
          if (fn) void act('next', fn);
        }}
        testID="vv-next"
      />
    ) : null;

  // ---- Tabela, komut, düğmeler -------------------------------------------------------------------------
  let prompt: { title: string; lines?: string[]; color?: string; pulse?: boolean } = { title: '' };
  let command: { text: string; color: string } | null = null;
  let actions: ReactNode = null;
  let stage: ReactNode = null;
  // Tartışmayı geç: uzaktan odada mikrofon kutusunun sağında, yan yana odada alt şeritte küçük yuvarlak yeşil düğme
  const pttShown = view.remote && playing && me.is_player && !me.left;
  const skipBtn =
    view.skip && alivePlayer && phase === 'dawn' ? (
      <SkipRound skip={view.skip} busy={busy === 'skipdisc'} onToggle={(on) => void act('skipdisc', () => skipDiscussion(roomId, on))} />
    ) : null;

  // Tabelada başlığın altında en son olay
  const flowItems: { k: number; text: string }[] = [];
  const ln = view.last_night;
  if (ln && ln.round > 0) {
    flowItems.push({
      k: ln.round * 10 + 1,
      text: ln.killed.length
        ? `${ln.round}. gece ısırıldı - ${ln.killed
            .map((d) => {
              const r = byId.get(d.id)?.role;
              return `${tag(d.id)}${r ? ` ⟦r:${r}⟧` : ''}`;
            })
            .join(' ')}`
        : `${ln.round}. gece kimse ısırılmadı`,
    });
  }
  for (const x of investigations) {
    if (x.round >= round - 1) flowItems.push({ k: x.round * 10 + 2, text: `🔍 ${tag(x.id)} › ${x.is_vampire ? 'VAMPİR' : 'temiz'}` });
  }
  const lvote = view.last_vote;
  if (lvote) {
    flowItems.push({
      k: lvote.round * 10 + 5,
      text: lvote.executed
        ? `${lvote.round}. gün köyden çıkarıldı - ${tag(lvote.executed.id)} ⟦r:${lvote.executed.role}⟧`
        : lvote.tie
          ? `${lvote.round}. gün oylar eşit, kimse çıkarılmadı`
          : `${lvote.round}. gün kimse çıkarılmadı`,
    });
  }
  const flow = flowItems
    .sort((a, b) => b.k - a.k)
    .map((x) => x.text)
    .slice(0, 1);

  const comp = view.composition;
  if (me.left && phase !== 'ended') {
    prompt = { title: 'Oyundan çıkarıldın', lines: ['Ayrılan elenmiş sayılır ve geri dönemez.'], color: G.redSoft };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'cancelled') {
    prompt = { title: 'Oda kapandı', lines: [closedText(view.close_reason, me.is_host)] };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'lobby' && (view.match || (view.rematch && view.rematch_left != null))) {
    const n = present.length;
    const readyIds = new Set(view.lobby_ready ?? []);
    const readyCount = present.filter((p) => readyIds.has(p.id)).length;
    const myReady = myPlayerId !== null && readyIds.has(myPlayerId);
    const countdown = view.rematch_left != null ? Math.max(0, Math.ceil(view.rematch_left - elapsed)) : null;
    // Eşleştirme: en az kişi sayısına ulaşınca 60 sn beklenir (başka oyuncular gelsin), sonra hazırlar çoğunluktaysa başlar
    const matchLeft = view.match_left != null ? Math.max(0, Math.ceil(view.match_left - elapsed)) : null;
    const canReady = n >= view.min_players || countdown !== null;
    const need = Math.floor(n / 2) + 1;
    prompt =
      countdown !== null
        ? {
            title: `🔁 YENİ EL · ${countdown} sn`,
            lines: [`${readyCount} / ${n} hazır · süre dolunca en az ${view.min_players} hazırla yeni el başlar`],
            color: '#34D399',
            pulse: !myReady,
          }
        : canReady && matchLeft !== null && matchLeft > 0
          ? {
              title: `⏳ BAŞLAMASINA ${matchLeft} sn`,
              lines: [
                `${readyCount} / ${n} hazır · süre dolunca ${need} kişi “Hazırım” demişse başlar.`,
                'Bu sürede başka oyuncular da katılabilir.',
              ],
              color: '#34D399',
              pulse: !myReady,
            }
          : {
            title: canReady ? `HAZIR ${readyCount} / ${n}` : `🌙 LOBİ · ${n} kişi`,
            lines: canReady ? [`Başlamak için ${need} kişinin “Hazırım” demesi yeter.`] : [`“Hazırım” ${view.min_players} kişide açılır (şu an ${n}).`],
            color: canReady ? '#34D399' : '#C9B6FF',
            pulse: canReady && !myReady,
          };
    if (countdown !== null && !myReady) command = { text: 'YENİ EL\nHazırım de', color: '#34D399' };
    actions = (
      <>
        <GameButton
          label={myReady ? '✓ Hazırım · vazgeç' : canReady ? 'HAZIRIM' : `Hazırım (${view.min_players} kişi gerekir)`}
          variant={myReady ? 'ghost' : 'primary'}
          disabled={!canReady && !myReady}
          loading={busy === 'lready'}
          onPress={() => void act('lready', () => vvLobbyReady(roomId, !myReady))}
          testID="vv-lobby-ready"
        />
        {view.code ? (
          <GameButton
            label="🔗 Davet bağlantısı oluştur"
            variant="ghost"
            onPress={() => {
              const code = view.code as string;
              const url = Linking.createURL('/kopekbaligi-katil', { queryParams: { kod: code } });
              void Share.share({
                message: `41. Kat Sosyal'de Vampir–Köylü oynuyoruz, gel! 🧛\n${url}\nUygulamada Oyunlar > Kodla katıl: ${code}`,
              }).catch(() => {});
            }}
          />
        ) : null}
        {me.is_admin ? (
          <GameButton
            label="+3 deneme oyuncusu"
            icon="hardware-chip-outline"
            variant="ghost"
            loading={busy === 'bots'}
            onPress={() => void act('bots', () => addTestBots(roomId, 3))}
          />
        ) : null}
        <Text style={styles.pText}>
          {view.match
            ? 'Herkes rumuzuyla görünür. Her oyunun aylık puan hedefi var; yan yana oyun 7 kat puan verir.'
            : `${view.code ? `Oda ID ${view.code}. ` : ''}Puan aylık hedefe kadar yazılır.`}
        </Text>
        {!view.match && (me.is_host || me.is_admin) && present.length >= view.min_players ? (
          <GameButton
            label="🧛 Hemen başlat"
            variant="ghost"
            loading={busy === 'start'}
            onPress={() => void act('start', () => startVampireGame(roomId))}
          />
        ) : null}
      </>
    );
  } else if (phase === 'lobby') {
    const n = present.length;
    const enough = n >= view.min_players;
    const canStart = me.is_host || me.is_admin;
    prompt = {
      title: view.code ? `ODA ID  ${view.code}` : 'Oyuncular toplanıyor',
      lines: [
        enough
          ? `${n} oyuncu · 🧛 ${comp.vampire} vampir · 🩺 ${comp.doctor} doktor · 🕵️ ${comp.detective} dedektif`
          : `Başlamak için en az ${view.min_players} oyuncu gerekir (şu an ${n}, en çok ${view.max_players}).`,
      ],
      color: view.code ? '#FFB703' : undefined,
    };
    const modeText =
      view.mode === 'narrator'
        ? me.is_omniscient
          ? 'Anlatıcısın. Oynamazsın, herkesin rolünü görür, aşamaları sen ilerletirsin.'
          : `Anlatıcı ${view.host.name}.`
        : view.mode === 'host'
          ? me.is_host
            ? 'Ben Yöneticiyim. Aşamaları sen ilerletirsin ve sen de oynarsın (rolleri görmezsin).'
            : `${view.host.name} aşamaları ilerletir ve o da oynar.`
          : 'Otomatik. Süreler dolunca oyun kendiliğinden ilerler.';
    actions = (
      <>
        <Text style={styles.pText}>{modeText}</Text>
        {me.is_host || me.is_admin ? (
          <View style={styles.row}>
            {me.is_host ? (
              <GameButton label="Davet et" icon="person-add" variant="ghost" flex onPress={() => setInviteOpen(true)} />
            ) : null}
            {me.is_admin ? (
              <GameButton
                label="+3 deneme oyuncusu"
                icon="hardware-chip-outline"
                variant="ghost"
                flex
                loading={busy === 'bots'}
                onPress={() =>
                  void act('bots', () => addTestBots(roomId, 3), {
                    confirm: () =>
                      confirmAction(
                        'Deneme oyuncusu eklensin mi?',
                        'Kendi kendine oynayan 3 deneme oyuncusu eklenir. Oda deneme odası olur, kimseye puan, başarım ya da istatistik yazılmaz.',
                        'Ekle',
                        false,
                        { icon: null },
                      ),
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
        {/* GEÇİCİ: moderatör en kalabalık oyunu görebilsin: odayı deneme oyuncularıyla doldur */}
        {me.is_admin && n < view.max_players ? (
          <GameButton
            label={`Odayı doldur (${view.max_players} kişi)`}
            icon="people"
            variant="ghost"
            loading={busy === 'botsfill'}
            onPress={() => void act('botsfill', () => addTestBots(roomId, view.max_players - n))}
          />
        ) : null}
        {me.is_host && !me.is_player && view.mode !== 'narrator' && view.code ? (
          <GameButton
            label="Oyuna katıl"
            variant="ghost"
            loading={busy === 'join'}
            onPress={() => {
              const code = view.code;
              if (code) void act('join', async () => ({ error: (await joinRoomWithLocation(code)).error }));
            }}
          />
        ) : null}
        {canStart ? (
          <GameButton
            label="🧛 Oyunu başlat"
            disabled={!enough}
            loading={busy === 'start'}
            onPress={() =>
              void act('start', () => startVampireGame(roomId), {
                confirm: () =>
                  confirmAction(
                    'Oyunu başlat',
                    `${n} oyuncuya roller çarktan dağıtılacak. Başladıktan sonra yeni oyuncu giremez.`,
                    'Başlat',
                    false,
                    { icon: null },
                  ),
              })
            }
            testID="vv-start"
          />
        ) : (
          <Text style={styles.pText}>{`${view.host.name} oyunu başlatınca ekran kendiliğinden değişir.`}</Text>
        )}
      </>
    );
  } else if (phase === 'reveal') {
    if (me.is_player && role && roleData) {
      const wheel = Math.round(Math.min(width * 0.7, height * 0.36, 300));
      const total = Math.max(1, VV_WHEEL.reduce((n, k) => n + (comp[k] ?? 0), 0));
      const odds = Object.fromEntries(VV_WHEEL.map((k) => [k, Math.round(((comp[k] ?? 0) * 100) / total)]));
      const t = teamOf(role)!;
      stage = (
        <View style={styles.stage}>
          {!wheelDone ? (
            <RoleWheel role={role} size={wheel} wheel={VV_WHEEL} odds={odds} onDone={() => setWheelDone(true)} />
          ) : (
            <View style={[styles.roleCard, { borderColor: roleData.color }]}>
              <RoleIcon role={role} size={Math.round(Math.min(width * 0.32, 128))} />
              <Text style={[styles.roleName, { color: roleData.color }]}>{roleData.name}</Text>
              <Text style={[styles.roleTeam, { color: t.color }]}>{`${t.emoji} ${t.name}`}</Text>
              <Text style={styles.roleGoal}>{roleData.goal}</Text>
              {isVamp ? (
                <RichLine
                  chip={20}
                  style={styles.allies}
                  text={
                    'Vampir dostların ' +
                    (view.players
                      .filter((p) => p.ally)
                      .map((p) => `${seatTag(p.seat)} ${p.name}`)
                      .join(', ') || 'yok, yalnızsın')
                  }
                />
              ) : null}
            </View>
          )}
        </View>
      );
    }
    prompt = {
      title: !me.is_player ? 'Roller dağıtılıyor' : wheelDone ? 'ROLÜN BU' : 'ÇARK DÖNÜYOR…',
      lines: wheelDone || !me.is_player ? [`Rolünü gören ${view.ready_count} / ${present.length}`] : [],
    };
    if (me.is_player && wheelDone && !me.ready) command = { text: 'ROLÜNÜ OKU\nOkuyunca hazırım de', color: '#C9B6FF' };
    actions = (
      <>
        {me.is_player && role ? (
          me.ready ? (
            <Text style={styles.pOk}>Hazırsın. Herkes hazır olunca gece başlar.</Text>
          ) : (
            <GameButton
              label={wheelDone ? 'Rolümü gördüm, hazırım' : 'Çark dönüyor…'}
              disabled={!wheelDone}
              loading={busy === 'ready'}
              onPress={() => void act('ready', () => markRoleSeen(roomId))}
            />
          )
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'night') {
    const done = !!me.night_target;
    if (!me.is_player || !me.is_alive) {
      prompt = me.is_omniscient
        ? {
            title: `🌙 Köy uyuyor · ${view.pending ? `${view.pending.done} / ${view.pending.total}` : ''}`,
            lines: flow,
          }
        : { title: '🌙 İzliyorsun', lines: flow };
    } else if (activeSlot === 'hunt') {
      prompt = {
        title: done ? `🧛 Isıracağın ${tag(me.night_target)}` : '🧛 Isıracağın kişiyi seç',
        lines: flow,
        color: '#C9B6FF',
        pulse: !done,
      };
      if (!done) command = { text: 'ISIRACAĞIN KİŞİYİ SEÇ\nKimi ısıracaksın ?', color: '#9B7BFF' };
    } else if (activeSlot === 'ability' && roleData) {
      const verb = role === 'doctor' ? 'Koru' : 'Bak';
      const finished = role === 'detective' ? investigatedNow : done;
      prompt = {
        title: finished
          ? role === 'detective'
            ? `⟦r:${role}⟧ Baktın · sonuç aşağıda`
            : `⟦r:${role}⟧ Koruduğun ${tag(me.night_target)}`
          : `⟦r:${role}⟧ ${verb}: kişi seç`,
        lines: flow,
        color: roleData.color,
        pulse: !finished,
      };
      if (!finished) command = { text: `${verb.toUpperCase()}\nBir kişi seç`, color: roleData.color };
    } else {
      prompt = { title: '🌙 Uyuyorsun, sabahı bekle', lines: flow };
    }
    const saved = activeSlot === 'hunt' || activeSlot === 'ability' ? me.night_target : null;
    const lockedOut = activeSlot === 'ability' && role === 'detective' && investigatedNow;
    actions = (
      <>
        {(activeSlot === 'hunt' || activeSlot === 'ability') && !lockedOut ? (
          <GameButton
            label={
              selected && selected !== saved
                ? `${activeSlot === 'hunt' ? '🧛 ISIR' : role === 'doctor' ? '🩺 KORU' : '🔍 BAK'}: ${circ(seatOf(selected))}`
                : saved
                  ? `✓ ${circ(seatOf(saved))} seçildi · değiştirmek için dokun`
                  : 'Bir avatara dokun'
            }
            disabled={!selected || selected === saved}
            loading={busy === 'night'}
            onPress={() => {
              if (selected) void act('night', () => nightAction(roomId, selected));
            }}
            testID="vv-night-confirm"
          />
        ) : null}
        {role === 'detective' && investigatedNow ? (
          <GameButton label="🔍 Sonucumu gör" variant="ghost" onPress={() => setSheet('result')} />
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'dawn') {
    prompt = {
      title: alivePlayer ? '☀️ Konuşun! Vampir kim?' : '☀️ Sabah',
      lines: flow,
      color: killedNow.length ? '#FF8A98' : '#FFFFFF',
    };
    if (alivePlayer) command = { text: 'KONUŞUN\nVampir kim ?', color: '#FFB703' };
    actions = (
      <>
        {!me.can_control ? (
          <Text style={styles.pText}>{view.mode === 'auto' ? 'Süre dolunca oylama başlar.' : `Oylamayı ${view.host.name} başlatacak.`}</Text>
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'vote') {
    const myVote = myPlayerId ? voteMap.get(myPlayerId) : undefined;
    const pendingTxt = view.pending ? ` · ${view.pending.done} / ${view.pending.total}` : '';
    prompt = alivePlayer
      ? {
          title: me.voted ? `⚖️ Oyun ${me.vote_target ? tag(me.vote_target) : 'pas'}${pendingTxt}` : `⚖️ Oy ver: şüpheliyi seç${pendingTxt}`,
          lines: flow,
          color: '#FF8A98',
          pulse: !me.voted,
        }
      : { title: `⚖️ Köy oylaması${pendingTxt}`, lines: flow };
    if (alivePlayer && !me.voted) command = { text: 'OY VER\nŞüpheliyi seç', color: '#FF4D4D' };
    actions = alivePlayer ? (
      <>
        <View style={styles.row}>
          <GameButton
            flex
            label={
              selected && selected !== me.vote_target
                ? `⚖️ ${circ(seatOf(selected))} KÖYDEN ÇIKSIN (OY VER)`
                : myVote?.to
                  ? `✓ ${circ(seatOf(myVote.to))} · değiştirmek için dokun`
                  : 'Şüpheliye dokun'
            }
            variant="danger"
            disabled={!selected || selected === me.vote_target}
            loading={busy === 'vote'}
            onPress={() => {
              if (selected) void act('vote', () => castVote(roomId, selected));
            }}
            testID="vv-vote"
          />
          <GameButton
            label={me.voted && !me.vote_target ? 'Pas ✓' : 'Pas'}
            variant="ghost"
            disabled={me.voted && !me.vote_target}
            loading={busy === 'pass'}
            onPress={() => void act('pass', () => castVote(roomId, null))}
          />
        </View>
        {hostButton}
      </>
    ) : (
      hostButton
    );
  } else if (phase === 'vote_result') {
    const lv = view.last_vote;
    prompt = lv?.executed
      ? {
          title: `⚖️ ${tag(lv.executed.id)} köyden çıkarıldı · ${roleText(lv.executed.role)}`,
          lines: lv.skips ? [`${lv.skips} kişi pas geçti`] : [],
          color: '#FF8A98',
        }
      : { title: lv?.tie ? 'Oylar eşit, kimse çıkarılmadı' : 'Kimse çıkarılmadı', lines: [] };
    actions = (
      <>
        {!me.can_control ? (
          <Text style={styles.pText}>{view.mode === 'auto' ? 'Az sonra yeni gece başlıyor.' : `Yeni geceyi ${view.host.name} başlatacak.`}</Text>
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'ended') {
    const w = vvWinnerText(view.winner);
    const iWon = me.is_player && vvIsWinner(view.winner, role);
    const r = result?.data;
    const pointsText = !me.is_player
      ? null
      : result === null
        ? 'Sonucun hesaplanıyor…'
        : !r || r.note === 'none' || r.best_rank === null
          ? me.is_admin
            ? 'Moderatörler oyundan puan kazanmaz.'
            : 'Puan yazılmadı.'
          : r.note === 'ok'
            ? `+${fmtPts(r.awarded)} puan · ${r.players} oyuncu arasında ${r.best_rank}. sıra`
            : r.note === 'too_few'
              ? `${r.best_rank}. sıra · puan için en az ${result.rules.partyMinPlayers} kişi gerekir.`
              : `${r.best_rank}. sıra · bu ayın puan hedefini tamamladın, puan yazılmadı.`;
    prompt = {
      title: w.title,
      lines: [
        [me.is_player && role ? (iWon ? '🏆 Kazandın!' : 'Bu sefer kaybettin.') : null, pointsText]
          .filter((x): x is string => !!x)
          .join(' · '),
      ],
      color: w.color,
    };
    const mmss = (sec: number | null | undefined) => {
      const t = Math.max(0, sec ?? 0);
      return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    };
    const rankRows: RankRow[] = view.players
      .map((p) => ({ p, won: !!p.role && vvIsWinner(view.winner, p.role) }))
      .sort(
        (a, b) =>
          Number(b.won) - Number(a.won) ||
          Number(a.p.left) - Number(b.p.left) ||
          Number(b.p.is_alive) - Number(a.p.is_alive) ||
          (b.p.alive_sec ?? 0) - (a.p.alive_sec ?? 0) ||
          a.p.seat - b.p.seat,
      )
      .map((x, i) => ({
        id: x.p.id,
        rank: i + 1,
        seat: x.p.seat,
        name: x.p.name,
        me: x.p.is_me,
        won: x.won,
        role: x.p.role ? { emoji: '', name: ROLES[x.p.role].name, color: ROLES[x.p.role].color, key: x.p.role } : null,
        time: `${mmss(x.p.alive_sec)}${x.p.left ? ' 🚪' : x.p.is_alive ? ' ✓' : ''}`,
        points: Number(x.p.points ?? 0) > 0 ? `+${fmtPts(Number(x.p.points))}` : '—',
        out: !x.p.is_alive,
      }));
    stage = <RankTable rows={rankRows} />;
    const next = view.next_room ?? null;
    actions = (
      <>
        {next && !me.left ? (
          <NextRoomButton seconds={10} onGo={() => router.replace({ pathname: '/vampir', params: { id: next } })} />
        ) : view.next_note === 'no_quota' ? (
          <Text style={styles.pText}>Yeni el açılamadı. Oyunlar ekranından yeni oda açabilirsin.</Text>
        ) : null}
        <View style={styles.row}>
          <GameButton label="Puanlar" icon="trophy" variant="ghost" onPress={() => setPointsOpen(true)} />
          <GameButton
            label="Oyunlara dön"
            flex
            variant={next ? 'ghost' : 'primary'}
            onPress={() => {
              if (next) void leaveRoom(next);
              goToGames();
            }}
          />
        </View>
      </>
    );
  }

  const accent = activeSlot === 'hunt' ? '#9B7BFF' : activeSlot === 'ability' && roleData ? roleData.color : '#FF4D4D';

  // ---- Üst şerit ------------------------------------------------------------------------------------
  const PHASE_TITLE: Record<Phase, string> = {
    lobby: 'Bekleme · Köy meydanı',
    reveal: 'Rol çarkı',
    night: '🌙 GECE',
    dawn: '☀️ SABAH',
    vote: '⚖️ KÖY OYLAMASI',
    vote_result: '⚖️ Oylama sonucu',
    ended: '🏁 Oyun bitti',
    cancelled: 'Oda kapandı',
  };
  const modeLabel = view.mode === 'auto' ? 'Otomatik' : view.mode === 'host' ? 'Yönetici' : 'Anlatıcılı';
  const subtitle = [view.remote ? 'Uzaktan' : 'Yan yana', modeLabel, view.event ? 'Etkinlik' : null].filter(Boolean).join(' · ');
  const timeKind = phase === 'vote' ? 'vote' : 'plain';
  const flash =
    phase === 'night'
      ? { text: '🌙 GECE', sub: `${round}. gece · köy uyuyor`, color: '#2A0F45' }
      : phase === 'dawn'
        ? { text: '☀️ SABAH', sub: killedNow.length ? `${killedNow.length} kişi ısırıldı` : 'Herkes sağ salim', color: '#FFB703' }
        : phase === 'vote'
          ? { text: '⚖️ OYLAMA', sub: 'Oylama başladı', color: '#C1121F' }
          : phase === 'ended'
            ? { text: '🏁', sub: vvWinnerText(view.winner).title, color: vvWinnerText(view.winner).color }
            : { text: '', color: '#000000' };
  const shakeKey =
    (phase === 'dawn' && killedNow.length > 0) || (phase === 'vote_result' && view.last_vote?.executed) ? phaseKey : null;

  // ---- Yazışma ------------------------------------------------------------------------------------------
  async function say(channel: 'all' | 'shark' | 'dead', text: string): Promise<string | null> {
    const res = await vvSay(roomId, channel, text);
    if (res.error) return res.error;
    await load();
    return null;
  }
  async function report(m: SkMsg) {
    const reason = await showDialog<string | null>({
      title: 'Mesajı bildir',
      message: `“${m.body}”\n\nBu mesaj moderatörlere iletilir. ${m.name}, kimin bildirdiğini bilmez.`,
      icon: null,
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        { label: 'Kişisel bilgi / dolandırıcılık', value: 'Kişisel bilgi isteme ya da dolandırıcılık', style: 'primary' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportDeadMessage(m.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: null });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: null, tone: 'success' });
  }
  async function reportClip(clipId: string, who: string) {
    const reason = await showDialog<string | null>({
      title: 'Ses mesajını bildir',
      message: `${who} kişisinin ses mesajı moderatörlere iletilir ve inceleme için en çok 14 gün saklanır. Kimin bildirdiğini bilmez.`,
      icon: null,
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        { label: 'Kişisel bilgi / dolandırıcılık', value: 'Kişisel bilgi isteme ya da dolandırıcılık', style: 'primary' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportVoiceClip(clipId, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: null });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: null, tone: 'success' });
  }

  const roomIsMatch = view.match === true;
  const roomIsRemote = view.remote === true;
  const roomIsRematch = view.rematch === true;
  function requestLeave() {
    if (!mustConfirmLeave) {
      goToGames();
      return;
    }
    const lobby = phase === 'lobby';
    const handOver = me.is_host && me.is_player && (roomIsMatch || (roomIsRemote && !lobby) || (roomIsRematch && lobby));
    const copy = handOver
      ? lobby
        ? { title: 'Odadan ayrıl', msg: 'Bekleme odasından çıkarsın; oda sahipliği başka bir oyuncuya geçer.', ok: 'Odadan ayrıl' }
        : {
            title: 'Oyundan ayrıl',
            msg: 'Ayrılırsan elenirsin ve geri dönemezsin. Oyun sürer, oda sahipliği başka bir oyuncuya geçer.',
            ok: 'Oyundan ayrıl',
          }
      : me.is_host
        ? lobby
          ? { title: 'Odayı kapat', msg: 'Oda kapanır ve katılanlar oyuna giremez.', ok: 'Odayı kapat' }
          : { title: 'Oyunu kapat', msg: 'Oda sahibi olarak ayrılırsan oyun herkes için biter.', ok: 'Oyunu kapat' }
        : lobby
          ? { title: 'Odadan ayrıl', msg: 'Bekleme odasından çıkarsın.', ok: 'Odadan ayrıl' }
          : { title: 'Oyundan ayrıl', msg: 'Ayrılırsan elenirsin, rolün açıklanır ve geri dönemezsin.', ok: 'Oyundan ayrıl' };
    void act('leave', () => leaveRoom(roomId), {
      confirm: () => confirmAction(copy.title, copy.msg, copy.ok, true, { icon: null }),
      after: () => {
        leaving.current = true;
        goToGames();
      },
    });
  }

  const kickPoll = view.kick?.poll ?? null;
  const kickKey = kickPoll ? `${kickPoll.starter}>${kickPoll.target}` : null;
  const kickPopOpen = !!kickPoll && kickSeen !== kickKey && kickPoll.starter !== myPlayerId;
  const cardPlayer = card ? (byId.get(card) ?? null) : null;
  const kk = view.kick;
  const cardKick =
    !!cardPlayer &&
    !!kk &&
    kk.open &&
    !kk.poll &&
    kk.starts_left > 0 &&
    me.is_player &&
    !me.left &&
    (phase === 'lobby' || me.is_alive) &&
    !cardPlayer.left;
  const crewNow = cardPlayer && crewInfo?.id === cardPlayer.id ? crewInfo.t : null;
  const cardOpts: { key: 'kick' | 'friend' | 'voice' | 'crew'; label: string; tone: CardButton['tone']; disabled?: boolean }[] = [
    ...(cardKick ? [{ key: 'kick' as const, label: `🚪 Atma oylaması başlat (${kk?.starts_left ?? 0} hak)`, tone: 'danger' as const }] : []),
    // Arkadaşsanız arkadaş ekle yerine ekibe davet
    ...(crewNow?.friend
      ? crewNow.can_invite
        ? [{ key: 'crew' as const, label: '👥 Klana davet et', tone: 'primary' as const, disabled: busy === 'crew' }]
        : []
      : [{ key: 'friend' as const, label: '➕ Arkadaş ekle', tone: 'primary' as const, disabled: busy === 'friend' }]),
    ...(view.remote ? [{ key: 'voice' as const, label: '🔊 Ses mesajını şikâyet et', tone: 'ghost' as const }] : []),
  ];
  // Dedektif: sabah olunca gecenin sonucu kendiliğinden açılır
  const nightResults = investigations.filter((x) => x.round === round - 1 || (phase === 'night' && x.round === round));
  const autoResult =
    phase === 'dawn' && me.is_player && !me.left && sheet === null && resultClosed !== round && investigations.some((x) => x.round === round);
  const voiceLeft = view.voice_left_ms ?? 10000;
  // Bekleme odasında odadaki herkes yazar (önceki 2 elin mesajları da okunur)
  const chatOpen = (phase === 'lobby' && me.is_player && !me.left) || (alivePlayer && (phase === 'dawn' || phase === 'vote' || phase === 'vote_result'));
  const vampChatOpen = phase === 'night' && isVamp && alivePlayer;
  const deadWrite = playing && me.is_player && !me.left && !me.is_alive;
  const logText = (e: VvLog): { text: string; color: string } | null => {
    switch (e.k) {
      case 'phase':
        return e.phase === 'reveal'
          ? { text: '🎡 Roller dağıtıldı, oyun başladı', color: '#B98CFF' }
          : e.phase === 'night'
            ? { text: `${e.round}. gece, köy uyudu`, color: '#C9B6FF' }
            : e.phase === 'day'
              ? { text: `${e.round}. gün, sabah oldu`, color: '#FFB703' }
              : { text: 'Köy oylaması başladı', color: '#FF8A98' };
      case 'night':
        return e.ids && e.ids.length
          ? { text: `${e.night}. gece ısırıldı - ${e.ids.map((x) => `${tag(x)} ${roleText(byId.get(x)?.role)}`).join(' · ')}`, color: '#FF4D4D' }
          : { text: `${e.night}. gece kimse ısırılmadı`, color: '#34D399' };
      case 'vote':
        return e.id
          ? { text: `${tag(e.id)} köyden çıkarıldı, rolü ${roleText(e.role)}`, color: '#FF4D4D' }
          : { text: e.tie ? 'Oylar eşit, kimse çıkarılmadı' : 'Kimse çıkarılmadı', color: '#C9CED6' };
      case 'left':
        return { text: `🚪 ${tag(e.id)} oyundan ayrıldı, rolü ${roleText(e.role)}`, color: '#C9CED6' };
      case 'end':
        return e.winner ? { text: `🏁 ${vvWinnerText(e.winner).title}`, color: vvWinnerText(e.winner).color } : null;
      default:
        return null;
    }
  };
  const info: SkMsg[] = [];
  (view.log ?? []).forEach((e, i) => {
    const t = logText(e);
    if (t) info.push({ id: `log-${i}`, name: '', body: t.text, at: e.at, mine: false, round: e.round, phase: e.ph, system: { color: t.color } });
    // Sana özel: elendiysen hemen ardından neden elendiğin
    const meOut =
      myPlayerId && ((e.k === 'vote' && e.id === myPlayerId) || (e.k === 'night' && (e.ids ?? []).includes(myPlayerId)));
    if (meOut) {
      info.push({
        id: `me-out-${i}`,
        name: '',
        body: `🔒 Sana özel · ${e.k === 'vote' ? 'Oylamayla köyden çıkarıldın' : 'Vampirler seni ısırdı'}`,
        at: new Date((Date.parse(e.at) || 0) + 1).toISOString(),
        mine: false,
        round: e.round,
        phase: e.ph,
        system: { color: '#C8B6FF' },
      });
    }
  });
  const chatTabs: ChatTabInfo[] = [
    {
      key: 'all',
      label: 'Genel',
      messages: view.chat ?? [],
      info,
      canWrite: chatOpen,
      placeholder: 'Herkese yaz…',
      closedText: !alivePlayer ? 'Yalnızca yaşayanlar yazar, sen okuyabilirsin.' : 'Gece herkes susar. Sabah ve oylamada yazılır.',
    },
    ...(view.shark_chat
      ? [
          {
            key: 'shark' as const,
            label: '🧛 Vampirler',
            messages: view.shark_chat,
            info,
            canWrite: vampChatOpen,
            placeholder: 'Vampirlere yaz…',
            closedText: 'Vampirler yalnızca gece yazışır.',
          },
        ]
      : []),
    ...(view.dead_chat
      ? [
          {
            key: 'dead' as const,
            label: '💀 Ölüler',
            messages: view.dead_chat,
            canWrite: deadWrite,
            placeholder: 'Ölülere yaz…',
            closedText: 'Yalnızca elenenler yazar.',
          },
        ]
      : []),
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <VillageBackdrop phase={phase} winner={view.winner} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <BackBlocker enabled onBack={() => {}} />
        <Shake shakeKey={shakeKey}>
          {/* Üst şerit */}
          <View
            style={styles.top}
            onLayout={(e) => {
              const b = Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height);
              if (Math.abs(b - topBottom) > 1) setTopBottom(b);
            }}
          >
            <View style={styles.topSide}>
              <Pressable
                onPress={blocking ? requestLeave : goToGames}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={blocking ? 'Oyundan ayrıl' : 'Oyunlara dön'}
                style={({ pressed }) => [styles.topBtn, styles.exitBtn, pressed && styles.pressed]}
                testID="vv-back"
              >
                <Ionicons name="exit-outline" size={21} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={styles.flex} accessibilityRole="header">
              <Text style={[styles.title, styles.shadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {PHASE_TITLE[phase]}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <View style={[styles.topSide, styles.topSideRight]}>
              <SoundToggle color="#FFFFFF" />
              {phase === 'lobby' || playing ? (
                <Pressable
                  onPress={() => {
                    if (kickPoll && kickSeen === kickKey) setKickSeen(null);
                    else {
                      if (kickPoll) setKickSeen(kickKey);
                      setSheet('players');
                    }
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Oyuncular ve şikâyet"
                  style={({ pressed }) => [styles.topBtn, styles.playersBtn, pressed && styles.pressed]}
                  testID="vv-players"
                >
                  <Ionicons name="people" size={20} color="#FFFFFF" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            {prompt.title ? (
              <Prompt
                title={prompt.title}
                lines={prompt.lines}
                color={prompt.color}
                light={light}
                pulse={prompt.pulse}
                compact={view.players.length >= 10 && phase !== 'ended'}
              />
            ) : null}

            <View style={styles.stageWrap}>
              {stage ?? (
                <SeatGrid
                  stickyKey={roomId}
                  seats={seats}
                  selected={selected}
                  accent={accent}
                  light={light}
                  onPress={pressSeat}
                  onLongPress={view.remote && me.is_player ? longPressSeat : undefined}
                  onAlert={(s0) => {
                    const c = clipQueue.speaking;
                    if (c && c.from === s0.p.id) void reportClip(c.id, plain(c.from));
                  }}
                  mark={mark}
                  slots={view.max_players}
                  onEmptyPress={
                    phase === 'lobby' && me.is_player && !me.left ? (n) => void act('seat', () => takeSeat(roomId, n)) : undefined
                  }
                />
              )}
              {bounce ? (
                <View style={styles.allyWarn} pointerEvents="none">
                  <Pill text={'Vampir dostunu ısıramazsın'} tone="danger" />
                </View>
              ) : null}
              {view.test || connError || (playing && me.is_player && !me.is_alive && !me.left) ? (
                <View style={styles.pills} pointerEvents="none">
                  {view.test ? <Pill text="Deneme odası, puan yazılmaz" tone="danger" /> : null}
                  {connError ? <Pill text="Bağlantı koptu, yeniden deniyor…" tone="warn" /> : null}
                  {playing && me.is_player && !me.is_alive && !me.left ? <Pill text={`${myDeath ?? 'Elendin'}, izliyorsun`} tone="danger" /> : null}
                </View>
              ) : null}
              {/* Oylama bandı yalnızca başlatana; diğerleri üstteki küçük pencereden bir kez cevaplar (ekran kalabalıklaşıp takılmasın) */}
              {kickPoll && kickPoll.starter === myPlayerId ? (
                <KickBar
                  targetSeat={seatOf(kickPoll.target)}
                  targetName={byId.get(kickPoll.target)?.name ?? ''}
                  yes={kickPoll.yes}
                  need={kickPoll.need}
                  left={Math.max(0, Math.ceil(kickPoll.left - elapsed))}
                  mine={kickPoll.mine}
                  canVote={me.is_player && !me.left && (phase === 'lobby' || me.is_alive)}
                  isTarget={kickPoll.target === myPlayerId}
                  busy={busy === 'kickvote'}
                  onVote={(yes) => void act('kickvote', () => kickVote(roomId, yes))}
                />
              ) : null}
              {view.remote && playing && me.is_player && !me.left && (clipQueue.speaking || clipQueue.error) ? (
                <View style={styles.voiceOverlay}>
                  {clipQueue.speaking ? (
                    <Pressable
                      onLongPress={() => {
                        const c = clipQueue.speaking;
                        if (c) void reportClip(c.id, plain(c.from));
                      }}
                      delayLongPress={450}
                      accessibilityHint="Bildirmek için uzun bas"
                      style={styles.speaking}
                    >
                      <RichLine
                        chip={18}
                        style={styles.speakingText}
                        text={`🔊 ${tag(clipQueue.speaking.from)} konuşuyor${clipQueue.speaking.channel === 'shark' ? ' (vampirler)' : ''}${
                          clipQueue.waiting ? ` · sırada ${clipQueue.waiting}` : ''
                        }`}
                      />
                    </Pressable>
                  ) : (
                    <Text style={styles.voiceError}>{`${clipQueue.error}. Sorun sürerse bana bildir.`}</Text>
                  )}
                </View>
              ) : null}
            </View>

            {pttShown ? (
              <PushToTalk
                roomId={roomId}
                side={skipBtn}
                listening={listeningToMe}
                canTalk={
                  alivePlayer &&
                  !view.mic_banned &&
                  voiceLeft >= 500 &&
                  (phase === 'dawn' || phase === 'vote' || phase === 'vote_result' || (phase === 'night' && isVamp))
                }
                leftMs={voiceLeft}
                closedText={
                  view.mic_banned
                    ? '🔇 Mikrofonun bir süreliğine kapatıldı'
                    : !me.is_alive
                      ? '🔇 Elendin, konuşamazsın'
                      : phase === 'night' && !isVamp
                        ? '🔇 Gece mikrofonlar kapalı'
                        : voiceLeft < 500 && phase !== 'reveal'
                          ? '🔇 Bu tartışmadaki 10 sn hakkın bitti'
                          : '🔇 Sabah konuşulur'
                }
                channelText={`${phase === 'night' ? 'Yalnızca vampirler duyar' : 'Herkes duyar'} · bu tartışmada kalan ${Math.round(voiceLeft / 1000)} sn`}
                onRecording={setRecording}
                onSent={() => void load()}
              />
            ) : null}

            {actions || actionError ? (
              <Glass style={styles.panel}>
                <View style={styles.panelInner}>
                  {actions}
                  {actionError ? (
                    <Text style={styles.error} accessibilityLiveRegion="polite" numberOfLines={2}>
                      {actionError}
                    </Text>
                  ) : null}
                </View>
              </Glass>
            ) : null}

            {/* Alt şerit: sayaç hemen üstünde; kaçıncı gece / gün Rolüm ile Nasıl? arasında */}
            <View style={styles.dock}>
              {playing && view.phase_limit !== null && !me.left ? (
                <TimeBar kind={timeKind} left={remain} limit={view.phase_limit} light={light} />
              ) : null}
              <View style={styles.tools}>
                {me.is_player && role && phase !== 'lobby' && !me.left ? (
                  <ToolButton icon="id-card-outline" label="Rolüm" onPress={() => setSheet('role')} testID="vv-role" />
                ) : null}
                {playing && round > 0 ? (
                  <View style={[styles.roundBadge, phase === 'night' ? styles.roundNight : styles.roundDay]}>
                    <Text style={styles.roundText} numberOfLines={1}>
                      {phase === 'night' ? `${round}. GECE` : `${round}. GÜN`}
                    </Text>
                  </View>
                ) : null}
                <ToolButton icon="help-circle-outline" label="Nasıl?" onPress={() => setHowOpen(true)} testID="vv-how" />
                {phase === 'lobby' ? <ToolButton icon="trophy" label="Puanlar" onPress={() => setPointsOpen(true)} /> : null}
                {!pttShown ? skipBtn : null}
              </View>
            </View>
          </View>

          {kickPoll && kickPopOpen ? (
            <KickPopup
              top={topBottom + 8}
              starterSeat={seatOf(kickPoll.starter)}
              starterName={byId.get(kickPoll.starter)?.name ?? ''}
              targetSeat={seatOf(kickPoll.target)}
              targetName={byId.get(kickPoll.target)?.name ?? ''}
              yes={kickPoll.yes}
              need={kickPoll.need}
              left={Math.max(0, Math.ceil(kickPoll.left - elapsed))}
              isTarget={kickPoll.target === myPlayerId}
              canVote={me.is_player && !me.left && (phase === 'lobby' || me.is_alive)}
              busy={busy === 'kickvote'}
              onAnswer={(yes) => {
                setKickSeen(kickKey);
                if (yes === true && !kickPoll.mine) void act('kickvote', () => kickVote(roomId, true));
                if (yes === false && kickPoll.mine) void act('kickvote', () => kickVote(roomId, false));
              }}
            />
          ) : null}

          {cardPlayer ? (
            <PlayerCard
              avatar={cardPlayer.avatar ?? 1}
              seat={cardPlayer.seat}
              name={cardPlayer.name}
              status={cardPlayer.left ? 'Ayrıldı' : !cardPlayer.is_alive ? 'Elendi' : 'Hayatta'}
              role={
                cardPlayer.role
                  ? {
                      icon: <RoleIcon role={cardPlayer.role} size={40} framed />,
                      name: ROLES[cardPlayer.role].name,
                      color: ROLES[cardPlayer.role].color,
                      team: `${teamOf(cardPlayer.role)!.emoji} ${teamOf(cardPlayer.role)!.name}`,
                      teamColor: teamOf(cardPlayer.role)!.color,
                      text: ROLES[cardPlayer.role].goal,
                    }
                  : null
              }
              buttons={cardOpts}
              onButton={(key) => cardAction(key as 'kick' | 'friend' | 'voice' | 'crew', cardPlayer.id)}
              onClose={() => setCard(null)}
            />
          ) : null}
        </Shake>
      </SafeAreaView>

      {view.chat && (playing || phase === 'ended' || phase === 'lobby') && !me.left ? (
        <SharkChat
          terms={{ night: 'gece', day: 'gün' }}
          roomId={roomId}
          tabs={chatTabs}
          openTab={chatTab && chatTabs.some((t) => t.key === chatTab) ? chatTab : null}
          onOpenTab={setChatTab}
          startAt={view.server_now ?? new Date().toISOString()}
          seatOf={seatOf}
          onSend={(ch, t) => say(ch, t)}
          onReport={(m) => void report(m)}
          preferTab={phase === 'night' && isVamp && me.is_alive ? 'shark' : null}
          loadHistory={getVampireHistory}
        />
      ) : null}

      <PhaseFlash flashKey={phaseKey} text={flash.text} sub={flash.sub} color={flash.color} />
      <CommandFlash
        cmdKey={command ? `${phaseKey}:${command.text}` : null}
        phaseKey={phaseKey}
        text={command?.text ?? null}
        color={command?.color ?? '#FFFFFF'}
      />
      {/* Elendiğin an bir kez: neden elendiğin (yalnızca rol) */}
      <CommandFlash
        cmdKey={myDeath ? `death:${roomId}:${myDeath}` : null}
        phaseKey={phaseKey}
        text={myDeath ? `ELENDİN\n${myDeath}` : null}
        color="#FF4D4D"
      />

      {safety.isOpen ? safety.nodes : null}
      {inviteOpen && phase === 'lobby' && me.is_host ? <InviteSheet roomId={roomId} onClose={() => setInviteOpen(false)} /> : null}
      {sheet === 'role' && role && roleData ? (
        <SkSheet title={roleData.name} iconNode={<RoleIcon role={role} size={34} />} onClose={() => setSheet(null)}>
          <Text style={[styles.sheetTeam, { color: teamOf(role)!.color }]}>{`${teamOf(role)!.emoji} ${teamOf(role)!.name}`}</Text>
          <Text style={styles.sheetText}>{roleData.goal}</Text>
          <Text style={styles.sheetMuted}>{roleData.night}</Text>
          {role === 'doctor' && me.last_protect ? (
            <Text style={styles.sheetMuted}>{`Son koruduğun ${plain(me.last_protect)}; bu gece onu koruyamazsın.`}</Text>
          ) : null}
          {isVamp ? (
            <RichLine
              chip={18}
              align="left"
              style={styles.sheetMuted}
              text={
                'Vampir dostların ' +
                (view.players
                  .filter((p) => p.ally)
                  .map((p) => `${seatTag(p.seat)} ${p.name}${p.is_alive ? '' : ' (öldü)'}`)
                  .join(', ') || 'yok')
              }
            />
          ) : null}
          {view.roles && Object.keys(view.roles).length ? (
            <>
              <Text style={styles.sheetHead}>Bu oyundaki roller</Text>
              <RoleRoster roles={view.roles} players={view.players} order={VV_WHEEL} myRole={role} />
            </>
          ) : null}
          {investigations.length ? (
            <>
              <Text style={styles.sheetHead}>Baktıkların</Text>
              {investigations.map((x) => (
                <RichLine
                  key={`${x.round}-${x.id}`}
                  align="left"
                  chip={18}
                  style={styles.sheetText}
                  text={`${x.round}. gece · ${tag(x.id)} ${x.is_vampire ? '🧛 VAMPİR' : '✅ temiz'}`}
                />
              ))}
            </>
          ) : null}
        </SkSheet>
      ) : null}
      {sheet === 'players' ? (
        <SkSheet title="Oyuncular" icon="👥" onClose={() => setSheet(null)}>
          <Text style={styles.sheetMuted}>
            {view.remote
              ? 'Bir oyuncuya dokunarak son ses mesajını şikâyet edebilirsin.'
              : 'Odadaki oyuncular. Rahatsız edici bir durum varsa oyunu bildirebilirsin.'}
          </Text>
          <PlayerList players={view.players.map(asSk)} onPick={pickPlayer} />
          <GameButton
            label={view.remote ? 'Oyunu bildir' : 'Güvenlik ve oyunu bildir'}
            variant="ghost"
            onPress={() => {
              setSheet(null);
              safety.open();
            }}
          />
        </SkSheet>
      ) : null}
      {(sheet === 'result' || autoResult) && nightResults.length ? (
        <SkSheet
          title="Gece sonucun"
          icon="🔍"
          onClose={() => {
            setResultClosed(round);
            setSheet(null);
          }}
        >
          {nightResults.map((x) => (
            <View key={`${x.round}-${x.id}`} style={[styles.resultCard, { borderColor: x.is_vampire ? '#9B7BFF' : '#34D399' }]}>
              <RichLine chip={22} style={styles.resultText} text={`🔍 ${tag(x.id)} ${byId.get(x.id)?.name ?? x.name}`} />
              <Text style={[styles.resultBig, { color: x.is_vampire ? '#C9B6FF' : '#34D399' }]}>
                {x.is_vampire ? '🧛 VAMPİR' : '✅ Vampir değil'}
              </Text>
            </View>
          ))}
        </SkSheet>
      ) : null}
      <InfoModal
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title="Nasıl oynanır?"
        icon="moon"
        items={HOW_TO_PLAY.vampire_villager ?? []}
      />
      <GamePointsModal visible={pointsOpen} onClose={() => setPointsOpen(false)} players={present.length} extra={[VAMPIRE_RANK_ITEM]} party />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0616' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  loading: { color: '#9AA4B2', fontSize: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 10, 20, 0.5)',
  },
  exitBtn: { backgroundColor: '#D9304F', borderWidth: 2, borderColor: '#FFFFFF' },
  playersBtn: { backgroundColor: '#D9304F', borderWidth: 2, borderColor: '#FFFFFF' },
  topSide: { width: 82, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topSideRight: { justifyContent: 'flex-end' },
  title: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 26, letterSpacing: 0.5, textAlign: 'center' },
  roundBadge: {
    alignSelf: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  roundNight: { backgroundColor: '#2A0F45', borderColor: '#9B7BFF' },
  roundDay: { backgroundColor: '#C2560C', borderColor: '#FFFFFF' },
  roundText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 14, letterSpacing: 0.5 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.semi, fontSize: 13.5, textAlign: 'center' },
  body: { flex: 1, gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
  // Izgara kenardan kenara ve üstteki tabeladan alttaki düğmelere kadar uzanır (gövdenin boşlukları sıfırlanır)
  allyWarn: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center', zIndex: 40, elevation: 40 },
  stageWrap: { flex: 1, marginHorizontal: -8, marginVertical: -6 },
  pills: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  voiceOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  roleCard: {
    alignItems: 'center',
    gap: 6,
    width: '92%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'rgba(20, 10, 42, 0.88)',
  },
  roleName: { fontFamily: fonts.black, fontSize: 22, textAlign: 'center' },
  roleTeam: { fontFamily: fonts.extra, fontSize: 14 },
  roleGoal: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  allies: { color: '#C9B6FF', fontFamily: fonts.semi, fontSize: 12.5, textAlign: 'center' },
  panel: { padding: 0 },
  panelInner: { gap: 6, padding: 8 },
  row: { flexDirection: 'row', gap: 8 },
  pText: { color: G.muted, fontSize: 12.5, lineHeight: 17 },
  pOk: { color: G.green, fontSize: 12.5, lineHeight: 17 },
  error: { color: G.redSoft, fontSize: 12.5, lineHeight: 17 },
  dock: { gap: 2 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 4, paddingTop: 0 },
  speaking: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.9)',
  },
  speakingText: { color: '#06201D', fontFamily: fonts.extra, fontSize: 12.5 },
  voiceError: { alignSelf: 'center', color: '#FF8A98', fontFamily: fonts.extra, fontSize: 12.5 },
  sheetTeam: { fontFamily: fonts.extra, fontSize: 15 },
  sheetText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  sheetMuted: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 },
  sheetHead: { color: '#C9B6FF', fontFamily: fonts.black, fontSize: 15, marginTop: 6 },
  resultCard: { alignItems: 'center', gap: 6, padding: 14, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  resultText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 16 },
  resultBig: { fontFamily: fonts.black, fontSize: 22 },
});
