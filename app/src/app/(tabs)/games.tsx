import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/AppText';
import { FloatingActions } from '@/components/FloatingActions';
import { GameActionButton } from '@/components/GameActionButton';
import { GamePointsModal } from '@/components/GamePointsModal';
import { GoalRing } from '@/components/GoalRing';
import { InfoModal } from '@/components/InfoModal';
import { Popup } from '@/components/Popup';
import { Screen } from '@/components/Screen';
import { SponsorCodeModal } from '@/components/SponsorCodeModal';
import { VerifyPrizeNote } from '@/components/VerifyPrizeNote';
import { useRoomActions } from '@/components/useRoomActions';
import { TourTarget } from '@/components/TourTarget';
import { useAuth } from '@/lib/auth';
import { featureOn, useLook } from '@/lib/look';
import { getQuota, type Quota } from '@/lib/events';
import { setGameInvites } from '@/lib/invites';
import { getGamePlayerCounts, listMyEventRaffles } from '@/lib/rooms';
import { listTreasures } from '@/lib/treasure';
import { GAMES } from '@/lib/gameCatalog';
import { DEFAULT_MIN_PLAYERS, roomRulesInfo, venueInfo } from '@/lib/gameInfo';
import { GAME_KEYS, gameButtonImages, gameTileImages, type GameKey } from '@/lib/images';
import {
  DEFAULT_RULES,
  getLeaderboard,
  getMyGameGoals,
  getPointRules,
  goalOf,
  type GameGoals,
  type PointRules,
  type RankRow,
} from '@/lib/ranking';
import { supabase } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';
import { fmtPts } from '@/lib/labels';
import { useTabResetKey } from '@/lib/tabReset';

const TOP_MEDAL: Record<number, string> = {
  1: '#FFC93C',
  2: '#C9D1E3',
  3: '#E39A5B',
};

/** Kutunun eğimi (derece) ve yatay kayması (piksel). Kutular artık düz durur (eğim ve kayma yok). */
type Tilt = { deg: number; dx: number };

const STRAIGHT: Tilt = { deg: 0, dx: 0 };
const TILTS: Record<GameKey, Tilt> = {
  shark_cage: STRAIGHT,
  vampire_villager: STRAIGHT,
  taboo: STRAIGHT,
  charades: STRAIGHT,
  find_killer: STRAIGHT,
  quiz: STRAIGHT,
  treasure_hunt: STRAIGHT,
  raffle: STRAIGHT,
};

/** Sekmeden ayrılınca ekran baştan kurulur (açık pencereler kapanır, seçimler sıfırlanır) */
export default function GamesScreenTab() {
  const resetKey = useTabResetKey('games');
  return <GamesScreen key={resetKey} />;
}

function GamesScreen() {
  const { width } = useWindowDimensions();
  const { profile, account, refreshAccount } = useAuth();
  const look = useLook();
  const [top, setTop] = useState<RankRow[] | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitesOn, setInvitesOn] = useState<boolean | null>(null);
  const invites = invitesOn ?? account?.game_invites ?? false;
  const isModerator = profile?.role === 'admin';
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [eventRaffles, setEventRaffles] = useState({ any: false, pending: false });
  const [minPlayers, setMinPlayers] = useState<Record<string, number>>(DEFAULT_MIN_PLAYERS);
  /** Şu an odalarda olan kişi sayısı (bekleme salonu dahil) */
  const [playing, setPlaying] = useState<Record<string, number>>({});
  /** Haritadaki etkin hazine sayısı (Hazine Avı kutusunda) */
  const [treasureCount, setTreasureCount] = useState<number | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const quotaSeq = useRef(0);
  /** Bu ayın puan hedefleri (oyun kutularında “Kalan hedef”) */
  const [goals, setGoals] = useState<GameGoals | null>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  /** Açık bilgi penceresi */
  const [info, setInfo] = useState<'rooms' | 'points' | 'quota' | null>(null);
  /** “Oda Oluştur”a basınca açılan oyun seçimi */
  const [pickOpen, setPickOpen] = useState(false);
  /** Mekân kodu giriş penceresi (hak göstergesine dokununca) */
  const [codeOpen, setCodeOpen] = useState(false);

  const refreshQuota = useCallback(async () => {
    const my = ++quotaSeq.current;
    const [res, g] = await Promise.all([getQuota(), getMyGameGoals()]);
    if (my !== quotaSeq.current) return;
    if (res.data) setQuota(res.data);
    if (g) setGoals(g);
  }, []);

  const actions = useRoomActions({
    isModerator,
    onChanged: () => void refreshQuota(),
  });
  const { beginFocus } = actions;

  useEffect(() => {
    let active = true;
    void getPointRules().then((r) => {
      if (active) setRules(r);
    });
    return () => {
      active = false;
    };
  }, []);

  // Hangi oyunların açık olduğunu sunucudan oku
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('game_types').select('key, enabled, min_players');
      if (!active || !data) return;
      const list = data as {
        key: string;
        enabled: boolean;
        min_players: number | null;
      }[];
      setEnabled(Object.fromEntries(list.map((g) => [g.key, g.enabled])));
      setMinPlayers((prev) => ({
        ...prev,
        ...Object.fromEntries(
          list
            .filter((g) => Number.isFinite(Number(g.min_players)) && Number(g.min_players) > 0)
            .map((g) => [g.key, Number(g.min_players)]),
        ),
      }));
    })();
    return () => {
      active = false;
    };
  }, []);

  // Sekme açılınca: oyun ekranından menüye dönmüş olabiliriz (yan yana oyunlarda menüye dönmek oyundan ayrılmaktır);
  // puan hedefleri de tazelenir.
  useFocusEffect(
    useCallback(() => {
      beginFocus(() => void refreshQuota());
      // Etkinlik çekilişi: düzenleyenin açabileceği (en az 4 doğrulama) etkinlikler; açılmamış varsa kırmızı nokta
      void listMyEventRaffles().then((r) => {
        if (!r.error) setEventRaffles({ any: r.data.length > 0, pending: r.data.some((x) => Number(x.done) === 0) });
      });
      void getGamePlayerCounts().then(setPlaying);
      void listTreasures().then((t) => setTreasureCount(t.length));
      const t = setInterval(() => void getGamePlayerCounts().then(setPlaying), 30_000);
      // Sıralamanın ilk 3'ü (sıralama artık bu sekmenin içinde)
      void getLeaderboard('this').then((r) => {
        if (!r.error) setTop(r.data.slice(0, 3));
      });
      return () => clearInterval(t);
    }, [beginFocus, refreshQuota]),
  );

  /** Oyun kutusuna dokunuldu: açık oyunlarda önce o oyunun “Açık odalar” ekranı açılır. */
  function onTilePress(key: GameKey) {
    actions.setHint(null);
    // Yönetim panelinden kapatılan oyun açılmaz
    const feature = key === 'quiz' ? 'bilgi_yarismasi' : key === 'treasure_hunt' ? 'hazine' : null;
    if (feature && !featureOn(look.features, feature)) {
      actions.setHint(`${GAMES[key].title} şu an kapalı. Daha sonra tekrar dene.`);
      return;
    }
    if (key === 'treasure_hunt') {
      router.push('/hazine');
      return;
    }
    // Köpekbalığı Kafesi kendi temalı giriş ekranından açılır (roller, puan sayacı, yan yana / uzaktan)
    if (key === 'shark_cage') {
      router.push('/kopekbaligi-giris');
      return;
    }
    // Vampir–Köylü de aynı düzende kendi giriş ekranından açılır
    if (key === 'vampire_villager') {
      router.push('/vampir-giris');
      return;
    }
    // Bilgi Yarışması kendi ekranında oynanır (Solo Maraton / Uzaktan); oyun odası yoktur
    if (key === 'quiz') {
      router.push('/bilgi');
      return;
    }
    if (!enabled[key]) {
      actions.setHint(`${GAMES[key].title} hazırlanıyor, çok yakında burada olacak.`);
      return;
    }
    if (key === 'raffle' && (isModerator || eventRaffles.any)) {
      router.push('/cekilis');
      return;
    }
    router.push({ pathname: '/acik-odalar', params: { game: key } });
  }

  /** “Oda Oluştur” listesinden bir oyun seçildi. */
  function onPickCreate(key: GameKey) {
    setPickOpen(false);
    if (key === 'quiz') {
      // Bilgi Yarışması'nda Uzaktan özel oda kurulur (can ya da günlük hak yoksa kurulmaz)
      router.push({ pathname: '/bilgi', params: { create: '1' } });
      return;
    }
    if (!enabled[key]) {
      actions.setHint(`${GAMES[key].title} hazırlanıyor, çok yakında burada olacak.`);
      return;
    }
    void actions.createForGame(key);
  }

  const createKeys = GAME_KEYS.filter((k) => k !== 'treasure_hunt' && (k !== 'raffle' || isModerator));

  // Her satırda iki eşit boyutlu kutu aynı hizada durur. Kutular hafif eğik ve yatayda farklı
  // miktarda kaydırılmıştır, böylece düz bir ızgara yerine "yamuk yumuk" bir görünüm oluşur.
  const gap = spacing.md + 2;
  const tile = Math.floor((Math.min(width, 560) - spacing.lg * 2 - gap - 12) / 2);
  const rows: GameKey[][] = [];
  // Çekiliş ızgarada değil, oyun davetleri kutusunun yanındaki kutudadır
  const gridKeys = GAME_KEYS.filter((k) => k !== 'raffle');
  for (let i = 0; i < gridKeys.length; i += 2) rows.push(gridKeys.slice(i, i + 2));

  const roomsContent = roomRulesInfo(rules);
  const quotaContent = venueInfo(rules);

  // Mekân düğmesi: mekân kodu girişi (kullanılmamış kod varsa yeşil nokta). Moderatör kod girmez, yalnızca açıklama.
  const hasCredit = quota?.sponsor_credit === true;
  const gauge = (
    <Pressable
      onPress={() => (quota?.is_moderator ? setInfo('quota') : setCodeOpen(true))}
      accessibilityRole="button"
      accessibilityLabel={hasCredit ? 'Mekân kodu girildi' : 'Mekân kodu gir'}
      testID="games-venue"
      style={({ pressed }) => [styles.venueBtn, pressed && styles.tilePressed]}
    >
      <Ionicons name="storefront" size={18} color="#1A1200" />
      <Text style={styles.venueText}>Mekân</Text>
      {hasCredit ? <View style={styles.venueDot} /> : null}
    </Pressable>
  );

  // Mekân (sponsor) hesapları oyun oynamaz; yalnızca açıklama gösterilir
  if (profile?.role === 'sponsor') {
    return (
      <Screen title="Oyunlar" subtitle="Telefonlarla yan yana oyna">
        <Text style={styles.hint}>
          Mekân hesapları oyun oynamaz ve oda açmaz. Müşterilerine Profil sekmesinden mekân bonusu kodu verebilirsin.
        </Text>
      </Screen>
    );
  }

  async function toggleInvites(next: boolean) {
    if (inviteBusy) return;
    setInviteBusy(true);
    setInvitesOn(next);
    const res = await setGameInvites(next);
    setInviteBusy(false);
    if (res.error) {
      setInvitesOn(!next);
      actions.setHint(res.error);
      return;
    }
    void refreshAccount();
  }

  return (
    <Screen
      title="Oyunlar"
      subtitle="Telefonlarla yan yana oyna"
      headerRight={gauge}
      floatingFooter
      footer={
        <FloatingActions testID="games-actions">
          <TourTarget tourId="games-actions" style={styles.footerButtons}>
            <GameActionButton
              label="Oda Oluştur"
              sub="Oyun seç, odanı aç"
              icon="add-circle"
              colors={['#FF7A59', '#E5533D']}
              edge="#A8361F"
              art={gameButtonImages.create}
              onPress={() => setPickOpen(true)}
              testID="games-create"
              compact
            />
            <GameActionButton
              label="Katıl"
              sub="Davet kodunu yaz"
              icon="enter"
              colors={['#14B8AA', '#0E8C9A']}
              edge="#0A5F68"
              art={gameButtonImages.join}
              onPress={actions.openJoin}
              testID="games-join"
              compact
            />
          </TourTarget>
        </FloatingActions>
      }
    >
      {/* Aylık ödül podyumu: ayın ilk 3'ü; “Ödülleri gör” sıralama ekranını açar */}
      <TourTarget tourId="games-podium"><LinearGradient
        colors={['#145A66', '#0F2333', '#0A1D2B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.podCard}
      >
        <View style={styles.podHead}>
          <Ionicons name="trophy" size={22} color="#FFC93C" />
          <Text style={styles.podTitle}>Aylık Ödül Podyumu</Text>
        </View>
        {top === null ? (
          <Text style={styles.topEmpty}>Yükleniyor…</Text>
        ) : top.length === 0 ? (
          <Text style={styles.topEmpty}>Bu ay podyumda henüz kimse yok. İlk sen çık!</Text>
        ) : (
          <View style={styles.podRow}>
            {[2, 1, 3].map((place) => {
              const r = top[place - 1];
              // Podyum alçak tutulur (ekranda az yer kaplasın)
              const h = place === 1 ? 42 : place === 2 ? 32 : 24;
              return (
                <View key={place} style={styles.podCol}>
                  <Text style={[styles.podName, r?.is_me && styles.topMe]} numberOfLines={1}>
                    {r ? r.full_name : '—'}
                  </Text>
                  <Text style={styles.podPoints}>{r ? `${fmtPts(r.points)} puan` : ''}</Text>
                  <View style={[styles.podBlock, { height: h, backgroundColor: TOP_MEDAL[place] }]}>
                    <Text style={styles.podPlace}>{place}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <VerifyPrizeNote onDark />
        <Pressable
          onPress={() => router.push('/siralama')}
          accessibilityRole="button"
          accessibilityLabel="Ödülleri gör"
          testID="games-top3"
          style={({ pressed }) => [styles.podBtn, pressed && styles.tilePressed]}
        >
          <Ionicons name="gift" size={18} color="#1A1200" />
          <Text style={styles.podBtnText}>Ödülleri gör</Text>
        </Pressable>
      </LinearGradient></TourTarget>

      {/* Ekranı yarı yarıya paylaşan iki kutu: oyun davetleri (varsayılan kapalı) ve çekiliş */}
      <View style={styles.halfRow}>
        <View style={[styles.inviteRow, styles.half]} testID="games-invite-toggle">
          <View style={styles.inviteHead}>
            <Ionicons name="mail-unread-outline" size={20} color={colors.highlight} />
            <Switch
              value={invites}
              onValueChange={(v) => void toggleInvites(v)}
              disabled={inviteBusy}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Oyun davetlerini al"
            />
          </View>
          <Text style={styles.inviteTitle}>Oyun davetlerini al</Text>
          <Text style={styles.inviteSub} numberOfLines={3}>
            {invites
              ? 'Açık: arkadaşların ve yakınında oda kuranlar davet edebilir.'
              : 'Kapalı: kimse davet gönderemez.'}
          </Text>
        </View>
        <Pressable
          onPress={() => onTilePress('raffle')}
          accessibilityRole="button"
          accessibilityLabel="Çekiliş"
          testID="games-raffle-mini"
          style={({ pressed }) => [styles.raffleMini, styles.half, pressed && styles.tilePressed]}
        >
          {gameTileImages.raffle ? (
            <Image source={gameTileImages.raffle} contentFit="cover" style={styles.fill} />
          ) : (
            <LinearGradient colors={GAMES.raffle.fallback} style={styles.fill} />
          )}
          <LinearGradient
            colors={['rgba(8,10,20,0)', 'rgba(8,10,20,0.85)']}
            locations={[0.35, 1]}
            style={[styles.fill, styles.noTouch]}
          />
          {eventRaffles.pending ? (
            <View style={styles.raffleBadge} pointerEvents="none" testID="games-raffle-badge">
              <Text style={styles.raffleBadgeText}>!</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.infoBoxes}>
        <Pressable
          onPress={() => setInfo('rooms')}
          accessibilityRole="button"
          testID="info-rooms"
          style={({ pressed }) => [styles.infoBox, pressed && styles.tilePressed]}
        >
          <Ionicons name="key-outline" size={16} color={colors.highlight} />
          <Text style={styles.infoBoxText} numberOfLines={2}>
            Oda kuralları
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setInfo('points')}
          accessibilityRole="button"
          testID="info-points"
          style={({ pressed }) => [styles.infoBox, pressed && styles.tilePressed]}
        >
          <Ionicons name="calculator-outline" size={16} color={colors.highlight} />
          <Text style={styles.infoBoxText} numberOfLines={2}>
            Oyun puanı nasıl hesaplanır?
          </Text>
        </Pressable>
      </View>

      <View style={styles.gamesHead}>
        <Text style={styles.gamesTitle} accessibilityRole="header">
          OYUNLAR
        </Text>
        <Text style={styles.gamesHint}>Bir oyuna dokun, o oyunun açık odalarını gör.</Text>
      </View>
      <TourTarget tourId="games-tiles" style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={[styles.row, { gap }]}>
            {row.map((key) => (
              <GameTile
                key={key}
                gameKey={key}
                size={tile}
                live={key === 'treasure_hunt' || enabled[key] === true}
                minPlayers={minPlayers[key] ?? null}
                playing={playing[key] ?? 0}
                treasures={key === 'treasure_hunt' ? treasureCount : null}
                goal={
                  goals && (key === 'shark_cage' || key === 'vampire_villager' || key === 'quiz')
                    ? goalOf(goals, key)
                    : null
                }
                onPress={() => onTilePress(key)}
                tilt={TILTS[key]}
              />
            ))}
          </View>
        ))}
      </TourTarget>

      {actions.hint ? <Text style={styles.hint}>{actions.hint}</Text> : null}
      <InfoModal
        visible={info === 'rooms'}
        onClose={() => setInfo(null)}
        title={roomsContent.title}
        icon={roomsContent.icon}
        items={roomsContent.items}
      />
      <InfoModal
        visible={info === 'quota'}
        onClose={() => setInfo(null)}
        title={quotaContent.title}
        icon={quotaContent.icon}
        items={quotaContent.items}
      />
      <GamePointsModal visible={info === 'points'} onClose={() => setInfo(null)} />
      <SponsorCodeModal
        visible={codeOpen}
        onClose={() => setCodeOpen(false)}
        onRedeemed={() => void refreshQuota()}
        hasCredit={hasCredit}
        onInfo={() => {
          setCodeOpen(false);
          setInfo('quota');
        }}
      />
      {actions.modals}
      {pickOpen ? (
        <Popup
          title="Hangi oyunun odasını açacaksın?"
          subtitle="Odayı açarken haritadan bölge seçip adres tarifi yazacaksın."
          icon="add-circle"
          onClose={() => setPickOpen(false)}
          testID="games-create-picker"
        >
          {createKeys.map((k) => {
            const soon = k !== 'quiz' && !enabled[k];
            const img = gameTileImages[k];
            return (
              <Pressable
                key={k}
                onPress={() => onPickCreate(k)}
                accessibilityRole="button"
                accessibilityLabel={soon ? `${GAMES[k].title}, yakında` : GAMES[k].title}
                testID={`games-pick-${k}`}
                style={({ pressed }) => [styles.pickRow, soon && styles.pickRowSoon, pressed && styles.tilePressed]}
              >
                <View style={styles.pickThumb}>
                  {img ? (
                    <Image source={img} contentFit="cover" style={styles.fill} />
                  ) : (
                    <LinearGradient colors={GAMES[k].fallback} style={[styles.fill, styles.pickThumbIcon]}>
                      <Ionicons name={GAMES[k].icon} size={22} color="#FFFFFF" />
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.pickText}>
                  <Text style={styles.pickTitle} numberOfLines={1}>
                    {GAMES[k].title}
                  </Text>
                  <Text style={styles.pickSub} numberOfLines={1}>
                    {soon ? 'Yakında' : GAMES[k].description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </Popup>
      ) : null}
    </Screen>
  );
}

function GameTile({
  gameKey,
  size,
  live,
  minPlayers,
  playing,
  treasures,
  goal,
  onPress,
  tilt,
}: {
  gameKey: GameKey;
  /** Bu ayın puan hedefi ve kalanı (puan veren oyunlarda); null = gösterilmez */
  goal: { left: number; cap: number } | null;
  size: number;
  live: boolean;
  minPlayers: number | null;
  playing: number;
  /** Yalnızca Hazine Avı: haritadaki etkin hazine sayısı */
  treasures: number | null;
  onPress: () => void;
  tilt: Tilt;
}) {
  const info = GAMES[gameKey];
  const image = gameTileImages[gameKey];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}. ${info.description}. ${live ? 'Açık' : 'Yakında'}`}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          height: size,
          transform: [{ translateX: tilt.dx }, { rotate: `${tilt.deg}deg` }, { scale: pressed ? 0.98 : 1 }],
        },
        pressed && styles.tilePressed,
      ]}
    >
      {image ? (
        <Image source={image} contentFit="cover" style={styles.fill} />
      ) : (
        <>
          <LinearGradient colors={info.fallback} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fill} />
          <Ionicons
            name={info.icon}
            size={Math.round(size * 0.42)}
            color="rgba(255,255,255,0.18)"
            style={styles.fallbackIcon}
          />
        </>
      )}
      <LinearGradient
        colors={['rgba(8,10,20,0)', 'rgba(8,10,20,0.88)']}
        locations={[0.35, 1]}
        style={[styles.fill, styles.noTouch]}
      />
      <View style={styles.badgeCol} pointerEvents="none">
        {minPlayers !== null && gameKey !== 'raffle' && gameKey !== 'treasure_hunt' ? (
          <View style={styles.minBadge} accessibilityLabel={`En az ${minPlayers} kişi`}>
            <Ionicons name="people" size={11} color="#FFFFFF" />
            <Text style={styles.minBadgeText}>{`${minPlayers}+`}</Text>
          </View>
        ) : null}
        {gameKey === 'treasure_hunt' ? (
          <View style={styles.playBadge} accessibilityLabel={`Haritada ${treasures ?? 0} hazine`}>
            <Ionicons name="search" size={11} color="#5BE37D" />
            <Text style={styles.minBadgeText}>{`${treasures ?? 0} hazine`}</Text>
          </View>
        ) : (
          <View style={styles.playBadge} accessibilityLabel={`Şu an ${playing} oyuncu`}>
            <View style={[styles.liveDot, playing > 0 && styles.liveDotOn]} />
            <Text style={styles.minBadgeText}>{`${playing} oyuncu`}</Text>
          </View>
        )}
      </View>
      {!live ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Yakında</Text>
        </View>
      ) : goal ? (
        <View style={styles.ringCorner} pointerEvents="none">
          <GoalRing left={goal.left} cap={goal.cap} size={Math.max(40, Math.min(54, Math.round(size * 0.27)))} />
        </View>
      ) : null}
      <View style={styles.tileText}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {info.title}
        </Text>
        <Text style={styles.tileDesc} numberOfLines={2}>
          {info.description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  podCard: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 201, 60, 0.45)',
  },
  podHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  podTitle: {
    color: '#FFE7A0',
    fontFamily: fonts.extra,
    fontSize: fontSizes.lg,
  },
  podRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  podCol: { flex: 1, alignItems: 'center', gap: 2 },
  podName: {
    color: '#FFFFFF',
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  podPoints: {
    color: 'rgba(230,234,245,0.75)',
    fontSize: fontSizes.xs,
    marginBottom: 4,
  },
  podBlock: {
    alignSelf: 'stretch',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podPlace: {
    color: 'rgba(0,0,0,0.5)',
    fontFamily: fonts.black,
    fontSize: fontSizes.lg,
  },
  podBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 38,
    borderRadius: radii.pill,
    backgroundColor: '#FFC93C',
  },
  podBtnText: {
    color: '#1A1200',
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
  },
  topEmpty: {
    color: 'rgba(230,234,245,0.8)',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  topMe: { color: '#FFC93C' },
  gamesHead: { gap: 2 },
  gamesTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: fontSizes.xl,
    letterSpacing: 1.5,
  },
  gamesHint: { color: colors.textMuted, fontSize: fontSizes.sm },
  badgeCol: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    gap: 4,
    alignItems: 'flex-start',
  },
  playBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(11, 15, 26, 0.72)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  liveDotOn: { backgroundColor: '#3DDC84' },
  minBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(11, 15, 26, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  minBadgeText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 11 },
  halfRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  half: { flex: 1, minHeight: 124 },
  inviteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteRow: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  inviteText: { flex: 1, gap: 2 },
  inviteTitle: {
    color: colors.highlight,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
  },
  inviteSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  buttons: { flexDirection: 'row', gap: spacing.md },
  infoBoxes: { flexDirection: 'row', gap: spacing.sm },
  infoBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 200, 61, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.45)',
  },
  infoBoxText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.semi,
    fontSize: fontSizes.xs,
    lineHeight: 15,
  },
  // Yüzen düğmeler: arkalarında zemin yok, oyun kutuları altlarından görünür
  raffleBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raffleBadgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 14 },
  raffleMini: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.6)',
    backgroundColor: colors.surface,
  },
  raffleMiniText: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: fontSizes.lg,
    textAlign: 'center',
    paddingBottom: 10,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: spacing.sm,
    pointerEvents: 'box-none',
  },
  grid: { gap: spacing.lg + 2 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  pickRowSoon: { opacity: 0.6 },
  pickThumb: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  pickThumbIcon: { alignItems: 'center', justifyContent: 'center' },
  pickText: { flex: 1, gap: 2 },
  pickTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pickSub: { color: colors.textMuted, fontSize: fontSizes.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  tile: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
  },
  tilePressed: { opacity: 0.85 },
  fallbackIcon: { position: 'absolute', top: '16%', alignSelf: 'center' },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(11, 15, 26, 0.78)',
    borderColor: 'rgba(34, 211, 197, 0.55)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { color: colors.primary, fontFamily: fonts.semi, fontSize: 11 },
  tileText: { padding: spacing.md, gap: 2 },
  ringCorner: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  venueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: '#FFC93C',
  },
  venueText: { color: '#1A1200', fontFamily: fonts.extra, fontSize: 13 },
  venueDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34D399',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  tileTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
  },
  tileDesc: {
    color: 'rgba(230, 234, 245, 0.85)',
    fontSize: 12,
    lineHeight: 16,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
