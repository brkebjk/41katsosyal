import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { GameActionButton } from '@/components/GameActionButton';
import { GameLinks } from '@/components/GameLinks';
import { InfoLink, InfoModal } from '@/components/InfoModal';
import { RoomRow } from '@/components/RoomRow';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { useRoomActions } from '@/components/useRoomActions';
import { PointsTable } from '@/components/PointsTable';
import { useAuth } from '@/lib/auth';
import { GAMES, gameTitle, isGameKey } from '@/lib/gameCatalog';
import { DEFAULT_MIN_PLAYERS, HOW_TO_PLAY, pointsTable, roomRulesInfo } from '@/lib/gameInfo';
import { gameButtonImages } from '@/lib/images';
import { listOpenRooms, type OpenRoom } from '@/lib/rooms';
import { isBackendReady, supabase } from '@/lib/supabase';
import { DEFAULT_RULES, getPointRules, type PointRules } from '@/lib/ranking';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const ROOMS_REFRESH_MS = 10000;

/**
 * Bir oyunun “Açık odalar” ekranı: o oyunda katılıma açık odalar (moderatörünkiler üstte) ve “Oda oluştur” /
 * “Kodla katıl” düğmeleri. Oyunlar ekranında oyunun kutusuna dokununca buraya gelinir.
 */
export default function OpenRoomsScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const game = isGameKey(params.game) ? params.game : null;
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';

  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [minPlayers, setMinPlayers] = useState<number | null>(null);
  const seq = useRef(0);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  useEffect(() => {
    let alive = true;
    void getPointRules().then((r) => {
      if (alive) setRules(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Oyunun başlaması için gereken en az kişi (sunucudaki oyun ayarı)
  useEffect(() => {
    if (!supabase || !game) return;
    let active = true;
    void supabase
      .from('game_types')
      .select('min_players')
      .eq('key', game)
      .maybeSingle()
      .then(({ data }) => {
        const n = Number((data as { min_players?: number } | null)?.min_players);
        if (active && Number.isFinite(n) && n > 0) setMinPlayers(n);
      });
    return () => {
      active = false;
    };
  }, [game]);

  const load = useCallback(async () => {
    if (!isBackendReady || !game) {
      setLoaded(true);
      return;
    }
    const my = ++seq.current;
    const res = await listOpenRooms(game);
    if (my !== seq.current) return; // daha yeni bir yenileme başladı
    setError(res.error);
    if (!res.error) setRooms(res.data);
    setLoaded(true);
  }, [game]);

  const actions = useRoomActions({ isModerator, onChanged: () => void load() });
  const { beginFocus } = actions;

  // Ekran açılınca (oyundan dönüşte de): önce oyunlardan çıkış, sonra liste; açıkken birkaç saniyede bir yenilenir
  useFocusEffect(
    useCallback(() => {
      beginFocus(() => void load());
      const t = setInterval(() => void load(), ROOMS_REFRESH_MS);
      return () => clearInterval(t);
    }, [beginFocus, load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!game) {
    return (
      <Screen title="Açık odalar" onBack={() => router.back()}>
        <Text style={styles.empty}>Oyun bulunamadı. Oyunlar ekranından bir oyun seç.</Text>
      </Screen>
    );
  }

  const title = gameTitle(game);
  const rulesContent = roomRulesInfo(actions.limits.freeGames, actions.limits.subscriptionGames);
  // Çekilişi yalnızca moderatör açar; üyeler yalnızca kodla katılır
  const canCreate = game !== 'raffle' || isModerator;
  const official = rooms.filter((r) => r.is_official);
  const members = rooms.filter((r) => !r.is_official);

  const renderRoom = (r: OpenRoom) => (
    <RoomRow key={r.id} room={r} isModerator={isModerator} onPress={() => actions.openListed(r)} />
  );

  return (
    <Screen
      title={title}
      subtitle="Açık odalar"
      onBack={() => router.back()}
      backLabel="Oyunlar"
      onRefresh={() => void onRefresh()}
      refreshing={refreshing}
    >
      <View style={styles.buttons}>
        {canCreate ? (
          <GameActionButton
            label="Oda oluştur"
            sub={`Yeni ${title} odası aç`}
            icon="add-circle"
            colors={['#FF7A59', '#E5533D']}
            edge="#A8361F"
            art={gameButtonImages.create}
            onPress={() => void actions.createForGame(game)}
            testID="rooms-create"
          />
        ) : null}
        <GameActionButton
          label="Kodla katıl"
          sub="Davet kodun varsa"
          icon="enter"
          colors={['#14B8AA', '#0E8C9A']}
          edge="#0A5F68"
          art={gameButtonImages.join}
          onPress={actions.openJoin}
          testID="rooms-join"
        />
      </View>
      {/* En az kişi ve nasıl oynanır */}
      <View style={styles.guide}>
        <View style={styles.minBox}>
          <Ionicons name="people" size={18} color={colors.primary} />
          <Text style={styles.minText}>
            {game === 'quiz'
              ? `En az ${minPlayers ?? DEFAULT_MIN_PLAYERS[game] ?? 2} kişi · uzaktan oynanır`
              : `Başlamak için en az ${minPlayers ?? DEFAULT_MIN_PLAYERS[game] ?? 3} kişi gerekir`}
          </Text>
        </View>
        {(HOW_TO_PLAY[game] ?? []).slice(0, 2).map((it, i) => (
          <View key={i} style={styles.guideRow}>
            <Ionicons name={it.icon ?? 'ellipse'} size={15} color={colors.textMuted} />
            <Text style={styles.guideText}>
              {it.lead ? <Text style={styles.guideLead}>{`${it.lead} `}</Text> : null}
              {it.text}
            </Text>
          </View>
        ))}
      </View>
      {/* Vampir–Köylü: puan tablosu (oyuncu sayısına ve bitirilen sıraya göre) */}
      {game === 'vampire_villager' ? (
        <View style={styles.pointsCard} testID="vv-points-table">
          <View style={styles.pointsHead}>
            <Ionicons name="podium" size={18} color={colors.primary} />
            <Text style={styles.pointsTitle}>Puan tablosu</Text>
          </View>
          <PointsTable data={pointsTable(rules)} />
          <View style={styles.ruleTable}>
            {[
              [
                'Sıra nasıl belirlenir?',
                'Kazanan takım üstte. Takım içinde oyunda en uzun kalan öne geçer; aynı turda elenenler eşit.',
              ],
              [
                'Kalabalık çarpanı',
                `4 kişiden sonra her oyuncu 1. sıranın puanını %10 artırır (en çok ${rules.gameTopCap}).`,
              ],
              ['Son sıra', 'En az 1 puan alır.'],
              ['Puan için en az', `${rules.gameMinPlayers} oyuncu (moderatör sayılmaz)`],
              ['Sınır', 'Yan yana oyunda günlük/aylık puan sınırı yok'],
              ['Oyundan ayrılan', 'Puan almaz (elenmiş sayılır)'],
              ['Başarım ödülü', '5 Vampir görevini bitirenin puanları kalıcı 1,25 kat'],
            ].map(([k, v], i) => (
              <View key={k} style={[styles.ruleRow, i % 2 === 1 && styles.ruleRowAlt]}>
                <Text style={styles.ruleKey}>{k}</Text>
                <Text style={styles.ruleVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {game !== 'raffle' ? <GameLinks game={game} /> : null}
      <View style={styles.links}>
        <InfoLink label="Nasıl oynanır?" onPress={() => setHowOpen(true)} testID="info-how" />
        <InfoLink label="Oda kuralları" onPress={() => setRulesOpen(true)} testID="info-rooms" />
      </View>

      {!loaded ? null : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : rooms.length === 0 ? (
        <View style={styles.block}>
          <SectionHeader title="Açık odalar" />
          <Text style={styles.empty} testID="rooms-empty">
            {`Şu an ${GAMES[game].title} için açık oda yok. İlk odayı sen aç.`}
          </Text>
        </View>
      ) : (
        <View style={styles.block}>
          {/* Moderatörün açtıkları "41. Kat Özel" olarak üstte, ayrı gösterilir */}
          {official.length > 0 ? (
            <>
              <SectionHeader title="41. Kat Özel" official count={official.length} />
              {official.map(renderRoom)}
            </>
          ) : null}
          {members.length > 0 ? (
            <>
              <SectionHeader title="Üye odaları" count={members.length} />
              {members.map(renderRoom)}
            </>
          ) : null}
        </View>
      )}

      {actions.hint ? <Text style={styles.hint}>{actions.hint}</Text> : null}
      <InfoModal
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={rulesContent.title}
        icon={rulesContent.icon}
        items={rulesContent.items}
      />
      <InfoModal
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title={`${title}: nasıl oynanır?`}
        icon={GAMES[game].icon}
        items={HOW_TO_PLAY[game] ?? []}
        note={`Oyunun başlaması için odada en az ${minPlayers ?? DEFAULT_MIN_PLAYERS[game] ?? 3} kişi olmalı.`}
      />
      {actions.modals}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pointsCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.4)',
  },
  pointsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointsTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  ruleTable: { borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  ruleRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  ruleRowAlt: { backgroundColor: colors.surfaceAlt },
  ruleKey: { width: 112, color: colors.text, fontFamily: fonts.semi, fontSize: 12 },
  ruleVal: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  buttons: { flexDirection: 'row', gap: spacing.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg },
  guide: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  minBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  minText: { flex: 1, color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  guideRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  guideText: { flex: 1, color: colors.text, fontSize: fontSizes.xs + 1, lineHeight: 18 },
  guideLead: { fontFamily: fonts.semi },
  block: { gap: spacing.md },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  hint: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
});
