import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { KeyboardLift } from '@/components/KeyboardLift';
import { SK_ROLES, SK_WHEEL, type SkMsg, type SkPlayer, type SkRole } from '@/lib/shark';
import { fonts } from '@/theme';

// Köpekbalığı Kafesi sahnesi: görsel dosya kullanmadan, kodla çizilen deniz/plaj efektleri. Animasyonlar yerel
// sürücüde (useNativeDriver) çalışır; Expo Go'da da çalışır, ek paket gerektirmez.

const NATIVE = Platform.OS !== 'web';

export type SkScene = 'lobby' | 'reveal' | 'night' | 'day' | 'vote' | 'end_human' | 'end_shark' | 'end_neutral';

/** Sahne gündüz (açık zemin) mi? Açık zeminde yazılar koyu olur. */
export function isLightScene(s: SkScene): boolean {
  return s === 'day' || s === 'vote' || s === 'end_human';
}

// ---------------------------------------------------------------------------
// Döngü yardımcıları
// ---------------------------------------------------------------------------

function useLoop(duration: number, delay = 0): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

function usePingPong(duration: number): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration]);
  return v;
}

/** Sabit (her açılışta aynı) sözde rastgele sayılar: kabarcıkların yeri ve hızı */
function seeded(n: number, seed: number): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push(x / 233280);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Efektler
// ---------------------------------------------------------------------------

function Bubble({ x, size, duration, delay, height, color }: {
  x: number;
  size: number;
  duration: number;
  delay: number;
  height: number;
  color: string;
}) {
  const t = useLoop(duration, delay);
  const sway = usePingPong(1400 + size * 40);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [height + 20, -40] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.75, 0.55, 0] });
  const translateX = sway.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity,
          transform: [{ translateY }, { translateX }],
        },
      ]}
    >
      <View style={[styles.bubbleShine, { width: size * 0.3, height: size * 0.3, borderRadius: size }]} />
    </Animated.View>
  );
}

/** Yukarı süzülen kabarcıklar */
export function Bubbles({ count = 16, color = 'rgba(160, 230, 255, 0.7)', seed = 7 }: {
  count?: number;
  color?: string;
  seed?: number;
}) {
  const { width, height } = useWindowDimensions();
  const r = useMemo(() => seeded(count * 4, seed), [count, seed]);
  return (
    <View style={styles.fill} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Bubble
          key={i}
          x={r[i * 4] * (width - 20)}
          size={6 + r[i * 4 + 1] * 18}
          duration={5000 + r[i * 4 + 2] * 7000}
          delay={r[i * 4 + 3] * 6000}
          height={height}
          color={color}
        />
      ))}
    </View>
  );
}

/** Su altına süzülen ışık hüzmeleri */
function LightRays() {
  const a = usePingPong(4200);
  const b = usePingPong(5600);
  const { width, height } = useWindowDimensions();
  const ray = (v: Animated.Value, left: number, rot: string, w: number) => (
    <Animated.View
      style={[
        styles.ray,
        {
          left,
          width: w,
          height: height * 0.75,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.2] }),
          transform: [{ rotate: rot }],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(130, 220, 255, 0.9)', 'rgba(130, 220, 255, 0)']}
        style={styles.fill}
      />
    </Animated.View>
  );
  return (
    <View style={styles.fill} pointerEvents="none">
      {ray(a, width * 0.12, '14deg', 60)}
      {ray(b, width * 0.42, '8deg', 90)}
      {ray(a, width * 0.72, '-6deg', 50)}
    </View>
  );
}

/** Uzakta süzülen köpekbalığı gölgesi */
function SharkShadow({ top, duration, flip }: { top: number; duration: number; flip?: boolean }) {
  const t = useLoop(duration, flip ? 4000 : 0);
  const { width } = useWindowDimensions();
  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: flip ? [width + 60, -140] : [-140, width + 60],
  });
  return (
    <Animated.Text
      style={[
        styles.shadowShark,
        { top, transform: [{ translateX }, { scaleX: flip ? 1 : -1 }] },
      ]}
    >
      🦈
    </Animated.Text>
  );
}

/** Kıyıya vuran dalgalar (alt kenar) */
function Waves({ color, top }: { color: string; top: number }) {
  const t = useLoop(4800);
  const t2 = useLoop(6400, 900);
  const { width } = useWindowDimensions();
  const row = (v: Animated.Value, offset: number, opacity: number, dir: 1 | -1) => (
    <Animated.View
      style={[
        styles.waveRow,
        {
          top: top + offset,
          width: width * 2,
          opacity,
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: dir === 1 ? [-width / 2, 0] : [0, -width / 2] }) },
          ],
        },
      ]}
    >
      {Array.from({ length: 16 }, (_, i) => (
        <View key={i} style={[styles.waveCrest, { backgroundColor: color, width: width / 4, borderRadius: width / 8 }]} />
      ))}
    </Animated.View>
  );
  return (
    <View style={styles.fill} pointerEvents="none">
      {row(t, 0, 0.55, 1)}
      {row(t2, 14, 0.35, -1)}
    </View>
  );
}

/** Parlayan güneş */
function Sun() {
  const p = usePingPong(2200);
  return (
    <View style={styles.sunWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.sunGlow,
          {
            opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] }),
            transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          },
        ]}
      />
      <View style={styles.sun} />
    </View>
  );
}

/** Suyun üstündeki ışıltılar */
function Sparkles({ top, height }: { top: number; height: number }) {
  const { width } = useWindowDimensions();
  const r = useMemo(() => seeded(24, 3), []);
  return (
    <View style={styles.fill} pointerEvents="none">
      {Array.from({ length: 8 }, (_, i) => (
        <Sparkle key={i} x={r[i * 3] * width} y={top + r[i * 3 + 1] * height} delay={r[i * 3 + 2] * 2400} />
      ))}
    </View>
  );
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  const t = useLoop(2400, delay);
  return (
    <Animated.View
      style={[
        styles.sparkle,
        {
          left: x,
          top: y,
          opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1.2, 0.4] }) }],
        },
      ]}
    />
  );
}

/** Tam ekran sahne zemini */
/** Yüzeyden dibe dalan dalgıç (giriş ekranı) */
function Diver({ from, to }: { from: number; to: number }) {
  const t = useLoop(9000, 600);
  const { width } = useWindowDimensions();
  const translateY = t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [from - 30, from, to] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [width * 0.18, width * 0.62] });
  const rotate = t.interpolate({ inputRange: [0, 0.12, 0.3, 1], outputRange: ['-30deg', '40deg', '25deg', '20deg'] });
  const opacity = t.interpolate({ inputRange: [0, 0.06, 0.85, 1], outputRange: [0, 0.9, 0.7, 0] });
  return (
    <Animated.Text style={[styles.diver, { opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
      🤿
    </Animated.Text>
  );
}

/**
 * Giriş ekranı sahnesi: üstte plaj (gökyüzü, güneş, dalgalar), altta su altı (ışık hüzmeleri, kabarcıklar, köpekbalığı
 * gölgesi) ve sürekli dalan dalgıç. Yazılar okunsun diye her şey soluk ve arka planda.
 */
export function SharkIntroBackdrop() {
  const { height } = useWindowDimensions();
  const surface = height * 0.26;
  return (
    <View style={styles.fill} pointerEvents="none">
      <LinearGradient colors={['#6CC9F2', '#BDE9FA']} style={[styles.band, { top: 0, height: surface }]} />
      <Sun />
      <LinearGradient
        colors={['#1C6E8C', '#0F3B5C', '#0B132B', '#050A18']}
        locations={[0, 0.25, 0.6, 1]}
        style={[styles.band, { top: surface, bottom: 0 }]}
      />
      <Sparkles top={surface - 10} height={20} />
      <Waves color="#FFFFFF" top={surface - 12} />
      <View style={[styles.fill, { top: surface }]}>
        <LightRays />
      </View>
      <SharkShadow top={height * 0.62} duration={18000} />
      <Diver from={surface} to={height * 0.9} />
      <Bubbles count={14} />
      {/* Okunurluk: içeriğin arkasını hafifçe karart */}
      <LinearGradient
        colors={['rgba(5,10,24,0)', 'rgba(5,10,24,0.35)', 'rgba(5,10,24,0.55)']}
        locations={[0, 0.4, 1]}
        style={styles.fill}
      />
    </View>
  );
}

export function SharkBackdrop({ scene }: { scene: SkScene }) {
  const { height } = useWindowDimensions();
  if (scene === 'day' || scene === 'vote') {
    return (
      <View style={styles.fill} pointerEvents="none">
        <LinearGradient colors={['#6CC9F2', '#B8E7FA', '#F8F9FA']} locations={[0, 0.45, 0.7]} style={styles.fill} />
        <Sun />
        {/* Deniz bandı ve kum */}
        <LinearGradient
          colors={['#2BB3D9', '#5ED0E8']}
          style={[styles.band, { top: height * 0.6, height: height * 0.12 }]}
        />
        <Sparkles top={height * 0.6} height={height * 0.1} />
        <Waves color="#FFFFFF" top={height * 0.69} />
        <LinearGradient
          colors={['#F2D2A2', '#E0A96D']}
          style={[styles.band, { top: height * 0.72, height: height * 0.28 }]}
        />
        {scene === 'vote' ? <View style={[styles.fill, styles.voteTint]} /> : null}
      </View>
    );
  }
  if (scene === 'end_human') {
    return (
      <View style={styles.fill} pointerEvents="none">
        <LinearGradient colors={['#48CAE4', '#BDE9FA', '#FFF4D6']} style={styles.fill} />
        <Sun />
        <Bubbles count={20} color="rgba(255,255,255,0.9)" seed={11} />
      </View>
    );
  }
  const colors: [string, string, string] =
    scene === 'end_shark'
      ? ['#3A0710', '#1C0A1F', '#05060E']
      : scene === 'end_neutral'
        ? ['#2A1550', '#140B2E', '#05060E']
        : scene === 'reveal'
          ? ['#10204A', '#0B132B', '#03070F']
          : scene === 'lobby'
            ? ['#1C2541', '#0B132B', '#0A2A3F']
            : ['#0B132B', '#1C2541', '#03070F'];
  return (
    <View style={styles.fill} pointerEvents="none">
      <LinearGradient colors={colors} style={styles.fill} />
      {scene === 'night' || scene === 'reveal' ? <LightRays /> : null}
      {scene === 'night' ? <SharkShadow top={height * 0.32} duration={16000} /> : null}
      {scene === 'night' ? <SharkShadow top={height * 0.55} duration={21000} flip /> : null}
      {scene === 'lobby' ? <Waves color="rgba(72, 202, 228, 0.6)" top={height * 0.86} /> : null}
      <Bubbles
        count={scene === 'night' ? 18 : 10}
        color={scene === 'end_shark' ? 'rgba(255, 120, 120, 0.7)' : 'rgba(160, 230, 255, 0.7)'}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Aşama geçişi: kısa tam ekran yazı ("DALIŞ", "PLAJ"...) ve ekran sarsıntısı
// ---------------------------------------------------------------------------

export function PhaseFlash({ flashKey, text, sub, color }: {
  flashKey: string | null;
  text: string;
  sub?: string;
  color: string;
}) {
  const [v] = useState(() => new Animated.Value(0));
  // Ekrana girildiğindeki aşama için efekt oynamaz; yalnızca sonraki değişimlerde
  const last = useRef<string | null>(flashKey);
  const [shown, setShown] = useState<{ text: string; sub?: string; color: string } | null>(null);
  useEffect(() => {
    if (!flashKey || last.current === flashKey) return;
    last.current = flashKey;
    if (!text) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aşama değişti: geçiş yazısı gösterilir
    setShown({ text, sub, color });
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.delay(1100),
      Animated.timing(v, { toValue: 0, duration: 520, useNativeDriver: NATIVE }),
    ]).start(() => setShown(null));
  }, [flashKey, text, sub, color, v]);
  if (!shown) return null;
  return (
    <Animated.View style={[styles.fill, styles.flash, { opacity: v }]} pointerEvents="none">
      <View style={[styles.fill, { backgroundColor: shown.color, opacity: 0.55 }]} />
      <Animated.Text
        style={[
          styles.flashText,
          { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }] },
        ]}
      >
        {shown.text}
      </Animated.Text>
      {shown.sub ? <Text style={styles.flashSub}>{shown.sub}</Text> : null}
    </Animated.View>
  );
}

/** `shakeKey` değişince içeriği kısa sarsar (ölüm, kafes) */
export function Shake({ shakeKey, children }: { shakeKey: string | null; children: ReactNode }) {
  const [x] = useState(() => new Animated.Value(0));
  const last = useRef<string | null>(shakeKey);
  useEffect(() => {
    if (!shakeKey || last.current === shakeKey) return;
    last.current = shakeKey;
    Animated.sequence(
      [10, -10, 8, -8, 4, -4, 0].map((to) =>
        Animated.timing(x, { toValue: to, duration: 55, useNativeDriver: NATIVE }),
      ),
    ).start();
  }, [shakeKey, x]);
  return <Animated.View style={[styles.flex, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------
// Rol çarkı
// ---------------------------------------------------------------------------

/** Çark döner ve oyuncunun rolünde durur (rolü sunucu seçer; çark yalnızca görüntü). */
export function RoleWheel({ role, size, onDone }: { role: SkRole; size: number; onDone?: () => void }) {
  const [rot] = useState(() => new Animated.Value(0));
  const n = SK_WHEEL.length;
  const idx = Math.max(0, SK_WHEEL.indexOf(role));
  const step = 360 / n;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    // Seçilen dilim en üste (ok altına) gelecek şekilde 5 tam tur + dilim açısı kadar döner
    const target = 360 * 5 - idx * step;
    Animated.timing(rot, {
      toValue: target,
      duration: 3600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start(() => done.current?.());
  }, [rot, idx, step]);
  const rotate = rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const r = size / 2 - 26;
  return (
    <View style={{ width: size, height: size + 16, alignItems: 'center' }}>
      <View style={styles.wheelPointer} />
      <Animated.View
        style={[styles.wheel, { width: size, height: size, borderRadius: size / 2, transform: [{ rotate }] }]}
      >
        {SK_WHEEL.map((k, i) => {
          const a = (i * step - 90) * (Math.PI / 180);
          return (
            <View
              key={k}
              style={[
                styles.wheelSlot,
                {
                  left: size / 2 + r * Math.cos(a) - 18,
                  top: size / 2 + r * Math.sin(a) - 18,
                  backgroundColor: SK_ROLES[k].color + '33',
                  borderColor: SK_ROLES[k].color,
                  transform: [{ rotate: `${i * step}deg` }],
                },
              ]}
            >
              <Text style={styles.wheelEmoji}>{SK_ROLES[k].emoji}</Text>
            </View>
          );
        })}
        <View style={styles.wheelHub}>
          <Text style={styles.wheelHubText}>?</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Koltuklar: numaralı avatarlar, oy tabelası, aldığı oy
// ---------------------------------------------------------------------------

export type Seat = {
  p: SkPlayer;
  /** Dokununca seçilir */
  selectable?: boolean;
  /** Seçilemez (soluk) */
  dim?: boolean;
  /**
   * Avatarın altındaki tabela: kime oy verdi (koltuk no) ya da 'PAS'; köpekbalığı av seçimi için 'hunt' türü.
   * `target` doluysa tabeladaki ok o kişinin avatarına döner.
   */
  sign?: { text: string; kind: 'vote' | 'pass' | 'hunt' | 'double'; target?: string | null } | null;
  /** Aldığı (ağırlıklı) kafes oyu */
  votesIn?: number;
  /** Avatarın sağ altındaki durum rozeti (emoji) */
  badge?: string | null;
  /** Adın altındaki satır */
  label?: { text: string; color: string } | null;
  /** Ölüyse nasıl elendi */
  deadLabel?: string | null;
  /** Köpekbalığıysan: takım arkadaşın */
  ally?: boolean;
  /** Çerçeve rengi: takım arkadaşı yeşil, bilinmeyen sarı, rolü açığa çıkan rakip kırmızı (ince) */
  frame?: string;
  /** Sörfçü'nün işaretlediği kişi */
  marked?: boolean;
  /** Rol simgesi (avatarın alt ortasında). Yalnızca görmeye hakkın olan roller gelir (sunucu süzer). */
  roleEmoji?: { emoji: string; color: string } | null;
};

const GAP = 6;
/** Avatarın dışındaki yükseklik: ad, alt satır ve alttaki tabela */
const EXTRA = 70;
const MAX_AVATAR = 78;

function fit(n: number, w: number, h: number): { cols: number; size: number } {
  let best = { cols: Math.min(4, Math.max(1, n)), size: 24 };
  for (let cols = 2; cols <= 6; cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = (w - GAP * (cols - 1)) / cols;
    const byW = tileW - 14;
    const byH = (h - GAP * (rows - 1)) / rows - EXTRA;
    const size = Math.floor(Math.min(byW, byH, MAX_AVATAR));
    if (size > best.size) best = { cols, size };
  }
  return best;
}

export function SeatGrid({
  seats,
  selected,
  accent,
  light,
  onPress,
}: {
  seats: Seat[];
  selected?: string | null;
  accent: string;
  /** Açık zemin (plaj): yazılar koyu */
  light?: boolean;
  onPress?: (s: Seat) => void;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || Math.abs(box.w - width) > 1 || Math.abs(box.h - height) > 1) setBox({ w: width, h: height });
  };
  const { cols, size } = box ? fit(seats.length, box.w, box.h) : { cols: 4, size: 0 };
  const tileW = box ? Math.floor((box.w - GAP * (cols - 1)) / cols) : 0;
  // Tabeladaki okun yönü: oy verenin avatarından oy verilenin avatarına (ızgaradaki konumlarından hesaplanır;
  // satırlar ortalandığı için eksik son satırın kayması da hesaba katılır)
  const tileH = size + EXTRA;
  const center = new Map<string, { x: number; y: number }>();
  seats.forEach((s, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, seats.length - row * cols);
    const offset = box ? (box.w - (inRow * tileW + (inRow - 1) * GAP)) / 2 : 0;
    const col = i - row * cols;
    center.set(s.p.id, { x: offset + col * (tileW + GAP) + tileW / 2, y: row * (tileH + GAP) });
  });
  const angleOf = (from: string, to: string | null | undefined): number | null => {
    if (!to) return null;
    const a = center.get(from);
    const b = center.get(to);
    if (!a || !b) return null;
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };
  return (
    <View style={styles.gridBox} onLayout={onLayout}>
      {box && size > 0 ? (
        <ScrollView contentContainerStyle={styles.gridScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {seats.map((s) => (
              <SeatTile
                key={s.p.id}
                seat={s}
                width={tileW}
                size={size}
                selected={selected === s.p.id}
                accent={accent}
                light={!!light}
                arrow={angleOf(s.p.id, s.sign?.target)}
                onPress={onPress}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function SeatTile({
  seat,
  width,
  size,
  selected,
  accent,
  light,
  arrow,
  onPress,
}: {
  seat: Seat;
  width: number;
  size: number;
  selected: boolean;
  accent: string;
  light: boolean;
  /** Tabeladaki okun açısı (derece; 0 = sağa) */
  arrow: number | null;
  onPress?: (s: Seat) => void;
}) {
  const p = seat.p;
  const dead = !p.is_alive;
  const pulse = usePingPong(700);
  const ring = selected
    ? accent
    : (seat.frame ?? (p.is_me ? '#48CAE4' : light ? 'rgba(11,19,43,0.35)' : 'rgba(255,255,255,0.5)'));
  const nameColor = dead ? (light ? 'rgba(11,19,43,0.45)' : 'rgba(255,255,255,0.45)') : light ? '#0B132B' : '#FFFFFF';
  const label = [
    `${p.seat} numara`,
    p.name,
    p.is_me ? 'sen' : null,
    dead ? (seat.deadLabel ?? 'elendi') : 'hayatta',
    seat.votesIn ? `${seat.votesIn} oy aldı` : null,
    seat.sign ? (seat.sign.kind === 'pass' ? 'pas geçti' : `oyu: ${seat.sign.text}`) : null,
    seat.label?.text ?? null,
  ]
    .filter(Boolean)
    .join(', ');
  const outer = size + 8;
  return (
    <Pressable
      onPress={onPress ? () => onPress(seat) : undefined}
      disabled={!onPress}
      accessibilityRole={seat.selectable ? 'radio' : 'button'}
      accessibilityState={seat.selectable ? { selected, disabled: seat.dim } : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { width }, seat.dim && styles.dim, pressed && styles.pressed]}
    >
      <View style={{ width: outer, height: outer, marginTop: 6 }}>
        {selected ? (
          <Animated.View
            style={[
              styles.selGlow,
              {
                width: outer + 10,
                height: outer + 10,
                borderRadius: (outer + 10) / 2,
                borderColor: accent,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) }],
              },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.ring,
            { borderRadius: outer / 2, borderColor: ring, borderWidth: selected ? 3 : 2 },
            seat.ally && styles.allyGlow,
          ]}
        >
          <View style={dead ? styles.deadAvatar : undefined}>
            <Avatar index={p.avatar ?? 1} size={size} />
          </View>
          {dead ? (
            <View style={[styles.deadMark, { borderRadius: size / 2 }]}>
              <Text style={{ fontSize: Math.round(size * 0.42) }}>{p.left ? '🚪' : p.revealed ? '⛓️' : '🤿'}</Text>
            </View>
          ) : null}
        </View>
        {/* Koltuk numarası: büyük ve belirgin */}
        <View style={[styles.seatNo, size < 44 && styles.seatNoSmall]}>
          <Text style={[styles.seatNoText, size < 44 && styles.seatNoTextSmall]}>{p.seat}</Text>
        </View>
        {/* Aldığı kafes oyu */}
        {seat.votesIn ? (
          <View style={styles.votesIn}>
            <Text style={styles.votesInText}>{seat.votesIn}</Text>
            <Text style={styles.votesInSub}>oy</Text>
          </View>
        ) : null}
        {seat.badge && !dead ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{seat.badge}</Text>
          </View>
        ) : null}
        {seat.roleEmoji ? (
          <View style={[styles.roleBadge, { borderColor: seat.roleEmoji.color }]}>
            <Text style={styles.badgeText}>{seat.roleEmoji.emoji}</Text>
          </View>
        ) : null}
        {p.marshal ? (
          <View style={[styles.badge, styles.badgeLeft]}>
            <Text style={styles.badgeText}>🎖️</Text>
          </View>
        ) : seat.marked ? (
          <View style={[styles.badge, styles.badgeLeft]}>
            <Text style={styles.badgeText}>📍</Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[styles.name, { color: nameColor }, light ? styles.nameLight : styles.nameDark, dead && styles.nameDead]}
        numberOfLines={1}
      >
        {p.is_me ? `${p.name} (sen)` : p.name}
      </Text>
      <Text
        style={[
          styles.label,
          { color: dead ? (light ? '#9B1C2E' : '#FF8A98') : (seat.label?.color ?? (light ? '#24324F' : 'rgba(255,255,255,0.7)')) },
          !light && styles.nameDark,
        ]}
        numberOfLines={1}
      >
        {dead ? (seat.deadLabel ?? 'Elendi') : (seat.label?.text ?? ' ')}
      </Text>
      {/* Tabela (avatarın altında): kime oy verdiği; ok oy verilen kişinin avatarına döner */}
      <View style={styles.signSlot}>
        {seat.sign ? (
          <View
            style={[
              styles.sign,
              seat.sign.kind === 'pass' && styles.signPass,
              seat.sign.kind === 'hunt' && styles.signHunt,
              seat.sign.kind === 'double' && styles.signDouble,
            ]}
          >
            {arrow !== null ? (
              <Ionicons
                name="arrow-forward"
                size={15}
                color={seat.sign.kind === 'hunt' ? '#FF8A98' : '#3B220B'}
                style={{ transform: [{ rotate: `${Math.round(arrow)}deg` }] }}
              />
            ) : null}
            <Text style={[styles.signText, seat.sign.kind === 'hunt' && styles.signTextHunt]}>{seat.sign.text}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Ortadaki karar yazısı ve oksijen / güneş sayacı
// ---------------------------------------------------------------------------

export function Prompt({ title, sub, color, light, pulse }: {
  title: string;
  sub?: string | null;
  color?: string;
  light?: boolean;
  pulse?: boolean;
}) {
  const p = usePingPong(900);
  const scale = pulse ? p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) : 1;
  return (
    <View style={[styles.prompt, light ? styles.promptLight : styles.promptDark]} accessibilityLiveRegion="polite">
      <Animated.Text
        style={[styles.promptTitle, { color: color ?? (light ? '#0B132B' : '#FFFFFF'), transform: [{ scale }] }]}
        numberOfLines={2}
      >
        {title}
      </Animated.Text>
      {sub ? (
        <Text style={[styles.promptSub, { color: light ? '#24324F' : 'rgba(255,255,255,0.78)' }]} numberOfLines={3}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Kalan süre: gece "Oksijen %", gündüz tartışma / oylama saati */
export function TimeBar({ kind, left, limit, light }: {
  kind: 'oxygen' | 'sun' | 'vote' | 'plain';
  left: number;
  limit: number;
  light?: boolean;
}) {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, left / limit)) : 0;
  const s = Math.max(0, Math.ceil(left));
  const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const low = s <= 5 && left > 0;
  const text =
    kind === 'oxygen'
      ? `🫧 Oksijen %${Math.round(ratio * 100)}`
      : kind === 'sun'
        ? `☀️ Tartışma ${clock}`
        : kind === 'vote'
          ? `⛓️ Oylamaya kalan ${clock}`
          : `⏳ ${clock}`;
  const fill = kind === 'oxygen' ? (ratio > 0.35 ? '#48CAE4' : '#FF4D4D') : kind === 'sun' ? '#FFB703' : '#FF4D4D';
  return (
    <View style={styles.time} accessibilityLabel={text}>
      <Text style={[styles.timeText, { color: low ? '#FF4D4D' : light ? '#0B132B' : '#FFFFFF' }]}>
        {left > 0 ? text : 'Süre doldu…'}
      </Text>
      <View style={[styles.timeBar, light && styles.timeBarLight]}>
        <View style={[styles.timeFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Koyu alt pencere (oyunun içinde açılan rol, notlar, sohbet pencereleri)
// ---------------------------------------------------------------------------

export function SkSheet({ title, icon, onClose, children }: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.sheetRoot} inModal>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.sheet, { maxHeight: Math.round(height * 0.82) }]} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            {icon ? <Text style={styles.sheetIcon}>{icon}</Text> : null}
            <Text style={styles.sheetTitle} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sohbet kutusu (köpekbalıkları / elenenler)
// ---------------------------------------------------------------------------

export function ChatBox({
  messages,
  canWrite,
  placeholder,
  onSend,
  onReport,
  emptyText,
}: {
  messages: SkMsg[];
  canWrite: boolean;
  placeholder: string;
  onSend: (body: string) => Promise<string | null>;
  onReport: (m: SkMsg) => void;
  emptyText: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = text.trim();
  async function send() {
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSend(body);
    setBusy(false);
    if (err) setError(err);
    else setText('');
  }
  return (
    <View style={styles.chat}>
      {messages.length === 0 ? (
        <Text style={styles.chatEmpty}>{emptyText}</Text>
      ) : (
        messages.slice(-40).map((m) => (
          <Pressable
            key={m.id}
            onLongPress={m.mine ? undefined : () => onReport(m)}
            delayLongPress={400}
            accessibilityHint={m.mine ? undefined : 'Bildirmek için uzun bas'}
            style={[styles.msg, m.mine ? styles.mine : styles.theirs]}
          >
            {!m.mine ? <Text style={styles.msgName}>{m.name}</Text> : null}
            <Text style={styles.msgBody}>{m.body}</Text>
          </Pressable>
        ))
      )}
      {canWrite ? (
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.45)"
            maxLength={120}
            style={styles.input}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            accessibilityLabel={placeholder}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!body || busy}
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            style={[styles.send, (!body || busy) && styles.off]}
          >
            <Ionicons name="send" size={18} color="#06201D" />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.chatError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  bubble: { position: 'absolute', top: 0, borderWidth: 1.2, backgroundColor: 'rgba(160, 230, 255, 0.08)' },
  bubbleShine: { position: 'absolute', top: '18%', left: '22%', backgroundColor: 'rgba(255,255,255,0.8)' },
  ray: { position: 'absolute', top: -40 },
  shadowShark: { position: 'absolute', left: 0, fontSize: 64, opacity: 0.12 },
  diver: { position: 'absolute', left: 0, top: 0, fontSize: 34 },
  band: { position: 'absolute', left: 0, right: 0 },
  waveRow: { position: 'absolute', left: 0, height: 18, flexDirection: 'row' },
  waveCrest: { height: 18, marginRight: -18 },
  sunWrap: { position: 'absolute', top: 70, right: 28, width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  sunGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFD166' },
  sun: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFB703' },
  sparkle: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  voteTint: { backgroundColor: 'rgba(255, 77, 77, 0.08)' },
  flash: { alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  flashText: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 44,
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 14,
  },
  flashSub: { marginTop: 6, color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 16 },
  wheel: {
    borderWidth: 4,
    borderColor: '#48CAE4',
    backgroundColor: 'rgba(28, 37, 65, 0.85)',
  },
  wheelPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFB703',
    marginBottom: -4,
    zIndex: 2,
  },
  wheelSlot: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelEmoji: { fontSize: 19 },
  wheelHub: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 28,
    backgroundColor: '#0B132B',
    borderWidth: 3,
    borderColor: '#FFB703',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelHubText: { color: '#FFB703', fontFamily: fonts.black, fontSize: 26 },
  gridBox: { flex: 1, minHeight: 60 },
  gridScroll: { flexGrow: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: GAP, rowGap: GAP },
  tile: { alignItems: 'center' },
  dim: { opacity: 0.38 },
  signSlot: { height: 26, justifyContent: 'flex-start', alignItems: 'center', marginTop: 2 },
  sign: {
    flexDirection: 'row',
    gap: 2,
    minWidth: 34,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0A96D',
    borderWidth: 1.5,
    borderColor: '#7A4A1E',
  },
  signPass: { backgroundColor: '#C9CED6', borderColor: '#5B6472' },
  signHunt: { backgroundColor: '#3A0710', borderColor: '#FF4D4D' },
  signDouble: { backgroundColor: '#FFB703', borderColor: '#7A4A1E' },
  signText: { color: '#3B220B', fontFamily: fonts.black, fontSize: 13.5 },
  signTextHunt: { color: '#FF8A98' },
  selGlow: { position: 'absolute', left: -5, top: -5, borderWidth: 3 },
  ring: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  allyGlow: { shadowColor: '#34D399', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  deadAvatar: { opacity: 0.32 },
  deadMark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 15, 30, 0.35)',
  },
  seatNo: {
    position: 'absolute',
    top: -4,
    left: -6,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 4,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 2,
    borderColor: '#FFB703',
  },
  seatNoSmall: { minWidth: 20, height: 20, borderRadius: 10, top: -3, left: -4 },
  seatNoText: { color: '#FFB703', fontFamily: fonts.black, fontSize: 14 },
  seatNoTextSmall: { fontSize: 11 },
  votesIn: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 28,
    paddingHorizontal: 4,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9304F',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  votesInText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 13, lineHeight: 14 },
  votesInSub: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 7.5, lineHeight: 8 },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 19, 43, 0.85)',
  },
  badgeLeft: { right: undefined, left: -4 },
  roleBadge: {
    position: 'absolute',
    // Avatarın içinde, alt ortada (avatarın üstüne biner)
    bottom: 6,
    left: '50%',
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 19, 43, 0.92)',
  },
  badgeText: { fontSize: 12 },
  name: { marginTop: 4, maxWidth: '100%', fontFamily: fonts.extra, fontSize: 12 },
  nameDark: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
  nameLight: {},
  nameDead: { textDecorationLine: 'line-through' },
  label: { maxWidth: '100%', fontFamily: fonts.semi, fontSize: 10.5 },
  prompt: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  promptDark: { backgroundColor: 'rgba(11, 19, 43, 0.62)', borderWidth: 1, borderColor: 'rgba(72, 202, 228, 0.35)' },
  promptLight: { backgroundColor: 'rgba(255, 255, 255, 0.78)', borderWidth: 1, borderColor: 'rgba(224, 169, 109, 0.6)' },
  promptTitle: { fontFamily: fonts.black, fontSize: 21, textAlign: 'center', letterSpacing: 0.5 },
  promptSub: { fontFamily: fonts.semi, fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  time: { gap: 3 },
  timeText: { fontFamily: fonts.extra, fontSize: 12.5, textAlign: 'center' },
  timeBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  timeBarLight: { backgroundColor: 'rgba(11,19,43,0.15)' },
  timeFill: { height: '100%', borderRadius: 3 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#111A35',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.35)',
    paddingBottom: 24,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 },
  sheetIcon: { fontSize: 22 },
  sheetTitle: { flex: 1, color: '#FFFFFF', fontFamily: fonts.black, fontSize: 18 },
  sheetBody: { gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  chat: { gap: 8 },
  chatEmpty: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  msg: { maxWidth: '85%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: 'rgba(72, 202, 228, 0.3)' },
  theirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)' },
  msgName: { color: '#B7A8FF', fontSize: 11, fontFamily: fonts.semi },
  msgBody: { color: '#FFFFFF', fontSize: 14, lineHeight: 19 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#48CAE4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
  chatError: { color: '#FF8A98', fontSize: 12, textAlign: 'center' },
});
