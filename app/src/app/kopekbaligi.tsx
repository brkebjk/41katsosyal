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
  ScrollView,
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
  ChatBox,
  isLightScene,
  PhaseFlash,
  Prompt,
  RoleWheel,
  SeatGrid,
  Shake,
  SharkBackdrop,
  SkSheet,
  TimeBar,
  type Seat,
  type SkScene,
} from '@/components/SharkStage';
import { PushToTalk, useClipQueue } from '@/components/SharkVoice';
import { SoundToggle } from '@/components/SoundToggle';
import { InfoCard, useElapsedSeconds } from '@/components/VampireParts';
import { G, GameButton, Glass, Pill, SkipToggle, ToolButton } from '@/components/VampireStage';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { SHARK_RANK_ITEM } from '@/lib/gameInfo';
import { fmtPts } from '@/lib/labels';
import { getMyGameResult, getPointRules, type MyGameResult, type PointRules } from '@/lib/ranking';
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
  sharkNext,
  sharkNight,
  sharkReady,
  sharkRevealMarshal,
  sharkSay,
  sharkSkip,
  sharkSpear,
  sharkVote,
  startShark,
  winnerText,
  type SkMsg,
  type SkPlayer,
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
  const [sheet, setSheet] = useState<'role' | 'shark' | 'dead' | 'chat' | null>(null);
  /** Herkese açık yazışmada en son görülen mesaj sayısı (yeni mesaj gelince çubuk yanar) */
  const [chatSeen, setChatSeen] = useState(0);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** Bu oyunda rol çarkı döndü mü (bu telefonda) */
  const [wheelDone, setWheelDone] = useState(false);
  const [result, setResult] = useState<{ data: MyGameResult | null; rules: PointRules } | null>(null);
  const safety = useSafetyMenu({ type: 'room', id: roomId });
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

  const elapsed = useElapsedSeconds(viewAt, live && view !== null && view.status === 'playing');

  // ---- Bas-konuş (uzaktan oda): gelen ses mesajları sırayla çalar; sen kaydederken sıra bekler ----------------------
  const [recording, setRecording] = useState(false);
  const voiceOn = !!view && view.remote && view.status === 'playing' && !view.me.left && live;
  const myPlayerId = view?.players.find((p) => p.is_me)?.id ?? null;
  const clipQueue = useClipQueue(view?.voice, myPlayerId, voiceOn, recording);

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
          Bekleme odasından ayrıldığında ya da bağlantın uzun süre koptuğunda listeden çıkarılırsın.
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
  const tag = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : undefined;
    return p ? `#${p.seat} ${p.name}` : '—';
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
  // Notlarım: Oşinograf'ın baktığı kişinin takımı avatarın altında görünür
  const scanned = new Map<string, string>();
  for (const n of me.notes) if (n.kind === 'scan' && n.id && n.team) scanned.set(n.id, n.team);

  const seats: Seat[] = view.players.map((p) => {
    const v = voteOf.get(p.id);
    let sign: Seat['sign'] = null;
    if (showVotes && v) {
      sign = v.to
        ? { text: `${seatOf(v.to) ?? '?'}${v.weight > 1 ? ' ×2' : ''}`, kind: v.weight > 1 ? 'double' : 'vote', target: v.to }
        : { text: 'PAS', kind: 'pass' };
    } else if (phase === 'night' && (isShark || me.is_omniscient) && p.hunt_pick && (p.ally || p.is_me || me.is_omniscient)) {
      sign = { text: `🦈${seatOf(p.hunt_pick) ?? '?'}`, kind: 'hunt', target: p.hunt_pick };
    }
    const known = p.role && (!p.is_me || phase === 'ended') ? SK_ROLES[p.role] : null;
    let label: Seat['label'] = null;
    if (known) label = { text: `${known.emoji} ${known.name}`, color: known.color };
    else if (scanned.has(p.id)) {
      const t = scanned.get(p.id) as keyof typeof SK_TEAMS;
      label = { text: `🔭 ${SK_TEAMS[t].name}`, color: SK_TEAMS[t].color };
    } else if (phase === 'lobby' && view.match) {
      label = (view.lobby_ready ?? []).includes(p.id)
        ? { text: '✓ Hazır', color: '#34D399' }
        : { text: '… bekliyor', color: light ? '#5B6472' : 'rgba(255,255,255,0.6)' };
    } else if (phase === 'lobby' && p.is_host) label = { text: '⭐ Oda sahibi', color: '#FFB703' };
    else if (phase === 'vote' && p.is_alive && !v) label = { text: '⏳ düşünüyor', color: light ? '#5B6472' : 'rgba(255,255,255,0.6)' };
    const deadLabel = p.left
      ? 'Ayrıldı'
      : !p.is_alive
        ? p.revealed
          ? `❌ ${known ? known.name : 'Sürgün'}`
          : '🤿 Maske kırıldı'
        : null;
    const selectable = validFor(activeSlot, p) && (activeSlot !== 'vote' || phase === 'vote');
    const badge =
      clipQueue.speaking?.from === p.id
        ? '🔊'
        : me.is_omniscient && (phase === 'night' || phase === 'reveal')
        ? p.acted
          ? '✅'
          : '⏳'
        : phase === 'night'
          ? '🤿'
          : phase === 'day'
            ? '☀️'
            : null;
    return {
      p,
      selectable,
      dim: activeSlot !== null && !selectable && p.is_alive,
      sign,
      votesIn: votesIn.get(p.id),
      badge,
      label,
      deadLabel,
      ally: p.ally,
      frame: frameOf(p),
      marked: role === 'surfer' && marks.has(p.id),
      // Rol simgesi: sunucu yalnızca görmeye hakkın olan rolleri gönderir (kendin, takımın, açıklananlar, anlatıcı, oyun sonu)
      roleEmoji: p.role ? { emoji: SK_ROLES[p.role].emoji, color: SK_ROLES[p.role].color } : null,
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
    if (!s.selectable || !activeSlot) return;
    setPick({ key: `${phaseKey}:${activeSlot}`, id: s.p.id });
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
  let prompt: { title: string; sub?: string | null; color?: string; pulse?: boolean } = { title: '' };
  let actions: ReactNode = null;
  let stage: ReactNode = null;
  const lastDead = view.last_night?.round === round ? view.last_night.dead : [];
  const myNotes = me.notes.filter((n) => n.round === round);
  const noteText = myNotes
    .map((n) =>
      n.kind === 'blocked'
        ? '🔨 Bu gece yeteneğin kilitlendi.'
        : n.kind === 'saved'
          ? `🛟 ${n.name} saldırıya uğradı; şamandıran kurtardı!`
          : n.kind === 'scan'
            ? `🔭 ${n.name}: ${n.team ? SK_TEAMS[n.team].name : '?'}${
                n.visits && n.visits.length
                  ? ` · akıntı: ${n.visits.map((x) => `${x.round}. gece → ${x.names.join(', ') || 'kimse'}`).join(' · ')}`
                  : ' · kimseyi ziyaret etmemiş'
              }`
            : `🐯 ${n.name} bu gece ${n.visits && n.visits.length ? n.visits.map((x) => x.names.join(', ')).join(', ') : 'kimseyi'} ziyaret etti.`,
    )
    .join('\n');

  if (me.left && phase !== 'ended') {
    prompt = { title: 'Oyundan çıkarıldın', sub: 'Oyundan ayrılan kişi elenmiş sayılır ve geri dönemez.', color: G.redSoft };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'cancelled') {
    prompt = { title: 'Oda kapandı', sub: closedText(view.close_reason, me.is_host) };
    actions = <GameButton label="Oyunlara dön" onPress={goToGames} />;
  } else if (phase === 'lobby' && view.match) {
    // Uzaktan eşleştirme lobisi: 6 kişi olunca "Hazırım" açılır; hazır diyenler demeyenlerden fazla olunca başlar
    const n = present.length;
    const readyIds = new Set(view.lobby_ready ?? []);
    const readyCount = present.filter((p) => readyIds.has(p.id)).length;
    const myReady = myPlayerId !== null && readyIds.has(myPlayerId);
    const canReady = n >= view.min_players;
    const need = Math.floor(n / 2) + 1;
    prompt = {
      title: canReady ? `HAZIR: ${readyCount} / ${n}` : `🌊 LOBİ · ${n} kişi`,
      sub: canReady
        ? `Başlamak için ${need} kişinin “Hazırım” demesi yeter. Beklersen ya da arkadaşını davet edersen kalabalık oyun daha çok puan verir (en çok 16 kişi).`
        : `“Hazırım” ${view.min_players} kişi olunca açılır (şu an ${n}). Arkadaşlarını davet et: kalabalık oyun daha çok puan verir.`,
      color: canReady ? '#34D399' : '#48CAE4',
      pulse: canReady && !myReady,
    };
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
        <Text style={styles.pText}>Herkes rumuzuyla görünür. Uzaktan oyun hak yemez; puanı yan yana oyunun yarısıdır.</Text>
      </>
    );
  } else if (phase === 'lobby') {
    const n = present.length;
    const sh = Math.floor(n * 0.3 + 0.5);
    const ne = n >= 16 ? 2 : n >= 10 ? 1 : 0;
    const enough = n >= view.min_players;
    const canStart = me.is_host || me.is_admin;
    prompt = {
      title: view.code ? `ODA KODU  ${view.code}` : 'Oyuncular toplanıyor',
      sub: enough
        ? `${n} oyuncu · 🦈 ${sh} köpekbalığı · 🏖️ ${n - sh - ne} insan${ne ? ` · 🌀 ${ne} tarafsız` : ''}`
        : `Başlamak için en az ${view.min_players} oyuncu gerekir (şu an ${n}, en çok ${view.max_players}).`,
      color: view.code ? '#FFB703' : undefined,
    };
    const modeText =
      view.mode === 'narrator'
        ? me.is_omniscient
          ? 'Anlatıcısın: oynamazsın, herkesin rolünü görür, aşamaları sen ilerletirsin. Anlatıcılı oyunda kimse puan almaz, hak düşmez.'
          : `Anlatıcı: ${view.host.name}. Anlatıcılı oyunda puan yok, hak düşmez.`
        : view.mode === 'host'
          ? me.is_host
            ? 'Ben Yöneticiyim: aşamaları sen ilerletirsin ve sen de oynarsın (rolleri görmezsin).'
            : `${view.host.name} aşamaları ilerletir ve o da oynar.`
          : 'Otomatik: süreler dolunca oyun kendiliğinden ilerler.';
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
                        'Kendi kendine oynayan 3 deneme oyuncusu eklenir. Oda deneme odası olur: kimseye puan, başarım ya da istatistik yazılmaz.',
                        'Ekle',
                      ),
                  })
                }
              />
            ) : null}
          </View>
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
                    { icon: 'water' },
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
            <RoleWheel role={role} size={wheel} onDone={() => setWheelDone(true)} />
          ) : (
            <View style={[styles.roleCard, { borderColor: roleInfo.color }]}>
              <Text style={styles.roleEmoji}>{roleInfo.emoji}</Text>
              <Text style={[styles.roleName, { color: roleInfo.color }]}>{roleInfo.name}</Text>
              <Text style={[styles.roleTeam, { color: SK_TEAMS[roleInfo.team].color }]}>
                {`${SK_TEAMS[roleInfo.team].emoji} ${SK_TEAMS[roleInfo.team].name}`}
              </Text>
              <Text style={styles.roleGoal}>{roleInfo.goal}</Text>
              {isShark ? (
                <Text style={styles.allies}>
                  {'Takımın: ' +
                    (view.players
                      .filter((p) => p.ally)
                      .map((p) => `#${p.seat} ${p.name} (${p.role ? SK_ROLES[p.role].name : '?'})`)
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
      sub: wheelDone || !me.is_player ? `Rolünü gören: ${view.ready_count} / ${present.length}. Ekranı kimseye gösterme.` : null,
    };
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
            title: '🌊 Okyanus karanlık',
            sub: `Seçim yapanlar: ${view.players.filter((p) => p.is_alive && p.acted).length} / ${view.players.filter((p) => p.is_alive).length}. Köpekbalıklarının av seçimi tabelada görünür.`,
          }
        : { title: '🤿 İzliyorsun', sub: 'Maskeni kırdılar; dalışı izleyebilirsin. Ölülerin sohbetine yazabilirsin.' };
    } else if (activeSlot === 'hunt') {
      const picks = view.players.filter((p) => (p.ally || p.is_me) && p.hunt_pick);
      prompt = {
        title: huntDone ? '🦈 Avın seçildi' : '🦈 AVINI SEÇ',
        sub: huntDone
          ? `Seçimin: ${tag(me.hunt_target)}${needAbility ? ' · şimdi yeteneğini kullan' : ''}`
          : `Bir avatara dokun. ${picks.length ? `Takım seçimleri: ${picks.map((p) => `#${p.seat}→#${seatOf(p.hunt_pick)}`).join(', ')}` : 'Takımınla aynı avı seçin.'}`,
        color: '#FF4D4D',
        pulse: !huntDone,
      };
    } else if (activeSlot === 'ability' && roleInfo) {
      prompt = {
        title: abilityDone ? `${roleInfo.emoji} Seçimin alındı` : `${roleInfo.emoji} ${abilityVerb(role).toUpperCase()}: KİŞİ SEÇ`,
        sub: abilityDone
          ? me.ignite
            ? '📻 Telsiz bu gece patlayacak!'
            : `Seçimin: ${me.night_target ? tag(me.night_target) : 'bu gece kullanmıyorum'}`
          : roleInfo.night,
        color: roleInfo.color,
        pulse: !abilityDone,
      };
    } else {
      prompt = {
        title: '🤿 DALIŞTASIN',
        sub: 'Bu gece yapacağın bir şey yok. Nefesini tut; plaja çıkınca ekran kendiliğinden değişir.',
      };
    }
    const slotSel = selected;
    const saved = activeSlot === 'hunt' ? me.hunt_target : activeSlot === 'ability' ? me.night_target : null;
    actions = (
      <>
        {needHunt && needAbility ? (
          <View style={styles.row}>
            <SlotChip
              on={activeSlot === 'hunt'}
              label={`🦈 Av ${huntDone ? `#${seatOf(me.hunt_target)} ✓` : ''}`}
              onPress={() => setSlot({ key: phaseKey, slot: 'hunt' })}
            />
            <SlotChip
              on={activeSlot === 'ability'}
              label={`${roleInfo?.emoji ?? ''} ${abilityVerb(role)} ${abilityDone ? `#${seatOf(me.night_target) ?? '–'} ✓` : ''}`}
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
                  ? `${activeSlot === 'hunt' ? '🦈 AVLA' : abilityVerb(role).toUpperCase()}: #${seatOf(slotSel)}`
                  : saved
                    ? `✓ #${seatOf(saved)} seçildi · değiştirmek için dokun`
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
                  ),
              })
            }
          />
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'day') {
    const ev = view.day_event;
    const deadText = lastDead.length
      ? `Maskesi kırılanlar: ${lastDead.map((d) => tag(d.id)).join(', ')}`
      : 'Bu dalışta kimsenin maskesi kırılmadı.';
    const evText = ev
      ? ev.kind === 'spear'
        ? `🔱 Zıpkın ${tag(ev.id)} kişisini vurdu (${ev.role ? SK_ROLES[ev.role].name : '?'})`
        : `🔱 Zıpkın ${tag(ev.id)} kişisine ulaşamadı!`
      : null;
    const spearMode = activeSlot === 'spear';
    prompt = spearMode
      ? { title: '🔱 ZIPKIN: HEDEF SEÇ', sub: 'Bir avatara dokun. Vurulanın rolü açıklanır; geri dönüşü yok.', color: '#0077B6', pulse: true }
      : {
          title: lastDead.length ? '☀️ PLAJ · MASKELER KIRILDI' : '☀️ PLAJ',
          sub: [evText, deadText, noteText || null, 'Konuşun: köpekbalığı kim?'].filter(Boolean).join('\n'),
          color: lastDead.length ? '#C1121F' : '#0B132B',
        };
    const canSpear = role === 'spearman' && alivePlayer && !me.spear_used && round >= 2;
    const canMarshal = role === 'marshal' && alivePlayer && !view.marshal;
    actions = (
      <>
        {canSpear ? (
          spearMode ? (
            <View style={styles.row}>
              <GameButton
                flex
                label={selected ? `🔱 #${seatOf(selected)} VUR` : 'Hedefe dokun'}
                variant="danger"
                disabled={!selected}
                loading={busy === 'spear'}
                onPress={() => {
                  const target = selected;
                  if (!target) return;
                  void act('spear', () => sharkSpear(roomId, target), {
                    confirm: () =>
                      confirmAction(`${tag(target)} vurulsun mu?`, 'Tek zıpkının var; geri dönüşü yok.', 'Vur', true),
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
          <GameButton label="🪸 Ölülerin frekansını aç" variant="ghost" onPress={() => setSheet('dead')} />
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
    prompt = alivePlayer
      ? {
          title: me.voted ? `OYUN: ${me.vote_target ? `#${seatOf(me.vote_target)}` : 'PAS'}` : '⛓️ OY VER: ŞÜPHELİYİ SEÇ',
          sub: `Avatara dokun. Oylar herkese açık: tabela kime oy verdiğini, kırmızı sayı aldığı oyu gösterir. En çok oyu alan kafese girer; eşitlikte kimse.${
            view.pending ? ` Oy verenler: ${view.pending.done} / ${view.pending.total}` : ''
          }`,
          color: '#C1121F',
          pulse: !me.voted,
        }
      : {
          title: '⛓️ Kafes oylaması',
          sub: view.pending ? `Oy verenler: ${view.pending.done} / ${view.pending.total}` : null,
        };
    actions = alivePlayer ? (
      <>
        <View style={styles.row}>
          <GameButton
            flex
            label={
              selected && selected !== me.vote_target
                ? `⛓️ #${seatOf(selected)} KAFESE AT (OY VER)`
                : myVote?.to
                  ? `✓ #${seatOf(myVote.to)} · değiştirmek için dokun`
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
          title: `⛓️ #${seatOf(lv.caged.id)} ${lv.caged.name} KAFESTE`,
          sub: `Rolü: ${SK_ROLES[lv.caged.role].emoji} ${SK_ROLES[lv.caged.role].name}${
            lv.skips ? ` · ${lv.skips} kişi pas geçti` : ''
          }`,
          color: '#C1121F',
        }
      : {
          title: 'Kimse kafese girmedi',
          sub: lv?.tie ? 'Oylar eşit çıktı.' : 'Yeterli oy çıkmadı.',
        };
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
      sub: [me.is_player && role ? (iWon ? '🏆 Kazandın!' : 'Bu sefer kaybettin.') : null, pointsText, 'Herkesin rolü avatarların altında.']
        .filter(Boolean)
        .join('\n'),
      color: w.color,
    };
    actions = (
      <View style={styles.row}>
        <GameButton label="Puanlar" icon="trophy" variant="ghost" onPress={() => setPointsOpen(true)} />
        <GameButton label="Oyunlara dön" flex onPress={goToGames} />
      </View>
    );
  }

  // ---- Seçim rengi ----------------------------------------------------------------------------------
  const accent =
    activeSlot === 'hunt' ? '#FF4D4D' : activeSlot === 'ability' && roleInfo ? roleInfo.color : activeSlot === 'spear' ? '#0077B6' : '#FF4D4D';

  // ---- Üst şerit ------------------------------------------------------------------------------------
  const PHASE_TITLE: Record<typeof phase, string> = {
    lobby: 'Bekleme · Kıyı',
    reveal: 'Rol çarkı',
    night: `🤿 DALIŞ · ${round}. gece`,
    day: `☀️ PLAJ · ${round}. gün`,
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
        ? { text: '☀️ PLAJ', sub: lastDead.length ? `${lastDead.length} maske kırıldı` : 'Herkes sağ salim', color: '#FFB703' }
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
      icon: 'flag',
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
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: 'flag', tone: 'success' });
  }

  async function reportClip(clipId: string, who: string) {
    const reason = await showDialog<string | null>({
      title: 'Ses mesajını bildir',
      message: `${who} kişisinin ses mesajı moderatörlere iletilir ve inceleme için en çok 14 gün saklanır. Kimin bildirdiğini bilmez.`,
      icon: 'flag',
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
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: 'flag', tone: 'success' });
  }

  function requestLeave() {
    if (!mustConfirmLeave) {
      goToGames();
      return;
    }
    const lobby = phase === 'lobby';
    const copy = me.is_host
      ? lobby
        ? { title: 'Odayı kapat', msg: 'Oda kapanır ve katılanlar oyuna giremez.', ok: 'Odayı kapat' }
        : { title: 'Oyunu kapat', msg: 'Oda sahibi olarak ayrılırsan oyun herkes için biter.', ok: 'Oyunu kapat' }
      : lobby
        ? { title: 'Odadan ayrıl', msg: 'Bekleme odasından çıkarsın.', ok: 'Odadan ayrıl' }
        : { title: 'Oyundan ayrıl', msg: 'Ayrılırsan elenirsin, rolün açıklanır ve geri dönemezsin.', ok: 'Oyundan ayrıl' };
    void act('leave', () => leaveRoom(roomId), {
      confirm: () => confirmAction(copy.title, copy.msg, copy.ok, true, { icon: 'exit-outline' }),
      after: () => {
        leaving.current = true;
        goToGames();
      },
    });
  }

  const sharkChatOpen = phase === 'night' && isShark && alivePlayer;
  const chat = view.chat ?? [];
  const chatOpen = alivePlayer && (phase === 'day' || phase === 'vote' || phase === 'vote_result');
  const lastChat = chat.length > 0 ? chat[chat.length - 1] : null;
  const chatHot = chat.length > chatSeen && !!lastChat && !lastChat.mine;
  const openChat = () => {
    setChatSeen(chat.length);
    setSheet('chat');
  };
  const deadCount = view.dead_chat?.length ?? 0;

  return (
    <View style={styles.root}>
      <StatusBar style={light ? 'dark' : 'light'} />
      <SharkBackdrop scene={scene} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Oyun ekranında Geri tuşu ve kaydırarak geri dönme çalışmaz: yalnızca kırmızı çıkış düğmesiyle çıkılır */}
        <BackBlocker enabled onBack={() => {}} />
        <Shake shakeKey={shakeKey}>
          {/* Üst şerit */}
          <View style={styles.top}>
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
            <View style={styles.flex} accessibilityRole="header">
              <Text style={[styles.title, { color: fg }, !light && styles.shadow]} numberOfLines={1}>
                {PHASE_TITLE[phase]}
              </Text>
              <Text style={[styles.subtitle, { color: light ? '#24324F' : 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <SoundToggle color={fg} />
            {phase === 'lobby' || playing ? safety.button : null}
          </View>

          <View style={styles.body}>
            {playing && view.phase_limit !== null && !me.left ? (
              <TimeBar kind={timeKind} left={remain} limit={view.phase_limit} light={light} />
            ) : null}
            {view.test || connError || (playing && me.is_player && !me.is_alive && !me.left) ? (
              <View style={styles.pills}>
                {view.test ? <Pill icon="hardware-chip-outline" text="Deneme odası · puan yazılmaz" tone="danger" /> : null}
                {connError ? <Pill icon="cloud-offline" text="Bağlantı koptu, yeniden deniyor…" tone="warn" /> : null}
                {playing && me.is_player && !me.is_alive && !me.left ? (
                  <Pill text="🤿 Maskeni kırdılar · izliyorsun" tone="danger" />
                ) : null}
              </View>
            ) : null}

            {/* Ortada: karar yazısı */}
            {prompt.title ? (
              <Prompt title={prompt.title} sub={prompt.sub} color={prompt.color} light={light} pulse={prompt.pulse} />
            ) : null}

            {/* Oyuncular ya da rol çarkı */}
            {stage ?? (
              <SeatGrid seats={seats} selected={selected} accent={accent} light={light} onPress={pressSeat} />
            )}

            {/* Bas-konuş (uzaktan oda) */}
            {view.remote && playing && me.is_player && !me.left ? (
              <>
                {clipQueue.error && !clipQueue.speaking ? (
                  <Text style={styles.voiceError}>{`⚠️ ${clipQueue.error}. Sorun sürerse bana bildir.`}</Text>
                ) : null}
                {clipQueue.speaking ? (
                  <Pressable
                    onLongPress={() => {
                      const c = clipQueue.speaking;
                      if (c) void reportClip(c.id, tag(c.from));
                    }}
                    delayLongPress={450}
                    accessibilityHint="Bildirmek için uzun bas"
                    style={styles.speaking}
                  >
                    <Text style={styles.speakingText} numberOfLines={1}>
                      {`🔊 ${tag(clipQueue.speaking.from)} konuşuyor${clipQueue.speaking.channel === 'shark' ? ' (takım)' : ''}${
                        clipQueue.waiting ? ` · sırada ${clipQueue.waiting}` : ''
                      }`}
                    </Text>
                  </Pressable>
                ) : null}
                <PushToTalk
                  roomId={roomId}
                  canTalk={
                    alivePlayer &&
                    (phase === 'day' || phase === 'vote' || phase === 'vote_result' || (phase === 'night' && isShark))
                  }
                  closedText={
                    !me.is_alive
                      ? '🔇 Elendin: konuşamazsın'
                      : phase === 'night'
                        ? '🔇 Dalışta mikrofonlar kapalı'
                        : '🔇 Plajda konuşulur'
                  }
                  channelText={phase === 'night' ? 'Yalnızca köpekbalıkları duyar' : 'Odadaki herkes duyar · sırayla çalar'}
                  onRecording={setRecording}
                  onSent={() => void load()}
                />
              </>
            ) : null}

            {/* Düğmeler */}
            {actions || actionError ? (
              <Glass style={[styles.panel, { maxHeight: Math.round(height * 0.32) }]}>
                <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelInner} bounces={false}>
                  {actions}
                  {actionError ? (
                    <Text style={styles.error} accessibilityLiveRegion="polite">
                      {actionError}
                    </Text>
                  ) : null}
                </ScrollView>
              </Glass>
            ) : null}

            {/* Herkese açık yazışma: son mesaj + yazma çubuğu (dokununca açılır) */}
            {view.chat && (playing || phase === 'ended') && !me.left ? (
              <Pressable
                onPress={openChat}
                accessibilityRole="button"
                accessibilityLabel="Yazışmayı aç"
                style={({ pressed }) => [styles.chatBar, chatHot && styles.chatBarHot, pressed && styles.pressed]}
                testID="sk-chat-bar"
              >
                <Ionicons name="chatbubble-ellipses" size={16} color={chatHot ? '#06201D' : '#FFFFFF'} />
                <Text style={[styles.chatBarText, chatHot && styles.chatBarTextHot]} numberOfLines={1}>
                  {lastChat
                    ? `${lastChat.mine ? 'Sen' : lastChat.name}: ${lastChat.body}`
                    : chatOpen
                      ? 'Mesaj yaz…'
                      : phase === 'night'
                        ? 'Dalışta herkes susar'
                        : 'Henüz mesaj yok'}
                </Text>
                {chatOpen ? <Ionicons name="create-outline" size={17} color={chatHot ? '#06201D' : '#48CAE4'} /> : null}
              </Pressable>
            ) : null}

            {/* Alt şerit */}
            <View style={[styles.tools, light && styles.toolsLight]}>
              {me.is_player && role && phase !== 'lobby' && !me.left ? (
                <ToolButton icon="id-card-outline" label="Rolüm" onPress={() => setSheet('role')} testID="sk-role" />
              ) : null}
              {view.shark_chat ? (
                <ToolButton
                  icon="chatbubbles"
                  label="Takım"
                  hot={sharkChatOpen}
                  badge={view.shark_chat.length || null}
                  onPress={() => setSheet('shark')}
                  testID="sk-shark-chat"
                />
              ) : null}
              {view.dead_chat ? (
                <ToolButton
                  icon="skull"
                  label={role === 'medium' && me.is_alive ? 'Frekans' : 'Ölüler'}
                  badge={deadCount || null}
                  onPress={() => setSheet('dead')}
                  testID="sk-dead-chat"
                />
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
        </Shake>
      </SafeAreaView>

      <PhaseFlash flashKey={phaseKey} text={flash.text} sub={flash.sub} color={flash.color} />

      {safety.isOpen ? safety.nodes : null}
      {inviteOpen && phase === 'lobby' && me.is_host ? (
        <InviteSheet roomId={roomId} onClose={() => setInviteOpen(false)} />
      ) : null}
      {sheet === 'role' && role && roleInfo ? (
        <SkSheet title={roleInfo.name} icon={roleInfo.emoji} onClose={() => setSheet(null)}>
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
            <Text style={styles.sheetMuted}>{`İşaretliler: ${me.marks.map((m) => `#${seatOf(m) ?? '?'}`).join(', ')}`}</Text>
          ) : null}
          {isShark ? (
            <Text style={styles.sheetMuted}>
              {'Takımın: ' +
                (view.players
                  .filter((p) => p.ally)
                  .map((p) => `#${p.seat} ${p.name}${p.is_alive ? '' : ' (öldü)'}`)
                  .join(', ') || 'yalnızsın')}
            </Text>
          ) : null}
          {me.notes.length ? (
            <>
              <Text style={styles.sheetHead}>Notların</Text>
              {[...me.notes].reverse().map((n, i) => (
                <Text key={i} style={styles.sheetText}>
                  {`${n.round}. gece · ` +
                    (n.kind === 'blocked'
                      ? 'yeteneğin kilitlendi'
                      : n.kind === 'saved'
                        ? `${n.name} kişisini kurtardın`
                        : n.kind === 'scan'
                          ? `${n.name}: ${n.team ? SK_TEAMS[n.team].name : '?'} · akıntı: ${
                              n.visits?.map((x) => `${x.round}. gece → ${x.names.join(', ') || 'kimse'}`).join(' · ') ||
                              'yok'
                            }`
                          : `${n.name} → ${n.visits?.map((x) => x.names.join(', ')).join(', ') || 'kimseyi ziyaret etmedi'}`)}
                </Text>
              ))}
            </>
          ) : null}
        </SkSheet>
      ) : null}
      {sheet === 'chat' && view.chat ? (
        <SkSheet title="Yazışma" icon="💬" onClose={() => setSheet(null)}>
          <Text style={styles.sheetMuted}>
            Plajda ve oylamada yaşayanlar yazar; odadaki herkes okur. Dalışta yazışma kapalıdır. Mesaja uzun basarak
            bildirebilirsin.
          </Text>
          <ChatBox
            messages={view.chat}
            canWrite={chatOpen}
            placeholder="Herkese yaz…"
            emptyText="Henüz mesaj yok."
            onSend={(t) => say('all', t)}
            onReport={(m) => void report(m)}
          />
        </SkSheet>
      ) : null}
      {sheet === 'shark' && view.shark_chat ? (
        <SkSheet title="Köpekbalığı frekansı" icon="🦈" onClose={() => setSheet(null)}>
          <Text style={styles.sheetMuted}>Yalnızca köpekbalıkları görür. Yalnızca dalışta (gece) yazılabilir.</Text>
          <ChatBox
            messages={view.shark_chat}
            canWrite={sharkChatOpen}
            placeholder="Takımına yaz…"
            emptyText="Henüz mesaj yok."
            onSend={(t) => say('shark', t)}
            onReport={(m) => void report(m)}
          />
        </SkSheet>
      ) : null}
      {sheet === 'dead' && view.dead_chat ? (
        <SkSheet title="Ölülerin frekansı" icon="🪸" onClose={() => setSheet(null)}>
          <Text style={styles.sheetMuted}>
            Elenenler yazar. Mercan Medyumu plajda ve oylamada okuyup yazabilir. Yaşayanlar göremez.
          </Text>
          <ChatBox
            messages={view.dead_chat}
            canWrite={
              playing &&
              me.is_player &&
              !me.left &&
              (!me.is_alive || (role === 'medium' && (phase === 'day' || phase === 'vote')))
            }
            placeholder="Frekansa yaz…"
            emptyText="Henüz mesaj yok."
            onSend={(t) => say('dead', t)}
            onReport={(m) => void report(m)}
          />
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
  title: { fontFamily: fonts.black, fontSize: 18 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  subtitle: { fontFamily: fonts.semi, fontSize: 11.5 },
  body: { flex: 1, gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
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
  panelScroll: { flexGrow: 0 },
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
