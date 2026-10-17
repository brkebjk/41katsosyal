import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { GameIntro, type IntroRole } from '@/components/GameIntro';
import { GamePointsModal } from '@/components/GamePointsModal';
import { RemoteIcon, SideIcon } from '@/components/GameModeIcons';
import { SharkIntroBackdrop } from '@/components/SharkStage';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { SHARK_RANK_ITEM } from '@/lib/gameInfo';
import { DEFAULT_RULES, getMyGameGoals, getPointRules, type GameGoals, type PointRules } from '@/lib/ranking';
import { SK_ROLES, SK_TEAMS, type SkRole } from '@/lib/shark';

/** Rol tabelasının sırası: önce köpekbalıkları, sonra insanlar, en son tarafsızlar */
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

const ROLES: IntroRole[] = ROLE_ORDER.map((k) => {
  const r = SK_ROLES[k];
  return { key: k, name: r.name, color: r.color, team: SK_TEAMS[r.team], goal: r.goal, night: r.night, nightLabel: 'Dalışta' };
});

/** Köpekbalığı Kafesi giriş ekranı (Oyunlar'da oyuna dokununca). Düzen: GameIntro (Vampir–Köylü ile aynı). */
export default function SharkIntroScreen() {
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

  const mine = goals?.games.shark_cage;
  // Yan yana ve uzaktan oyun aynı puanı verir; yan yananın yalnızca aylık hedefi yüksektir
  const sideCap = goals?.side_cap ?? rules.sideMonthPoints;

  return (
    <>
      <GameIntro
        idPrefix="sk"
        backdrop={<SharkIntroBackdrop />}
        accent="#FFB703"
        emoji="🦈"
        title="Köpekbalığı Kafesi"
        subtitle="6–16 kişi · gizli roller · dalış, su üstü, karar oylaması"
        goals={[
          { key: 'side', label: 'Yan yana', icon: <SideIcon size={14} />, earned: mine?.side ?? 0, cap: sideCap, color: '#FFB703' },
          {
            key: 'remote',
            label: 'Uzaktan',
            icon: <RemoteIcon size={16} />,
            earned: mine?.remote ?? 0,
            cap: goals?.remote_cap ?? rules.remoteMonthPoints,
            color: '#48CAE4',
          },
        ]}
        roles={ROLES}
        play={[
          {
            key: 'side',
            title: 'YAN YANA',
            sub: 'Aynı masada · kodla giriş',
            emoji: '🏖️',
            colors: ['#FFD166', '#FFB703'],
            textColor: '#0B132B',
            badge: 'Büyük hedef',
            onPress: () => void actions.createForGame('shark_cage', 'side'),
            testID: 'sk-intro-side',
          },
          {
            key: 'remote',
            title: 'UZAKTAN EŞLEŞ',
            sub: 'Haritada oyuncu ara',
            emoji: '🌊',
            colors: ['#00B4D8', '#0077B6'],
            textColor: '#FFFFFF',
            onPress: () => router.push('/kopekbaligi-ara'),
            testID: 'sk-intro-match',
          },
        ]}
        onRooms={() => router.push({ pathname: '/acik-odalar', params: { game: 'shark_cage' } })}
        onPoints={() => setPointsOpen(true)}
        guide={() => router.push('/kopekbaligi-rehber')}
        hint={actions.hint}
      />
      {actions.modals}
      <GamePointsModal
        visible={pointsOpen}
        onClose={() => setPointsOpen(false)}
        players={8}
        extra={[SHARK_RANK_ITEM]}
        party
      />
    </>
  );
}
