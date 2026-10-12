import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoticeDot } from '@/components/NoticeDot';
import { useAuth } from '@/lib/auth';
import { clearEventReminders, syncEventReminders } from '@/lib/localNotify';
import { refreshNotices, resetNotices, useNotices } from '@/lib/notices';
import { tabFocused } from '@/lib/tabReset';
import { pollToasts, resetToastClock } from '@/lib/topToast';
import { callRpc } from '@/lib/rpc';
import { colors, fonts } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type DotKey = 'profile' | 'events' | 'map';

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

function TabDot({ dotKey }: { dotKey: DotKey }) {
  const on = useTabDot(dotKey);
  if (!on) return null;
  return <NoticeDot size={12} ringColor="#0F1424" style={styles.tabDot} testID={`tab-dot-${dotKey}`} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';

  // Moderatör: petek adı adayları saatte bir hesaplanır (sunucu da saatte bir kez çalıştırır); yeniler bildirim olur
  useEffect(() => {
    if (!isModerator) return;
    const run = () => void callRpc<number>('admin_refresh_cell_candidates').then(() => refreshNotices());
    run();
    const t = setInterval(run, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [isModerator]);

  // Bildirim sayıları (arkadaşlık isteği, kod girişi açık etkinlik, moderatör işleri): açılışta, uygulamaya dönünce
  // ve dakikada bir okunur
  useEffect(() => {
    void refreshNotices();
    const timer = setInterval(() => void refreshNotices(), 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshNotices();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      resetNotices();
    };
  }, []);

  // Üstten kayan bildirim: 8 saniyede bir (oyun davetleri hemen ulaşsın) ve uygulamaya dönünce yeni bildirim var mı diye bakılır.
  // Etkinlik hatırlatmaları açılışta ve uygulamaya dönünce sunucudaki ön kayıtlarla eşitlenir.
  useEffect(() => {
    resetToastClock();
    void pollToasts();
    void syncEventReminders();
    const timer = setInterval(() => void pollToasts(), 8_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void pollToasts();
        void syncEventReminders();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      resetToastClock();
      void clearEventReminders();
    };
  }, []);

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
          backgroundColor: '#0F1424',
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
      <Tabs.Screen name="index" options={{ title: 'Harita', tabBarIcon: tabIcon('map', 'map-outline', 'map') }} />
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
