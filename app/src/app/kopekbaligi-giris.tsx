import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoleIcon } from '@/components/RoleIcon';
import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { SharkIntroBackdrop } from '@/components/SharkStage';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { getQuota, type Quota } from '@/lib/events';
import { SHARK_RANK_ITEM } from '@/lib/gameInfo';
import { getRemoteCaps, SK_ROLES, SK_TEAMS, type RemoteCaps, type SkRole } from '@/lib/shark';
import { fonts } from '@/theme';

/** Rol kartlarının sırası: önce köpekbalıkları, sonra insanlar, en son tarafsızlar */
const ROLE_ORDER: SkRole[] = [
  'alpha',
  'tiger',
  'hammer',
  'nurse',
  'shark',
  'lifeguard',
  'oceanographer',
  'spearman',
  'marshal',
  'medium',
  'tourist',
  'squid',
  'surfer',
  'scavenger',
];

const PAD = 12;

/**
 * Köpekbalığı Kafesi giriş ekranı (Oyunlar'da oyuna dokununca). Tek ekran: tema arka planı (plaj → dalış), puan
 * sayaçları, kaydırmalı rol kartları, puan mantığı, Yan yana / Uzaktan oda açma ve açık odalar.
 */
export default function SharkIntroScreen() {
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [quota, setQuota] = useState<Quota | null>(null);
  const [caps, setCaps] = useState<RemoteCaps | null>(null);
  const [page, setPage] = useState(0);
  const [pointsOpen, setPointsOpen] = useState(false);

  const refresh = useCallback(() => {
    void getQuota().then((r) => {
      if (r.data) setQuota(r.data);
    });
    void getRemoteCaps().then(setCaps);
  }, []);

  const actions = useRoomActions({ isModerator, onChanged: refresh });
  const { beginFocus } = actions;

  // Ekran açılınca (oyundan dönmüş olabiliriz) yan yana oyunlardan çıkılır, sayaçlar tazelenir
  useFocusEffect(
    useCallback(() => {
      beginFocus(refresh);
    }, [beginFocus, refresh]),
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  const cardW = width - PAD * 2;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / cardW);
    if (p !== page) setPage(Math.max(0, Math.min(ROLE_ORDER.length - 1, p)));
  };

  const unlimited = quota !== null && (quota.is_moderator || quota.games_limit === null);
  const roomsLeft = quota && !unlimited ? Math.max(0, (quota.games_limit ?? 0) - quota.games_used) : null;
  const todayLeft = caps ? Math.max(0, caps.daily_cap - caps.today) : null;
  const monthLeft = caps ? Math.max(0, caps.month_cap - caps.month) : null;
  const remoteLeft = todayLeft === null || monthLeft === null ? null : Math.min(todayLeft, monthLeft);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SharkIntroBackdrop />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Üst şerit */}
        <View style={styles.top}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Oyunlar"
            style={({ pressed }) => [styles.topBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color="#0B132B" />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              🦈 Köpekbalığı Kafesi
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              6–16 kişi · gizli roller · dalış, plaj, kafes
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/kopekbaligi-rehber')}
            accessibilityRole="button"
            accessibilityLabel="Oyun rehberi"
            style={({ pressed }) => [styles.guideBtn, pressed && styles.pressed]}
            testID="sk-intro-guide"
          >
            <Ionicons name="book" size={15} color="#0B132B" />
            <Text style={styles.guideText}>Rehber</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* Sayaçlar */}
          <View style={styles.counters}>
            <View style={[styles.counter, styles.counterSide]} accessibilityLabel="Yan yana oyun puanı">
              <Text style={[styles.counterHead, styles.sandHead]}>🏖️ Yan yana</Text>
              <Text style={[styles.counterBig, styles.sandText]}>∞</Text>
              <Text style={[styles.counterSub, styles.sandSub]}>puan sınırı yok</Text>
              <Text style={[styles.counterNote, styles.sandNote]}>
                {unlimited ? 'Oda hakkın sınırsız' : roomsLeft === null ? 'Oda hakkın…' : `Bu ay ${roomsLeft} oda hakkın var`}
              </Text>
            </View>
            <View style={[styles.counter, styles.counterRemote]} accessibilityLabel="Uzaktan oyun puanı">
              <Text style={styles.counterHead}>🌊 Uzaktan</Text>
              <View style={styles.counterRow}>
                <View style={styles.counterCell}>
                  <Text style={styles.counterBig}>{todayLeft === null ? '…' : `${todayLeft}/${caps?.daily_cap}`}</Text>
                  <Text style={styles.counterSub}>bugün kalan</Text>
                </View>
                <View style={styles.counterCell}>
                  <Text style={styles.counterBig}>{monthLeft === null ? '…' : `${monthLeft}/${caps?.month_cap}`}</Text>
                  <Text style={styles.counterSub}>bu ay kalan</Text>
                </View>
              </View>
              <Text style={styles.counterNote}>
                {remoteLeft === 0 ? 'Puanlı uzaktan oyun hakkın doldu' : 'puanlı oyun · hak yemez'}
              </Text>
            </View>
          </View>

          {/* Rol kartları */}
          <View style={styles.cards}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              contentContainerStyle={styles.cardsRow}
            >
              {ROLE_ORDER.map((k) => {
                const r = SK_ROLES[k];
                const t = SK_TEAMS[r.team];
                return (
                  <View key={k} style={[styles.cardWrap, { width: cardW }]}>
                    <View style={[styles.card, { borderColor: r.color }]}>
                      <View style={styles.cardHead}>
                        <RoleIcon role={k} size={64} />
                        <View style={styles.flex}>
                          <Text style={[styles.cardName, { color: r.color }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <View style={[styles.teamPill, { borderColor: t.color }]}>
                            <Text style={[styles.teamText, { color: t.color }]}>{`${t.emoji} ${t.name}`}</Text>
                          </View>
                        </View>
                      </View>
                      <ScrollView style={styles.flex} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        <Text style={styles.cardGoal}>{r.goal}</Text>
                        {r.night ? <Text style={styles.cardNight}>{`🌙 Dalışta: ${r.night}`}</Text> : null}
                      </ScrollView>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.dots} accessibilityLabel={`Rol kartı ${page + 1} / ${ROLE_ORDER.length}`}>
              {ROLE_ORDER.map((k, i) => (
                <View
                  key={k}
                  style={[
                    styles.dot,
                    { backgroundColor: SK_TEAMS[SK_ROLES[k].team].color },
                    i === page ? styles.dotOn : styles.dotOff,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.swipe}>{`← kaydır · ${page + 1} / ${ROLE_ORDER.length} rol →`}</Text>
          </View>

          {/* Puan mantığı */}
          <Pressable
            onPress={() => setPointsOpen(true)}
            accessibilityRole="button"
            accessibilityHint="Puan tablosunu açar"
            style={({ pressed }) => [styles.points, pressed && styles.pressed]}
            testID="sk-intro-points"
          >
            <Text style={styles.pointsLine}>🏆 Kazanan takım 1. sıra; kalanlar ne kadar dayandıysa o kadar önde.</Text>
            <Text style={styles.pointsLine}>
              {`👥 Kişi arttıkça puan artar (1. sıra en çok ${caps?.top_cap ?? 12}); 2. ve 3. de kazanır. En az ${
                caps?.min_players ?? 4
              } kişi.`}
            </Text>
            <Text style={styles.pointsLine}>
              {`🌊 Uzaktan %${caps?.pct ?? 50} · 🎉 Etkinlik ×1,25 · 🎭 Anlatıcılı oyun puansız`}
            </Text>
            <Text style={styles.pointsLink}>Puan tablosu ›</Text>
          </Pressable>

          {/* Oyna */}
          <View style={styles.playRow}>
            <Pressable
              onPress={() => void actions.createForGame('shark_cage', 'side')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.play, styles.playSide, pressed && styles.pressed]}
              testID="sk-intro-side"
            >
              <Text style={styles.playEmoji}>🏖️</Text>
              <Text style={styles.playTitle}>YAN YANA</Text>
              <Text style={styles.playSub}>Aynı masada · tam puan</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/kopekbaligi-ara')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.play, styles.playRemote, pressed && styles.pressed]}
              testID="sk-intro-match"
            >
              <Text style={styles.playEmoji}>🌊</Text>
              <Text style={[styles.playTitle, styles.playTitleLight]}>UZAKTAN EŞLEŞ</Text>
              <Text style={[styles.playSub, styles.playSubLight]}>Haritada oyuncu ara</Text>
            </Pressable>
          </View>
          <View style={styles.playRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/acik-odalar', params: { game: 'shark_cage' } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.rooms, styles.flex, pressed && styles.pressed]}
              testID="sk-intro-rooms"
            >
              <Ionicons name="enter-outline" size={16} color="#FFFFFF" />
              <Text style={styles.roomsText}>Açık odalar · oda ID ile katıl</Text>
            </Pressable>
          </View>
          {actions.hint ? <Text style={styles.hint}>{actions.hint}</Text> : null}
        </View>
      </SafeAreaView>
      {actions.modals}
      <GamePointsModal
        visible={pointsOpen}
        onClose={() => setPointsOpen(false)}
        players={8}
        extra={[SHARK_RANK_ITEM]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B132B' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 6 },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  title: { color: '#0B132B', fontFamily: fonts.black, fontSize: 20 },
  subtitle: { color: '#1C2541', fontFamily: fonts.semi, fontSize: 11.5 },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFB703',
  },
  guideText: { color: '#0B132B', fontFamily: fonts.extra, fontSize: 12.5 },
  body: { flex: 1, gap: 10, paddingHorizontal: PAD, paddingBottom: 8 },
  counters: { flexDirection: 'row', gap: 8 },
  counter: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1 },
  counterSide: { backgroundColor: 'rgba(242, 210, 162, 0.92)', borderColor: '#E0A96D' },
  counterRemote: { flex: 1.4, backgroundColor: 'rgba(11, 19, 43, 0.82)', borderColor: 'rgba(72, 202, 228, 0.6)' },
  counterHead: { fontFamily: fonts.extra, fontSize: 12.5, color: '#48CAE4' },
  counterRow: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  counterCell: { flex: 1, alignItems: 'center' },
  counterBig: { fontFamily: fonts.black, fontSize: 22, color: '#FFFFFF' },
  counterSub: { fontFamily: fonts.semi, fontSize: 10.5, color: 'rgba(255,255,255,0.75)' },
  counterNote: { marginTop: 2, fontFamily: fonts.semi, fontSize: 10.5, color: '#FFB703', textAlign: 'center' },
  sandHead: { color: '#7A4A1E' },
  sandText: { color: '#3B220B' },
  sandSub: { color: '#5C3A16' },
  sandNote: { color: '#0B132B' },
  cards: { flex: 1, minHeight: 150 },
  cardsRow: { alignItems: 'stretch' },
  cardWrap: { paddingHorizontal: 2 },
  card: {
    flex: 1,
    gap: 8,
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'rgba(11, 19, 43, 0.85)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 46 },
  cardName: { fontFamily: fonts.black, fontSize: 19 },
  teamPill: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  teamText: { fontFamily: fonts.extra, fontSize: 11.5 },
  cardGoal: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  cardNight: { marginTop: 6, color: '#48CAE4', fontFamily: fonts.semi, fontSize: 13, lineHeight: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotOn: { width: 16, opacity: 1 },
  dotOff: { width: 6, opacity: 0.4 },
  swipe: { textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontFamily: fonts.semi, fontSize: 11, marginTop: 2 },
  points: {
    gap: 3,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(11, 19, 43, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 3, 0.5)',
  },
  pointsLine: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17 },
  pointsLink: { color: '#FFB703', fontFamily: fonts.extra, fontSize: 12.5, textAlign: 'right' },
  playRow: { flexDirection: 'row', gap: 10 },
  play: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 18, borderWidth: 2 },
  playSide: { backgroundColor: '#FFB703', borderColor: '#F2D2A2' },
  playRemote: { backgroundColor: '#0077B6', borderColor: '#48CAE4' },
  playEmoji: { fontSize: 26 },
  playTitle: { color: '#0B132B', fontFamily: fonts.black, fontSize: 16, letterSpacing: 1 },
  playTitleLight: { color: '#FFFFFF' },
  playSub: { color: '#1C2541', fontFamily: fonts.semi, fontSize: 11 },
  playSubLight: { color: 'rgba(255,255,255,0.85)' },
  rooms: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(11, 19, 43, 0.6)',
  },
  roomsText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13.5 },
  hint: { color: '#FFB703', fontSize: 12.5, textAlign: 'center' },
});
