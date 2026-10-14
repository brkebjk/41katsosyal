import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { GameActionButton } from '@/components/GameActionButton';
import { GameLinks } from '@/components/GameLinks';
import { InfoLink, InfoModal } from '@/components/InfoModal';
import { RoomRow } from '@/components/RoomRow';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { MapEventPopup } from '@/components/MapEventPopup';
import { useRoomActions } from '@/components/useRoomActions';
import { notify } from '@/lib/dialog';
import { listEvents, type EventItem } from '@/lib/events';
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
 * Bir oyunun “Açık odalar” ekranı: en üstte katılıma açık odalar (moderatörünkiler üstte), altında dokununca açılan
 * puan tablosu ve oyunun kısa anlatımı; en altta yüzen yuvarlak “Kodla katıl” düğmesi.
 * Köpekbalığı ve Vampir–Köylü’de buradan oda açılmaz. Listede yan yana odalar, etkinlik oyunları ve 41. Kat Özel
 * oyunlar görünür; hepsine oda koduyla ve konum doğrulamasıyla girilir. Uzaktan odalar listelenmez: Uzaktan Eşleş’te
 * bekleyen bir uzaktan oda varsa oyuncu oraya kendiliğinden alınır.
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
  const [pointsOpen, setPointsOpen] = useState(false);
  /** “Etkinlik Oyunu” etiketine dokununca açılan etkinlik penceresi */
  const [eventInfo, setEventInfo] = useState<EventItem | null>(null);

  async function openEvent(eventId: string) {
    const res = await listEvents();
    const ev = res.data.find((e) => e.id === eventId);
    if (ev) setEventInfo(ev);
    else void notify('Etkinlik', 'Bu etkinliğin bilgisi şu an açılamadı. Etkinlik bitmiş ya da kapanmış olabilir.', { icon: null });
  }
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
  // Köpekbalığı ve Vampir–Köylü'de oda bu ekrandan açılmaz (giriş ekranındaki Yan yana / Uzaktan eşleş);
  // çekilişi yalnızca moderatör açar; üyeler yalnızca kodla katılır
  const party = game === 'vampire_villager' || game === 'shark_cage';
  const canCreate = !party && (game !== 'raffle' || isModerator);
  const official = rooms.filter((r) => r.is_official);
  const members = rooms.filter((r) => !r.is_official);

  const renderRoom = (r: OpenRoom) => (
    <RoomRow key={r.id} room={r} isModerator={isModerator} onPress={() => actions.openListed(r)} onEvent={openEvent} />
  );

  return (
    <Screen
      title={title}
      subtitle="Açık odalar"
      onBack={() => router.back()}
      backLabel="Oyunlar"
      onRefresh={() => void onRefresh()}
      refreshing={refreshing}
      overlay={
        // Kodla katıl: sayfanın en altında yüzen yuvarlak düğme
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            onPress={actions.openJoin}
            accessibilityRole="button"
            accessibilityLabel="Kodla katıl"
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
            testID="rooms-join"
          >
            <Ionicons name="keypad" size={24} color="#FFFFFF" />
            <Text style={styles.fabText}>Kodla{'\n'}katıl</Text>
          </Pressable>
        </View>
      }
    >
      {canCreate ? (
        <View style={styles.buttons}>
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
        </View>
      ) : null}
      {!loaded ? null : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : rooms.length === 0 ? (
        <View style={styles.block}>
          <SectionHeader title="Açık odalar" />
          <Text style={styles.empty} testID="rooms-empty">
            {party
              ? `Şu an açık ${GAMES[game].title} odası yok. Burada yan yana odalar, etkinlik oyunları ve 41. Kat Özel oyunlar görünür; girmek için oda kodu ve konum doğrulaması gerekir. Uzaktan oynamak için giriş ekranındaki Uzaktan Eşleş’i kullan.`
              : `Şu an ${GAMES[game].title} için açık oda yok. İlk odayı sen aç.`}
          </Text>
        </View>
      ) : (
        <View style={styles.block}>
          {party ? (
            <Text style={styles.empty}>Yan yana odalar, etkinlik oyunları ve 41. Kat Özel oyunlar. Girmek için oda kodu ve konum doğrulaması gerekir.</Text>
          ) : null}
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

      {/* Vampir–Köylü: puan tablosu (oyuncu sayısına ve bitirilen sıraya göre) */}
      {game === 'vampire_villager' || game === 'shark_cage' ? (
        <View style={styles.pointsCard} testID="vv-points-table">
          <Pressable
            onPress={() => setPointsOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: pointsOpen }}
            style={({ pressed }) => [styles.pointsHead, pressed && styles.pressed]}
            testID="rooms-points-toggle"
          >
            <Ionicons name="podium" size={18} color={colors.primary} />
            <Text style={[styles.pointsTitle, styles.flex]}>Puan tablosu</Text>
            <Text style={styles.pointsBadge}>Yan yana 5x</Text>
            <Ionicons name={pointsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
          {pointsOpen ? (
          <>
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
              ['Yan yana', 'Uzaktan oyunun 5 katı puan; günlük/aylık puan sınırı yok'],
              ['Uzaktan', 'Yan yana puanının beşte biri; oyun hakkından yemez'],
              ['Etkinlik oyunu', 'Oyun Geceleri ×1,5 · Sosyal Buluşmalar ve Müzik & Eğlence ×1,25'],
              ['Oyundan ayrılan', 'Puan almaz (elenmiş sayılır)'],
              ...(game === 'vampire_villager' ? [['Başarım ödülü', '5 Vampir görevini bitirenin puanları kalıcı 1,25 kat']] : []),
            ].map(([k, v], i) => (
              <View key={k} style={[styles.ruleRow, i % 2 === 1 && styles.ruleRowAlt]}>
                <Text style={styles.ruleKey}>{k}</Text>
                <Text style={styles.ruleVal}>{v}</Text>
              </View>
            ))}
          </View>
          </>
          ) : null}
        </View>
      ) : null}
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
      {game !== 'raffle' ? <GameLinks game={game} /> : null}
      <View style={styles.links}>
        <InfoLink label="Nasıl oynanır?" onPress={() => setHowOpen(true)} testID="info-how" />
        <InfoLink label="Oda kuralları" onPress={() => setRulesOpen(true)} testID="info-rooms" />
      </View>

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
      <View style={styles.fabSpace} />
      {eventInfo ? (
        <MapEventPopup events={[eventInfo]} onClose={() => setEventInfo(null)} onChanged={() => void load()} />
      ) : null}
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
  pointsHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  pointsBadge: {
    color: '#FFFFFF',
    backgroundColor: '#D9304F',
    fontFamily: fonts.extra,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  fabSpace: { height: 96 },
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  fab: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E8C9A',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11, lineHeight: 13, textAlign: 'center', marginTop: 1 },
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
