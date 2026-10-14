import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { HoneycombMap } from '@/components/HoneycombMap';
import { Bubbles } from '@/components/SharkStage';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { matchCancel, matchJoin, matchPoll, queueTestBots } from '@/lib/shark';
import { fonts } from '@/theme';

const POLL_MS = 2000;
/** Lobi bu kadar kişiyle açılır */
const LOBBY_AT = 3;

/**
 * Uzaktan eşleştirme (Köpekbalığı Kafesi ve Vampir–Köylü; `?oyun=vampire_villager`): Bilgi Yarışması'ndaki gibi
 * haritanın üstünde avatar dolaşır. Sırada 3 kişi olunca (ya da yer olan bir lobi varsa hemen) bekleme odası açılır
 * ve oyun ekranına geçilir.
 */
export default function SharkSearchScreen() {
  const params = useLocalSearchParams<{ oyun?: string }>();
  const game = params.oyun === 'vampire_villager' ? 'vampire_villager' : 'shark_cage';
  const vampire = game === 'vampire_villager';
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [waiting, setWaiting] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const matched = useRef(false);

  // Sıraya gir, birkaç saniyede bir sor; eşleşince oyun ekranına geç
  useEffect(() => {
    let alive = true;
    const go = (room: string) => {
      if (matched.current) return;
      matched.current = true;
      router.replace({ pathname: vampire ? '/vampir' : '/kopekbaligi', params: { id: room } });
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
      // Eşleşmeden çıkıldıysa sıradan çık
      if (!matched.current) void matchCancel();
    };
  }, [game, vampire]);

  function cancel() {
    if (router.canGoBack()) router.back();
    else router.replace(vampire ? '/vampir-giris' : '/kopekbaligi-giris');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Bubbles count={12} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.title}>{vampire ? '🧛 Oyuncular aranıyor…' : '🦈 Oyuncular aranıyor…'}</Text>
        <Text style={styles.sub}>Haritanın her yerinden uzaktan oyuncu aranıyor.</Text>
        <SearchMap avatar={profile?.avatar_index ?? 1} lens={vampire ? '🧛' : '🤿'} />
        <View style={styles.seats} accessibilityLabel={`Sırada ${waiting} kişi`}>
          {Array.from({ length: LOBBY_AT }).map((_, i) => (
            <View key={i} style={[styles.seat, i < waiting && styles.seatOn]}>
              <Ionicons name={i < waiting ? 'person' : 'person-outline'} size={18} color={i < waiting ? '#06201D' : '#9AA4B2'} />
            </View>
          ))}
        </View>
        <Text style={styles.info}>
          {`${LOBBY_AT} kişi olunca bekleme odası açılır. Odada yeterli kişi olunca “Hazırım” düğmesi açılır; kalabalık oyun daha çok puan verir.`}
        </Text>
        <Text style={styles.time}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
        <View style={styles.privacy}>
          <Ionicons name="eye-off" size={16} color="#48CAE4" />
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
        <Pressable
          onPress={cancel}
          accessibilityRole="button"
          testID="sk-search-cancel"
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Ionicons name="close-circle" size={22} color="#FFFFFF" />
          <Text style={styles.cancelText}>Vazgeç</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

/** Kocaeli peteklerinin üstünde dalgıç maskeli avatar dolaşır */
function SearchMap({ avatar, lens }: { avatar: number; lens: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  useEffect(() => {
    if (box.w === 0) return;
    let alive = true;
    const go = () => {
      if (!alive) return;
      Animated.timing(pos, {
        toValue: { x: 30 + Math.random() * Math.max(0, box.w - 110), y: 20 + Math.random() * Math.max(0, box.h - 110) },
        duration: 1300 + Math.random() * 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setTimeout(go, 250);
      });
    };
    go();
    return () => {
      alive = false;
      pos.stopAnimation();
    };
  }, [box, pos]);
  return (
    <View
      style={styles.map}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      pointerEvents="none"
    >
      <HoneycombMap density={[]} selected={null} onSelect={() => {}} hideControls />
      <View style={styles.mapTint} />
      <Animated.View style={[styles.seeker, { transform: pos.getTranslateTransform() }]}>
        <Avatar index={avatar} size={58} ring />
        <View style={styles.lens}>
          <Text style={styles.lensEmoji}>{lens}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B132B' },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  pressed: { opacity: 0.75 },
  title: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 22 },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center' },
  map: {
    alignSelf: 'stretch',
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#48CAE4',
  },
  mapTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(28, 110, 140, 0.25)' },
  seeker: { position: 'absolute', top: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  lens: {
    position: 'absolute',
    right: -14,
    bottom: -12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#48CAE4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0B132B',
  },
  lensEmoji: { fontSize: 20 },
  seats: { flexDirection: 'row', gap: 10 },
  seat: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  seatOn: { backgroundColor: '#48CAE4', borderColor: '#48CAE4' },
  info: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  time: { color: '#FFB703', fontFamily: fonts.black, fontSize: 20 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  privacyText: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  error: { color: '#FF8A98', fontSize: 13, textAlign: 'center' },
  botBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  botText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 13 },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#D9304F',
  },
  cancelText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 15 },
});
