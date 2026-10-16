import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { ImageSlot } from '@/components/ImageSlot';
import { PrimaryButton } from '@/components/PrimaryButton';
import { imageAspect } from '@/lib/images';
import { isTourDone, markTourDone } from '@/lib/onboarding';
import { currentTab } from '@/lib/tabReset';
import { setActiveTourId, useTourRect, type TourRect } from '@/lib/tour';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Step = {
  /** Sekmenin adresteki adı ve açılacak adres */
  tab: string;
  path: Href;
  /** Anlatılan alan (TourTarget) ya da sekme çubuğu */
  target: string;
  icon: IconName;
  title: string;
  text: string;
};

const TABBAR = '__tabbar';

const STEPS: Step[] = [
  {
    tab: 'index',
    path: '/',
    target: TABBAR,
    icon: 'apps',
    title: 'Sekmeler',
    text: 'Uygulamanın beş bölümü: Akış, Etkinlik, Harita, Oyun ve Profil. Şimdi hepsini sırayla gezelim.',
  },
  {
    tab: 'akis',
    path: '/akis',
    target: 'feed-header',
    icon: 'chatbubbles',
    title: 'Akış: üstteki düğmeler',
    text: 'Huni ile akışı süzersin (yalnızca kendi gönderilerin, seni etiketleyenler ya da bir ilçe). Yanında topluluk kuralları; sağda özel mesajların ve arkadaşların.',
  },
  {
    tab: 'akis',
    path: '/akis',
    target: 'feed-composer',
    icon: 'create',
    title: 'Gönderi kutusu',
    text: 'Şehrine rumuzunla yaz; istersen yakınındaki bir mekânı ekle. Gönderiler bir hafta akışta kalır. @#kod yazarak birini etiketleyebilirsin.',
  },
  {
    tab: 'events',
    path: '/events',
    target: 'events-gauge',
    icon: 'calendar',
    title: 'Etkinlik hakkın',
    text: 'Bu ay kaç etkinlik açabileceğini gösterir. Dokununca hakkını nasıl artıracağını görürsün.',
  },
  {
    tab: 'events',
    path: '/events',
    target: 'events-categories',
    icon: 'grid',
    title: 'Kategoriler',
    text: 'Şehrindeki yüz yüze buluşmalar kategorilere ayrılır. Bir kategoriye dokununca etkinlikleri açılır; ön kayıt yaptırabilir, “Haritada gör” ile yerini bulabilirsin.',
  },
  {
    tab: 'events',
    path: '/events',
    target: 'events-actions',
    icon: 'enter',
    title: 'Oluştur ve Katılım Doğrula',
    text: 'Oluştur ile kendi etkinliğini açarsın. Etkinlikte düzenleyenin verdiği kodu Katılım Doğrula’dan yazınca katılımın sayılır ve puan kazanırsın.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-city',
    icon: 'location',
    title: 'Şehir düğmesi',
    text: 'Haritanın şehri. Dokununca başka bir şehrin haritasına ziyaretçi olarak bakabilirsin; ziyarette yalnızca harita görünür.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-search',
    icon: 'search',
    title: 'Arama',
    text: 'Bir yerin ya da peteğin adını yaz; harita o peteğe gider.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-controls',
    icon: 'sync',
    title: 'Harita düğmeleri',
    text: 'Mor ⟳ Göç et (şehrini değiştir ya da başka şehre bak), sarı büyüteç (bir oyunun ya da etkinlik türünün olduğu petekleri gösterir), yakınlaştır, uzaklaştır, tüm şehir ve Konumum.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-legend',
    icon: 'color-palette',
    title: 'Renkler',
    text: 'Petek renklerinin anlamı: yoğunluk, turkuaz etkinlik, mor oyun, mercan mekân, altın PeopleHere Özel. Bir peteğe dokun, “İNCELE” ile menüsünü aç: petek akışı, Burada kim var?, Oyun arayanlar, mekânlar.',
  },
  {
    tab: 'index',
    path: '/',
    target: 'map-filters',
    icon: 'funnel',
    title: 'Filtreler',
    text: 'Bugünü, bu haftayı ya da yalnızca bir türü (oyun, etkinlik, mekân) göster. Şehrin Temposu şehrin şu an ne kadar hareketli olduğunu gösterir.',
  },
  {
    tab: 'games',
    path: '/games',
    target: 'games-podium',
    icon: 'trophy',
    title: 'Aylık Ödül Podyumu',
    text: 'Bu ayın ilk üçü. Buradan sıralamaya (şehrin ve Tüm İller), oyun sıralamalarına ve ödüllere ulaşırsın.',
  },
  {
    tab: 'games',
    path: '/games',
    target: 'games-tiles',
    icon: 'game-controller',
    title: 'Oyunlar',
    text: 'Köpekbalığı Kafesi, Vampir–Köylü, Bilgi Yarışması, Hazine Avı ve çekilişler. Yan yana (aynı masada) ya da uzaktan, bütün illerden oyuncularla oynarsın. Halka bu ay kalan puan hedefini gösterir.',
  },
  {
    tab: 'games',
    path: '/games',
    target: 'games-actions',
    icon: 'add-circle',
    title: 'Oda Oluştur ve Katıl',
    text: 'Oyun seçip oda açarsın ya da arkadaşının verdiği davet koduyla odasına katılırsın.',
  },
  {
    tab: 'profile',
    path: '/profile',
    target: 'profile-hero',
    icon: 'person',
    title: 'Kimliğin',
    text: 'Profil resmin, adın, bu haftaki rumuzun, seviyen ve puanın.',
  },
  {
    tab: 'profile',
    path: '/profile',
    target: 'profile-menu',
    icon: 'list',
    title: 'Menü',
    text: 'Arkadaşlarım, Şehrim (göç ve ziyaret), Bildirim ve konum. Aşağıda Hesabım, Kişisel Verilerim, sözleşmeler, SSS ve yarışma kuralları var.',
  },
];

/** Alanın çevresindeki boşluk (px) */
const PAD = 6;
/** Kart için gereken en az yükseklik (px); alanın üstünde ya da altında bu kadar yer yoksa kart ekranın altına konur */
const CARD_MIN_H = 190;

/**
 * Uygulama eğitimi (ilk girişte, izin ekranları ve şehir seçiminden sonra bir kez): sekmeler kendiliğinden açılır,
 * anlatılan alan dışındaki her yer kararır, açıklama yazar; Devam ile sıradaki alana geçilir. Sağ alttaki Geç
 * eğitimi bitirir ve hoş geldin ekranını açar. Hoş geldin ekranında yarışma kuralları ve ödül programı düğmeleri var.
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

  if (phase === 'checking' || phase === 'done') return null;

  async function finish(go?: '/kurallar' | '/oduller') {
    await markTourDone(userId);
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
            <PrimaryButton label="Yarışma kuralları" variant="ghost" onPress={() => void finish('/kurallar')} testID="tour-rules" />
            <PrimaryButton label="Ödül programı" variant="ghost" onPress={() => void finish('/oduller')} testID="tour-prizes" />
            <PrimaryButton label="Başla" onPress={() => void finish()} testID="tour-start" />
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

  // Kart: alanın altında ya da üstünde, hangisinde yer varsa; ikisinde de yoksa ekranın altında
  const skipRow = insets.bottom + 44;
  const top = insets.top + spacing.sm;
  let cardStyle: { top?: number; bottom?: number } = { bottom: skipRow + spacing.sm };
  if (hole) {
    const below = H - (hole.y + hole.h) - skipRow;
    const above = hole.y - top;
    if (below >= CARD_MIN_H) cardStyle = { top: hole.y + hole.h + spacing.md };
    else if (above >= CARD_MIN_H) cardStyle = { bottom: H - hole.y + spacing.md };
  }

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
      {/* Dokunuşlar alttaki ekrana geçmez; anlatılan alanın dışı kararır */}
      <View style={styles.block} />
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

      <View style={[styles.card, cardStyle]} testID="tour-card">
        <View style={styles.cardHead}>
          <Ionicons name={step.icon} size={20} color={colors.primary} />
          <Text style={styles.cardTitle} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={styles.stepNo}>{`${index + 1} / ${STEPS.length}`}</Text>
        </View>
        <Text style={styles.cardText}>{step.text}</Text>
        <PrimaryButton label={index + 1 < STEPS.length ? 'Devam' : 'Bitir'} onPress={next} testID="tour-next" />
      </View>

      <Pressable
        onPress={() => setPhase('welcome')}
        accessibilityRole="button"
        accessibilityLabel="Eğitimi geç"
        hitSlop={10}
        testID="tour-skip"
        style={({ pressed }) => [styles.skip, { bottom: insets.bottom + 10 }, pressed && styles.pressed]}
      >
        <Text style={styles.skipText}>Geç</Text>
        <Ionicons name="play-skip-forward" size={13} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, elevation: 90 },
  block: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dim: { position: 'absolute', backgroundColor: 'rgba(3, 8, 16, 0.72)' },
  ring: { position: 'absolute', borderRadius: 14, borderWidth: 2, borderColor: colors.primary },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  cardText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  stepNo: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  skip: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  skipText: { color: '#FFFFFF', fontSize: fontSizes.xs, fontFamily: fonts.semi },
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
  welcomeTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  welcomeText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21, textAlign: 'center' },
  welcomeButtons: { gap: spacing.sm },
});
