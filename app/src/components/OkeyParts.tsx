import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { isFake, isWild, RACK_COLS, RACK_ROWS, RACK_SLOTS, TILE_COLORS, type OkeyMeld } from '@/lib/okey';
import { fonts } from '@/theme';

// Okey ve 101 Okey masa parçaları: taş, ıstaka (sürükle-bırak), yığınlar, oyuncu etiketi, per satırı.
// Görseller şimdilik kodla çizilir (taş: krem zemin, renkli sayı ve altında renkli halka). Sonra hazır görsel gelirse
// yalnızca OkTile ve rackStyles değişir.

export const OK = {
  felt: ['#0E4A4A', '#0A3236', '#071F26'] as [string, string, string],
  feltEdge: '#1B6B66',
  wood: ['#9A6534', '#7A4A22', '#5C3618'] as [string, string, string],
  gold3: ['#F6BE4A', '#E7A12C', '#CF8618'] as [string, string, string],
  sea: ['#1E7397', '#155E80', '#0D4563'] as [string, string, string],
  plate: 'rgba(8,22,36,0.88)',
  grid: '#0C2537',
  woodLip: '#3E230E',
  tile: '#FBFBF7',
  tileEdge: '#BDBDB4',
  gold: '#FFC93C',
  glow: '#22D3C5',
  text: '#EAFBF8',
  muted: '#9CC9C2',
  danger: '#FF5470',
};

export type TileSize = { w: number; h: number };

/** Tek taş. `helper`: okey yıldızla işaretlenir. */
export const OkTile = memo(function OkTile({
  t,
  okc,
  okn,
  size,
  helper = false,
  selected = false,
  mark = null,
  dim = false,
}: {
  t: number;
  okc: number;
  okn: number;
  size: TileSize;
  helper?: boolean;
  selected?: boolean;
  /** Vurgu: 'ok' (geçerli per / işlenir), 'warn' (işlek taş: atılırsa ceza), 'bad' (geçersiz grup) */
  mark?: 'ok' | 'warn' | 'bad' | null;
  dim?: boolean;
}) {
  const wild = isWild(t, okc, okn);
  const fake = isFake(t);
  const color = fake ? '#1F7A4D' : TILE_COLORS[Math.floor(t / 26)];
  const num = (t % 26) % 13 + 1;
  const fs = Math.round(size.w * 0.6);
  return (
    <View
      style={[
        tileStyles.tile,
        { width: size.w - 2, height: size.h - 2, borderRadius: Math.max(3, size.w * 0.14) },
        selected && tileStyles.selected,
        mark === 'ok' && tileStyles.markOk,
        mark === 'warn' && tileStyles.markWarn,
        mark === 'bad' && tileStyles.markBad,
        helper && wild && tileStyles.wild,
        dim && tileStyles.dim,
      ]}
    >
      {fake ? (
        <Ionicons name="star" size={Math.round(size.w * 0.62)} color={color} style={tileStyles.fakeIcon} />
      ) : (
        <>
          <Text style={[tileStyles.num, { color, fontSize: fs, lineHeight: Math.round(fs * 1.15) }]}>{num}</Text>
          <View style={[tileStyles.pip, { width: size.w * 0.3, height: size.w * 0.3, borderRadius: size.w * 0.15 }]} />
        </>
      )}
      {helper && wild ? (
        <View style={tileStyles.wildBadge}>
          <Ionicons name="star" size={Math.max(8, Math.round(size.w * 0.32))} color="#3A2600" />
        </View>
      ) : null}
    </View>
  );
});

/** Kapalı taş (deste) */
export function TileBack({ size, count }: { size: TileSize; count?: number | null }) {
  return (
    <View style={{ width: size.w + 6, height: size.h + 6 }}>
      <View style={[tileStyles.back, { width: size.w, height: size.h, top: 6, left: 6, opacity: 0.6 }]} />
      <View style={[tileStyles.back, { width: size.w, height: size.h, top: 3, left: 3, opacity: 0.8 }]} />
      <View style={[tileStyles.back, { width: size.w, height: size.h, top: 0, left: 0 }]}>
        {count !== undefined && count !== null ? <Text style={tileStyles.backCount}>{count}</Text> : null}
      </View>
    </View>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    margin: 1,
    backgroundColor: OK.tile,
    borderBottomWidth: 3,
    borderBottomColor: OK.tileEdge,
    borderWidth: 1,
    borderColor: '#E3E3DC',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
    overflow: 'hidden',
  },
  selected: { transform: [{ translateY: -6 }], borderColor: OK.glow, borderWidth: 2 },
  markOk: { borderColor: '#34D399', borderWidth: 2 },
  markWarn: { borderColor: '#FF9F1C', borderWidth: 2 },
  markBad: { borderColor: OK.danger, borderWidth: 2 },
  wild: { backgroundColor: '#FFF1C4' },
  dim: { opacity: 0.45 },
  num: { fontFamily: fonts.black, textAlign: 'center' },
  pip: { marginTop: 1, backgroundColor: '#D3D3CC', borderWidth: 1, borderColor: '#B5B5AD' },
  fakeIcon: { marginTop: 4 },
  wildBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: OK.gold,
    borderRadius: 99,
    padding: 1,
  },
  back: {
    position: 'absolute',
    borderRadius: 5,
    backgroundColor: '#1E7F78',
    borderWidth: 1,
    borderColor: '#5FE0D4',
    borderBottomWidth: 3,
    borderBottomColor: '#0D4F4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCount: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 15 },
});

/** Taş boyutu: ıstaka genişliğine göre (15 sütun) */
export function rackTileSize(width: number): TileSize {
  const inner = Math.min(width, 620) - RACK_PAD * 2;
  const w = Math.max(18, Math.floor(inner / RACK_COLS));
  return { w, h: Math.round(w * 1.42) };
}

const RACK_PAD = 6;
const ROW_GAP = 8;

/**
 * Taşı ıstakada `from` yuvasından `to` yuvasına taşır. Hedef doluysa aynı sırada sağa (yer yoksa sola) kaydırarak
 * araya sokar; sıra doluysa yer değiştirir.
 */
export function moveInRack(slots: (number | null)[], from: number, to: number): (number | null)[] {
  if (from === to || from < 0 || to < 0 || to >= RACK_SLOTS) return slots;
  const s = [...slots];
  const t = s[from];
  if (t === null || t === undefined) return slots;
  s[from] = null;
  if (s[to] === null) {
    s[to] = t;
    return s;
  }
  const row = Math.floor(to / RACK_COLS);
  const end = row * RACK_COLS + RACK_COLS - 1;
  const start = row * RACK_COLS;
  let k = -1;
  for (let i = to + 1; i <= end; i++) {
    if (s[i] === null) {
      k = i;
      break;
    }
  }
  if (k >= 0) {
    for (let i = k; i > to; i--) s[i] = s[i - 1];
    s[to] = t;
    return s;
  }
  for (let i = to - 1; i >= start; i--) {
    if (s[i] === null) {
      k = i;
      break;
    }
  }
  if (k >= 0) {
    for (let i = k; i < to; i++) s[i] = s[i + 1];
    s[to] = t;
    return s;
  }
  // Sıra dolu: yer değiştir
  s[from] = s[to];
  s[to] = t;
  return s;
}

/** Bırakma yerleri: taş at, deste (Okey'de bitir), yerdeki per (101'de işle) */
export type DropZone = 'discard' | 'deck' | `meld:${number}`;

/**
 * Istaka: 2 sıra × 15 yuva. Taşa dokun: seçilir (bir daha dokun: bırakılır); seçiliyken boş yuvaya dokun: oraya taşınır.
 * Taşı sürükle: ıstakada yerini değiştir, "Taş at" alanına bırak: atılır, ortaya bırak (Okey): bitirilir.
 */
export function OkRack({
  slots,
  okc,
  okn,
  helper,
  width,
  selected,
  marks,
  onSelect,
  onChange,
  zoneAt,
  onHoverZone,
  onDrop,
  testID,
  tile,
  skin = 'wood',
  engrave,
}: {
  slots: (number | null)[];
  okc: number;
  okn: number;
  helper: boolean;
  width: number;
  selected: number | null;
  marks?: Map<number, 'ok' | 'warn' | 'bad'>;
  onSelect: (t: number | null) => void;
  onChange: (slots: (number | null)[]) => void;
  zoneAt: (pageX: number, pageY: number) => DropZone | null;
  onHoverZone?: (z: DropZone | null) => void;
  onDrop: (zone: DropZone, tile: number) => void;
  testID?: string;
  /** Taş boyutu (verilmezse genişlikten) */
  tile?: TileSize;
  /** Ahşap ya da altın sarısı ıstaka */
  skin?: 'wood' | 'gold';
  /** Istakaya kazınmış soluk yazı */
  engrave?: string;
}) {
  const size = tile ?? rackTileSize(width);
  const box = useRef({ x: 0, y: 0 });
  const drag = useRef<{ from: number; tile: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [dragTile, setDragTile] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hoverZone = useRef<DropZone | null>(null);
  const rackW = size.w * RACK_COLS + RACK_PAD * 2;

  const slotAt = (pageX: number, pageY: number): number => {
    const x = pageX - box.current.x - RACK_PAD;
    const y = pageY - box.current.y - RACK_PAD;
    if (x < 0 || y < -8) return -1;
    const col = Math.floor(x / size.w);
    const row = Math.floor(Math.max(0, y) / (size.h + ROW_GAP));
    if (col < 0 || col >= RACK_COLS || row < 0 || row >= RACK_ROWS) return -1;
    return row * RACK_COLS + col;
  };

  const setZone = (z: DropZone | null) => {
    if (hoverZone.current !== z) {
      hoverZone.current = z;
      onHoverZone?.(z);
    }
  };

  const grant = (e: GestureResponderEvent) => {
    const { pageX, pageY, locationX, locationY } = e.nativeEvent;
    box.current = { x: pageX - locationX, y: pageY - locationY };
    const idx = slotAt(pageX, pageY);
    const t = idx >= 0 ? slots[idx] : null;
    drag.current = t === null || t === undefined ? { from: idx, tile: -1, sx: pageX, sy: pageY, moved: false } : { from: idx, tile: t, sx: pageX, sy: pageY, moved: false };
  };

  const move = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d || d.tile < 0) return;
    const { pageX, pageY } = e.nativeEvent;
    if (!d.moved && Math.hypot(pageX - d.sx, pageY - d.sy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      setDragTile(d.tile);
    }
    pos.setValue({ x: pageX - box.current.x - size.w / 2, y: pageY - box.current.y - size.h * 1.1 });
    const z = zoneAt(pageX, pageY);
    setZone(z);
    const idx = z ? -1 : slotAt(pageX, pageY);
    setHover((h) => (h === idx ? h : idx));
  };

  const release = (e: GestureResponderEvent) => {
    const d = drag.current;
    drag.current = null;
    const { pageX, pageY } = e.nativeEvent;
    setDragTile(null);
    setHover(null);
    setZone(null);
    if (!d) return;
    if (!d.moved) {
      const t = d.from >= 0 ? slots[d.from] : null;
      if (t !== null && t !== undefined) onSelect(t === selected ? null : t);
      else if (selected !== null && d.from >= 0) {
        const from = slots.indexOf(selected);
        if (from >= 0) onChange(moveInRack(slots, from, d.from));
        onSelect(null);
      }
      return;
    }
    const z = zoneAt(pageX, pageY);
    if (z) {
      onDrop(z, d.tile);
      return;
    }
    const to = slotAt(pageX, pageY);
    if (to >= 0 && to !== d.from) onChange(moveInRack(slots, d.from, to));
  };

  const cancel = () => {
    drag.current = null;
    setDragTile(null);
    setHover(null);
    setZone(null);
  };

  return (
    <View
      style={[rackStyles.wrap, { width: rackW }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={release}
      onResponderTerminate={cancel}
      testID={testID}
      accessibilityLabel="Istaka"
    >
      <LinearGradient
        colors={skin === 'gold' ? OK.gold3 : OK.wood}
        style={[rackStyles.wood, skin === 'gold' && rackStyles.goldEdge, { padding: RACK_PAD }]}
        pointerEvents="none"
      >
        {engrave ? (
          <View style={rackStyles.engraveWrap}>
            <Text style={[rackStyles.engrave, { fontSize: Math.round(size.h * 0.5) }]} numberOfLines={1}>
              {engrave}
            </Text>
          </View>
        ) : null}
        {Array.from({ length: RACK_ROWS }, (_, r) => (
          <View key={r} style={[rackStyles.row, { height: size.h, marginBottom: r < RACK_ROWS - 1 ? ROW_GAP : 0 }]}>
            {Array.from({ length: RACK_COLS }, (_, c) => {
              const i = r * RACK_COLS + c;
              const t = slots[i];
              return (
                <View key={c} style={[rackStyles.slot, { width: size.w, height: size.h }, hover === i && rackStyles.slotHover]}>
                  {t !== null && t !== undefined && t !== dragTile ? (
                    <OkTile
                      t={t}
                      okc={okc}
                      okn={okn}
                      size={size}
                      helper={helper}
                      selected={t === selected}
                      mark={marks?.get(t) ?? null}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {/* Raf çizgileri */}
        <View style={[rackStyles.lip, { top: RACK_PAD + size.h - 2 }]} />
        <View style={[rackStyles.lip, { top: RACK_PAD + size.h * 2 + ROW_GAP - 2 }]} />
      </LinearGradient>
      {dragTile !== null ? (
        <Animated.View pointerEvents="none" style={[rackStyles.float, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}>
          <OkTile t={dragTile} okc={okc} okn={okn} size={{ w: size.w * 1.2, h: size.h * 1.2 }} helper={helper} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const rackStyles = StyleSheet.create({
  wrap: { alignSelf: 'center', overflow: 'visible' },
  wood: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C08A55',
    borderBottomWidth: 5,
    borderBottomColor: OK.woodLip,
  },
  row: { flexDirection: 'row' },
  slot: { alignItems: 'center', justifyContent: 'flex-end' },
  slotHover: { backgroundColor: 'rgba(34,211,197,0.35)', borderRadius: 4 },
  lip: { position: 'absolute', left: 4, right: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(40,20,5,0.55)' },
  goldEdge: { borderColor: '#FFD98A', borderBottomColor: '#8A5509' },
  engraveWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  engrave: { color: 'rgba(120,70,5,0.28)', fontFamily: fonts.black, letterSpacing: 6 },
  float: { position: 'absolute', left: 0, top: 0, zIndex: 50, elevation: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
});

/** Yerdeki yığın (atılan taşlar): üstteki taş ve sayısı */
export function Pile({
  tiles,
  okc,
  okn,
  size,
  helper,
  label,
  active = false,
  hot = false,
  onPress,
  testID,
  compact = false,
}: {
  tiles: number[];
  okc: number;
  okn: number;
  size: TileSize;
  helper: boolean;
  label: string;
  /** Dokunulabilir (ör. yandan al) */
  active?: boolean;
  /** Sürüklenen taş üstünde */
  hot?: boolean;
  onPress?: () => void;
  testID?: string;
  /** Dar yer (yatay masa): az boşluk, küçük yazı */
  compact?: boolean;
}) {
  const top = tiles.length ? tiles[tiles.length - 1] : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label || 'Atılan taşlar'}
      testID={testID}
      style={({ pressed }) => [pileStyles.wrap, compact && pileStyles.wrapCompact, active && pileStyles.active, hot && pileStyles.hot, pressed && { opacity: 0.8 }]}
    >
      <View style={[pileStyles.spot, { width: size.w + (compact ? 2 : 8), height: size.h + (compact ? 2 : 8) }]}>
        {top !== null ? (
          <OkTile t={top} okc={okc} okn={okn} size={size} helper={helper} />
        ) : compact && label ? (
          // Dar yerde yazı boş yuvanın içinde durur
          <Text style={[pileStyles.inLabel, active && pileStyles.labelActive]}>{label.replace(' ', '\n')}</Text>
        ) : null}
        {tiles.length > 1 ? (
          <View style={pileStyles.count}>
            <Text style={pileStyles.countText}>{tiles.length}</Text>
          </View>
        ) : null}
      </View>
      {label && !compact ? (
        <Text style={[pileStyles.label, active && pileStyles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const pileStyles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 4, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  wrapCompact: { padding: 1, borderRadius: 7 },
  active: { borderColor: OK.glow, backgroundColor: 'rgba(34,211,197,0.12)' },
  hot: { borderColor: OK.gold, backgroundColor: 'rgba(255,201,60,0.18)' },
  spot: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(234,251,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: '#0B2730',
    borderWidth: 1,
    borderColor: OK.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: OK.text, fontFamily: fonts.extra, fontSize: 10 },
  label: { color: OK.muted, fontFamily: fonts.semi, fontSize: 11, marginTop: 3, maxWidth: 96 },
  labelActive: { color: OK.glow, fontFamily: fonts.extra },
  inLabel: { color: OK.muted, fontFamily: fonts.extra, fontSize: 8.5, textAlign: 'center', lineHeight: 10 },
});

/** Masadaki oyuncu etiketi (uzaktan oyunda avatarlı) */
export function SeatChip({
  name,
  avatar,
  tiles,
  score,
  turn,
  left,
  bot,
  team,
  compact,
  opened,
}: {
  name: string;
  avatar: number | null;
  tiles: number;
  score: string | null;
  turn: boolean;
  left: boolean;
  bot: boolean;
  team: 1 | 2 | null;
  compact: boolean;
  opened: string | null;
}) {
  return (
    <View style={[chipStyles.wrap, !compact && chipStyles.wrapTall, turn && chipStyles.turn, left && { opacity: 0.55 }]}>
      {!compact ? (
        <View style={[chipStyles.ava, turn && chipStyles.avaTurn]}>
          <Avatar index={avatar ?? 1} size={34} />
        </View>
      ) : null}
      <View style={[chipStyles.text, !compact && chipStyles.textTall]}>
        <View style={chipStyles.nameRow}>
          {team ? <View style={[chipStyles.team, { backgroundColor: team === 1 ? '#22D3C5' : '#FF9F6B' }]} /> : null}
          <Text style={chipStyles.name} numberOfLines={1}>
            {name}
          </Text>
          {bot ? <Ionicons name="hardware-chip-outline" size={11} color={OK.muted} /> : null}
          {left ? <Ionicons name="cloud-offline-outline" size={11} color={OK.danger} /> : null}
        </View>
        <Text style={chipStyles.sub} numberOfLines={1}>
          {tiles} taş{score !== null ? ` · ${score}` : ''}
        </Text>
        {opened ? (
          <Text style={chipStyles.opened} numberOfLines={1}>
            {opened}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(4,20,24,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(156,201,194,0.25)',
    maxWidth: 108,
  },
  // Uzaktan masada avatar üstte, yazılar altında (dar yerde ad kesilmesin)
  wrapTall: { flexDirection: 'column', gap: 2, paddingVertical: 6 },
  textTall: { alignItems: 'center' },
  turn: { borderColor: OK.gold, backgroundColor: 'rgba(255,201,60,0.14)' },
  ava: { borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  avaTurn: { borderColor: OK.gold },
  text: { flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  team: { width: 8, height: 8, borderRadius: 4 },
  name: { color: OK.text, fontFamily: fonts.extra, fontSize: 12, flexShrink: 1 },
  sub: { color: OK.muted, fontFamily: fonts.semi, fontSize: 10.5 },
  opened: { color: '#34D399', fontFamily: fonts.extra, fontSize: 10.5 },
});

/** Yerdeki bir per (Ortayı gör penceresinde) */
export function MeldRow({
  meld,
  okc,
  okn,
  size,
  helper,
  fits,
  onPress,
}: {
  meld: OkeyMeld;
  okc: number;
  okn: number;
  size: TileSize;
  helper: boolean;
  /** Seçili taş bu pere işlenebilir / okeyi alınabilir */
  fits: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [meldStyles.row, fits && meldStyles.fits, pressed && { opacity: 0.8 }]}
    >
      {meld.tiles.map((t) => (
        <OkTile key={t} t={t} okc={okc} okn={okn} size={size} helper={helper} />
      ))}
      {fits ? <Ionicons name="add-circle" size={20} color="#34D399" style={meldStyles.plus} /> : null}
    </Pressable>
  );
}

const meldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(14,74,74,0.85)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignSelf: 'flex-start',
  },
  fits: { borderColor: '#34D399' },
  plus: { marginLeft: 4 },
});

/** Giriş ekranı arka planı: masa çuhası ve dağınık taşlar (ekranın dışına taşmaz) */
export function OkeyIntroBackdrop({ wood = false }: { wood?: boolean }) {
  const deco: { t: number; x: `${number}%`; y: `${number}%`; r: string }[] = [
    { t: 3 * 26 + 6, x: '6%', y: '9%', r: '-14deg' },
    { t: 1 * 26 + 10, x: '78%', y: '7%', r: '12deg' },
    { t: 104, x: '84%', y: '38%', r: '-8deg' },
    { t: 0 * 26 + 12, x: '4%', y: '44%', r: '9deg' },
    { t: 2 * 26 + 0, x: '12%', y: '78%', r: '-20deg' },
    { t: 3 * 26 + 13 + 12, x: '80%', y: '80%', r: '16deg' },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={wood ? ['#3A230F', '#0E2A2C', '#071F26'] : ['#0E4A4A', '#0A3236', '#071F26']} style={StyleSheet.absoluteFill} />
      {deco.map((d, i) => (
        <View key={i} style={[introStyles.deco, { left: d.x, top: d.y, transform: [{ rotate: d.r }] }]}>
          <OkTile t={d.t} okc={0} okn={1} size={{ w: 40, h: 56 }} />
        </View>
      ))}
    </View>
  );
}

const introStyles = StyleSheet.create({
  deco: { position: 'absolute', opacity: 0.16 },
});

// ---------------------------------------------------------------------------------------------------------------------
// Yatay masa (101 Okey Plus düzeni): oyuncu kartları, deste, mod etiketleri, per tablosu, Çift diz / Seri diz
// ---------------------------------------------------------------------------------------------------------------------

/** Deste: beyaz taş, ortasında kalan taş sayısı */
export function DeckTile({ size, count }: { size: TileSize; count: number | null }) {
  return (
    <View style={[tileStyles.tile, plusStyles.deck, { width: size.w - 2, height: size.h - 2, borderRadius: Math.max(3, size.w * 0.14) }]}>
      <View style={[plusStyles.deckCircle, { width: size.w * 0.62, height: size.w * 0.62, borderRadius: size.w * 0.31 }]}>
        <Text style={[plusStyles.deckCount, { fontSize: Math.round(size.w * 0.34) }]}>{count ?? 0}</Text>
      </View>
    </View>
  );
}

/** Masa ayarı etiketi (Tek, Yardımlı, Katlamasız, 1 El) */
export function ModePill({ text, on = false }: { text: string; on?: boolean }) {
  return (
    <View style={[plusStyles.pill, on && plusStyles.pillOn]}>
      <Text style={plusStyles.pillText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Açış değeri: küçük taşlar üstünde rakamlar (ör. 1 5 6) */
export function DigitTiles({ text, h = 18, vertical = false }: { text: string; h?: number; vertical?: boolean }) {
  const colors = ['#D7263D', '#1E6FD9', '#D7263D', '#1B2430'];
  return (
    <View style={[plusStyles.digits, vertical && plusStyles.digitsV]}>
      {text.split('').map((d, i) => (
        <View key={i} style={[plusStyles.digit, { height: h, minWidth: Math.round(h * 0.72) }]}>
          <Text style={[plusStyles.digitText, { color: colors[i % colors.length], fontSize: Math.round(h * 0.62) }]}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

type PlateProps = {
  name: string;
  avatar: number | null;
  /** Kısa bilgi (taş sayısı, puan) */
  sub: string | null;
  /** Sıra bu oyuncudaysa kalan sürenin oranı (0–1); değilse null */
  turnFrac: number | null;
  team: 1 | 2 | null;
  left: boolean;
  bot: boolean;
};

const teamColor = (t: 1 | 2) => (t === 1 ? '#22D3C5' : '#FF9F6B');

/** Yatay oyuncu kartı (karşıdaki oyuncu ve sen): avatar + ad; sıra ondaysa üstünde süre çubuğu */
export function HPlate({ name, avatar, sub, turnFrac, team, left, bot, width }: PlateProps & { width: number }) {
  return (
    <View style={[plusStyles.hWrap, { width }, left && plusStyles.left]}>
      {turnFrac !== null ? (
        <View style={plusStyles.hBar}>
          <View style={[plusStyles.hBarFill, { width: `${Math.round(turnFrac * 100)}%` }, turnFrac < 0.2 && plusStyles.barLow]} />
        </View>
      ) : null}
      <View style={[plusStyles.hPlate, turnFrac !== null && plusStyles.plateTurn]}>
        <View style={plusStyles.hAva}>
          <Avatar index={avatar ?? 1} size={28} />
        </View>
        <View style={plusStyles.flex}>
          <View style={plusStyles.nameRow}>
            {team ? <View style={[plusStyles.team, { backgroundColor: teamColor(team) }]} /> : null}
            <Text style={plusStyles.hName} numberOfLines={1}>
              {name}
            </Text>
            {bot ? <Ionicons name="hardware-chip-outline" size={11} color={OK.muted} /> : null}
            {left ? <Ionicons name="cloud-offline-outline" size={11} color={OK.danger} /> : null}
          </View>
          {sub ? (
            <Text style={plusStyles.hSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Dikey oyuncu kartı (sol ve sağ oyuncu): üstte avatar, ad yukarıdan aşağı; sıra ondaysa yanında süre çubuğu */
export function VPlate({ name, avatar, sub, turnFrac, team, left, bot, height, side }: PlateProps & { height: number; side: 'left' | 'right' }) {
  const W = 40;
  const textLen = Math.max(40, height - W - 8);
  return (
    <View style={[plusStyles.vRow, side === 'right' && plusStyles.vRowRight, left && plusStyles.left]}>
      <View style={[plusStyles.vPlate, { height, width: W }, turnFrac !== null && plusStyles.plateTurn]}>
        <View style={plusStyles.vAva}>
          <Avatar index={avatar ?? 1} size={W - 6} />
          {team ? <View style={[plusStyles.vTeam, { backgroundColor: teamColor(team) }]} /> : null}
        </View>
        {/* Ad: yukarıdan aşağı okunur */}
        <View style={[plusStyles.vTextBox, { width: textLen, top: W + 4 + textLen / 2 - 14, left: W / 2 - textLen / 2 }]}>
          <Text style={plusStyles.vName} numberOfLines={1}>
            {name}
            {bot ? ' ·bot' : ''}
          </Text>
          {sub ? (
            <Text style={plusStyles.vSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      {turnFrac !== null ? (
        <View style={[plusStyles.vBar, { height }]}>
          <View style={[plusStyles.vBarFill, { height: `${Math.round(turnFrac * 100)}%` }, turnFrac < 0.2 && plusStyles.barLow]} />
        </View>
      ) : null}
    </View>
  );
}

/** Istakanın yanındaki büyük düğme: Çift diz (sol) / Seri diz (sağ) */
export function PlusSideButton({
  kind,
  width,
  height,
  onPress,
  disabled = false,
}: {
  kind: 'pairs' | 'runs';
  width: number;
  height: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const icon = kind === 'pairs' ? ['5', '5'] : ['1', '2', '3'];
  const tw = Math.max(9, Math.floor((width - 12) / icon.length));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={kind === 'pairs' ? 'Çift diz' : 'Seri diz'}
      testID={kind === 'pairs' ? 'ok-arrange-pairs' : 'ok-arrange-runs'}
      style={({ pressed }) => [plusStyles.sideBtnWrap, { width, height }, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
    >
      <LinearGradient colors={['#2B5DA8', '#1A3F7A', '#10295A']} style={plusStyles.sideBtn}>
        <View style={plusStyles.sideIcon}>
          {icon.map((d, i) => (
            <View key={i} style={[plusStyles.sideTile, { width: tw, height: Math.round(tw * 1.3), transform: [{ rotate: `${(i - (icon.length - 1) / 2) * 8}deg` }] }]}>
              <Text style={[plusStyles.sideTileText, { fontSize: Math.round(tw * 0.75), color: i % 2 ? '#D7263D' : '#D7263D' }]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={[plusStyles.sideText, { fontSize: Math.max(11, Math.round(width * 0.3)) }]}>{kind === 'pairs' ? 'ÇİFT' : 'SERİ'}</Text>
        <Text style={[plusStyles.sideText, { fontSize: Math.max(11, Math.round(width * 0.3)) }]}>DİZ</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Ortadaki koyu, kareli per tablosu */
export function TableGrid({ width, height, cell = 18, children }: { width: number; height: number; cell?: number; children?: ReactNode }) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  return (
    <View style={[plusStyles.grid, { width, height }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: cols }, (_, i) => (
          <View key={`c${i}`} style={[plusStyles.gridLineV, { left: i * cell }]} />
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <View key={`r${i}`} style={[plusStyles.gridLineH, { top: i * cell }]} />
        ))}
      </View>
      {children}
    </View>
  );
}

const plusStyles = StyleSheet.create({
  flex: { flex: 1 },
  left: { opacity: 0.55 },
  deck: { justifyContent: 'center', paddingTop: 0 },
  deckCircle: { backgroundColor: '#E4E4DE', borderWidth: 1, borderColor: '#B9B9B0', alignItems: 'center', justifyContent: 'center' },
  deckCount: { color: '#1B2430', fontFamily: fonts.black },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(10,32,52,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(120,180,220,0.35)',
    alignItems: 'center',
  },
  pillOn: { backgroundColor: '#1F7A4D', borderColor: '#4ADE80' },
  pillText: { color: '#EAF4FF', fontFamily: fonts.extra, fontSize: 10.5 },
  digits: { flexDirection: 'row', gap: 1 },
  digitsV: { flexDirection: 'column' },
  digit: {
    backgroundColor: '#FBFBF7',
    borderRadius: 3,
    borderBottomWidth: 2,
    borderBottomColor: '#BDBDB4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  digitText: { fontFamily: fonts.black },
  hWrap: { alignItems: 'stretch' },
  hBar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginBottom: 2, marginHorizontal: 6 },
  hBarFill: { height: 5, backgroundColor: '#F7E27A' },
  barLow: { backgroundColor: OK.danger },
  hPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 8,
    borderRadius: 8,
    backgroundColor: OK.plate,
    borderWidth: 1,
    borderColor: 'rgba(120,180,220,0.3)',
  },
  plateTurn: { borderColor: '#F7E27A', borderWidth: 1.5 },
  hAva: { borderRadius: 5, overflow: 'hidden' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  team: { width: 8, height: 8, borderRadius: 4 },
  hName: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 12.5, flexShrink: 1 },
  hSub: { color: '#9FC3DA', fontFamily: fonts.semi, fontSize: 10 },
  vRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  vRowRight: { flexDirection: 'row-reverse' },
  vPlate: {
    borderRadius: 8,
    backgroundColor: OK.plate,
    borderWidth: 1,
    borderColor: 'rgba(120,180,220,0.3)',
    alignItems: 'center',
    paddingTop: 3,
    overflow: 'hidden',
  },
  vAva: { borderRadius: 5, overflow: 'hidden' },
  vTeam: { position: 'absolute', right: 2, bottom: 2, width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#FFFFFF' },
  vTextBox: { position: 'absolute', height: 28, justifyContent: 'center', transform: [{ rotate: '90deg' }] },
  vName: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 12 },
  vSub: { color: '#9FC3DA', fontFamily: fonts.semi, fontSize: 9.5 },
  vBar: { width: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', justifyContent: 'flex-end' },
  vBarFill: { width: 5, backgroundColor: '#7BE07B' },
  sideBtnWrap: { borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#5B8FD8' },
  sideBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 3 },
  sideIcon: { flexDirection: 'row', marginBottom: 4 },
  sideTile: {
    backgroundColor: '#FBFBF7',
    borderRadius: 3,
    borderBottomWidth: 2,
    borderBottomColor: '#BDBDB4',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -1,
  },
  sideTileText: { fontFamily: fonts.black },
  sideText: { color: '#FFFFFF', fontFamily: fonts.black, letterSpacing: 0.5, lineHeight: undefined },
  grid: { backgroundColor: OK.grid, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(120,180,220,0.18)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(120,180,220,0.14)' },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(120,180,220,0.14)' },
});
