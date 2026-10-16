import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { ImageSlot } from '@/components/ImageSlot';
import { PrimaryButton } from '@/components/PrimaryButton';
import { imageAspect } from '@/lib/images';
import { isTourDone, markTourDone } from '@/lib/onboarding';
import { currentTab, onTabFocused } from '@/lib/tabReset';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Step = {
  /** Sekmenin adresteki adı (tabFocused ile gelen) */
  tab: string;
  /** Sekme çubuğundaki sırası (0 = en sol) */
  slot: number;
  label: string;
  icon: IconName;
  title: string;
  items: { icon: IconName; lead: string; text: string }[];
};

/** Sekme çubuğunun sırası: Akış · Etkinlik · Harita · Oyun · Profil */
const TAB_COUNT = 5;

const STEPS: Step[] = [
  {
    tab: 'akis',
    slot: 0,
    label: 'Akış',
    icon: 'chatbubbles',
    title: 'Akış: şehrinin sesi',
    items: [
      { icon: 'people', lead: 'Rumuzla paylaşım.', text: 'Şehrindeki herkesin gönderileri burada akar. Herkes rumuzuyla görünür; gerçek adın yalnızca arkadaşlarına görünür.' },
      { icon: 'create', lead: 'Gönderi yaz.', text: 'Alttaki kutudan yaz; istersen yakınındaki bir mekânı ekle. Gönderiler bir hafta akışta kalır.' },
      { icon: 'happy', lead: 'Tepki ve yorum.', text: 'Gönderiye güldüm, + ya da − ile tepki ver, yorum yaz. @#kod yazarak birini etiketleyebilirsin.' },
      { icon: 'funnel', lead: 'Süz.', text: 'Sol üstteki huniyle yalnızca kendi gönderilerini, seni etiketleyenleri ya da bir ilçeyi görürsün.' },
      { icon: 'mail', lead: 'Mesajlar ve kurallar.', text: 'Sağ üstte özel mesajların ve arkadaşların; yanında topluluk kuralları var. Uygunsuz içeriği gönderinin menüsünden şikayet edebilirsin.' },
    ],
  },
  {
    tab: 'events',
    slot: 1,
    label: 'Etkinlik',
    icon: 'calendar',
    title: 'Etkinlik: yüz yüze buluş',
    items: [
      { icon: 'grid', lead: 'Kategoriler.', text: 'Şehrindeki buluşmalar kategorilere ayrılır: Oyun Geceleri, Sosyal Buluşmalar, Müzik & Eğlence, Konser & Festival ve daha fazlası.' },
      { icon: 'add-circle', lead: 'Oluştur.', text: 'Kendi etkinliğini aç. Sağ üstteki petek göstergesi bu ay kaç etkinlik açabileceğini gösterir.' },
      { icon: 'person-add', lead: 'Ön kayıt.', text: 'Bir etkinliğe katılacaksan ön kayıt yaptır; etkinlik yaklaşınca hatırlatılır.' },
      { icon: 'enter', lead: 'Katılım Doğrula.', text: 'Etkinlikte düzenleyenin verdiği kodu buraya yazınca katılımın sayılır ve puan kazanırsın.' },
      { icon: 'star', lead: 'PeopleHere Özel.', text: 'Sarı yıldızlı etkinlikleri moderatörler düzenler; daha çok puan verir. Kartlardaki “Haritada gör” etkinliğin yerini gösterir.' },
    ],
  },
  {
    tab: 'index',
    slot: 2,
    label: 'Harita',
    icon: 'map',
    title: 'Harita: şehrin petekleri',
    items: [
      { icon: 'apps', lead: 'Petekler.', text: 'Şehrin 500 metrelik peteklere bölünmüş haritası. Renkler: yoğunluk, turkuaz etkinlik, mor oyun, mercan mekân, altın PeopleHere Özel. Soldaki şerit renkleri açıklar.' },
      { icon: 'hand-left', lead: 'Peteğe dokun.', text: 'Petek yükselir; “İNCELE” ile menüsü açılır: petek akışı, Burada kim var?, Oyun arayanlar, etkinlikler, mekânlar ve hazine.' },
      { icon: 'sync', lead: 'Göç ve ziyaret.', text: 'Sağdaki ⟳ düğmesi Şehrim’i açar: göç et ya da başka bir şehrin haritasına ziyaretçi olarak bak. Sol üstteki şehir düğmesi de ziyaret içindir.' },
      { icon: 'search', lead: 'Bul.', text: 'Büyüteç bir oyun ya da etkinlik türünün olduğu petekleri okla gösterir. Üstteki arama çubuğuyla yer ya da petek adı ararsın.' },
      { icon: 'locate', lead: 'Konumum ve filtreler.', text: 'Konumum seni peteğine götürür. Alttaki şeritlerle bugünü, bu haftayı ya da yalnızca bir türü süzersin; “Şehrin Temposu” şehrin ne kadar hareketli olduğunu gösterir.' },
    ],
  },
  {
    tab: 'games',
    slot: 3,
    label: 'Oyun',
    icon: 'game-controller',
    title: 'Oyun: birlikte oyna',
    items: [
      { icon: 'albums', lead: 'Oyunlar.', text: 'Köpekbalığı Kafesi, Vampir–Köylü, Bilgi Yarışması, Hazine Avı ve çekilişler. Bir oyuna dokununca giriş ekranı ve rehberi açılır.' },
      { icon: 'people-circle', lead: 'Yan yana.', text: 'Aynı masada, telefonlarla oynanır; konum doğrulanır, odaya kodla girilir. Puan uzaktanla aynıdır, aylık hedefi daha yüksektir.' },
      { icon: 'globe', lead: 'Uzaktan Eşleş.', text: 'Bütün illerden oyuncularla eşleşirsin. Açık oda yoksa 45 saniye sonra sana oda açılır, orada başkalarını beklersin.' },
      { icon: 'add-circle', lead: 'Oda Oluştur ve Katıl.', text: 'Alttaki düğmelerle oda açar ya da arkadaşının verdiği davet koduyla katılırsın.' },
      { icon: 'trophy', lead: 'Sıralama.', text: 'Sıralama kutusundan şehrinin ve Tüm İller’in aylık sıralamasına, oyun sıralamalarına ve ödüllere ulaşırsın. Oyun kutularındaki halka bu ay kalan puan hedefini gösterir.' },
    ],
  },
  {
    tab: 'profile',
    slot: 4,
    label: 'Profil',
    icon: 'person',
    title: 'Profil: senin alanın',
    items: [
      { icon: 'ribbon', lead: 'Puan ve seviye.', text: 'En üstte puanın, seviyen ve bu haftaki rumuzun görünür.' },
      { icon: 'heart', lead: 'Arkadaşlarım.', text: 'Arkadaşlarını gör, arkadaşlık isteklerini yönet. Başka şehirdeki arkadaşının yanında şehri yazar.' },
      { icon: 'location', lead: 'Şehrim.', text: 'Şehrini gör, göç listesine yazıl ya da başka şehirleri ziyaret et.' },
      { icon: 'notifications', lead: 'Bildirim ve konum.', text: 'Hangi bildirimleri alacağını seç, telefon izinlerini gör.' },
      { icon: 'settings', lead: 'Hesabım ve Uygulama.', text: 'Kullanıcı adın, kurtarma kelimelerin, engellediklerin, kişisel verilerin; sözleşmeler, SSS, yarışma kuralları ve bize ulaşın. Bir sorun görürsen “Bir Sorun Bildir”.' },
    ],
  },
];

/**
 * Uygulama eğitimi (ilk girişte, izin ekranları ve şehir seçiminden sonra bir kez): sırayla her sekmeye dokundurulur,
 * o sekmede neler olduğu ve hangi menüden nereye gidileceği anlatılır. En sonda hoş geldin ekranı; altında yarışma
 * kuralları ve ödül programı düğmeleri. Sekme çubuğu açık kalır (dokunulsun diye), ekranın geri kalanı kapanır.
 */
export function AppTour({ userId, tabBarHeight }: { userId: string; tabBarHeight: number }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<'checking' | 'tap' | 'info' | 'welcome' | 'done'>('checking');
  const [index, setIndex] = useState(0);
  const step = STEPS[index];

  useEffect(() => {
    let alive = true;
    void isTourDone(userId).then((done) => {
      if (!alive) return;
      setIndex(0);
      setPhase(done ? 'done' : currentTab() === STEPS[0].tab ? 'info' : 'tap');
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // İstenen sekmeye dokununca o sekmenin anlatımı açılır
  useEffect(() => {
    if (phase !== 'tap') return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onTabFocused((name) => {
      // Sekme geçişi bittikten sonra (gezinme sırasında başka bileşen çizilirken durum değiştirilmez)
      if (name === STEPS[index].tab) t = setTimeout(() => setPhase('info'), 0);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [phase, index]);

  if (phase === 'checking' || phase === 'done') return null;

  function next() {
    const n = index + 1;
    if (n >= STEPS.length) {
      setPhase('welcome');
      return;
    }
    setIndex(n);
    setPhase(currentTab() === STEPS[n].tab ? 'info' : 'tap');
  }

  async function finish(go?: '/kurallar' | '/oduller') {
    await markTourDone(userId);
    setPhase('done');
    if (go) router.push(go);
  }

  // Sekme çubuğunun yüksekliği (sekme düzenindekiyle aynı: 58 + alt boşluk)
  const tabBarH = tabBarHeight;
  const slotW = width / TAB_COUNT;
  const arrowX = slotW * step.slot + slotW / 2 - 14;

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

  return (
    <View style={[styles.cover, { bottom: tabBarH }]} testID="tour">
      <View style={styles.dim} />
      {phase === 'tap' ? (
        <View style={styles.tapWrap} pointerEvents="box-none">
          <View style={styles.tapCard}>
            <Text style={styles.stepNo}>{`${index + 1} / ${STEPS.length}`}</Text>
            <View style={styles.tapRow}>
              <Ionicons name={step.icon} size={22} color={colors.primary} />
              <Text style={styles.tapText}>{`Aşağıdaki ${step.label} sekmesine dokun`}</Text>
            </View>
          </View>
          <Ionicons name="arrow-down" size={28} color="#FFFFFF" style={[styles.arrow, { left: arrowX }]} />
        </View>
      ) : (
        <View style={[styles.infoWrap, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.infoCard}>
            <View style={styles.infoHead}>
              <Ionicons name={step.icon} size={22} color={colors.primary} />
              <Text style={styles.infoTitle} accessibilityRole="header">
                {step.title}
              </Text>
              <Text style={styles.stepNo}>{`${index + 1} / ${STEPS.length}`}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.items}>
              {step.items.map((it) => (
                <View key={it.lead} style={styles.item}>
                  <Ionicons name={it.icon} size={18} color={colors.primary} style={styles.itemIcon} />
                  <Text style={styles.itemText}>
                    <Text style={styles.itemLead}>{`${it.lead} `}</Text>
                    {it.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <PrimaryButton label={index + 1 < STEPS.length ? 'Devam' : 'Bitir'} onPress={next} testID="tour-next" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 90, elevation: 90 },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(3, 8, 16, 0.62)' },
  tapWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingBottom: 40 },
  tapCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  tapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tapText: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, lineHeight: 22 },
  arrow: { position: 'absolute', bottom: 6 },
  stepNo: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  infoWrap: { flex: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.md, justifyContent: 'flex-end' },
  infoCard: {
    maxHeight: '100%',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoTitle: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  items: { gap: spacing.md },
  item: { flexDirection: 'row', gap: spacing.md },
  itemIcon: { marginTop: 1 },
  itemText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  itemLead: { fontFamily: fonts.extra },
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
