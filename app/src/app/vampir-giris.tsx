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

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { RemoteIcon, SideIcon } from '@/components/GameModeIcons';
import { GoalBars } from '@/components/GoalBars';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { VAMPIRE_RANK_ITEM } from '@/lib/gameInfo';
import { vampireImages } from '@/lib/images';
import { DEFAULT_RULES, getMyGameGoals, getPointRules, type GameGoals, type PointRules } from '@/lib/ranking';
import { ROLES, type VvRole } from '@/lib/vampire';
import { fonts } from '@/theme';

/** Rol kartlarının sırası: önce vampir, sonra köyün özel rolleri, en son köylü (yeni roller buraya eklenir) */
const ROLE_ORDER: VvRole[] = ['vampire', 'doctor', 'detective', 'villager'];
const TEAMS = {
  vampire: { name: 'Vampirler', emoji: '🧛', color: '#9B7BFF' },
  village: { name: 'Köy', emoji: '🏡', color: '#FFB020' },
} as const;

const PAD = 12;

/**
 * Vampir–Köylü giriş ekranı (Oyunlar'da oyuna dokununca). Köpekbalığı Kafesi girişiyle aynı düzen: tema arka planı
 * (gece köyü), aylık puan hedefi çubukları, kaydırmalı rol kartları, puan mantığı, Yan yana / Uzaktan eşleş ve açık odalar.
 */
export default function VampireIntroScreen() {
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

  const mine = goals?.games.vampire_villager;
  const sideMult = goals?.side_mult ?? rules.sideMult;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Gece köyü: sahne görseli ve okunurluk için karartma */}
      <Image source={vampireImages.scene_night} contentFit="cover" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(8,4,20,0.35)', 'rgba(8,4,20,0.7)', 'rgba(8,4,20,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
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
            <Ionicons name="chevron-back" size={20} color="#140A2A" />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              🧛 Vampir–Köylü
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              5–16 kişi · gizli roller · gece, sabah, oylama
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Bu ayın puan hedefi */}
          <GoalBars
            bars={[
              {
                key: 'side',
                label: `Yan yana ×${sideMult}`,
                icon: <SideIcon size={14} />,
                earned: mine?.side ?? 0,
                cap: goals?.side_cap ?? rules.sideMonthPoints,
                color: '#FFB020',
              },
              {
                key: 'remote',
                label: 'Uzaktan',
                icon: <RemoteIcon size={16} />,
                earned: mine?.remote ?? 0,
                cap: goals?.remote_cap ?? rules.remoteMonthPoints,
                color: '#C9B6FF',
              },
            ]}
            note="Hedefini tamamla, sıralamada yüksel."
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
                const r = ROLES[k];
                const t = TEAMS[r.team];
                return (
                  <View key={k} style={[styles.cardWrap, { width: cardW }]}>
                    <View style={[styles.card, { borderColor: r.color }]}>
                      <View style={styles.cardHead}>
                        <Image source={vampireImages[r.image]} contentFit="cover" style={styles.cardImg} />
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
                        {r.night ? <Text style={styles.cardNight}>{`🌙 Gece: ${r.night}`}</Text> : null}
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
                    { backgroundColor: TEAMS[ROLES[k].team].color },
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
            testID="vv-intro-points"
          >
            <Text style={styles.pointsLine}>🏆 Kazanan takım 1. sıra; takım içinde en uzun hayatta kalan önde.</Text>
            <Text style={styles.pointsLine}>
              {`👥 Kişi arttıkça puan artar (1. sıra en çok ${rules.gameTopCap}); 2. ve 3. de kazanır. En az ${
                rules.partyMinPlayers
              } kişi.`}
            </Text>
            <Text style={styles.pointsLine}>
              {`🏡 Yan yana ${sideMult}x puan · 🏪 Mekânda +%${Math.max(0, rules.venueBonusPct - 100)} · 🧛 5 görev ödülü ×1,25`}
            </Text>
            <Text style={styles.pointsLink}>Puan tablosu ›</Text>
          </Pressable>

          {/* Oyna */}
          <View style={styles.playRow}>
            <Pressable
              onPress={() => void actions.createForGame('vampire_villager', 'side')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.play, styles.playSide, pressed && styles.pressed]}
              testID="vv-intro-side"
            >
              <View style={styles.bonus} pointerEvents="none">
                <Text style={styles.bonusText}>{`${sideMult}x Puan`}</Text>
              </View>
              <Text style={styles.playEmoji}>🏡</Text>
              <Text style={styles.playTitle}>YAN YANA</Text>
              <Text style={styles.playSub}>Aynı masada · kodla giriş</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/kopekbaligi-ara', params: { oyun: 'vampire_villager' } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.play, styles.playRemote, pressed && styles.pressed]}
              testID="vv-intro-match"
            >
              <Text style={styles.playEmoji}>🌙</Text>
              <Text style={[styles.playTitle, styles.playTitleLight]}>UZAKTAN EŞLEŞ</Text>
              <Text style={[styles.playSub, styles.playSubLight]}>Haritada oyuncu ara</Text>
            </Pressable>
          </View>
          <View style={styles.playRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/acik-odalar', params: { game: 'vampire_villager' } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.rooms, styles.flex, pressed && styles.pressed]}
              testID="vv-intro-rooms"
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
        extra={[VAMPIRE_RANK_ITEM]}
        party
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0616' },
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
  title: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 20 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.semi, fontSize: 11.5 },
  cardImg: { width: 56, height: 84, borderRadius: 10 },
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
    backgroundColor: 'rgba(20, 10, 42, 0.88)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName: { fontFamily: fonts.black, fontSize: 19 },
  teamPill: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  teamText: { fontFamily: fonts.extra, fontSize: 11.5 },
  cardGoal: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  cardNight: { marginTop: 6, color: '#C9B6FF', fontFamily: fonts.semi, fontSize: 13, lineHeight: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotOn: { width: 16, opacity: 1 },
  dotOff: { width: 6, opacity: 0.4 },
  swipe: { textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontFamily: fonts.semi, fontSize: 11, marginTop: 2 },
  points: {
    gap: 3,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 10, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 3, 0.5)',
  },
  pointsLine: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17 },
  pointsLink: { color: '#FFB703', fontFamily: fonts.extra, fontSize: 12.5, textAlign: 'right' },
  playRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  play: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 18, borderWidth: 2 },
  playSide: { backgroundColor: '#FFB020', borderColor: '#FFE1A6' },
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
  playRemote: { backgroundColor: '#5B3FC4', borderColor: '#9B7BFF' },
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
    backgroundColor: 'rgba(20, 10, 42, 0.6)',
  },
  roomsText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13.5 },
  hint: { color: '#FFB703', fontSize: 12.5, textAlign: 'center' },
});
