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
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Image } from 'expo-image';
import { AVATAR_COUNT, avatarImages } from '@/lib/images';
import { KeyboardLift } from '@/components/KeyboardLift';
import { RoleIcon } from '@/components/RoleIcon';
import { isRoleKey, roleInfo } from '@/lib/roles';
import {
  SK_ROLES,
  SK_TEAMS,
  SK_WHEEL,
  type SkMsg,
  type SkNote,
  type SkPlayer,
  type SkRole,
} from '@/lib/shark';
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

/**
 * Ufuktaki güneş: küçük ve soluk sarı (üstteki süre çubuğunun turuncusuyla karışmasın). Ufuk çizgisinin hemen üstünde,
 * solda durur; alt yarısı arkasından çizilen deniz bandının altında kalır (batan güneş görünümü).
 */
function Sun({ top }: { top: number }) {
  const p = usePingPong(2600);
  return (
    <View style={[styles.sunWrap, { top: top - 30 }]} pointerEvents="none">
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
      <Sun top={surface} />
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
        <Sun top={height * 0.6} />
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
        <Sun top={height * 0.62} />
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
export function RoleWheel({
  role,
  size,
  onDone,
  odds,
  wheel,
}: {
  role: string;
  size: number;
  onDone?: () => void;
  /** Her rolün bu oyundaki kişi başı gelme oranı (yüzde); bu oyunda olamayan rol soluk görünür */
  odds?: Partial<Record<string, number>> | null;
  /** Çarktaki roller (varsayılan: Köpekbalığı Kafesi rolleri) */
  wheel?: string[];
}) {
  const list: string[] = wheel ?? SK_WHEEL;
  const [rot] = useState(() => new Animated.Value(0));
  const n = list.length;
  const idx = Math.max(0, list.indexOf(role));
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
        {list.map((k, i) => {
          const a = (i * step - 90) * (Math.PI / 180);
          return (
            <View
              key={k}
              style={[
                styles.wheelSlot,
                {
                  left: size / 2 + r * Math.cos(a) - 18,
                  top: size / 2 + r * Math.sin(a) - 18,
                  backgroundColor: (roleInfo(k)?.color ?? '#FFFFFF') + '33',
                  borderColor: roleInfo(k)?.color ?? '#FFFFFF',
                  transform: [{ rotate: `${i * step}deg` }],
                },
              ]}
            >
              <RoleIcon role={k} size={32} style={odds && !odds[k] ? styles.dim : undefined} />
              {odds ? (
                <Text style={[styles.wheelOdds, !odds[k] && styles.dim]}>{odds[k] ? `%${odds[k]}` : '–'}</Text>
              ) : null}
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

/** Avatarın altında rumuz kodu yazmaz: "Lakap#1234" → "Lakap" */
export function shortName(name: string): string {
  return name.replace(/#\d+\s*$/, '').trim() || name;
}

/** Bu oyuncuyu ilgilendiren olay (avlandı, vuruldu, kafeste, kurtarıldı…): avatar büyür, üstünde simge ve kelime çıkar */
export type SeatEvent = { icon: string; text: string; color: string };

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
  /** Dalışta köpekbalıklarının bu kişiye verdiği toplam av oyu (yalnızca köpekbalıkları ve anlatıcı görür) */
  huntIn?: number;
  /** Avatarın sağ altındaki durum rozeti (emoji) */
  badge?: string | null;
  /** Adın altındaki satır (tabela yoksa görünür) */
  label?: { text: string; color: string } | null;
  /** Ölüyse nasıl elendi */
  deadLabel?: string | null;
  /** Ölü avatarın üstündeki simge (🤿 gece, ⛓️ kafes, 🔱 zıpkın, 🚪 ayrıldı) */
  deadIcon?: string;
  /** Köpekbalığıysan: takım arkadaşın */
  ally?: boolean;
  /** Çerçeve rengi: takım arkadaşı yeşil, bilinmeyen sarı, rolü açığa çıkan rakip kırmızı (ince) */
  frame?: string;
  /** Sörfçü'nün işaretlediği kişi */
  marked?: boolean;
  /** Rol simgesi (avatarın alt ortasında). Yalnızca görmeye hakkın olan roller gelir (sunucu süzer). */
  roleEmoji?: { emoji: string; color: string; role?: string } | null;
  /** Bu oyuncuyu ilgilendiren olay */
  event?: SeatEvent | null;
  /** Oylamada henüz oy vermedi: avatarda soru işareti sallanır */
  thinking?: boolean;
  /** Şu an bas-konuş sesi çalınan kişi: avatar öne çıkar, büyür */
  speaking?: boolean;
  /** Konuşanın avatarında kırmızı ünlem: dokununca sesi şikâyet et */
  alert?: boolean;
};

/**
 * Rol yeteneğinin hedefe "atılması": simge senin avatarından seçtiğin avatara rolüne uygun hareketle gider ve orada
 * kalır. throw = kavisli atış ve dönme (şamandıra, işaret), swim = dalgalanarak yüzme (köpekbalığı, kaplan, mürekkep),
 * shot = dümdüz hızlı atış (zıpkın), smash = gelip vurma (çekiç), float = süzülme (hemşire, dürbün).
 */
export type MarkKind = 'throw' | 'swim' | 'shot' | 'smash' | 'float';
export type SeatMark = { from: string | null; to: string; icon: string; kind: MarkKind };

const GAP = 4;
/**
 * Avatarın dışındaki SABİT yükseklik: üst boşluk 4 + çerçeve 8 + ad 4+16 + alt satır (tabela) 28. Olay balonu üst
 * satırın üstüne biner (yer kaplamaz). Kutucuk yüksekliği hep avatar + EXTRA'dır; dokununca, oy verince ya da yazı
 * değişince hiçbir şey kaymaz.
 */
/** Kare kutucuğun üstünde numara rozetine yer (rozet kutunun üst kenarına biner) */
const TOP_PAD = 10;
/** Kutucuğun altındaki satır: oy tabelası ya da durum yazısı */
const SLOT_H = 24;
const EXTRA = TOP_PAD + SLOT_H;
const MAX_AVATAR = 160;
const MIN_AVATAR = 30;

/** Her satırda hep 4 kare kutucuk; kaydırmadan sığacak en büyük boyut */
const COLS = 4;
function fit(n: number, w: number, h: number): { cols: number; size: number } {
  const rows = Math.max(1, Math.ceil(n / COLS));
  const tileW = (w - GAP * (COLS - 1)) / COLS;
  const byW = tileW - 2;
  const byH = (h - GAP * (rows - 1)) / rows - EXTRA;
  return { cols: COLS, size: Math.max(MIN_AVATAR, Math.floor(Math.min(byW, byH, MAX_AVATAR))) };
}

/** Kutucuğu tam dolduran avatar görseli (ileride profil fotoğrafı) */
function SquareAvatar({ index, size }: { index: number; size: number }) {
  const safe = Math.min(Math.max(Math.round(index) || 1, 1), AVATAR_COUNT);
  const src = avatarImages[safe - 1];
  return (
    <View style={{ width: size, height: size, backgroundColor: '#1C2541' }}>
      {src ? <Image source={src} contentFit="cover" style={{ width: size, height: size }} /> : null}
    </View>
  );
}

/**
 * Avatar boyutu oyun boyunca sabit kalsın: aynı oda ve aynı oyuncu sayısı için şimdiye kadarki en küçük boyut
 * kullanılır (aşama değişip alttaki alan büyüyüp küçülse de avatarlar yer ve boyut değiştirmez).
 */
const stickySize = new Map<string, number>();

export function SeatGrid({
  seats,
  selected,
  accent,
  light,
  onPress,
  onLongPress,
  onAlert,
  mark,
  stickyKey,
  slots,
  onEmptyPress,
}: {
  /** Boyutu sabitlemek için (oda kimliği) */
  stickyKey?: string;
  /**
   * Bu kadar numaralı kutucuk çizilir, oyuncular koltuk numaralarındaki kutucukta durur (bekleme odası ve oyun);
   * bekleme odasında boş kutucuğa dokununca oraya geçilir (onEmptyPress). Verilmezse yalnızca oyuncular dizilir.
   */
  slots?: number;
  onEmptyPress?: (seatNo: number) => void;
  seats: Seat[];
  selected?: string | null;
  accent: string;
  /** Açık zemin (plaj): yazılar koyu */
  light?: boolean;
  onPress?: (s: Seat) => void;
  /** Avatara basılı tutunca (ör. ses mesajını şikâyet et) */
  onLongPress?: (s: Seat) => void;
  /** Konuşanın avatarındaki kırmızı ünleme dokununca */
  onAlert?: (s: Seat) => void;
  /** Rol yeteneğinin seçilen avatara atılan simgesi */
  mark?: SeatMark | null;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || Math.abs(box.w - width) > 1 || Math.abs(box.h - height) > 1) setBox({ w: width, h: height });
  };
  // Kutucuklar: 1..slots (boşlar null); oyunda da aynı düzen kalır, verilmezse yalnızca oyuncular
  const items: (Seat | null)[] = slots
    ? Array.from({ length: Math.max(slots, ...seats.map((x) => x.p.seat)) }, (_, i) => seats.find((x) => x.p.seat === i + 1) ?? null)
    : seats;
  const fitted = box ? fit(items.length, box.w, box.h) : { cols: COLS, size: 0 };
  const cols = fitted.cols;
  let size = fitted.size;
  if (stickyKey && size > 0) {
    const k = `${stickyKey}:${items.length}`;
    const prev = stickySize.get(k);
    if (prev !== undefined && prev < size) size = prev;
    else stickySize.set(k, size);
  }
  const tileW = box ? Math.floor((box.w - GAP * (cols - 1)) / cols) : 0;
  // Tabeladaki okun yönü: oy verenin avatarından oy verilenin avatarına (ızgaradaki konumlarından hesaplanır;
  // satırlar ortalandığı için eksik son satırın kayması da hesaba katılır)
  const tileH = size + EXTRA;
  const center = new Map<string, { x: number; y: number }>();
  items.forEach((s, i) => {
    if (!s) return;
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, items.length - row * cols);
    const offset = box ? box.w - (inRow * tileW + (inRow - 1) * GAP) : 0;
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
  // Kaydırma yok: ızgara ayrılan alana sığdırılır ve ortalanır
  return (
    <View style={styles.gridBox} onLayout={onLayout}>
      {box && size > 0 ? (
        <View style={styles.grid}>
          {items.map((s, i) =>
            s === null ? (
              <EmptySlot
                key={`empty-${i + 1}`}
                seatNo={i + 1}
                width={tileW}
                size={size}
                light={!!light}
                onPress={onEmptyPress}
              />
            ) : (
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
              onLongPress={onLongPress}
              onAlert={onAlert}
            />
            ),
          )}
          {mark && center.has(mark.to) ? (
            <FlyingMark
              key={`${mark.to}|${mark.icon}|${mark.kind}`}
              mark={mark}
              // Kutucuğun ortasının biraz üstü
              to={{ x: center.get(mark.to)!.x, y: center.get(mark.to)!.y + TOP_PAD + size * 0.42 }}
              from={
                mark.from && center.has(mark.from) && mark.from !== mark.to
                  ? { x: center.get(mark.from)!.x, y: center.get(mark.from)!.y + TOP_PAD + size / 2 }
                  : null
              }
              size={Math.max(24, Math.min(46, Math.round(size * 0.5)))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Boş kutucuk: numarası yazmaz (biri oturunca belirir); bekleme odasında dokununca oraya geçilir */
function EmptySlot({
  seatNo,
  width,
  size,
  light,
  onPress,
}: {
  seatNo: number;
  width: number;
  size: number;
  light: boolean;
  onPress?: (seatNo: number) => void;
}) {
  return (
    <Pressable
      onPress={onPress ? () => onPress(seatNo) : undefined}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${seatNo}. kutucuk boş${onPress ? ', buraya geç' : ''}`}
      style={({ pressed }) => [styles.tile, { width, height: size + EXTRA }, pressed && styles.pressed]}
      testID={`slot-${seatNo}`}
    >
      <View style={[styles.emptyBox, { width: size, height: size, marginTop: TOP_PAD }, light && styles.emptyBoxLight]}>
        {onPress ? (
          <Ionicons name="add" size={Math.round(size * 0.3)} color={light ? 'rgba(11,19,43,0.35)' : 'rgba(255,255,255,0.45)'} />
        ) : null}
      </View>
    </Pressable>
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
  onLongPress,
  onAlert,
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
  onLongPress?: (s: Seat) => void;
  onAlert?: (s: Seat) => void;
}) {
  const p = seat.p;
  const dead = !p.is_alive;
  const pulse = usePingPong(700);
  // Olay: avatar bir kez zıplayarak büyür ve olay sürdükçe biraz büyük kalır (yerleşimi değiştirmez, kaydırmaz)
  const [pop] = useState(() => new Animated.Value(1));
  const evKey = seat.event ? `${seat.event.icon}|${seat.event.text}` : null;
  useEffect(() => {
    pop.stopAnimation();
    if (!evKey) {
      pop.setValue(1);
      return;
    }
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.3, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.timing(pop, { toValue: 1.12, duration: 320, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE }),
    ]).start();
  }, [evKey, pop]);
  // Konuşan kişi: avatar öne çıkar (büyür), ses bitince yerine döner
  const [talk] = useState(() => new Animated.Value(1));
  const speaking = !!seat.speaking;
  useEffect(() => {
    Animated.spring(talk, { toValue: speaking ? 1.38 : 1, friction: 5, useNativeDriver: NATIVE }).start();
  }, [speaking, talk]);
  // Çerçeve rengi: seçili (vurgu), konuşan (yeşil), olay rengi; yoksa takım ilişkisi (takım arkadaşı yeşil, rakip
  // kırmızı, sen mavi), bilinmeyen soluk beyaz
  const ring = selected
    ? accent
    : speaking
      ? '#34D399'
      : seat.event
        ? seat.event.color
        : (seat.frame ?? (p.is_me ? '#48CAE4' : light ? 'rgba(11,19,43,0.3)' : 'rgba(255,255,255,0.3)'));
  const thick = selected || speaking || !!seat.event || !!seat.frame || p.is_me;
  const label = [
    `${p.seat} numara`,
    p.name,
    p.is_me ? 'sen' : null,
    dead ? (seat.deadLabel ?? 'elendi') : 'hayatta',
    seat.event ? seat.event.text : null,
    seat.votesIn ? `${seat.votesIn} oy aldı` : null,
    seat.huntIn ? `${seat.huntIn} av oyu` : null,
    seat.sign ? (seat.sign.kind === 'pass' ? 'pas geçti' : `oyu ${seat.sign.text.replace(/[⟦⟧]/g, '')} numara`) : null,
    seat.label?.text ?? null,
  ]
    .filter(Boolean)
    .join(', ');
  const small = size < 56;
  const stripH = Math.max(15, Math.round(size * 0.19));
  const lineText = dead ? (seat.deadLabel ?? 'Elendi') : (seat.label?.text ?? null);
  const lineColor = dead
    ? light
      ? '#9B1C2E'
      : '#FF8A98'
    : (seat.label?.color ?? (light ? '#24324F' : 'rgba(255,255,255,0.75)'));
  return (
    <Pressable
      onPress={onPress ? () => onPress(seat) : undefined}
      onLongPress={onLongPress ? () => onLongPress(seat) : undefined}
      delayLongPress={500}
      disabled={!onPress && !onLongPress}
      accessibilityRole={seat.selectable ? 'radio' : 'button'}
      accessibilityState={seat.selectable ? { selected, disabled: seat.dim } : undefined}
      accessibilityLabel={label}
      style={[
        styles.tile,
        { width, height: size + EXTRA },
        (seat.event || speaking) && styles.tileTop,
        speaking && styles.tileTalk,
        seat.dim && styles.dim,
      ]}
    >
      <Animated.View
        style={{ width: size, height: size, marginTop: TOP_PAD, transform: [{ scale: Animated.multiply(pop, talk) }] }}
      >
        {selected ? (
          <Animated.View
            style={[
              styles.selGlow,
              {
                width: size + 10,
                height: size + 10,
                borderRadius: 18,
                borderColor: accent,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }) }],
              },
            ]}
          />
        ) : null}
        {/* Kare kutucuk: avatar görseli kutuyu tam doldurur, altta rumuz şeridi */}
        <View
          style={[
            styles.squareBox,
            { borderColor: ring, borderWidth: thick ? 3 : 1.5 },
            seat.ally && styles.allyGlow,
          ]}
        >
          <View style={dead ? styles.deadAvatar : undefined}>
            <SquareAvatar index={p.avatar ?? 1} size={size} />
          </View>
          {dead ? (
            <View style={styles.deadMark}>
              <Text style={{ fontSize: Math.round(size * 0.36) }}>{seat.deadIcon ?? (p.left ? '🚪' : '🦈')}</Text>
            </View>
          ) : null}
          <View style={[styles.nameStrip, { height: stripH }]}>
            <Text
              style={[styles.stripText, { fontSize: Math.max(9, Math.min(13, Math.round(size * 0.115))) }, dead && styles.nameDead]}
              numberOfLines={1}
            >
              {p.is_me ? `${shortName(p.name)} (sen)` : shortName(p.name)}
            </Text>
          </View>
        </View>
        {/* Koltuk numarası: kutucuğun en üst ortasında */}
        <View style={[styles.seatNo, small && styles.seatNoSmall]}>
          <Text style={[styles.seatNoText, small && styles.seatNoTextSmall]}>{p.seat}</Text>
        </View>
        {/* Köpekbalıklarının (vampirlerin) toplam av oyu */}
        {seat.huntIn ? (
          <View style={[styles.votesIn, styles.huntIn]}>
            <Text style={styles.huntInIcon}>🦈</Text>
            <Text style={styles.votesInText}>{seat.huntIn}</Text>
          </View>
        ) : null}
        {seat.votesIn ? (
          <View style={styles.votesIn}>
            <Text style={styles.votesInText}>{seat.votesIn}</Text>
            <Text style={styles.votesInSub}>oy</Text>
          </View>
        ) : null}
        {seat.badge && !dead ? (
          <View style={[styles.badge, { bottom: stripH + 2 }]}>
            <Text style={styles.badgeText}>{seat.badge}</Text>
          </View>
        ) : null}
        {/* Rol ikonu: kutucuğun orta alt kısmında, rumuz şeridinin hemen üstünde */}
        {seat.roleEmoji ? (
          <View style={[styles.roleBadge, { bottom: stripH + 2 }]} pointerEvents="none">
            {seat.roleEmoji.role ? (
              <RoleIcon role={seat.roleEmoji.role} size={Math.max(18, Math.round(size * 0.27))} framed />
            ) : (
              <Text style={styles.badgeText}>{seat.roleEmoji.emoji}</Text>
            )}
          </View>
        ) : null}
        {p.marshal && !seat.roleEmoji ? (
          <View style={[styles.badge, styles.badgeLeft, { bottom: stripH + 2 }]}>
            <Text style={styles.badgeText}>🎖️</Text>
          </View>
        ) : seat.marked ? (
          <View style={[styles.badge, styles.badgeLeft, { bottom: stripH + 2 }]}>
            <Text style={styles.badgeText}>📍</Text>
          </View>
        ) : null}
        {seat.thinking && !dead ? <Thinking size={size} /> : null}
        {seat.alert && onAlert ? (
          <Pressable
            onPress={() => onAlert(seat)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sesi şikâyet et"
            style={styles.alertBtn}
          >
            <Text style={styles.alertText}>!</Text>
          </Pressable>
        ) : null}
        {seat.event ? (
          <View style={styles.eventWrap} pointerEvents="none">
            <View style={[styles.event, { backgroundColor: seat.event.color }]}>
              <Text style={styles.eventText} numberOfLines={1}>{`${seat.event.icon} ${seat.event.text}`}</Text>
            </View>
          </View>
        ) : null}
      </Animated.View>

      {/* Kutucuğun altı: oy tabelası varsa tabela (ok oy verilen kişiye döner), yoksa durum yazısı */}
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
                size={17}
                color={seat.sign.kind === 'hunt' ? '#FF8A98' : '#3B220B'}
                style={{ transform: [{ rotate: `${Math.round(arrow)}deg` }] }}
              />
            ) : null}
            <RichLine
              text={seat.sign.text}
              chip={18}
              style={[styles.signText, seat.sign.kind === 'hunt' && styles.signTextHunt]}
            />
          </View>
        ) : lineText ? (
          <Text style={[styles.label, { color: lineColor }, !light && styles.nameDark]} numberOfLines={1}>
            {lineText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Rol simgesinin hedefe uçuşu (rolüne uygun hareketle) ve hedefte hafifçe sallanarak kalması */
function FlyingMark({ mark, from, to, size }: {
  mark: SeatMark;
  from: { x: number; y: number } | null;
  to: { x: number; y: number };
  size: number;
}) {
  const [t] = useState(() => new Animated.Value(0));
  const [hit] = useState(() => new Animated.Value(0));
  const bob = usePingPong(1100);
  const start = from ?? { x: to.x, y: to.y - 90 };
  const kind = mark.kind;
  useEffect(() => {
    t.setValue(0);
    hit.setValue(0);
    const dur = kind === 'shot' ? 260 : kind === 'swim' ? 900 : kind === 'float' ? 800 : 620;
    Animated.sequence([
      Animated.timing(t, {
        toValue: 1,
        duration: dur,
        easing: kind === 'shot' ? Easing.in(Easing.quad) : Easing.inOut(Easing.cubic),
        useNativeDriver: NATIVE,
      }),
      // Varışta vurma / sıçrama
      Animated.timing(hit, { toValue: 1, duration: kind === 'smash' ? 360 : 260, useNativeDriver: NATIVE }),
    ]).start();
  }, [t, hit, kind]);
  const half = size / 2;
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: [start.x - half, to.x - half] });
  // Atışta kavis: yolun ortasında yukarı kalkar
  const peak = Math.min(start.y, to.y) - (kind === 'throw' ? 70 : kind === 'smash' ? 40 : 0);
  const ty =
    kind === 'throw' || kind === 'smash'
      ? t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [start.y - half, peak - half, to.y - half] })
      : kind === 'swim'
        ? t.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1],
            outputRange: [
              start.y - half,
              (start.y * 3 + to.y) / 4 - half - 14,
              (start.y + to.y) / 2 - half + 14,
              (start.y + to.y * 3) / 4 - half - 10,
              to.y - half,
            ],
          })
        : t.interpolate({ inputRange: [0, 1], outputRange: [start.y - half, to.y - half] });
  const angle = (Math.atan2(to.y - start.y, to.x - start.x) * 180) / Math.PI;
  const rotate =
    kind === 'throw'
      ? t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] })
      : kind === 'swim'
        ? t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['-18deg', '18deg', '-18deg', '18deg', '0deg'] })
        : kind === 'smash'
          ? hit.interpolate({ inputRange: [0, 0.4, 1], outputRange: ['0deg', '-55deg', '15deg'] })
          : kind === 'shot'
            ? `${Math.round(angle + 45)}deg`
            : '0deg';
  const scale = Animated.multiply(
    t.interpolate({ inputRange: [0, 1], outputRange: [kind === 'shot' ? 1 : 1.7, 1] }),
    hit.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, kind === 'float' ? 1.15 : 1.3, 1] }),
  );
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.mark, { width: size, height: size, transform: [{ translateX: tx }, { translateY: ty }] }]}
    >
      <Animated.View style={{ transform: [{ translateY: bobY }, { rotate }, { scale }] }}>
        <Text style={[styles.markText, { fontSize: Math.round(size * 0.8), lineHeight: size }]}>{mark.icon}</Text>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Atma oylaması bandı (iki oyunda): "⑤ atılsın mı · At 3/5 · 24 sn" ve AT / KALSIN düğmeleri. Atılmak istenen kişi
 * ve oy veremeyenler (elenenler) yalnızca durumu görür.
 */
export function KickBar({
  targetSeat,
  targetName,
  yes,
  need,
  left,
  mine,
  canVote,
  isTarget,
  busy,
  onVote,
  inline,
}: {
  /** Ekranın akışı içinde (üstte asılı değil) */
  inline?: boolean;
  targetSeat?: number;
  targetName: string;
  yes: number;
  need: number;
  left: number;
  mine: boolean;
  canVote: boolean;
  isTarget: boolean;
  busy: boolean;
  onVote: (yes: boolean) => void;
}) {
  return (
    <View style={[styles.kickBar, inline && styles.kickInline]} accessibilityLiveRegion="polite">
      <View style={styles.flex}>
        <RichLine
          align="left"
          chip={18}
          style={styles.kickText}
          text={`🚪 ${targetSeat ? seatTag(targetSeat) : ''} ${targetName} ${isTarget ? 'seni atmak için oylama var' : 'atılsın mı?'}`}
        />
        <Text style={styles.kickText}>{`At ${yes} / ${need} · ${left} sn`}</Text>
      </View>
      {canVote && !isTarget ? (
        <>
          <Pressable
            onPress={() => onVote(true)}
            disabled={busy || mine}
            accessibilityRole="button"
            style={[styles.kickBtn, mine && styles.kickBtnOn]}
          >
            <Text style={[styles.kickBtnText, mine && styles.kickBtnTextOn]}>{mine ? '✓ AT' : 'AT'}</Text>
          </Pressable>
          <Pressable
            onPress={() => onVote(false)}
            disabled={busy || !mine}
            accessibilityRole="button"
            style={[styles.kickBtn, !mine && styles.kickBtnOn]}
          >
            <Text style={[styles.kickBtnText, !mine && styles.kickBtnTextOn]}>KALSIN</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/** Oy vermeyi düşünen oyuncu: avatarın üstünde sallanan soru işareti */
function Thinking({ size }: { size: number }) {
  const swing = usePingPong(650);
  return (
    <View style={styles.thinkWrap} pointerEvents="none">
      <Animated.Text
        style={[
          styles.thinkText,
          {
            fontSize: Math.max(16, Math.round(size * 0.34)),
            transform: [{ rotate: swing.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '20deg'] }) }],
          },
        ]}
      >
        ?
      </Animated.Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Yuvarlak koltuk numarası (yazıların içinde de avatardaki gibi görünür)
// ---------------------------------------------------------------------------

/**
 * Düz yazıda (düğme, pencere) koltuk numarası yuvarlak içinde: 7 → "⑦". Rumuzdaki #145 gibi sayılarla karışmasın diye
 * oyuncu numarası hiçbir yerde "#7" biçiminde yazılmaz.
 */
export const circ = (n: number | undefined | null): string =>
  n && n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : n ? `(${n})` : '?';

/** Yazıların içinde koltuk numarası: `seatTag(7)` → "⟦7⟧"; ekranda avatardaki gibi yuvarlak rozet olur */
export const seatTag = (n: number | undefined | null): string => (n ? `⟦${n}⟧` : '?');

export function SeatChip({ n, size = 20 }: { n: number; size?: number }) {
  return (
    <View style={[styles.seatChip, { minWidth: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.seatChipText, { fontSize: Math.round(size * 0.58), lineHeight: Math.round(size * 0.72) }]}>
        {n}
      </Text>
    </View>
  );
}

/**
 * Bu oyundaki roller (Wolvesville'deki gibi): her rol, sayısı ve rolü açığa çıkmış (ya da senin bildiğin) oyuncuların
 * numarası. Ölenin numarasının üstü çizilir. Sıra: köpekbalıkları, insanlar, tarafsızlar.
 */
export function RoleRoster({
  roles,
  players,
  order: given,
}: {
  roles: Partial<Record<string, number>>;
  players: { id: string; seat: number; role: string | null; is_alive: boolean; left: boolean }[];
  /** Rollerin sırası (varsayılan: Köpekbalığı Kafesi rolleri) */
  order?: string[];
}) {
  const sideRank = { evil: 0, good: 1, neutral: 2 } as const;
  const order = (given ?? (Object.keys(SK_ROLES) as string[])).filter((k) => (roles[k] ?? 0) > 0 && roleInfo(k));
  order.sort((a, b) => sideRank[roleInfo(a)!.side] - sideRank[roleInfo(b)!.side]);
  return (
    <View style={styles.roster}>
      {order.map((k) => {
        const who = players.filter((p) => p.role === k).sort((a, b) => a.seat - b.seat);
        return (
          <View key={k} style={styles.rosterRow} accessibilityLabel={`${roleInfo(k)!.name}, ${roles[k]} kişi`}>
            <RoleIcon role={k} size={26} framed />
            <Text style={[styles.rosterName, { color: roleInfo(k)!.color }]} numberOfLines={1}>
              {roleInfo(k)!.name}
            </Text>
            <Text style={styles.rosterCount}>{`×${roles[k]}`}</Text>
            <View style={styles.rosterSeats}>
              {who.map((p) => (
                <View key={p.id} style={!p.is_alive || p.left ? styles.rosterDead : undefined}>
                  <SeatChip n={p.seat} size={22} />
                  {!p.is_alive || p.left ? <View style={styles.rosterStrike} pointerEvents="none" /> : null}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Metindeki ⟦7⟧ işaretlerini yuvarlak koltuk numarasına çevirir; kelimeler ortalanarak alt satıra geçer */
export function RichLine({
  text,
  style,
  chip = 20,
  align = 'center',
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  chip?: number;
  align?: 'center' | 'left';
}) {
  const nodes: ReactNode[] = [];
  text.split(/(⟦\d+⟧|⟦r:[a-z]+⟧)/).forEach((part, i) => {
    const m = /^⟦(\d+)⟧$/.exec(part);
    if (m) {
      nodes.push(<SeatChip key={i} n={Number(m[1])} size={chip} />);
      return;
    }
    // ⟦r:alpha⟧ → rol ikonu
    const r = /^⟦r:([a-z]+)⟧$/.exec(part);
    if (r && isRoleKey(r[1])) {
      nodes.push(<RoleIcon key={i} role={r[1]} size={Math.round(chip * 1.1)} framed />);
      return;
    }
    part.split(/\s+/).forEach((w, j) => {
      if (w) {
        nodes.push(
          <Text key={`${i}-${j}`} style={style}>
            {w}
          </Text>,
        );
      }
    });
  });
  return <View style={[styles.richLine, align === 'left' && styles.richLeft]}>{nodes}</View>;
}

// ---------------------------------------------------------------------------
// Üstteki tabela: yapman gereken şey + olay akışı (oyuncu çoğaldıkça küçülür, yüksekliği sabittir)
// ---------------------------------------------------------------------------

export function Prompt({ title, lines, color, light, pulse, compact }: {
  title: string;
  /** Olay akışı (en yenisi üstte). İçindeki ⟦7⟧ koltuk numarası rozeti olur. */
  lines?: string[];
  color?: string;
  light?: boolean;
  pulse?: boolean;
  /** Kalabalık oyun: tabela küçülür, avatarlara yer kalır */
  compact?: boolean;
}) {
  const p = usePingPong(900);
  const scale = pulse ? p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) : 1;
  // Yalnızca başlık ve altında en son olay
  const max = 1;
  const sub = light ? '#24324F' : 'rgba(255,255,255,0.82)';
  return (
    <View
      style={[styles.prompt, compact ? styles.promptCompact : styles.promptNormal, light ? styles.promptLight : styles.promptDark]}
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <RichLine
          text={title}
          chip={compact ? 17 : 19}
          style={[styles.promptTitle, compact && styles.promptTitleCompact, { color: color ?? (light ? '#0B132B' : '#FFFFFF') }]}
        />
      </Animated.View>
      {(lines ?? []).slice(0, max).map((l, i) => (
        <RichLine
          key={i}
          text={l}
          chip={compact ? 14 : 15}
          style={[styles.promptSub, compact && styles.promptSubCompact, { color: sub }, i > 0 && styles.promptOld]}
        />
      ))}
    </View>
  );
}

/**
 * Komut yazısı ("⛓️ OY VER: ŞÜPHELİYİ SEÇ" gibi): ekranın ortasında büyük çıkar, 2,5 sn durur, kaybolur. Aşama yeni
 * değiştiyse aşama yazısı ("DALIŞ", "PLAJ") bitince gelir. Dokunmaları engellemez.
 */
export function CommandFlash({ cmdKey, phaseKey, text, color }: {
  cmdKey: string | null;
  phaseKey: string;
  text: string | null;
  color: string;
}) {
  const [v] = useState(() => new Animated.Value(0));
  const lastKey = useRef<string | null>(null);
  const lastPhase = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<{ text: string; color: string } | null>(null);
  useEffect(() => {
    const phaseChanged = lastPhase.current !== null && lastPhase.current !== phaseKey;
    lastPhase.current = phaseKey;
    if (!cmdKey || !text || lastKey.current === cmdKey) return;
    lastKey.current = cmdKey;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setShown({ text, color });
        v.setValue(0);
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: NATIVE }),
          Animated.delay(2300),
          Animated.timing(v, { toValue: 0, duration: 280, useNativeDriver: NATIVE }),
        ]).start(() => setShown(null));
      },
      phaseChanged ? 1900 : 0,
    );
  }, [cmdKey, phaseKey, text, color, v]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!shown) return null;
  return (
    <Animated.View style={[styles.fill, styles.cmdWrap, { opacity: v }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.cmdBox,
          { borderColor: shown.color, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] },
        ]}
      >
        <RichLine text={shown.text} chip={30} style={styles.cmdText} />
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Oyun sonu sıralama tablosu: herkesin rolü ve oyunda kaldığı süre (kaydırmasız, ekrana sığar)
// ---------------------------------------------------------------------------

export type RankRow = {
  id: string;
  rank: number;
  seat: number;
  name: string;
  me: boolean;
  won: boolean;
  role: { emoji: string; name: string; color: string; key?: string } | null;
  /** "12:34" ya da "Sona kaldı" */
  time: string;
  /** Kazandığı puan ("+3,5" ya da "—") */
  points: string;
  out: boolean;
};

export function RankTable({ rows }: { rows: RankRow[] }) {
  const [h, setH] = useState(0);
  const head = 26;
  const rowH = h > 0 ? Math.max(20, Math.min(40, Math.floor((h - head - 12) / Math.max(1, rows.length)))) : 30;
  const font = Math.min(14, Math.max(10.5, rowH * 0.42));
  return (
    <View
      style={styles.rankBox}
      onLayout={(e) => {
        const nh = e.nativeEvent.layout.height;
        if (Math.abs(nh - h) > 1) setH(nh);
      }}
    >
      <View style={styles.rankPanel}>
        <View style={[styles.rankRow, { height: head }]}>
          <Text style={[styles.rankHead, styles.rankNo]}>#</Text>
          <Text style={[styles.rankHead, styles.rankName]}>Oyuncu</Text>
          <Text style={[styles.rankHead, styles.rankRole]}>Rol</Text>
          <Text style={[styles.rankHead, styles.rankTime]}>Süre</Text>
          <Text style={[styles.rankHead, styles.rankPts]}>Puan</Text>
        </View>
        {rows.map((r) => (
          <View
            key={r.id}
            style={[styles.rankRow, { height: rowH }, r.won && styles.rankWon, r.me && styles.rankMe]}
            accessibilityLabel={`${r.rank}. ${r.seat} numara ${r.name}, ${r.role?.name ?? ''}, ${r.time}, ${r.points === '—' ? 'puan yok' : `${r.points} puan`}${r.won ? ', kazandı' : ''}`}
          >
            <Text style={[styles.rankCell, styles.rankNo, { fontSize: font }]}>{r.won ? '🏆' : String(r.rank)}</Text>
            <View style={[styles.rankName, styles.rankWho]}>
              <SeatChip n={r.seat} size={Math.min(22, rowH - 4)} />
              <Text style={[styles.rankCell, styles.flex, { fontSize: font }, r.out && styles.rankOut]} numberOfLines={1}>
                {r.me ? `${r.name} (sen)` : r.name}
              </Text>
            </View>
            <View style={[styles.rankRole, styles.rankWho]}>
              {r.role?.key ? <RoleIcon role={r.role.key} size={Math.min(18, rowH - 6)} framed /> : null}
              <Text style={[styles.rankCell, styles.flex, { fontSize: font, color: r.role?.color ?? '#FFFFFF' }]} numberOfLines={1}>
                {r.role ? (r.role.key ? r.role.name : `${r.role.emoji} ${r.role.name}`) : '—'}
              </Text>
            </View>
            <Text style={[styles.rankCell, styles.rankTime, { fontSize: font }]} numberOfLines={1}>
              {r.time}
            </Text>
            <Text style={[styles.rankCell, styles.rankPts, { fontSize: font }]} numberOfLines={1}>
              {r.points}
            </Text>
          </View>
        ))}
      </View>
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

export function SkSheet({ title, icon, iconNode, onClose, children }: {
  title: string;
  icon?: string;
  /** Emoji yerine görsel (ör. rol ikonu) */
  iconNode?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.sheetRoot} inModal>
        <Pressable style={styles.sheetBackdropClear} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.sheet, { maxHeight: Math.round(height * 0.82) }]} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            {iconNode ?? (icon ? <Text style={styles.sheetIcon}>{icon}</Text> : null)}
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
// Sohbet kutusu ve mesaj geçmişi: mesajlar gece / gündüz başlıklarıyla ayrılır
// ---------------------------------------------------------------------------

function groupOf(m: SkMsg): string {
  if (m.round == null || !m.phase) return 'old';
  return m.phase === 'night' ? `n${m.round}` : `d${m.round}`;
}

function groupTitle(m: SkMsg): string {
  if (m.round == null || !m.phase) return 'Önceki mesajlar';
  return m.phase === 'night' ? `🌙 ${m.round}. gece` : `☀️ ${m.round}. gün`;
}

const CHANNEL_TAG: Record<string, string> = { shark: '🦈 Takım', dead: '🪸 Ölüler' };

/** Mesaj listesi: aşama değişince başlık; gece mesajları koyu mavi, gündüz mesajları açık zeminde */
export function MessageList({
  messages,
  seatOf,
  showChannel,
  onReport,
}: {
  messages: SkMsg[];
  seatOf?: (id: string | undefined) => number | undefined;
  showChannel?: boolean;
  onReport: (m: SkMsg) => void;
}) {
  let last: string | null = null;
  const out: ReactNode[] = [];
  for (const m of messages) {
    const g = groupOf(m);
    const sys = m.system;
    if (g !== last) {
      last = g;
      out.push(
        <View key={`h-${m.id}`} style={[styles.msgHead, m.phase === 'night' ? styles.msgHeadNight : styles.msgHeadDay]}>
          <Text style={styles.msgHeadText}>{groupTitle(m)}</Text>
        </View>,
      );
    }
    if (sys) {
      out.push(
        <View key={m.id} style={[styles.sysRow, { borderColor: sys.color }]}>
          <RichLine text={m.body} chip={16} style={[styles.sysText, { color: sys.color }]} />
        </View>,
      );
      continue;
    }
    const seat = seatOf?.(m.from);
    const tag = showChannel && m.channel ? CHANNEL_TAG[m.channel] : undefined;
    out.push(
      <Pressable
        key={m.id}
        onLongPress={m.mine ? undefined : () => onReport(m)}
        delayLongPress={400}
        accessibilityHint={m.mine ? undefined : 'Bildirmek için uzun bas'}
        style={[styles.msg, m.mine ? styles.mine : styles.theirs, m.phase === 'night' && styles.msgNight]}
      >
        {/* Yazan: koltuk numarası (kendin dahil) ve adı */}
        <View style={styles.msgWho}>
          {seat ? <SeatChip n={seat} size={16} /> : null}
          <Text style={styles.msgName}>{m.mine ? 'Sen' : m.name}</Text>
          {tag ? <Text style={styles.msgTag}>{tag}</Text> : null}
        </View>
        <Text style={styles.msgBody}>{m.body}</Text>
      </Pressable>,
    );
  }
  return <>{out}</>;
}

// ---------------------------------------------------------------------------
// Gece sonucun: rol yeteneğinin sonucu görsel olarak (avatarlar, takım rozeti, akıntı haritası)
// ---------------------------------------------------------------------------

/** Küçük avatar + koltuk numarası (sonuç kartlarında) */
function MiniSeat({ p, size = 40, name }: { p: SkPlayer | undefined; size?: number; name?: string }) {
  return (
    <View style={[styles.mini, { width: size + 18 }]}>
      <View style={{ width: size, height: size }}>
        <Avatar index={p?.avatar ?? 1} size={size} />
        {p ? (
          <View style={styles.miniChip}>
            <SeatChip n={p.seat} size={Math.max(16, Math.round(size * 0.42))} />
          </View>
        ) : null}
      </View>
      <Text style={styles.miniName} numberOfLines={1}>
        {p?.name ?? name ?? '?'}
      </Text>
    </View>
  );
}

function NoteCard({ note, byId }: { note: SkNote; byId: Map<string, SkPlayer> }) {
  const target = note.id ? byId.get(note.id) : undefined;
  const visitRow = (v: { round: number; names: string[]; ids?: string[] }, i: number) => (
    <View key={i} style={styles.visitRow}>
      <Text style={styles.visitNight}>{`${v.round}. gece`}</Text>
      <MiniSeat p={target} size={30} name={note.name} />
      <Text style={styles.visitArrow}>➜</Text>
      {v.names.length === 0 ? (
        <Text style={styles.resultMuted}>kimseye gitmedi</Text>
      ) : (
        v.names.map((n, j) => <MiniSeat key={j} p={v.ids?.[j] ? byId.get(v.ids[j]) : undefined} name={n} size={30} />)
      )}
    </View>
  );
  if (note.kind === 'blocked') {
    return (
      <View style={[styles.result, { borderColor: '#B7791F' }]}>
        <Text style={styles.resultBig}>🔨</Text>
        <Text style={styles.resultTitle}>Yeteneğin kilitlendi</Text>
        <Text style={styles.resultMuted}>Çekiç Köpekbalığı seni bu gece engelledi, seçimin işlemedi.</Text>
      </View>
    );
  }
  if (note.kind === 'saved') {
    return (
      <View style={[styles.result, { borderColor: '#34D399' }]}>
        <View style={styles.resultRow}>
          <Text style={styles.resultBig}>🛟</Text>
          <MiniSeat p={target} size={56} name={note.name} />
        </View>
        <Text style={styles.resultTitle}>Köpekbalıkları saldırdı, sen kurtardın</Text>
      </View>
    );
  }
  if (note.kind === 'scan') {
    const team = note.team ? SK_TEAMS[note.team] : null;
    return (
      <View style={[styles.result, { borderColor: team?.color ?? '#48CAE4' }]}>
        <Text style={styles.resultHead}>🔭 Baktığın kişi</Text>
        <View style={styles.resultRow}>
          <MiniSeat p={target} size={56} name={note.name} />
          <Text style={styles.visitArrow}>=</Text>
          <View style={[styles.teamBadge, { borderColor: team?.color ?? '#FFFFFF', backgroundColor: (team?.color ?? '#FFFFFF') + '33' }]}>
            <Text style={styles.teamEmoji}>{team?.emoji ?? '?'}</Text>
            <Text style={[styles.teamName, { color: team?.color ?? '#FFFFFF' }]}>{team?.name ?? '?'}</Text>
          </View>
        </View>
        <Text style={styles.resultHead}>🌊 Akıntı haritası, son 2 gece kime gitti</Text>
        {(note.visits ?? []).length === 0 ? (
          <Text style={styles.resultMuted}>Son 2 gecede kimseye gitmedi.</Text>
        ) : (
          (note.visits ?? []).map(visitRow)
        )}
      </View>
    );
  }
  // Kaplan: hedefin bu gece kime gittiği
  return (
    <View style={[styles.result, { borderColor: '#E07A00' }]}>
      <Text style={styles.resultHead}>🐯 İzlediğin kişi bu gece kime gitti</Text>
      {(note.visits ?? []).length === 0 ? (
        <View style={styles.resultRow}>
          <MiniSeat p={target} size={48} name={note.name} />
          <Text style={styles.resultMuted}>kimseye gitmedi</Text>
        </View>
      ) : (
        (note.visits ?? []).map(visitRow)
      )}
    </View>
  );
}

/** Bir ya da birkaç gecenin sonuç kartları (en yeni üstte) */
export function NightResult({ notes, players }: { notes: SkNote[]; players: SkPlayer[] }) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const rounds = [...new Set(notes.map((n) => n.round))].sort((a, b) => b - a);
  if (notes.length === 0) return <Text style={styles.resultMuted}>Henüz bir sonucun yok.</Text>;
  return (
    <View style={styles.chat}>
      {rounds.map((r) => (
        <View key={r} style={styles.chat}>
          <View style={[styles.msgHead, styles.msgHeadNight]}>
            <Text style={styles.msgHeadText}>{`🌙 ${r}. gece sonucun`}</Text>
          </View>
          {notes
            .filter((n) => n.round === r)
            .map((n, i) => (
              <NoteCard key={i} note={n} byId={byId} />
            ))}
        </View>
      ))}
    </View>
  );
}

export type CardButton = { key: string; label: string; tone?: 'danger' | 'primary' | 'ghost'; disabled?: boolean };

/**
 * Oyuncu penceresi: avatara (ya da listedeki oyuncuya) dokununca açılan küçük pencere. Rolü açığa çıktıysa rolün ikonu,
 * adı ve özelliği görünür; altında seçenekler (atma oylaması, arkadaş ekle, ses şikâyeti). Ekranın içinde açılır
 * (ayrı pencere değil), bu yüzden arkasından açılan uyarılar hep üstte kalır.
 */
export function PlayerCard({
  avatar,
  seat,
  name,
  status,
  role,
  buttons,
  onButton,
  onClose,
}: {
  avatar: number;
  seat?: number;
  name: string;
  status?: string;
  role?: { icon: ReactNode; name: string; color: string; team?: string; teamColor?: string; text: string } | null;
  buttons: CardButton[];
  onButton: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.cardRoot}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.cardHead}>
          <View style={styles.plAvatar}>
            <Avatar index={avatar} size={48} />
            {seat ? (
              <View style={styles.miniChip}>
                <SeatChip n={seat} size={20} />
              </View>
            ) : null}
          </View>
          <View style={styles.flex}>
            <Text style={styles.plName} numberOfLines={1}>
              {name}
            </Text>
            {status ? <Text style={styles.plStatus}>{status}</Text> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
        {role ? (
          <View style={[styles.cardRole, { borderColor: role.color }]}>
            <View style={styles.rankWho}>
              {role.icon}
              <View style={styles.flex}>
                <Text style={[styles.cardRoleName, { color: role.color }]}>{role.name}</Text>
                {role.team ? <Text style={[styles.plStatus, { color: role.teamColor ?? '#FFFFFF' }]}>{role.team}</Text> : null}
              </View>
            </View>
            <Text style={styles.cardRoleText}>{role.text}</Text>
          </View>
        ) : null}
        {buttons.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => onButton(b.key)}
            disabled={b.disabled}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cardBtn,
              b.tone === 'danger' ? styles.cardBtnDanger : b.tone === 'primary' ? styles.cardBtnPrimary : styles.cardBtnGhost,
              b.disabled && styles.dim,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cardBtnText}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Atma oylaması başlayınca sağ üstteki kırmızı oyuncular düğmesinden açılan küçük pencere: "③ Ali, ⑤ Veli için atma
 * oylaması başlattı" ve altında Atılsın / Atılmasın. Seçince kapanır (oylama üstteki kırmızı bantta sürer).
 */
export function KickPopup({
  starterSeat,
  starterName,
  targetSeat,
  targetName,
  yes,
  need,
  left,
  isTarget,
  canVote,
  busy,
  onAnswer,
  top,
}: {
  starterSeat?: number;
  starterName: string;
  targetSeat?: number;
  targetName: string;
  yes: number;
  need: number;
  left: number;
  isTarget: boolean;
  canVote: boolean;
  busy: boolean;
  /** true = atılsın, false = atılmasın, null = yalnızca kapat */
  onAnswer: (yes: boolean | null) => void;
  /** Pencerenin üstten uzaklığı (üst şeridin hemen altı) */
  top: number;
}) {
  const who = `${starterSeat ? seatTag(starterSeat) : ''} ${starterName}`;
  const whom = `${targetSeat ? seatTag(targetSeat) : ''} ${targetName}`;
  return (
    <View style={[styles.kickPop, { top }]} accessibilityLiveRegion="polite" accessibilityViewIsModal>
      <View style={styles.kickPopArrow} />
      <RichLine
        align="left"
        chip={18}
        style={styles.kickPopText}
        text={isTarget ? `🚪 ${who} seni atmak için oylama başlattı` : `🚪 ${who}, ${whom} için atma oylaması başlattı`}
      />
      <Text style={styles.kickPopSub}>{`At ${yes} / ${need} · ${left} sn`}</Text>
      {canVote && !isTarget ? (
        <View style={styles.row}>
          <Pressable
            onPress={() => onAnswer(true)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cardBtn, styles.cardBtnDanger, styles.flex, pressed && styles.pressed]}
          >
            <Text style={styles.cardBtnText}>Atılsın</Text>
          </Pressable>
          <Pressable
            onPress={() => onAnswer(false)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cardBtn, styles.cardBtnGhost, styles.flex, pressed && styles.pressed]}
          >
            <Text style={styles.cardBtnText}>Atılmasın</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => onAnswer(null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cardBtn, styles.cardBtnGhost, pressed && styles.pressed]}
        >
          <Text style={styles.cardBtnText}>Tamam</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Oyuncu listesi (sağ üstteki kırmızı düğme): avatar, numara, ad ve durum; dokununca seçenekler açılır */
export function PlayerList({ players, onPick }: { players: SkPlayer[]; onPick: (p: SkPlayer) => void }) {
  return (
    <View style={styles.chat}>
      {players.map((p) => {
        const role = roleInfo(p.role);
        const status = p.left ? 'Ayrıldı' : !p.is_alive ? 'Elendi' : 'Hayatta';
        return (
          <Pressable
            key={p.id}
            onPress={() => onPick(p)}
            disabled={p.is_me}
            accessibilityRole="button"
            accessibilityLabel={`${p.seat} numara ${p.name}, ${status}`}
            style={({ pressed }) => [styles.plRow, pressed && styles.pressed]}
          >
            <View style={styles.plAvatar}>
              <Avatar index={p.avatar ?? 1} size={42} />
              <View style={styles.miniChip}>
                <SeatChip n={p.seat} size={20} />
              </View>
            </View>
            <View style={styles.flex}>
              <Text style={styles.plName} numberOfLines={1}>
                {p.is_me ? `${p.name} (sen)` : p.name}
              </Text>
              <View style={styles.rankWho}>
                {p.role ? <RoleIcon role={p.role} size={18} framed /> : null}
                <Text style={[styles.plStatus, !p.is_alive && styles.plDead]} numberOfLines={1}>
                  {role ? `${status} · ${role.name}` : status}
                </Text>
              </View>
            </View>
            {!p.is_me ? <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.7)" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Moderatör: deneme odasında kendi rolünü seç */
export function RolePicker({ value, busy, onPick }: {
  value: SkRole | null;
  busy: boolean;
  onPick: (role: SkRole | null) => void;
}) {
  return (
    <View style={styles.pickGrid}>
      <Pressable
        onPress={() => onPick(null)}
        disabled={busy}
        style={[styles.pickItem, value === null && styles.pickOn]}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === null }}
      >
        <Text style={styles.pickEmoji}>🎲</Text>
        <Text style={styles.pickName}>Rastgele</Text>
      </Pressable>
      {SK_WHEEL.map((k) => (
        <Pressable
          key={k}
          onPress={() => onPick(k)}
          disabled={busy}
          style={[styles.pickItem, { borderColor: SK_ROLES[k].color }, value === k && styles.pickOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === k }}
        >
          <RoleIcon role={k} size={40} />
          <Text style={[styles.pickName, { color: SK_ROLES[k].color }]} numberOfLines={2}>
            {SK_ROLES[k].name}
          </Text>
        </Pressable>
      ))}
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
  sunWrap: { position: 'absolute', left: 14, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  sunGlow: { position: 'absolute', width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF3C4' },
  sun: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFE7A3' },
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
  wheelOdds: {
    position: 'absolute',
    bottom: -13,
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 10,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 3,
  },
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
  gridBox: { flex: 1, minHeight: 60, justifyContent: 'center' },
  // Nizami dizilim: eksik kalan son satır sağa yaslanır (üstte 4, altta 2 ise alttakiler sağdaki iki sütunda)
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: GAP, rowGap: GAP },
  tile: { alignItems: 'center' },
  slotBox: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(11,19,43,0.22)' },
  slotBoxLight: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(11,19,43,0.18)', backgroundColor: 'rgba(255,255,255,0.35)' },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(11,19,43,0.25)',
  },
  emptyBoxLight: { borderColor: 'rgba(11,19,43,0.25)', backgroundColor: 'rgba(255,255,255,0.35)' },
  squareBox: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1C2541' },
  nameStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    backgroundColor: 'rgba(5, 10, 24, 0.72)',
  },
  stripText: { color: '#FFFFFF', fontFamily: fonts.extra },
  tileTop: { zIndex: 5, elevation: 5 },
  tileTalk: { zIndex: 8, elevation: 8 },
  mark: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', zIndex: 20, elevation: 20 },
  markText: { textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  dim: { opacity: 0.38 },
  row: { flexDirection: 'row', gap: 8 },
  signSlot: { height: SLOT_H, justifyContent: 'center', alignItems: 'center', marginTop: 0, maxWidth: '100%' },
  alertBtn: {
    position: 'absolute',
    top: -6,
    right: -8,
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
  kickBar: {
    position: 'absolute',
    top: 34,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(122, 16, 32, 0.94)',
    borderWidth: 1.5,
    borderColor: '#FF8A98',
    zIndex: 35,
    elevation: 35,
  },
  kickInline: { position: 'relative', top: 0 },
  kickText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13 },
  kickBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  kickBtnOn: { backgroundColor: '#FFFFFF' },
  kickBtnText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 13 },
  kickBtnTextOn: { color: '#7A1020' },
  thinkWrap: { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  thinkText: {
    color: '#FFB703',
    fontFamily: fonts.black,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 6,
  },
  // Olay yazısı (AVLANDI, KAFESTE…) avatarın içinde, ortada
  eventWrap: { position: 'absolute', top: 0, bottom: 0, left: -12, right: -12, alignItems: 'center', justifyContent: 'center' },
  event: {
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  eventText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 10.5, letterSpacing: 0.3 },
  seatChip: {
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 1.5,
    borderColor: '#FFB703',
  },
  seatChipText: { color: '#FFB703', fontFamily: fonts.black },
  richLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 4,
    rowGap: 2,
  },
  richLeft: { justifyContent: 'flex-start' },
  cmdWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  cmdBox: {
    maxWidth: '88%',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: 'rgba(11, 19, 43, 0.9)',
  },
  cmdText: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 30,
    lineHeight: 38,
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 10,
  },
  mini: { alignItems: 'center', gap: 2 },
  miniChip: { position: 'absolute', top: -4, left: -6 },
  miniName: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 10.5, maxWidth: '100%' },
  result: { gap: 8, padding: 12, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.06)' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  resultBig: { fontSize: 40, textAlign: 'center' },
  resultTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 16, textAlign: 'center' },
  resultHead: { color: '#48CAE4', fontFamily: fonts.black, fontSize: 13.5 },
  resultMuted: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.semi, fontSize: 13, textAlign: 'center' },
  visitRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  visitNight: { color: '#FFB703', fontFamily: fonts.black, fontSize: 12, width: 52 },
  visitArrow: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 20 },
  teamBadge: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  teamEmoji: { fontSize: 34 },
  teamName: { fontFamily: fonts.black, fontSize: 15 },
  plRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  plAvatar: { width: 42, height: 42 },
  plName: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 15 },
  plStatus: { color: '#34D399', fontFamily: fonts.semi, fontSize: 12.5 },
  plDead: { color: '#FF8A98' },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pickItem: {
    width: 92,
    height: 82,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pickOn: { backgroundColor: 'rgba(72, 202, 228, 0.3)', borderWidth: 3 },
  pickEmoji: { fontSize: 28 },
  pickName: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 11.5, textAlign: 'center' },
  rankBox: { flex: 1, justifyContent: 'center' },
  rankPanel: {
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(11, 19, 43, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.35)',
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, borderRadius: 8 },
  rankWon: { backgroundColor: 'rgba(255, 183, 3, 0.18)' },
  rankMe: { borderWidth: 1, borderColor: '#48CAE4' },
  rankHead: { color: '#48CAE4', fontFamily: fonts.black, fontSize: 11.5 },
  rankCell: { color: '#FFFFFF', fontFamily: fonts.extra },
  rankNo: { width: 26, textAlign: 'center' },
  rankName: { flex: 1, overflow: 'hidden' },
  rankWho: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rankRole: { width: '30%', overflow: 'hidden' },
  rankTime: { width: 58, textAlign: 'right' },
  rankPts: { width: 44, textAlign: 'right', color: '#FFB703' },
  rankOut: { color: 'rgba(255,255,255,0.6)' },
  sign: {
    flexDirection: 'row',
    gap: 3,
    minWidth: 42,
    paddingHorizontal: 7,
    height: 27,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0A96D',
    borderWidth: 1.5,
    borderColor: '#7A4A1E',
  },
  signPass: { backgroundColor: '#C9CED6', borderColor: '#5B6472' },
  signHunt: { backgroundColor: '#3A0710', borderColor: '#FF4D4D' },
  signDouble: { backgroundColor: '#FFB703', borderColor: '#7A4A1E' },
  signText: { color: '#3B220B', fontFamily: fonts.black, fontSize: 17 },
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
    // Avatarın üst ortasında
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -13,
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
  seatNoSmall: { minWidth: 20, height: 20, borderRadius: 10, top: -6, marginLeft: -10 },
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
  huntIn: { flexDirection: 'row', gap: 1, paddingHorizontal: 5, backgroundColor: '#7A0A1A', borderColor: '#FF4D4D' },
  huntInIcon: { fontSize: 11, lineHeight: 14 },
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
    // Avatarın alt ortasında, yuvarlak çerçeve içinde (avatarın kenarına biner); ikon boyutu avatara göre
    bottom: -4,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12 },
  name: { marginTop: 4, height: 16, lineHeight: 16, maxWidth: '100%', fontFamily: fonts.extra, fontSize: 12 },
  nameDark: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
  nameLight: {},
  nameDead: { textDecorationLine: 'line-through' },
  label: { maxWidth: '100%', fontFamily: fonts.extra, fontSize: 11 },
  prompt: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  promptNormal: { height: 58, paddingVertical: 4 },
  promptCompact: { height: 48, paddingVertical: 3 },
  promptDark: { backgroundColor: 'rgba(11, 19, 43, 0.62)', borderWidth: 1, borderColor: 'rgba(72, 202, 228, 0.35)' },
  promptLight: { backgroundColor: 'rgba(255, 255, 255, 0.78)', borderWidth: 1, borderColor: 'rgba(224, 169, 109, 0.6)' },
  promptTitle: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21, textAlign: 'center', letterSpacing: 0.3 },
  promptTitleCompact: { fontSize: 14.5, lineHeight: 19 },
  promptSub: { fontFamily: fonts.extra, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  promptSubCompact: { fontSize: 11, lineHeight: 15 },
  promptOld: { opacity: 0.7, fontFamily: fonts.semi },
  time: { gap: 3 },
  timeText: { fontFamily: fonts.extra, fontSize: 12.5, textAlign: 'center' },
  timeBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  timeBarLight: { backgroundColor: 'rgba(11,19,43,0.15)' },
  timeFill: { height: '100%', borderRadius: 3 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  // Alt pencereler (Rolüm, oyuncular…) açıkken ekran kararmaz; dışına dokununca kapanır
  sheetBackdropClear: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.08)' },
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
  roster: { gap: 6 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  rosterName: { flexShrink: 1, fontFamily: fonts.extra, fontSize: 14 },
  rosterCount: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.black, fontSize: 13 },
  rosterSeats: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  rosterDead: { opacity: 0.55 },
  rosterStrike: {
    position: 'absolute',
    left: -2,
    right: -2,
    top: 10,
    height: 2,
    backgroundColor: '#FF4D4D',
    transform: [{ rotate: '-20deg' }],
  },
  cardRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, elevation: 60, justifyContent: 'center', padding: 22 },
  card: {
    backgroundColor: '#111A35',
    borderRadius: 20,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.4)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardRole: { borderWidth: 1.5, borderRadius: 14, padding: 10, gap: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
  cardRoleName: { fontFamily: fonts.black, fontSize: 16 },
  cardRoleText: { color: 'rgba(255,255,255,0.88)', fontFamily: fonts.semi, fontSize: 13, lineHeight: 18 },
  cardBtn: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cardBtnDanger: { backgroundColor: '#D9304F' },
  cardBtnPrimary: { backgroundColor: '#0F9D58' },
  cardBtnGhost: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  cardBtnText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 14 },
  kickPop: {
    position: 'absolute',
    right: 8,
    width: 270,
    zIndex: 55,
    elevation: 55,
    backgroundColor: '#2A0D16',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D9304F',
    padding: 12,
    gap: 8,
  },
  kickPopArrow: {
    position: 'absolute',
    top: -9,
    right: 12,
    width: 16,
    height: 16,
    backgroundColor: '#2A0D16',
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: '#D9304F',
    transform: [{ rotate: '45deg' }],
  },
  kickPopText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 14 },
  kickPopSub: { color: '#FFB3BF', fontFamily: fonts.semi, fontSize: 12 },
  chatEmpty: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  msg: { maxWidth: '85%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: 'rgba(72, 202, 228, 0.3)' },
  theirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)' },
  sysRow: {
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sysText: { fontFamily: fonts.extra, fontSize: 12.5, lineHeight: 17 },
  msgNight: { backgroundColor: 'rgba(28, 37, 90, 0.75)' },
  msgWho: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 1 },
  msgName: { color: '#B7A8FF', fontSize: 11, fontFamily: fonts.semi },
  msgTag: { color: '#FF8A98', fontSize: 10.5, fontFamily: fonts.extra },
  msgHead: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10, marginTop: 4 },
  msgHeadNight: { backgroundColor: '#1C2541', borderWidth: 1, borderColor: '#48CAE4' },
  msgHeadDay: { backgroundColor: '#C2560C' },
  msgHeadText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
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
