import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { InviteSheet } from '@/components/InviteSheet';
import {
  DeckTile,
  DigitTiles,
  HPlate,
  MeldRow,
  ModePill,
  OK,
  OkRack,
  OkTile,
  Pile,
  PlusSideButton,
  SeatChip,
  TableGrid,
  TileBack,
  VPlate,
  rackTileSize,
  type DropZone,
  type TileSize,
} from '@/components/OkeyParts';
import { Popup } from '@/components/Popup';
import { useElapsedSeconds, usePhaseStart } from '@/components/VampireParts';
import { confirmAction, showDialog } from '@/lib/dialog';
import { OKEY_RULES } from '@/lib/gameInfo';
import { fmtPts } from '@/lib/labels';
import {
  arrangePairs,
  arrangeRuns,
  canAddTo,
  canSwap,
  finishGroups,
  getOkeyView,
  isIsler,
  isWild,
  OK_ROOM_GONE,
  okAdd,
  okArrange,
  okDiscard,
  okDraw,
  okFinish,
  okLay,
  okOpen,
  okRematch,
  okReady,
  okReturn,
  okSetOptions,
  okShow,
  okSit,
  okStart,
  okSwap,
  okTake,
  rackChunks,
  RACK_SLOTS,
  splitChunk,
  teamOf,
  tileName,
  validChunks,
  type OkeyLog,
  type OkeyMeld,
  type OkeyOpts,
  type OkeyView,
} from '@/lib/okey';
import { lockLandscape, lockPortrait } from '@/lib/orientation';
import { getMyGameResult, type MyGameResult } from '@/lib/ranking';
import { leaveRoom } from '@/lib/rooms';
import { isBackendReady } from '@/lib/supabase';
import { addTestBots } from '@/lib/vampire';
import { fonts } from '@/theme';

const POLL_MS = 1500;
/** Web önizlemede taş sürüklerken yazılar seçilmesin */
const WEB_NO_SELECT = { userSelect: 'none' } as object;
const KEEP_AWAKE_TAG = 'okey-masasi';

function goToGames() {
  if (router.canGoBack()) router.back();
  else router.replace('/games');
}

/** Android Geri tuşu: oyundan sessizce çıkılmasın */
function useBackBlock(enabled: boolean, onBack: () => void) {
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
}

const notNull = (x: number | null | undefined): x is number => x !== null && x !== undefined;

/** Sunucudan gelen ıstakayı yerel dizilişle birleştirir: taşlar aynıysa yerel diziliş kalır, değiştiyse yeni taşlar eklenir */
function mergeRack(local: (number | null)[] | null, server: (number | null)[]): (number | null)[] {
  const srv = server.length === RACK_SLOTS ? server : [...server, ...Array(Math.max(0, RACK_SLOTS - server.length)).fill(null)];
  if (!local) return srv;
  const sset = new Set(srv.filter(notNull));
  const lset = local.filter(notNull);
  if (lset.length === sset.size && lset.every((t) => sset.has(t))) return local;
  const out = local.map((t) => (notNull(t) && sset.has(t) ? t : null));
  srv.forEach((t, i) => {
    if (!notNull(t) || out.includes(t)) return;
    if (out[i] === null) out[i] = t;
    else {
      const j = out.indexOf(null);
      if (j >= 0) out[j] = t;
    }
  });
  return out;
}

function closedText(reason: string | null): string {
  if (reason === 'quit') return 'Oda sahibi ayrıldığı için masa kapandı.';
  if (reason === 'timeout') return 'Oda sahibinin bağlantısı koptuğu için masa kapandı.';
  if (reason === 'empty') return 'Masada oyuncu kalmadığı için oyun kapandı.';
  return 'Masa kapandı.';
}

function optsLine(game: OkeyView['game'], o: OkeyOpts): string {
  const parts = [o.pairs ? 'Eşli' : 'Tekli'];
  if (game === 'okey101') {
    parts.push(o.fold ? 'Katlamalı' : 'Katlamasız', o.penalty ? 'Cezalı' : 'Cezasız', `${o.hands ?? 3} el`);
  } else parts.push(`${o.target ?? 20} puan`);
  parts.push(o.helper ? 'Yardımlı' : 'Yardımsız');
  return parts.join(' · ');
}

/** Günlükteki bir olayın kısa yazısı */
function logText(e: OkeyLog, nameOf: (s: number | null | undefined) => string, okc: number | null, okn: number | null): string | null {
  const who = nameOf(e.s);
  const tn = (t: number | undefined) => (t === undefined ? '' : tileName(t, okc, okn));
  switch (e.k) {
    case 'take':
      return `${who} yandan ${tn(e.t)} aldı`;
    case 'return':
      return `${who} yandan aldığı taşı geri koydu${e.pen ? ` · ${e.pen} ceza` : ''}`;
    case 'discard':
      return e.pen ? `${who} ${e.why === 'okey' ? 'okey attı' : 'işlek taş attı'} · ${e.pen} ceza` : null;
    case 'open':
      return e.kind === 'pair' ? `${who} ${e.v} çiftle elini açtı` : `${who} elini ${e.v} ile açtı`;
    case 'lay':
      return `${who} yeni per indirdi`;
    case 'add':
      return `${who} ${tn(e.t)} işledi`;
    case 'swap':
      return `${who} yerdeki okeyi aldı`;
    case 'show':
      return `${who} göstergeyi gösterdi`;
    case 'left':
      return `${who} masadan ayrıldı; yerine sunucu oynuyor`;
    default:
      return null;
  }
}

/** Oda değişince (aynı masayla yeni oyun) ekran baştan kurulur */
export default function OkeyScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const roomId = typeof params.id === 'string' ? params.id : '';
  return <OkeyTable key={roomId} roomId={roomId} />;
}

function OkeyTable({ roomId }: { roomId: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** Yatay düzen: oyun sırasında ekran yana döner (kilit kurulamazsa telefonun o anki yönüne göre) */
  const land = width > height;
  const [view, setView] = useState<OkeyView | null>(null);
  const [viewAt, setViewAt] = useState(() => Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [rack, setRack] = useState<(number | null)[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);
  const [sheet, setSheet] = useState<'melds' | 'scores' | 'rules' | 'invite' | null>(null);
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null);
  const [result, setResult] = useState<MyGameResult | null>(null);
  const [feed, setFeed] = useState<string | null>(null);
  const rackRef = useRef<(number | null)[] | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const hasView = useRef(false);
  const leaving = useRef(false);
  const lastTurn = useRef<string | null>(null);
  const lastEvn = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zones = useRef<{ discard: View | null; deck: View | null }>({ discard: null, deck: null });
  const zoneRects = useRef<{ discard?: { x: number; y: number; w: number; h: number }; deck?: { x: number; y: number; w: number; h: number } }>({});
  /** Yatay masada yerdeki perler (taş üstüne bırakılınca işlenir) */
  const meldRefs = useRef(new Map<number, View>());
  const meldRects = useRef(new Map<number, { x: number; y: number; w: number; h: number }>());

  const say = useCallback((text: string, tone: 'info' | 'danger' = 'danger') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  /** Yeni görünüm: ıstaka birleştirilir, sıra sende olduysa titreşir, yeni olaylar kısa yazı olarak geçer */
  const applyView = useCallback((v: OkeyView, sentAt: number) => {
    hasView.current = true;
    setLoadError(null);
    if (v.rack) {
      const merged = mergeRack(rackRef.current, v.rack);
      rackRef.current = merged;
      setRack(merged);
      setSelected((s) => (s !== null && merged.includes(s) ? s : null));
    } else {
      rackRef.current = null;
      setRack(null);
      setSelected(null);
    }
    const turnKey = v.phase === 'play' && v.me.seat !== null && v.turn === v.me.seat ? `${v.hand}:${v.tn}` : null;
    if (turnKey && lastTurn.current !== turnKey && lastTurn.current !== null) Vibration.vibrate(120);
    lastTurn.current = turnKey ?? '';
    // Günlük: son görülen olaydan sonrakiler (kendi hamlelerin hariç)
    const evn = v.evn ?? 0;
    if (lastEvn.current !== null && evn > lastEvn.current && v.log) {
      const nameOf = (s: number | null | undefined) => v.players.find((p) => p.seat === s)?.name ?? 'Biri';
      const fresh = v.log.filter((e) => e.i > (lastEvn.current ?? 0) && e.s !== v.me.seat);
      const text = fresh.map((e) => logText(e, nameOf, v.okc, v.okn)).filter(Boolean).pop();
      if (text) {
        setFeed(text);
        if (feedTimer.current) clearTimeout(feedTimer.current);
        feedTimer.current = setTimeout(() => setFeed(null), 4200);
      }
    }
    lastEvn.current = evn;
    setView(v);
    setViewAt(sentAt + (Date.now() - sentAt) / 2);
  }, []);

  const loadOnce = useCallback(async () => {
    const sentAt = Date.now();
    const res = await getOkeyView(roomId);
    if (leaving.current) return;
    if (res.error || !res.data) {
      if (hasView.current && res.error === OK_ROOM_GONE) setGone(true);
      else if (!hasView.current) setLoadError(res.error ?? 'Masa okunamadı.');
      return;
    }
    applyView(res.data, sentAt);
  }, [roomId, applyView]);

  const load = useCallback(async () => {
    if (!isBackendReady || leaving.current || !roomId) return;
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        await loadOnce();
      } while (again.current && !leaving.current);
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [loadOnce, roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = !gone && (view === null || (view.status !== 'finished' && view.status !== 'cancelled' && !view.me.left));
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const started = Date.now();
      await load();
      if (!stopped) t = setTimeout(() => void tick(), Math.max(250, POLL_MS - (Date.now() - started)));
    };
    t = setTimeout(() => void tick(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load();
    });
    return () => {
      stopped = true;
      clearTimeout(t);
      sub.remove();
    };
  }, [live, load]);

  // Oyun bitince sonucum (sıra ve yazılan puan)
  const ended = view?.status === 'finished';
  const wasPlayer = view?.me.is_player === true;
  useEffect(() => {
    if (!ended || !wasPlayer) return;
    let active = true;
    void getMyGameResult(roomId).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [ended, wasPlayer, roomId]);

  // Oyun masası (oynanış, el sonu, oyun sonu) yatay; bekleme odası dikey. Ekrandan çıkınca dikeye döner.
  const wantLand = view !== null && (view.status === 'playing' || view.status === 'finished') && !gone;
  useEffect(() => {
    if (wantLand) lockLandscape();
    else lockPortrait();
  }, [wantLand]);
  useEffect(() => () => lockPortrait(), []);

  const stayAwake = live && view !== null;
  useEffect(() => {
    if (!stayAwake) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [stayAwake]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (feedTimer.current) clearTimeout(feedTimer.current);
    },
    [],
  );

  // Sıra sayacı
  const turnKey = view && view.phase === 'play' ? `${view.hand}:${view.tn}` : null;
  const turnStart = usePhaseStart(turnKey, viewAt, view?.turn_age ?? null);
  const endKey = view && view.phase === 'hand_end' ? `end:${view.hand}` : null;
  const endStart = usePhaseStart(endKey, viewAt, view?.end_age ?? null);
  const elapsed = useElapsedSeconds(viewAt, live && view !== null && view.status === 'playing', turnStart ?? endStart);

  const leaveGame = useCallback(async () => {
    if (!view) {
      goToGames();
      return;
    }
    if (view.status === 'finished' || view.status === 'cancelled' || view.me.left || !view.me.is_player) {
      leaving.current = true;
      goToGames();
      return;
    }
    const ok = await confirmAction(
      view.status === 'lobby' ? 'Masadan kalk' : 'Oyundan ayrıl',
      view.status === 'lobby'
        ? view.me.is_host
          ? 'Masayı sen açtın; kalkarsan masa herkes için kapanır.'
          : 'Bekleme odasından çıkarsın. Kodu tekrar girerek geri dönebilirsin.'
        : 'Oyundan ayrılırsan yerine sunucu oynar, bu oyundan puan alamazsın ve geri dönemezsin.',
      view.status === 'lobby' ? 'Masadan kalk' : 'Ayrıl',
      true,
      { icon: 'exit-outline' },
    );
    if (!ok) return;
    leaving.current = true;
    await leaveRoom(roomId);
    goToGames();
  }, [view, roomId]);
  useBackBlock(true, () => void leaveGame());

  /** Hamle: kilit + hata yazısı + yeni görünüm */
  const act = useCallback(
    async (key: string, fn: () => Promise<{ data: OkeyView | null; error: string | null }>): Promise<boolean> => {
      if (busy) return false;
      setBusy(key);
      const sentAt = Date.now();
      try {
        const res = await fn();
        if (res.error) {
          say(res.error);
          void load();
          return false;
        }
        if (res.data) applyView(res.data, sentAt);
        return true;
      } finally {
        setBusy(null);
      }
    },
    [busy, say, load, applyView],
  );

  const changeRack = useCallback(
    (next: (number | null)[]) => {
      rackRef.current = next;
      setRack(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (rackRef.current) void okArrange(roomId, rackRef.current);
      }, 500);
    },
    [roomId],
  );

  const measureZones = useCallback(() => {
    for (const k of ['discard', 'deck'] as const) {
      zones.current[k]?.measureInWindow((x, y, w, h) => {
        zoneRects.current[k] = { x, y, w, h };
      });
    }
    meldRects.current.clear();
    meldRefs.current.forEach((ref, id) => {
      ref.measureInWindow((x, y, w, h) => {
        meldRects.current.set(id, { x, y, w, h });
      });
    });
  }, []);

  const zoneAt = useCallback((px: number, py: number): DropZone | null => {
    for (const k of ['discard', 'deck'] as const) {
      const r = zoneRects.current[k];
      if (r && px >= r.x - 12 && px <= r.x + r.w + 12 && py >= r.y - 12 && py <= r.y + r.h + 12) return k;
    }
    for (const [id, r] of meldRects.current) {
      if (px >= r.x - 4 && px <= r.x + r.w + 4 && py >= r.y - 4 && py <= r.y + r.h + 4) return `meld:${id}`;
    }
    return null;
  }, []);

  // ---- Türetilmiş durum ----
  const v = view;
  const okc = v?.okc ?? 0;
  const okn = v?.okn ?? 1;
  const helper = v?.opts.helper === true;
  const is101 = v?.game === 'okey101';
  const mySeat = v?.me.seat ?? null;
  const myTurn = !!v && v.phase === 'play' && mySeat !== null && v.turn === mySeat;
  const drew = v?.drew === true;
  const myOpened = v && mySeat !== null ? v.opened?.[String(mySeat)] ?? null : null;
  const tiles = useMemo(() => (rack ?? []).filter(notNull), [rack]);
  const prevSeat = mySeat !== null ? ((mySeat + 2) % 4) + 1 : null;
  const leftPile = v && prevSeat !== null ? v.disc?.[String(prevSeat)] ?? [] : [];
  const myPile = v && mySeat !== null ? v.disc?.[String(mySeat)] ?? [] : [];
  const melds = useMemo(() => v?.melds ?? [], [v]);

  // Yardımlı masa: ıstakadaki geçerli perler (yeşil), geçersiz gruplar (kırmızı), işlek taşlar (turuncu)
  const chunkInfo = useMemo(() => {
    if (!rack || !v || v.phase !== 'play') return null;
    if (is101) {
      const pairsMode = myOpened ? myOpened.kind === 'pair' : false;
      const runs = validChunks(rack, okc, okn, false, false);
      const prs = validChunks(rack, okc, okn, false, true);
      return { runs, prs, pairsMode };
    }
    return null;
  }, [rack, v, is101, okc, okn, myOpened]);

  const marks = useMemo(() => {
    const m = new Map<number, 'ok' | 'warn' | 'bad'>();
    if (!helper || !rack || !v) return m;
    if (is101 && chunkInfo) {
      const useP = myOpened ? myOpened.kind === 'pair' : chunkInfo.prs.pairCount > chunkInfo.runs.melds.length;
      const src = useP ? chunkInfo.prs : chunkInfo.runs;
      src.groups.flat().forEach((t) => m.set(t, 'ok'));
      if (v.opts.penalty) tiles.forEach((t) => !m.has(t) && isIsler(melds, t, okc, okn) && m.set(t, 'warn'));
    } else if (!is101) {
      // Okey: perlere ya da çiftlere bölünen gruplar yeşil
      for (const ch of rackChunks(rack)) {
        if ((ch.length >= 3 && splitChunk(ch, okc, okn, true, false)) || (ch.length >= 2 && splitChunk(ch, okc, okn, true, true))) {
          ch.forEach((t) => m.set(t, 'ok'));
        }
      }
    }
    return m;
  }, [helper, rack, v, is101, chunkInfo, myOpened, tiles, melds, okc, okn]);

  // ---- Hamleler ----
  const draw = () => {
    if (!v || !myTurn) return say(v?.phase === 'play' ? 'Sıra sende değil.' : 'Şu an taş alınmaz.');
    if (drew) {
      if (!is101 && selected !== null) return void finishWith(selected);
      return say(is101 ? 'Bu tur taşını aldın. Şimdi bir taş at.' : 'Bu tur taşını aldın. Bitirmek için atacağın taşı ortaya sürükle.', 'info');
    }
    void act('draw', () => okDraw(roomId));
  };

  const take = () => {
    if (!v || !myTurn) return say('Sıra sende değil.');
    if (drew) return say('Bu tur taşını aldın.', 'info');
    if (!leftPile.length) return say('Yanda alınacak taş yok.', 'info');
    if (is101 && !myOpened) {
      void confirmAction(
        'Yandan al',
        'Elini açmadın: yandan aldığın taşla bu tur elini açmak zorundasın. Açamazsan taşı geri koyarsın' +
          (v.opts.penalty ? ' ve 101 ceza yazılır.' : '.'),
        'Al',
        false,
        { icon: 'hand-left-outline' },
      ).then((ok) => {
        if (ok) void act('take', () => okTake(roomId));
      });
      return;
    }
    void act('take', () => okTake(roomId));
  };

  const discard = async (t: number) => {
    if (!v || !myTurn) return say('Sıra sende değil.');
    if (!drew) return say('Önce ortadan ya da yandan bir taş al.');
    if (is101 && v.side !== null && !myOpened) {
      return say('Yandan aldığın taşla elini açmalısın; açamıyorsan “Geri koy”a bas.');
    }
    if (is101 && v.opts.penalty && helper && tiles.length > 1) {
      const wild = isWild(t, okc, okn);
      if (wild || isIsler(melds, t, okc, okn)) {
        const ok = await confirmAction(
          wild ? 'Okey atıyorsun' : 'İşlek taş',
          wild ? 'Okey atmak cezalı masada 101 ceza yazar.' : 'Bu taş yerdeki bir pere işlenir. Atarsan 101 ceza yazılır.',
          'Yine de at',
          true,
          { icon: 'warning-outline' },
        );
        if (!ok) return;
      }
    }
    setSelected(null);
    void act('discard', () => okDiscard(roomId, t));
  };

  const finishWith = async (t: number) => {
    if (!v || !myTurn || is101 || !rack) return;
    if (!drew) return say('Önce bir taş al; bitirmek için 15 taşın olmalı.');
    if (tiles.length !== 15) return say('Bitirmek için 15 taşın olmalı.');
    const fg = finishGroups(rack, t, okc, okn);
    if (!fg && helper) {
      return say('Bu dizilişle bitemezsin: kalan 14 taş perlere (ya da 7 çifte) dizilmeli, gruplar arasında boşluk olmalı.');
    }
    const groups = fg?.groups ?? rackChunks(rack.map((x) => (x === t ? null : x)));
    const ok = await confirmAction(
      'Bitir',
      `${tileName(t, okc, okn)} ortaya atılıp el bitirilsin mi?${isWild(t, okc, okn) ? ' Okey atarak bitiriyorsun (2 kat).' : ''}`,
      'Bitir',
      false,
      { icon: 'trophy-outline' },
    );
    if (!ok) return;
    setSelected(null);
    void act('finish', () => okFinish(roomId, groups, t));
  };

  const onDrop = (zone: DropZone, t: number) => {
    if (zone === 'discard') void discard(t);
    else if (zone === 'deck') {
      if (!is101) void finishWith(t);
      else say('101’de bitirmek için son taşını “Taş at” alanına at.', 'info');
    } else {
      // 101: taş yerdeki perin üstüne bırakıldı → işle (ya da okeyi al)
      const m = melds.find((x) => `meld:${x.id}` === zone);
      if (m) void onMeldPress(m, t);
    }
  };

  const openHand = (pairs: boolean) => {
    if (!v || !rack || !myTurn) return say('Sıra sende değil.');
    if (!drew) return say('Önce bir taş al.');
    const vc = validChunks(rack, okc, okn, false, pairs);
    if (!vc.groups.length) {
      return say(pairs ? 'Istakada yan yana dizilmiş çift yok. Çiftleri yan yana koy, gruplar arasında boşluk bırak.' : 'Istakada geçerli per yok. Perleri yan yana diz, aralarında boşluk bırak.');
    }
    void act('open', () => okOpen(roomId, vc.groups, pairs));
  };

  const layMelds = () => {
    if (!v || !rack || !myOpened) return;
    const vc = validChunks(rack, okc, okn, false, myOpened.kind === 'pair');
    if (!vc.groups.length) return say('Istakada indirilecek geçerli per yok.');
    void act('lay', () => okLay(roomId, vc.groups));
  };

  const onMeldPress = async (m: OkeyMeld, dropped?: number) => {
    if (!v) return;
    const sel = dropped ?? selected;
    if (sel === null) return say('Önce ıstakadan işlemek istediğin taşı seç.', 'info');
    if (!myTurn) return say('Sıra sende değil.');
    if (!drew) return say('Önce ortadan ya da yandan bir taş al.');
    if (!myOpened) return say('İşlemek için önce elini açmalısın.');
    const sides = canAddTo(m, sel, okc, okn);
    const swap = canSwap(m, sel, okc, okn);
    if (!sides.length && !swap) {
      if (helper) return say('Bu taş bu pere işlenmez.');
    }
    let choice: 'start' | 'end' | 'swap' | null = sides.length === 1 && !swap ? sides[0] : !sides.length && swap ? 'swap' : null;
    if (choice === null && (sides.length || swap)) {
      const buttons: { label: string; value: 'start' | 'end' | 'swap' | null; style: 'primary' | 'ghost' }[] = [];
      if (swap) buttons.push({ label: 'Okeyi al', value: 'swap', style: 'primary' });
      if (sides.includes('start')) buttons.push({ label: 'Başa işle', value: 'start', style: 'ghost' });
      if (sides.includes('end')) buttons.push({ label: 'Sona işle', value: 'end', style: 'ghost' });
      buttons.push({ label: 'Vazgeç', value: null, style: 'ghost' });
      choice = await showDialog<'start' | 'end' | 'swap' | null>({
        title: tileName(sel, okc, okn),
        message: 'Bu taşla ne yapılsın?',
        icon: 'git-merge-outline',
        buttons,
        cancelValue: null,
      });
      if (choice === null) return;
    }
    const t = sel;
    if (choice === 'swap') {
      if (await act('swap', () => okSwap(roomId, m.id, t))) setSelected(null);
    } else if (await act('add', () => okAdd(roomId, m.id, t, choice === 'start' || choice === 'end' ? choice : null))) {
      setSelected(null);
    }
  };

  const arrange = (kind: 'runs' | 'pairs') => {
    if (!tiles.length) return;
    changeRack(kind === 'runs' ? arrangeRuns(tiles, okc, okn, !is101) : arrangePairs(tiles, okc, okn));
    setSelected(null);
  };

  // ---- Ekranlar ----
  if (!roomId) {
    return <Shell><Center text="Masa bulunamadı." onBack={goToGames} /></Shell>;
  }
  if (gone) {
    return <Shell><Center text="Bu masa artık yok ya da masadan çıkarıldın." onBack={goToGames} /></Shell>;
  }
  if (!v) {
    return (
      <Shell>
        {loadError ? <Center text={loadError} onBack={goToGames} /> : <ActivityIndicator color={OK.glow} style={styles.flex} />}
      </Shell>
    );
  }

  const title = v.game === 'okey' ? 'Okey' : '101 Okey';
  const nameOf = (s: number | null | undefined) => v.players.find((p) => p.seat === s)?.name ?? '—';
  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => void leaveGame()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Masadan çık" style={styles.hBtn} testID="ok-leave">
        <Ionicons name="close" size={22} color={OK.text} />
      </Pressable>
      <View style={styles.hMid}>
        <Text style={styles.hTitle} numberOfLines={1}>
          {title}
          {v.status === 'playing' && v.hand ? (is101 ? ` · El ${v.hand}/${v.opts.hands ?? 3}` : ` · El ${v.hand}`) : ''}
        </Text>
        <Text style={styles.hSub} numberOfLines={2}>
          {v.remote ? 'Uzaktan · ' : 'Yan yana · '}
          {optsLine(v.game, v.opts)}
          {v.test ? ' · Deneme' : ''}
        </Text>
      </View>
      {v.status !== 'lobby' ? (
        <Pressable onPress={() => setSheet('scores')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Puan tablosu" style={styles.hBtn} testID="ok-scores">
          <Ionicons name="podium-outline" size={20} color={OK.gold} />
        </Pressable>
      ) : null}
      <Pressable onPress={() => setSheet('rules')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kurallar" style={styles.hBtn} testID="ok-rules">
        <Ionicons name="help-circle-outline" size={22} color={OK.text} />
      </Pressable>
    </View>
  );

  const sheets = (
    <>
      {sheet === 'rules' ? (
        <Popup title={`${title} kuralları`} subtitle={optsLine(v.game, v.opts)} icon="book-outline" onClose={() => setSheet(null)} testID="ok-rules-sheet">
          {OKEY_RULES[v.game].map((r) => (
            <View key={r.lead} style={styles.ruleRow}>
              <Ionicons name={r.icon} size={18} color="#0E9F93" />
              <Text style={styles.ruleText}>
                <Text style={styles.ruleLead}>{r.lead} </Text>
                {r.text}
              </Text>
            </View>
          ))}
        </Popup>
      ) : null}
      {sheet === 'scores' ? <ScoreSheet v={v} onClose={() => setSheet(null)} /> : null}
      {sheet === 'invite' ? <InviteSheet roomId={roomId} onClose={() => setSheet(null)} /> : null}
      {sheet === 'melds' ? (
        <MeldSheet
          v={v}
          selected={selected}
          myTurn={myTurn}
          canPlay={!!myOpened && myTurn && drew}
          onPress={(m) => {
            setSheet(null);
            void onMeldPress(m);
          }}
          onClose={() => setSheet(null)}
          width={width}
        />
      ) : null}
    </>
  );

  if (v.status === 'cancelled') {
    return (
      <Shell>
        {header}
        <Center text={closedText(v.close_reason)} onBack={goToGames} />
        {sheets}
      </Shell>
    );
  }

  if (v.status === 'lobby') {
    return (
      <Shell>
        {header}
        <Lobby
          v={v}
          busy={busy}
          onSit={(s) => void act('sit', () => okSit(roomId, s))}
          onOpt={(o) => void act('opt', () => okSetOptions(roomId, o))}
          onStart={() => void act('start', () => okStart(roomId))}
          onBots={() => {
            setBusy('bots');
            void addTestBots(roomId, 4 - v.players.length).then((r) => {
              setBusy(null);
              if (r.error) say(r.error);
              void load();
            });
          }}
          onInvite={() => setSheet('invite')}
          onLeave={() => void leaveGame()}
        />
        {toast ? <Toast {...toast} /> : null}
        {sheets}
      </Shell>
    );
  }

  // ---- Masa ----
  const size = rackTileSize(width - 12);
  // Masadaki taşlar ıstakadakinden büyük: yığınlar, deste ve gösterge
  const pileSize: TileSize = { w: Math.round(size.w * 1.45), h: Math.round(size.h * 1.45) };
  const otherSize: TileSize = { w: Math.round(size.w * 1.15), h: Math.round(size.h * 1.15) };
  const seatAt = (rel: 1 | 2 | 3) => (mySeat !== null ? ((mySeat - 1 + rel) % 4) + 1 : rel + 1);
  const playerAt = (s: number) => v.players.find((p) => p.seat === s);
  // Kalan süre: sıranın başladığı an (telefon saatiyle) ile şimdiki an arasındaki fark
  const nowMs = viewAt + elapsed * 1000;
  const turnUsed = (nowMs - (turnStart ?? viewAt - (v.turn_age ?? 0) * 1000)) / 1000;
  const turnLeft = Math.max(0, Math.ceil(v.turn_secs - turnUsed));
  const turnFrac = v.turn_secs > 0 ? Math.max(0, Math.min(1, (v.turn_secs - turnUsed) / v.turn_secs)) : 0;
  const pauseLeft = Math.max(0, Math.ceil(v.pause_secs - (nowMs - (endStart ?? viewAt - (v.end_age ?? 0) * 1000)) / 1000));
  const scoreOf = (s: number) => {
    const n = v.scores?.[String(s)];
    if (n === undefined || n === null) return null;
    return is101 ? `${n} ceza` : `${n} puan`;
  };
  const openedLabel = (s: number) => {
    const o = v.opened?.[String(s)];
    if (!o) return null;
    return o.kind === 'pair' ? `${o.pairs} çift açtı` : `${o.value} açtı`;
  };
  const chip = (s: number) => {
    const p = playerAt(s);
    if (!p) return <View />;
    return (
      <SeatChip
        name={p.name}
        avatar={p.avatar}
        tiles={p.tiles}
        score={scoreOf(s)}
        turn={v.phase === 'play' && v.turn === s}
        left={p.left || (v.auto ?? []).includes(s)}
        bot={p.bot}
        team={v.opts.pairs ? (teamOf(s) as 1 | 2) : null}
        compact={!v.remote}
        opened={is101 ? openedLabel(s) : null}
      />
    );
  };
  const rightSeat = seatAt(1);
  const topSeat = seatAt(2);
  const leftSeat = seatAt(3);
  const firstTurn = !is101 && mySeat !== null && !(v.first ?? []).includes(mySeat) && !(v.shown ?? []).includes(mySeat);
  const hasTwin =
    !is101 && v.ind !== null && tiles.some((t) => t < 104 && t !== v.ind && Math.floor(t / 26) === Math.floor((v.ind as number) / 26) && t % 13 === (v.ind as number) % 13);
  const runsInfo = chunkInfo?.runs;
  const prsInfo = chunkInfo?.prs;
  const need = v.need;

  const actions: ReactNode[] = [];
  if (v.phase === 'play' && myTurn) {
    if (!is101) {
      if (firstTurn && hasTwin) {
        actions.push(<ActBtn key="show" label="Göstergeyi göster" icon="eye-outline" onPress={() => void act('show', () => okShow(roomId))} busy={busy === 'show'} small={land} />);
      }
      if (drew) {
        actions.push(
          <ActBtn
            key="finish"
            label="Bitir"
            icon="trophy-outline"
            primary={selected !== null}
            onPress={() => (selected !== null ? void finishWith(selected) : say('Bitirmek için atacağın 15. taşı seç ya da ortaya sürükle.', 'info'))}
            busy={busy === 'finish'}
            small={land}
          />,
        );
      }
    } else if (drew) {
      if (!myOpened) {
        const runLabel = helper && runsInfo && need ? `Seri aç ${runsInfo.value}/${need.run}` : 'Seri aç';
        const pairLabel = helper && prsInfo && need ? `Çift aç ${prsInfo.pairCount}/${need.pair}` : 'Çift aç';
        actions.push(
          <ActBtn
            key="open"
            label={runLabel}
            icon="albums-outline"
            primary={!!(helper && runsInfo && need && runsInfo.value >= need.run)}
            onPress={() => openHand(false)}
            busy={busy === 'open'}
            small={land}
          />,
          <ActBtn
            key="pairs"
            label={pairLabel}
            icon="copy-outline"
            primary={!!(helper && prsInfo && need && prsInfo.pairCount >= need.pair)}
            onPress={() => openHand(true)}
            busy={busy === 'open'}
            small={land}
          />,
        );
        if (v.side !== null) {
          actions.push(
            <ActBtn key="return" label="Geri koy" icon="arrow-undo-outline" danger onPress={() => void act('return', () => okReturn(roomId))} busy={busy === 'return'} small={land} />,
          );
        }
      } else {
        actions.push(<ActBtn key="lay" label="Per indir" icon="layers-outline" onPress={layMelds} busy={busy === 'lay'} small={land} />);
        if (!land) {
          actions.push(<ActBtn key="add" label="İşle" icon="git-merge-outline" onPress={() => (selected === null ? say('İşlemek için ıstakadan bir taş seç.', 'info') : setSheet('melds'))} />);
        }
      }
    }
  }
  // Yatay masada Seri diz / Çift diz ıstakanın yanındaki büyük düğmelerdir
  if (helper && v.phase === 'play' && tiles.length && !land) {
    actions.push(<ActBtn key="ar" label="Seri diz" icon="swap-horizontal-outline" onPress={() => arrange('runs')} small />);
    actions.push(<ActBtn key="ap" label="Çift diz" icon="apps-outline" onPress={() => arrange('pairs')} small />);
  }

  const turnText =
    v.phase !== 'play'
      ? ''
      : myTurn
        ? !drew
          ? 'Sıra sende: ortadan çek ya da yandan al'
          : is101 && v.side !== null && !myOpened
            ? 'Yandan aldığın taşla elini aç (ya da geri koy)'
            : is101
              ? 'Aç, işle ya da bir taş at'
              : 'Bir taş at ya da bitir'
        : `Sıra: ${nameOf(v.turn)}`;

  // ---- Masa parçaları (dikey ve yatay düzende ortak) ----
  const topPile = (sz: TileSize) => (
    <Pile tiles={v.disc?.[String(topSeat)] ?? []} okc={okc} okn={okn} size={sz} helper={helper} label={`${nameOf(topSeat)} attı`} />
  );
  const rightPile = (sz: TileSize) => (
    <Pile tiles={v.disc?.[String(rightSeat)] ?? []} okc={okc} okn={okn} size={sz} helper={helper} label={`${nameOf(rightSeat)} attı`} />
  );
  const deckZone = (sz: TileSize) => (
    <View style={styles.deckRow}>
      <View
        ref={(r) => {
          zones.current.deck = r;
        }}
        onLayout={measureZones}
        collapsable={false}
      >
        <Pressable
          onPress={draw}
          accessibilityRole="button"
          accessibilityLabel={`Ortadan çek, ${v.deck_n ?? 0} taş`}
          testID="ok-deck"
          style={({ pressed }) => [styles.deck, myTurn && !drew && styles.zoneActive, hoverZone === 'deck' && styles.zoneHot, pressed && { opacity: 0.85 }]}
        >
          <TileBack size={sz} count={v.deck_n} />
          <Text style={[styles.zoneLabel, myTurn && !drew && styles.zoneLabelOn]}>
            {!is101 && myTurn && drew ? 'Bitir' : 'Ortadan çek'}
          </Text>
        </Pressable>
      </View>
      {v.ind !== null ? (
        <View style={styles.ind}>
          <OkTile t={v.ind} okc={okc} okn={okn} size={sz} />
          <Text style={styles.zoneLabel}>Gösterge</Text>
          {helper ? <Text style={styles.okeyLine}>Okey: {tileName(okc * 26 + okn - 1, null, null)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
  const meldsBtn = is101 ? (
    <Pressable onPress={() => setSheet('melds')} accessibilityRole="button" testID="ok-melds" style={({ pressed }) => [styles.midBtn, pressed && { opacity: 0.8 }]}>
      <Ionicons name="eye-outline" size={16} color={OK.text} />
      <Text style={styles.midBtnText}>Ortayı gör{melds.length ? ` (${melds.length})` : ''}</Text>
    </Pressable>
  ) : null;
  const feedText = feed ? (
    <Text style={styles.feed} numberOfLines={2}>
      {feed}
    </Text>
  ) : null;
  const takePile = (sz: TileSize) => (
    <Pile
      tiles={leftPile}
      okc={okc}
      okn={okn}
      size={sz}
      helper={helper}
      label="Yandan al"
      active={myTurn && !drew && leftPile.length > 0}
      onPress={take}
      testID="ok-take"
    />
  );
  const discardZone = (sz: TileSize) => (
    <View
      ref={(r) => {
        zones.current.discard = r;
      }}
      onLayout={measureZones}
      collapsable={false}
    >
      <Pile
        tiles={myPile}
        okc={okc}
        okn={okn}
        size={sz}
        helper={helper}
        label="Taş at"
        active={myTurn && drew}
        hot={hoverZone === 'discard'}
        onPress={() => (selected !== null ? void discard(selected) : myTurn && drew ? say('Atacağın taşı seç ya da buraya sürükle.', 'info') : undefined)}
        testID="ok-discard"
      />
    </View>
  );
  const turnBar = (compact: boolean) =>
    v.phase === 'play' ? (
      <View style={compact ? styles.turnBarL : styles.turnBar}>
        <View style={styles.turnTrack}>
          <View style={[styles.turnFill, { width: `${turnFrac * 100}%` }, myTurn && styles.turnFillMe, turnLeft <= 5 && styles.turnFillLow]} />
        </View>
        <Text style={[styles.turnText, myTurn && styles.turnTextMe]} numberOfLines={compact ? 2 : 1}>
          {turnText} · {turnLeft} sn
        </Text>
      </View>
    ) : null;
  const actionsRow = (grow: boolean) =>
    actions.length ? (
      <ScrollView
        horizontal
        style={grow ? styles.actionsScrollL : styles.actionsScroll}
        contentContainerStyle={styles.actions}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {actions}
      </ScrollView>
    ) : (
      <View style={grow ? styles.flex : styles.actionsEmpty} />
    );
  const meLine = (
    <Text style={styles.meLine} numberOfLines={1}>
      {mySeat !== null ? `${nameOf(mySeat)} · ${scoreOf(mySeat) ?? ''}` : ''}
      {is101 && myOpened ? ` · ${openedLabel(mySeat as number)}` : ''}
      {is101 && mySeat !== null && v.pen?.[String(mySeat)] ? ` · bu el ${v.pen[String(mySeat)]} ceza` : ''}
    </Text>
  );
  const rackView = (w: number) =>
    rack && v.phase === 'play' ? (
      <OkRack
        slots={rack}
        okc={okc}
        okn={okn}
        helper={helper}
        width={w}
        selected={selected}
        marks={marks}
        onSelect={setSelected}
        onChange={changeRack}
        zoneAt={zoneAt}
        onHoverZone={setHoverZone}
        onDrop={onDrop}
        testID="ok-rack"
      />
    ) : !v.me.is_player && v.phase === 'play' ? (
      <Text style={styles.watch}>Bu masayı izliyorsun.</Text>
    ) : null;
  const overlays = (
    <>
      {v.phase === 'hand_end' ? (
        <HandEnd v={v} wide={land} left={pauseLeft} busy={busy === 'ready'} onReady={() => void act('ready', () => okReady(roomId))} />
      ) : null}
      {v.status === 'finished' ? (
        <GameEnd
          v={v}
          wide={land}
          result={result}
          busy={busy === 'rematch'}
          onRematch={() => {
            setBusy('rematch');
            void okRematch(roomId).then((r) => {
              setBusy(null);
              if (r.error || !r.data) return say(r.error ?? 'Yeni oyun açılamadı.');
              leaving.current = true;
              router.replace({ pathname: '/okey', params: { id: r.data } });
            });
          }}
          onNext={(id) => {
            leaving.current = true;
            router.replace({ pathname: '/okey', params: { id } });
          }}
          onSearch={() => {
            leaving.current = true;
            router.replace({ pathname: '/okey-ara', params: { oyun: v.game } });
          }}
          onBack={goToGames}
        />
      ) : null}
      {toast ? <Toast {...toast} top={land ? 8 : 70} /> : null}
      {sheets}
    </>
  );

  // ---- Yatay düzen (101 Okey Plus düzeni; oyun sırasında ekran yana döner) ----
  if (land) {
    const W = width - insets.left - insets.right;
    const H = height - insets.top - insets.bottom;
    const topH = 40;
    const sideBtnW = Math.max(44, Math.min(70, Math.round(W * 0.06)));
    const colW = Math.max(sideBtnW + 18, 78);
    const rackW = W - colW * 2 - 8;
    // Istaka taşı: genişliğe göre, ıstaka ekran yüksekliğinin üçte birini geçmez
    const twByW = Math.floor((rackW - 12) / 15);
    const twByH = Math.floor((H * 0.31 - 25) / 2 / 1.3);
    const tw = Math.max(20, Math.min(56, twByW, twByH));
    const rTile: TileSize = { w: tw, h: Math.round(tw * 1.3) };
    const rackH = rTile.h * 2 + 8 + 12 + 5;
    const midH = Math.max(120, H - topH - rackH);
    const pileT: TileSize = { w: Math.round(tw * 0.72), h: Math.round(tw * 0.72 * 1.3) };
    const modeT: TileSize = { w: Math.round(tw * (is101 ? 0.82 : 1.05)), h: Math.round(tw * (is101 ? 0.82 : 1.05) * 1.3) };
    const gT: TileSize = { w: Math.max(13, Math.min(22, Math.round(tw * 0.5))), h: Math.max(17, Math.min(28, Math.round(tw * 0.5 * 1.3))) };
    const myRowH = 34;
    const tableH = midH - myRowH - 4;
    const modeW = Math.max(is101 ? 78 : 130, modeT.w * 2 + 14);
    const pairsW = is101 ? Math.max(70, Math.round(W * 0.1)) : 0;
    const gridW = is101 ? W - colW * 2 - modeW - pairsW - 20 : 0;
    const vPlateH = Math.max(70, midH - (pileT.h + 6) * 2 - 10);
    const plateFor = (s: number): { name: string; avatar: number | null; sub: string | null; turnFrac: number | null; team: 1 | 2 | null; left: boolean; bot: boolean } => {
      const p = playerAt(s);
      return {
        name: p?.name ?? '—',
        avatar: p?.avatar ?? null,
        sub: p ? `${p.tiles} taş${scoreOf(s) ? ` · ${scoreOf(s)}` : ''}` : null,
        turnFrac: v.phase === 'play' && v.turn === s ? turnFrac : null,
        team: v.opts.pairs ? (teamOf(s) as 1 | 2) : null,
        left: !!p && (p.left || (v.auto ?? []).includes(s)),
        bot: !!p?.bot,
      };
    };
    const openedDigits = (s: number, vertical = false) => {
      const o = v.opened?.[String(s)];
      if (!o) return null;
      return o.kind === 'pair' ? (
        <View style={[styles.pDig, vertical && styles.pDigV]}>
          <DigitTiles text={String(o.pairs)} vertical={vertical} />
          <Text style={styles.pDigLabel}>çift</Text>
        </View>
      ) : (
        <DigitTiles text={String(o.value)} vertical={vertical} />
      );
    };
    const corner = (tilesList: number[]) => <Pile tiles={tilesList} okc={okc} okn={okn} size={pileT} helper={helper} label="" compact />;
    const runMelds = melds.filter((m) => m.kind !== 'pair');
    const pairMelds = melds.filter((m) => m.kind === 'pair');
    const meldView = (m: OkeyMeld) => {
      const fits = selected !== null && helper && !!myOpened && myTurn && drew && (canAddTo(m, selected, okc, okn).length > 0 || canSwap(m, selected, okc, okn));
      const hot = hoverZone === `meld:${m.id}`;
      return (
        <View
          key={m.id}
          ref={(r) => {
            if (r) meldRefs.current.set(m.id, r);
            else meldRefs.current.delete(m.id);
          }}
          onLayout={measureZones}
          collapsable={false}
          style={styles.pMeldWrap}
        >
          <Pressable
            onPress={() => (selected !== null ? void onMeldPress(m) : setSheet('melds'))}
            accessibilityRole="button"
            accessibilityLabel="Yerdeki per"
            style={[styles.pMeld, fits && styles.pMeldFits, hot && styles.pMeldHot]}
          >
            {m.tiles.map((t) => (
              <OkTile key={t} t={t} okc={okc} okn={okn} size={gT} helper={helper} />
            ))}
          </Pressable>
        </View>
      );
    };
    const modeCol = (
      <View style={[styles.pMode, { width: modeW }]}>
        <ModePill text={v.opts.pairs ? 'Eşli' : 'Tek'} />
        <ModePill text={helper ? 'Yardımlı' : 'Yardımsız'} on={helper} />
        {is101 ? <ModePill text={v.opts.fold ? 'Katlamalı' : 'Katlamasız'} /> : null}
        <ModePill text={is101 ? `${v.opts.hands ?? 3} El${v.opts.penalty ? ' · Cezalı' : ''}` : `${v.opts.target ?? 20} Puan`} />
        <View style={styles.pIndRow}>
          {v.ind !== null ? (
            <View style={styles.pIndBox}>
              <OkTile t={v.ind} okc={okc} okn={okn} size={modeT} />
              <Text style={styles.pTiny}>Gösterge</Text>
            </View>
          ) : null}
          <View
            ref={(r) => {
              zones.current.deck = r;
            }}
            onLayout={measureZones}
            collapsable={false}
          >
            <Pressable
              onPress={draw}
              accessibilityRole="button"
              accessibilityLabel={`Ortadan çek, ${v.deck_n ?? 0} taş`}
              testID="ok-deck"
              style={({ pressed }) => [styles.pDeck, myTurn && !drew && styles.zoneActive, hoverZone === 'deck' && styles.zoneHot, pressed && { opacity: 0.85 }]}
            >
              <DeckTile size={modeT} count={v.deck_n} />
              <Text style={[styles.pTiny, myTurn && !drew && styles.zoneLabelOn]}>{!is101 && myTurn && drew ? 'Bitir' : 'Çek'}</Text>
            </Pressable>
          </View>
        </View>
        {helper ? <Text style={styles.pOkey}>Okey: {tileName(okc * 26 + okn - 1, null, null)}</Text> : null}
      </View>
    );
    const p0 = mySeat !== null ? plateFor(mySeat) : null;
    const pT = plateFor(topSeat);
    const pL = plateFor(leftSeat);
    const pR = plateFor(rightSeat);
    const hint = v.phase !== 'play' ? '' : myTurn ? turnText.replace('Sıra sende: ', '') : `${nameOf(v.turn)} oynuyor`;
    return (
      <Shell land>
        {/* Üst: çık / masa adı · karşıdaki oyuncu · puan tablosu ve kurallar */}
        <View style={[styles.pTop, { height: topH }]}>
          <View style={styles.pTopSide}>
            <Pressable onPress={() => void leaveGame()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Masadan çık" style={styles.hBtnS} testID="ok-leave">
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.pTitle} numberOfLines={1}>
              {title}
              {v.hand ? (is101 ? ` · El ${v.hand}/${v.opts.hands ?? 3}` : ` · El ${v.hand}`) : ''}
              {v.test ? ' · Deneme' : ''}
            </Text>
          </View>
          <View style={styles.pTopMid}>
            <HPlate {...pT} width={Math.min(220, W * 0.26)} />
            {is101 ? openedDigits(topSeat) : null}
          </View>
          <View style={[styles.pTopSide, styles.pTopRight]}>
            <Pressable onPress={() => setSheet('scores')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Puan tablosu" style={styles.hBtnS} testID="ok-scores">
              <Ionicons name="podium-outline" size={17} color={OK.gold} />
            </Pressable>
            <Pressable onPress={() => setSheet('rules')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kurallar" style={styles.hBtnS} testID="ok-rules">
              <Ionicons name="help-circle-outline" size={19} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Orta: solda / sağda köşe yığınları ve dikey oyuncu kartları, ortada masa */}
        <View style={[styles.pMid, { height: midH }]}>
          <View style={[styles.pCol, { width: colW }]}>
            {corner(v.disc?.[String(topSeat)] ?? [])}
            <View style={[styles.pColMid, styles.pColRow]}>
              <VPlate {...pL} height={vPlateH} side="left" />
              {is101 ? openedDigits(leftSeat, true) : null}
            </View>
            <Pile
              tiles={leftPile}
              okc={okc}
              okn={okn}
              size={pileT}
              helper={helper}
              label="Yandan al"
              active={myTurn && !drew && leftPile.length > 0}
              onPress={take}
              testID="ok-take"
              compact
            />
          </View>

          <View style={styles.pCenter}>
            <View style={[styles.pTable, { height: tableH }]} onLayout={measureZones}>
              {is101 ? (
                <TableGrid width={gridW} height={tableH} cell={gT.w + 2}>
                  <View style={[styles.pMelds, { height: tableH - 6 }]}>{runMelds.map(meldView)}</View>
                  <Pressable onPress={() => setSheet('melds')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Ortayı gör" testID="ok-melds" style={styles.pExpand}>
                    <Ionicons name="expand-outline" size={14} color="#CFE6F5" />
                    <Text style={styles.pExpandText}>Ortayı gör</Text>
                  </Pressable>
                  {feed ? (
                    <Text style={styles.pFeed} numberOfLines={1}>
                      {feed}
                    </Text>
                  ) : null}
                </TableGrid>
              ) : null}
              {modeCol}
              {is101 ? (
                <TableGrid width={pairsW} height={tableH} cell={gT.w + 2}>
                  <View style={[styles.pMelds, { height: tableH - 6 }]}>{pairMelds.map(meldView)}</View>
                  {!pairMelds.length ? <Text style={styles.pPairsHint}>Çiftler</Text> : null}
                </TableGrid>
              ) : null}
              {!is101 && feed ? (
                <Text style={[styles.pFeed, styles.pFeedOkey]} numberOfLines={2}>
                  {feed}
                </Text>
              ) : null}
            </View>
            {/* Sen: açtığın değer, kartın, süren */}
            <View style={[styles.pMe, { height: myRowH }]}>
              <View style={styles.pMeLeft}>
                {actions.length ? (
                  <ScrollView horizontal style={styles.pActScroll} contentContainerStyle={styles.pActs} showsHorizontalScrollIndicator={false}>
                    {actions}
                  </ScrollView>
                ) : null}
                {is101 && mySeat !== null ? openedDigits(mySeat) : null}
              </View>
              {p0 ? <HPlate {...p0} turnFrac={null} width={Math.min(190, W * 0.22)} /> : null}
              <View style={styles.pMeRight}>
                {myTurn ? (
                  <View style={[styles.pBubble, turnLeft <= 5 && styles.pBubbleLow]}>
                    <Text style={styles.pBubbleText}>{turnLeft}</Text>
                  </View>
                ) : null}
                <Text style={[styles.pHint, myTurn && styles.pHintMe]} numberOfLines={2}>
                  {hint}
                  {!myTurn && v.phase === 'play' ? ` · ${turnLeft} sn` : ''}
                  {is101 && mySeat !== null && v.pen?.[String(mySeat)] ? ` · ceza ${v.pen[String(mySeat)]}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.pCol, { width: colW }]}>
            {corner(v.disc?.[String(rightSeat)] ?? [])}
            <View style={[styles.pColMid, styles.pColRow]}>
              {is101 ? openedDigits(rightSeat, true) : null}
              <VPlate {...pR} height={vPlateH} side="right" />
            </View>
            <View
              ref={(r) => {
                zones.current.discard = r;
              }}
              onLayout={measureZones}
              collapsable={false}
            >
              <Pile
                tiles={myPile}
                okc={okc}
                okn={okn}
                size={pileT}
                helper={helper}
                label="Taş at"
                active={myTurn && drew}
                hot={hoverZone === 'discard'}
                onPress={() => (selected !== null ? void discard(selected) : myTurn && drew ? say('Atacağın taşı seç ya da buraya sürükle.', 'info') : undefined)}
                testID="ok-discard"
                compact
              />
            </View>
          </View>
        </View>

        {/* Alt: Çift diz · ıstaka · Seri diz */}
        <View style={[styles.pBottom, { height: rackH }]}>
          <View style={[styles.pBtnCol, { width: colW }]}>
            {helper ? <PlusSideButton kind="pairs" width={sideBtnW} height={rackH - 6} onPress={() => arrange('pairs')} disabled={!tiles.length} /> : null}
          </View>
          <View style={styles.pRackBox}>
            {rack && v.phase === 'play' ? (
              <OkRack
                slots={rack}
                okc={okc}
                okn={okn}
                helper={helper}
                width={rTile.w * 15 + 12}
                tile={rTile}
                skin="gold"
                engrave="PEOPLEHERE"
                selected={selected}
                marks={marks}
                onSelect={setSelected}
                onChange={changeRack}
                zoneAt={zoneAt}
                onHoverZone={setHoverZone}
                onDrop={onDrop}
                testID="ok-rack"
              />
            ) : !v.me.is_player && v.phase === 'play' ? (
              <Text style={styles.watch}>Bu masayı izliyorsun.</Text>
            ) : null}
          </View>
          <View style={[styles.pBtnCol, { width: colW }]}>
            {helper ? <PlusSideButton kind="runs" width={sideBtnW} height={rackH - 6} onPress={() => arrange('runs')} disabled={!tiles.length} /> : null}
          </View>
        </View>
        {overlays}
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <LinearGradient colors={OK.felt} style={styles.table} onLayout={measureZones}>
        {/* Üst sıra: karşıdaki oyuncu ve iki yığın */}
        <View style={styles.tRow}>
          {topPile(otherSize)}
          <View style={styles.tCenter}>{chip(topSeat)}</View>
          {rightPile(otherSize)}
        </View>
        {/* Orta: solda / sağda oyuncular, ortada deste ve gösterge */}
        <View style={styles.tRowMid}>
          <View style={styles.side}>{chip(leftSeat)}</View>
          <View style={styles.middle}>{deckZone(pileSize)}</View>
          <View style={styles.side}>{chip(rightSeat)}</View>
        </View>
        {/* Alt sıra: yandan al (soldaki oyuncunun attığı), ortayı gör, taş at */}
        <View style={styles.tRow}>
          {takePile(pileSize)}
          <View style={styles.tCenter}>
            {meldsBtn}
            {feedText}
          </View>
          {discardZone(pileSize)}
        </View>
      </LinearGradient>
      {turnBar(false)}
      {actionsRow(false)}
      {rack && v.phase === 'play' ? (
        <View style={styles.rackWrap}>
          {rackView(width - 12)}
          {meLine}
        </View>
      ) : (
        rackView(width - 12)
      )}
      {overlays}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function Shell({ children, land = false }: { children: ReactNode; land?: boolean }) {
  return (
    <LinearGradient colors={land ? OK.sea : ['#08262B', '#061A20', '#04121A']} style={[styles.flex, Platform.OS === 'web' && WEB_NO_SELECT]}>
      <StatusBar style="light" hidden={land} />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

function Center({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="grid-outline" size={42} color={OK.muted} />
      <Text style={styles.centerText}>{text}</Text>
      <ActBtn label="Oyunlara dön" icon="arrow-back" primary onPress={onBack} />
    </View>
  );
}

function Toast({ text, tone, top = 70 }: { text: string; tone: 'info' | 'danger'; top?: number }) {
  return (
    <View style={[styles.toast, { top }, tone === 'danger' && styles.toastDanger]} pointerEvents="none">
      <Ionicons name={tone === 'danger' ? 'alert-circle' : 'information-circle'} size={18} color="#FFFFFF" />
      <Text style={styles.toastText}>{text}</Text>
    </View>
  );
}

function ActBtn({
  label,
  icon,
  onPress,
  primary,
  danger,
  small,
  busy,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const fg = primary ? '#04211F' : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.act,
        primary && styles.actPrimary,
        danger && styles.actDanger,
        small && styles.actSmall,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={small ? 14 : 16} color={fg} />}
      <Text style={[styles.actText, { color: fg }, small && styles.actTextSmall]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Bekleme odası: koltuklar (masadaki gerçek oturuş sırası), masa ayarları, başlat */
function Lobby({
  v,
  busy,
  onSit,
  onOpt,
  onStart,
  onBots,
  onInvite,
  onLeave,
}: {
  v: OkeyView;
  busy: string | null;
  onSit: (seat: number) => void;
  onOpt: (o: Partial<OkeyOpts>) => void;
  onStart: () => void;
  onBots: () => void;
  onInvite: () => void;
  onLeave: () => void;
}) {
  const can = (v.me.is_host || v.me.is_admin) && !v.match;
  const bySeat = (s: number) => v.players.find((p) => p.seat === s);
  const full = v.players.length >= 4;
  const o = v.opts;
  const seatBox = (s: number, pos: object) => {
    const p = bySeat(s);
    return (
      <Pressable
        key={s}
        onPress={() => onSit(s)}
        disabled={!v.me.is_player || p?.is_me}
        accessibilityRole="button"
        accessibilityLabel={p ? `${s}. koltuk: ${p.name}` : `${s}. koltuk boş, buraya otur`}
        testID={`ok-seat-${s}`}
        style={({ pressed }) => [styles.seat, pos, p?.is_me && styles.seatMe, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.seatNo}>{s}</Text>
        <Text style={[styles.seatName, !p && styles.seatEmpty]} numberOfLines={1}>
          {p ? p.name : 'Boş koltuk'}
        </Text>
        {o.pairs ? <View style={[styles.seatTeam, { backgroundColor: teamOf(s) === 1 ? '#22D3C5' : '#FF9F6B' }]} /> : null}
        {!p && v.me.is_player ? <Text style={styles.seatHint}>Buraya otur</Text> : null}
      </Pressable>
    );
  };
  const opt = (label: string, on: boolean, val: Partial<OkeyOpts>, key: string) => (
    <Pressable
      key={key}
      onPress={() => onOpt(val)}
      disabled={!can || busy !== null}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !can }}
      style={({ pressed }) => [styles.opt, on && styles.optOn, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.optText, on && styles.optTextOn]}>{label}</Text>
    </Pressable>
  );
  const group = (title: string, items: ReactNode[]) => (
    <View style={styles.optGroup} key={title}>
      <Text style={styles.optTitle}>{title}</Text>
      <View style={styles.optRow}>{items}</View>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={styles.lobby}>
      {v.code ? (
        <Pressable
          onPress={() => void Share.share({ message: `${v.game === 'okey' ? 'Okey' : '101 Okey'} masamın kodu: ${v.code}` })}
          accessibilityRole="button"
          accessibilityLabel={`Oda kodu ${v.code}, paylaş`}
          style={styles.codeBox}
          testID="ok-code"
        >
          <Text style={styles.codeLabel}>Oda kodu</Text>
          <Text style={styles.code}>{v.code}</Text>
          <Text style={styles.codeHint}>Masadakilere söyle; Oyunlar &gt; Katıl’dan girerler.</Text>
        </Pressable>
      ) : null}
      <View style={styles.tableBox}>
        <LinearGradient colors={OK.felt} style={styles.tableFelt}>
          <Ionicons name="grid" size={28} color="rgba(234,251,248,0.35)" />
          <Text style={styles.tableFeltText}>{v.players.length}/4</Text>
        </LinearGradient>
        {seatBox(1, styles.seatBottom)}
        {seatBox(2, styles.seatRight)}
        {seatBox(3, styles.seatTop)}
        {seatBox(4, styles.seatLeft)}
      </View>
      <Text style={styles.lobbyHint}>
        Masadaki gerçek oturuşa göre yerleşin: 1’in sağında 2, karşısında 3, solunda 4 oturur. Taşı solundakinin attığından
        alır, sağına atarsın.{o.pairs ? ' Eşli oyunda 1–3 ve 2–4 eştir.' : ''}
      </Text>
      {group('Oyun', [opt('Tekli', !o.pairs, { pairs: false }, 'a'), opt('Eşli', o.pairs, { pairs: true }, 'b')])}
      {v.game === 'okey101'
        ? [
            group('Açış barajı', [opt('Katlamasız', !o.fold, { fold: false }, 'a'), opt('Katlamalı', !!o.fold, { fold: true }, 'b')]),
            group('Ceza', [opt('Cezalı', !!o.penalty, { penalty: true }, 'a'), opt('Cezasız', !o.penalty, { penalty: false }, 'b')]),
            group('El sayısı', [1, 3, 5, 7].map((n) => opt(`${n} el`, (o.hands ?? 3) === n, { hands: n }, String(n)))),
          ]
        : group('Başlangıç puanı', [10, 20].map((n) => opt(`${n} puan`, (o.target ?? 20) === n, { target: n }, String(n))))}
      {group('Yardım', [opt('Yardımlı', o.helper, { helper: true }, 'a'), opt('Yardımsız', !o.helper, { helper: false }, 'b')])}
      {!can ? <Text style={styles.lobbyHint}>Masa ayarlarını oda sahibi ({v.host.name}) seçer.</Text> : null}
      <View style={styles.lobbyBtns}>
        {can ? (
          <ActBtn label={full ? 'Oyunu başlat' : `4 kişi bekleniyor (${v.players.length}/4)`} icon="play" primary={full} disabled={!full} busy={busy === 'start'} onPress={onStart} />
        ) : (
          <Text style={styles.lobbyHint}>Oda sahibi başlatınca oyun açılır.</Text>
        )}
        {v.me.is_admin && !full ? <ActBtn label="Deneme oyuncusu ekle" icon="hardware-chip-outline" busy={busy === 'bots'} onPress={onBots} /> : null}
        {v.me.is_host && !v.remote && !full ? <ActBtn label="Arkadaş davet et" icon="person-add-outline" onPress={onInvite} /> : null}
        <ActBtn label="Masadan kalk" icon="exit-outline" danger onPress={onLeave} />
      </View>
    </ScrollView>
  );
}

/** Ortayı gör (101): yerdeki perler; seçili taş varsa işlenebilecek perler işaretlenir */
function MeldSheet({
  v,
  selected,
  canPlay,
  onPress,
  onClose,
  width,
}: {
  v: OkeyView;
  selected: number | null;
  myTurn: boolean;
  canPlay: boolean;
  onPress: (m: OkeyMeld) => void;
  onClose: () => void;
  width: number;
}) {
  const okc = v.okc ?? 0;
  const okn = v.okn ?? 1;
  const size = rackTileSize(Math.min(width, 480) - 40);
  const small = { w: Math.round(size.w * 0.92), h: Math.round(size.h * 0.92) };
  const melds = v.melds ?? [];
  const bySeat = [1, 2, 3, 4].map((s) => ({ s, list: melds.filter((m) => m.seat === s) })).filter((g) => g.list.length);
  return (
    <Popup
      title="Ortayı gör"
      subtitle={
        selected !== null && canPlay
          ? `Seçili taş: ${tileName(selected, okc, okn)}. İşlemek ya da okeyi almak için pere dokun.`
          : 'Yere açılan perler. İşlemek için önce ıstakadan bir taş seç.'
      }
      icon="eye-outline"
      onClose={onClose}
      testID="ok-melds-sheet"
    >
      {!bySeat.length ? <Text style={styles.sheetEmpty}>Henüz kimse elini açmadı.</Text> : null}
      {bySeat.map((g) => {
        const p = v.players.find((x) => x.seat === g.s);
        const o = v.opened?.[String(g.s)];
        return (
          <View key={g.s} style={styles.meldGroup}>
            <Text style={styles.meldOwner}>
              {p?.name ?? `${g.s}. koltuk`}
              {o ? (o.kind === 'pair' ? ` · ${o.pairs} çiftle açtı` : ` · ${o.value} ile açtı`) : ''}
            </Text>
            <View style={styles.meldList}>
              {g.list.map((m) => {
                const fits =
                  selected !== null && canPlay && v.opts.helper && (canAddTo(m, selected, okc, okn).length > 0 || canSwap(m, selected, okc, okn));
                return (
                  <MeldRow
                    key={m.id}
                    meld={m}
                    okc={okc}
                    okn={okn}
                    size={small}
                    helper={v.opts.helper}
                    fits={fits}
                    onPress={selected !== null && canPlay && m.kind !== 'pair' ? () => onPress(m) : undefined}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </Popup>
  );
}

/** Puan tablosu: her elin sonucu ve toplam */
function ScoreSheet({ v, onClose }: { v: OkeyView; onClose: () => void }) {
  const is101 = v.game === 'okey101';
  const seats = [1, 2, 3, 4];
  const nameOf = (s: number) => v.players.find((p) => p.seat === s)?.name ?? `${s}`;
  const cols = v.opts.pairs ? [1, 2] : seats;
  const colName = (c: number) => (v.opts.pairs ? `${nameOf(c)} – ${nameOf(c + 2)}` : nameOf(c));
  return (
    <Popup
      title="Puan tablosu"
      subtitle={is101 ? 'Yazılan cezalar. Oyun sonunda toplamı en düşük olan kazanır.' : `Herkes ${v.opts.target ?? 20} puanla başlar; biri 0’a inince oyun biter, puanı en yüksek kazanır.`}
      icon="podium-outline"
      onClose={onClose}
      testID="ok-score-sheet"
    >
      <View style={styles.sRow}>
        <Text style={[styles.sCell, styles.sHead, styles.sHand]}>El</Text>
        {cols.map((c) => (
          <Text key={c} style={[styles.sCell, styles.sHead]} numberOfLines={2}>
            {colName(c)}
          </Text>
        ))}
      </View>
      {(v.hist ?? []).map((h) => (
        <View key={h.hand} style={styles.sRow}>
          <Text style={[styles.sCell, styles.sHand]}>{h.hand}</Text>
          {cols.map((c) => {
            const d = h.d[String(c)] ?? 0;
            return (
              <Text key={c} style={[styles.sCell, h.fin !== null && (h.fin === c || (v.opts.pairs && teamOf(h.fin) === c)) && styles.sFin]}>
                {d > 0 ? `+${d}` : d}
              </Text>
            );
          })}
        </View>
      ))}
      <View style={[styles.sRow, styles.sTotal]}>
        <Text style={[styles.sCell, styles.sHead, styles.sHand]}>Toplam</Text>
        {cols.map((c) => (
          <Text key={c} style={[styles.sCell, styles.sHead]}>
            {v.scores?.[String(c)] ?? 0}
          </Text>
        ))}
      </View>
    </Popup>
  );
}

function finText(v: OkeyView, nameOf: (s: number | null) => string): string {
  const f = v.fin;
  if (!f || f.seat === null) return 'Ortada taş kalmadı, el bitti.';
  const how: string[] = [];
  if (f.elden) how.push('elden');
  if (f.pairs) how.push('çiftten');
  if (f.okey) how.push('okey atarak');
  return `${nameOf(f.seat)} ${how.length ? how.join(', ') + ' ' : ''}bitirdi${f.mult > 1 ? ` (${f.mult} kat)` : ''}.`;
}

/** El sonu tablosu */
function HandEnd({ v, wide, left, busy, onReady }: { v: OkeyView; wide: boolean; left: number; busy: boolean; onReady: () => void }) {
  const is101 = v.game === 'okey101';
  const nameOf = (s: number | null) => v.players.find((p) => p.seat === s)?.name ?? '—';
  const h = (v.hist ?? [])[(v.hist ?? []).length - 1];
  const okc = v.okc ?? 0;
  const okn = v.okn ?? 1;
  const ready = v.me.seat !== null && (v.ready ?? []).includes(v.me.seat);
  const tiny: TileSize = { w: 18, h: 26 };
  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={[styles.overlayCard, wide && styles.overlayWide]}>
        <Text style={styles.ovTitle}>El {v.hand} bitti</Text>
        <Text style={styles.ovSub}>{finText(v, nameOf)}</Text>
        {v.fin?.groups && !is101 ? (
          <View style={styles.finGroups}>
            {v.fin.groups.map((g, i) => (
              <View key={i} style={styles.finGroup}>
                {g.tiles.map((t) => (
                  <OkTile key={t} t={t} okc={okc} okn={okn} size={tiny} helper />
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <View style={wide ? styles.ovGrid : styles.ovList}>
        {[1, 2, 3, 4].map((s) => {
          const d = h?.d?.[String(s)] ?? 0;
          const ind = h?.ind?.[String(s)];
          // Okey'de bitenin taşları yukarıda perleriyle görünür
          const rem = !is101 && v.fin?.seat === s ? [] : v.reveal?.[String(s)] ?? [];
          const opened = v.opened?.[String(s)];
          return (
            <View key={s} style={[styles.ovRow, wide && styles.ovRowWide]}>
              <View style={styles.ovRowHead}>
                <Text style={styles.ovName} numberOfLines={1}>
                  {nameOf(s)}
                  {v.opts.pairs ? ` (${teamOf(s) === 1 ? '1–3' : '2–4'})` : ''}
                </Text>
                <Text style={[styles.ovDelta, d < 0 && !is101 && styles.ovLoss, d > 0 && is101 && styles.ovLoss]}>
                  {is101 ? (ind !== undefined && ind !== null ? (ind > 0 ? `+${ind}` : `${ind}`) : '') : d === 0 ? '0' : `${d}`}
                </Text>
                <Text style={styles.ovTotal}>{v.scores?.[String(s)] ?? 0}</Text>
              </View>
              {is101 ? (
                <Text style={styles.ovDetail}>
                  {h?.fin === s
                    ? `Bitirdi: -101${(h?.mult ?? 1) > 1 ? ` × ${h?.mult}` : ''}`
                    : v.opts.pairs && h?.fin !== null && h?.fin !== undefined && teamOf(h.fin) === teamOf(s)
                      ? 'Eşi bitirdi: ceza yok'
                      : !opened
                        ? `Açmadı: 202${(h?.mult ?? 1) > 1 ? ` × ${h?.mult}` : ''}`
                        : `Elinde ${h?.rem?.[String(s)] ?? 0}${opened.kind === 'pair' ? ' × 2 (çift açtı)' : ''}${(h?.mult ?? 1) > 1 ? ` × ${h?.mult}` : ''}`}
                  {h?.pen?.[String(s)] ? ` · ceza ${h.pen[String(s)]}` : ''}
                </Text>
              ) : null}
              {rem.length ? (
                <View style={styles.remRow}>
                  {rem.map((t) => (
                    <OkTile key={t} t={t} okc={okc} okn={okn} size={tiny} helper />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        </View>
        {v.opts.pairs && is101 ? <Text style={styles.ovNote}>Eşli: takımın cezası iki kişinin toplamıdır.</Text> : null}
        {v.me.is_player ? (
          <ActBtn label={ready ? `Diğerleri bekleniyor · ${left}` : `Devam · ${left}`} icon="play-forward" primary={!ready} busy={busy} disabled={ready} onPress={onReady} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Oyun sonu: sıralama, sonucum, yeni oyun */
function GameEnd({
  v,
  wide,
  result,
  busy,
  onRematch,
  onNext,
  onSearch,
  onBack,
}: {
  v: OkeyView;
  wide: boolean;
  result: MyGameResult | null;
  busy: boolean;
  onRematch: () => void;
  onNext: (id: string) => void;
  onSearch: () => void;
  onBack: () => void;
}) {
  const is101 = v.game === 'okey101';
  const nameOf = (s: number) => v.players.find((p) => p.seat === s)?.name ?? '—';
  const order = [1, 2, 3, 4].sort((a, b) => {
    const x = v.scores?.[String(a)] ?? 0;
    const y = v.scores?.[String(b)] ?? 0;
    return is101 ? x - y : y - x;
  });
  const won = v.me.seat !== null && (v.winner ?? []).includes(v.me.seat);
  const h = (v.hist ?? [])[(v.hist ?? []).length - 1];
  const note =
    !result || !v.me.is_player
      ? null
      : v.test
        ? 'Deneme masası: puan yazılmaz.'
        : result.note === 'ok'
          ? `${result.best_rank}. sıra · hesabına ${fmtPts(result.awarded)} puan yazıldı`
          : result.note === 'cap'
            ? `${result.best_rank}. sıra · bu ayki ${v.game === 'okey' ? 'Okey' : '101'} puan hedefin doldu; oyun yine sayıldı`
            : result.note === 'visitor'
              ? 'Başka şehrin masası: puan yazılmaz.'
              : result.note === 'too_few'
                ? 'Puan için masada 4 üye olmalı.'
                : 'Oyundan ayrıldığın için puan yok.';
  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={[styles.overlayCard, wide && styles.overlayWide]}>
        <Ionicons name="trophy" size={wide ? 30 : 40} color={OK.gold} style={styles.selfCenter} />
        <Text style={styles.ovTitle}>{won ? 'Kazandın!' : 'Oyun bitti'}</Text>
        {h ? <Text style={styles.ovSub}>Son el: {finText(v, (s) => (s === null ? '—' : nameOf(s)))}</Text> : null}
        <View style={wide ? styles.ovGrid : styles.ovList}>
        {order.map((s, i) => (
          <View key={s} style={[styles.ovRowHead, styles.endRow, wide && styles.ovRowWide, (v.winner ?? []).includes(s) && styles.endWin]}>
            <Text style={styles.endRank}>{i + 1}</Text>
            <Text style={styles.ovName} numberOfLines={1}>
              {nameOf(s)}
            </Text>
            <Text style={styles.ovTotal}>
              {v.scores?.[String(s)] ?? 0} {is101 ? 'ceza' : 'puan'}
            </Text>
          </View>
        ))}
        </View>
        {note ? <Text style={styles.ovNote}>{note}</Text> : null}
        <View style={[styles.endBtns, wide && styles.endBtnsWide]}>
          {v.next_room && v.me.is_player ? (
            <ActBtn label="Yeni oyuna geç" icon="refresh" primary onPress={() => onNext(v.next_room as string)} />
          ) : !v.remote && v.me.is_player ? (
            <ActBtn label="Aynı masayla yeni oyun" icon="refresh" primary busy={busy} onPress={onRematch} />
          ) : v.remote ? (
            <ActBtn label="Yeni masa ara" icon="search" primary onPress={onSearch} />
          ) : null}
          <ActBtn label="Oyunlara dön" icon="arrow-back" onPress={onBack} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  selfCenter: { alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  hBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  hMid: { flex: 1, alignItems: 'center' },
  hTitle: { color: OK.text, fontFamily: fonts.black, fontSize: 17 },
  hSub: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  centerText: { color: OK.text, fontFamily: fonts.semi, fontSize: 15, textAlign: 'center' },
  table: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: OK.feltEdge,
    padding: 8,
    justifyContent: 'space-between',
    minHeight: 250,
  },
  tRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tRowMid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  tCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  side: { width: 108, alignItems: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deckRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  deck: { alignItems: 'center', padding: 4, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  ind: { alignItems: 'center' },
  zoneActive: { borderColor: OK.glow, backgroundColor: 'rgba(34,211,197,0.12)' },
  zoneHot: { borderColor: OK.gold, backgroundColor: 'rgba(255,201,60,0.18)' },
  zoneLabel: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11, marginTop: 3 },
  zoneLabelOn: { color: OK.glow, fontFamily: fonts.extra },
  okeyLine: { color: OK.gold, fontFamily: fonts.extra, fontSize: 10.5 },
  midBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 99,
    backgroundColor: 'rgba(4,20,24,0.65)',
    borderWidth: 1,
    borderColor: OK.glow,
  },
  midBtnText: { color: OK.text, fontFamily: fonts.extra, fontSize: 12.5 },
  feed: { color: OK.gold, fontFamily: fonts.semi, fontSize: 11.5, textAlign: 'center' },
  turnBar: { marginHorizontal: 10, marginTop: 6, gap: 3 },
  turnBarL: { width: 190, gap: 3 },
  actionsScrollL: { flex: 1 },
  hBtnS: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,22,36,0.6)' },
  // Yatay masa (101 Okey Plus düzeni)
  pTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  pTopSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pTopRight: { justifyContent: 'flex-end' },
  pTopMid: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 13, flexShrink: 1 },
  pMid: { flexDirection: 'row' },
  pCol: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  pColMid: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pCenter: { flex: 1 },
  pTable: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  pMelds: { flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start', padding: 3, gap: 3, columnGap: 6 },
  pMeldWrap: { alignSelf: 'flex-start' },
  pMeld: { flexDirection: 'row', borderRadius: 4, borderWidth: 1.5, borderColor: 'transparent' },
  pMeldFits: { borderColor: '#4ADE80' },
  pMeldHot: { borderColor: OK.gold, backgroundColor: 'rgba(255,201,60,0.25)' },
  pExpand: {
    position: 'absolute',
    right: 4,
    top: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(8,22,36,0.8)',
  },
  pExpandText: { color: '#CFE6F5', fontFamily: fonts.extra, fontSize: 10 },
  pFeed: { position: 'absolute', left: 6, bottom: 4, right: 6, color: OK.gold, fontFamily: fonts.semi, fontSize: 11 },
  pFeedOkey: { position: 'relative', alignSelf: 'center', maxWidth: 220, textAlign: 'center' },
  pPairsHint: { position: 'absolute', top: 6, left: 0, right: 0, textAlign: 'center', color: 'rgba(207,230,245,0.45)', fontFamily: fonts.extra, fontSize: 10 },
  pMode: { alignItems: 'stretch', justifyContent: 'center', gap: 4 },
  pIndRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 6, marginTop: 2 },
  pIndBox: { alignItems: 'center' },
  pDeck: { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: 'transparent', padding: 1 },
  pTiny: { color: '#CFE6F5', fontFamily: fonts.semi, fontSize: 9.5, marginTop: 1 },
  pOkey: { color: OK.gold, fontFamily: fonts.extra, fontSize: 10, textAlign: 'center' },
  pDig: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pDigV: { flexDirection: 'column', gap: 1 },
  pColRow: { flexDirection: 'row', gap: 3 },
  pDigLabel: { color: '#CFE6F5', fontFamily: fonts.extra, fontSize: 10 },
  pMe: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pMeLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  pActScroll: { flexGrow: 0, flexShrink: 1 },
  pActs: { gap: 5, alignItems: 'center' },
  pMeRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pBubble: {
    minWidth: 34,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#B3202E',
    borderWidth: 1.5,
    borderColor: '#FF8A94',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pBubbleLow: { backgroundColor: '#E01E2E' },
  pBubbleText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 15 },
  pHint: { flex: 1, color: '#CFE6F5', fontFamily: fonts.semi, fontSize: 11 },
  pHintMe: { color: '#FFFFFF', fontFamily: fonts.extra },
  pBottom: { flexDirection: 'row', alignItems: 'center' },
  pBtnCol: { alignItems: 'center', justifyContent: 'center' },
  pRackBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  turnTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  turnFill: { height: 5, backgroundColor: OK.muted },
  turnFillMe: { backgroundColor: OK.glow },
  turnFillLow: { backgroundColor: OK.danger },
  turnText: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12, textAlign: 'center' },
  turnTextMe: { color: OK.glow, fontFamily: fonts.extra },
  actionsScroll: { flexGrow: 0, flexShrink: 0 },
  actions: { paddingHorizontal: 8, paddingVertical: 6, gap: 6, alignItems: 'center' },
  actionsEmpty: { height: 8 },
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  actPrimary: { backgroundColor: OK.glow, borderColor: OK.glow },
  actDanger: { backgroundColor: 'rgba(255,84,112,0.85)', borderColor: OK.danger },
  actSmall: { paddingVertical: 7, paddingHorizontal: 10 },
  actText: { fontFamily: fonts.extra, fontSize: 13 },
  actTextSmall: { fontSize: 11.5 },
  rackWrap: { paddingHorizontal: 6, paddingBottom: 4, gap: 4 },
  meLine: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11.5, textAlign: 'center' },
  watch: { color: OK.muted, fontFamily: fonts.semi, fontSize: 13, textAlign: 'center', padding: 16 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(14,74,74,0.96)',
    borderWidth: 1,
    borderColor: OK.glow,
    zIndex: 60,
    elevation: 14,
  },
  toastDanger: { backgroundColor: 'rgba(120,20,40,0.96)', borderColor: OK.danger },
  toastText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 13, flex: 1 },
  // Bekleme odası
  lobby: { padding: 16, gap: 12, paddingBottom: 40 },
  codeBox: { alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: 'rgba(34,211,197,0.12)', borderWidth: 1, borderColor: OK.glow },
  codeLabel: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12 },
  code: { color: OK.text, fontFamily: fonts.black, fontSize: 32, letterSpacing: 6 },
  codeHint: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11.5, textAlign: 'center' },
  tableBox: { height: 250, marginVertical: 4 },
  tableFelt: {
    position: 'absolute',
    left: '25%',
    right: '25%',
    top: 62,
    bottom: 62,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: OK.feltEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableFeltText: { color: OK.muted, fontFamily: fonts.extra, fontSize: 14 },
  seat: {
    position: 'absolute',
    width: 120,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(4,20,24,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,201,194,0.35)',
    alignItems: 'center',
  },
  seatMe: { borderColor: OK.glow, backgroundColor: 'rgba(34,211,197,0.16)' },
  seatBottom: { bottom: 0, left: '50%', marginLeft: -60 },
  seatTop: { top: 0, left: '50%', marginLeft: -60 },
  seatLeft: { left: 0, top: '50%', marginTop: -30 },
  seatRight: { right: 0, top: '50%', marginTop: -30 },
  seatNo: { color: OK.gold, fontFamily: fonts.black, fontSize: 13 },
  seatName: { color: OK.text, fontFamily: fonts.extra, fontSize: 12.5 },
  seatEmpty: { color: OK.muted },
  seatHint: { color: OK.glow, fontFamily: fonts.semi, fontSize: 10.5 },
  seatTeam: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5 },
  lobbyHint: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  optGroup: { gap: 6 },
  optTitle: { color: OK.text, fontFamily: fonts.extra, fontSize: 13 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderColor: 'rgba(156,201,194,0.35)' },
  optOn: { backgroundColor: OK.glow, borderColor: OK.glow },
  optText: { color: OK.text, fontFamily: fonts.semi, fontSize: 13 },
  optTextOn: { color: '#04211F', fontFamily: fonts.extra },
  lobbyBtns: { gap: 8, alignItems: 'center', marginTop: 4 },
  // Pencereler
  ruleRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, alignItems: 'flex-start' },
  ruleText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  ruleLead: { fontFamily: fonts.extra },
  sheetEmpty: { textAlign: 'center', padding: 16 },
  meldGroup: { gap: 6, marginBottom: 10 },
  meldOwner: { fontFamily: fonts.extra, fontSize: 13 },
  meldList: { gap: 6 },
  sRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,140,150,0.4)', paddingVertical: 6 },
  sTotal: { borderBottomWidth: 0 },
  sCell: { flex: 1, textAlign: 'center', fontSize: 13 },
  sHand: { flex: 0.6 },
  sHead: { fontFamily: fonts.extra, fontSize: 12 },
  sFin: { fontFamily: fonts.black, color: '#0E9F93' },
  // El sonu / oyun sonu
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(3,14,18,0.86)', zIndex: 40, elevation: 10 },
  overlayCard: { padding: 18, gap: 10, paddingTop: 60, paddingBottom: 40 },
  overlayWide: { paddingTop: 14, paddingBottom: 16, gap: 8, width: '100%', maxWidth: 820, alignSelf: 'center' },
  ovList: { gap: 10 },
  ovGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  ovRowWide: { width: '49.3%' },
  ovTitle: { color: OK.text, fontFamily: fonts.black, fontSize: 24, textAlign: 'center' },
  ovSub: { color: OK.gold, fontFamily: fonts.extra, fontSize: 14, textAlign: 'center' },
  ovNote: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12.5, textAlign: 'center' },
  ovRow: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(14,74,74,0.6)', gap: 4 },
  ovRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ovName: { flex: 1, color: OK.text, fontFamily: fonts.extra, fontSize: 14 },
  ovDelta: { color: '#34D399', fontFamily: fonts.black, fontSize: 14, minWidth: 48, textAlign: 'right' },
  ovLoss: { color: '#FF8FA3' },
  ovTotal: { color: OK.gold, fontFamily: fonts.black, fontSize: 14, minWidth: 64, textAlign: 'right' },
  ovDetail: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11.5 },
  remRow: { flexDirection: 'row', flexWrap: 'wrap' },
  finGroups: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  finGroup: { flexDirection: 'row' },
  endRow: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(14,74,74,0.6)' },
  endWin: { borderWidth: 1.5, borderColor: OK.gold },
  endRank: { color: OK.gold, fontFamily: fonts.black, fontSize: 16, width: 22 },
  endBtns: { gap: 8, alignItems: 'center', marginTop: 8 },
  endBtnsWide: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
});

