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
import { GoalBars } from '@/components/GoalBars';
import { SharkIntroBackdrop } from '@/components/SharkStage';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { SHARK_RANK_ITEM } from '@/lib/gameInfo';
import { DEFAULT_RULES, getMyGameGoals, getPointRules, type GameGoals, type PointRules } from '@/lib/ranking';
import { SK_ROLES, SK_TEAMS, type SkRole } from '@/lib/shark';
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
 * Köpekbalığı Kafesi giriş ekranı (Oyunlar'da oyuna dokununca). Tek ekran: tema arka planı (plaj → dalış), aylık
 * puan hedefi çubukları, kaydırmalı rol kartları, puan mantığı, Yan yana / Uzaktan oda açma ve açık odalar.
 */
export default function SharkIntroScreen() {
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [goals, setGoals] = useState<GameGoals | null>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [page, setPage] = useState(0);
  const [pointsOpen, setPointsOpen] = useState(false);

  const refresh = useCallback(() => {
    void getMyGameGoals().then((g) => {
      if (g) setGoals(g);
    });
    void getPointRules().then(setRules);
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

  const mine = goals?.games.shark_cage;
  const sideMult = goals?.side_mult ?? rules.sideMult;

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
          {/* Bu ayın puan hedefi */}
          <GoalBars
            bars={[
              {
                key: 'side',
                label: `🏖️ Yan yana ×${sideMult}`,
                earned: mine?.side ?? 0,
                cap: goals?.side_cap ?? rules.sideMonthPoints,
                color: '#FFB703',
              },
              {
                key: 'remote',
                label: '🌊 Uzaktan',
                earned: mine?.remote ?? 0,
                cap: goals?.remote_cap ?? rules.remoteMonthPoints,
                color: '#48CAE4',
              },
            ]}
            note="Oyun sınırsız · hedefini tamamla, sıralamada yüksel."
          />

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
              {`👥 Kişi arttıkça puan artar (1. sıra en çok ${rules.gameTopCap}); 2. ve 3. de kazanır. En az ${
                rules.partyMinPlayers
              } kişi.`}
            </Text>
            <Text style={styles.pointsLine}>
              {`🏖️ Yan yana ${sideMult}x puan · 🏪 Mekânda +%${Math.max(0, rules.venueBonusPct - 100)} · 🎲 Oyun Gecesi ×1,5`}
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
              <View style={styles.bonus} pointerEvents="none">
                <Text style={styles.bonusText}>{`${sideMult}x Puan`}</Text>
              </View>
              <Text style={styles.playEmoji}>🏖️</Text>
              <Text style={styles.playTitle}>YAN YANA</Text>
              <Text style={styles.playSub}>Aynı masada · kodla giriş</Text>
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
        party
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
  playRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  play: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 18, borderWidth: 2 },
  playSide: { backgroundColor: '#FFB703', borderColor: '#F2D2A2' },
  bonus: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#D9304F',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bonusText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11.5, letterSpacing: 0.5 },
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
