import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { GameIntro, type IntroRole } from '@/components/GameIntro';
import { GamePointsModal } from '@/components/GamePointsModal';
import { RemoteIcon, SideIcon } from '@/components/GameModeIcons';
import { OkeyIntroBackdrop } from '@/components/OkeyParts';
import { Popup } from '@/components/Popup';
import { useRoomActions } from '@/components/useRoomActions';
import { useAuth } from '@/lib/auth';
import { OKEY_RANK_ITEM, OKEY_RULES } from '@/lib/gameInfo';
import { DEFAULT_RULES, getMyGameGoals, getPointRules, type GameGoals, type PointRules } from '@/lib/ranking';
import { fonts } from '@/theme';

const T_GAME = { name: 'Oyun', emoji: '', color: '#22D3C5' };
const T_OPEN = { name: 'Açış barajı', emoji: '', color: '#FFC93C' };
const T_PEN = { name: 'Ceza', emoji: '', color: '#FF8FA3' };
const T_HELP = { name: 'Yardım', emoji: '', color: '#A98BFF' };
const T_LEN = { name: 'Oyun uzunluğu', emoji: '', color: '#9CC9C2' };

const row = (
  key: string,
  name: string,
  team: IntroRole['team'],
  icon: IntroRole['icon'],
  goal: string,
  night: string | null = null,
): IntroRole => ({ key, name, color: team.color, team, goal, night, nightLabel: 'Ayrıntı', icon });

/** Masa ayarları tabelası (giriş ekranında rol tabelasının yerinde) */
function modes(game: 'okey' | 'okey101'): IntroRole[] {
  const list: IntroRole[] = [
    row('tekli', 'Tekli', T_GAME, 'person', 'Herkes kendi için oynar.'),
    row('esli', 'Eşli', T_GAME, 'people', 'Karşılıklı oturanlar eştir (1–3 ve 2–4).', game === 'okey'
      ? 'Puan takımındır: biri bitince rakip takım puan kaybeder.'
      : 'Biri bitince eşi ceza yazmaz; takımın cezası iki kişinin toplamıdır. Katlamalıda eşin açışı barajı yükseltmez.'),
  ];
  if (game === 'okey101') {
    list.push(
      row('katlamasiz', 'Katlamasız', T_OPEN, 'remove', 'Herkes 101 (ya da 5 çift) ile açar.'),
      row('katlamali', 'Katlamalı', T_OPEN, 'trending-up', 'Sonra açan, rakiplerin en yüksek açışını en az 1 geçmeli.', 'Seri ve çift ayrı sayılır: 112 ile açıldıysa sonraki en az 113, 6 çiftle açıldıysa en az 7 çift.'),
      row('cezali', 'Cezalı', T_PEN, 'warning', 'İşlek taş atmak, okey atmak ve yandan alınan taşı geri koymak 101 ceza.'),
      row('cezasiz', 'Cezasız', T_PEN, 'happy', 'Bu hamlelere ceza yazılmaz.'),
    );
  }
  list.push(
    row('yardimli', 'Yardımlı', T_HELP, 'bulb', 'Okey işaretli, perler ve işlek taşlar renkli, ıstaka tek dokunuşla dizilir.', game === 'okey101' ? 'Açış toplamı (ör. 87/101) düğmede yazar; işlenebilecek perler “Ortayı gör”de işaretlenir.' : null),
    row('yardimsiz', 'Yardımsız', T_HELP, 'eye-off', 'İpucu yok: okeyi ve perleri sen bulursun.'),
    game === 'okey'
      ? row('puan', '10 ya da 20 puan', T_LEN, 'flag', 'Herkes bu puanla başlar; biri 0’a inince oyun biter.')
      : row('el', '1, 3, 5 ya da 7 el', T_LEN, 'flag', 'Seçilen el sayısı oynanır; toplam cezası en düşük kazanır.'),
  );
  return list;
}

/** Okey ve 101 Okey giriş ekranı (`?oyun=okey101`). Düzen: GameIntro (diğer oyunlarla aynı). */
export default function OkeyIntroScreen() {
  const params = useLocalSearchParams<{ oyun?: string }>();
  const game = params.oyun === 'okey101' ? 'okey101' : 'okey';
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [goals, setGoals] = useState<GameGoals | null>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const refresh = useCallback(() => {
    void getMyGameGoals().then((g) => {
      if (g) setGoals(g);
    });
    void getPointRules().then(setRules);
  }, []);

  const actions = useRoomActions({ isModerator, onChanged: refresh });
  const { beginFocus } = actions;

  useFocusEffect(
    useCallback(() => {
      beginFocus(refresh);
    }, [beginFocus, refresh]),
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  const mine = goals?.games[game];
  const title = game === 'okey' ? 'Okey' : '101 Okey';

  return (
    <>
      <GameIntro
        idPrefix={game}
        backdrop={<OkeyIntroBackdrop wood={game === 'okey101'} />}
        accent={game === 'okey' ? '#22D3C5' : '#FFC93C'}
        emoji=""
        title={title}
        subtitle={game === 'okey' ? '4 kişi · tekli ya da eşli · 14 taşı diz, bitir' : '4 kişi · 101 ile aç, işle, bitir · az ceza kazanır'}
        goals={[
          { key: 'side', label: 'Yan yana', icon: <SideIcon size={14} />, earned: mine?.side ?? 0, cap: goals?.side_cap ?? rules.sideMonthPoints, color: '#FFC93C' },
          {
            key: 'remote',
            label: 'Uzaktan',
            icon: <RemoteIcon size={16} />,
            earned: mine?.remote ?? 0,
            cap: goals?.remote_cap ?? rules.remoteMonthPoints,
            color: '#48CAE4',
          },
        ]}
        roles={modes(game)}
        boardTitle="AYARLAR"
        boardCount="Oda sahibi bekleme odasında seçer"
        noEmoji
        play={[
          {
            key: 'side',
            title: 'YAN YANA',
            sub: 'Aynı masada · kodla giriş',
            emoji: '',
            icon: 'people',
            colors: ['#FFD166', '#FFB703'],
            textColor: '#0B132B',
            badge: 'Büyük hedef',
            onPress: () => void actions.createForGame(game, 'side'),
            testID: `${game}-intro-side`,
          },
          {
            key: 'remote',
            title: 'UZAKTAN EŞLEŞ',
            sub: '4 kişi olunca masa kurulur',
            emoji: '',
            icon: 'globe',
            colors: ['#22D3C5', '#0E8C9A'],
            textColor: '#04211F',
            onPress: () => router.push({ pathname: '/okey-ara', params: { oyun: game } }),
            testID: `${game}-intro-match`,
          },
        ]}
        onRooms={() => router.push({ pathname: '/acik-odalar', params: { game } })}
        onPoints={() => setPointsOpen(true)}
        guide={() => setRulesOpen(true)}
        hint={actions.hint}
      />
      {actions.modals}
      <GamePointsModal visible={pointsOpen} onClose={() => setPointsOpen(false)} players={4} extra={[OKEY_RANK_ITEM]} />
      {rulesOpen ? (
        <Popup title={`${title} kuralları`} subtitle="Sunucu bu kuralları uygular." icon="book-outline" onClose={() => setRulesOpen(false)} testID={`${game}-rules`}>
          {OKEY_RULES[game].map((r) => (
            <View key={r.lead} style={styles.rule}>
              <Ionicons name={r.icon} size={18} color="#0E9F93" />
              <Text style={styles.ruleText}>
                <Text style={styles.ruleLead}>{r.lead} </Text>
                {r.text}
              </Text>
            </View>
          ))}
        </Popup>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  rule: { flexDirection: 'row', gap: 10, paddingVertical: 6, alignItems: 'flex-start' },
  ruleText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  ruleLead: { fontFamily: fonts.extra },
});
