import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type ActionOption } from '@/components/ActionSheet';
import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { InviteSheet } from '@/components/InviteSheet';
import { InfoModal } from '@/components/InfoModal';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoleCard } from '@/components/RoleCard';
import { useSafetyMenu } from '@/components/SafetyMenu';
import { PushToTalk, useClipQueue } from '@/components/SharkVoice';
import { useVoiceRoom } from '@/components/VoicePanel';
import { Screen } from '@/components/Screen';
import { DeadChat, RoleGallery } from '@/components/VampireExtras';
import { WhisperCompose, WhisperPanel } from '@/components/VampireWhispers';
import { clock, InfoCard, useElapsedSeconds } from '@/components/VampireParts';
import {
  ClockBar,
  G,
  GameButton,
  Glass,
  NextRoomButton,
  Pill,
  PlayerGrid,
  SkipToggle,
  ToolButton,
  type Tile,
} from '@/components/VampireStage';
import { useAuth } from '@/lib/auth';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { fmtPts } from '@/lib/labels';
import { VAMPIRE_RANK_ITEM, type InfoItem } from '@/lib/gameInfo';
import { VAMPIRE_CARD_ASPECT, vampireImages } from '@/lib/images';
import { getMyGameResult, getPointRules, type MyGameResult, type PointRules } from '@/lib/ranking';
import { joinRoomWithLocation, leaveRoom } from '@/lib/rooms';
import type { Result } from '@/lib/rpc';
import { initSounds, onSoundChange, playSound, releaseSounds, setSoundOn, soundOn } from '@/lib/sounds';
import { isBackendReady } from '@/lib/supabase';
import {
  beginNight,
  beginVote,
  castVote,
  compositionText,
  endNight,
  endVote,
  getVampireView,
  markRoleSeen,
  nightAction,
  reportDeadMessage,
  reportWhisper,
  sayAsDead,
  ROLES,
  addTestBots,
  sceneFor,
  sendWhisper,
  skipDiscussion,
  startVampireGame,
  vvLobbyReady,
  VV_NOT_IN_ROOM,
  VV_ROOM_GONE,
  type VvPhase,
  type VvPlayer,
  type VvView,
  type VvWhisper,
} from '@/lib/vampire';
import { kickStart, kickVote, reportVoiceClip } from '@/lib/shark';
import { KickBar } from '@/components/SharkStage';
import { colors, fonts, fontSizes, spacing } from '@/theme';

const POLL_MS = 2500;
/** "Oy kullanmıyorum" seçeneğinin yer tutucu kimliği */
const SKIP = '__skip__';
const KEEP_AWAKE_TAG = 'vampir-koylu';

/** Otomatik oyunda her aşamanın geri sayım başlığı */
const CLOCK_LABEL: Partial<Record<VvPhase, string>> = {
  reveal: 'Gecenin başlamasına kalan süre',
  night: 'Sabaha kalan süre',
  dawn: 'Oylamanın başlamasına kalan süre',
  vote: 'Oylamanın bitmesine kalan süre',
  vote_result: 'Yeni geceye kalan süre',
};

/** Oda kapandığında oyunculara gösterilen neden. */
function closedText(reason: string | null, isHost: boolean): string {
  if (reason === 'quit') {
    return isHost ? 'Odadan ayrıldığın için oda kapandı.' : 'Oda sahibi odadan ayrıldığı için oyun kapandı.';
  }
  if (reason === 'timeout') {
    return isHost
      ? 'Bağlantın uzun süre koptuğu için oda kapandı.'
      : 'Oda sahibinin bağlantısı koptuğu için oyun kapandı.';
  }
  if (reason === 'inactive') return 'Uzun süre kimse bir işlem yapmadığı için oyun kapandı.';
  return 'Oyunu açan kişi odayı kapattı.';
}

/** Android Geri tuşunu yakalar (oyundan sessizce çıkılmasın; “Oyundan ayrıl” penceresi açılır). */
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

function goToGames() {
  if (router.canGoBack()) router.back();
  else router.replace('/games');
}

export default function VampireScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;

  if (!id) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Oda bulunamadı">
          Oyunu Oyunlar sekmesinden açılan bir odaya katılarak ya da kendin bir oda açarak başlatabilirsin.
        </InfoCard>
        <PrimaryButton label="Oyunlara dön" variant="ghost" onPress={goToGames} />
      </Screen>
    );
  }
  return <Game key={id} roomId={id} />;
}

function Game({ roomId }: { roomId: string }) {
  const { width, height } = useWindowDimensions();
  const myId = useAuth().profile?.id ?? null;
  const [view, setView] = useState<VvView | null>(null);
  /** Görünümün sunucudan alındığı an (ms); geri sayım bu andan itibaren akıtılır */
  const [viewAt, setViewAt] = useState(0);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connError, setConnError] = useState(false);
  /** Oyunculuk bitti: odadan çıkarıldık ya da oda artık yok */
  const [gone, setGone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [faceUp, setFaceUp] = useState(false);
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  /** Açık bilgi penceresi: nasıl oynanır / puan nasıl kazanılır */
  const [info, setInfo] = useState<'how' | 'points' | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Kırmızı ünlem: 112'yi ara ya da oyunu bildir (lobide ve oyun sırasında)
  const safety = useSafetyMenu({ type: 'room', id: roomId }, { emergency: view?.remote !== true });
  /** Oyun bitince: bu oyundaki sıram ve yazılan puan */
  const [result, setResult] = useState<{ data: MyGameResult | null; rules: PointRules } | null>(null);
  const lock = useRef(false);
  const loadSeq = useRef(0);
  const lastKey = useRef<string | null>(null);
  const hasView = useRef(false);
  /** Kendi isteğimle ayrıldım: ekran kapanırken "çıkarıldın" ekranı yanıp sönmesin */
  const leaving = useRef(false);
  /** Fısıltı yazma penceresi (cevapsa hangi fısıltıya) */
  /** Fısıltı yazma penceresi (cevapsa hangi fısıltıya; avatardan açıldıysa kime) */
  const [compose, setCompose] = useState<{ replyTo: VvWhisper | null; to?: string | null } | null>(null);
  /** "Oyun kartlarını gör" penceresi */
  const [cardsOpen, setCardsOpen] = useState(false);
  const [sound, setSound] = useState(soundOn);
  /** Açık alt pencere: fısıltılar, rolüm, elenenlerin sohbeti */
  const [sheet, setSheet] = useState<'whispers' | 'role' | 'dead' | null>(null);
  /** Avatara dokunulunca açılan menü (fısılda, odadan atma oyu) */
  const [menuFor, setMenuFor] = useState<VvPlayer | null>(null);
  const [playersOpen, setPlayersOpen] = useState(false);
  /** Fısıltı listesi en son açıldığında bana gelmiş fısıltı sayısı (yenisi gelince düğme yanar) */
  const [seenIncoming, setSeenIncoming] = useState(0);

  const load = useCallback(async () => {
    if (!isBackendReady || leaving.current) return;
    const my = ++loadSeq.current;
    const res = await getVampireView(roomId);
    if (my !== loadSeq.current || leaving.current) return; // daha yeni bir okuma başladı
    if (res.error || !res.view) {
      if (hasView.current && (res.error === VV_NOT_IN_ROOM || res.error === VV_ROOM_GONE)) {
        setGone(true); // bekleme salonundan çıkarıldık
      } else if (hasView.current) {
        setConnError(true); // kısa bir bağlantı kopması ekranı bozmaz; sonraki okuma düzeltir
      } else {
        setLoadError(res.error ?? 'Oyun okunamadı.');
      }
      setLoaded(true);
      return;
    }
    setLoadError(null);
    setConnError(false);
    hasView.current = true;
    // Aşama değişince telefon kısa titrer: masadakiler birbirine bakarken ekrana dönsün
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

  // Oyun bitene (ya da bizim oyundan çıkmamıza) kadar birkaç saniyede bir tazelenir. Bu okuma aynı zamanda
  // sunucuya "buradayım" der; 45 sn gelmezse sunucu bizi oyundan çıkarır. Uygulama öne gelince hemen tazelenir.
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

  // Oyun bitince bir kez: sıram ve yazılan puan (sunucu puanı oyun biterken kendisi yazar)
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

  // Oyun sürerken ekran kendiliğinden kararmasın (kararırsa "buradayım" işareti kesilir, oyundan çıkarılırsın)
  const stayAwake = live && view !== null;
  useEffect(() => {
    if (!stayAwake) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [stayAwake]);

  // Saniyede bir sayan saat: otomatik oyunun geri sayımı ve elle bitirme düğmesinin bekleme süresi
  const elapsed = useElapsedSeconds(
    viewAt,
    live && view !== null && (view.status === 'playing' || (view.rematch_left ?? null) !== null || !!view.kick?.poll),
  );

  // ---- Sesler: gece/gündüz geçişi, ölüm, oylama, sonuç, son saniyeler, fısıltı -------------------------
  useEffect(() => {
    void initSounds().then(() => setSound(soundOn()));
    const off = onSoundChange(setSound);
    return () => {
      off();
      releaseSounds();
    };
  }, []);
  const soundKey = view ? `${view.phase}:${view.round}` : null;
  const lastSoundKey = useRef<string | null>(null);
  const killTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!view || !soundKey || lastSoundKey.current === soundKey) return;
    const first = lastSoundKey.current === null;
    lastSoundKey.current = soundKey;
    if (first) return; // ekrana yeni girildi: ortadaki aşamanın sesi çalmasın
    if (view.phase === 'reveal') playSound('vv_reveal');
    else if (view.phase === 'night') playSound('vv_night');
    else if (view.phase === 'dawn') {
      playSound('vv_day');
      if ((view.last_night?.killed.length ?? 0) > 0) {
        // Önce sabah, ardından ölüm haberi
        if (killTimer.current) clearTimeout(killTimer.current);
        killTimer.current = setTimeout(() => playSound('vv_kill', 0.9), 1300);
      }
    } else if (view.phase === 'vote') playSound('vv_vote');
    else if (view.phase === 'vote_result') playSound(view.last_vote?.executed ? 'vv_exile' : 'vv_vote');
    else if (view.phase === 'ended') {
      const team = view.me.role ? ROLES[view.me.role].team : null;
      const won = team ? (team === 'vampire') === (view.winner === 'vampire') : view.winner !== 'vampire';
      playSound(won ? 'vv_win' : 'vv_lose');
    }
  }, [soundKey, view]);
  useEffect(
    () => () => {
      if (killTimer.current) clearTimeout(killTimer.current);
    },
    [],
  );
  // Otomatik oyunda son 5 saniye: saat tik-takı
  const remainSec =
    view && view.status === 'playing' && view.phase_limit !== null
      ? Math.max(0, view.phase_limit - view.phase_age - elapsed)
      : -1;
  const lastClock = useRef(-1);
  useEffect(() => {
    if (remainSec < 1 || remainSec > 5 || lastClock.current === remainSec) return;
    lastClock.current = remainSec;
    playSound('vv_clock', 0.7);
  }, [remainSec]);
  // Yeni fısıltı: bana geldiyse ses + titreşim, başkasınınsa kısık ses
  const whisperCount = view?.whispers.length ?? 0;
  const lastWhispers = useRef(-1);
  useEffect(() => {
    if (!view) return;
    const prev = lastWhispers.current;
    lastWhispers.current = whisperCount;
    if (prev < 0 || whisperCount <= prev) return;
    const myId = view.players.find((p) => p.is_me)?.id;
    const fresh = view.whispers.slice(prev);
    if (fresh.some((w) => w.to === myId)) {
      playSound('vv_whisper', 0.9);
      Vibration.vibrate([0, 80, 60, 80]);
    } else if (fresh.some((w) => w.from !== myId)) {
      playSound('vv_whisper', 0.4);
    }
  }, [whisperCount, view]);

  // Uzaktan oda: bas-konuş ses mesajları (Köpekbalığı Kafesi'ndeki gibi). Eski sırayla sesli sohbet (Agora) kodda
  // duruyor ama Vampir–Köylü'de kullanılmıyor (oda verilmez, bağlanmaz).
  const voiceOn =
    !gone && !!view && view.remote === true && !view.me.left && view.phase !== 'ended' && view.phase !== 'cancelled';
  const voice = useVoiceRoom(null, myId);
  const [recording, setRecording] = useState(false);
  const clipQueue = useClipQueue(view?.voice, myId, voiceOn && view?.status === 'playing', recording);

  /** Bir işlemi yapar: çift dokunmayı engeller, istenirse önce onay sorar, sonunda görünümü tazeler. */
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
        <Text style={styles.muted}>Oyun yükleniyor…</Text>
      </Screen>
    );
  }
  if (gone) {
    return (
      <Screen title="Vampir–Köylü" onBack={goToGames} backLabel="Oyunlar">
        <InfoCard title="Odadan çıkarıldın" tone="danger">
          Bekleme odasından ayrıldığında, yeni elde “Hazırım” demediğinde ya da bağlantın uzun süre koptuğunda listeden çıkarılırsın. İstersen oda kodunu
          Oyunlar sekmesinden tekrar girerek katılabilirsin.
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

  const me = view.me;
  const phase = view.phase;
  const mode = view.mode;
  const canControl = me.can_control;
  const canStart = (me.is_host || me.is_admin) && !view.match;
  // Eşleştirme lobisi ve yeni el bekleme odası: "Hazırım"
  const readyMode = phase === 'lobby' && (view.match === true || (view.rematch === true && view.rematch_left != null));
  const readyIds = new Set(view.lobby_ready ?? []);
  const myVvId = view.players.find((p) => p.is_me)?.id ?? null;
  const myReady = myVvId !== null && readyIds.has(myVvId);
  const phaseKey = `${phase}:${view.round}`;
  const alive = view.players.filter((p) => p.is_alive);
  const present = view.players.filter((p) => !p.left);
  const playing = phase !== 'lobby' && phase !== 'ended' && phase !== 'cancelled';
  const pickedId = pick && pick.key === phaseKey ? pick.id : undefined;
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? '—';
  const myPid = view.players.find((p) => p.is_me)?.id ?? null;
  /** Oyunu ilerleten kişi, cümle içinde: "sen" ya da kişinin adı */
  const managerName = me.is_host ? 'sen' : view.host.name;
  /** Bu kişi oyundan ayrılırken uyarı alır (izleyen moderatör sorgusuz çıkar) */
  const mustConfirmLeave = !me.left && (me.is_player || me.is_host) && phase !== 'ended' && phase !== 'cancelled';
  /** Oda sahibi olmayan üyeler geceyi/oylamayı ancak bu süre geçince elle bitirebilir */
  const waitLeft = me.is_omniscient ? 0 : Math.max(0, view.force_after - view.phase_age - elapsed);

  const vvMatch = view.match === true;
  const vvRemote = view.remote === true;
  const vvRematch = view.rematch === true;
  function requestLeave() {
    if (!mustConfirmLeave) {
      goToGames();
      return;
    }
    const lobby = phase === 'lobby';
    const quota = me.is_admin ? '' : ' Oyun başlamadığı için aylık hakkın geri verilir.';
    // Eşleştirme odasında, yeni el bekleme odasında ve başlamış uzaktan oyunda oda sahibi ayrılınca sahiplik devredilir
    const handOver =
      me.is_host && me.is_player && (vvMatch || (vvRemote && !lobby) || (vvRematch && lobby));
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
        ? { title: 'Odayı kapat', msg: `Oda kapanır ve katılanlar oyuna giremez.${quota}`, ok: 'Odayı kapat' }
        : {
            title: 'Oyunu kapat',
            msg: 'Oda sahibi olarak ayrılırsan oyun herkes için biter ve bir daha açılmaz.',
            ok: 'Oyunu kapat',
          }
      : lobby
        ? {
            title: 'Odadan ayrıl',
            msg: 'Bekleme odasından çıkarsın. İstersen kodu tekrar girerek katılabilirsin.',
            ok: 'Odadan ayrıl',
          }
        : {
            title: 'Oyundan ayrıl',
            msg: 'Ayrılırsan oyundan elenirsin, rolün diğerlerine açıklanır ve geri dönemezsin.',
            ok: 'Oyundan ayrıl',
          };
    void act('leave', () => leaveRoom(roomId), {
      confirm: () => confirmAction(copy.title, copy.msg, copy.ok, true, { icon: 'exit-outline' }),
      after: () => {
        leaving.current = true;
        goToGames();
      },
    });
  }

  // ---- Oyunu ilerleten kişinin düğmeleri (otomatik oyunda kimse ilerletmez) -------------------
  const hostButton = (() => {
    if (!canControl || !playing) return null;
    if (phase === 'reveal') {
      const everyone = view.ready_count >= present.length;
      return (
        <GameButton
          label="Geceyi başlat"
          icon="moon"
          loading={busy === 'night'}
          onPress={() =>
            void act('night', () => beginNight(roomId), {
              confirm: everyone
                ? undefined
                : () =>
                    confirmAction(
                      'Herkes hazır değil',
                      `${present.length - view.ready_count} kişi rolünü henüz görmedi. Yine de geceyi başlatmak istiyor musun?`,
                      'Geceyi başlat',
                    ),
            })
          }
        />
      );
    }
    if (phase === 'night') {
      const left = view.pending ? view.pending.total - view.pending.done : 0;
      const gated = waitLeft > 0;
      return (
        <GameButton
          label={gated ? `Geceyi bitir · ${clock(waitLeft)}` : 'Geceyi bitir'}
          variant={left > 0 || !view.pending ? 'ghost' : 'primary'}
          disabled={gated}
          loading={busy === 'endnight'}
          onPress={() =>
            void act('endnight', () => endNight(roomId), {
              confirm: () =>
                confirmAction(
                  'Geceyi şimdi bitir',
                  view.pending
                    ? `${left} kişi henüz seçim yapmadı. Beklemeden bitirirsen onların seçimi sayılmaz.`
                    : 'Seçim yapmayan olabilir. Beklemeden bitirirsen onların seçimi sayılmaz.',
                  'Geceyi bitir',
                ),
            })
          }
        />
      );
    }
    if (phase === 'dawn') {
      return (
        <GameButton
          label="Oylamayı başlat"
          icon="hand-left"
          loading={busy === 'vote'}
          onPress={() => void act('vote', () => beginVote(roomId))}
        />
      );
    }
    if (phase === 'vote') {
      const left = view.pending ? view.pending.total - view.pending.done : 0;
      const gated = waitLeft > 0;
      return (
        <GameButton
          label={gated ? `Oylamayı bitir · ${clock(waitLeft)}` : 'Oylamayı bitir'}
          variant={left > 0 ? 'ghost' : 'primary'}
          disabled={gated}
          loading={busy === 'endvote'}
          onPress={() =>
            void act('endvote', () => endVote(roomId), {
              confirm:
                left > 0
                  ? () =>
                      confirmAction(
                        'Oylamayı şimdi bitir',
                        `${left} kişi henüz oy vermedi. Oy vermeyenler oy kullanmamış sayılır.`,
                        'Oylamayı bitir',
                      )
                  : undefined,
            })
          }
        />
      );
    }
    if (phase === 'vote_result') {
      return (
        <GameButton
          label="Geceyi başlat"
          icon="moon"
          loading={busy === 'night'}
          onPress={() => void act('night', () => beginNight(roomId))}
        />
      );
    }
    return null;
  })();

  // ---- Gece: rolü olanın seçebileceği kişiler --------------------------------------------------
  const role = me.role;
  const nightActor =
    phase === 'night' &&
    !me.is_omniscient &&
    me.is_player &&
    me.is_alive &&
    !me.left &&
    (role === 'vampire' || role === 'doctor' || role === 'detective');
  const todayResult = role === 'detective' ? me.investigations.find((i) => i.round === view.round) : undefined;
  const nightPicking = nightActor && !todayResult;
  const allyIds = new Set((me.allies ?? []).map((a) => a.id));
  const nightTargets = new Set(
    alive
      .filter((p) =>
        role === 'vampire'
          ? !p.is_me && !allyIds.has(p.id)
          : role === 'doctor'
            ? p.id !== me.last_protect
            : !p.is_me,
      )
      .map((p) => p.id),
  );
  const savedNight = me.night_target;
  const nightSel = pickedId ?? savedNight ?? undefined;

  // ---- Oylama ---------------------------------------------------------------------------------
  const canVote = phase === 'vote' && me.is_player && me.is_alive && !me.left;
  const savedVote = me.voted ? (me.vote_target ?? SKIP) : undefined;
  const voteSel = pickedId ?? savedVote;
  const showVotes = phase === 'vote' || phase === 'vote_result';
  /** Asılma oyları herkese açık: kim kime oy verdi (null = pas) */
  const voteOf = new Map<string, string | null>((view.votes ?? []).map((v) => [v.from, v.to]));
  const hasOpenVotes = Boolean(view.votes);
  const votesIn = new Map<string, number>();
  if (showVotes) {
    if (view.votes) {
      for (const v of view.votes) if (v.to) votesIn.set(v.to, (votesIn.get(v.to) ?? 0) + 1);
    } else if (phase === 'vote_result') {
      for (const t of view.last_vote?.tally ?? []) votesIn.set(t.id, t.votes);
    }
  }
  const investigated = new Map<string, boolean>();
  if (role === 'detective') for (const i of me.investigations) investigated.set(i.id, i.is_vampire);

  // ---- Fısıltı ve sesli sohbet ------------------------------------------------------------------
  const showWhispers = (playing || phase === 'ended') && !me.left && (me.is_player || me.is_omniscient);
  const canWhisper =
    view.status === 'playing' &&
    phase !== 'night' &&
    me.is_player &&
    me.is_alive &&
    !me.left &&
    view.whispers_left > 0 &&
    view.whisper_limit > 0;
  const incoming = view.whispers.filter((w) => w.to === myPid).length;
  const vs = voice.state;
  const kickOpen = Boolean(vs?.allowed && vs.kick_open && vs.kick_enabled);

  /** Adın altındaki satır: ölü mü, kime oy verdi, rolü (görmeye hakkın varsa), dedektif notu */
  function subFor(p: VvPlayer): Tile['sub'] {
    // Kendi rolüm ekranda yazmaz (yan yana oynarken başkası görmesin); oyun bitince herkesinki açılır
    const known = p.role && (!p.is_me || phase === 'ended') ? ROLES[p.role] : null;
    if (phase !== 'lobby' && !p.is_alive) {
      if (p.left) return { icon: 'exit-outline', text: known ? `Ayrıldı · ${known.name}` : 'Ayrıldı', color: G.faint };
      return { icon: 'skull', text: known ? known.name : 'Elendi', color: known ? known.color : G.redSoft };
    }
    if (showVotes && voteOf.has(p.id)) {
      const to = voteOf.get(p.id);
      return to
        ? { icon: 'arrow-forward', text: nameOf(to), color: G.gold }
        : { icon: 'remove-circle-outline', text: 'Pas', color: G.muted };
    }
    if (phase === 'vote' && hasOpenVotes) return { icon: 'time-outline', text: 'Düşünüyor', color: G.faint };
    if (investigated.has(p.id)) {
      const vamp = investigated.get(p.id);
      return { icon: 'search', text: vamp ? 'Vampir' : 'Temiz', color: vamp ? G.redSoft : G.green };
    }
    if (known) return { text: known.name, color: known.color };
    if (readyMode) {
      return readyIds.has(p.id)
        ? { icon: 'checkmark-circle', text: 'Hazır', color: G.green }
        : { icon: 'time-outline', text: 'Bekliyor', color: G.faint };
    }
    if (phase === 'lobby' && p.is_host) return { icon: 'star', text: 'Oda sahibi', color: G.gold };
    return null;
  }

  /** Anlatıcı için: hazır / gece seçimini yaptı / oy verdi */
  function checkFor(p: VvPlayer): boolean | null {
    if (!me.is_omniscient) return null;
    if (phase === 'reveal') return p.ready;
    if (phase === 'night') return p.is_alive && p.role && p.role !== 'villager' ? p.night_done : null;
    if (phase === 'vote') return p.is_alive ? p.voted : null;
    return null;
  }

  function voiceFor(p: VvPlayer): Tile['voice'] {
    // Bas-konuş: sesi çalınan kişinin avatarında konuşuyor işareti
    if (clipQueue.speaking?.from === p.id) {
      return { speaking: true, micOff: false, filter: false, away: false, offline: false };
    }
    if (!vs?.allowed) return null;
    const m = voice.member(p.id);
    if (!m) return null;
    return {
      speaking: vs.speaker === p.id,
      micOff: m.connected && !m.mic_on,
      filter: m.filter_on,
      away: m.away,
      offline: !m.connected,
    };
  }

  function kickFor(p: VvPlayer): Tile['kick'] {
    if (!kickOpen) return null;
    const m = voice.member(p.id);
    if (!m || m.kick_votes <= 0) return null;
    const secs = m.kick_decide_at
      ? Math.max(0, Math.ceil((Date.parse(m.kick_decide_at) - voice.now) / 1000))
      : null;
    return { votes: m.kick_votes, need: vs?.kick_needed ?? null, mine: m.my_kick_vote, secsLeft: secs };
  }

  const tiles: Tile[] = view.players.map((p) => {
    let selectable = false;
    let dim = false;
    if (nightPicking) {
      selectable = nightTargets.has(p.id);
      dim = !selectable && p.is_alive;
    } else if (canVote) {
      selectable = p.is_alive && !p.is_me;
    }
    return {
      p,
      selectable,
      dim,
      votesIn: votesIn.get(p.id),
      sub: subFor(p),
      check: checkFor(p),
      voice: voiceFor(p),
      kick: kickFor(p),
      alert: view.remote === true && !p.is_me && clipQueue.speaking?.from === p.id,
    };
  });

  /** Avatar menüsü: fısılda, odadan atma oyu */
  function menuOptions(p: VvPlayer): ActionOption[] {
    const opts: ActionOption[] = [];
    if (canWhisper && p.is_alive && !p.left && !p.is_me) {
      opts.push({
        label: `${p.name} kişisine fısılda`,
        icon: 'ear',
        onPress: () => {
          setMenuFor(null);
          setCompose({ replyTo: null, to: p.id });
        },
      });
    }
    // Atma oylaması (bekleme odasında ve sabah tartışmasında; aynı anda tek oylama, kişi başı 2 hak)
    const kk = view?.kick;
    if (
      kk && kk.open && !kk.poll && kk.starts_left > 0 && !p.is_me && !p.left &&
      me.is_player && !me.left && (phase === 'lobby' || me.is_alive)
    ) {
      opts.push({
        label: `Atma oylaması başlat (${kk.starts_left} hak)`,
        icon: 'exit-outline',
        destructive: true,
        onPress: () => {
          setMenuFor(null);
          void act('kick', () => kickStart(roomId, p.id));
        },
      });
    }
    // Uzaktan oda: bu oyuncunun son ses mesajını şikâyet et
    const clip = view?.remote ? [...(view.voice ?? [])].reverse().find((c) => c.from === p.id) : undefined;
    if (clip && !p.is_me) {
      opts.push({
        label: 'Ses mesajını şikâyet et',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => {
          setMenuFor(null);
          void reportClip(clip.id, p.name);
        },
      });
    }
    const m = kickOpen ? voice.member(p.id) : undefined;
    if (m && m.kickable) {
      opts.push({
        label: m.my_kick_vote
          ? 'Odadan atma oyumu geri al'
          : `Odadan atma oyu ver (${m.kick_votes}/${vs?.kick_needed ?? '–'})`,
        icon: 'exit-outline',
        destructive: !m.my_kick_vote,
        onPress: () => {
          setMenuFor(null);
          void voice.kick(m);
        },
      });
    }
    return opts;
  }

  function pressTile(t: Tile) {
    if (t.selectable) {
      setPick({ key: phaseKey, id: t.p.id });
      return;
    }
    if (menuOptions(t.p).length > 0) setMenuFor(t.p);
  }

  function longPressTile(t: Tile) {
    if (menuOptions(t.p).length > 0) setMenuFor(t.p);
  }

  async function whisper(to: string, text: string, replyTo: string | null): Promise<string | null> {
    const res = await sendWhisper(roomId, to, text, replyTo);
    if (res.error) return res.error;
    playSound('vv_whisper', 0.6);
    setCompose(null);
    await load();
    return null;
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

  async function report(w: VvWhisper) {
    const reason = await showDialog<string | null>({
      title: 'Fısıltıyı bildir',
      message: `“${w.body ?? ''}”\n\nBu fısıltı moderatörlere iletilir. ${w.from_name}, kimin bildirdiğini bilmez.`,
      icon: 'flag',
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        {
          label: 'Kişisel bilgi / dolandırıcılık',
          value: 'Kişisel bilgi isteme ya da dolandırıcılık',
          style: 'primary',
        },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportWhisper(w.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: 'flag', tone: 'success' });
  }

  async function sayDead(text: string): Promise<string | null> {
    const res = await sayAsDead(roomId, text);
    if (res.error) return res.error;
    await load();
    return null;
  }

  async function reportDead(m: { id: string; body: string; name: string }) {
    const reason = await showDialog<string | null>({
      title: 'Mesajı bildir',
      message: `“${m.body}”\n\nBu mesaj moderatörlere iletilir. ${m.name}, kimin bildirdiğini bilmez.`,
      icon: 'flag',
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        {
          label: 'Kişisel bilgi / dolandırıcılık',
          value: 'Kişisel bilgi isteme ya da dolandırıcılık',
          style: 'primary',
        },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportDeadMessage(m.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notify('Bildirimin alındı', 'Moderatörler inceleyecek.', { icon: 'flag', tone: 'success' });
  }

  // ---- Alttaki bilgi kutusu: aşamaya göre kısa yazı ve düğmeler ------------------------------------
  let panel: ReactNode = null;
  /** Ortada avatarlar yerine rol kartı (rolünü görme aşaması) */
  let stage: ReactNode = null;

  if (me.left && phase !== 'ended') {
    panel = (
      <>
        <Text style={[styles.pTitle, { color: G.redSoft }]}>Oyundan çıkarıldın</Text>
        <Text style={styles.pText}>
          Oyun ekranından ayrıldığın ya da bağlantın uzun süre koptuğu için oyundan çıkarıldın. Oyundan ayrılan kişi
          elenmiş sayılır ve geri dönemez.
        </Text>
        <GameButton label="Oyunlara dön" onPress={goToGames} />
      </>
    );
  } else if (phase === 'cancelled') {
    panel = (
      <>
        <Text style={styles.pTitle}>Oda kapandı</Text>
        <Text style={styles.pText}>{closedText(view.close_reason, me.is_host)}</Text>
        <GameButton label="Oyunlara dön" onPress={goToGames} />
      </>
    );
  } else if (phase === 'lobby') {
    const count = view.players.length;
    const enough = count >= view.min_players;
    const modeCard =
      mode === 'auto'
        ? { title: 'Otomatik Oyun', text: 'Yönetici yok; süreler dolunca oyun kendiliğinden ilerler. Herkes oyuncudur.' }
        : mode === 'host'
          ? {
              title: me.is_host ? 'Ben Yöneticiyim' : `Yönetici: ${view.host.name}`,
              text: me.is_host
                ? 'Geceyi ve oylamayı sen başlatıp bitirirsin; sen de oynarsın.'
                : `${view.host.name} oyunu ilerletir ve o da oynar.`,
            }
          : {
              title: me.is_omniscient ? 'Sen anlatıcısın' : 'Anlatıcı: 41. Kat Sosyal',
              text: me.is_omniscient
                ? 'Oyuncu sayılmazsın; herkesin rolünü görür, oyunu sen ilerletirsin.'
                : 'Moderatör anlatıcıdır, oyuncu değildir. Oyunu o ilerletir.',
            };
    const countdown = view.rematch_left != null ? Math.max(0, Math.ceil(view.rematch_left - elapsed)) : null;
    const readyCount = view.players.filter((p) => readyIds.has(p.id)).length;
    panel = (
      <>
        {readyMode ? (
          <>
            <Text style={[styles.pTitle, { color: G.green }]}>
              {countdown !== null ? `🔁 Yeni el · ${countdown} sn` : `Hazır ${readyCount} / ${count}`}
            </Text>
            <Text style={styles.pText}>
              {countdown !== null
                ? `Süre dolunca “Hazırım” diyenlerle yeni el başlar. En az ${view.min_players} hazır gerekir, az olursa oda bekleme odası olarak kalır.`
                : `Hazır diyenler demeyenlerden fazla olunca oyun başlar (en az ${view.min_players} kişi).`}
            </Text>
            <GameButton
              label={myReady ? '✓ Hazırım · vazgeç' : 'HAZIRIM'}
              variant={myReady ? 'ghost' : 'primary'}
              disabled={!myReady && countdown === null && count < view.min_players}
              loading={busy === 'lready'}
              onPress={() => void act('lready', () => vvLobbyReady(roomId, !myReady))}
              testID="vv-lobby-ready"
            />
            {!view.match ? (
              <Text style={styles.pText}>Her yeni el oda sahibinin aylık oyun hakkından 1 düşer.</Text>
            ) : null}
          </>
        ) : null}
        {view.code ? (
          <View style={styles.codeRow}>
            <View style={styles.flex}>
              <Text style={styles.codeLabel}>{view.match || view.rematch ? 'Oda ID · arkadaşına ver, “Kodla katıl” ile girsin' : 'Oda ID · yalnızca sende görünür'}</Text>
              <Text style={styles.pText}>Yanındakilere söyle; Oyunlar sekmesinden girerler.</Text>
            </View>
            <Text style={styles.code} selectable accessibilityLabel={`Oda kodu ${view.code.split('').join(' ')}`}>
              {view.code}
            </Text>
          </View>
        ) : null}
        <Text style={styles.pText}>
          <Text style={styles.strong}>{`${modeCard.title}. `}</Text>
          {modeCard.text}
        </Text>
        <Text style={enough ? styles.pText : styles.pWarn}>
          {enough
            ? `${count} oyuncu · roller: ${compositionText(view.composition)}.`
            : `Başlamak için en az ${view.min_players} oyuncu gerekir (şu an ${count}, en fazla ${view.max_players}).`}
        </Text>
        {me.is_host || me.is_admin ? (
          <View style={styles.btnRow}>
            {me.is_host ? (
              <GameButton
                label="Davet et"
                icon="person-add"
                variant="ghost"
                flex
                onPress={() => setInviteOpen(true)}
              />
            ) : null}
            {/* GEÇİCİ: moderatör tek telefonla test edebilsin diye deneme oyuncuları (botlar) */}
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
                        'Kendi kendine oynayan 3 deneme oyuncusu eklenir. Bu oda deneme odası olur: oyun bitince KİMSEYE puan, başarım ya da istatistik yazılmaz.',
                        'Ekle',
                      ),
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
        {me.is_host && !me.is_player && mode !== 'narrator' && view.code ? (
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
            label="Oyunu başlat"
            icon="moon"
            disabled={!enough}
            loading={busy === 'start'}
            onPress={() =>
              void act('start', () => startVampireGame(roomId), {
                confirm: () =>
                  confirmAction(
                    'Oyunu başlat',
                    `${count} oyuncuya roller dağıtılacak: ${compositionText(view.composition)}. ${
                      mode === 'auto' ? 'Oyun kendi kendine akacak; süreler dolunca aşamalar otomatik geçer. ' : ''
                    }Başladıktan sonra yeni oyuncu giremez.`,
                    'Oyunu başlat',
                    false,
                    { icon: 'moon' },
                  ),
              })
            }
          />
        ) : (
          <Text style={styles.pText}>{`${view.host.name} oyunu başlatınca ekran kendiliğinden değişir.`}</Text>
        )}
      </>
    );
  } else if (phase === 'reveal') {
    if (me.is_player && me.role) {
      const cardW = Math.round(Math.min(width * 0.46, height * 0.3 * VAMPIRE_CARD_ASPECT, 200));
      stage = (
        <View style={styles.stage}>
          <RoleCard role={me.role} faceUp={faceUp} width={cardW} onPress={() => setFaceUp((f) => !f)} />
          {faceUp ? (
            <>
              <Text style={[styles.stageRole, { color: ROLES[me.role].color }]}>{ROLES[me.role].name}</Text>
              <Text style={styles.stageText} numberOfLines={3}>
                {ROLES[me.role].goal}
              </Text>
              {me.role === 'vampire' && me.allies && me.allies.length > 0 ? (
                <Text style={styles.allies}>Dostların: {me.allies.map((a) => a.name).join(', ')}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.stageText}>Rolünü görmek için karta dokun. Ekranı kimseye gösterme.</Text>
          )}
        </View>
      );
    }
    panel = (
      <>
        <Text style={styles.pText}>{`Bu oyunda: ${compositionText(view.composition)}.`}</Text>
        {me.is_player && me.role ? (
          me.ready ? (
            <Text style={styles.pOk}>
              {mode === 'auto'
                ? 'Hazırsın. Herkes hazır olunca ya da süre dolunca gece kendiliğinden başlar.'
                : `Hazırsın. ${me.is_host ? 'Geceyi sen başlatınca' : `${view.host.name} geceyi başlatınca`} oyun devam eder.`}
            </Text>
          ) : (
            <GameButton
              label={faceUp ? 'Rolümü gördüm, hazırım' : 'Önce kartına dokun'}
              disabled={!faceUp}
              loading={busy === 'ready'}
              onPress={() => {
                setFaceUp(false);
                void act('ready', () => markRoleSeen(roomId));
              }}
            />
          )
        ) : null}
        <Text style={styles.pText}>{`Rolünü gören: ${view.ready_count} / ${present.length}`}</Text>
        {hostButton}
      </>
    );
  } else if (phase === 'night') {
    const pend = view.pending ? `Seçimini yapanlar: ${view.pending.done} / ${view.pending.total}` : null;
    if (me.is_omniscient) {
      panel = (
        <>
          <Text style={styles.pTitle}>Gece sürüyor</Text>
          <Text style={styles.pText}>
            Vampirler, doktor ve dedektif seçimini yapıyor. Avatarların köşesindeki işaret seçim yapanı gösterir.
          </Text>
          {pend ? <Text style={styles.pText}>{pend}</Text> : null}
          {hostButton}
        </>
      );
    } else if (!nightActor || !role) {
      panel = (
        <>
          <Text style={styles.pTitle}>{me.is_alive ? 'Köy uyuyor' : 'Köyü izliyorsun'}</Text>
          <Text style={styles.pText}>
            {!me.is_player
              ? 'Bu oyunda oyuncu değilsin; geceyi izliyorsun.'
              : me.is_alive
                ? 'Bu gece yapacağın bir şey yok. Ekran açık kalsın; sabah olunca kendiliğinden değişir.'
                : 'Elendin. Gece seçim yapamazsın; sabahı bekle.'}
          </Text>
          {hostButton}
        </>
      );
    } else {
      const info = ROLES[role];
      const verb = role === 'vampire' ? 'Isır' : role === 'doctor' ? 'Koru' : 'Bak';
      const ask =
        role === 'vampire' ? 'Kimi ısıracaksın?' : role === 'doctor' ? 'Kimi koruyacaksın?' : 'Kime bakacaksın?';
      const intro =
        role === 'vampire'
          ? 'Dostlarınla aynı kişiyi seçerseniz kesin ısırılır; farklıysa çoğunluk, eşitse rastgele.'
          : role === 'doctor'
            ? 'Seçtiğin kişi ısırılsa da ölmez. Kendini de seçebilirsin; art arda aynı kişiyi koruyamazsın.'
            : 'Seçtiğin kişinin vampir olup olmadığını hemen öğrenirsin.';
      const roleHead = (
        <View style={styles.roleHead}>
          <Ionicons
            name={role === 'vampire' ? 'moon' : role === 'doctor' ? 'medkit' : 'search'}
            size={18}
            color={info.color}
          />
          <Text style={[styles.pTitle, { color: info.color }]}>{info.name}</Text>
          {!todayResult ? <Text style={styles.pTitle}>· {ask}</Text> : null}
        </View>
      );
      panel = todayResult ? (
        <>
          {roleHead}
          <Text style={[styles.pTitle, { color: todayResult.is_vampire ? G.redSoft : G.green }]}>
            {todayResult.is_vampire ? `${todayResult.name} bir vampir!` : `${todayResult.name} vampir değil`}
          </Text>
          <Text style={styles.pText}>
            Bu bilgiyi yalnızca sen biliyorsun. Notların avatarların altında görünür.
          </Text>
          {hostButton}
        </>
      ) : (
        <>
          {roleHead}
          <Text style={styles.pText}>{intro}</Text>
          {role === 'vampire' && me.allies && me.allies.length > 0 ? (
            <Text style={styles.allies} numberOfLines={2}>
              {'Dostların: ' +
                me.allies
                  .map((a) => `${a.name}${a.is_alive ? '' : ' (elendi)'}${a.pick ? ` → ${a.pick}` : ''}`)
                  .join(', ')}
            </Text>
          ) : null}
          <GameButton
            label={
              nightSel
                ? nightSel === savedNight
                  ? `${verb}: ${nameOf(nightSel)} ✓`
                  : `${verb}: ${nameOf(nightSel)}`
                : 'Avatara dokunarak seç'
            }
            disabled={!nightSel || nightSel === savedNight}
            loading={busy === 'night-action'}
            onPress={() => nightSel && void act('night-action', () => nightAction(roomId, nightSel))}
          />
          {savedNight ? <Text style={styles.pText}>Seçimin kaydedildi. Herkes seçince sabah olur.</Text> : null}
          {hostButton}
        </>
      );
    }
  } else if (phase === 'dawn') {
    const killed = view.last_night?.killed ?? [];
    panel = (
      <>
        <Text style={[styles.pTitle, { color: killed.length > 0 ? G.redSoft : G.green }]}>
          {killed.length > 0 ? 'Gece biri öldü' : 'Bu gece kimse ölmedi'}
        </Text>
        <Text style={styles.pText}>
          {killed.length > 0
            ? `${killed.map((k) => k.name).join(', ')} sabah ölü bulundu. Rolü açıklanmıyor.`
            : 'Köy sağ salim uyandı. Vampirler ısıramadı ya da doktor yetişti.'}
        </Text>
        <Text style={styles.pText}>
          {view.remote ? 'Bas-konuş ile konuşun, kim şüpheli?' : 'Masada konuşun, kim şüpheli?'}{' '}
          {!canControl
            ? mode === 'auto'
              ? 'Süre dolunca oylama başlar.'
              : `Oylamayı ${managerName} başlatacak.`
            : ''}
        </Text>
        {view.skip && me.is_player && me.is_alive && !me.left ? (
          <SkipToggle
            skip={view.skip}
            busy={busy === 'skipdisc'}
            onToggle={(on) => void act('skipdisc', () => skipDiscussion(roomId, on))}
          />
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'vote') {
    const pend = view.pending ? `Oy verenler: ${view.pending.done} / ${view.pending.total}` : null;
    panel = canVote ? (
      <>
        <Text style={styles.pTitle}>Kimi köyden çıkarıyoruz?</Text>
        <Text style={styles.pText}>
          Avatara dokunarak seç. Oylar herkese açık. En çok oy alan elenir; eşitlikte kimse elenmez.
          {pend ? ` ${pend}` : ''}
        </Text>
        <View style={styles.btnRow}>
          <GameButton
            label={savedVote === SKIP ? 'Pas ✓' : 'Pas'}
            variant="ghost"
            disabled={savedVote === SKIP}
            loading={busy === 'skip'}
            onPress={() => {
              setPick({ key: phaseKey, id: SKIP });
              void act('skip', () => castVote(roomId, null));
            }}
          />
          <GameButton
            flex
            label={
              voteSel && voteSel !== SKIP
                ? voteSel === savedVote
                  ? `Oyun: ${nameOf(voteSel)} ✓`
                  : `Oy ver: ${nameOf(voteSel)}`
                : 'Avatara dokunarak seç'
            }
            disabled={!voteSel || voteSel === SKIP || voteSel === savedVote}
            loading={busy === 'cast'}
            onPress={() => {
              if (voteSel && voteSel !== SKIP) void act('cast', () => castVote(roomId, voteSel));
            }}
          />
        </View>
        {hostButton}
      </>
    ) : (
      <>
        <Text style={styles.pTitle}>Oylama sürüyor</Text>
        <Text style={styles.pText}>
          {me.is_omniscient
            ? 'Anlatıcı olarak oy vermezsin.'
            : me.is_player
              ? 'Elendin, oy veremezsin. Oylamayı izleyebilirsin.'
              : 'Bu oyunda oyuncu değilsin; oylamayı izleyebilirsin.'}
          {pend ? ` ${pend}` : ''}
        </Text>
        {hostButton}
      </>
    );
  } else if (phase === 'vote_result') {
    const lv = view.last_vote;
    panel = (
      <>
        {lv?.executed ? (
          <View style={styles.execRow}>
            <RoleCard role={lv.executed.role} faceUp width={44} />
            <View style={styles.flex}>
              <Text style={styles.pTitle}>{`${lv.executed.name} köyden çıkarıldı`}</Text>
              <Text style={[styles.strong, { color: ROLES[lv.executed.role].color }]}>
                {`Rolü: ${ROLES[lv.executed.role].name}`}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.pTitle}>Kimse elenmedi</Text>
            <Text style={styles.pText}>
              {lv && lv.tie ? 'Oylar eşit çıktı.' : 'Yeterli oy çıkmadı.'} Bu turda kimse köyden çıkarılmadı.
            </Text>
          </>
        )}
        {lv && lv.skips + lv.absent > 0 ? (
          <Text style={styles.pText}>
            {lv.skips > 0 ? `${lv.skips} kişi pas geçti. ` : ''}
            {lv.absent > 0 ? `${lv.absent} kişi oy vermedi.` : ''}
          </Text>
        ) : null}
        {!canControl ? (
          <Text style={styles.pText}>
            {mode === 'auto' ? 'Süre dolunca yeni gece başlar.' : `Sonraki geceyi ${managerName} başlatacak.`}
          </Text>
        ) : null}
        {hostButton}
      </>
    );
  } else if (phase === 'ended') {
    const vampiresWon = view.winner === 'vampire';
    const myTeam = me.role ? ROLES[me.role].team : null;
    const iWon = myTeam ? (myTeam === 'vampire') === vampiresWon : null;
    const res = me.is_player ? resultLine(result, me.is_admin) : null;
    panel = (
      <>
        {iWon !== null && me.role ? (
          <>
            <Text style={[styles.pTitle, { color: iWon ? G.green : G.redSoft }]}>
              {iWon ? 'Kazandın!' : 'Bu sefer kaybettin'}
            </Text>
            <Text style={styles.pText}>
              {`Rolün: ${ROLES[me.role].name}. ${vampiresWon ? 'Vampirler köyü ele geçirdi.' : 'Köylüler bütün vampirleri buldu.'}`}
            </Text>
          </>
        ) : (
          <Text style={styles.pText}>
            {vampiresWon ? 'Vampirler köyü ele geçirdi.' : 'Köylüler bütün vampirleri buldu.'} Herkesin rolü
            avatarların altında.
          </Text>
        )}
        {res ? <Text style={[styles.pText, res.good && styles.pOk]}>{res.text}</Text> : null}
        {/* Oyun bitince bekleme odasına geçilir (aynı oyuncularla yeni el) */}
        {view.next_room && !me.left ? (
          <NextRoomButton
            seconds={10}
            onGo={() => router.replace({ pathname: '/vampir', params: { id: view.next_room as string } })}
          />
        ) : view.next_note === 'no_quota' ? (
          <Text style={styles.pText}>Kimsenin bu ay oyun hakkı kalmadığı için yeni el açılamadı.</Text>
        ) : null}
        <View style={styles.btnRow}>
          <GameButton label="Puanlar" icon="trophy" variant="ghost" onPress={() => setInfo('points')} />
          <GameButton
            label="Oyunlara dön"
            flex
            variant={view.next_room ? 'ghost' : 'primary'}
            onPress={() => {
              if (view.next_room) void leaveRoom(view.next_room);
              goToGames();
            }}
          />
        </View>
      </>
    );
  }

  const modeLabel =
    mode === 'auto' ? 'Otomatik Oyun' : mode === 'host' ? `Yönetici: ${managerName}` : 'Anlatıcılı oyun';
  const subtitle = [
    view.code ? `Oda ${view.code}` : null,
    view.remote ? 'Uzaktan' : null,
    modeLabel,
    view.round > 0 ? `${view.round}. tur` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const blocking = live && mustConfirmLeave;
  const scene = sceneFor(phase, view.winner);
  const title =
    phase === 'ended'
      ? view.winner === 'vampire'
        ? 'Vampirler kazandı'
        : 'Köylüler kazandı'
      : phase === 'night' || phase === 'dawn'
        ? `${view.round}. ${phase === 'night' ? 'gece' : 'sabah'}`
        : HERO_TITLE[phase];
  const lastWhisper = view.whispers.length > 0 ? view.whispers[view.whispers.length - 1] : null;
  const whisperLine = lastWhisper
    ? lastWhisper.to === myPid
      ? `${lastWhisper.from_name} sana ${lastWhisper.reply ? 'cevap verdi' : 'fısıldadı'} · okumak için dokun`
      : lastWhisper.from === myPid
        ? `Sen → ${lastWhisper.to_name} fısıldadın`
        : `${lastWhisper.from_name}, ${lastWhisper.to_name} kişisine fısıldadı`
    : null;
  const whisperHot = incoming > seenIncoming;
  const menuOpts = menuFor ? menuOptions(menuFor) : [];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image source={vampireImages[scene]} contentFit="cover" style={styles.fill} transition={500} />
      <LinearGradient
        colors={['rgba(4,5,12,0.7)', 'rgba(4,5,12,0.2)', 'rgba(4,5,12,0.35)', 'rgba(4,5,12,0.92)']}
        locations={[0, 0.22, 0.5, 1]}
        style={[styles.fill, styles.noTouch]}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Oyun ekranında Geri tuşu ve kaydırarak geri dönme çalışmaz: yalnızca kırmızı çıkış düğmesiyle çıkılır */}
        <BackBlocker enabled onBack={() => {}} />

        {/* Üst şerit: çık, aşama başlığı, sesler, güvenlik */}
        <View style={styles.top}>
          <Pressable
            onPress={blocking ? requestLeave : goToGames}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={blocking ? (me.is_host ? 'Oyunu kapat' : 'Oyundan ayrıl') : 'Oyunlara dön'}
            style={({ pressed }) => [styles.topBtn, styles.exitBtn, pressed && styles.pressed]}
            testID="vv-back"
          >
            <Ionicons name="exit-outline" size={21} color="#FFFFFF" />
          </Pressable>
          <View style={styles.flex} accessibilityRole="header">
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {playing || phase === 'lobby' ? (
            <Pressable
              onPress={() => setSoundOn(!sound)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={sound ? 'Sesleri kapat' : 'Sesleri aç'}
              style={({ pressed }) => [styles.topBtn, pressed && styles.pressed]}
              testID="vv-sound"
            >
              <Ionicons name={sound ? 'volume-high' : 'volume-mute'} size={19} color={sound ? G.text : G.faint} />
            </Pressable>
          ) : null}
          {/* Kırmızı düğme: oyuncu listesi (atma oylaması, ses şikâyeti) ve oyunu bildir */}
          {phase === 'lobby' || playing ? (
            <Pressable
              onPress={() => setPlayersOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Oyuncular ve şikâyet"
              style={({ pressed }) => [styles.playersBtn, pressed && styles.pressed]}
              testID="vv-players"
            >
              <Ionicons name="people" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.body}>
          {playing && !me.left && view.phase_limit !== null ? (
            <ClockBar
              label={CLOCK_LABEL[phase] ?? 'Kalan süre'}
              left={Math.max(0, view.phase_limit - view.phase_age - elapsed)}
              limit={view.phase_limit}
            />
          ) : null}
          {view.test || connError || (playing && me.is_player && !me.is_alive && !me.left) ? (
            <View style={styles.pills}>
              {view.test ? <Pill icon="hardware-chip-outline" text="Deneme odası · puan yazılmaz" tone="danger" /> : null}
              {connError ? <Pill icon="cloud-offline" text="Bağlantı koptu, yeniden deniyor…" tone="warn" /> : null}
              {playing && me.is_player && !me.is_alive && !me.left ? (
                <Pill icon="skull" text="Elendin · oyunu izliyorsun" tone="danger" />
              ) : null}
            </View>
          ) : null}

          {/* Ortada: oyuncular (ya da rolünü görme aşamasında rol kartı) */}
          {stage ?? (
            <PlayerGrid
              tiles={tiles}
              selected={phase === 'night' ? nightSel : phase === 'vote' && voteSel !== SKIP ? voteSel : null}
              accent={phase === 'night' && role ? ROLES[role].color : G.red}
              onPress={pressTile}
              onLongPress={longPressTile}
              stickyKey={roomId}
              onAlert={(t) => {
                const c = clipQueue.speaking;
                if (c && c.from === t.p.id) void reportClip(c.id, t.p.name);
              }}
            />
          )}

          {/* Son fısıltı: içeriği burada yazmaz (yanındakiler görmesin); dokununca liste açılır */}
          {showWhispers && whisperLine ? (
            <Pressable
              onPress={() => {
                setSeenIncoming(incoming);
                setSheet('whispers');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.ticker, whisperHot && styles.tickerHot, pressed && styles.pressed]}
              testID="vv-whisper-line"
            >
              <Ionicons name="ear" size={14} color={whisperHot ? G.tealText : G.violet} />
              <Text style={[styles.tickerText, whisperHot && { color: G.tealText }]} numberOfLines={1}>
                {whisperLine}
              </Text>
            </Pressable>
          ) : null}

          {/* Atma oylaması */}
          {view.kick?.poll ? (
            <View>
              <KickBar
                inline
                targetName={nameOf(view.kick.poll.target)}
                yes={view.kick.poll.yes}
                need={view.kick.poll.need}
                left={Math.max(0, Math.ceil(view.kick.poll.left - elapsed))}
                mine={view.kick.poll.mine}
                canVote={me.is_player && !me.left && (phase === 'lobby' || me.is_alive)}
                isTarget={view.kick.poll.target === myPid}
                busy={busy === 'kickvote'}
                onVote={(yes) => void act('kickvote', () => kickVote(roomId, yes))}
              />
            </View>
          ) : null}
          {/* Uzaktan oda: bas-konuş (sabahta ve oylamada herkes, gece yalnızca vampirler kendi aralarında) */}
          {view.remote && playing && me.is_player && !me.left ? (
            <>
              {clipQueue.speaking ? (
                <Pressable
                  onLongPress={() => {
                    const c = clipQueue.speaking;
                    if (c) void reportClip(c.id, nameOf(c.from));
                  }}
                  delayLongPress={450}
                  accessibilityHint="Bildirmek için uzun bas"
                  style={styles.speaking}
                >
                  <Text style={styles.speakingText} numberOfLines={1}>
                    {`🔊 ${nameOf(clipQueue.speaking.from)} konuşuyor${clipQueue.speaking.channel === 'shark' ? ' (vampirler)' : ''}${
                      clipQueue.waiting ? ` · sırada ${clipQueue.waiting}` : ''
                    }`}
                  </Text>
                </Pressable>
              ) : clipQueue.error ? (
                <Text style={styles.voiceError}>{`${clipQueue.error}. Sorun sürerse bana bildir.`}</Text>
              ) : null}
              <PushToTalk
                roomId={roomId}
                canTalk={
                  me.is_alive &&
                  !view.mic_banned &&
                  (view.voice_left_ms ?? 15000) >= 500 &&
                  (phase === 'dawn' || phase === 'vote' || phase === 'vote_result' || (phase === 'night' && me.role === 'vampire'))
                }
                leftMs={view.voice_left_ms ?? 15000}
                closedText={
                  view.mic_banned
                    ? '🔇 Mikrofonun bir süreliğine kapatıldı'
                    : !me.is_alive
                    ? '🔇 Elendin, konuşamazsın'
                    : phase === 'night' && me.role !== 'vampire'
                      ? '🔇 Gece herkes susar'
                      : (view.voice_left_ms ?? 15000) < 500
                        ? '🔇 Bu tartışmadaki 15 sn hakkın bitti'
                        : '🔇 Sabah konuşulur'
                }
                channelText={`${phase === 'night' ? 'Yalnızca vampirler duyar' : 'Herkes duyar'} · bu tartışmada kalan ${Math.round(
                  (view.voice_left_ms ?? 15000) / 1000,
                )} sn`}
                onRecording={setRecording}
                onSent={() => void load()}
              />
            </>
          ) : null}

          <Glass style={[styles.panel, { maxHeight: Math.round(height * 0.42) }]}>
            <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelInner} bounces={false}>
              {panel}
              {actionError ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {actionError}
                </Text>
              ) : null}
            </ScrollView>
          </Glass>

          {/* Alt şerit */}
          <View style={styles.tools}>
            {showWhispers && view.whisper_limit > 0 ? (
              <ToolButton
                icon="ear"
                label="Fısıltı"
                badge={me.is_player && view.status === 'playing' ? view.whispers_left : null}
                hot={whisperHot}
                onPress={() => {
                  setSeenIncoming(incoming);
                  setSheet('whispers');
                }}
                testID="vv-whispers"
              />
            ) : null}
            {me.is_player && me.role && phase !== 'lobby' && !me.left ? (
              <ToolButton icon="eye-outline" label="Rolüm" onPress={() => setSheet('role')} testID="vv-role" />
            ) : null}
            {view.dead_chat ? (
              <ToolButton
                icon="skull"
                label="Elenenler"
                badge={view.dead_chat.length > 0 ? view.dead_chat.length : null}
                onPress={() => setSheet('dead')}
                testID="vv-dead"
              />
            ) : null}
            {phase !== 'cancelled' ? (
              <ToolButton icon="albums" label="Kartlar" onPress={() => setCardsOpen(true)} testID="vv-cards" />
            ) : null}
            {phase === 'lobby' ? (
              <ToolButton icon="trophy" label="Puanlar" onPress={() => setInfo('points')} testID="vv-points" />
            ) : null}
            <ToolButton icon="help-circle-outline" label="Nasıl?" onPress={() => setInfo('how')} testID="vv-how" />
          </View>
        </View>
      </SafeAreaView>

      {safety.isOpen ? safety.nodes : null}
      {inviteOpen && phase === 'lobby' && me.is_host ? (
        <InviteSheet roomId={roomId} onClose={() => setInviteOpen(false)} />
      ) : null}
      {playersOpen ? (
        <ActionSheet
          title="Oyuncular"
          subtitle="Bir oyuncuya dokun: atma oylaması başlat ya da sesini şikâyet et."
          options={[
            ...view.players
              .filter((p) => !p.is_me)
              .map((p) => ({
                label: `${p.name}${p.left ? ' (ayrıldı)' : !p.is_alive ? ' (elendi)' : ''}`,
                icon: 'person-circle-outline' as const,
                onPress: () => {
                  setPlayersOpen(false);
                  if (menuOptions(p).length > 0) setMenuFor(p);
                  else void notify(p.name, 'Şu an bu oyuncu için yapılabilecek bir şey yok.', { icon: null });
                },
              })),
            {
              label: 'Oyunu bildir',
              icon: 'flag-outline' as const,
              onPress: () => {
                setPlayersOpen(false);
                safety.open();
              },
            },
          ]}
          onClose={() => setPlayersOpen(false)}
        />
      ) : null}
      {menuFor && menuOpts.length > 0 ? (
        <ActionSheet title={menuFor.name} options={menuOpts} onClose={() => setMenuFor(null)} />
      ) : null}
      {sheet === 'whispers' && showWhispers ? (
        <Popup title="Fısıltılar" subtitle="İçeriği yalnızca gönderen ve alan görür." icon="ear" onClose={() => setSheet(null)}>
          <WhisperPanel
            view={view}
            onCompose={() => {
              setSheet(null);
              setCompose({ replyTo: null });
            }}
            onReply={(w) => {
              setSheet(null);
              setCompose({ replyTo: w });
            }}
            onReport={(w) => void report(w)}
          />
        </Popup>
      ) : null}
      {sheet === 'role' && me.role ? (
        <Popup title={`Rolün: ${ROLES[me.role].name}`} icon="eye-outline" onClose={() => setSheet(null)}>
          <View style={styles.roleSheet}>
            <RoleCard role={me.role} faceUp width={130} />
            <Text style={styles.sheetText}>{ROLES[me.role].goal}</Text>
            <Text style={styles.sheetMuted}>{ROLES[me.role].night}</Text>
            {me.role === 'vampire' && me.allies && me.allies.length > 0 ? (
              <Text style={styles.sheetText}>
                {'Dostların: ' + me.allies.map((a) => `${a.name}${a.is_alive ? '' : ' (elendi)'}`).join(', ')}
              </Text>
            ) : null}
            {me.role === 'detective' && me.investigations.length > 0
              ? [...me.investigations].reverse().map((i) => (
                  <Text key={`${i.round}-${i.id}`} style={styles.sheetText}>
                    {`${i.round}. gece · ${i.name}: `}
                    <Text style={{ color: i.is_vampire ? colors.danger : colors.success }}>
                      {i.is_vampire ? 'Vampir' : 'Vampir değil'}
                    </Text>
                  </Text>
                ))
              : null}
          </View>
        </Popup>
      ) : null}
      {sheet === 'dead' && view.dead_chat ? (
        <Popup title="Elenenlerin sohbeti" icon="skull" onClose={() => setSheet(null)}>
          <DeadChat
            messages={view.dead_chat}
            canWrite={playing && me.is_player && !me.is_alive && !me.left}
            onSend={sayDead}
            onReport={(m) => void reportDead(m)}
          />
        </Popup>
      ) : null}
      <InfoModal
        visible={info === 'how'}
        onClose={() => setInfo(null)}
        title="Nasıl oynanır?"
        icon="moon"
        items={HOW_TO_PLAY}
      />
      {cardsOpen ? <RoleGallery onClose={() => setCardsOpen(false)} /> : null}
      {compose && showWhispers ? (
        <WhisperCompose
          view={view}
          replyTo={compose.replyTo}
          initialTo={compose.to ?? null}
          onClose={() => setCompose(null)}
          onSend={whisper}
        />
      ) : null}
      <GamePointsModal
        visible={info === 'points'}
        onClose={() => setInfo(null)}
        players={present.length}
        extra={[VAMPIRE_RANK_ITEM]}
      />
    </View>
  );
}

const HOW_TO_PLAY: InfoItem[] = [
  {
    icon: 'people',
    lead: 'Roller.',
    text: 'Herkes gizli bir rol alır: vampir, doktor, dedektif ya da köylü. Rolünü yalnızca sen görürsün.',
  },
  {
    icon: 'moon',
    lead: 'Gece.',
    text: 'Vampirler birini ısırır, doktor birini korur, dedektif birine bakıp vampir olup olmadığını öğrenir. Seçimi avatara dokunarak yaparsın.',
  },
  {
    icon: 'sunny',
    lead: 'Gündüz.',
    text: 'Sabah kimin öldüğü açıklanır. Konuşursunuz, sonra herkes açık oyla bir kişiyi köyden çıkarır: kaç oy aldığı avatarın üstünde, kime oy verdiği adının altında görünür.',
  },
  {
    icon: 'skull',
    lead: 'Ölü / sağ.',
    text: 'Elenen oyuncunun avatarı kararır, üstünde kurukafa ve adının üstü çizili görünür.',
  },
  {
    icon: 'ear',
    lead: 'Fısıltı.',
    text: 'Oyunda yaşayan herkes 3 kez birine gizli mesaj fısıldayabilir (avatara dokun ya da alttaki Fısıltı düğmesi). Herkes kimin kime fısıldadığını görür, ne yazdığını yalnızca alan kişi görür. Cevap vermek de bir hak yer.',
  },
  {
    icon: 'exit-outline',
    lead: 'Uzaktan odada atma.',
    text: 'Sesli odada kötü davranan biri, sabah konuşmalarından hemen sonra (oylama sırasında) odadan atılabilir: avatarına uzun bas. 4 kişi atmak isterse (odada daha az kişi varsa diğer herkes) 10 saniye içinde atılır ve geri giremez.',
  },
  {
    icon: 'trophy',
    lead: 'Kazanmak.',
    text: 'Bütün vampirler elenirse köylüler, vampirler köylülere eşit olursa vampirler kazanır.',
  },
];

/** Oyun bitince: kaçıncı sırada bitirdin, kaç puan yazıldı (tek satır). */
function resultLine(
  result: { data: MyGameResult | null; rules: PointRules } | null,
  isModerator: boolean,
): { text: string; good: boolean } | null {
  if (result === null) return { text: 'Sonucun hesaplanıyor…', good: false };
  const r = result.data;
  if (!r) return null;
  if (r.note === 'none' || r.best_rank === null || r.players === null) {
    return {
      text: isModerator ? 'Moderatörler oyundan puan kazanmaz.' : 'Oyundan erken ayrıldığın için puan yazılmadı.',
      good: false,
    };
  }
  const place = `${r.players} oyuncu arasında ${r.best_rank}. sırada bitirdin`;
  if (r.note === 'ok') return { text: `+${fmtPts(r.awarded)} puan · ${place}; puanın hesabına yazıldı.`, good: true };
  if (r.note === 'too_few') {
    return { text: `${place}. Puan için oyunda en az ${result.rules.gameMinPlayers} kişi gerekir.`, good: false };
  }
  return {
    text: `${place} (${fmtPts(r.result_points)} puan değerinde) ama puan sınırın dolduğu için bu oyundan puan yazılmadı.`,
    good: false,
  };
}

const HERO_TITLE: Record<VvView['phase'], string> = {
  lobby: 'Bekleme odası',
  reveal: 'Rolünü gör',
  night: 'Gece',
  dawn: 'Sabah',
  vote: 'Gündüz oylaması',
  vote_result: 'Oylama sonucu',
  ended: 'Oyun bitti',
  cancelled: 'Oda iptal edildi',
};

const styles = StyleSheet.create({
  kickWrap: { height: 64 },
  playersBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9304F',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  speaking: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.9)',
  },
  speakingText: { color: '#06201D', fontFamily: fonts.extra, fontSize: 12.5 },
  voiceError: { alignSelf: 'center', color: '#FF8A98', fontFamily: fonts.extra, fontSize: 12.5 },
  root: { flex: 1, backgroundColor: '#05060E' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 6,
  },
  exitBtn: { backgroundColor: '#D9304F', borderWidth: 2, borderColor: '#FFFFFF' },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 10, 20, 0.55)',
  },
  title: {
    color: G.text,
    fontFamily: fonts.black,
    fontSize: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 8,
  },
  subtitle: { color: G.muted, fontFamily: fonts.semi, fontSize: 11.5 },
  body: { flex: 1, gap: 8, paddingHorizontal: spacing.md, paddingBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stageRole: { fontFamily: fonts.black, fontSize: 18, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  stageText: {
    color: G.text,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
  },
  allies: { color: G.violet, fontFamily: fonts.semi, fontSize: 12.5, textAlign: 'center' },
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(8, 10, 20, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(155, 123, 255, 0.45)',
  },
  tickerHot: { backgroundColor: G.teal, borderColor: G.teal },
  tickerText: { flex: 1, color: G.text, fontFamily: fonts.semi, fontSize: 12 },
  panel: { padding: 0 },
  panelScroll: { flexGrow: 0 },
  panelInner: { gap: 8, padding: 12 },
  pTitle: { color: G.text, fontFamily: fonts.extra, fontSize: 15 },
  pText: { color: G.muted, fontSize: 12.5, lineHeight: 17 },
  pWarn: { color: G.gold, fontSize: 12.5, lineHeight: 17 },
  pOk: { color: G.green, fontSize: 12.5, lineHeight: 17 },
  strong: { color: G.text, fontFamily: fonts.extra, fontSize: 12.5 },
  btnRow: { flexDirection: 'row', gap: 8 },
  roleHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  execRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeLabel: { color: G.text, fontFamily: fonts.semi, fontSize: 12 },
  code: { color: G.teal, fontFamily: fonts.black, fontSize: 30, letterSpacing: 5 },
  error: { color: G.redSoft, fontSize: 12.5, lineHeight: 17 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', gap: 4, paddingTop: 2 },
  roleSheet: { alignItems: 'center', gap: spacing.sm },
  sheetText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  sheetMuted: { color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
