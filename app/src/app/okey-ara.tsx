import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { OK, OkeyIntroBackdrop } from '@/components/OkeyParts';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { matchCancel, matchJoin, matchPoll, queueTestBots } from '@/lib/shark';
import { fonts } from '@/theme';

const POLL_MS = 2000;

/**
 * Okey / 101 Okey uzaktan eşleşme (`?oyun=okey101`): sıraya girilir, sırada 4 kişi olunca masa kurulur ve oyun hemen
 * başlar. Herkes rumuzuyla görünür. Ekrandan çıkılırsa sıradan çıkılır.
 */
export default function OkeySearchScreen() {
  const params = useLocalSearchParams<{ oyun?: string }>();
  const game = params.oyun === 'okey101' ? 'okey101' : 'okey';
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [waiting, setWaiting] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const matched = useRef(false);

  useEffect(() => {
    let alive = true;
    const go = (room: string) => {
      if (matched.current) return;
      matched.current = true;
      router.replace({ pathname: '/okey', params: { id: room } });
    };
    void matchJoin(game).then((res) => {
      if (!alive) return;
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.data?.room) go(res.data.room);
      else setWaiting(res.data?.waiting ?? 1);
    });
    const t = setInterval(() => {
      void matchPoll().then((st) => {
        if (!alive || !st) return;
        if (st.room) go(st.room);
        else setWaiting(st.waiting);
      });
    }, POLL_MS);
    const c = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
      if (!matched.current) void matchCancel();
    };
  }, [game]);

  function cancel() {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/okey-giris', params: { oyun: game } });
  }

  const n = Math.max(1, Math.min(4, waiting));
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <OkeyIntroBackdrop wood={game === 'okey101'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Ionicons name="grid" size={34} color={OK.glow} />
        <Text style={styles.title}>{game === 'okey' ? 'Okey' : '101 Okey'} masası aranıyor</Text>
        <Text style={styles.sub}>Bütün şehirlerden oyuncu aranıyor. 4 kişi olunca masa kurulur ve oyun hemen başlar.</Text>
        <View style={styles.table} accessibilityLabel={`Sırada ${n} kişi`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.seat, i < n && styles.seatOn]}>
              {i === 0 ? (
                <Avatar index={profile?.avatar_index ?? 1} size={46} />
              ) : (
                <Ionicons name={i < n ? 'person' : 'person-outline'} size={22} color={i < n ? '#04211F' : OK.muted} />
              )}
            </View>
          ))}
        </View>
        <Text style={styles.count}>{n}/4</Text>
        <Text style={styles.time}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
        <Text style={styles.info}>
          Uzaktan masa: tekli, yardımlı{game === 'okey' ? ', 10 puan' : ', katlamasız, cezalı, 3 el'}. Arkadaşlarınla kendi
          ayarlarınla oynamak için yan yana masa aç.
        </Text>
        <View style={styles.privacy}>
          <Ionicons name="eye-off" size={16} color={OK.glow} />
          <Text style={styles.privacyText}>Gerçek adın görünmez; diğer oyuncular yalnızca rumuzunu ve avatarını görür.</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {/* GEÇİCİ: moderatör tek telefonla deneyebilsin */}
        {isModerator ? (
          <Pressable
            onPress={() =>
              void queueTestBots(3, game).then((r) => {
                if (r.error) void notify('Eklenemedi', r.error, { icon: null });
              })
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.botBtn, pressed && styles.pressed]}
          >
            <Ionicons name="hardware-chip-outline" size={17} color="#FFFFFF" />
            <Text style={styles.botText}>Sıraya +3 deneme oyuncusu</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={cancel} accessibilityRole="button" testID="ok-search-cancel" style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <Ionicons name="close-circle" size={22} color="#FFFFFF" />
          <Text style={styles.cancelText}>Vazgeç</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071F26', overflow: 'hidden' },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  pressed: { opacity: 0.75 },
  title: { color: OK.text, fontFamily: fonts.black, fontSize: 22, textAlign: 'center' },
  sub: { color: OK.muted, fontFamily: fonts.semi, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  table: { flexDirection: 'row', gap: 12, marginTop: 12 },
  seat: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(156,201,194,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  seatOn: { backgroundColor: OK.glow, borderColor: OK.glow },
  count: { color: OK.text, fontFamily: fonts.black, fontSize: 18 },
  time: { color: OK.muted, fontFamily: fonts.extra, fontSize: 14 },
  info: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  privacyText: { color: OK.muted, fontFamily: fonts.semi, fontSize: 12, flexShrink: 1 },
  error: { color: OK.danger, fontFamily: fonts.semi, fontSize: 13, textAlign: 'center' },
  botBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  botText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13 },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 99,
    backgroundColor: 'rgba(255,84,112,0.85)',
    marginTop: 8,
  },
  cancelText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 15 },
});
