import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { EventCellMark } from '@/lib/events';
import type { DensityCell } from '@/lib/map';
import type { GameCellMark } from '@/lib/rooms';
import { TREASURE_COLORS, type Difficulty } from '@/lib/treasure';
import { cellName } from '@/lib/cellNames';
import {
  BOUNDS,
  cellCenter,
  cellOfXY,
  DISTRICT_LABELS,
  HEX_INSET,
  HEX_SIZE,
  hexHalfPath,
  hexPath,
  isLand,
  LAND_CELLS,
  LAND_TILES,
  OUTLINE_PATH,
  type Cell,
  type Tile,
} from '@/lib/hex';
import { colors, fonts, isLight } from '@/theme';

/** Seviye renkleri: 1 hareketli, 2 daha hareketli, 3 en hareketli */
export const LEVEL_COLORS = {
  1: 'rgba(255, 92, 122, 0.4)',
  2: 'rgba(255, 92, 122, 0.7)',
  3: '#FF5C7A',
} as const;
// Harita zemini temaya göre değişir; üstteki katman renkleri (etkinlik, oyun, yoğunluk, 41. Kat Özel) iki temada da aynıdır
export const LAND_FILL = isLight ? '#D6E2EB' : '#1B2440';
export const LAND_STROKE = isLight ? '#A9BDCC' : '#2C385C';
export const SEA = isLight ? '#B7CFE0' : '#0E1424';
/** Yakınlaşınca ızgara çizgisi */
const GRID_STROKE = isLight ? 'rgba(11, 31, 46, 0.22)' : 'rgba(244, 246, 251, 0.3)';
/** İlçe adlarının yazı rengi (altındaki kontur SEA rengindedir) */
const DISTRICT_TEXT = isLight ? 'rgba(11, 31, 46, 0.85)' : 'rgba(244, 246, 251, 0.9)';
/** Etkinlik katmanı: yoğunluk renginden (pembe-kırmızı) ve seçim renginden (sarı) ayrı bir turkuaz */
export const EVENT_COLOR = colors.event;
/** Oyun katmanı: etkinlikten (turkuaz) ve yoğunluktan (pembe) ayrı bir açık mor. Etkinlikle aynı petekte çerçeve ikiye bölünür. */
export const GAME_COLOR = colors.game;
/** Mekân (sponsor) peteği: peteğin alt kısmında küçük mercan nokta */
export const VENUE_COLOR = colors.venue;
/** 41. Kat Özel (moderatörün etkinliği ya da oyunu): altın sarısı petek ve yıldız */
export const OFFICIAL_COLOR = '#FFC83D';
/** Seçili petek: etkinlik (turkuaz) ve yoğunluk (pembe) katmanlarından ayrılsın diye sarı (arayüzün ana renginden bağımsız) */
const SELECT_COLOR = '#FFB020';
/** En yakın yakınlaşmada yazılan petek adlarının rengi (turkuaz; açık temada okunsun diye koyu turkuaz) */
const NAME_COLOR = isLight ? '#0B7F76' : '#35D6C3';
const MARKER_R = 10;
/** Dokunulan peteğin üst yüzünün yükselme miktarı (ekran pikseli) */
const LIFT_PX = 3;

const MAX_ZOOM = 36; // kapsayıcı ölçeğin katı
const TAP_SLOP = 8;
/** Bir petek ekranda bundan küçükse (px) 5 binlik petek ızgarası hiç çizilmez; kara, ilçe sınırlarından boyanır. */
const GRID_MIN_HEX_PX = 6;
/** Açılış görünümünde ekrana sığdırılan ilçeler */
const HOME_DISTRICTS = ['Körfez', 'Derince', 'Başiskele', 'Gölcük'];
const SQ3 = Math.sqrt(3);

type View2 = { scale: number; tx: number; ty: number };

/** Dokunma işleyicilerinin okuduğu güncel değerler. Ekran çizimi bunları okumaz; yalnızca olay işleyicileri. */
class LiveState {
  view: View2 | null = null;
  w = 0;
  h = 0;
  topInset = 0;
  bottomInset = 0;
  frame = 0;
  onSelect: ((cell: Cell | null) => void) | null = null;
  update(patch: Partial<Pick<LiveState, 'view' | 'w' | 'h' | 'topInset' | 'bottomInset' | 'frame' | 'onSelect'>>) {
    Object.assign(this, patch);
  }
}

/** Bütün Kocaeli ekrana sığar */
function fitView(w: number, h: number): View2 {
  const bw = BOUNDS.maxX - BOUNDS.minX;
  const bh = BOUNDS.maxY - BOUNDS.minY;
  const scale = Math.min(w / bw, h / bh) * 0.97;
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
  const cy = -(BOUNDS.minY + BOUNDS.maxY) / 2;
  return { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
}

/**
 * Açılış görünümü: Körfez, Derince, Başiskele ve Gölcük adları ekranda görünsün diye o bölgeye yakınlaşır.
 * `top` ve `bottom`, haritanın üstüne/altına binen katmanların (başlık, renk açıklaması) yüksekliğidir.
 */
function homeView(w: number, h: number, top: number, bottom: number): View2 {
  const pts = DISTRICT_LABELS.filter((l) => HOME_DISTRICTS.includes(l.name));
  if (pts.length === 0) return fitView(w, h);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = 64; // ilçe adı yazısı kenara taşmasın
  const padTop = top + 36;
  const padBottom = bottom + 36;
  const availW = Math.max(w - 2 * padX, 80);
  const availH = Math.max(h - padTop - padBottom, 80);
  const base = fitView(w, h).scale;
  const scale = Math.min(availW / Math.max(maxX - minX, 1000), availH / Math.max(maxY - minY, 1000), base * MAX_ZOOM);
  const cx = (minX + maxX) / 2;
  const cy = -(minY + maxY) / 2;
  return {
    scale,
    tx: padX + availW / 2 - cx * scale,
    ty: padTop + availH / 2 - cy * scale,
  };
}

/** Bir peteği (yaklaşık 70 px genişliğinde görünecek kadar yakınlaşarak) boş alanın ortasına getirir */
function focusView(
  cell: Cell,
  w: number,
  h: number,
  top: number,
  bottom: number,
  current: View2 | null,
  farPx?: number,
): View2 {
  const c = cellCenter(cell.q, cell.r);
  const base = fitView(w, h).scale;
  // farPx verilirse petek ekranda bu genişlikte görünür (biraz uzaktan, çevresi de görünsün diye)
  const want = (farPx ?? 70) / (HEX_SIZE * SQ3);
  const scale = farPx
    ? Math.min(base * MAX_ZOOM, Math.max(base, want))
    : Math.min(base * MAX_ZOOM, Math.max(current?.scale ?? base, want));
  const cy = top + (h - top - bottom) / 2;
  return clampView({ scale, tx: w / 2 - c.x * scale, ty: cy + c.y * scale }, w, h);
}

/** Verilen peteklerin hepsi (okları da sığacak kadar payla) boş alanda görünsün */
function cellsView(
  cells: readonly Cell[],
  w: number,
  h: number,
  top: number,
  bottom: number,
  current: View2 | null,
): View2 {
  if (cells.length === 1) return focusView(cells[0], w, h, top, bottom, current, 46);
  const pts = cells.map((c) => cellCenter(c.q, c.r));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = 56;
  const padTop = top + 60; // ok petekten yukarı taşar
  const padBottom = bottom + 24;
  const availW = Math.max(w - 2 * padX, 80);
  const availH = Math.max(h - padTop - padBottom, 80);
  const base = fitView(w, h).scale;
  const scale = Math.max(
    base,
    Math.min(availW / Math.max(maxX - minX, 1), availH / Math.max(maxY - minY, 1), 46 / (HEX_SIZE * SQ3)),
  );
  const cx = (minX + maxX) / 2;
  const cy = -(minY + maxY) / 2;
  return clampView({ scale, tx: padX + availW / 2 - cx * scale, ty: padTop + availH / 2 - cy * scale }, w, h);
}

/** Haritanın en az bir kısmı ekranda kalsın */
function clampView(v: View2, w: number, h: number): View2 {
  const left = BOUNDS.minX * v.scale + v.tx;
  const right = BOUNDS.maxX * v.scale + v.tx;
  const top = -BOUNDS.maxY * v.scale + v.ty;
  const bottom = -BOUNDS.minY * v.scale + v.ty;
  const m = 0.15;
  let { tx, ty } = v;
  if (right < w * m) tx += w * m - right;
  if (left > w * (1 - m)) tx -= left - w * (1 - m);
  if (bottom < h * m) ty += h * m - bottom;
  if (top > h * (1 - m)) ty -= top - h * (1 - m);
  return { scale: v.scale, tx, ty };
}

/** Ekrana (ve biraz çevresine) değen kara parçaları */
function tilesInView(v: View2, w: number, h: number): Tile[] {
  const m = 0.35;
  const x0 = (-v.tx - w * m) / v.scale;
  const x1 = (w - v.tx + w * m) / v.scale;
  const y0 = (-v.ty - h * m) / v.scale;
  const y1 = (h - v.ty + h * m) / v.scale;
  return LAND_TILES.filter((t) => t.maxX >= x0 && t.minX <= x1 && t.maxY >= y0 && t.minY <= y1);
}

/** Tek bir kara parçası (en çok ~150 petek). Yol değişmez, bu yüzden kaydırırken yeniden çizilmez. */
const TileLayer = memo(function TileLayer({ d }: { d: string }) {
  return <Path d={d} fill={LAND_FILL} />;
});

/** Uzaklaşınca (ızgara çizilmezken) kara: ilçe sınırlarının içi boyanır */
const OutlineFill = memo(function OutlineFill() {
  return <Path d={OUTLINE_PATH} fill={LAND_FILL} />;
});

/** Renkli petekler. Yalnızca veri yenilenince değişir. */
const LevelLayers = memo(function LevelLayers({ levelPaths }: { levelPaths: [string, string, string] }) {
  return (
    <>
      <Path d={levelPaths[0]} fill={LEVEL_COLORS[1]} />
      <Path d={levelPaths[1]} fill={LEVEL_COLORS[2]} />
      <Path d={levelPaths[2]} fill={LEVEL_COLORS[3]} />
    </>
  );
});

type Props = {
  density: readonly DensityCell[];
  selected: Cell | null;
  onSelect: (cell: Cell | null) => void;
  /** Haritanın üstüne binen katmanın yüksekliği (açılış görünümü bunun altına ortalanır) */
  topInset?: number;
  /** Haritanın altına binen katmanın yüksekliği */
  bottomInset?: number;
  /** Yakınlaştır düğmelerinin altına eklenecek düğmeler (ör. konumum) */
  extraControls?: ReactNode;
  /** Düğme sütununun en üstüne eklenecek düğmeler (ör. bildirimler) */
  leadingControls?: ReactNode;
  /** true ise düğme sütunu gizlenir (ör. petek menüsü açıkken) */
  hideControls?: boolean;
  /** Düğme sütununun üstten uzaklığı */
  controlsTop?: number;
  /** Verilirse düğme sütunu alttan bu uzaklıkta durur (üstten değil) */
  controlsBottom?: number;
  /** Etkinlik olan petekler. Yoğunluktan bağımsız ayrı bir katmandır: peteğin çizgisi ve sayı işareti çizilir, rengi değişmez. */
  eventCells?: readonly EventCellMark[];
  /** Açık oyun odası olan petekler (oyun odası kurulurken seçilen bölge). Aynı petekte etkinlik de varsa çerçeve iki renge bölünür. */
  gameCells?: readonly GameCellMark[];
  /** Mekân (sponsor) olan petekler: peteğin alt kısmındaki küçük noktayla ayrılır */
  venueCells?: readonly Cell[];
  /** 41. Kat Özel etkinlik ya da oyun olan petekler: altın sarısı boyanır, ortasında yıldız çıkar */
  officialCells?: readonly Cell[];
  /** Verilirse harita bu peteğe odaklanır (her yeni `key` yeniden odaklar) */
  focus?: { cell: Cell; key: number; farPx?: number } | null;
  /** Hazine Avı: hazinenin olduğu petekler zorluk rengiyle boyanır, üstünde büyüteç çıkar. İmkânsız hazinede
   *  çevresindeki 6 petek de bir ton açık boyanır. */
  treasureCells?: readonly { q: number; r: number; difficulty: Difficulty }[];
  /** Dokunulan petek: 3 boyutlu yükselmiş görünür, üstünde düğme (ör. “İNCELE”) çıkar */
  raised?: Cell | null;
  raisedLabel?: string;
  onRaisedPress?: () => void;
  /** Büyüteç menüsü: bu peteklerin üstünde aşağı-yukarı zıplayan ok çıkar; her yeni `key` haritayı hepsini gösterecek şekilde sığdırır */
  pointers?: { cells: readonly Cell[]; key: number } | null;
  /** Görselli öne çıkan etkinlikler (Konser & Festival, 41. Kat Özel, İşbirliği): peteğin üstünde küçük kart görseller */
  imageMarks?: readonly { q: number; r: number; uris: readonly string[]; ids: readonly string[] }[];
  /** Görsel karta dokununca: o petekteki görselli etkinliklerin kimlikleri */
  onImagePress?: (ids: readonly string[]) => void;
  /** Ana harita: en yakın iki basamakta göstergeler gizlenir, yalnızca petek adları görünür */
  plainCloseUp?: boolean;
};

const NEIGHBORS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const DIFF_ORDER: Difficulty[] = ['kolay', 'orta', 'zor', 'imkansiz'];

const webTouch = Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle) : null;

/**
 * Kocaeli'nin petek haritası. Kendi çizimimizdir (altlık harita yok). Üst kapsayıcının tamamını kaplar.
 * Tek parmakla kaydırılır, iki parmakla yakınlaştırılır; düğmeler de vardır.
 *
 * Hafif çizim: uzaklaşınca 5 binlik petek ızgarası çizilmez (kara, ilçe sınırlarından boyanır); yakınlaşınca yalnızca
 * ekrana değen kara parçaları çizilir. Parmak hareketi her ekran karesinde en çok bir kez çizime yansır.
 */
export function HoneycombMap({
  density,
  selected,
  onSelect,
  topInset = 0,
  bottomInset = 0,
  extraControls,
  leadingControls,
  hideControls = false,
  controlsTop = 10,
  controlsBottom,
  eventCells,
  gameCells,
  venueCells,
  officialCells,
  focus,
  treasureCells,
  raised = null,
  raisedLabel = 'İNCELE',
  onRaisedPress,
  pointers = null,
  imageMarks,
  onImagePress,
  plainCloseUp = false,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View2 | null>(null);
  // Dokunma işleyicilerinin okuduğu güncel değerler (ekran çizimi bunlardan okumaz)
  const [live] = useState(() => new LiveState());
  useEffect(() => {
    live.update({ onSelect, topInset, bottomInset });
  });
  useEffect(
    () => () => {
      if (live.frame) cancelAnimationFrame(live.frame);
    },
    [live],
  );

  const levelPaths = useMemo<[string, string, string]>(() => {
    const by: Cell[][] = [[], [], []];
    for (const d of density) {
      if (isLand(d.cell_q, d.cell_r) && d.level >= 1 && d.level <= 3) {
        by[d.level - 1].push({ q: d.cell_q, r: d.cell_r });
      }
    }
    return [hexPath(by[0], HEX_INSET), hexPath(by[1], HEX_INSET), hexPath(by[2], HEX_INSET)];
  }, [density]);

  // Çerçeveler: yalnızca etkinlik = turkuaz, yalnızca oyun = mor, ikisi birden = sol yarı mor + sağ yarı turkuaz
  const frames = useMemo(() => {
    const land = (list: readonly Cell[] | undefined) => (list ?? []).filter((c) => isLand(c.q, c.r));
    const evs = land(eventCells);
    const gms = land(gameCells);
    const evKeys = new Set(evs.map((c) => `${c.q},${c.r}`));
    const gmKeys = new Set(gms.map((c) => `${c.q},${c.r}`));
    const evOnly = evs.filter((c) => !gmKeys.has(`${c.q},${c.r}`));
    const gmOnly = gms.filter((c) => !evKeys.has(`${c.q},${c.r}`));
    const both = evs.filter((c) => gmKeys.has(`${c.q},${c.r}`));
    return {
      event: evOnly.length > 0 ? hexPath(evOnly, HEX_INSET) : '',
      game: gmOnly.length > 0 ? hexPath(gmOnly, HEX_INSET) : '',
      bothEvent: both.length > 0 ? hexHalfPath(both, 'right', HEX_INSET) : '',
      bothGame: both.length > 0 ? hexHalfPath(both, 'left', HEX_INSET) : '',
    };
  }, [eventCells, gameCells]);

  // Mekân petekleri (peteğin alt kısmında küçük mercan nokta) ve 41. Kat Özel petekler (altın sarısı dolgu + yıldız)
  const venueList = useMemo(() => {
    const seen = new Set<string>();
    return (venueCells ?? []).filter((c) => {
      const k = `${c.q},${c.r}`;
      if (!isLand(c.q, c.r) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [venueCells]);
  const officialList = useMemo(() => {
    const seen = new Set<string>();
    return (officialCells ?? []).filter((c) => {
      const k = `${c.q},${c.r}`;
      if (!isLand(c.q, c.r) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [officialCells]);
  const officialPath = useMemo(() => (officialList.length > 0 ? hexPath(officialList, HEX_INSET) : ''), [officialList]);
  // Hazine petekleri: zorluk başına bir yol; imkânsız hazinenin çevresi ayrı (daha açık) bir yol
  const treasureList = useMemo(() => (treasureCells ?? []).filter((c) => isLand(c.q, c.r)), [treasureCells]);
  const treasurePaths = useMemo(() => {
    const own = new Set(treasureList.map((c) => `${c.q},${c.r}`));
    const by: Record<Difficulty, Cell[]> = { kolay: [], orta: [], zor: [], imkansiz: [] };
    const halo: Cell[] = [];
    const haloSeen = new Set<string>();
    for (const c of treasureList) {
      by[c.difficulty].push({ q: c.q, r: c.r });
      if (c.difficulty === 'imkansiz') {
        for (const [dq, dr] of NEIGHBORS) {
          const n = { q: c.q + dq, r: c.r + dr };
          const k = `${n.q},${n.r}`;
          if (!isLand(n.q, n.r) || own.has(k) || haloSeen.has(k)) continue;
          haloSeen.add(k);
          halo.push(n);
        }
      }
    }
    return {
      halo: halo.length > 0 ? hexPath(halo, HEX_INSET) : '',
      cells: DIFF_ORDER.map((d) => ({ d, path: by[d].length > 0 ? hexPath(by[d], HEX_INSET) : '' })),
    };
  }, [treasureList]);

  // Sayı işaretleri: petek başına etkinlik ve oyun sayısı
  const markers = useMemo(() => {
    const by = new Map<string, { q: number; r: number; event: number; game: number }>();
    for (const e of eventCells ?? []) {
      if (!isLand(e.q, e.r)) continue;
      by.set(`${e.q},${e.r}`, { q: e.q, r: e.r, event: e.count, game: 0 });
    }
    for (const g of gameCells ?? []) {
      if (!isLand(g.q, g.r)) continue;
      const cur = by.get(`${g.q},${g.r}`);
      if (cur) cur.game = g.count;
      else by.set(`${g.q},${g.r}`, { q: g.q, r: g.r, event: 0, game: g.count });
    }
    return [...by.values()];
  }, [eventCells, gameCells]);

  // Yeni bir odak isteği gelince harita o peteğe kayar
  const focusKey = focus?.key;
  const focusQ = focus?.cell.q;
  const focusR = focus?.cell.r;
  const focusFar = focus?.farPx;
  useEffect(() => {
    if (focusKey === undefined || focusQ === undefined || focusR === undefined) return;
    const id = requestAnimationFrame(() => {
      const { w, h } = live;
      if (w <= 0 || h <= 0) return;
      const next = focusView({ q: focusQ, r: focusR }, w, h, live.topInset, live.bottomInset, live.view, focusFar);
      live.update({ view: next });
      setViewState(next);
    });
    return () => cancelAnimationFrame(id);
  }, [focusKey, focusQ, focusR, focusFar, live]);

  // Büyüteç menüsünden bir seçim gelince: oklu peteklerin hepsi ekrana sığar
  const pointerKey = pointers?.key;
  const pointerCells = pointers?.cells;
  useEffect(() => {
    if (pointerKey === undefined || !pointerCells || pointerCells.length === 0) return;
    const id = requestAnimationFrame(() => {
      const { w, h } = live;
      if (w <= 0 || h <= 0) return;
      const next = cellsView(pointerCells, w, h, live.topInset, live.bottomInset, live.view);
      live.update({ view: next });
      setViewState(next);
    });
    return () => cancelAnimationFrame(id);
  }, [pointerKey, pointerCells, live]);

  /** Görünümü hemen günceller; ekrana yansıması her karede en çok bir kez olur. */
  function setView(v: View2 | null) {
    live.update({ view: v });
    if (!v) {
      setViewState(null);
      return;
    }
    if (live.frame) return;
    const id = requestAnimationFrame(() => {
      live.update({ frame: 0 });
      setViewState(live.view);
    });
    live.update({ frame: id });
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height: h } = e.nativeEvent.layout;
    if (width <= 0 || h <= 0) return;
    live.update({ w: width, h });
    setSize({ w: width, h });
    if (!live.view) {
      const v = focus
        ? focusView(focus.cell, width, h, live.topInset, live.bottomInset, null, focus.farPx)
        : homeView(width, h, live.topInset, live.bottomInset);
      live.update({ view: v });
      setViewState(v);
    }
  }

  const fitScale = size.w > 0 ? fitView(size.w, size.h).scale : 0;

  function zoomBy(factor: number) {
    const v = live.view;
    const { w, h } = live;
    if (!v) return;
    const base = fitView(w, h).scale;
    const scale = Math.min(base * MAX_ZOOM, Math.max(base * 0.9, v.scale * factor));
    const k = scale / v.scale;
    // ekranın ortası sabit kalsın
    const next = { scale, tx: w / 2 - (w / 2 - v.tx) * k, ty: h / 2 - (h / 2 - v.ty) * k };
    setView(clampView(next, w, h));
  }

  const [responder] = useState(() => {
    let startView: View2 | null = null;
    let startPts: { x: number; y: number }[] = [];
    let moved = 0;
    let startedAt = 0;
    let tapAt = { x: 0, y: 0 };

    const pts = (e: GestureResponderEvent) =>
      Array.from(e.nativeEvent.touches ?? []).map((t) => ({ x: t.locationX, y: t.locationY }));
    const begin = (e: GestureResponderEvent) => {
      startView = live.view;
      startPts = pts(e);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        moved = 0;
        startedAt = Date.now();
        begin(e);
        tapAt = startPts[0] ?? { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      },
      onPanResponderMove: (e) => {
        const now = pts(e);
        if (!startView || now.length === 0) return;
        if (now.length !== startPts.length) {
          // parmak sayısı değişti: bu andan itibaren yeniden başla
          begin(e);
          moved = 99;
          return;
        }
        const { w, h } = live;
        if (now.length >= 2 && startPts.length >= 2) {
          const d0 = Math.hypot(startPts[0].x - startPts[1].x, startPts[0].y - startPts[1].y) || 1;
          const d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
          const m0 = { x: (startPts[0].x + startPts[1].x) / 2, y: (startPts[0].y + startPts[1].y) / 2 };
          const m1 = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
          const base = fitView(w, h).scale;
          const scale = Math.min(base * MAX_ZOOM, Math.max(base * 0.9, startView.scale * (d1 / d0)));
          const mx = (m0.x - startView.tx) / startView.scale;
          const my = (m0.y - startView.ty) / startView.scale;
          moved = 99;
          setView(clampView({ scale, tx: m1.x - mx * scale, ty: m1.y - my * scale }, w, h));
        } else {
          const dx = now[0].x - startPts[0].x;
          const dy = now[0].y - startPts[0].y;
          moved = Math.max(moved, Math.hypot(dx, dy));
          if (moved >= TAP_SLOP) {
            setView(clampView({ ...startView, tx: startView.tx + dx, ty: startView.ty + dy }, w, h));
          }
        }
      },
      onPanResponderRelease: () => {
        const v = live.view;
        if (moved < TAP_SLOP && Date.now() - startedAt < 600 && v) {
          // dokunma: dokunulan peteği seç
          const x = (tapAt.x - v.tx) / v.scale;
          const y = -((tapAt.y - v.ty) / v.scale);
          const cell = cellOfXY(x, y);
          live.onSelect?.(isLand(cell.q, cell.r) ? cell : null);
        }
      },
    });
  });

  const sel = selected && view ? hexPath([selected]) : null;
  // Paket 33: en yakın iki yakınlaşma basamağında petekler sade görünür: yoğunluk, etkinlik/oyun işaretleri, hazine,
  // mekân, 41. Kat Özel ve ilçe adları gizlenir; yalnızca petek adları sarı yazıyla görünür (seçim ve İNCELE kalır)
  const plain = plainCloseUp && view !== null && fitScale > 0 && view.scale >= fitScale * CARDS_HIDE_ZOOM;
  // Petek adları yalnızca ekranda görünen peteklerde yazılır. Ekranın ortasındakiler tam okunur, kenara doğru
  // saydamlaşır; çok soluk kalacaklar hiç çizilmez (yakınlaşınca harita kasmasın diye).
  const nameCells: { c: Cell; x: number; y: number; o: number }[] = [];
  if (plain && view) {
    const m = HEX_SIZE * view.scale;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const reach = Math.max(1, Math.hypot(size.w, size.h) * 0.5);
    for (const c of LAND_CELLS) {
      const p = cellCenter(c.q, c.r);
      const x = p.x * view.scale + view.tx;
      const y = -p.y * view.scale + view.ty;
      if (x < -m || y < -m || x > size.w + m || y > size.h + m) continue;
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / reach);
      const o = Math.max(0, 1 - Math.pow(t, 1.6) * 1.1);
      if (o < 0.12) continue;
      nameCells.push({ c, x, y, o });
    }
  }
  const nameSize = view ? Math.max(8, Math.min(13, (HEX_SIZE * SQ3 * view.scale) / 7.5)) : 10;
  /** Yükselen (dokunulan) peteğin üstündeki işaretler (sayı, yıldız, büyüteç, mekân noktası, ad) yüzle birlikte kalkar */
  const liftOf = (q: number, r: number) => (raised && raised.q === q && raised.r === r ? LIFT_PX : 0);
  const raisedKey = raised ? `${raised.q},${raised.r}` : '';
  const raisedMarks = {
    official: raised !== null && officialList.some((o) => `${o.q},${o.r}` === raisedKey),
    event: raised !== null && (eventCells ?? []).some((e) => `${e.q},${e.r}` === raisedKey),
    game: raised !== null && (gameCells ?? []).some((g) => `${g.q},${g.r}` === raisedKey),
  };
  const px = (n: number) => (view ? n / view.scale : 0);
  // Yakınlaşınca petek ızgarası (yalnızca ekrandaki parçalar); uzaklaşınca kara ilçe sınırlarından boyanır
  const showGrid = view ? HEX_SIZE * SQ3 * view.scale >= GRID_MIN_HEX_PX : false;
  const tiles = view && showGrid ? tilesInView(view, size.w, size.h) : [];

  return (
    <View style={styles.wrap} onLayout={onLayout} testID="honeycomb-map">
      {view ? (
        <Svg width={size.w} height={size.h} style={styles.svg}>
          <G transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {showGrid ? null : <OutlineFill />}
            {tiles.map((t) => (
              <TileLayer key={t.key} d={t.path} />
            ))}
            {plain ? null : <LevelLayers levelPaths={levelPaths} />}
            {!plain && treasurePaths.halo ? (
              <Path
                d={treasurePaths.halo}
                fill="rgba(255, 255, 255, 0.28)"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={px(1.2)}
              />
            ) : null}
            {(plain ? [] : treasurePaths.cells).map((t) =>
              t.path ? (
                <Path
                  key={`tr-${t.d}`}
                  d={t.path}
                  fill={TREASURE_COLORS[t.d]}
                  fillOpacity={t.d === 'imkansiz' ? 0.78 : 0.55}
                  stroke={TREASURE_COLORS[t.d]}
                  strokeWidth={px(2.4)}
                  strokeLinejoin="round"
                />
              ) : null,
            )}
            {!plain && officialPath ? (
              <Path
                d={officialPath}
                fill="rgba(255, 200, 61, 0.55)"
                stroke={OFFICIAL_COLOR}
                strokeWidth={px(2.4)}
                strokeLinejoin="round"
              />
            ) : null}
            {!plain && frames.event ? (
              <Path d={frames.event} fill="none" stroke={EVENT_COLOR} strokeWidth={px(2.2)} strokeLinejoin="round" />
            ) : null}
            {!plain && frames.game ? (
              <Path d={frames.game} fill="none" stroke={GAME_COLOR} strokeWidth={px(2.2)} strokeLinejoin="round" />
            ) : null}
            {!plain && frames.bothGame ? (
              <Path
                d={frames.bothGame}
                fill="none"
                stroke={GAME_COLOR}
                strokeWidth={px(2.6)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {!plain && frames.bothEvent ? (
              <Path
                d={frames.bothEvent}
                fill="none"
                stroke={EVENT_COLOR}
                strokeWidth={px(2.6)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {raised && isLand(raised.q, raised.r) ? (
              <G>
                {/* Gölge ve yan yüz: petek yerden kalkmış gibi görünür */}
                <G transform={`translate(0 ${px(9)})`}>
                  <Path d={hexPath([raised], 1)} fill="rgba(0,0,0,0.55)" />
                </G>
                <G transform={`translate(0 ${px(4)})`}>
                  <Path d={hexPath([raised], 1)} fill="#B8860B" stroke="#8A6200" strokeWidth={px(1.2)} />
                </G>
                <G transform={`translate(0 ${px(-LIFT_PX)})`}>
                  <Path
                    d={hexPath([raised], 1)}
                    fill="rgba(255, 210, 90, 0.92)"
                    stroke="#FFF4C2"
                    strokeWidth={px(2.2)}
                    strokeLinejoin="round"
                  />
                  {/* Peteğin kendi işaretleri (41. Kat Özel, etkinlik / oyun çerçevesi) de yükselen yüzle birlikte kalkar */}
                  {!plain && raisedMarks.official ? (
                    <Path
                      d={hexPath([raised], HEX_INSET)}
                      fill="rgba(255, 200, 61, 0.55)"
                      stroke={OFFICIAL_COLOR}
                      strokeWidth={px(2.4)}
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {!plain && raisedMarks.event && raisedMarks.game ? (
                    <>
                      <Path
                        d={hexHalfPath([raised], 'left', HEX_INSET)}
                        fill="none"
                        stroke={GAME_COLOR}
                        strokeWidth={px(2.6)}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      <Path
                        d={hexHalfPath([raised], 'right', HEX_INSET)}
                        fill="none"
                        stroke={EVENT_COLOR}
                        strokeWidth={px(2.6)}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </>
                  ) : !plain && (raisedMarks.event || raisedMarks.game) ? (
                    <Path
                      d={hexPath([raised], HEX_INSET)}
                      fill="none"
                      stroke={raisedMarks.event ? EVENT_COLOR : GAME_COLOR}
                      strokeWidth={px(2.2)}
                      strokeLinejoin="round"
                    />
                  ) : null}
                </G>
              </G>
            ) : null}
            <Path
              d={OUTLINE_PATH}
              fill="none"
              stroke={showGrid ? GRID_STROKE : LAND_STROKE}
              strokeWidth={px(1.2)}
              strokeLinejoin="round"
            />
            {sel ? (
              <Path
                d={sel}
                fill="rgba(255, 176, 32, 0.22)"
                stroke={SELECT_COLOR}
                strokeWidth={px(2.4)}
                strokeLinejoin="round"
              />
            ) : null}
          </G>
          {(plain ? [] : DISTRICT_LABELS).map((l) => {
            // Küçük ilçelerin adı yalnızca yeterince yakınlaşınca yazılır (üst üste binmesin)
            const widthPx = Math.sqrt(l.areaKm2) * 1000 * view.scale;
            if (widthPx < 46) return null;
            const x = l.x * view.scale + view.tx;
            const y = -l.y * view.scale + view.ty;
            return (
              <G key={l.name}>
                <SvgText
                  x={x}
                  y={y}
                  fontSize={12}
                  fontFamily={fonts.extra}
                  fill="none"
                  stroke={SEA}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  textAnchor="middle"
                >
                  {l.name}
                </SvgText>
                <SvgText
                  x={x}
                  y={y}
                  fontSize={12}
                  fontFamily={fonts.extra}
                  fill={DISTRICT_TEXT}
                  textAnchor="middle"
                >
                  {l.name}
                </SvgText>
              </G>
            );
          })}
          {(plain ? [] : officialList).map((c) => {
            const p = cellCenter(c.q, c.r);
            const x = p.x * view.scale + view.tx;
            const y = -p.y * view.scale + view.ty - liftOf(c.q, c.r);
            if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) return null;
            // Sayı işareti olan petekte yıldız işaretin üstünde durur
            const hasMarker = markers.some((m) => m.q === c.q && m.r === c.r);
            return (
              <SvgText
                key={`st-${c.q},${c.r}`}
                x={x}
                y={hasMarker ? y - MARKER_R - 3 : y + 6}
                fontSize={hasMarker ? 14 : 17}
                fontFamily={fonts.black}
                fill={OFFICIAL_COLOR}
                stroke={SEA}
                strokeWidth={1.2}
                textAnchor="middle"
              >
                ★
              </SvgText>
            );
          })}
          {(plain ? [] : treasureList).map((c) => {
            const p = cellCenter(c.q, c.r);
            const x = p.x * view.scale + view.tx;
            const y = -p.y * view.scale + view.ty - liftOf(c.q, c.r);
            if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) return null;
            // Sayı işareti ya da yıldız olan petekte büyüteç aşağı kayar
            // Petek ekranda küçükse büyüteç çizilmez (petek rengi yeter); büyüteç peteğin içine sığacak boyutta kalır
            const hexR = HEX_SIZE * view.scale;
            if (hexR < 9) return null;
            const busy =
              markers.some((m) => m.q === c.q && m.r === c.r) || officialList.some((o) => o.q === c.q && o.r === c.r);
            const k = Math.min(1, hexR / 26);
            const rr = 4.5 * k;
            const cy = busy ? y + Math.min(hexR * 0.5, MARKER_R + 5) : y;
            const cx = x - rr * 0.35;
            const cyy = cy - rr * 0.35;
            const l0 = rr * 0.72;
            const l1 = rr * 1.75;
            const col = TREASURE_COLORS[c.difficulty];
            return (
              <G key={`tm-${c.q},${c.r}`}>
                <Line
                  x1={cx + l0}
                  y1={cyy + l0}
                  x2={cx + l1}
                  y2={cyy + l1}
                  stroke={SEA}
                  strokeWidth={3.6 * k + 1}
                  strokeLinecap="round"
                />
                <Line
                  x1={cx + l0}
                  y1={cyy + l0}
                  x2={cx + l1}
                  y2={cyy + l1}
                  stroke={col}
                  strokeWidth={2.2 * k + 0.4}
                  strokeLinecap="round"
                />
                <Circle cx={cx} cy={cyy} r={rr} fill={SEA} stroke={col} strokeWidth={1.8 * k + 0.4} />
              </G>
            );
          })}
          {(plain ? [] : venueList).map((c) => {
            const p = cellCenter(c.q, c.r);
            const hexR = HEX_SIZE * view.scale;
            const x = p.x * view.scale + view.tx;
            const y = -p.y * view.scale + view.ty - liftOf(c.q, c.r) + hexR * 0.68;
            if (x < -10 || y < -10 || x > size.w + 10 || y > size.h + 10) return null;
            const r = Math.max(2.6, Math.min(5, hexR * 0.12));
            return (
              <Circle
                key={`vn-${c.q},${c.r}`}
                cx={x}
                cy={y}
                r={r}
                fill={VENUE_COLOR}
                stroke={SEA}
                strokeWidth={Math.max(1, r * 0.35)}
              />
            );
          })}
          {(plain ? [] : markers).map((m) => {
            const c = cellCenter(m.q, m.r);
            const x = c.x * view.scale + view.tx;
            const y = -c.y * view.scale + view.ty - liftOf(m.q, m.r);
            // ekranın dışındaki işaretler çizilmez
            if (x < -2 * MARKER_R - 4 || y < -MARKER_R || x > size.w + 2 * MARKER_R + 4 || y > size.h + MARKER_R)
              return null;
            // Aynı petekte hem oyun hem etkinlik varsa işaretler yan yana durur: solda oyun (kare), sağda etkinlik (daire)
            const both = m.game > 0 && m.event > 0;
            const gx = both ? x - MARKER_R - 1 : x;
            const ex = both ? x + MARKER_R + 1 : x;
            return (
              <G key={`mk-${m.q},${m.r}`}>
                {m.game > 0 ? (
                  <>
                    <Rect
                      x={gx - MARKER_R}
                      y={y - MARKER_R}
                      width={2 * MARKER_R}
                      height={2 * MARKER_R}
                      rx={5}
                      fill={GAME_COLOR}
                      stroke={SEA}
                      strokeWidth={2}
                    />
                    <SvgText x={gx} y={y + 4} fontSize={11} fontFamily={fonts.black} fill="#190B45" textAnchor="middle">
                      {m.game > 9 ? '9+' : String(m.game)}
                    </SvgText>
                  </>
                ) : null}
                {m.event > 0 ? (
                  <>
                    <Circle cx={ex} cy={y} r={MARKER_R} fill={EVENT_COLOR} stroke={SEA} strokeWidth={2} />
                    <SvgText x={ex} y={y + 4} fontSize={11} fontFamily={fonts.black} fill="#06231F" textAnchor="middle">
                      {m.event > 9 ? '9+' : String(m.event)}
                    </SvgText>
                  </>
                ) : null}
              </G>
            );
          })}
          {nameCells.map(({ c, x, y, o }) => {
            const parts = cellName(c).split('-');
            const two = parts.length > 1;
            return (
              <G key={`nm-${c.q},${c.r}`} opacity={o}>
                {/* Düz renk yazı: kontur ve gölge yok */}
                {(two ? [parts[0], parts.slice(1).join('-')] : parts).map((t, i) => {
                  const ty =
                    y - liftOf(c.q, c.r) + (two ? (i === 0 ? -nameSize * 0.25 : nameSize * 0.95) : nameSize * 0.35);
                  return (
                    <SvgText
                      key={i}
                      x={x}
                      y={ty}
                      fontSize={nameSize}
                      fontFamily={fonts.extra}
                      fill={NAME_COLOR}
                      textAnchor="middle"
                    >
                      {t}
                    </SvgText>
                  );
                })}
              </G>
            );
          })}
        </Svg>
      ) : null}
      <View style={[StyleSheet.absoluteFill, webTouch]} {...responder.panHandlers} testID="honeycomb-touch" />
      {view && !plain && imageMarks && imageMarks.length > 0 ? (
        <ImageCards
          marks={imageMarks}
          view={view}
          w={size.w}
          h={size.h}
          onPress={onImagePress}
          hidden={fitScale > 0 && view.scale >= fitScale * CARDS_HIDE_ZOOM}
        />
      ) : null}
      {pointers && view && pointers.cells.length > 0 ? (
        <BouncingArrows key={pointers.key} cells={pointers.cells} view={view} w={size.w} h={size.h} />
      ) : null}
      {raised && view && onRaisedPress && isLand(raised.q, raised.r)
        ? (() => {
            const p = cellCenter(raised.q, raised.r);
            const x = p.x * view.scale + view.tx;
            const y = -p.y * view.scale + view.ty;
            const top = Math.max(4, Math.min(size.h - 30, y - HEX_SIZE * view.scale - 32));
            const left = Math.max(4, Math.min(size.w - 32, x - 14));
            return (
              <Pressable
                onPress={onRaisedPress}
                accessibilityRole="button"
                accessibilityLabel={raisedLabel}
                testID="map-inspect"
                hitSlop={10}
                style={({ pressed }) => [styles.inspect, { top, left }, pressed && styles.inspectPressed]}
              >
                <Ionicons name="eye" size={15} color="#1A1200" />
              </Pressable>
            );
          })()
        : null}
      {hideControls ? null : (
        <View
          style={[styles.buttons, controlsBottom !== undefined ? { bottom: controlsBottom } : { top: controlsTop }]}
          pointerEvents="box-none"
        >
          {leadingControls}
          <MapButton icon="add" label="Yakınlaştır" onPress={() => zoomBy(1.7)} testID="map-zoom-in" />
          <MapButton icon="remove" label="Uzaklaştır" onPress={() => zoomBy(1 / 1.7)} testID="map-zoom-out" />
          <MapButton
            icon="scan-outline"
            label="Tüm Kocaeli"
            onPress={() => {
              const { w, h } = live;
              setView(fitView(w, h));
              live.onSelect?.(null);
            }}
            testID="map-fit"
            disabled={!view || view.scale <= fitScale * 1.02}
          />
          {extraControls}
        </View>
      )}
    </View>
  );
}

const CARD_W = 50;
const CARD_H = 38;
/** Arkadaki kartlar sola kaydığı için kart yığınının solunda bırakılan boşluk */
const STACK_PAD = 20;
/** En yakın iki yakınlaşma basamağında (en yakın ve bir üstü) kartlar gizlenir; altındaki peteğe basmak kolaylaşır */
const CARDS_HIDE_ZOOM = MAX_ZOOM / 1.75;

/**
 * Peteğin üstünde küçük kart görseller. Bir petekte birden çok görselli etkinlik varsa kartlar arka arkaya, SOLA
 * doğru hafif kaydırılmış çerçeveler olarak dizilir (en çok 4) ve öndeki kartın köşesinde küçük sarı bir “+” olur.
 */
function ImageCards({
  marks,
  view,
  w,
  h,
  onPress,
  hidden = false,
}: {
  marks: readonly { q: number; r: number; uris: readonly string[]; ids: readonly string[] }[];
  view: View2;
  w: number;
  h: number;
  onPress?: (ids: readonly string[]) => void;
  /** Çok yakınlaşınca gizlenir */
  hidden?: boolean;
}) {
  const hexR = HEX_SIZE * view.scale;
  // Çok uzaktayken (petek ekranda çok küçükken) ve çok yakınken kartlar çizilmez
  if (hexR < 2.2 || hidden) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="map-image-cards">
      {marks.map((m) => {
        if (!isLand(m.q, m.r) || m.uris.length === 0) return null;
        const p = cellCenter(m.q, m.r);
        const x = p.x * view.scale + view.tx;
        const cy = -p.y * view.scale + view.ty;
        if (x < -60 || cy < -60 || x > w + 60 || cy > h + 80) return null;
        const list = m.uris.slice(0, 4);
        const bottom = cy - Math.max(hexR * 0.8, 3) - 4;
        return (
          <Pressable
            key={`img-${m.q},${m.r}`}
            onPress={onPress ? () => onPress(m.ids) : undefined}
            disabled={!onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={m.ids.length > 1 ? `Bu petekte ${m.ids.length} etkinlik` : 'Etkinliği aç'}
            testID="map-image-card"
            style={({ pressed }) => [
              styles.cardStack,
              { left: x - CARD_W / 2 - STACK_PAD, top: bottom - CARD_H },
              pressed && styles.cardPressed,
            ]}
          >
            {list.map((uri, i) => {
              const k = list.length - 1 - i; // arkadakiler sola-yukarı kayar
              return (
                <View
                  key={`${uri}-${i}`}
                  style={[styles.cardFrame, { left: STACK_PAD - k * 6, top: -k * 5, zIndex: list.length - k }]}
                >
                  <Image source={{ uri }} contentFit="cover" style={styles.cardImg} />
                </View>
              );
            })}
            {m.uris.length > 1 ? (
              <View style={[styles.cardPlus, { left: STACK_PAD + CARD_W - 7 }]} pointerEvents="none">
                <Text style={styles.cardPlusText}>+</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Peteklerin üstünde aşağı-yukarı zıplayan oklar (dokunmayı engellemez) */
function BouncingArrows({ cells, view, w, h }: { cells: readonly Cell[]; view: View2; w: number; h: number }) {
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -12, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);
  const hexR = HEX_SIZE * view.scale;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="map-pointers">
      {cells.map((c) => {
        const p = cellCenter(c.q, c.r);
        const x = p.x * view.scale + view.tx;
        const cy = -p.y * view.scale + view.ty;
        if (x < -30 || cy < -30 || x > w + 30 || cy > h + 60) return null;
        // Okun ucu peteğin üst kenarına değer
        const top = cy - Math.max(hexR * 0.8, 4) - 34;
        return (
          <Animated.View
            key={`${c.q},${c.r}`}
            style={[styles.arrow, { left: x - 17, top, transform: [{ translateY: y }] }]}
          >
            <Ionicons name="arrow-down" size={26} color="#1A1200" />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function MapButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.mapButton, disabled && styles.mapButtonOff, pressed && styles.mapButtonPressed]}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: SEA, overflow: 'hidden' },
  svg: { position: 'absolute', top: 0, left: 0 },
  buttons: { position: 'absolute', right: 8, gap: 6 },
  mapButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButtonOff: { opacity: 0.4 },
  inspect: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFC83D',
    borderWidth: 2,
    borderColor: '#FFF4C2',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  inspectPressed: { transform: [{ scale: 0.96 }] },
  mapButtonPressed: { backgroundColor: colors.surfaceAlt },
  cardStack: { position: 'absolute', width: CARD_W + 20, height: CARD_H + 16 },
  cardFrame: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFF4C2',
    backgroundColor: SEA,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  cardImg: { width: '100%', height: '100%' },
  cardPressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
  cardPlus: {
    position: 'absolute',
    top: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: OFFICIAL_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 6,
  },
  cardPlusText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 10, lineHeight: 12, marginTop: -1 },
  arrow: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: OFFICIAL_COLOR,
    borderWidth: 2,
    borderColor: '#FFF4C2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 9,
  },
});
