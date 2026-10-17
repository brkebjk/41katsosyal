import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { GoalBars, type GoalBar } from '@/components/GoalBars';
import { RoleIcon } from '@/components/RoleIcon';
import { fonts } from '@/theme';

export type IntroRole = {
  key: string;
  name: string;
  color: string;
  /** Sınıfı (takımı) */
  team: { name: string; emoji: string; color: string };
  /** Kısa özellik cümlesi (rolün görevi) */
  goal: string;
  /** Gece / dalış eylemi (varsa); satıra dokununca görünür */
  night: string | null;
  nightLabel: string;
};

export type IntroPlay = {
  key: string;
  title: string;
  sub: string;
  emoji: string;
  colors: [string, string];
  textColor: string;
  badge?: string;
  onPress: () => void;
  testID: string;
};

/**
 * Köpekbalığı Kafesi ve Vampir–Köylü giriş ekranı (iki oyun aynı düzende). Tema arka planı, büyük oyun başlığı, aylık
 * hedef çubukları, ortada dikey kaydırmalı rol tabelası (takımlara göre; satıra dokununca ayrıntı açılır), altta oyna
 * düğmeleri. Arka plandaki süsler ekranın dışına taşmaz (geri kaydırırken önceki ekranın üstüne binmez).
 */
export function GameIntro({
  backdrop,
  accent,
  title,
  emoji,
  subtitle,
  goals,
  roles,
  play,
  onRooms,
  onPoints,
  guide,
  hint,
  idPrefix,
}: {
  backdrop: ReactNode;
  /** Tema rengi (çerçeveler, başlık parıltısı) */
  accent: string;
  title: string;
  emoji: string;
  subtitle: string;
  goals: GoalBar[];
  roles: IntroRole[];
  play: IntroPlay[];
  onRooms: () => void;
  onPoints: () => void;
  /** Oyun rehberi (varsa) */
  guide?: () => void;
  /** Oda açma sonrası kısa bilgi */
  hint?: string | null;
  idPrefix: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  // Takımlara göre gruplar (sıra korunur)
  const groups: { team: IntroRole['team']; list: IntroRole[] }[] = [];
  for (const r of roles) {
    const g = groups.find((x) => x.team.name === r.team.name);
    if (g) g.list.push(r);
    else groups.push({ team: r.team, list: [r] });
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.backdrop} pointerEvents="none">
        {backdrop}
      </View>
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
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={styles.flex} />
          <Pressable
            onPress={onPoints}
            accessibilityRole="button"
            accessibilityLabel="Puan tablosu"
            style={({ pressed }) => [styles.topPill, pressed && styles.pressed]}
            testID={`${idPrefix}-intro-points`}
          >
            <Text style={styles.topPillText}>🏆 Puanlar</Text>
          </Pressable>
          {guide ? (
            <Pressable
              onPress={guide}
              accessibilityRole="button"
              accessibilityLabel="Oyun rehberi"
              style={({ pressed }) => [styles.topPill, { backgroundColor: accent }, pressed && styles.pressed]}
              testID={`${idPrefix}-intro-guide`}
            >
              <Ionicons name="book" size={14} color="#0B132B" />
              <Text style={[styles.topPillText, styles.dark]}>Rehber</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Oyun başlığı */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{emoji}</Text>
          <Text style={[styles.heroTitle, { textShadowColor: accent }]} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <View style={[styles.heroChip, { borderColor: accent }]}>
            <Text style={styles.heroChipText} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <GoalBars bars={goals} note="Hedefini tamamla, sıralamada yüksel." />

          {/* Rol tabelası */}
          <View style={[styles.board, { borderColor: accent }]}>
            <View style={styles.boardHead}>
              <Text style={styles.boardTitle}>ROLLER</Text>
              <Text style={styles.boardCount}>{`${roles.length} rol · dokun, ayrıntıyı gör`}</Text>
            </View>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.boardList}
              showsVerticalScrollIndicator={false}
              testID={`${idPrefix}-intro-roles`}
            >
              {groups.map((g) => (
                <View key={g.team.name} style={styles.group}>
                  <View style={styles.groupHead}>
                    <View style={[styles.groupLine, { backgroundColor: g.team.color }]} />
                    <Text style={[styles.groupTitle, { color: g.team.color }]}>{`${g.team.emoji} ${g.team.name}`}</Text>
                    <View style={[styles.groupLine, { backgroundColor: g.team.color }]} />
                  </View>
                  {g.list.map((r) => {
                    const isOpen = open === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setOpen(isOpen ? null : r.key)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        style={({ pressed }) => [styles.row, { borderLeftColor: r.color }, pressed && styles.pressed]}
                        testID={`${idPrefix}-role-${r.key}`}
                      >
                        <RoleIcon role={r.key} size={48} />
                        <View style={styles.flex}>
                          <Text style={[styles.roleName, { color: r.color }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={[styles.roleClass, { color: r.team.color }]} numberOfLines={1}>
                            {`${r.team.emoji} ${r.team.name}`}
                          </Text>
                          <Text style={styles.roleGoal} numberOfLines={isOpen ? undefined : 2}>
                            {r.goal}
                          </Text>
                          {isOpen && r.night ? (
                            <Text style={styles.roleNight}>{`🌙 ${r.nightLabel}: ${r.night}`}</Text>
                          ) : null}
                        </View>
                        <Ionicons
                          name={isOpen ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="rgba(255,255,255,0.55)"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Oyna */}
          <View style={styles.playRow}>
            {play.map((p) => (
              <Pressable
                key={p.key}
                onPress={p.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [styles.playWrap, pressed && styles.playPressed]}
                testID={p.testID}
              >
                <LinearGradient colors={p.colors} style={styles.play}>
                  <Text style={styles.playEmoji}>{p.emoji}</Text>
                  <Text style={[styles.playTitle, { color: p.textColor }]} numberOfLines={1} adjustsFontSizeToFit>
                    {p.title}
                  </Text>
                  <Text style={[styles.playSub, { color: p.textColor }]} numberOfLines={1}>
                    {p.sub}
                  </Text>
                </LinearGradient>
                {p.badge ? (
                  <View style={styles.badge} pointerEvents="none">
                    <Text style={styles.badgeText}>{p.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onRooms}
            accessibilityRole="button"
            style={({ pressed }) => [styles.rooms, pressed && styles.pressed]}
            testID={`${idPrefix}-intro-rooms`}
          >
            <Ionicons name="enter-outline" size={16} color="#FFFFFF" />
            <Text style={styles.roomsText}>Açık odalar · oda ID ile katıl</Text>
          </Pressable>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow: arka plandaki hareketli süsler (dalga, köpekbalığı gölgesi) ekranın dışına taşmasın
  root: { flex: 1, backgroundColor: '#0B132B', overflow: 'hidden' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  dark: { color: '#0B132B' },
  pressed: { opacity: 0.75 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 4 },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,24,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(5,10,24,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  topPillText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 12.5 },
  hero: { alignItems: 'center', paddingHorizontal: 16, marginTop: -6 },
  heroEmoji: { fontSize: 40, lineHeight: 48 },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 30,
    letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroChip: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(5,10,24,0.6)',
  },
  heroChipText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 12 },
  body: { flex: 1, gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  board: {
    flex: 1,
    minHeight: 160,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'rgba(5,10,24,0.82)',
    overflow: 'hidden',
  },
  boardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  boardTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 15, letterSpacing: 2 },
  boardCount: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.semi, fontSize: 11 },
  boardList: { padding: 10, gap: 12 },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  groupLine: { flex: 1, height: 1, opacity: 0.5 },
  groupTitle: { fontFamily: fonts.extra, fontSize: 12, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  roleName: { fontFamily: fonts.black, fontSize: 15.5 },
  roleClass: { fontFamily: fonts.extra, fontSize: 11 },
  roleGoal: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 16, marginTop: 2 },
  roleNight: { color: '#48CAE4', fontFamily: fonts.semi, fontSize: 12, lineHeight: 16, marginTop: 4 },
  playRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  playWrap: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  playPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  play: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18 },
  playEmoji: { fontSize: 26 },
  playTitle: { fontFamily: fonts.black, fontSize: 16, letterSpacing: 1 },
  playSub: { fontFamily: fonts.semi, fontSize: 11, opacity: 0.9 },
  badge: {
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
  badgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11.5, letterSpacing: 0.5 },
  rooms: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(5,10,24,0.6)',
  },
  roomsText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13.5 },
  hint: { color: '#FFB703', fontSize: 12.5, textAlign: 'center' },
});
