import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { InviteSheet } from '@/components/InviteSheet';
import { InfoLink, InfoModal } from '@/components/InfoModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoleCard } from '@/components/RoleCard';
import { useSafetyMenu } from '@/components/SafetyMenu';
import { VoicePanel } from '@/components/VoicePanel';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { DeadChat, RoleGallery } from '@/components/VampireExtras';
import { WhisperCompose, WhisperPanel } from '@/components/VampireWhispers';
import {
  CheckMark,
  clock,
  InfoCard,
  PhaseClock,
  PlayerList,
  ProgressLine,
  RoleChip,
  TargetPicker,
  useElapsedSeconds,
  type PickOption,
} from '@/components/VampireParts';
import { useAuth } from '@/lib/auth';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { fmtPts } from '@/lib/labels';
import { VAMPIRE_RANK_ITEM, type InfoItem } from '@/lib/gameInfo';
import { VAMPIRE_SCENE_ASPECT, vampireImages } from '@/lib/images';
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
  sceneFor,
  sendWhisper,
  startVampireGame,
  VV_NOT_IN_ROOM,
  VV_ROOM_GONE,
  type VvPhase,
  type VvView,
  type VvWhisper,
} from '@/lib/vampire';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

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
  const { width } = useWindowDimensions();
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
  const safety = useSafetyMenu({ type: 'room', id: roomId });
  /** Oyun bitince: bu oyundaki sıram ve yazılan puan */
  const [result, setResult] = useState<{ data: MyGameResult | null; rules: PointRules } | null>(null);
  const lock = useRef(false);
  const loadSeq = useRef(0);
  const lastKey = useRef<string | null>(null);
  const hasView = useRef(false);
  /** Kendi isteğimle ayrıldım: ekran kapanırken "çıkarıldın" ekranı yanıp sönmesin */
  const leaving = useRef(false);
  /** Fısıltı yazma penceresi (cevapsa hangi fısıltıya) */
  const [compose, setCompose] = useState<{ replyTo: VvWhisper | null } | null>(null);
  /** "Oyun kartlarını gör" penceresi */
  const [cardsOpen, setCardsOpen] = useState(false);
  const [sound, setSound] = useState(soundOn);

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
  const elapsed = useElapsedSeconds(viewAt, live && view !== null && view.status === 'playing');

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
          Bekleme odasından ayrıldığında ya da bağlantın uzun süre koptuğunda listeden çıkarılırsın. İstersen oda kodunu
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
  const canStart = me.is_host || me.is_admin;
  const phaseKey = `${phase}:${view.round}`;
  const alive = view.players.filter((p) => p.is_alive);
  const present = view.players.filter((p) => !p.left);
  const playing = phase !== 'lobby' && phase !== 'ended' && phase !== 'cancelled';
  const pickedId = pick && pick.key === phaseKey ? pick.id : undefined;
  const cardWidth = Math.min(width - spacing.lg * 2, 280);
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? '—';
  /** Oyunu ilerleten kişi, cümle içinde: "sen" ya da kişinin adı */
  const managerName = me.is_host ? 'sen' : view.host.name;
  /** Bu kişi oyundan ayrılırken uyarı alır (izleyen moderatör sorgusuz çıkar) */
  const mustConfirmLeave = !me.left && (me.is_player || me.is_host) && phase !== 'ended' && phase !== 'cancelled';
  /** Oda sahibi olmayan üyeler geceyi/oylamayı ancak bu süre geçince elle bitirebilir */
  const waitLeft = me.is_omniscient ? 0 : Math.max(0, view.force_after - view.phase_age - elapsed);

  function requestLeave() {
    if (!mustConfirmLeave) {
      goToGames();
      return;
    }
    const lobby = phase === 'lobby';
    const quota = me.is_admin ? '' : ' Oyun başlamadığı için aylık hakkın geri verilir.';
    const copy = me.is_host
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
        <PrimaryButton
          label="Geceyi başlat"
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
        <>
          <PrimaryButton
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
          {gated ? (
            <Text style={styles.muted}>
              Herkes seçim yapınca gece kendiliğinden biter. Beklemek istemezsen düğme {clock(waitLeft)} sonra açılır.
            </Text>
          ) : null}
        </>
      );
    }
    if (phase === 'dawn') {
      return (
        <PrimaryButton
          label="Oylamayı başlat"
          loading={busy === 'vote'}
          onPress={() => void act('vote', () => beginVote(roomId))}
        />
      );
    }
    if (phase === 'vote') {
      const left = view.pending ? view.pending.total - view.pending.done : 0;
      const gated = waitLeft > 0;
      return (
        <>
          <PrimaryButton
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
          {gated ? (
            <Text style={styles.muted}>
              Herkes oy verince oylama kendiliğinden biter. Beklemek istemezsen düğme {clock(waitLeft)} sonra açılır.
            </Text>
          ) : null}
        </>
      );
    }
    if (phase === 'vote_result') {
      return (
        <PrimaryButton
          label="Geceyi başlat"
          loading={busy === 'night'}
          onPress={() => void act('night', () => beginNight(roomId))}
        />
      );
    }
    return null;
  })();

  // ---- Aşamaya göre içerik ---------------------------------------------------------------
  let body: ReactNode = null;

  if (me.left && phase !== 'ended') {
    body = (
      <>
        <InfoCard title="Oyundan çıkarıldın" tone="danger">
          Oyun ekranından ayrıldığın ya da bağlantın uzun süre koptuğu için oyundan çıkarıldın. Oyundan ayrılan kişi
          elenmiş sayılır ve geri dönemez.
        </InfoCard>
        <PrimaryButton label="Oyunlara dön" onPress={goToGames} />
      </>
    );
  } else if (phase === 'cancelled') {
    body = (
      <>
        <InfoCard title="Oda kapandı">{closedText(view.close_reason, me.is_host)}</InfoCard>
        <PrimaryButton label="Oyunlara dön" onPress={goToGames} />
      </>
    );
  } else if (phase === 'lobby') {
    const count = view.players.length;
    const enough = count >= view.min_players;
    const modeCard =
      mode === 'auto'
        ? {
            title: 'Otomatik Oyun',
            text: 'Yönetici yok. Oyun başlayınca roller dağıtılır; gece, tartışma ve oylama süreleri dolunca oyun kendiliğinden ilerler. Herkes oyuncudur.',
          }
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
                ? 'Moderatör olarak oyuncu sayılmazsın. Herkesin rolünü görür, oyunu sen ilerletirsin.'
                : 'Moderatör anlatıcıdır, oyuncu değildir. Oyunu o ilerletir.',
            };
    body = (
      <>
        {view.code ? (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Oda kodu · yalnızca sende görünür</Text>
            <Text style={styles.code} selectable accessibilityLabel={`Oda kodu ${view.code.split('').join(' ')}`}>
              {view.code}
            </Text>
            <Text style={styles.codeHint}>
              Yanındakilere söyle; Oyunlar sekmesinden girerler. Oyun başlayınca yeni oyuncu giremez.
            </Text>
          </View>
        ) : null}

        <InfoCard title={modeCard.title}>{modeCard.text}</InfoCard>

        <SectionHeader title="Oyuncular" count={view.players.length} />
        <PlayerList players={view.players} showAlive={false} host={view.host} />
        <Text style={enough ? styles.muted : styles.warn}>
          {enough
            ? `Bu oyuncu sayısıyla roller: ${compositionText(view.composition)}.`
            : `Başlamak için en az ${view.min_players} oyuncu gerekir (şu an ${count}). En fazla ${view.max_players} kişi oynayabilir.`}
        </Text>

        {me.is_host ? (
          <PrimaryButton label="Oyuncu davet et" variant="ghost" onPress={() => setInviteOpen(true)} />
        ) : null}

        <View style={styles.infoLinks}>
          <InfoLink label="Nasıl oynanır?" onPress={() => setInfo('how')} testID="vv-how" />
          <InfoLink label="Puan kazanç tablosu" onPress={() => setInfo('points')} testID="vv-points" />
        </View>

        {me.is_host && !me.is_player && mode !== 'narrator' && view.code ? (
          <PrimaryButton
            label="Oyuna katıl"
            loading={busy === 'join'}
            onPress={() => {
              const code = view.code;
              if (code) void act('join', async () => ({ error: (await joinRoomWithLocation(code)).error }));
            }}
          />
        ) : null}
        {canStart ? (
          <PrimaryButton
            label="Oyunu başlat"
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
          <InfoCard>
            {`${view.host.name} oyunu başlatınca bu ekran kendiliğinden değişir. Bekleme odasından ayrılırsan listeden çıkarsın.`}
          </InfoCard>
        )}
        {mustConfirmLeave ? (
          <PrimaryButton
            label={me.is_host ? 'Odayı kapat' : 'Odadan ayrıl'}
            variant={me.is_host ? 'danger' : 'ghost'}
            loading={busy === 'leave'}
            onPress={requestLeave}
          />
        ) : null}
      </>
    );
  } else if (phase === 'reveal') {
    body = (
      <>
        <InfoCard>{`Bu oyunda: ${compositionText(view.composition)}.`}</InfoCard>
        {me.is_player && me.role ? (
          <View style={styles.cardStage}>
            <RoleCard role={me.role} faceUp={faceUp} width={cardWidth} onPress={() => setFaceUp((f) => !f)} />
            <Text style={styles.stageHint}>
              {faceUp
                ? 'Gizlemek için karta tekrar dokun.'
                : 'Rolünü görmek için karta dokun. Ekranı kimseye gösterme.'}
            </Text>
            {faceUp ? (
              <View style={styles.roleText}>
                <Text style={styles.roleGoal}>{ROLES[me.role].goal}</Text>
                <Text style={styles.roleNight}>{ROLES[me.role].night}</Text>
                {me.role === 'vampire' && me.allies && me.allies.length > 0 ? (
                  <Text style={styles.allies}>Dostların: {me.allies.map((a) => a.name).join(', ')}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {me.is_player && me.role ? (
          me.ready ? (
            <InfoCard tone="success">
              {mode === 'auto'
                ? 'Hazırsın. Herkes hazır olunca ya da süre dolunca gece kendiliğinden başlar. Rolünü unutursan oyun sırasında “Rolümü hatırlat” düğmesine basabilirsin.'
                : `Hazırsın. ${me.is_host ? 'Geceyi sen başlatınca' : `${view.host.name} geceyi başlatınca`} oyun devam eder. Rolünü unutursan oyun sırasında “Rolümü hatırlat” düğmesine basabilirsin.`}
            </InfoCard>
          ) : (
            <PrimaryButton
              label="Rolümü gördüm, hazırım"
              disabled={!faceUp}
              loading={busy === 'ready'}
              onPress={() => {
                setFaceUp(false);
                void act('ready', () => markRoleSeen(roomId));
              }}
            />
          )
        ) : null}
        <ProgressLine label="Rolünü gören" done={view.ready_count} total={present.length} />
        {me.is_omniscient ? (
          <>
            <SectionHeader title="Oyuncular ve roller" count={view.players.length} />
            <PlayerList
              players={view.players}
              showAlive={false}
              host={view.host}
              status={(p) => (p.ready === null ? null : <CheckMark on={p.ready} label="Rolünü gördü" />)}
            />
          </>
        ) : null}
      </>
    );
  } else if (phase === 'night') {
    body = (
      <NightBody
        view={view}
        pickedId={pickedId}
        setPick={(id) => setPick({ key: phaseKey, id })}
        busy={busy}
        onAct={act}
        roomId={roomId}
        nameOf={nameOf}
      />
    );
  } else if (phase === 'dawn') {
    const killed = view.last_night?.killed ?? [];
    body = (
      <>
        <InfoCard
          title={killed.length > 0 ? 'Gece biri öldü' : 'Bu gece kimse ölmedi'}
          tone={killed.length > 0 ? 'danger' : 'success'}
        >
          <Text style={styles.cardText}>
            {killed.length > 0
              ? `${killed.map((k) => k.name).join(', ')} sabah ölü bulundu. Rolü açıklanmıyor.`
              : 'Köy sağ salim uyandı. Vampirler kimseyi ısıramadı ya da doktor yetişti; hangisi olduğu belli değil.'}
          </Text>
        </InfoCard>
        <SectionHeader title="Köy" count={alive.length} />
        <PlayerList players={view.players} host={view.host} />
        <Text style={styles.muted}>Masada konuşun: kim şüpheli? Oylama başlayınca herkes bir kişiye oy verecek.</Text>
        {!canControl ? (
          <InfoCard>
            {mode === 'auto' ? 'Süre dolunca oylama kendiliğinden başlar.' : `Oylamayı ${managerName} başlatacak.`}
          </InfoCard>
        ) : null}
      </>
    );
  } else if (phase === 'vote') {
    const savedChoice = me.voted ? (me.vote_target ?? SKIP) : undefined;
    const selection = pickedId ?? savedChoice;
    const options: PickOption[] = [
      ...alive.filter((p) => !p.is_me).map((p) => ({ id: p.id, name: p.name })),
      { id: SKIP, name: 'Oy kullanmıyorum', subtle: true },
    ];
    const canVote = me.is_player && me.is_alive;
    body = (
      <>
        {canVote ? (
          <>
            <InfoCard title="Kimi köyden çıkarıyoruz?">
              {me.voted
                ? 'Oyun kaydedildi. Herkes oy verince sonuç açıklanır; istersen oyunu değiştirebilirsin.'
                : 'En çok oy alan kişi elenir ve rolü açıklanır. Eşitlik olursa kimse elenmez.'}
            </InfoCard>
            <TargetPicker options={options} selected={selection} onSelect={(id) => setPick({ key: phaseKey, id })} />
            <PrimaryButton
              label={me.voted ? 'Oyumu değiştir' : 'Oyumu ver'}
              disabled={selection === undefined || selection === savedChoice}
              loading={busy === 'cast'}
              onPress={() =>
                void act('cast', () => castVote(roomId, selection === SKIP || !selection ? null : selection))
              }
            />
          </>
        ) : (
          <>
            <InfoCard title="Oylama sürüyor">
              {me.is_omniscient
                ? 'Anlatıcı olarak oy vermezsin; kimin oy verdiğini aşağıdan izleyebilirsin.'
                : me.is_player
                  ? 'Elendin, oy veremezsin. Oylamayı izleyebilirsin.'
                  : 'Bu oyunda oyuncu değilsin; oylamayı izleyebilirsin.'}
            </InfoCard>
          </>
        )}
        {view.pending ? <ProgressLine label="Oy verenler" done={view.pending.done} total={view.pending.total} /> : null}
        {me.is_omniscient ? (
          <PlayerList
            players={view.players}
            host={view.host}
            status={(p) => (p.voted === null || !p.is_alive ? null : <CheckMark on={p.voted} label="Oy verdi" />)}
          />
        ) : null}
      </>
    );
  } else if (phase === 'vote_result') {
    const lv = view.last_vote;
    const max = Math.max(1, ...(lv?.tally ?? []).map((t) => t.votes));
    body = (
      <>
        {lv?.executed ? (
          <View style={styles.cardStage}>
            <RoleCard role={lv.executed.role} faceUp width={Math.min(cardWidth, 220)} />
            <Text style={styles.resultTitle}>{lv.executed.name} köyden çıkarıldı</Text>
            <View style={styles.resultRole}>
              <Text style={styles.muted}>Rolü:</Text>
              <RoleChip role={lv.executed.role} />
            </View>
          </View>
        ) : (
          <InfoCard title="Kimse elenmedi" tone="accent">
            {lv && lv.tie
              ? 'Oylar eşit çıktı, bu turda kimse köyden çıkarılmadı.'
              : 'Yeterli oy çıkmadı, bu turda kimse köyden çıkarılmadı.'}
          </InfoCard>
        )}
        {lv && lv.tally.length > 0 ? (
          <>
            <SectionHeader title="Oylar" />
            <View style={styles.tally}>
              {lv.tally.map((t) => (
                <View key={t.id} style={styles.tallyRow}>
                  <View style={styles.tallyHead}>
                    <Text style={styles.tallyName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.tallyVotes}>{t.votes} oy</Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.round((t.votes / max) * 100)}%` }]} />
                  </View>
                </View>
              ))}
              {lv.skips + lv.absent > 0 ? (
                <Text style={styles.muted}>
                  {lv.skips > 0 ? `${lv.skips} kişi oy kullanmadı. ` : ''}
                  {lv.absent > 0 ? `${lv.absent} kişi oy vermedi.` : ''}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
        {!canControl ? (
          <InfoCard>
            {mode === 'auto'
              ? 'Süre dolunca yeni gece kendiliğinden başlar.'
              : `Sonraki geceyi ${managerName} başlatacak.`}
          </InfoCard>
        ) : null}
      </>
    );
  } else if (phase === 'ended') {
    const vampiresWon = view.winner === 'vampire';
    const myTeam = me.role ? ROLES[me.role].team : null;
    const iWon = myTeam ? (myTeam === 'vampire') === vampiresWon : null;
    body = (
      <>
        {iWon !== null ? (
          <InfoCard title={iWon ? 'Kazandın!' : 'Bu sefer kaybettin'} tone={iWon ? 'success' : 'danger'}>
            {`Rolün: ${ROLES[me.role!].name}. ${vampiresWon ? 'Vampirler köyü ele geçirdi.' : 'Köylüler bütün vampirleri buldu.'}`}
          </InfoCard>
        ) : null}
        <SectionHeader title="Herkesin rolü" count={view.players.length} />
        <PlayerList players={view.players} host={view.host} />
        {me.is_player ? <ResultCard result={result} isModerator={me.is_admin} /> : null}
        <View style={styles.infoLinks}>
          <InfoLink label="Puan nasıl kazanılır?" onPress={() => setInfo('points')} testID="vv-points" />
        </View>
        <PrimaryButton label="Oyunlara dön" onPress={goToGames} />
      </>
    );
  }

  async function whisper(to: string, text: string, replyTo: string | null): Promise<string | null> {
    const res = await sendWhisper(roomId, to, text, replyTo);
    if (res.error) return res.error;
    playSound('vv_whisper', 0.6);
    setCompose(null);
    await load();
    return null;
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

  const showWhispers = (playing || phase === 'ended') && !me.left && (me.is_player || me.is_omniscient);

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

  const modeLabel =
    mode === 'auto' ? 'Otomatik Oyun' : mode === 'host' ? `Yönetici: ${managerName}` : 'Anlatıcılı oyun';
  const subtitle = [view.code ? `Oda ${view.code}` : null, modeLabel, view.round > 0 ? `${view.round}. tur` : null]
    .filter(Boolean)
    .join(' · ');
  const blocking = live && mustConfirmLeave;

  return (
    <Screen
      title="Vampir–Köylü"
      subtitle={subtitle}
      onBack={blocking ? requestLeave : goToGames}
      backLabel={blocking ? 'Oyundan ayrıl' : 'Oyunlar'}
      headerRight={phase === 'lobby' || playing ? safety.button : undefined}
      overlay={
        safety.isOpen ? (
          safety.nodes
        ) : inviteOpen && phase === 'lobby' && me.is_host ? (
          <InviteSheet roomId={roomId} onClose={() => setInviteOpen(false)} />
        ) : null
      }
    >
      <BackBlocker enabled={blocking} onBack={requestLeave} />
      <Hero view={view} />
      {connError ? <Text style={styles.warn}>Bağlantı koptu, yeniden deniyor…</Text> : null}
      {/* Uzaktan oda: sesli sohbet (sırayla konuşma, mikrofon, ses filtresi, oylamayla atma) */}
      {view.remote && (phase === 'lobby' || playing) && !me.left && myId ? (
        <VoicePanel roomId={roomId} myId={myId} />
      ) : null}
      {playing || phase === 'lobby' ? (
        <Pressable
          onPress={() => setSoundOn(!sound)}
          accessibilityRole="button"
          accessibilityLabel={sound ? 'Sesleri kapat' : 'Sesleri aç'}
          style={({ pressed }) => [styles.soundBtn, pressed && { opacity: 0.7 }]}
          testID="vv-sound"
        >
          <Ionicons
            name={sound ? 'volume-high' : 'volume-mute'}
            size={16}
            color={sound ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.soundText, !sound && { color: colors.textMuted }]}>
            {sound ? 'Sesler açık' : 'Sesler kapalı'}
          </Text>
        </Pressable>
      ) : null}
      {playing && !me.left && view.phase_limit !== null ? (
        <PhaseClock
          label={CLOCK_LABEL[phase] ?? 'Kalan süre'}
          limit={view.phase_limit}
          age={view.phase_age}
          elapsed={elapsed}
        />
      ) : null}
      {playing && !me.left && me.is_player && !me.is_alive ? (
        <InfoCard title="Elendin" tone="danger">
          Artık seçim yapamazsın ama oyunu izlemeye devam edebilirsin. Oyun bitince herkesin rolü açıklanır.
        </InfoCard>
      ) : null}
      {body}
      {hostButton}
      {view.dead_chat ? (
        <DeadChat
          messages={view.dead_chat}
          canWrite={playing && me.is_player && !me.is_alive && !me.left}
          onSend={sayDead}
          onReport={(m) => void reportDead(m)}
        />
      ) : null}
      {phase !== 'cancelled' ? (
        <PrimaryButton label="Oyun kartlarını gör" variant="ghost" onPress={() => setCardsOpen(true)} />
      ) : null}
      {showWhispers ? (
        <WhisperPanel
          view={view}
          onCompose={() => setCompose({ replyTo: null })}
          onReply={(w) => setCompose({ replyTo: w })}
          onReport={(w) => void report(w)}
        />
      ) : null}
      {actionError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}
      {playing && !me.left && me.is_player && me.role ? (
        <PrimaryButton
          label="Rolümü hatırlat"
          variant="ghost"
          onPress={() =>
            void notify(`Rolün: ${ROLES[me.role!].name}`, `${ROLES[me.role!].goal}\n\n${ROLES[me.role!].night}`, {
              icon: 'eye-outline',
            })
          }
        />
      ) : null}
      {playing && mustConfirmLeave ? (
        <PrimaryButton
          label={me.is_host ? 'Oyunu kapat' : 'Oyundan ayrıl'}
          variant={me.is_host ? 'danger' : 'ghost'}
          loading={busy === 'leave'}
          onPress={requestLeave}
        />
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
        <WhisperCompose view={view} replyTo={compose.replyTo} onClose={() => setCompose(null)} onSend={whisper} />
      ) : null}
      <GamePointsModal
        visible={info === 'points'}
        onClose={() => setInfo(null)}
        players={present.length}
        extra={[VAMPIRE_RANK_ITEM]}
      />
    </Screen>
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
    text: 'Vampirler birini ısırır, doktor birini korur, dedektif birine bakıp vampir olup olmadığını öğrenir.',
  },
  {
    icon: 'sunny',
    lead: 'Gündüz.',
    text: 'Sabah kimin öldüğü açıklanır. Masada konuşursunuz, sonra herkes oy verip bir kişiyi köyden çıkarır.',
  },
  {
    icon: 'ear',
    lead: 'Fısıltı.',
    text: 'Oyunda yaşayan herkes 3 kez birine gizli mesaj fısıldayabilir. Masadakiler kimin kime fısıldadığını görür ama ne yazdığını yalnızca alan kişi görür. Cevap vermek de bir hak yer.',
  },
  {
    icon: 'trophy',
    lead: 'Kazanmak.',
    text: 'Bütün vampirler elenirse köylüler, vampirler köylülere eşit olursa vampirler kazanır.',
  },
];

/** Oyun bitince: kaçıncı sırada bitirdin, kaç puan yazıldı. */
function ResultCard({
  result,
  isModerator,
}: {
  result: { data: MyGameResult | null; rules: PointRules } | null;
  isModerator: boolean;
}) {
  if (result === null) return <Text style={styles.muted}>Sonucun hesaplanıyor…</Text>;
  const r = result.data;
  if (!r) return null;
  if (r.note === 'none' || r.best_rank === null || r.players === null) {
    return (
      <InfoCard>
        {isModerator ? 'Moderatörler oyundan puan kazanmaz.' : 'Oyundan erken ayrıldığın için puan yazılmadı.'}
      </InfoCard>
    );
  }
  const place = `${r.players} oyuncu arasında ${r.best_rank}. sırada bitirdin`;
  if (r.note === 'ok') {
    return (
      <InfoCard title={`+${fmtPts(r.awarded)} puan`} tone="success">
        {`${place}; puanın hesabına yazıldı.`}
      </InfoCard>
    );
  }
  if (r.note === 'too_few') {
    return (
      <InfoCard title="Bu oyundan puan yok">
        {`${place}. Puan için oyunda en az ${result.rules.gameMinPlayers} kişi gerekir.`}
      </InfoCard>
    );
  }
  return (
    <InfoCard title="Günlük ya da aylık sınır doldu" tone="accent">
      {`${place} (${fmtPts(r.result_points)} puan değerinde) ama puan sınırın dolduğu için bu oyundan puan yazılmadı.`}
    </InfoCard>
  );
}

// ---------------------------------------------------------------------------
// Sahne görseli ve başlığı
// ---------------------------------------------------------------------------

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

function Hero({ view }: { view: VvView }) {
  const scene = sceneFor(view.phase, view.winner);
  const title =
    view.phase === 'ended'
      ? view.winner === 'vampire'
        ? 'Vampirler kazandı'
        : 'Köylüler kazandı'
      : view.phase === 'night' || view.phase === 'dawn'
        ? `${view.round}. ${view.phase === 'night' ? 'gece' : 'sabah'}`
        : HERO_TITLE[view.phase];
  return (
    <View style={styles.hero} accessible accessibilityLabel={title}>
      <Image source={vampireImages[scene]} contentFit="cover" style={styles.fill} />
      <LinearGradient
        colors={['rgba(8,10,20,0)', 'rgba(8,10,20,0.85)']}
        locations={[0.4, 1]}
        style={[styles.fill, styles.noTouch]}
      />
      <Text style={styles.heroTitle}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gece: her rol kendi ekranını görür
// ---------------------------------------------------------------------------

type ActFn = (
  key: string,
  fn: () => Promise<Result>,
  options?: { confirm?: () => Promise<boolean>; after?: () => void },
) => Promise<void>;

function NightBody({
  view,
  pickedId,
  setPick,
  busy,
  onAct,
  roomId,
  nameOf,
}: {
  view: VvView;
  pickedId: string | undefined;
  setPick: (id: string) => void;
  busy: string | null;
  onAct: ActFn;
  roomId: string;
  nameOf: (id: string | null | undefined) => string;
}) {
  const me = view.me;
  const alive = view.players.filter((p) => p.is_alive);
  const progress = view.pending ? (
    <ProgressLine label="Seçimini yapanlar" done={view.pending.done} total={view.pending.total} />
  ) : null;

  // Anlatıcı: herkesin rolünü ve kimin seçim yaptığını görür
  if (me.is_omniscient) {
    return (
      <>
        <InfoCard title="Gece sürüyor">
          {view.mode === 'auto'
            ? 'Vampirler, doktor ve dedektif seçimini yapıyor. Herkes seçince ya da süre dolunca sabah kendiliğinden olur.'
            : 'Vampirler, doktor ve dedektif seçimini yapıyor. Herkes seçince sabah kendiliğinden olur; beklemek istemezsen aşağıdan bitirebilirsin.'}
        </InfoCard>
        {progress}
        <PlayerList
          players={view.players}
          host={view.host}
          status={(p) =>
            p.night_done === null || !p.role || p.role === 'villager' || !p.is_alive ? null : (
              <CheckMark on={p.night_done} label="Seçim yaptı" />
            )
          }
        />
      </>
    );
  }

  const role = me.role;
  const canAct = me.is_player && me.is_alive && (role === 'vampire' || role === 'doctor' || role === 'detective');

  if (!canAct || !role) {
    return (
      <>
        <InfoCard title={me.is_alive ? 'Köy uyuyor' : 'Köyü izliyorsun'}>
          {!me.is_player
            ? 'Bu oyunda oyuncu değilsin; geceyi izliyorsun. Sabah olunca ekran kendiliğinden değişir.'
            : me.is_alive
              ? 'Gece oldu. Bu gece yapacağın bir şey yok. Telefonu masaya bırak (ekran açık kalsın); sabah olunca ekran kendiliğinden değişir.'
              : 'Elendin. Gece sürerken seçim yapamazsın. Sabahı bekle.'}
        </InfoCard>
        {progress}
      </>
    );
  }

  const info = ROLES[role];
  const saved = me.night_target;
  const selection = pickedId ?? saved ?? undefined;
  const allyIds = new Set((me.allies ?? []).map((a) => a.id));

  let title = '';
  let verb = '';
  let intro = '';
  let options: PickOption[] = [];
  if (role === 'vampire') {
    title = 'Kimi ısıracaksın?';
    verb = 'Isır';
    intro =
      'Dostlarınla aynı kişiyi seçersen o kişi kesin ısırılır. Farklı seçerseniz çoğunluk, eşitse rastgele biri seçilir.';
    options = alive.filter((p) => !p.is_me && !allyIds.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
  } else if (role === 'doctor') {
    title = 'Kimi koruyacaksın?';
    verb = 'Koru';
    intro =
      'Seçtiğin kişi bu gece ısırılsa bile ölmez. Kendini de seçebilirsin; ama art arda iki gece aynı kişiyi koruyamazsın.';
    options = alive.map((p) => {
      const blocked = p.id === me.last_protect;
      return {
        id: p.id,
        name: p.is_me ? `${p.name} (sen)` : p.name,
        disabled: blocked,
        note: blocked ? 'Geçen gece korudun' : undefined,
      };
    });
  } else {
    title = 'Kime bakacaksın?';
    verb = 'Bak';
    intro = 'Seçtiğin kişinin vampir olup olmadığını hemen öğrenirsin. Her gece yalnızca bir kişiye bakabilirsin.';
    options = alive.filter((p) => !p.is_me).map((p) => ({ id: p.id, name: p.name }));
  }

  const todayResult = role === 'detective' ? me.investigations.find((i) => i.round === view.round) : undefined;

  return (
    <>
      <View style={[styles.roleBanner, { borderColor: info.color }]}>
        <Ionicons
          name={role === 'vampire' ? 'moon' : role === 'doctor' ? 'medkit' : 'search'}
          size={22}
          color={info.color}
        />
        <Text style={[styles.roleBannerText, { color: info.color }]}>{info.name}</Text>
      </View>

      {todayResult ? (
        <InfoCard
          title={todayResult.is_vampire ? `${todayResult.name} bir vampir!` : `${todayResult.name} vampir değil`}
          tone={todayResult.is_vampire ? 'danger' : 'success'}
        >
          Bu bilgiyi yalnızca sen biliyorsun. Gündüz ne kadarını paylaşacağın sana kalmış.
        </InfoCard>
      ) : (
        <>
          <InfoCard title={title}>{intro}</InfoCard>
          {role === 'vampire' && me.allies && me.allies.length > 0 ? (
            <InfoCard title="Dostların">
              {me.allies
                .map((a) => `${a.name}${a.is_alive ? '' : ' (elendi)'}${a.pick ? ` → ${a.pick}` : ''}`)
                .join('\n')}
            </InfoCard>
          ) : null}
          <TargetPicker options={options} selected={selection} onSelect={setPick} accent={info.color} />
          <PrimaryButton
            label={saved ? `${verb} · seçimi değiştir` : verb}
            disabled={!selection || selection === saved}
            loading={busy === 'night-action'}
            onPress={() => selection && void onAct('night-action', () => nightAction(roomId, selection))}
          />
          {saved ? (
            <Text style={styles.muted}>Seçimin kaydedildi: {nameOf(saved)}. Herkes seçince sabah olur.</Text>
          ) : null}
        </>
      )}

      {role === 'detective' && me.investigations.length > 0 ? (
        <>
          <SectionHeader title="Notların" />
          <View style={styles.tally}>
            {[...me.investigations].reverse().map((i) => (
              <View key={`${i.round}-${i.id}`} style={styles.noteRow}>
                <Text style={styles.noteRound}>{i.round}. gece</Text>
                <Text style={styles.noteName} numberOfLines={1}>
                  {i.name}
                </Text>
                <Text style={[styles.noteResult, { color: i.is_vampire ? colors.danger : colors.success }]}>
                  {i.is_vampire ? 'Vampir' : 'Vampir değil'}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {progress}
    </>
  );
}

const styles = StyleSheet.create({
  soundBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  soundText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  warn: { color: colors.primary, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  cardText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  hero: {
    width: '100%',
    aspectRatio: VAMPIRE_SCENE_ASPECT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: fontSizes.lg,
    padding: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 8,
  },
  codeCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  codeLabel: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: 44, letterSpacing: 8 },
  codeHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  infoLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 2 },
  rolesRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  roleMini: { alignItems: 'center', gap: 6 },
  roleMiniName: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 11 },
  cardStage: { alignItems: 'center', gap: spacing.md },
  stageHint: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  roleText: { gap: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.md },
  roleGoal: { color: colors.text, fontSize: fontSizes.md, lineHeight: 23, textAlign: 'center' },
  roleNight: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21, textAlign: 'center' },
  allies: { color: '#B7A8FF', fontFamily: fonts.semi, fontSize: fontSizes.sm, textAlign: 'center' },
  roleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  roleBannerText: { fontFamily: fonts.extra, fontSize: fontSizes.md },
  resultTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg, textAlign: 'center' },
  resultRole: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tally: { gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg },
  tallyRow: { gap: 6 },
  tallyHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  tallyName: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.md },
  tallyVotes: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  bar: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noteRound: { color: colors.textMuted, fontSize: 12, width: 56 },
  noteName: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  noteResult: { fontFamily: fonts.extra, fontSize: fontSizes.sm },
});
