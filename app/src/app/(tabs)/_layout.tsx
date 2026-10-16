import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTour } from '@/components/AppTour';
import { TabTips } from '@/components/TabTips';
import { CitySplash } from '@/components/CitySplash';
import { featureOn, loadLook, resetLook, useLook } from '@/lib/look';
import { HexClusterIcon } from '@/components/HexClusterIcon';
import { NoticeDot } from '@/components/NoticeDot';
import { useAuth } from '@/lib/auth';
import { useCity } from '@/lib/city';
import { isLiveNotifyOn, startLiveNotify } from '@/lib/liveNotify';
import { clearEventReminders, syncEventReminders } from '@/lib/localNotify';
import { refreshNotices, resetNotices, useNotices } from '@/lib/notices';
import { usePermissionsDone } from '@/lib/onboarding';
import { currentTab, tabFocused } from '@/lib/tabReset';
import { readStartTab, START_TABS } from '@/lib/startTab';
import { useTourRunning } from '@/lib/tour';
import { pollToasts, resetToastClock } from '@/lib/topToast';
import { listenPushTaps, registerPush } from '@/lib/push';
import { watchUpdates } from '@/lib/updates';
import { callRpc } from '@/lib/rpc';
import { colors, fonts, isLight } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type DotKey = 'profile' | 'events' | 'map';

/** Açılış sekmesine bu açılışta geçildi mi (bir kez) */
let startTabApplied = false;

/** Anlık bildirim bağlantısı yokken sunucuya “yeni bildirim var mı?” diye sorma aralığı */
const TOAST_POLL_MS = 8_000;
/** Anlık bağlantı açıkken yalnızca güvenlik için (kaçan bir şey olmasın diye) sorma aralığı */
const TOAST_LIVE_FALLBACK_MS = 60_000;
/** Bildirim noktalarının (sayaçların) okunma aralığı; anlık bağlantı açık olan üyede daha seyrek */
const NOTICE_POLL_MS = 60_000;
const NOTICE_LIVE_POLL_MS = 180_000;
/** Çevrimiçi sinyali aralığı (moderatör panelinde son 10 dakikada sinyal gelen üye çevrimiçi görünür) */
const HEARTBEAT_MS = 5 * 60_000;

/** Sekme ikonunun sağ üstündeki kırmızı nokta: o sekmede yapılacak bir şey varsa görünür. */
function useTabDot(key: DotKey): boolean {
  const n = useNotices();
  if (key === 'profile')
    return (
      n.friendRequests +
        n.modReports +
        n.modCloseRequests +
        n.modLeaderApps +
        n.modApprovals +
        n.modTreasures +
        n.modCellCandidates +
        n.modMessages >
      0
    );
  if (key === 'map') return n.notifications > 0;
  return n.checkinEvents > 0;
}

function tabIcon(active: IconName, inactive: IconName, dot?: DotKey) {
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return (
      <View>
        <Ionicons name={focused ? active : inactive} size={size} color={color as string} />
        {dot ? <TabDot dotKey={dot} /> : null}
      </View>
    );
  }
  return TabIcon;
}

/** Harita sekmesi: küçük peteklerden oluşan küme simgesi */
function MapTabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
  return (
    <View>
      <HexClusterIcon size={size + 2} color={color} focused={focused} />
      <TabDot dotKey="map" />
    </View>
  );
}

function TabDot({ dotKey }: { dotKey: DotKey }) {
  const on = useTabDot(dotKey);
  if (!on) return null;
  return <NoticeDot size={12} ringColor="#0F1424" style={styles.tabDot} testID={`tab-dot-${dotKey}`} />;
}

// Uygulama Harita sekmesiyle açılır (açılış sekmesi tercihi ayrıca uygulanır)
export const unstable_settings = {
  anchor: 'index',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { profile, account } = useAuth();
  const isModerator = profile?.role === 'admin';
  const userId = profile?.id ?? null;
  const city = useCity();
  const permissionsDone = usePermissionsDone();
  // Bekleyen üye (haritalarımızın dışından girdi, şehri yok): yalnızca Harita (ziyaret) ve Profil sekmeleri görünür
  const noCity = city.loaded && !city.my;
  const hideForWaiting = noCity ? { href: null } : null;
  // Yönetim panelinden kapatılan Akış sekmesi gizlenir
  const look = useLook();
  const hideFeed = noCity || !featureOn(look.features, 'akis') ? { href: null } : null;
  // Görünüm (özellikler, kampanya şeridi, açılış görseli, özel gün teması): açılışta ve şehir değişince okunur
  const lookCity = city.content;
  useEffect(() => {
    if (!userId) return;
    void loadLook(lookCity);
  }, [userId, lookCity]);
  useEffect(() => () => resetLook(), []);
  const tourReady = permissionsDone && !!account && !account.needs_recovery && city.loaded && !!city.my;

  // Çevrimiçi sinyali: uygulama açıkken 5 dakikada bir ve uygulamaya dönünce (yalnızca moderatör görür)
  useEffect(() => {
    if (!userId) return;
    const beat = () => {
      if (AppState.currentState === 'active') void callRpc<null>('heartbeat');
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [userId]);

  // Açılış sekmesi (Profil > Tercihler): uygulama açılınca bir kez, eğitim bittiyse o sekmeye geçilir
  const tourRunning = useTourRunning();
  const tourShown = tourReady && !!profile?.id && profile.role !== 'sponsor';
  useEffect(() => {
    if (startTabApplied || !userId || !city.loaded || noCity) return;
    if (tourShown && tourRunning) return;
    startTabApplied = true;
    const pick = START_TABS.find((t) => t.key === readStartTab());
    if (pick && pick.key !== 'index' && currentTab() === 'index') router.navigate(pick.path);
  }, [userId, city.loaded, noCity, tourShown, tourRunning]);

  // Uzaktan güncelleme: yeni sürüm hazırsa sorulur (mağazadan indirmeden)
  useEffect(() => watchUpdates(), []);

  // Uzaktan bildirim: telefonun bildirim adresi sunucuya yazılır (izin varsa); bildirime dokununca ilgili ekran açılır.
  // Uygulamaya dönünce yeniden denenir (izin sonradan telefon ayarlarından verilmiş olabilir).
  useEffect(() => {
    if (!userId) return;
    void registerPush();
    const stop = listenPushTaps();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registerPush();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [userId]);

  // Moderatör: petek adı adayları saatte bir hesaplanır (sunucu da saatte bir kez çalıştırır); yeniler bildirim olur
  useEffect(() => {
    if (!isModerator) return;
    const run = () => void callRpc<number>('admin_refresh_cell_candidates').then(() => refreshNotices());
    run();
    const t = setInterval(run, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [isModerator]);

  // Bildirim sayıları (arkadaşlık isteği, kod girişi açık etkinlik, moderatör işleri): açılışta, uygulamaya dönünce,
  // yeni bildirim gelince (anlık) ve dakikada bir okunur. Anlık bağlantısı açık üyede 3 dakikada bir okunması yeter;
  // moderatörün iş sayaçları (şikayet, onay…) bildirimle gelmediği için onda dakikada bir okunur.
  useEffect(() => {
    void refreshNotices();
    let last = Date.now();
    const timer = setInterval(() => {
      const every = isLiveNotifyOn() && !isModerator ? NOTICE_LIVE_POLL_MS : NOTICE_POLL_MS;
      if (Date.now() - last < every - 1000) return;
      last = Date.now();
      void refreshNotices();
    }, NOTICE_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        last = Date.now();
        void refreshNotices();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      resetNotices();
    };
  }, [isModerator]);

  // Üstten kayan bildirim: sunucu yeni bir bildirim ya da duyuru yazınca anlık bağlantı hemen haber verir (oyun davetleri
  // anında ulaşır). Bağlantı açıkken güvenlik için dakikada bir, bağlantı kurulamazsa 8 saniyede bir ve uygulamaya
  // dönünce yeni bildirim var mı diye bakılır. Etkinlik hatırlatmaları açılışta ve uygulamaya dönünce eşitlenir.
  useEffect(() => {
    resetToastClock();
    let lastPoll = Date.now();
    const poll = () => {
      lastPoll = Date.now();
      void pollToasts();
    };
    poll();
    void syncEventReminders();
    const stopLive = userId ? startLiveNotify(userId, poll) : () => {};
    const timer = setInterval(() => {
      if (isLiveNotifyOn() && Date.now() - lastPoll < TOAST_LIVE_FALLBACK_MS - 1000) return;
      poll();
    }, TOAST_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        poll();
        void syncEventReminders();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      stopLive();
      resetToastClock();
      void clearEventReminders();
    };
  }, [userId]);

  // Yazı tipi satır yüksekliği büyük olduğu için çubuğa sabit ve yeterli bir yükseklik veriyoruz.
  const bottom = Math.max(insets.bottom, 8);
  // Uygulama eğitimi: izin ekranları ve şehir seçimi bittikten sonra bir kez (sekmelerin üstünde; başka bir ekran
  // açılınca o ekranın altında kalır)
  const showTour = tourReady && !!profile?.id && profile.role !== 'sponsor';
  return (
    <View style={styles.flex}>
    <Tabs
      // Başka sekmeye geçilince bırakılan sekme ilk haline döner (açık pencereler kapanır)
      screenListeners={({ route }) => ({ focus: () => tabFocused(route.name) })}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semi, fontSize: 11, lineHeight: 14 },
        tabBarStyle: {
          backgroundColor: isLight ? colors.surface : '#0A1D2B',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="akis"
        options={{ title: 'Akış', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline'), ...hideFeed }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Etkinlik', tabBarIcon: tabIcon('calendar', 'calendar-outline', 'events'), ...hideForWaiting }}
      />
      {/* Sıra: Akış · Etkinlik · Harita · Oyun · Profil. Uygulama yine Harita (index) ile açılır. */}
      <Tabs.Screen name="index" options={{ title: 'Harita', tabBarIcon: MapTabIcon }} />
      <Tabs.Screen
        name="games"
        options={{ title: 'Oyun', tabBarIcon: tabIcon('game-controller', 'game-controller-outline'), ...hideForWaiting }}
      />
      {/* Eski “/map” adresi: yalnızca yönlendirir, sekmede görünmez */}
      <Tabs.Screen name="map" options={{ href: null }} />
      {/* Sıralama artık Oyunlar sekmesinin içinden açılır; sekme çubuğunda görünmez */}
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: tabIcon('person', 'person-outline', 'profile'),
        }}
      />
    </Tabs>
      {showTour && profile ? <AppTour key={profile.id} userId={profile.id} tabBarHeight={58 + bottom} /> : null}
      {/* Şehir açılış görseli (yönetim panelinden): uygulama açılınca bir kez, eğitim sırasında değil */}
      {!(showTour && tourRunning) ? <CitySplash /> : null}
      {/* Eğitimden sonra: sekme ilk açıldığında kısa ipuçları */}
      {showTour && profile ? <TabTips key={`tips-${profile.id}`} userId={profile.id} tabBarHeight={58 + bottom} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabDot: { position: 'absolute', top: -3, right: -6 },
});
