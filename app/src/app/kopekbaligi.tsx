import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import {
  AppState,
  BackHandler,
  Pressable,
  Share,
  StyleSheet,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { InviteSheet } from '@/components/InviteSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSafetyMenu } from '@/components/SafetyMenu';
import { Screen } from '@/components/Screen';
import {
  CommandFlash,
  isLightScene,
  KickBar,
  KickPopup,
  PlayerCard,
  type CardButton,
  NightResult,
  PlayerList,
  PhaseFlash,
  Prompt,
  RankTable,
  circ,
  RichLine,
  RolePicker,
  RoleRoster,
  RoleWheel,
  SeatGrid,
  seatTag,
  Shake,
  SharkBackdrop,
  SkSheet,
  TimeBar,
  type RankRow,
  type Seat,
  type SeatEvent,
  type SeatMark,
  type SkScene,
} from '@/components/SharkStage';
import { RoleIcon } from '@/components/RoleIcon';
import { SharkChat, type ChatTab, type ChatTabInfo } from '@/components/SharkChat';
import { PushToTalk, useListeningToMe, useClipQueue } from '@/components/SharkVoice';
import { SoundToggle } from '@/components/SoundToggle';
import { InfoCard, useElapsedSeconds } from '@/components/VampireParts';
import { G, GameButton, Glass, NextRoomButton, Pill, SkipToggle, ToolButton } from '@/components/VampireStage';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { SHARK_RANK_ITEM } from '@/lib/gameInfo';
import { fmtPts } from '@/lib/labels';
import { getMyGameResult, getPointRules, type MyGameResult, type PointRules } from '@/lib/ranking';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING, sendRequestInRoom } from '@/lib/friends';
import { joinRoomWithLocation, leaveRoom } from '@/lib/rooms';
import type { Result } from '@/lib/rpc';
import {
  abilityVerb,
  getSharkView,
  hasAbility,
  isWinner,
  lobbyReady,
  reportVoiceClip,
  SK_NOT_IN_ROOM,
  SK_ROLES,
  SK_ROOM_GONE,
  SK_TEAMS,
  kickStart,
  kickVote,
  sharkNext,
  sharkNight,
  sharkPickRole,
  sharkReady,
  sharkRevealMarshal,
  sharkSay,
  sharkSkip,
  sharkSpear,
  sharkVote,
  startShark,
  winnerText,
  type SkMsg,
  type SkLog,
  type SkNote,
  type SkPlayer,
  type SkRole,
  type SkView,
} from '@/lib/shark';
import { initSounds, playSound, releaseSounds } from '@/lib/sounds';
import { isBackendReady } from '@/lib/supabase';
import { addTestBots, reportDeadMessage } from '@/lib/vampire';
import { fonts } from '@/theme';

const POLL_MS = 2000;
const KEEP_AWAKE_TAG = 'kopekbaligi-kafesi';

type Slot = 'hunt' | 'ability' | 'spear' | 'vote';

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

export default function SharkScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  if (!id) {
    return (
      <Screen title="Köpekbalığı Kafesi" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Oda bulunamadı">Oyunlar sekmesinden açılan bir odaya katıl ya da kendin bir oda aç.</InfoCard>
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      </Screen>
    );
  }
  return <Game key={id} roomId={id} />;
}

function Game({ roomId }: { roomId: string }) {
  const { width, height } = useWindowDimensions();
  const [view, setView] = useState<SkView | null>(null);
  const [viewAt, setViewAt] = useState(0);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connError, setConnError] = useState(false);
  const [gone, setGone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Seçili kişi: hangi aşamada / hangi iş için */
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  const [slot, setSlot] = useState<{ key: string; slot: Slot } | null>(null);
  const [sheet, setSheet] = useState<'role' | 'pick' | 'result' | 'players' | null>(null);
  /** Avatara ya da listedeki oyuncuya dokununca açılan küçük oyuncu penceresi (oyuncu kimliği) */
  const [card, setCard] = useState<string | null>(null);
  /** Atma oylaması penceresine cevap verildi / kapatıldı (oylamanın anahtarı) */
  const [kickSeen, setKickSeen] = useState<string | null>(null);
  /** Üst şeridin alt kenarı: atma oylaması penceresi hemen altında açılır */
  const [topBottom, setTopBottom] = useState(56);
  /** Gece sonucu penceresi bu turda kapatıldı mı (plaj başlayınca kendiliğinden açılır) */
  const [resultClosed, setResultClosed] = useState(-1);
  /** Yüzen yazışma penceresinde açık sekme (boş = kapalı) */
  const [chatTab, setChatTab] = useState<ChatTab | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** Bu oyunda rol çarkı döndü mü (bu telefonda) */
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
    const res = await getSharkView(roomId);
    if (my !== loadSeq.current || leaving.current) return;
    if (res.error || !res.view) {
      if (hasView.current && (res.error === SK_NOT_IN_ROOM || res.error === SK_ROOM_GONE)) setGone(true);
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
    live && view !== null && (view.status === 'playing' || (view.rematch_left ?? null) !== null || !!view.kick?.poll),
  );
  const elapsedKick = elapsed;

  // ---- Bas-konuş (uzaktan oda): gelen ses mesajları sırayla çalar; sen kaydederken sıra bekler ----------------------
  const [recording, setRecording] = useState(false);
  const voiceOn = !!view && view.remote && view.status === 'playing' && !view.me.left && live;
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
    else if (view.phase === 'day') {
      playSound('vv_day');
      if ((view.last_night?.dead.length ?? 0) > 0) setTimeout(() => playSound('vv_kill', 0.9), 1200);
    } else if (view.phase === 'vote') playSound('vv_vote');
    else if (view.phase === 'vote_result') playSound(view.last_vote?.caged ? 'vv_exile' : 'vv_vote');
    else if (view.phase === 'ended') playSound(isWinner(view.winner, view.me.role) ? 'vv_win' : 'vv_lose');
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
  // Zıpkın atıldı: ses + titreşim
  const spearKey = view?.day_event ? `${view.day_event.round}:${view.day_event.kind}:${view.day_event.id}` : null;
  const lastSpear = useRef<string | null>(null);
  useEffect(() => {
    if (!spearKey || lastSpear.current === spearKey) return;
    const first = lastSpear.current === null && view?.phase !== 'day';
    lastSpear.current = spearKey;
    if (first) return;
    playSound('vv_kill', 0.9);
    Vibration.vibrate([0, 120, 80, 120]);
  }, [spearKey, view?.phase]);

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
      <Screen title="Köpekbalığı Kafesi" onBack={goToGames} backLabel="Oyunlar">
        <Text style={styles.loading}>Oyun yükleniyor…</Text>
      </Screen>
    );
  }
  if (gone) {
    return (
      <Screen title="Köpekbalığı Kafesi" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Odadan çıkarıldın" tone="danger">
          Bekleme odasından ayrıldığında, yeni elde “Hazırım” demediğinde ya da bağlantın uzun süre koptuğunda listeden çıkarılırsın.
        </InfoCard>
        <PrimaryButton label="Oyunlara dön" onPress={goToGames} />
      </Screen>
    );
  }
  if (!view) {
    return (
      <Screen title="Köpekbalığı Kafesi" onBack={goToGames} backLabel="Oyunlar">
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
  const roleInfo = role ? SK_ROLES[role] : null;
  const alivePlayer = me.is_player && me.is_alive && !me.left;
  const present = view.players.filter((p) => !p.left);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const seatOf = (id: string | null | undefined) => (id ? byId.get(id)?.seat : undefined);
  /** Üstteki yazılarda kişi: avatardaki gibi yuvarlak koltuk numarası */
  const tag = (id: string | null | undefined) => seatTag(seatOf(id));
  /** Açıklanan rolün ikonu ve adı (yazılarda) */
  const roleOf = (id: string | null | undefined) => {
    const r = id ? byId.get(id)?.role : null;
    return r ? `⟦r:${r}⟧ ${SK_ROLES[r].name}` : '';
  };
  /** Pencerelerde (düz yazı) kişi */
  const plain = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : undefined;
    return p ? `${circ(p.seat)} ${p.name}` : '—';
  };
  const mustConfirmLeave = !me.left && (me.is_player || me.is_host) && phase !== 'ended' && phase !== 'cancelled';
  const blocking = live && mustConfirmLeave;
  const waitLeft = me.is_omniscient ? 0 : Math.max(0, view.force_after - view.phase_age - elapsed);
  const isShark = me.team === 'shark';

  // Sahne
  const scene: SkScene =
    phase === 'night'
      ? 'night'
      : phase === 'day'
        ? 'day'
        : phase === 'vote' || phase === 'vote_result'
          ? 'vote'
          : phase === 'reveal'
            ? 'reveal'
            : phase === 'ended'
              ? view.winner === 'human'
                ? 'end_human'
                : view.winner === 'shark'
                  ? 'end_shark'
                  : 'end_neutral'
              : 'lobby';
  const light = isLightScene(scene);

  // ---- Gece: hangi iş için seçim yapılıyor -------------------------------------------------------
  const needHunt = phase === 'night' && alivePlayer && isShark;
  const needAbility = phase === 'night' && alivePlayer && hasAbility(role);
  const defaultSlot: Slot | null =
    phase === 'night'
      ? needHunt && !me.hunt_target
        ? 'hunt'
        : needAbility
          ? 'ability'
          : needHunt
            ? 'hunt'
            : null
      : phase === 'vote' && alivePlayer
        ? 'vote'
        : null;
  const activeSlot: Slot | null = slot && slot.key === phaseKey ? slot.slot : defaultSlot;
  const selected = pick && pick.key === `${phaseKey}:${activeSlot}` ? pick.id : null;
  const marks = new Set(me.marks);

  function validFor(s: Slot | null, p: SkPlayer): boolean {
    if (!s || !p.is_alive || p.left) return false;
    if (s === 'hunt') return !p.is_me && !p.ally;
    if (s === 'vote' || s === 'spear') return !p.is_me;
    // yetenek
    switch (role) {
      case 'hammer':
        return !p.is_me && !p.ally;
      case 'nurse':
        return p.is_me || p.ally;
      case 'lifeguard':
        return !p.is_me || !me.self_used;
      case 'surfer':
        return !p.is_me && !marks.has(p.id);
      case 'tiger':
      case 'oceanographer':
      case 'squid':
        return !p.is_me;
      default:
        return false;
    }
  }

  // ---- Oylar: kim kime (tabela), kim kaç oy aldı ---------------------------------------------------
  const showVotes = phase === 'vote' || phase === 'vote_result';
  const voteOf = new Map(view.votes.map((v) => [v.from, v]));
  const votesIn = new Map<string, number>();
  if (showVotes) {
    for (const v of view.votes) if (v.to) votesIn.set(v.to, (votesIn.get(v.to) ?? 0) + v.weight);
  }
  // Dalışta köpekbalıklarının av oyları: hedefin avatarında toplam (sunucu bu seçimleri yalnızca köpekbalıklarına ve
  // anlatıcıya gönderir)
  const huntIn = new Map<string, number>();
  if (phase === 'night' && (isShark || me.is_omniscient)) {
    for (const p of view.players) {
      if (p.hunt_pick && p.is_alive && !p.left) huntIn.set(p.hunt_pick, (huntIn.get(p.hunt_pick) ?? 0) + 1);
    }
  }
  // Notlarım: Oşinograf'ın baktığı kişinin takımı avatarın altında görünür
  const scanned = new Map<string, string>();
  for (const n of me.notes) if (n.kind === 'scan' && n.id && n.team) scanned.set(n.id, n.team);

  // ---- Kişiyi ilgilendiren olaylar: avatar büyür, üstünde simge ve kelime çıkar ---------------------------
  // Herkese açık olanlar (avlandı, zıpkın, kafes, kazandı) herkeste; notların (kilit, kurtarma, bakış) yalnızca sende.
  const events = new Map<string, SeatEvent>();
  if (phase === 'day' && view.last_night?.round === round) {
    for (const d of view.last_night.dead) events.set(d.id, { icon: '🦈', text: 'AVLANDI', color: '#C1121F' });
  }
  if (phase === 'day' && view.day_event) {
    events.set(
      view.day_event.id,
      view.day_event.kind === 'spear'
        ? { icon: '🔱', text: 'VURULDU', color: '#C1121F' }
        : { icon: '🛟', text: 'KURTULDU', color: '#0077B6' },
    );
  }
  if (phase === 'day') {
    for (const n of me.notes) {
      if (n.round !== round) continue;
      if (n.kind === 'blocked' && myPlayerId) events.set(myPlayerId, { icon: '🔨', text: 'KİLİTLENDİ', color: '#7A4A1E' });
      else if (n.kind === 'saved' && n.id) events.set(n.id, { icon: '🛟', text: 'KURTARILDI', color: '#0F9D58' });
      else if (n.kind === 'scan' && n.id && n.team) {
        events.set(n.id, { icon: '🔭', text: SK_TEAMS[n.team].name.toUpperCase(), color: SK_TEAMS[n.team].color });
      } else if (n.kind === 'track' && n.id) events.set(n.id, { icon: '🐯', text: 'İZLENDİ', color: '#E07A00' });
    }
  }
  if (phase === 'vote_result' && view.last_vote?.caged && view.last_vote.round === round) {
    events.set(view.last_vote.caged.id, { icon: '⛓️', text: 'KAFESTE', color: '#7A1020' });
  }
  if (phase === 'ended') {
    for (const p of view.players) {
      if (p.role && isWinner(view.winner, p.role)) events.set(p.id, { icon: '🏆', text: 'KAZANDI', color: '#B7791F' });
    }
  }

  // Kim nasıl elendi (kafes / zıpkın); günlükte yoksa gece
  const outHow = new Map<string, 'cage' | 'spear'>();
  for (const e of view.log ?? []) {
    if (e.k === 'vote' && e.id) outHow.set(e.id, 'cage');
    if (e.k === 'spear' && e.id) outHow.set(e.id, 'spear');
  }
  const seats: Seat[] = view.players.map((p) => {
    const v = voteOf.get(p.id);
    let sign: Seat['sign'] = null;
    if (showVotes && v) {
      sign = v.to
        ? { text: `${seatTag(seatOf(v.to))}${v.weight > 1 ? ' ×2' : ''}`, kind: v.weight > 1 ? 'double' : 'vote', target: v.to }
        : { text: 'PAS', kind: 'pass' };
    } else if (phase === 'night' && (isShark || me.is_omniscient) && p.hunt_pick && (p.ally || p.is_me || me.is_omniscient)) {
      sign = { text: `🦈 ${seatTag(seatOf(p.hunt_pick))}`, kind: 'hunt', target: p.hunt_pick };
    }
    let label: Seat['label'] = null;
    if (phase === 'vote' && p.is_alive && !p.left && !v) {
      label = { text: '⏳ düşünüyor', color: light ? '#5B6472' : 'rgba(255,255,255,0.75)' };
    } else if (scanned.has(p.id)) {
      const t = scanned.get(p.id) as keyof typeof SK_TEAMS;
      label = { text: `🔭 ${SK_TEAMS[t].name}`, color: SK_TEAMS[t].color };
    } else if (phase === 'lobby' && view.match) {
      label = (view.lobby_ready ?? []).includes(p.id)
        ? { text: '✓ Hazır', color: '#34D399' }
        : { text: '… bekliyor', color: light ? '#5B6472' : 'rgba(255,255,255,0.6)' };
    } else if (phase === 'lobby' && p.is_host) label = { text: '⭐ Oda sahibi', color: '#FFB703' };
    // Nasıl elendi: oyun akışı günlüğünden (kafes, zıpkın); geri kalanı gece avlananlardır
    const how = p.left ? 'left' : outHow.get(p.id) ?? 'night';
    const deadLabel = p.left
      ? 'Ayrıldı'
      : !p.is_alive
        ? how === 'cage'
          ? '⛓️ Kafeste'
          : how === 'spear'
            ? '🔱 Vuruldu'
            : '🦈 Avlandı'
        : null;
    const selectable = validFor(activeSlot, p) && (activeSlot !== 'vote' || phase === 'vote');
    const badge =
      clipQueue.speaking?.from === p.id
        ? '🔊'
        : me.is_omniscient && (phase === 'night' || phase === 'reveal')
          ? p.acted
            ? '✅'
            : '⏳'
          : null;
    return {
      p,
      // Ölen avatarında nasıl öldüğü: kafes, köpekbalığı (avlandı), zıpkın, kapı (ayrıldı)
      deadIcon: how === 'left' ? '🚪' : how === 'cage' ? '⛓️' : how === 'spear' ? '🔱' : '🦈',
      selectable,
      dim: activeSlot !== null && !selectable && p.is_alive,
      sign,
      votesIn: votesIn.get(p.id),
      huntIn: huntIn.get(p.id),
      badge,
      label,
      deadLabel,
      ally: p.ally,
      frame: frameOf(p),
      marked: role === 'surfer' && marks.has(p.id),
      // Rol simgesi: sunucu yalnızca görmeye hakkın olan rolleri gönderir (kendin, takımın, açıklananlar, anlatıcı, oyun sonu)
      roleEmoji: p.role ? { emoji: SK_ROLES[p.role].emoji, color: SK_ROLES[p.role].color, role: p.role } : null,
      event: events.get(p.id) ?? null,
      // Oylamada henüz oy vermeyen: avatarda sallanan soru işareti, altında "düşünüyor"
      thinking: phase === 'vote' && p.is_alive && !p.left && !v,
      speaking: clipQueue.speaking?.from === p.id,
      alert: view.remote && !p.is_me && clipQueue.speaking?.from === p.id,
    };
  });

  /**
   * Avatar çerçevesi: kendi takımından olduğu bilinen yeşil, bilinmeyen sarı, rolü açığa çıkan rakip kırmızı.
   * Takım yalnızca sunucunun gönderdiği (görmeye hakkın olan) rolden anlaşılır. Tarafsızın takım arkadaşı yoktur.
   * Anlatıcı / izleyici takımların kendi renklerini görür.
   */
  function frameOf(p: SkPlayer): string | undefined {
    if (p.is_me || phase === 'lobby') return undefined;
    if (!p.team) return '#FFC93C';
    if (!me.team) return SK_TEAMS[p.team].color;
    return me.team !== 'neutral' && p.team === me.team ? '#34D399' : '#FF4D4D';
  }

  function pressSeat(s: Seat) {
    // Seçim sırasında dokunuş hedef seçer; değilse oyuncu penceresi açılır (rolü, atma oylaması, arkadaş ekle)
    if (s.selectable && activeSlot) {
      setPick({ key: `${phaseKey}:${activeSlot}`, id: s.p.id });
      return;
    }
    if (!s.p.is_me) setCard(s.p.id);
  }

  // ---- Rol yeteneği hedefe atılır: simge senin avatarından seçtiğin avatara uçar ve orada kalır -----------------
  const ABILITY_MARK: Partial<Record<SkRole, Pick<SeatMark, 'icon' | 'kind'>>> = {
    hammer: { icon: '🔨', kind: 'smash' },
    nurse: { icon: '🩹', kind: 'float' },
    lifeguard: { icon: '🛟', kind: 'throw' },
    oceanographer: { icon: '🔭', kind: 'float' },
    tiger: { icon: '🐾', kind: 'swim' },
    squid: { icon: '🦑', kind: 'swim' },
    surfer: { icon: '📍', kind: 'throw' },
  };
  const markTo =
    activeSlot === 'hunt'
      ? (selected ?? me.hunt_target)
      : activeSlot === 'ability'
        ? (selected ?? (me.ignite ? null : me.night_target))
        : activeSlot === 'spear'
          ? selected
          : null;
  const markLook =
    activeSlot === 'hunt'
      ? ({ icon: '🦈', kind: 'swim' } as const)
      : activeSlot === 'spear'
        ? ({ icon: '🔱', kind: 'shot' } as const)
        : activeSlot === 'ability' && role
          ? ABILITY_MARK[role]
          : undefined;
  const mark: SeatMark | null = markTo && markLook ? { from: myPlayerId, to: markTo, ...markLook } : null;

  /** Oyuncu listesinde bir oyuncuya dokununca: liste kapanır, oyuncu penceresi açılır */
  function pickPlayer(p: SkPlayer) {
    if (p.is_me) return;
    setSheet(null);
    setCard(p.id);
  }

  function cardAction(key: 'kick' | 'friend' | 'voice', id: string) {
    setCard(null);
    if (key === 'kick') {
      void act('kick', () => kickStart(roomId, id));
    } else if (key === 'friend') {
      void act('friend', async () => {
        const r = await sendRequestInRoom(roomId, id);
        if (!r.error) {
          void notify(
            r.outcome === 'accepted' ? 'Artık arkadaşsınız' : 'İstek gönderildi',
            r.outcome === 'accepted' ? `${plain(id)} ile artık arkadaşsınız.` : `${plain(id)} kabul edince arkadaş olursunuz.`,
            { icon: null },
          );
        }
        return { error: r.error };
      }, {
        confirm: () =>
          confirmAction(
            'Arkadaşlık isteği gönder',
            `İstek ${plain(id)} kişisine gidecek. ${FRIEND_CONSEQUENCE}`,
            'İsteği gönder',
            false,
            { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
          ),
      });
    } else {
      const s0 = seats.find((x) => x.p.id === id);
      if (s0) setTimeout(() => longPressSeat(s0), 250);
    }
  }

  /** Avatara basılı tutunca: o oyuncunun son ses mesajını şikâyet et (uzaktan oda) */
  function longPressSeat(s: Seat) {
    if (s.p.is_me) return;
    const clip = [...(view?.voice ?? [])].reverse().find((c) => c.from === s.p.id);
    if (!clip) {
      void notify(
        'Ses mesajı yok',
        `${plain(s.p.id)} son 2 dakikada ses mesajı göndermedi. Yazılı mesajları, yazışmada mesaja uzun basarak bildirebilirsin.`,
        { icon: null },
      );
      return;
    }
    void reportClip(clip.id, plain(s.p.id));
  }

  // ---- Yönetici düğmesi ----------------------------------------------------------------------------
  const nextLabel: Partial<Record<typeof phase, string>> = {
    reveal: '🤿 Dalışı başlat',
    night: '☀️ Dalışı bitir',
    day: '⛓️ Oylamayı başlat',
    vote: '⚖️ Oylamayı bitir',
    vote_result: '🤿 Yeni dalış',
  };
  const gated = (phase === 'night' || phase === 'vote') && waitLeft > 0;
  const hostButton =
    me.can_control && playing && nextLabel[phase] ? (
      <GameButton
        label={gated ? `${nextLabel[phase]} · ${Math.ceil(waitLeft)} sn` : (nextLabel[phase] as string)}
        variant="ghost"
        disabled={gated}
        loading={busy === 'next'}
        onPress={() => void act('next', () => sharkNext(roomId))}
        testID="sk-next"
      />
    ) : null;

  // ---- Ortadaki karar yazısı ve alttaki düğmeler -----------------------------------------------------
  // Üstteki tabela: yalnızca yapman gereken şey (başlık) ve olay akışı (satırlar, en yenisi üstte)
  let prompt: { title: string; lines?: string[]; color?: string; pulse?: boolean } = { title: '' };
  /** Ekranın ortasında 2,5 sn büyük görünen komut */
  let command: { text: string; color: string } | null = null;
  let actions: ReactNode = null;
  let stage: ReactNode = null;
  const lastDead = view.last_night?.round === round ? view.last_night.dead : [];

  // ---- Olay akışı: son gece, zıpkın, notların, son kafes oylaması (en yenisi önce) -------------------------------
  const noteLine = (n: SkNote): string => {
    const who = n.id ? tag(n.id) : (n.name ?? '?');
    if (n.kind === 'blocked') return `🔨 ${n.round}. gece yeteneğin kilitlendi`;
    if (n.kind === 'saved') return `🛟 ${n.round}. gece şamandıran kurtardı › ${who}`;
    if (n.kind === 'scan') return `🔭 ${who} › ${n.team ? SK_TEAMS[n.team].name : '?'}`;
    const names = (n.visits ?? []).map((x) => x.names.join(', ')).filter(Boolean).join(', ');
    return `🐯 ${who} › ${names || 'kimseyi ziyaret etmedi'}`;
  };
  const flowItems: { k: number; text: string }[] = [];
  const ln = view.last_night;
  if (ln && ln.round > 0) {
    flowItems.push({
      k: ln.round * 10 + 1,
      text: ln.dead.length
        ? `🦈 ${ln.round}. gece avlandı › ${ln.dead.map((d) => { const r = byId.get(d.id)?.role; return `${tag(d.id)}${r ? ` ⟦r:${r}⟧` : ''}`; }).join(' ')}`
        : `🌊 ${ln.round}. gece kimse avlanmadı`,
    });
  }
  for (const n of me.notes) if (n.round >= round - 1) flowItems.push({ k: n.round * 10 + 2, text: noteLine(n) });
  if (view.day_event) {
    const ev = view.day_event;
    flowItems.push({
      k: ev.round * 10 + 3,
      text:
        ev.kind === 'spear'
          ? `🔱 ${ev.round}. gün zıpkın vurdu › ${tag(ev.id)}`
          : `🔱 ${ev.round}. gün zıpkın ıskaladı › ${tag(ev.id)}`,
    });
  }
  const lvote = view.last_vote;
  if (lvote) {
    flowItems.push({
      k: lvote.round * 10 + 5,
      text: lvote.caged
        ? `⛓️ ${lvote.round}. gün kafese girdi › ${tag(lvote.caged.id)} ⟦r:${lvote.caged.role}⟧`
        : lvote.tie
          ? `⛓️ ${lvote.round}. gün oylar eşit, kimse kafese girmedi`
          : `⛓️ ${lvote.round}. gün kimse kafese girmedi`,
    });
  }
  // Tabelada başlığın altında yalnızca en son olay
  const flow = flowItems.sort((a, b) => b.k - a.k).map((x) => x.text).slice(0, 1);

  if (me.left && phase !== 'ended') {
    prompt = { title: 'Oyundan çıkarıldın', lines: ['Ayrılan elenmiş sayılır ve geri dönemez.'], color: G.redSoft };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'cancelled') {
    prompt = { title: 'Oda kapandı', lines: [closedText(view.close_reason, me.is_host)] };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'lobby' && (view.match || (view.rematch && view.rematch_left != null))) {
    // Uzaktan eşleştirme lobisi: 6 kişi olunca "Hazırım" açılır; hazır diyenler demeyenlerden fazla olunca başlar.
    // Yeni el bekleme odası: 45 sn geri sayım; süre dolunca "Hazırım" diyenlerle yeni el başlar.
    const n = present.length;
    const readyIds = new Set(view.lobby_ready ?? []);
    const readyCount = present.filter((p) => readyIds.has(p.id)).length;
    const myReady = myPlayerId !== null && readyIds.has(myPlayerId);
    const countdown = view.rematch_left != null ? Math.max(0, Math.ceil(view.rematch_left - elapsed)) : null;
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
        : {
            title: canReady ? `HAZIR ${readyCount} / ${n}` : `🌊 LOBİ · ${n} kişi`,
            lines: canReady
              ? [`Başlamak için ${need} kişinin “Hazırım” demesi yeter.`, 'Beklersen ya da davet edersen kalabalık oyun daha çok puan verir.']
              : [`“Hazırım” ${view.min_players} kişide açılır (şu an ${n}).`, 'Arkadaşını davet et, kalabalık oyun daha çok puan verir.'],
            color: canReady ? '#34D399' : '#48CAE4',
            pulse: canReady && !myReady,
          };
    if (countdown !== null && !myReady) command = { text: '🔁 YENİ EL · HAZIRIM DE', color: '#34D399' };
    actions = (
      <>
        <GameButton
          label={myReady ? '✓ Hazırım · vazgeç' : canReady ? 'HAZIRIM' : `Hazırım (${view.min_players} kişi gerekir)`}
          variant={myReady ? 'ghost' : 'primary'}
          disabled={!canReady && !myReady}
          loading={busy === 'lready'}
          onPress={() => void act('lready', () => lobbyReady(roomId, !myReady))}
          testID="sk-lobby-ready"
        />
        {view.code ? (
          <GameButton
            label="🔗 Davet bağlantısı oluştur"
            variant="ghost"
            onPress={() => {
              const code = view.code as string;
              const url = Linking.createURL('/kopekbaligi-katil', { queryParams: { kod: code } });
              void Share.share({
                message: `41. Kat Sosyal'de Köpekbalığı Kafesi oynuyoruz, gel! 🦈\n${url}\nUygulamada Oyunlar > Kodla katıl: ${code}`,
              }).catch(() => {});
            }}
            testID="sk-invite-link"
          />
        ) : null}
        {/* GEÇİCİ: moderatör tek telefonla deneyebilsin */}
        {me.is_admin ? (
          <GameButton
            label="+3 deneme oyuncusu"
            icon="hardware-chip-outline"
            variant="ghost"
            loading={busy === 'bots'}
            onPress={() => void act('bots', () => addTestBots(roomId, 3))}
          />
        ) : null}
        {view.match ? (
          <Text style={styles.pText}>Herkes rumuzuyla görünür. Uzaktan oyun hak yemez; yan yana oyun 5 kat puan verir.</Text>
        ) : (
          <Text style={styles.pText}>
            {`${view.code ? `Oda ID ${view.code}. ` : ''}Her yeni el oda sahibinin aylık oyun hakkından 1 düşer.`}
          </Text>
        )}
        {!view.match && (me.is_host || me.is_admin) && present.length >= view.min_players ? (
          <GameButton
            label="🦈 Hemen başlat"
            variant="ghost"
            loading={busy === 'start'}
            onPress={() => void act('start', () => startShark(roomId))}
          />
        ) : null}
      </>
    );
  } else if (phase === 'lobby') {
    const n = present.length;
    const sh = Math.floor(n * 0.3 + 0.5);
    const ne = n >= 16 ? 2 : n >= 10 ? 1 : 0;
    const enough = n >= view.min_players;
    const canStart = me.is_host || me.is_admin;
    prompt = {
      title: view.code ? `ODA ID  ${view.code}` : 'Oyuncular toplanıyor',
      lines: [
        enough
          ? `${n} oyuncu · 🦈 ${sh} köpekbalığı · 🏖️ ${n - sh - ne} insan${ne ? ` · 🌀 ${ne} tarafsız` : ''}`
          : `Başlamak için en az ${view.min_players} oyuncu gerekir (şu an ${n}, en çok ${view.max_players}).`,
      ],
      color: view.code ? '#FFB703' : undefined,
    };
    const modeText =
      view.mode === 'narrator'
        ? me.is_omniscient
          ? 'Anlatıcısın. Oynamazsın, herkesin rolünü görür, aşamaları sen ilerletirsin. Anlatıcılı oyunda kimse puan almaz, hak düşmez.'
          : `Anlatıcı ${view.host.name}. Anlatıcılı oyunda puan yok, hak düşmez.`
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
            {/* GEÇİCİ: moderatör tek telefonla test edebilsin diye deneme oyuncuları */}
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
            testID="sk-bots-fill"
          />
        ) : null}
        {/* GEÇİCİ: moderatör deneme odasında rolünü seçebilir */}
        {me.is_admin && me.is_player ? (
          <GameButton
            label={
              me.picked_role
                ? `Rolüm ${SK_ROLES[me.picked_role].emoji} ${SK_ROLES[me.picked_role].name} · değiştir`
                : 'Rolümü seç (deneme odası)'
            }
            variant="ghost"
            onPress={() => setSheet('pick')}
            testID="sk-pick-role"
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
            label="🦈 Oyunu başlat"
            disabled={!enough}
            loading={busy === 'start'}
            onPress={() =>
              void act('start', () => startShark(roomId), {
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
            testID="sk-start"
          />
        ) : (
          <Text style={styles.pText}>{`${view.host.name} oyunu başlatınca ekran kendiliğinden değişir.`}</Text>
        )}
      </>
    );
  } else if (phase === 'reveal') {
    if (me.is_player && role && roleInfo) {
      const wheel = Math.round(Math.min(width * 0.7, height * 0.36, 300));
      stage = (
        <View style={styles.stage}>
          {!wheelDone ? (
            <RoleWheel role={role} size={wheel} odds={view.odds} onDone={() => setWheelDone(true)} />
          ) : (
            <View style={[styles.roleCard, { borderColor: roleInfo.color }]}>
              <RoleIcon role={role} size={Math.round(Math.min(width * 0.32, 128))} />
              <Text style={[styles.roleName, { color: roleInfo.color }]}>{roleInfo.name}</Text>
              <Text style={[styles.roleTeam, { color: SK_TEAMS[roleInfo.team].color }]}>
                {`${SK_TEAMS[roleInfo.team].emoji} ${SK_TEAMS[roleInfo.team].name}`}
              </Text>
              <Text style={styles.roleGoal}>{roleInfo.goal}</Text>
              {isShark ? (
                <Text style={styles.allies}>
                  {'Takım arkadaşların ' +
                    (view.players
                      .filter((p) => p.ally)
                      .map((p) => `${circ(p.seat)} ${p.name} (${p.role ? SK_ROLES[p.role].name : '?'})`)
                      .join(', ') || 'yalnızsın')}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      );
    }
    prompt = {
      title: !me.is_player ? 'Roller dağıtılıyor' : wheelDone ? 'ROLÜN BU' : 'ÇARK DÖNÜYOR…',
      lines: wheelDone || !me.is_player ? [`Rolünü gören ${view.ready_count} / ${present.length}`, 'Ekranı kimseye gösterme.'] : [],
    };
    if (me.is_player && wheelDone && !me.ready) command = { text: '👀 ROLÜNÜ OKU, HAZIRIM DE', color: '#48CAE4' };
    actions = (
      <>
        {me.is_player && role ? (
          me.ready ? (
            <Text style={styles.pOk}>Hazırsın. Herkes hazır olunca dalış başlar.</Text>
          ) : (
            <GameButton
              label={wheelDone ? 'Rolümü gördüm, hazırım' : 'Çark dönüyor…'}
              disabled={!wheelDone}
              loading={busy === 'ready'}
              onPress={() => void act('ready', () => sharkReady(roomId))}
            />
          )
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'night') {
    const huntDone = !!me.hunt_target;
    const abilityDone = needAbility && me.ability_done === true;
    if (!me.is_player || !me.is_alive) {
      prompt = me.is_omniscient
        ? {
            title: `🌊 Okyanus karanlık · ${view.players.filter((p) => p.is_alive && p.acted).length} / ${view.players.filter((p) => p.is_alive).length}`,
            lines: flow,
          }
        : { title: '🤿 İzliyorsun', lines: flow };
    } else if (activeSlot === 'hunt') {
      prompt = {
        title: huntDone ? `🦈 Avın ${tag(me.hunt_target)}${needAbility ? ' · şimdi yeteneğin' : ''}` : '🦈 Avını seç',
        lines: flow,
        color: '#FF4D4D',
        pulse: !huntDone,
      };
      if (!huntDone) command = { text: '🦈 AVINI SEÇ', color: '#FF4D4D' };
    } else if (activeSlot === 'ability' && roleInfo) {
      prompt = {
        title: abilityDone
          ? me.ignite
            ? '📻 Telsiz bu gece patlayacak!'
            : `⟦r:${role}⟧ Seçimin ${me.night_target ? tag(me.night_target) : 'pas'}`
          : `⟦r:${role}⟧ ${abilityVerb(role)}: kişi seç`,
        lines: flow,
        color: roleInfo.color,
        pulse: !abilityDone,
      };
      if (!abilityDone) command = { text: `⟦r:${role}⟧ ${abilityVerb(role).toUpperCase()}: KİŞİ SEÇ`, color: roleInfo.color };
    } else {
      prompt = { title: '🤿 Dalıştasın, bekle', lines: flow };
    }
    const slotSel = selected;
    const saved = activeSlot === 'hunt' ? me.hunt_target : activeSlot === 'ability' ? me.night_target : null;
    actions = (
      <>
        {needHunt && needAbility ? (
          <View style={styles.row}>
            <SlotChip
              on={activeSlot === 'hunt'}
              label={`🦈 Av ${huntDone ? `${circ(seatOf(me.hunt_target))} ✓` : ''}`}
              onPress={() => setSlot({ key: phaseKey, slot: 'hunt' })}
            />
            <SlotChip
              on={activeSlot === 'ability'}
              label={`${roleInfo?.emoji ?? ''} ${abilityVerb(role)} ${abilityDone ? `${circ(seatOf(me.night_target))} ✓` : ''}`}
              onPress={() => setSlot({ key: phaseKey, slot: 'ability' })}
            />
          </View>
        ) : null}
        {activeSlot === 'hunt' || activeSlot === 'ability' ? (
          <View style={styles.row}>
            <GameButton
              flex
              label={
                slotSel && slotSel !== saved
                  ? `${activeSlot === 'hunt' ? '🦈 AVLA' : abilityVerb(role).toUpperCase()}: ${circ(seatOf(slotSel))}`
                  : saved
                    ? `✓ ${circ(seatOf(saved))} seçildi · değiştirmek için dokun`
                    : 'Bir avatara dokun'
              }
              disabled={!slotSel || slotSel === saved}
              loading={busy === 'night'}
              onPress={() => {
                if (!slotSel || !activeSlot) return;
                const kind = activeSlot === 'hunt' ? 'hunt' : 'ability';
                void act('night', () => sharkNight(roomId, kind, slotSel), {
                  after: () => {
                    if (kind === 'hunt' && needAbility) setSlot({ key: phaseKey, slot: 'ability' });
                  },
                });
              }}
              testID="sk-night-confirm"
            />
            {activeSlot === 'ability' ? (
              <GameButton
                label="Pas"
                variant="ghost"
                loading={busy === 'skip'}
                onPress={() => void act('skip', () => sharkNight(roomId, 'ability', null))}
              />
            ) : null}
          </View>
        ) : null}
        {role === 'surfer' && alivePlayer && me.marks.length > 0 && !me.ignite ? (
          <GameButton
            label={`📻 TELSİZ PATLAT (${me.marks.length} işaretli)`}
            variant="danger"
            loading={busy === 'ignite'}
            onPress={() =>
              void act('ignite', () => sharkNight(roomId, 'ignite', null), {
                confirm: () =>
                  confirmAction(
                    'Telsiz patlatılsın mı?',
                    'İşaretlediğin herkes bu gece derinlere çekilir (korunan kurtulur). İşaretler sıfırlanır.',
                    'Patlat',
                    true,
                    { icon: null },
                  ),
              })
            }
          />
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'day') {
    const spearMode = activeSlot === 'spear';
    prompt = spearMode
      ? { title: '🔱 Zıpkın: hedef seç', lines: ['Tek zıpkının var; geri dönüşü yok.'], color: '#0077B6', pulse: true }
      : {
          title: alivePlayer ? '☀️ Konuşun! Köpekbalığı kim?' : '☀️ Plaj',
          lines: flow,
          color: lastDead.length ? '#C1121F' : '#0B132B',
        };
    if (spearMode) command = { text: '🔱 ZIPKIN: HEDEF SEÇ', color: '#0077B6' };
    else if (alivePlayer) command = { text: '☀️ KONUŞUN: KÖPEKBALIĞI KİM?', color: '#FFB703' };
    const canSpear = role === 'spearman' && alivePlayer && !me.spear_used && round >= 2;
    const canMarshal = role === 'marshal' && alivePlayer && !view.marshal;
    actions = (
      <>
        {canSpear ? (
          spearMode ? (
            <View style={styles.row}>
              <GameButton
                flex
                label={selected ? `🔱 ${circ(seatOf(selected))} VUR` : 'Hedefe dokun'}
                variant="danger"
                disabled={!selected}
                loading={busy === 'spear'}
                onPress={() => {
                  const target = selected;
                  if (!target) return;
                  void act('spear', () => sharkSpear(roomId, target), {
                    confirm: () =>
                      confirmAction(`${plain(target)} vurulsun mu?`, 'Tek zıpkının var; geri dönüşü yok.', 'Vur', true, { icon: null }),
                    after: () => setSlot(null),
                  });
                }}
              />
              <GameButton label="Vazgeç" variant="ghost" onPress={() => setSlot(null)} />
            </View>
          ) : (
            <GameButton label="🔱 Zıpkın at" variant="ghost" onPress={() => setSlot({ key: phaseKey, slot: 'spear' })} />
          )
        ) : null}
        {canMarshal ? (
          <GameButton
            label="🎖️ Kimliğimi aç (oyum 2 sayılır)"
            variant="ghost"
            loading={busy === 'marshal'}
            onPress={() =>
              void act('marshal', () => sharkRevealMarshal(roomId), {
                confirm: () =>
                  confirmAction(
                    'Kimliğini açıyor musun?',
                    'Herkes Sahil Güvenlik Komutanı olduğunu görür; kafes oyun 2 sayılır ama köpekbalıklarının hedefi olabilirsin.',
                    'Kimliğimi aç',
                    false,
                    { icon: null },
                  ),
              })
            }
          />
        ) : null}
        {view.skip && alivePlayer && !spearMode ? (
          <SkipToggle
            skip={view.skip}
            busy={busy === 'skipdisc'}
            onToggle={(on) => void act('skipdisc', () => sharkSkip(roomId, on))}
          />
        ) : null}
        {role === 'medium' && alivePlayer ? (
          <GameButton label="🪸 Ölülerin frekansını aç" variant="ghost" onPress={() => setChatTab('dead')} />
        ) : null}
        {!me.can_control ? (
          <Text style={styles.pText}>
            {view.mode === 'auto' ? 'Süre dolunca kafes oylaması başlar.' : `Oylamayı ${view.host.name} başlatacak.`}
          </Text>
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'vote') {
    const myVote = voteOf.get(me.is_player ? (view.players.find((p) => p.is_me)?.id ?? '') : '');
    const pendingTxt = view.pending ? ` · ${view.pending.done} / ${view.pending.total}` : '';
    prompt = alivePlayer
      ? {
          title: me.voted ? `⛓️ Oyun ${me.vote_target ? tag(me.vote_target) : 'pas'}${pendingTxt}` : `⛓️ Oy ver: şüpheliyi seç${pendingTxt}`,
          lines: flow,
          color: '#C1121F',
          pulse: !me.voted,
        }
      : { title: `⛓️ Kafes oylaması${pendingTxt}`, lines: flow };
    if (alivePlayer && !me.voted) command = { text: '⛓️ OY VER: ŞÜPHELİYİ SEÇ', color: '#C1121F' };
    actions = alivePlayer ? (
      <>
        <View style={styles.row}>
          <GameButton
            flex
            label={
              selected && selected !== me.vote_target
                ? `⛓️ ${circ(seatOf(selected))} KAFESE AT (OY VER)`
                : myVote?.to
                  ? `✓ ${circ(seatOf(myVote.to))} · değiştirmek için dokun`
                  : 'Şüpheliye dokun'
            }
            variant="danger"
            disabled={!selected || selected === me.vote_target}
            loading={busy === 'vote'}
            onPress={() => {
              if (selected) void act('vote', () => sharkVote(roomId, selected));
            }}
            testID="sk-vote"
          />
          <GameButton
            label={me.voted && !me.vote_target ? 'Pas ✓' : 'Pas'}
            variant="ghost"
            disabled={me.voted && !me.vote_target}
            loading={busy === 'pass'}
            onPress={() => void act('pass', () => sharkVote(roomId, null))}
          />
        </View>
        {role === 'marshal' && !view.marshal ? (
          <GameButton
            label="🎖️ Kimliğimi aç (oyum 2 sayılır)"
            variant="ghost"
            loading={busy === 'marshal'}
            onPress={() => void act('marshal', () => sharkRevealMarshal(roomId))}
          />
        ) : null}
        {hostButton}
      </>
    ) : (
      hostButton
    );
  } else if (phase === 'vote_result') {
    const lv = view.last_vote;
    prompt = lv?.caged
      ? {
          title: `⛓️ ${tag(lv.caged.id)} kafeste · ⟦r:${lv.caged.role}⟧ ${SK_ROLES[lv.caged.role].name}`,
          lines: lv.skips ? [`${lv.skips} kişi pas geçti`] : [],
          color: '#C1121F',
        }
      : { title: lv?.tie ? 'Oylar eşit, kimse kafese girmedi' : 'Kimse kafese girmedi', lines: [] };
    actions = (
      <>
        {!me.can_control ? (
          <Text style={styles.pText}>
            {view.mode === 'auto' ? 'Az sonra yeni dalış başlıyor.' : `Yeni dalışı ${view.host.name} başlatacak.`}
          </Text>
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'ended') {
    const w = winnerText(view.winner);
    const iWon = me.is_player && isWinner(view.winner, role);
    const r = result?.data;
    const pointsText =
      view.mode === 'narrator'
        ? 'Anlatıcılı oyunda puan yazılmaz.'
        : !me.is_player
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
                  ? `${r.best_rank}. sıra · puan için en az ${result.rules.gameMinPlayers} kişi gerekir.`
                  : `${r.best_rank}. sıra · puan sınırın dolduğu için yazılmadı.`;
    prompt = {
      title: w.title,
      lines: [
        [me.is_player && role ? (iWon ? '🏆 Kazandın!' : 'Bu sefer kaybettin.') : null, pointsText].filter((x): x is string => !!x).join(' · '),
      ],
      color: w.color,
    };
    // Sıralama: kazananlar önce; sonra sona kalanlar, sonra oyunda en uzun kalan. Ayrılanlar en sonda.
    const mmss = (sec: number | null | undefined) => {
      const t = Math.max(0, sec ?? 0);
      return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    };
    const rankRows: RankRow[] = view.players
      .map((p) => ({ p, won: !!p.role && isWinner(view.winner, p.role) }))
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
        role: x.p.role
          ? { emoji: SK_ROLES[x.p.role].emoji, name: SK_ROLES[x.p.role].name, color: SK_ROLES[x.p.role].color, key: x.p.role }
          : null,
        time: `${mmss(x.p.alive_sec)}${x.p.left ? ' 🚪' : x.p.is_alive ? ' ✓' : ''}`,
        points: Number(x.p.points ?? 0) > 0 ? `+${fmtPts(Number(x.p.points))}` : '—',
        out: !x.p.is_alive,
      }));
    stage = <RankTable rows={rankRows} />;
    const next = view.next_room ?? null;
    actions = (
      <>
        {/* Oyun bitince bekleme odasına geçilir (aynı oyuncularla yeni el) */}
        {next && !me.left ? (
          <NextRoomButton seconds={10} onGo={() => router.replace({ pathname: '/kopekbaligi', params: { id: next } })} />
        ) : view.next_note === 'no_quota' ? (
          <Text style={styles.pText}>Kimsenin bu ay oyun hakkı kalmadığı için yeni el açılamadı.</Text>
        ) : null}
        <View style={styles.row}>
          <GameButton label="Puanlar" icon="trophy" variant="ghost" onPress={() => setPointsOpen(true)} />
          <GameButton
            label="Oyunlara dön"
            flex
            variant={next ? 'ghost' : 'primary'}
            onPress={() => {
              // Yeni el bekleme odasından da çıkılır (yer tutmasın)
              if (next) void leaveRoom(next);
              goToGames();
            }}
          />
        </View>
      </>
    );
  }

  // ---- Seçim rengi ----------------------------------------------------------------------------------
  const accent =
    activeSlot === 'hunt' ? '#FF4D4D' : activeSlot === 'ability' && roleInfo ? roleInfo.color : activeSlot === 'spear' ? '#0077B6' : '#FF4D4D';

  // ---- Üst şerit ------------------------------------------------------------------------------------
  const PHASE_TITLE: Record<typeof phase, string> = {
    lobby: 'Bekleme · Kıyı',
    reveal: 'Rol çarkı',
    night: '🤿 DALIŞ',
    day: '☀️ PLAJ',
    vote: '⛓️ KAFES OYLAMASI',
    vote_result: '⛓️ Oylama sonucu',
    ended: '🏁 Oyun bitti',
    cancelled: 'Oda kapandı',
  };
  const modeLabel = view.mode === 'auto' ? 'Otomatik' : view.mode === 'host' ? 'Yönetici' : 'Anlatıcılı';
  const subtitle = [view.remote ? 'Uzaktan' : 'Yan yana', modeLabel, view.event ? 'Etkinlik' : null]
    .filter(Boolean)
    .join(' · ');
  const timeKind = phase === 'night' ? 'oxygen' : phase === 'day' ? 'sun' : phase === 'vote' ? 'vote' : 'plain';
  const flash =
    phase === 'night'
      ? { text: '🤿 DALIŞ', sub: `${round}. gece · görüş düşüyor`, color: '#0B132B' }
      : phase === 'day'
        ? { text: '☀️ PLAJ', sub: lastDead.length ? `${lastDead.length} kişi avlandı` : 'Herkes sağ salim', color: '#FFB703' }
        : phase === 'vote'
          ? { text: '⛓️ KAFES', sub: 'Oylama başladı', color: '#C1121F' }
          : phase === 'ended'
            ? { text: '🏁', sub: winnerText(view.winner).title, color: winnerText(view.winner).color }
            : { text: '', color: '#000000' };
  const shakeKey =
    (phase === 'day' && lastDead.length > 0) || (phase === 'vote_result' && view.last_vote?.caged) || spearKey
      ? `${phaseKey}:${spearKey ?? ''}`
      : null;
  const fg = light ? '#0B132B' : '#FFFFFF';

  // ---- Sohbet gönderme / bildirme ----------------------------------------------------------------
  async function say(channel: 'all' | 'shark' | 'dead', text: string): Promise<string | null> {
    const res = await sharkSay(roomId, channel, text);
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
  const roomIsRemote = view.remote;
  const roomIsRematch = view.rematch === true;
  function requestLeave() {
    if (!mustConfirmLeave) {
      goToGames();
      return;
    }
    const lobby = phase === 'lobby';
    // Uzaktan eşleştirme odasında ve başlamış uzaktan oyunda oda sahibi ayrılınca oda kapanmaz, sahiplik devredilir
    const handOver = me.is_host && me.is_player && (roomIsMatch || (roomIsRemote && !lobby) || (roomIsRematch && lobby));
    const copy = handOver
      ? lobby
        ? { title: 'Odadan ayrıl', msg: 'Bekleme odasından çıkarsın; oda sahipliği başka bir oyuncuya geçer.', ok: 'Odadan ayrıl' }
        : {
            title: 'Oyundan ayrıl',
            msg: 'Ayrılırsan elenirsin ve geri dönemezsin. Oyun sürer, oda sahipliği başka bir oyuncuya geçer (başka gerçek oyuncu yoksa oda kapanır).',
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

  const sharkChatOpen = phase === 'night' && isShark && alivePlayer;
  const kickPoll = view.kick?.poll ?? null;
  const kickKey = kickPoll ? `${kickPoll.starter}>${kickPoll.target}` : null;
  const kickPopOpen = !!kickPoll && kickSeen !== kickKey && kickPoll.starter !== myPlayerId;
  const cardPlayer = card ? byId.get(card) ?? null : null;
  // Oyuncu penceresindeki seçenekler: önce pencere kapanır, sonra iş yapılır (uyarılar hep üstte açılsın)
  const kk = view.kick;
  const cardKick =
    !!cardPlayer && !!kk && kk.open && !kk.poll && kk.starts_left > 0 && me.is_player && !me.left &&
    (phase === 'lobby' || me.is_alive) && !cardPlayer.left;
  const cardOpts: { key: 'kick' | 'friend' | 'voice'; label: string; tone: CardButton['tone']; disabled?: boolean }[] = [
    ...(cardKick ? [{ key: 'kick' as const, label: `🚪 Atma oylaması başlat (${kk?.starts_left ?? 0} hak)`, tone: 'danger' as const }] : []),
    { key: 'friend', label: '➕ Arkadaş ekle', tone: 'primary', disabled: busy === 'friend' },
    ...(view.remote ? [{ key: 'voice' as const, label: '🔊 Ses mesajını şikâyet et', tone: 'ghost' as const }] : []),
  ];
  // Plaj başlayınca bu gecenin sonucun varsa (Oşinograf, Kaplan, Cankurtaran, kilit) görsel kart kendiliğinden açılır
  const autoResult =
    phase === 'day' && me.is_player && !me.left && sheet === null && resultClosed !== round && me.notes.some((n) => n.round === round);
  const voiceLeft = me.voice_left_ms ?? 10000;
  const chatOpen = alivePlayer && (phase === 'day' || phase === 'vote' || phase === 'vote_result');
  const deadWrite =
    playing && me.is_player && !me.left && (!me.is_alive || (role === 'medium' && (phase === 'day' || phase === 'vote')));
  // Yüzen yazışma: Genel her zaman; Takım yalnızca köpekbalıklarına; Ölüler elenenlere ve Medyum'a (sunucu süzer)
  // Oyun akışı: sunucu günlüğündeki herkese açık olaylar + sana özel gece sonuçların, renkli bilgi satırları olarak
  const roleText = (r: SkRole | null | undefined) => (r ? `⟦r:${r}⟧ ${SK_ROLES[r].name}` : '?');
  const logText = (e: SkLog): { text: string; color: string } | null => {
    switch (e.k) {
      case 'phase':
        return e.phase === 'reveal'
          ? { text: '🎡 Roller dağıtıldı, oyun başladı', color: '#B98CFF' }
          : e.phase === 'night'
            ? { text: `🌙 ${e.round}. gece, dalış başladı`, color: '#48CAE4' }
            : e.phase === 'day'
              ? { text: `☀️ ${e.round}. gün, plaj başladı`, color: '#FFB703' }
              : { text: '⛓️ Kafes oylaması başladı', color: '#FF8A98' };
      case 'night':
        return e.ids && e.ids.length
          ? { text: `🦈 ${e.night}. gece avlandı · ${e.ids.map((x) => `${tag(x)} ${roleOf(x)}`).join(' · ')}`, color: '#FF4D4D' }
          : { text: `🌊 ${e.night}. gece kimse avlanmadı`, color: '#34D399' };
      case 'spear':
        return { text: `🔱 Zıpkın ${tag(e.id)} vurdu, rolü ${roleText(e.role)}`, color: '#48CAE4' };
      case 'spear_miss':
        return { text: `🔱 Zıpkın ${tag(e.id)} kişisine ulaşamadı, biri onu korudu`, color: '#48CAE4' };
      case 'marshal':
        return { text: `🎖️ ${tag(e.id)} Sahil Güvenlik Komutanı olduğunu açıkladı, oyu 2 sayılır`, color: '#FFB703' };
      case 'vote':
        return e.id
          ? { text: `⛓️ ${tag(e.id)} kafese girdi, rolü ${roleText(e.role)}`, color: '#FF4D4D' }
          : { text: e.tie ? '⛓️ Oylar eşit, kimse kafese girmedi' : '⛓️ Kimse kafese girmedi', color: '#C9CED6' };
      case 'left':
        return { text: `🚪 ${tag(e.id)} oyundan ayrıldı, rolü ${roleText(e.role)}`, color: '#C9CED6' };
      case 'end':
        return e.winner ? { text: `🏁 ${winnerText(e.winner).title}`, color: winnerText(e.winner).color } : null;
      default:
        return null;
    }
  };
  const info: SkMsg[] = [];
  (view.log ?? []).forEach((e, i) => {
    const t = logText(e);
    if (t) info.push({ id: `log-${i}`, name: '', body: t.text, at: e.at, mine: false, round: e.round, phase: e.ph, system: { color: t.color } });
  });
  // Sana özel: gece sonuçların, o gecenin sonucunun hemen ardından
  for (const n of me.notes) {
    const after = (view.log ?? []).find((e) => e.k === 'night' && e.night === n.round);
    if (!after) continue;
    info.push({
      id: `note-${n.round}-${n.kind}-${n.id ?? ''}`,
      name: '',
      body: `🔒 Sana özel · ${noteLine(n)}`,
      at: new Date((Date.parse(after.at) || 0) + 1).toISOString(),
      mine: false,
      round: n.round,
      phase: 'day',
      system: { color: '#C8B6FF' },
    });
  }
  const chatTabs: ChatTabInfo[] = [
    {
      key: 'all',
      label: 'Genel',
      messages: view.chat ?? [],
      info,
      canWrite: chatOpen,
      placeholder: 'Herkese yaz…',
      closedText: !alivePlayer ? 'Yalnızca yaşayanlar yazar, sen okuyabilirsin.' : 'Dalışta herkes susar. Plajda ve oylamada yazılır.',
    },
    ...(view.shark_chat
      ? [
          {
            key: 'shark' as const,
            label: '🦈 Takım',
            messages: view.shark_chat,
            // Oyun akışı (bilgi satırları) takım sohbetinde de akar
            info,
            canWrite: sharkChatOpen,
            placeholder: 'Takımına yaz…',
            closedText: 'Takımınla yalnızca dalışta (gece) yazışırsın.',
          },
        ]
      : []),
    ...(view.dead_chat
      ? [
          {
            key: 'dead' as const,
            label: role === 'medium' && me.is_alive ? '🪸 Frekans' : '🪸 Ölüler',
            messages: view.dead_chat,
            canWrite: deadWrite,
            placeholder: 'Frekansa yaz…',
            closedText: 'Elenenler yazar. Medyum plajda ve oylamada yazabilir.',
          },
        ]
      : []),
  ];

  return (
    <View style={styles.root}>
      <StatusBar style={light ? 'dark' : 'light'} />
      <SharkBackdrop scene={scene} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Oyun ekranında Geri tuşu ve kaydırarak geri dönme çalışmaz: yalnızca kırmızı çıkış düğmesiyle çıkılır */}
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
            <Pressable
              onPress={blocking ? requestLeave : goToGames}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={blocking ? 'Oyundan ayrıl' : 'Oyunlara dön'}
              style={({ pressed }) => [styles.topBtn, styles.exitBtn, pressed && styles.pressed]}
              testID="sk-exit"
            >
              <Ionicons name="exit-outline" size={21} color="#FFFFFF" />
            </Pressable>
            {/* Kaçıncı gece / gün: büyük düğme biçiminde */}
            {playing && round > 0 ? (
              <View style={[styles.roundBadge, phase === 'night' ? styles.roundNight : styles.roundDay]}>
                <Text style={styles.roundText} numberOfLines={1}>
                  {phase === 'night' ? `🌙 ${round}. GECE` : `☀️ ${round}. GÜN`}
                </Text>
              </View>
            ) : null}
            <View style={styles.flex} accessibilityRole="header">
              <Text
                style={[styles.title, { color: fg }, !light && styles.shadow]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {PHASE_TITLE[phase]}
              </Text>
              <Text style={[styles.subtitle, { color: light ? '#24324F' : 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <SoundToggle color={fg} />
            {/* Kırmızı düğme: oyuncu listesi (ses şikâyeti) ve oyunu bildir */}
            {phase === 'lobby' || playing ? (
              <Pressable
                onPress={() => {
                  // Atma oylaması sürüyorsa önce oylama penceresi; açıkken basınca oyuncu listesi
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
                testID="sk-players"
              >
                <Ionicons name="people" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.body}>
            {playing && view.phase_limit !== null && !me.left ? (
              <TimeBar kind={timeKind} left={remain} limit={view.phase_limit} light={light} />
            ) : null}

            {/* Üstte: yapman gereken şey + olay akışı (oyuncu çoğaldıkça küçülür; yüksekliği sabit, hiçbir şey kaymaz) */}
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

            {/* Oyuncular, rol çarkı ya da sıralama tablosu. Kaydırma yok; uyarılar üstüne biner (yerleşimi itmez). */}
            <View style={styles.stageWrap}>
              {stage ?? (
                <SeatGrid
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
                  stickyKey={roomId}
                />
              )}
              {view.test || connError || (playing && me.is_player && !me.is_alive && !me.left) ? (
                <View style={styles.pills} pointerEvents="none">
                  {view.test ? <Pill text="Deneme odası, puan yazılmaz" tone="danger" /> : null}
                  {connError ? <Pill text="Bağlantı koptu, yeniden deniyor…" tone="warn" /> : null}
                  {playing && me.is_player && !me.is_alive && !me.left ? (
                    <Pill text="Elendin, izliyorsun" tone="danger" />
                  ) : null}
                </View>
              ) : null}
              {/* Atma oylaması */}
              {kickPoll && !kickPopOpen ? (
                <KickBar
                  targetSeat={seatOf(kickPoll.target)}
                  targetName={byId.get(kickPoll.target)?.name ?? ''}
                  yes={kickPoll.yes}
                  need={kickPoll.need}
                  left={Math.max(0, Math.ceil(kickPoll.left - elapsedKick))}
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
                        text={`🔊 ${tag(clipQueue.speaking.from)} konuşuyor${clipQueue.speaking.channel === 'shark' ? ' (takım)' : ''}${
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

            {/* Bas-konuş (uzaktan oda) */}
            {view.remote && playing && me.is_player && !me.left ? (
              <PushToTalk
                roomId={roomId}
                listening={listeningToMe}
                canTalk={
                  alivePlayer &&
                  !view.mic_banned &&
                  voiceLeft >= 500 &&
                  (phase === 'day' || phase === 'vote' || phase === 'vote_result' || (phase === 'night' && isShark))
                }
                leftMs={voiceLeft}
                closedText={
                  view.mic_banned
                    ? '🔇 Mikrofonun bir süreliğine kapatıldı'
                    : !me.is_alive
                    ? '🔇 Elendin, konuşamazsın'
                    : phase === 'night' && !isShark
                      ? '🔇 Dalışta mikrofonlar kapalı'
                      : voiceLeft < 500 && phase !== 'reveal'
                        ? '🔇 Bu tartışmadaki 10 sn hakkın bitti'
                        : '🔇 Plajda konuşulur'
                }
                channelText={`${phase === 'night' ? 'Yalnızca köpekbalıkları duyar' : 'Herkes duyar'} · bu tartışmada kalan ${Math.round(
                  voiceLeft / 1000,
                )} sn`}
                onRecording={setRecording}
                onSent={() => void load()}
              />
            ) : null}

            {/* Düğmeler */}
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

            {/* Alt şerit */}
            <View style={[styles.tools, light && styles.toolsLight]}>
              {me.is_player && role && phase !== 'lobby' && !me.left ? (
                <ToolButton icon="id-card-outline" label="Rolüm" onPress={() => setSheet('role')} testID="sk-role" />
              ) : null}
              <ToolButton
                icon="book-outline"
                label="Rehber"
                onPress={() => router.push('/kopekbaligi-rehber')}
                testID="sk-guide"
              />
              {phase === 'lobby' ? (
                <ToolButton icon="trophy" label="Puanlar" onPress={() => setPointsOpen(true)} />
              ) : null}
            </View>
          </View>

          {/* Atma oylaması: sağ üstteki kırmızı düğmeden açılan küçük pencere */}
          {kickPoll && kickPopOpen ? (
            <KickPopup
              top={topBottom + 8}
              starterSeat={seatOf(kickPoll.starter)}
              starterName={byId.get(kickPoll.starter)?.name ?? ''}
              targetSeat={seatOf(kickPoll.target)}
              targetName={byId.get(kickPoll.target)?.name ?? ''}
              yes={kickPoll.yes}
              need={kickPoll.need}
              left={Math.max(0, Math.ceil(kickPoll.left - elapsedKick))}
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

          {/* Oyuncu penceresi: rolü açığa çıktıysa rolü ve özelliği; atma oylaması, arkadaş ekle, ses şikâyeti */}
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
                      name: SK_ROLES[cardPlayer.role].name,
                      color: SK_ROLES[cardPlayer.role].color,
                      team: `${SK_TEAMS[SK_ROLES[cardPlayer.role].team].emoji} ${SK_TEAMS[SK_ROLES[cardPlayer.role].team].name}`,
                      teamColor: SK_TEAMS[SK_ROLES[cardPlayer.role].team].color,
                      text: SK_ROLES[cardPlayer.role].goal,
                    }
                  : null
              }
              buttons={cardOpts}
              onButton={(key) => cardAction(key as 'kick' | 'friend' | 'voice', cardPlayer.id)}
              onClose={() => setCard(null)}
            />
          ) : null}
        </Shake>
      </SafeAreaView>

      {/* Yüzen yazışma baloncuğu ve sürüklenebilen penceresi */}
      {view.chat && (playing || phase === 'ended') && !me.left ? (
        <SharkChat
          roomId={roomId}
          tabs={chatTabs}
          openTab={chatTab && chatTabs.some((t) => t.key === chatTab) ? chatTab : null}
          onOpenTab={setChatTab}
          startAt={view.server_now}
          seatOf={seatOf}
          onSend={(ch, t) => say(ch, t)}
          onReport={(m) => void report(m)}
          preferTab={phase === 'night' && isShark && me.is_alive ? 'shark' : null}
        />
      ) : null}

      <PhaseFlash flashKey={phaseKey} text={flash.text} sub={flash.sub} color={flash.color} />
      <CommandFlash
        cmdKey={command ? `${phaseKey}:${command.text}` : null}
        phaseKey={phaseKey}
        text={command?.text ?? null}
        color={command?.color ?? '#FFFFFF'}
      />

      {safety.isOpen ? safety.nodes : null}
      {inviteOpen && phase === 'lobby' && me.is_host ? (
        <InviteSheet roomId={roomId} onClose={() => setInviteOpen(false)} />
      ) : null}
      {sheet === 'role' && role && roleInfo ? (
        <SkSheet title={roleInfo.name} iconNode={<RoleIcon role={role} size={34} />} onClose={() => setSheet(null)}>
          <Text style={[styles.sheetTeam, { color: SK_TEAMS[roleInfo.team].color }]}>
            {`${SK_TEAMS[roleInfo.team].emoji} ${SK_TEAMS[roleInfo.team].name}`}
          </Text>
          <Text style={styles.sheetText}>{roleInfo.goal}</Text>
          {role === 'lifeguard' ? (
            <Text style={styles.sheetMuted}>{me.self_used ? 'Kendini koruma hakkını kullandın.' : 'Kendini 1 kez koruyabilirsin.'}</Text>
          ) : null}
          {role === 'spearman' ? (
            <Text style={styles.sheetMuted}>{me.spear_used ? 'Zıpkınını kullandın.' : 'Zıpkının duruyor.'}</Text>
          ) : null}
          {role === 'surfer' && me.marks.length ? (
            <Text style={styles.sheetMuted}>{`İşaretlediklerin ${me.marks.map((m) => `${circ(seatOf(m))}`).join(', ')}`}</Text>
          ) : null}
          {isShark ? (
            <Text style={styles.sheetMuted}>
              {'Takım arkadaşların ' +
                (view.players
                  .filter((p) => p.ally)
                  .map((p) => `${circ(p.seat)} ${p.name}${p.is_alive ? '' : ' (öldü)'}`)
                  .join(', ') || 'yalnızsın')}
            </Text>
          ) : null}
          {view.roles && Object.keys(view.roles).length ? (
            <>
              <Text style={styles.sheetHead}>Bu oyundaki roller</Text>
              <RoleRoster roles={view.roles} players={view.players} />
            </>
          ) : null}
          {me.notes.length ? (
            <>
              <Text style={styles.sheetHead}>Gece sonuçların</Text>
              <NightResult notes={me.notes} players={view.players} />
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
          <PlayerList players={view.players} onPick={pickPlayer} />
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
      {sheet === 'pick' && phase === 'lobby' && me.is_admin ? (
        <SkSheet title="Rolünü seç" icon="🎭" onClose={() => setSheet(null)}>
          <Text style={styles.sheetMuted}>
            Yalnızca moderatör ve yalnızca deneme odasında (deneme oyuncusu eklenmiş, puan yazılmayan) geçerlidir. Seçtiğin
            rol dağıtımda varsa sahibiyle yer değiştirir, yoksa senin rolün o olur.
          </Text>
          <RolePicker
            value={me.picked_role ?? null}
            busy={busy === 'pick'}
            onPick={(r) => void act('pick', () => sharkPickRole(roomId, r))}
          />
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        </SkSheet>
      ) : null}
      {(sheet === 'result' || autoResult) && me.notes.length ? (
        <SkSheet
          title="Gece sonucun"
          icon="🌙"
          onClose={() => {
            setResultClosed(round);
            setSheet(null);
          }}
        >
          <NightResult notes={me.notes.filter((n) => n.round === round)} players={view.players} />
        </SkSheet>
      ) : null}
      <GamePointsModal
        visible={pointsOpen}
        onClose={() => setPointsOpen(false)}
        players={present.length}
        extra={[SHARK_RANK_ITEM]}
      />
    </View>
  );
}

function SlotChip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B132B' },
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
  topBtnLight: { backgroundColor: 'rgba(255,255,255,0.7)' },
  exitBtn: { backgroundColor: '#D9304F', borderWidth: 2, borderColor: '#FFFFFF' },
  playersBtn: { backgroundColor: '#D9304F', borderWidth: 2, borderColor: '#FFFFFF' },
  title: { fontFamily: fonts.black, fontSize: 23, letterSpacing: 0.5 },
  roundBadge: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  roundNight: { backgroundColor: '#1C2541', borderColor: '#48CAE4' },
  roundDay: { backgroundColor: '#C2560C', borderColor: '#FFFFFF' },
  roundText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 16, letterSpacing: 0.5 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  subtitle: { fontFamily: fonts.semi, fontSize: 11.5 },
  body: { flex: 1, gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
  stageWrap: { flex: 1 },
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
    backgroundColor: 'rgba(11, 19, 43, 0.85)',
  },
  roleEmoji: { fontSize: 54 },
  roleName: { fontFamily: fonts.black, fontSize: 22, textAlign: 'center' },
  roleTeam: { fontFamily: fonts.extra, fontSize: 14 },
  roleGoal: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  allies: { color: '#FF8A98', fontFamily: fonts.semi, fontSize: 12.5, textAlign: 'center' },
  panel: { padding: 0 },
  panelInner: { gap: 8, padding: 10 },
  row: { flexDirection: 'row', gap: 8 },
  pText: { color: G.muted, fontSize: 12.5, lineHeight: 17 },
  pOk: { color: G.green, fontSize: 12.5, lineHeight: 17 },
  error: { color: G.redSoft, fontSize: 12.5, lineHeight: 17 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', gap: 4, paddingTop: 2 },
  toolsLight: { backgroundColor: 'rgba(11, 19, 43, 0.75)', borderRadius: 14, paddingVertical: 4 },
  chatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: 'rgba(11, 19, 43, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.5)',
  },
  chatBarHot: { backgroundColor: '#48CAE4', borderColor: '#48CAE4' },
  chatBarText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 13 },
  chatBarTextHot: { color: '#06201D' },
  speaking: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.9)',
  },
  speakingText: { color: '#06201D', fontFamily: fonts.extra, fontSize: 12.5 },
  voiceError: { alignSelf: 'center', color: '#FF8A98', fontFamily: fonts.extra, fontSize: 12.5 },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  chipOn: { backgroundColor: 'rgba(255, 77, 77, 0.35)', borderColor: '#FF4D4D' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.extra, fontSize: 12.5 },
  chipTextOn: { color: '#FFFFFF' },
  sheetTeam: { fontFamily: fonts.extra, fontSize: 15 },
  sheetText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  sheetMuted: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 },
  sheetHead: { color: '#48CAE4', fontFamily: fonts.black, fontSize: 15, marginTop: 6 },
});
