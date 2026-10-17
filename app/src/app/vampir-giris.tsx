import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { GameIntro, type IntroRole } from '@/components/GameIntro';
import { GamePointsModal } from '@/components/GamePointsModal';
import { RemoteIcon, SideIcon } from '@/components/GameModeIcons';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { VAMPIRE_RANK_ITEM } from '@/lib/gameInfo';
import { vampireImages } from '@/lib/images';
import { DEFAULT_RULES, getMyGameGoals, getPointRules, type GameGoals, type PointRules } from '@/lib/ranking';
import { ROLES as VV_ROLES, type VvRole } from '@/lib/vampire';

/** Rol tabelasının sırası: önce vampir, sonra köyün özel rolleri, en son köylü (yeni roller buraya eklenir) */
const ROLE_ORDER: VvRole[] = ['vampire', 'doctor', 'detective', 'villager'];
const TEAMS = {
  vampire: { name: 'Vampirler', emoji: '🧛', color: '#9B7BFF' },
  village: { name: 'Köy', emoji: '🏡', color: '#FFB020' },
} as const;

const ROLES: IntroRole[] = ROLE_ORDER.map((k) => {
  const r = VV_ROLES[k];
  return { key: k, name: r.name, color: r.color, team: TEAMS[r.team], goal: r.goal, night: r.night, nightLabel: 'Gece' };
});

/** Vampir–Köylü giriş ekranı (Oyunlar'da oyuna dokununca). Düzen: GameIntro (Köpekbalığı Kafesi ile aynı). */
export default function VampireIntroScreen() {
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [goals, setGoals] = useState<GameGoals | null>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
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

  const mine = goals?.games.vampire_villager;
  // Yan yana ve uzaktan oyun aynı puanı verir; yan yananın yalnızca aylık hedefi yüksektir
  const sideCap = goals?.side_cap ?? rules.sideMonthPoints;

  return (
    <>
      <GameIntro
        idPrefix="vv"
        backdrop={
          <>
            {/* Gece köyü: sahne görseli ve okunurluk için karartma */}
            <Image source={vampireImages.scene_night} contentFit="cover" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(8,4,20,0.35)', 'rgba(8,4,20,0.7)', 'rgba(8,4,20,0.92)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        }
        accent="#9B7BFF"
        emoji="🧛"
        title="Vampir–Köylü"
        subtitle="5–16 kişi · gizli roller · gece, sabah, oylama"
        goals={[
          { key: 'side', label: 'Yan yana', icon: <SideIcon size={14} />, earned: mine?.side ?? 0, cap: sideCap, color: '#FFB020' },
          {
            key: 'remote',
            label: 'Uzaktan',
            icon: <RemoteIcon size={16} />,
            earned: mine?.remote ?? 0,
            cap: goals?.remote_cap ?? rules.remoteMonthPoints,
            color: '#C9B6FF',
          },
        ]}
        roles={ROLES}
        play={[
          {
            key: 'side',
            title: 'YAN YANA',
            sub: 'Aynı masada · kodla giriş',
            emoji: '🏡',
            colors: ['#FFD27A', '#FFB020'],
            textColor: '#140A2A',
            badge: 'Büyük hedef',
            onPress: () => void actions.createForGame('vampire_villager', 'side'),
            testID: 'vv-intro-side',
          },
          {
            key: 'remote',
            title: 'UZAKTAN EŞLEŞ',
            sub: 'Haritada oyuncu ara',
            emoji: '🌙',
            colors: ['#7B5CFF', '#3D2A8C'],
            textColor: '#FFFFFF',
            onPress: () => router.push({ pathname: '/kopekbaligi-ara', params: { oyun: 'vampire_villager' } }),
            testID: 'vv-intro-match',
          },
        ]}
        onRooms={() => router.push({ pathname: '/acik-odalar', params: { game: 'vampire_villager' } })}
        onPoints={() => setPointsOpen(true)}
        hint={actions.hint}
      />
      {actions.modals}
      <GamePointsModal
        visible={pointsOpen}
        onClose={() => setPointsOpen(false)}
        players={8}
        extra={[VAMPIRE_RANK_ITEM]}
        party
      />
    </>
  );
}
