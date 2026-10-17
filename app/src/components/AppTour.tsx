import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { ImageSlot } from '@/components/ImageSlot';
import { PrimaryButton } from '@/components/PrimaryButton';
import { imageAspect } from '@/lib/images';
import { isTourDone, markTourDone } from '@/lib/onboarding';
import { currentTab } from '@/lib/tabReset';
import { setActiveTourId, setTourRunning, useTourRect, type TourRect } from '@/lib/tour';
import { colors, fonts, spacing } from '@/theme';

/** Eğitimin renkleri: karartılmış zeminde parlayan tema renkleri (açık temada da aynı) */
const C = {
  turkuaz: '#22D3C5',
  mor: '#A98BFF',
  mercan: '#FF9F6B',
  sari: '#FFC83D',
  lavanta: '#8E9BFF',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Step = {
  /** Sekmenin adresteki adı ve açılacak adres */
  tab: string;
  path: Href;
  /** Anlatılan alan (TourTarget) ya da sekme çubuğu */
  target: string;
  /** Adımın rengi ve küçük etiketi (ikon ve yazı) */
  color: string;
  icon: IconName;
  tag: string;
  title: string;
  /** *vurgu* adımın renginde, {#RRGGBB:yazı} verilen renkte yazılır */
  text: string;
};

const TABBAR = '__tabbar';

/** Kısa eğitim: her adım tek alanı gösterir (başlıca özellikler; ayrıntılar ekranların kendi bilgi düğmelerinde) */
const STEPS: Step[] = [
  {
    tab: 'index',
    path: '/',
    target: TABBAR,
    color: C.sari,
    icon: 'compass',
    tag: 'HOŞ GELDİN',
    title: 'Beş bölüm, tek şehir',
    text: '*Akış*, *Etkinlik*, *Harita*, *Oyun* ve *Profil*. Hadi hızlıca bir tur atalım!',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-legend',
    color: C.turkuaz,
    icon: 'map',
    tag: 'HARİTA',
    title: 'Şehrin nabzı',
    text: `Renkli petekler şehrin nerede hareketli olduğunu gösterir: {${C.turkuaz}:turkuaz etkinlik}, {${C.mor}:mor oyun}, {${C.mercan}:mercan mekân}. Bir peteğe dokun, *İNCELE* ile içine bak.`,
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-controls',
    color: C.lavanta,
    icon: 'options',
    tag: 'HARİTA',
    title: 'Harita düğmeleri',
    text: 'Başka şehre göz at, *oyun* ve *etkinlik* olan petekleri bul, yakınlaş; *Konumum* ile kendi peteğine dön.',
  },
  {
    tab: 'akis',
    path: '/akis',
    target: 'feed-composer',
    color: C.mercan,
    icon: 'chatbubbles',
    tag: 'AKIŞ',
    title: 'Şehrine seslen',
    text: 'Rumuzunla yaz, gönderin *bir hafta* akışta kalır. *@#kod* ile arkadaşını etiketle.',
  },
  {
    tab: 'events',
    path: '/events',
    target: 'events-categories',
    color: C.turkuaz,
    icon: 'calendar',
    tag: 'ETKİNLİK',
    title: 'Yüz yüze buluş',
    text: 'Şehrindeki buluşmalara *katıl*, etkinlikte söylenen *kodu* yaz, puanını kap.',
  },
  {
    tab: 'games',
    path: '/games',
    target: 'games-tiles',
    color: C.mor,
    icon: 'game-controller',
    tag: 'OYUN',
    title: 'Oyna, kazan',
    text: `*Yan yana* ya da *uzaktan* oyna, puan topla, ayın {${C.sari}:ödül podyumuna} çık!`,
  },
  {
    tab: 'profile',
    path: '/profile',
    target: 'profile-menu',
    color: C.sari,
    icon: 'person',
    tag: 'PROFİL',
    title: 'Senin köşen',
    text: '*Arkadaşların*, *şehrin*, bildirim ayarların ve hesabın burada.',
  },
];

/** Alanın çevresindeki boşluk (px) */
const PAD = 6;
/** Yazının kapladığı yaklaşık yükseklik: okla ve oksuz (alanın üstünde mi altında mı duracağına karar vermek için) */
const TEXT_H = 250;
const TEXT_H_NO_ARROW = 190;
/** Kayarak gelen öğe sayısı: etiket, başlık, yazı, düğme */
const ITEMS = 4;

/** "*vurgu*" ve "{#renk:yazı}" işaretlerini renkli parçalara böler */
function rich(text: string, color: string) {
  const parts: { t: string; c?: string }[] = [];
  const re = /\*([^*]+)\*|\{(#[0-9A-Fa-f]{6}):([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index) });
    parts.push(m[1] ? { t: m[1], c: color } : { t: m[3], c: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return parts.map((p, i) =>
    p.c ? (
      <Text key={i} style={[styles.em, { color: p.c, textShadowColor: p.c }]}>
        {p.t}
      </Text>
    ) : (
      p.t
    ),
  );
}

/** Alanı gösteren, aşağı yukarı zıplayan büyük ok */
function BouncingArrow({ dir, x, color }: { dir: 'up' | 'down'; x: number; color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const shift = v.interpolate({ inputRange: [0, 1], outputRange: [0, dir === 'down' ? 12 : -12] });
  return (
    <Animated.View style={[styles.arrow, { left: x - 28, transform: [{ translateY: shift }] }]}>
      <Ionicons
        name={dir === 'down' ? 'arrow-down-circle' : 'arrow-up-circle'}
        size={56}
        color={color}
        style={{ textShadowColor: color, textShadowRadius: 14 }}
      />
    </Animated.View>
  );
}

/** Karartılmış zeminde yavaşça yükselen küçük petekler (adımın renginde) */
function FloatingHexes({ color, W, H }: { color: string; W: number; H: number }) {
  const [list] = useState(() =>
    Array.from({ length: 9 }, (_, i) => ({
      v: new Animated.Value(0),
      x: (i * 0.137 + 0.05) % 1,
      size: 10 + ((i * 7) % 14),
      dur: 7000 + ((i * 1300) % 5000),
      delay: (i * 900) % 6000,
    })),
  );
  useEffect(() => {
    const loops = list.map((h) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(h.delay),
          Animated.timing(h.v, { toValue: 1, duration: h.dur, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [list]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {list.map((h, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.hex,
            {
              left: h.x * W,
              top: H,
              fontSize: h.size,
              color,
              opacity: h.v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.35, 0.2, 0] }),
              transform: [
                { translateY: h.v.interpolate({ inputRange: [0, 1], outputRange: [0, -H * 0.9] }) },
                { rotate: h.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i % 2 ? 90 : -90}deg`] }) },
              ],
            },
          ]}
        >
          ⬢
        </Animated.Text>
      ))}
    </View>
  );
}

/** Hoş geldin ekranında logodan dört yana saçılan renkli konfeti */
function Confetti() {
  const [v] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() =>
    Array.from({ length: 18 }, (_, i) => ({
      a: (i / 18) * Math.PI * 2,
      d: 110 + ((i * 37) % 70),
      c: [C.turkuaz, C.mor, C.mercan, C.sari, C.lavanta][i % 5],
      s: 8 + (i % 3) * 3,
    })),
  );
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              width: p.s,
              height: p.s * 1.6,
              backgroundColor: p.c,
              opacity: v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.a) * p.d] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.a) * p.d + 40] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 540}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Hoş geldin: logo yaylanarak büyür, yazılar ve düğmeler sırayla aşağıdan kayarak gelir */
function Welcome({ onFinish }: { onFinish: (go?: '/kurallar' | '/oduller') => void }) {
  const insets = useSafeAreaInsets();
  const [logo] = useState(() => new Animated.Value(0));
  const [items] = useState(() => Array.from({ length: 4 }, () => new Animated.Value(0)));
  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.stagger(
        90,
        items.map((it) => Animated.spring(it, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true })),
      ),
    ]).start();
  }, [logo, items]);
  const rise = (it: Animated.Value) => ({
    opacity: it,
    transform: [{ translateY: it.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
  });
  return (
    <View style={styles.full} accessibilityViewIsModal testID="tour-welcome">
      <ScrollView
        contentContainerStyle={[
          styles.welcome,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.logoWrap}>
          <Confetti />
          <Animated.View
            style={[
              styles.logoPlate,
              {
                opacity: logo,
                transform: [
                  { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                  { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
                ],
              },
            ]}
          >
            <ImageSlot name="logo" style={{ height: 120, aspectRatio: imageAspect.logo }} />
          </Animated.View>
        </View>
        <Animated.View style={rise(items[0])}>
          <Text style={styles.welcomeTitle} accessibilityRole="header">
            Hoş geldin!
          </Text>
        </Animated.View>
        <Animated.View style={rise(items[1])}>
          <Text style={styles.welcomeText}>
            Artık şehrindeki insanlarla <Text style={[styles.welcomeEm, { color: colors.primary }]}>tanışmaya</Text>,{' '}
            <Text style={[styles.welcomeEm, { color: colors.primary }]}>buluşmaya</Text> ve birlikte{' '}
            <Text style={[styles.welcomeEm, { color: colors.game }]}>oynamaya</Text> hazırsın. Etkinliklere katıl, oyun
            oyna, puan topla; her ay şehrinin ve bütün illerin sıralamasında yerini al.
          </Text>
        </Animated.View>
        <Animated.View style={[styles.welcomeButtons, rise(items[2])]}>
          <PrimaryButton label="Yarışma kuralları" variant="ghost" onPress={() => onFinish('/kurallar')} testID="tour-rules" />
          <PrimaryButton label="Ödül programı" variant="ghost" onPress={() => onFinish('/oduller')} testID="tour-prizes" />
        </Animated.View>
        <Animated.View style={rise(items[3])}>
          <PrimaryButton label="Başla" onPress={() => onFinish()} testID="tour-start" />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/**
 * Uygulama eğitimi: ilk girişte, izin ekranları ve şehir seçiminden sonra, HER HESAPTA BİR KEZ (hesapta saklanır).
 * Sekmeler kendiliğinden açılır; anlatılan alan dışındaki her yer kararır, çerçeve bir alandan ötekine süzülür. Kutusuz
 * büyük, renkli yazılar ve alanı gösteren ok; Devam'a (ya da ekrana) basınca bütün yazılar sola kayıp gider, yenileri
 * sağdan sırayla gelir. Geç eğitimi bitirir. Sonda hoş geldin ekranı (yarışma kuralları ve ödül programı düğmeleriyle).
 */
export function AppTour({ userId, tabBarHeight }: { userId: string; tabBarHeight: number }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<'checking' | 'steps' | 'welcome' | 'done'>('checking');
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const measured = useTourRect(phase === 'steps' && step.target !== TABBAR ? step.target : null);

  // Kayan öğeler: 0 = sağda bekliyor, 1 = yerinde, 2 = sola kayıp gitti
  const [items] = useState(() => Array.from({ length: ITEMS }, () => new Animated.Value(0)));
  // Çerçevenin (ve karartmadaki deliğin) yeri: bir alandan ötekine süzülür
  const [hx] = useState(() => new Animated.Value(0));
  const [hy] = useState(() => new Animated.Value(0));
  const [hw] = useState(() => new Animated.Value(0));
  const [hh] = useState(() => new Animated.Value(0));
  const [ringOn] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const busy = useRef(false);
  const shownFor = useRef(-1);
  const holePlaced = useRef(false);

  useEffect(() => {
    let alive = true;
    void isTourDone(userId).then((done) => {
      if (!alive) return;
      setIndex(0);
      setPhase(done ? 'done' : 'steps');
      // Başlar başlamaz hesaba işlenir: yarıda kalsa ya da uygulama kapansa da bir daha çıkmaz
      if (!done) void markTourDone(userId);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Adımın sekmesi açılır ve alanı ölçülmesi için işaretlenir
  useEffect(() => {
    if (phase !== 'steps') {
      setActiveTourId(null);
      return;
    }
    const s = STEPS[index];
    if (currentTab() !== s.tab) router.navigate(s.path);
    setActiveTourId(s.target === TABBAR ? null : s.target);
  }, [phase, index]);

  useEffect(() => () => setActiveTourId(null), []);

  // Eğitim sürerken açılış sekmesi ve şehir görseli beklenir
  useEffect(() => {
    setTourRunning(phase !== 'done');
    return () => setTourRunning(false);
  }, [phase]);

  // Çerçevenin nabız gibi parlaması
  useEffect(() => {
    if (phase !== 'steps') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  // Eğitim katmanının ekrandaki yeri (alanların ölçüsü pencereye göredir)
  const W = origin?.w ?? width;
  const H = origin?.h ?? height;
  let hole: TourRect | null = null;
  if (phase === 'steps') {
    if (step.target === TABBAR) {
      hole = { x: 0, y: H - tabBarHeight, w: W, h: tabBarHeight };
    } else if (measured && origin) {
      const x = Math.max(0, measured.x - origin.x - PAD);
      const y = Math.max(0, measured.y - origin.y - PAD);
      const x2 = Math.min(W, measured.x - origin.x + measured.w + PAD);
      const y2 = Math.min(H, measured.y - origin.y + measured.h + PAD);
      if (x2 > x && y2 > y) hole = { x, y, w: x2 - x, h: y2 - y };
    }
  }
  // Yerleşim: yazı alanın altında ya da üstünde; yer darsa ok gizlenir, yine sığmazsa vurgulanan alan kısalır
  // (büyük alanlarda yalnızca üst kısmı gösterilir, yazı altına sığar)
  const topBar = insets.top + 48;
  const bottomSafe = insets.bottom + spacing.md;
  let place: 'below' | 'above' | 'center' = 'center';
  let withArrow = true;
  if (hole) {
    const below = H - (hole.y + hole.h) - bottomSafe;
    const above = hole.y - topBar;
    if (below >= TEXT_H) place = 'below';
    else if (above >= TEXT_H) place = 'above';
    else if (below >= TEXT_H_NO_ARROW) [place, withArrow] = ['below', false];
    else if (above >= TEXT_H_NO_ARROW) [place, withArrow] = ['above', false];
    else {
      hole = { ...hole, h: Math.max(60, H - hole.y - bottomSafe - TEXT_H) };
      place = 'below';
    }
  }
  const holeKey = hole ? `${Math.round(hole.x)},${Math.round(hole.y)},${Math.round(hole.w)},${Math.round(hole.h)}` : null;

  // Delik yeni alana süzülür (ilk adımda doğrudan yerine konur); alan yoksa ortada küçülüp kaybolur
  useEffect(() => {
    if (phase !== 'steps') return;
    const t = holeKey
      ? holeKey.split(',').map(Number)
      : [W / 2, H / 2, 0, 0];
    if (!holePlaced.current) {
      holePlaced.current = true;
      hx.setValue(t[0]);
      hy.setValue(t[1]);
      hw.setValue(t[2]);
      hh.setValue(t[3]);
    } else {
      const spring = (v: Animated.Value, to: number) =>
        Animated.spring(v, { toValue: to, friction: 9, tension: 55, useNativeDriver: false });
      Animated.parallel([spring(hx, t[0]), spring(hy, t[1]), spring(hw, t[2]), spring(hh, t[3])]).start();
    }
    Animated.timing(ringOn, { toValue: holeKey ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [phase, holeKey, W, H, hx, hy, hw, hh, ringOn]);

  // Yazılar: alanı ölçülünce (ölçülemezse kısa bir beklemeden sonra) sağdan sırayla kayarak gelir
  const canShow = phase === 'steps' && (hole !== null || step.target === TABBAR);
  useEffect(() => {
    if (phase !== 'steps' || shownFor.current === index) return;
    const show = () => {
      if (shownFor.current === index) return;
      shownFor.current = index;
      items.forEach((it) => it.setValue(0));
      Animated.stagger(
        80,
        items.map((it) => Animated.spring(it, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true })),
      ).start(() => {
        busy.current = false;
      });
    };
    if (canShow) {
      show();
      return;
    }
    const t = setTimeout(show, 450);
    return () => clearTimeout(t);
  }, [phase, index, canShow, items]);

  if (phase === 'checking' || phase === 'done') return null;

  function finish(go?: '/kurallar' | '/oduller') {
    setPhase('done');
    if (go) router.push(go);
  }

  if (phase === 'welcome') return <Welcome onFinish={finish} />;

  // Devam: bütün yazılar sola kayıp gider, sonra sıradaki adım
  function next() {
    if (busy.current) return;
    busy.current = true;
    Animated.stagger(
      45,
      items.map((it) =>
        Animated.timing(it, { toValue: 2, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ),
    ).start(() => {
      if (index + 1 >= STEPS.length) {
        busy.current = false;
        setPhase('welcome');
      } else {
        setIndex(index + 1);
      }
    });
  }

  function skip() {
    busy.current = true;
    setPhase('welcome');
  }

  // Yazının yeri; ok alana doğru bakar. Alan yoksa ortada.
  const arrowX = hole ? Math.min(W - 40, Math.max(40, hole.x + hole.w / 2)) : W / 2;
  const textPos =
    place === 'below' && hole
      ? { top: hole.y + hole.h + 4 }
      : place === 'above' && hole
        ? { bottom: H - hole.y + 4 }
        : { top: H * 0.32 };

  // Kayan öğenin görünümü: sağdan gelir, yerinde durur, sola gider
  const slide = (i: number, scaleFrom = 1) => {
    const it = items[i];
    return {
      opacity: it.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
      transform: [
        { translateX: it.interpolate({ inputRange: [0, 1, 2], outputRange: [80, 0, -90] }) },
        ...(scaleFrom !== 1 ? [{ scale: it.interpolate({ inputRange: [0, 1, 2], outputRange: [scaleFrom, 1, 1] }) }] : []),
      ],
    };
  };

  const right = Animated.add(hx, hw);
  const bottom = Animated.add(hy, hh);
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [6, 20] });

  return (
    <View
      ref={rootRef}
      style={styles.cover}
      onLayout={() =>
        rootRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) setOrigin({ x, y, w, h });
        })
      }
      testID="tour"
    >
      {/* Ekrana dokunmak sıradaki alana geçirir; dokunuşlar alttaki ekrana geçmez */}
      <Pressable style={styles.block} onPress={next} accessibilityLabel="Devam" testID="tour-tap" />

      {/* Karartma: deliğin çevresindeki dört parça (delik süzülürken onlar da kayar) */}
      <Animated.View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width: W, height: hy }]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.dim, { left: 0, top: bottom, width: W, height: Animated.subtract(H, bottom) }]}
      />
      <Animated.View pointerEvents="none" style={[styles.dim, { left: 0, top: hy, width: hx, height: hh }]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.dim, { left: right, top: hy, width: Animated.subtract(W, right), height: hh }]}
      />
      <FloatingHexes color={step.color} W={W} H={H} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: hx,
            top: hy,
            width: hw,
            height: hh,
            borderColor: step.color,
            shadowColor: step.color,
            shadowRadius: glow,
            opacity: ringOn,
          },
        ]}
      />

      {/* Kutusuz büyük renkli yazılar ve alanı gösteren ok */}
      <View pointerEvents="box-none" style={[styles.textWrap, textPos]} testID="tour-card">
        {place === 'below' && withArrow ? (
          <Animated.View style={{ opacity: items[0].interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }) }}>
            <BouncingArrow dir="up" x={arrowX - spacing.lg} color={step.color} />
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.tagRow, slide(0)]}>
          <View style={[styles.tag, { backgroundColor: step.color }]}>
            <Ionicons name={step.icon} size={13} color="#04211F" />
            <Text style={styles.tagText}>{step.tag}</Text>
          </View>
          <Text style={[styles.stepNo, { color: step.color }]}>{`${index + 1}/${STEPS.length}`}</Text>
        </Animated.View>
        <Animated.View style={slide(1, 0.85)}>
          <Text style={[styles.title, { textShadowColor: step.color }]} accessibilityRole="header">
            {step.title}
          </Text>
        </Animated.View>
        <Animated.View style={slide(2)}>
          <Text style={styles.text}>{rich(step.text, step.color)}</Text>
        </Animated.View>
        <Animated.View style={slide(3)}>
          <Pressable
            onPress={next}
            accessibilityRole="button"
            hitSlop={8}
            testID="tour-next"
            style={({ pressed }) => [
              styles.next,
              { backgroundColor: step.color, shadowColor: step.color },
              pressed && styles.nextPressed,
            ]}
          >
            <Text style={styles.nextText}>{index + 1 < STEPS.length ? 'Devam' : 'Bitir'}</Text>
            <Ionicons name={index + 1 < STEPS.length ? 'arrow-forward' : 'checkmark'} size={18} color="#04211F" />
          </Pressable>
        </Animated.View>
        {place === 'above' && withArrow ? (
          <Animated.View style={{ opacity: items[3].interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }) }}>
            <BouncingArrow dir="down" x={arrowX - spacing.lg} color={step.color} />
          </Animated.View>
        ) : null}
      </View>

      {/* Üst şerit: adım noktaları ve Geç */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`${index + 1} / ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View
              key={`${s.target}-${i}`}
              style={[
                styles.dot,
                i < index && { backgroundColor: s.color, opacity: 0.6 },
                i === index && [styles.dotOn, { backgroundColor: s.color }],
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Eğitimi geç"
          hitSlop={10}
          testID="tour-skip"
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>Geç</Text>
          <Ionicons name="play-skip-forward" size={13} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, elevation: 90 },
  block: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dim: { position: 'absolute', backgroundColor: 'rgba(3, 8, 16, 0.86)' },
  hex: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 3,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },
  textWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  arrow: { position: 'relative', width: 56, height: 60, alignItems: 'center', justifyContent: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  tagText: { color: '#04211F', fontFamily: fonts.black, fontSize: 12, letterSpacing: 1.2 },
  stepNo: { fontFamily: fonts.extra, fontSize: 13 },
  title: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 32,
    lineHeight: 38,
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 0 },
  },
  text: {
    color: '#F2FAFF',
    fontFamily: fonts.semi,
    fontSize: 17,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  em: { fontFamily: fonts.black, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  next: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  nextPressed: { transform: [{ scale: 0.95 }] },
  nextText: { color: '#04211F', fontFamily: fonts.black, fontSize: 15 },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { width: 22 },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  skipText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.semi },
  pressed: { opacity: 0.7 },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 96, elevation: 96, backgroundColor: colors.bg },
  welcome: { gap: spacing.lg, paddingHorizontal: spacing.lg, alignItems: 'stretch' },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 },
  piece: { position: 'absolute', borderRadius: 2 },
  logoPlate: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 30,
    backgroundColor: '#05101C',
  },
  welcomeTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 28, textAlign: 'center' },
  welcomeText: { color: colors.text, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  welcomeEm: { fontFamily: fonts.black },
  welcomeButtons: { gap: spacing.sm },
});
