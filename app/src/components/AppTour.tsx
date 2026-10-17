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

type Step = {
  /** Sekmenin adresteki adı ve açılacak adres */
  tab: string;
  path: Href;
  /** Anlatılan alan (TourTarget) ya da sekme çubuğu */
  target: string;
  title: string;
  text: string;
};

const TABBAR = '__tabbar';

/** Kısa eğitim: her adım tek alanı gösterir (başlıca özellikler; ayrıntılar ekranların kendi bilgi düğmelerinde) */
const STEPS: Step[] = [
  {
    tab: 'index',
    path: '/',
    target: TABBAR,
    title: 'Beş bölüm',
    text: 'Akış, Etkinlik, Harita, Oyun ve Profil. Hızlıca gezelim.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-legend',
    title: 'Şehrin haritası',
    text: 'Renkli petekler şehrin hareketini gösterir: turkuaz etkinlik, mor oyun, mercan mekân. Bir peteğe dokun, İNCELE ile içine bak.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-controls',
    title: 'Harita düğmeleri',
    text: 'Başka şehre bak, oyun ve etkinlik olan petekleri bul, yakınlaş, Konumum ile kendi peteğine dön.',
  },
  {
    tab: 'akis',
    path: '/akis',
    target: 'feed-composer',
    title: 'Akış',
    text: 'Şehrine rumuzunla yaz. Gönderiler bir hafta kalır; @#kod ile birini etiketleyebilirsin.',
  },
  {
    tab: 'events',
    path: '/events',
    target: 'events-categories',
    title: 'Etkinlikler',
    text: 'Şehrindeki yüz yüze buluşmalar. Katıl, etkinlikte söylenen kodu yaz, puanını kap.',
  },
  {
    tab: 'games',
    path: '/games',
    target: 'games-tiles',
    title: 'Oyunlar',
    text: 'Yan yana ya da uzaktan oyna, puan topla, ayın ödül podyumuna çık.',
  },
  {
    tab: 'profile',
    path: '/profile',
    target: 'profile-menu',
    title: 'Profil',
    text: 'Arkadaşların, şehrin, bildirim ayarların ve hesabın burada.',
  },
];

/** Alanın çevresindeki boşluk (px) */
const PAD = 6;
/** Yazının (ok dahil) kapladığı yaklaşık yükseklik: alanın üstünde mi altında mı duracağına karar vermek için */
const TEXT_H = 210;

/** Alanı gösteren, aşağı yukarı hafifçe zıplayan büyük ok */
function BouncingArrow({ dir, x }: { dir: 'up' | 'down'; x: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const shift = v.interpolate({ inputRange: [0, 1], outputRange: [0, dir === 'down' ? 10 : -10] });
  return (
    <Animated.View style={[styles.arrow, { left: x - 26, transform: [{ translateY: shift }] }]}>
      <Ionicons name={dir === 'down' ? 'arrow-down' : 'arrow-up'} size={52} color={colors.primary} />
    </Animated.View>
  );
}

/**
 * Uygulama eğitimi: ilk girişte, izin ekranları ve şehir seçiminden sonra, HER HESAPTA BİR KEZ (hesapta saklanır).
 * Sekmeler kendiliğinden açılır; anlatılan alan dışındaki her yer kararır, alanın üstünde ya da altında kutusuz büyük
 * yazı ve alanı gösteren ok durur. Ekrana dokunmak ya da Devam bir sonraki alana geçirir; Geç eğitimi bitirir. Sonda hoş
 * geldin ekranı açılır (yarışma kuralları ve ödül programı düğmeleriyle).
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

  if (phase === 'checking' || phase === 'done') return null;

  function finish(go?: '/kurallar' | '/oduller') {
    setPhase('done');
    if (go) router.push(go);
  }

  function next() {
    if (index + 1 >= STEPS.length) setPhase('welcome');
    else setIndex(index + 1);
  }

  if (phase === 'welcome') {
    return (
      <View style={styles.full} accessibilityViewIsModal testID="tour-welcome">
        <ScrollView
          contentContainerStyle={[
            styles.welcome,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <View style={styles.logoPlate}>
            <ImageSlot name="logo" style={{ height: 120, aspectRatio: imageAspect.logo }} />
          </View>
          <Text style={styles.welcomeTitle} accessibilityRole="header">
            Hoş geldin!
          </Text>
          <Text style={styles.welcomeText}>
            Artık şehrindeki insanlarla tanışmaya, buluşmaya ve birlikte oynamaya hazırsın. Etkinliklere katıl, oyun
            oyna, puan topla; her ay şehrinin ve bütün illerin sıralamasında yerini al.
          </Text>
          <View style={styles.welcomeButtons}>
            <PrimaryButton label="Yarışma kuralları" variant="ghost" onPress={() => finish('/kurallar')} testID="tour-rules" />
            <PrimaryButton label="Ödül programı" variant="ghost" onPress={() => finish('/oduller')} testID="tour-prizes" />
            <PrimaryButton label="Başla" onPress={() => finish()} testID="tour-start" />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Eğitim katmanının ekrandaki yeri (alanların ölçüsü pencereye göredir)
  const W = origin?.w ?? width;
  const H = origin?.h ?? height;
  let hole: TourRect | null = null;
  if (step.target === TABBAR) {
    hole = { x: 0, y: H - tabBarHeight, w: W, h: tabBarHeight };
  } else if (measured && origin) {
    const x = Math.max(0, measured.x - origin.x - PAD);
    const y = Math.max(0, measured.y - origin.y - PAD);
    const x2 = Math.min(W, measured.x - origin.x + measured.w + PAD);
    const y2 = Math.min(H, measured.y - origin.y + measured.h + PAD);
    if (x2 > x && y2 > y) hole = { x, y, w: x2 - x, h: y2 - y };
  }

  // Yazı: alanın altında ya da üstünde (hangisinde yer çoksa); ok alana doğru bakar. Alan yoksa ortada.
  const topBar = insets.top + 48;
  const bottomSafe = insets.bottom + spacing.md;
  let place: 'below' | 'above' | 'center' = 'center';
  if (hole) {
    const below = H - (hole.y + hole.h) - bottomSafe;
    const above = hole.y - topBar;
    if (below >= TEXT_H || below >= above) place = 'below';
    else place = 'above';
  }
  const arrowX = hole ? Math.min(W - 40, Math.max(40, hole.x + hole.w / 2)) : W / 2;
  const textPos =
    place === 'below' && hole
      ? { top: Math.min(hole.y + hole.h + 4, H - bottomSafe - 160) }
      : place === 'above' && hole
        ? { bottom: Math.min(H - hole.y + 4, H - topBar - 160) }
        : { top: H * 0.35 };

  const dim = (s: { left: number; top: number; width: number; height: number }) => (
    <View pointerEvents="none" style={[styles.dim, s]} />
  );

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
      {hole ? (
        <>
          {dim({ left: 0, top: 0, width: W, height: hole.y })}
          {dim({ left: 0, top: hole.y + hole.h, width: W, height: Math.max(0, H - hole.y - hole.h) })}
          {dim({ left: 0, top: hole.y, width: hole.x, height: hole.h })}
          {dim({ left: hole.x + hole.w, top: hole.y, width: Math.max(0, W - hole.x - hole.w), height: hole.h })}
          <View
            pointerEvents="none"
            style={[styles.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]}
          />
        </>
      ) : (
        dim({ left: 0, top: 0, width: W, height: H })
      )}

      {/* Kutusuz büyük yazı ve alanı gösteren ok */}
      <View pointerEvents="box-none" style={[styles.textWrap, textPos]} testID="tour-card">
        {place === 'below' ? <BouncingArrow dir="up" x={arrowX - spacing.lg} /> : null}
        <Text style={styles.title} accessibilityRole="header">
          {step.title}
        </Text>
        <Text style={styles.text}>{step.text}</Text>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          hitSlop={8}
          testID="tour-next"
          style={({ pressed }) => [styles.next, pressed && styles.pressed]}
        >
          <Text style={styles.nextText}>{index + 1 < STEPS.length ? 'Devam' : 'Bitir'}</Text>
          <Ionicons name="arrow-forward" size={18} color="#04211F" />
        </Pressable>
        {place === 'above' ? <BouncingArrow dir="down" x={arrowX - spacing.lg} /> : null}
      </View>

      {/* Üst şerit: adım noktaları ve Geç */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`${index + 1} / ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View key={`${s.target}-${i}`} style={[styles.dot, i === index && styles.dotOn, i < index && styles.dotPast]} />
          ))}
        </View>
        <Pressable
          onPress={() => setPhase('welcome')}
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
  dim: { position: 'absolute', backgroundColor: 'rgba(3, 8, 16, 0.84)' },
  ring: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  textWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  arrow: { position: 'relative', width: 52, height: 56, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 30,
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  text: {
    color: '#FFFFFF',
    fontFamily: fonts.semi,
    fontSize: 17,
    lineHeight: 25,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  next: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
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
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 20, backgroundColor: colors.primary },
  dotPast: { backgroundColor: 'rgba(255,255,255,0.7)' },
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
  logoPlate: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 30,
    backgroundColor: '#05101C',
  },
  welcomeTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 24, textAlign: 'center' },
  welcomeText: { color: colors.text, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  welcomeButtons: { gap: spacing.sm },
});
