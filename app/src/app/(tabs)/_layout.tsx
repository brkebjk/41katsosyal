import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HexClusterIcon } from '@/components/HexClusterIcon';
import { NoticeDot } from '@/components/NoticeDot';
import { useAuth } from '@/lib/auth';
import { isLiveNotifyOn, startLiveNotify } from '@/lib/liveNotify';
import { clearEventReminders, syncEventReminders } from '@/lib/localNotify';
import { refreshNotices, resetNotices, useNotices } from '@/lib/notices';
import { tabFocused } from '@/lib/tabReset';
import { pollToasts, resetToastClock } from '@/lib/topToast';
import { callRpc } from '@/lib/rpc';
import { colors, fonts, isLight } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type DotKey = 'profile' | 'events' | 'map';

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
        <Ionicons name={focused ? active : inactive} size={size} color={color} />
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

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const userId = profile?.id ?? null;

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
  return (
    <Tabs
      initialRouteName="index"
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
      <Tabs.Screen name="akis" options={{ title: 'Akış', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen
        name="events"
        options={{ title: 'Etkinlik', tabBarIcon: tabIcon('calendar', 'calendar-outline', 'events') }}
      />
      {/* Sıra: Akış · Etkinlik · Harita · Oyun · Profil. Uygulama yine Harita (index) ile açılır. */}
      <Tabs.Screen name="index" options={{ title: 'Harita', tabBarIcon: MapTabIcon }} />
      <Tabs.Screen
        name="games"
        options={{ title: 'Oyun', tabBarIcon: tabIcon('game-controller', 'game-controller-outline') }}
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
  );
}

const styles = StyleSheet.create({
  tabDot: { position: 'absolute', top: -3, right: -6 },
});
