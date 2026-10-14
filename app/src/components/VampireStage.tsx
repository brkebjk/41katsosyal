import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Image } from 'expo-image';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { vampireImages } from '@/lib/images';
import { ROLES, type VvPlayer, type VvRole } from '@/lib/vampire';
import { fonts } from '@/theme';

// Vampir–Köylü oyun sahnesi: tam ekran gece/gündüz görselinin üstünde duran parçalar. Görselin üstünde okunsun diye
// renkler temadan bağımsızdır (koyu cam zemin, açık yazı).

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const G = {
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.72)',
  faint: 'rgba(255,255,255,0.45)',
  glass: 'rgba(8, 10, 20, 0.76)',
  border: 'rgba(255,255,255,0.14)',
  teal: '#22D3C5',
  tealText: '#06201D',
  red: '#FF5470',
  redSoft: '#FF8A98',
  gold: '#FFC93C',
  green: '#34D399',
  violet: '#B7A8FF',
} as const;

/** Koyu cam kutu */
/** Vampir–Köylü rol simgesi: küçük yuvarlak çerçeve içinde rol görseli (kenar rol renginde) */
export function VvRoleIcon({ role, size = 24 }: { role: VvRole; size?: number }) {
  const info = ROLES[role];
  const border = size >= 30 ? 2 : 1.5;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: border,
        borderColor: info?.color ?? '#FFFFFF',
        backgroundColor: 'rgba(11, 19, 43, 0.88)',
        overflow: 'hidden',
      }}
      accessibilityLabel={info?.name}
    >
      {info ? <Image source={vampireImages[info.image]} contentFit="cover" style={{ flex: 1 }} /> : null}
    </View>
  );
}

export function Glass({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

/** Görselin üstünde okunan düğme */
export function GameButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  flex,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  flex?: boolean;
  testID?: string;
}) {
  const fg = variant === 'primary' ? G.tealText : variant === 'danger' ? '#FFFFFF' : G.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        flex && styles.btnFlex,
        (disabled || loading) && styles.btnOff,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={14} color={fg} />
      ) : null}
      <Text style={[styles.btnText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Oyun bitince: "Bekleme odasına geç" düğmesi, `seconds` saniye geri sayar ve süre dolunca kendiliğinden geçer
 * (yeni el bekleme odası). Ekrandan çıkılırsa sayaç durur.
 */
export function NextRoomButton({ seconds = 10, onGo }: { seconds?: number; onGo: () => void }) {
  const [left, setLeft] = useState(seconds);
  const go = useRef(onGo);
  useEffect(() => {
    go.current = onGo;
  });
  useEffect(() => {
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, []);
  const done = left <= 0;
  useEffect(() => {
    if (done) go.current();
  }, [done]);
  return (
    <GameButton
      label={`🔁 Bekleme odasına geç · ${Math.max(0, left)}`}
      onPress={() => go.current()}
      testID="next-room"
    />
  );
}

/** Alt şeritteki simgeli düğme */
export function ToolButton({
  icon,
  label,
  onPress,
  badge,
  hot,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number | string | null;
  /** Dikkat çeksin (ör. bana yeni fısıltı geldi) */
  hot?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
    >
      <View style={[styles.toolIcon, hot && styles.toolIconHot]}>
        <Ionicons name={icon} size={16} color={hot ? G.tealText : G.text} />
        {badge !== undefined && badge !== null && badge !== '' ? (
          <View style={styles.toolBadge}>
            <Text style={styles.toolBadgeText}>{String(badge)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.toolLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Aşamanın kalan süresi: ince çubuk ve yazı */
export function ClockBar({ label, left, limit }: { label: string; left: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, left / limit)) : 0;
  const s = Math.max(0, Math.ceil(left));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <View style={styles.clock} accessibilityLabel={`${label}: ${text}`}>
      <View style={styles.clockHead}>
        <Text style={styles.clockLabel} numberOfLines={1}>
          {left > 0 ? label : 'Süre doldu, sıradaki aşamaya geçiliyor…'}
        </Text>
        <Text style={[styles.clockCount, s <= 5 && left > 0 && { color: G.redSoft }]}>{text}</Text>
      </View>
      <View style={styles.clockBar}>
        <View style={[styles.clockFill, { width: `${Math.round(ratio * 100)}%` }, s <= 5 && styles.clockFillLow]} />
      </View>
    </View>
  );
}

/** "Tartışmayı hızlı geç" işareti: yaşayanların yarısından fazlası işaretlerse oylama hemen başlar */
export function SkipToggle({
  skip,
  busy,
  onToggle,
}: {
  skip: { yes: number; alive: number; needed: number; mine: boolean };
  busy?: boolean;
  onToggle: (on: boolean) => void;
}) {
  const ratio = skip.needed > 0 ? Math.min(1, skip.yes / skip.needed) : 0;
  return (
    <Pressable
      onPress={() => onToggle(!skip.mine)}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: skip.mine, disabled: !!busy }}
      accessibilityLabel={`Tartışmayı hızlı geç. ${skip.yes} kişi işaretledi, ${skip.needed} gerekli.`}
      testID="skip-discussion"
      style={({ pressed }) => [styles.skip, skip.mine && styles.skipOn, pressed && styles.pressed]}
    >
      <Ionicons name={skip.mine ? 'checkbox' : 'square-outline'} size={22} color={skip.mine ? G.teal : G.text} />
      <View style={styles.skipBody}>
        <Text style={styles.skipTitle}>Tartışmayı hızlı geç</Text>
        <View style={styles.skipBar}>
          <View style={[styles.skipFill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
      </View>
      <Text style={styles.skipCount}>{`${skip.yes}/${skip.needed}`}</Text>
    </Pressable>
  );
}

/** Kısa bilgi hapı (ör. "Deneme odası", "Elendin") */
export function Pill({ icon, text, tone = 'info' }: { icon?: IconName; text: string; tone?: 'info' | 'danger' | 'warn' }) {
  const color = tone === 'danger' ? G.redSoft : tone === 'warn' ? G.gold : G.text;
  return (
    <View style={[styles.pill, tone === 'danger' && styles.pillDanger, tone === 'warn' && styles.pillWarn]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Oyuncu ızgarası: avatarlar, ölü / sağ, oylar, ses durumu
// ---------------------------------------------------------------------------

export type Tile = {
  p: VvPlayer;
  /** Dokununca seçilir (gece hedefi ya da oy) */
  selectable?: boolean;
  /** Seçilemez hedef (soluk görünür) */
  dim?: boolean;
  /** Bu kişiye verilen asılma oyu sayısı (avatarın üstünde) */
  votesIn?: number;
  /** Adın altındaki satır: kime oy verdi, rolü, dedektif notu… */
  sub?: { icon?: IconName; text: string; color?: string } | null;
  /** Anlatıcı için: hazır / seçim yaptı / oy verdi işareti */
  check?: boolean | null;
  voice?: { speaking: boolean; micOff: boolean; filter: boolean; away: boolean; offline: boolean } | null;
  kick?: { votes: number; need: number | null; mine: boolean; secsLeft: number | null } | null;
  /** Konuşanın avatarında kırmızı ünlem: dokununca sesi şikâyet et */
  alert?: boolean;
  /** Görmeye hakkın olan rol: avatarın alt ortasında yuvarlak çerçevede */
  role?: VvRole | null;
};

const GAP = 4;
/** Avatarın dışında kalan yükseklik: üstte oy rozeti, altta ad ve alt satır */
const EXTRA = 56;
const MAX_AVATAR = 120;

/** Oyuncu sayısına ve alana göre en büyük avatarın sığdığı sütun sayısı */
/** Her satırda hep 4 avatar (Köpekbalığı Kafesi ile aynı düzen); kaydırmadan sığacak en büyük boyut */
function fit(n: number, w: number, h: number): { cols: number; size: number } {
  const cols = 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  const tileW = (w - GAP * (cols - 1)) / cols;
  const byW = tileW - 8;
  const byH = (h - GAP * (rows - 1)) / rows - EXTRA;
  return { cols, size: Math.max(26, Math.floor(Math.min(byW, byH, MAX_AVATAR))) };
}

/** Avatar boyutu oyun boyunca sabit kalsın (aynı oda, aynı oyuncu sayısı için en küçük boyut) */
const stickySize = new Map<string, number>();

export function PlayerGrid({
  tiles,
  selected,
  accent = G.red,
  onPress,
  onLongPress,
  onAlert,
  stickyKey,
}: {
  tiles: Tile[];
  selected?: string | null;
  accent?: string;
  onPress?: (t: Tile) => void;
  onLongPress?: (t: Tile) => void;
  onAlert?: (t: Tile) => void;
  /** Boyutu sabitlemek için (oda kimliği) */
  stickyKey?: string;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || Math.abs(box.w - width) > 1 || Math.abs(box.h - height) > 1) setBox({ w: width, h: height });
  };
  const fitted = box ? fit(tiles.length, box.w, box.h) : { cols: 4, size: 0 };
  const cols = fitted.cols;
  let size = fitted.size;
  if (stickyKey && size > 0) {
    const k = `${stickyKey}:${tiles.length}`;
    const prev = stickySize.get(k);
    if (prev !== undefined && prev < size) size = prev;
    else stickySize.set(k, size);
  }
  const tileW = box ? Math.floor((box.w - GAP * (cols - 1)) / cols) : 0;

  return (
    <View style={styles.gridBox} onLayout={onLayout}>
      {box && size > 0 ? (
        <ScrollView contentContainerStyle={styles.gridScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {tiles.map((t) => (
              <PlayerTile
                key={t.p.id}
                tile={t}
                width={tileW}
                size={size}
                selected={selected === t.p.id}
                accent={accent}
                onPress={onPress}
                onLongPress={onLongPress}
                onAlert={onAlert}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function PlayerTile({
  tile,
  width,
  size,
  selected,
  accent,
  onPress,
  onLongPress,
  onAlert,
}: {
  tile: Tile;
  width: number;
  size: number;
  selected: boolean;
  accent: string;
  onPress?: (t: Tile) => void;
  onLongPress?: (t: Tile) => void;
  onAlert?: (t: Tile) => void;
}) {
  const p = tile.p;
  const dead = !p.is_alive;
  const v = tile.voice;
  const ringColor = selected
    ? accent
    : v?.speaking
      ? G.green
      : p.is_me
        ? G.teal
        : dead
          ? 'rgba(255,255,255,0.15)'
          : 'rgba(255,255,255,0.55)';
  const ring = selected || v?.speaking ? 3 : 2;
  const small = size < 44;
  const state = dead ? (p.left ? 'oyundan ayrıldı' : 'elendi') : 'hayatta';
  const label = [
    p.name,
    p.is_me ? 'sen' : null,
    state,
    tile.votesIn ? `${tile.votesIn} oy aldı` : null,
    tile.sub?.text ?? null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress ? () => onPress(tile) : undefined}
      onLongPress={onLongPress ? () => onLongPress(tile) : undefined}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      accessibilityRole={tile.selectable ? 'radio' : 'button'}
      accessibilityState={tile.selectable ? { selected, disabled: tile.dim } : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { width }, tile.dim && styles.dim, pressed && styles.pressed]}
    >
      {/* Üstte: aldığı asılma oyu */}
      <View style={styles.voteSlot}>
        {tile.votesIn ? (
          <View style={styles.voteBadge}>
            <Ionicons name="hand-left" size={11} color="#FFFFFF" />
            <Text style={styles.voteBadgeText}>{tile.votesIn}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: size + ring * 2 + 2, height: size + ring * 2 + 2 }}>
        <View
          style={[
            styles.ring,
            { borderRadius: (size + ring * 2 + 2) / 2, borderWidth: ring, borderColor: ringColor },
            selected && { backgroundColor: accent },
          ]}
        >
          <View style={dead ? styles.deadAvatar : undefined}>
            <Avatar index={p.avatar ?? 1} size={size} />
          </View>
          {dead ? (
            <View style={[styles.deadMark, { borderRadius: size / 2 }]}>
              <Ionicons name={p.left ? 'exit' : 'skull'} size={Math.round(size * 0.46)} color={G.redSoft} />
            </View>
          ) : null}
        </View>

        {tile.role ? (
          <View style={styles.roleBadge} pointerEvents="none">
            <VvRoleIcon role={tile.role} size={Math.max(20, Math.round(size * 0.34))} />
          </View>
        ) : null}
        {/* Konuşan oyuncu: kırmızı ünlem, dokununca ses şikâyeti */}
        {tile.alert && onAlert ? (
          <Pressable
            onPress={() => onAlert(tile)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sesi şikâyet et"
            style={styles.alertBtn}
          >
            <Text style={styles.alertText}>!</Text>
          </Pressable>
        ) : null}
        {/* Sağ üst: anlatıcı işareti ya da oda sahibi yıldızı */}
        {tile.check !== undefined && tile.check !== null ? (
          <View style={[styles.corner, styles.cornerTR, { backgroundColor: tile.check ? G.green : 'rgba(0,0,0,0.6)' }]}>
            <Ionicons name={tile.check ? 'checkmark' : 'ellipsis-horizontal'} size={11} color="#FFFFFF" />
          </View>
        ) : p.is_host ? (
          <View style={[styles.corner, styles.cornerTR, styles.hostStar]}>
            <Ionicons name="star" size={10} color="#1A1200" />
          </View>
        ) : null}

        {/* Sağ alt: ses durumu */}
        {v && !dead ? (
          v.speaking || v.micOff || v.offline || v.away ? (
            <View style={[styles.corner, styles.cornerBR, v.speaking ? styles.speak : styles.micOff]}>
              <Ionicons
                name={v.speaking ? 'volume-high' : v.offline ? 'cloud-offline' : v.away ? 'moon' : 'mic-off'}
                size={11}
                color="#FFFFFF"
              />
            </View>
          ) : null
        ) : null}
        {/* Sol alt: ses filtresi açık */}
        {v?.filter && !dead ? (
          <View style={[styles.corner, styles.cornerBL, styles.filter]} accessibilityLabel="Ses filtresi açık">
            <Ionicons name="color-filter" size={10} color="#1A1200" />
          </View>
        ) : null}
        {/* Sol üst: odadan atma oyu */}
        {tile.kick && tile.kick.votes > 0 ? (
          <View style={[styles.kick, tile.kick.mine && styles.kickMine]}>
            <Ionicons name="exit-outline" size={10} color="#FFFFFF" />
            <Text style={styles.kickText}>
              {tile.kick.secsLeft !== null
                ? `${tile.kick.secsLeft} sn`
                : `${tile.kick.votes}/${tile.kick.need ?? '–'}`}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.name, small && styles.nameSmall, dead && styles.nameDead]} numberOfLines={1}>
        {p.is_me ? `${p.name} (sen)` : p.name}
      </Text>
      <View style={styles.subRow}>
        {tile.sub ? (
          <>
            {tile.sub.icon ? <Ionicons name={tile.sub.icon} size={10} color={tile.sub.color ?? G.muted} /> : null}
            <Text style={[styles.sub, { color: tile.sub.color ?? G.muted }]} numberOfLines={1}>
              {tile.sub.text}
            </Text>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  roleBadge: { position: 'absolute', bottom: -4, left: 0, right: 0, alignItems: 'center' },
  alertBtn: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5383B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 30,
    elevation: 30,
  },
  alertText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 14, lineHeight: 16 },
  glass: {
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.border,
  },
  pressed: { opacity: 0.7 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  btnFlex: { flex: 1 },
  btnPrimary: { backgroundColor: G.teal },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.06)' },
  btnDanger: { backgroundColor: '#D9304F' },
  btnOff: { opacity: 0.4 },
  btnText: { fontFamily: fonts.extra, fontSize: 13 },
  tool: { flex: 1, alignItems: 'center', gap: 2, minWidth: 0 },
  toolIcon: {
    width: 34,
    height: 26,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  toolIconHot: { backgroundColor: G.teal },
  toolBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B7BFF',
  },
  toolBadgeText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 10 },
  toolLabel: { color: G.muted, fontFamily: fonts.semi, fontSize: 9.5 },
  clock: { gap: 4 },
  clockHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  clockLabel: { flex: 1, color: G.muted, fontSize: 12 },
  clockCount: { color: G.text, fontFamily: fonts.extra, fontSize: 12 },
  clockBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  clockFill: { height: '100%', borderRadius: 2, backgroundColor: G.teal },
  clockFillLow: { backgroundColor: G.red },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipOn: { borderColor: G.teal, backgroundColor: 'rgba(34, 211, 197, 0.15)' },
  skipBody: { flex: 1, gap: 4 },
  skipTitle: { color: G.text, fontFamily: fonts.extra, fontSize: 13.5 },
  skipBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  skipFill: { height: '100%', borderRadius: 2, backgroundColor: G.teal },
  skipCount: { color: G.text, fontFamily: fonts.black, fontSize: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 10, 20, 0.7)',
  },
  pillDanger: { backgroundColor: 'rgba(120, 10, 30, 0.75)' },
  pillWarn: { backgroundColor: 'rgba(90, 60, 0, 0.75)' },
  pillText: { fontFamily: fonts.semi, fontSize: 11.5 },
  gridBox: { flex: 1, minHeight: 60 },
  gridScroll: { flexGrow: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: GAP, rowGap: GAP },
  tile: { alignItems: 'center' },
  dim: { opacity: 0.4 },
  voteSlot: { height: 18, justifyContent: 'flex-end', marginBottom: -4, zIndex: 2 },
  voteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D9304F',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  voteBadgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11 },
  ring: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  deadAvatar: { opacity: 0.35 },
  deadMark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 0, 6, 0.45)',
  },
  corner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  cornerTR: { top: 0, right: 0 },
  cornerBR: { bottom: 0, right: 0 },
  cornerBL: { bottom: 0, left: 0 },
  hostStar: { backgroundColor: G.gold },
  speak: { backgroundColor: G.green },
  micOff: { backgroundColor: '#D9304F' },
  filter: { backgroundColor: G.gold },
  kick: {
    position: 'absolute',
    top: 0,
    left: -4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 48, 79, 0.85)',
  },
  kickMine: { borderWidth: 1, borderColor: '#FFFFFF' },
  kickText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 9.5 },
  name: {
    marginTop: 3,
    maxWidth: '100%',
    color: G.text,
    fontFamily: fonts.extra,
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },
  nameSmall: { fontSize: 10.5 },
  nameDead: { color: G.faint, textDecorationLine: 'line-through' },
  subRow: { height: 14, flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: '100%' },
  sub: {
    flexShrink: 1,
    fontFamily: fonts.semi,
    fontSize: 10.5,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 3,
  },
});
