import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { CrewBoard } from '@/components/CrewBoard';
import { InfoModal } from '@/components/InfoModal';
import { ListRow, Panel } from '@/components/Panel';
import { PointRulesPanel } from '@/components/PointRulesPanel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuizRankCard } from '@/components/QuizRankCard';
import { FinalResultsSheet, RankTimers } from '@/components/RankExtras';
import { RealNameNotice } from '@/components/RealNameNotice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { VerifyPrizeNote } from '@/components/VerifyPrizeNote';
import { TitleBadge } from '@/components/TitleBadge';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useAuth } from '@/lib/auth';
import { DEFAULT_CONTEST, contestOn, getContest, type Contest } from '@/lib/contest';
import { fmtPts, fmtPtsSigned, formatDate, lastDayBefore, monthTitle } from '@/lib/labels';
import { rankingInfoContent } from '@/lib/rankInfo';
import { REAL_NAME } from '@/lib/realName';
import {
  DEFAULT_RULES,
  getGameChampion,
  getGameLeaderboard,
  getLeaderboard,
  getPointRules,
  getRankingInfo,
  listLevels,
  listMyPointEvents,
  type GameChampion,
  type GameRankRow,
  type LevelInfo,
  type PointEvent,
  type PointRules,
  type RankPeriod,
  type RankRow,
  type RankingInfo,
} from '@/lib/ranking';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const MEDAL: Record<number, string> = { 1: '#FFC93C', 2: '#C9D1E3', 3: '#E39A5B' };

/** Oyun sıralaması sekmeleri: çekiliş sıralamada yer almaz */
const GAME_TABS = ACHIEVEMENTS.filter((g) => g.game !== 'raffle');

type Mode = 'points' | 'games' | 'crew';
type BoardRow = {
  place: number;
  full_name: string;
  points: number;
  is_me: boolean;
  /** Geçerli oyun şampiyonu ünvanı (varsa) */
  title: string | null;
  /** Aylık hediye şartı (o ay etkinlik katılımı ya da yan yana oyun); false ise "şart eksik" işareti görünür */
  eligible?: boolean;
};

export default function LeaderboardScreen() {
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  // Ekranda her zaman bu ayın tablosu; geçen hafta ve geçen ay “Kesinleşmiş sonuçlar” penceresinde
  const period: RankPeriod = 'this';
  const [showAll, setShowAll] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PointEvent[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const requestId = useRef(0);
  // Bir oyunun ekranından gelindiyse doğrudan o oyunun sıralaması açılır
  const params = useLocalSearchParams<{ game?: string; tab?: string }>();
  const startGame = GAME_TABS.some((g) => g.game === params.game) ? (params.game as string) : null;
  const [mode, setMode] = useState<Mode>(params.tab === 'crew' ? 'crew' : startGame ? 'games' : 'points');
  const [crewKey, setCrewKey] = useState(0);
  const [game, setGame] = useState<string>(startGame ?? GAME_TABS[0].game);
  const [gameRows, setGameRows] = useState<GameRankRow[]>([]);
  const [champion, setChampion] = useState<GameChampion | null>(null);
  const [gameLoaded, setGameLoaded] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const gameRequestId = useRef(0);
  const [contest, setContest] = useState<Contest>(DEFAULT_CONTEST);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [info, setInfo] = useState<RankingInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const loadGame = useCallback(async (g: string, p: RankPeriod) => {
    if (!isBackendReady) {
      setGameLoaded(true);
      return;
    }
    // Oyun hızlıca değiştirilirse eski oyunun cevabı yenisinin üstüne yazmasın
    const my = ++gameRequestId.current;
    const [res, champ, inf] = await Promise.all([getGameLeaderboard(g, p), getGameChampion(g), getRankingInfo()]);
    if (my !== gameRequestId.current) return;
    setGameError(res.error);
    if (!res.error) setGameRows(res.data);
    setChampion(champ);
    setInfo(inf);
    setGameLoaded(true);
  }, []);

  const load = useCallback(async (p: RankPeriod) => {
    if (!isBackendReady) {
      setLoaded(true);
      return;
    }
    // Dönem hızlıca değiştirilirse eski dönemin cevabı yenisinin üstüne yazmasın
    const my = ++requestId.current;
    const [res, inf] = await Promise.all([getLeaderboard(p), getRankingInfo()]);
    if (my !== requestId.current) return;
    setError(res.error);
    if (!res.error) setRows(res.data);
    setInfo(inf);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void listLevels().then(setLevels);
  }, []);

  // Dönem değişince ya da sekmeye gelince liste tazelenir
  useFocusEffect(
    useCallback(() => {
      void getContest().then(setContest);
      void getPointRules().then(setRules);
      if (mode === 'points') void load(period);
      else if (mode === 'games') void loadGame(game, period);
    }, [load, loadGame, mode, period, game]),
  );

  async function loadHistory() {
    const res = await listMyPointEvents();
    setHistoryError(res.error);
    setHistory(res.error ? null : res.data);
  }

  async function onRefresh() {
    setRefreshing(true);
    if (mode === 'crew') {
      setCrewKey((k) => k + 1);
    } else if (mode === 'points') {
      await load(period);
      if (historyOpen) await loadHistory();
    } else {
      await loadGame(game, period);
    }
    setRefreshing(false);
  }

  function changeGame(g: string) {
    if (g === game) return;
    setGameLoaded(false);
    setGameRows([]);
    setChampion(null);
    setGame(g);
  }

  const levelName = (level: number) => levels.find((l) => l.level === level)?.name ?? `Seviye ${level}`;
  const me = rows.find((r) => r.is_me) ?? null;
  const giftOn = contestOn(contest);
  // Hediye programı açıkken ödül şartını sağlamayanlar işaretlenir (yalnızca uzaktan oynayan ilk 3 hediye alamaz)
  const shown = giftOn ? rows : rows.map((r) => ({ ...r, eligible: undefined }));
  const podium = shown.filter((r) => r.place <= 3).slice(0, 3);
  const rest = shown.filter((r) => !podium.includes(r));
  const thisMonth = period === 'this';
  const weekly = thisMonth && info?.weekly === true;

  return (
    <Screen
      title="Sıralama"
      subtitle={`${mode === 'points' ? '' : mode === 'crew' ? 'Ekipler · ' : 'Oyunlar · '}${monthTitle(thisMonth ? 0 : 1)}`}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
      backLabel="Geri"
      headerRight={
        <Pressable
          onPress={() => router.push('/oduller')}
          accessibilityRole="button"
          accessibilityLabel="Ödüller"
          testID="rank-prizes"
          style={({ pressed }) => [styles.prizeBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="gift" size={20} color="#1A1200" />
          <Text style={styles.prizeBtnText}>Ödüller</Text>
        </Pressable>
      }
      overlay={
        finalOpen ? (
          <FinalResultsSheet
            game={mode === 'games' ? game : null}
            gameTitle={GAME_TABS.find((g) => g.game === game)?.title}
            onClose={() => setFinalOpen(false)}
          />
        ) : null
      }
    >
      <Segmented<Mode>
        options={[
          { value: 'points', label: 'Genel puan' },
          { value: 'games', label: 'Oyunlar' },
          { value: 'crew', label: 'Ekip' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'crew' ? (
        <CrewBoard refreshKey={crewKey} />
      ) : mode === 'games' ? (
        <GameBoard
          game={game}
          rows={gameRows}
          loaded={gameLoaded}
          error={gameError}
          levelName={levelName}
          onChangeGame={changeGame}
          onRetry={() => void onRefresh()}
          champion={champion}
          thisMonth={thisMonth}
          weekly={weekly}
          info={info}
          titlesOn={rules.titlesEnabled > 0}
          titleMinPlays={rules.titleMinPlays}
          onMore={() => setInfoOpen(true)}
          onFinal={() => setFinalOpen(true)}
        />
      ) : (
        <>
          {/* Liste */}
          {!loaded ? (
            <Text style={styles.muted}>Sıralama yükleniyor…</Text>
          ) : error ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{error}</Text>
              <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void onRefresh()} />
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.stateBox}>
              <Ionicons name="trophy-outline" size={42} color={colors.textMuted} />
              <Text style={styles.stateTitle}>{thisMonth ? 'Tabloda henüz kimse yok' : 'Geçen ay için kayıt yok'}</Text>
              <Text style={styles.stateText}>
                {isBackendReady
                  ? thisMonth
                    ? weekly
                      ? 'Tablo her pazartesi güncellenir; bu haftaki puanlar sonraki güncellemede burada görünür.'
                      : 'Oyunlarda ve etkinliklerde puan toplandıkça liste burada oluşacak.'
                    : 'Geçen ay kimse puan kazanmamış.'
                  : 'Sunucu bağlantısı kurulunca sıralama burada görünecek.'}
              </Text>
            </View>
          ) : (
            <>
              <Podium rows={podium} />
              {rest.length > 0 ? (
                <Panel>
                  {(showAll ? rest : rest.slice(0, 2)).map((r, i) => (
                    <RankLine
                      key={`${r.place}-${r.full_name}-${i}`}
                      row={r}
                      subscribed={r.is_premium}
                      detail={levelName(r.level)}
                    />
                  ))}
                </Panel>
              ) : null}
              {rest.length > 2 ? (
                <Text
                  style={styles.moreLink}
                  onPress={() => setShowAll((v) => !v)}
                  accessibilityRole="button"
                  testID="rank-show-all"
                >
                  {showAll ? 'İlk 5’i göster' : `Tüm listeyi göster (${rows.length} kişi)`}
                </Text>
              ) : null}
            </>
          )}

          {/* Benim durumum */}
          {profile ? (
            <Text style={styles.me} testID="rank-me">
              {isModerator
                ? 'Moderatörler sıralamaya girmez.'
                : thisMonth
                  ? myStatusThisMonth(me, info)
                  : me
                    ? `Geçen ay ${fmtPts(me.points)} puanla ${me.place}. sıradaydın.`
                    : 'Geçen ay sıralamada yoktun.'}
            </Text>
          ) : null}

          {/* Güncellemeye ve sıfırlamaya kalan süre, kesinleşmiş sonuçlar */}
          <RankTimers info={info} onFinal={() => setFinalOpen(true)} onMore={() => setInfoOpen(true)} />

          {/* Hediye bilgisi: yalnızca program açık ve kural metni doluysa hediyeden söz edilir */}
          <Pressable
            onPress={() => router.push('/kurallar')}
            disabled={!giftOn}
            accessibilityRole={giftOn ? 'button' : undefined}
            accessibilityLabel={giftOn ? 'Yarışma ve hediye kuralları' : undefined}
          >
            <LinearGradient
              colors={['rgba(124, 140, 255, 0.35)', 'rgba(34, 211, 197, 0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gift}
            >
              <View style={styles.giftIcon}>
                <Ionicons name={giftOn ? 'gift' : 'refresh'} size={22} color={colors.primaryText} />
              </View>
              <View style={styles.giftText}>
                <Text style={styles.giftTitle}>{giftOn ? 'Ayın ilk 3’üne hediye' : 'Her ay sıfırlanır'}</Text>
                <Text style={styles.giftSub}>
                  {giftOn
                    ? `Ayın ilk 3'üne hediye verilir: ${contest.prizes.replace(/[.\s]+$/, '')}. Katılım ücretsizdir.`
                    : 'Sıralama her ayın başında sıfırdan başlar.'}
                </Text>
                {giftOn ? <Text style={styles.giftLink}>Yarışma ve hediye kuralları</Text> : null}
              </View>
              {giftOn ? <Ionicons name="chevron-forward" size={18} color={colors.primaryText} /> : null}
            </LinearGradient>
          </Pressable>
          <VerifyPrizeNote />

          <RealNameNotice text={REAL_NAME.leaderboard} />
          {rules.titlesEnabled > 0 ? (
            <Text style={styles.note}>Oyun şampiyonu ünvanı varsa adının yanında çıkar.</Text>
          ) : null}

          {/* Puan geçmişi */}
          {profile && !isModerator ? (
            <Panel>
              <ListRow
                icon="time"
                title="Puan geçmişim"
                value={historyOpen ? 'Gizle' : 'Göster'}
                onPress={() => {
                  const next = !historyOpen;
                  setHistoryOpen(next);
                  if (next && history === null) void loadHistory();
                }}
              />
              {historyOpen ? (
                historyError ? (
                  <ListRow title={historyError} />
                ) : history === null ? (
                  <ListRow title="Yükleniyor…" />
                ) : history.length === 0 ? (
                  <ListRow title="Henüz puan hareketin yok." />
                ) : (
                  history.map((h) => (
                    <View key={h.id} style={styles.historyRow}>
                      <View style={styles.historyText}>
                        <Text style={styles.historyReason} numberOfLines={2}>
                          {h.reason}
                        </Text>
                        <Text style={styles.historyDate}>{formatDate(h.created_at)}</Text>
                      </View>
                      <Text style={[styles.historyAmount, h.amount < 0 && styles.historyNegative]}>
                        {fmtPtsSigned(h.amount)}
                      </Text>
                    </View>
                  ))
                )
              ) : null}
            </Panel>
          ) : null}

          <PointRulesPanel showMine={Boolean(profile) && !isModerator} contestOn={giftOn} />
        </>
      )}

      <RankingInfoModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        rules={rules}
        weekly={info?.weekly === true}
      />
    </Screen>
  );
}

function RankingInfoModal({
  visible,
  onClose,
  rules,
  weekly,
}: {
  visible: boolean;
  onClose: () => void;
  rules: PointRules;
  weekly: boolean;
}) {
  const c = rankingInfoContent(rules, weekly);
  return <InfoModal visible={visible} onClose={onClose} title={c.title} icon={c.icon} items={c.items} note={c.note} />;
}

/**
 * “Bu ay” için kendi durumum. Haftalık tabloda puanlar hesaba anında yazıldığı için tablodan ayrıca söylenir:
 * “Hesabında 40 puan var; tablodaki yerin …” ya da “sonraki güncellemede tabloya girersin”.
 */
function myStatusThisMonth(me: RankRow | null, info: RankingInfo | null): string {
  if (info?.weekly) {
    if (info.myPoints <= 0 && !me) {
      return 'Bu ay henüz puan kazanmadın. Etkinliklere ve oyunlara katıldıkça listeye girersin.';
    }
    if (me) {
      return `Hesabında bu ay ${fmtPts(info.myPoints)} puan var. Tablodaki yerin ${me.place}. sıra (son güncellemeye göre ${fmtPts(me.points)} puan).`;
    }
    return `Hesabında bu ay ${info.myPoints} puan var. Tablo her pazartesi güncellenir; sonraki güncellemede listeye girersin.`;
  }
  if (me) return `Bu ay ${fmtPts(me.points)} puanla ${me.place}. sıradasın.`;
  return 'Bu ay henüz puan kazanmadın. Etkinliklere ve oyunlara katıldıkça listeye girersin.';
}

/**
 * Oyun sıralaması: bir oyun seç, o ayın en çok puan toplayanlarına bak. Çekiliş yok, para ya da hediye ödülü yok.
 * Her ay sıfırlanır; ayı 1. bitiren sonraki ay “<Oyun> Şampiyonu” ünvanını taşır.
 */
function GameBoard({
  game,
  rows,
  loaded,
  error,
  levelName,
  onChangeGame,
  onRetry,
  champion,
  thisMonth,
  weekly,
  info,
  titlesOn,
  titleMinPlays,
  onMore,
  onFinal,
}: {
  game: string;
  rows: GameRankRow[];
  loaded: boolean;
  error: string | null;
  levelName: (level: number) => string;
  onChangeGame: (game: string) => void;
  onRetry: () => void;
  champion: GameChampion | null;
  thisMonth: boolean;
  /** Bu ay tablosu haftada bir güncelleniyor mu? */
  weekly: boolean;
  info: RankingInfo | null;
  titlesOn: boolean;
  titleMinPlays: number;
  onMore: () => void;
  onFinal: () => void;
}) {
  const tab = GAME_TABS.find((g) => g.game === game) ?? GAME_TABS[0];
  const board = rows.map<BoardRow>((r) => ({
    place: r.place,
    full_name: r.full_name,
    points: r.score,
    is_me: r.is_me,
    title: r.title,
  }));
  const podium = board.filter((r) => r.place <= 3).slice(0, 3);
  const restRows = rows.filter((r) => !podium.some((p) => p.place === r.place && p.full_name === r.full_name));
  const me = rows.find((r) => r.is_me) ?? null;
  const [infoOpen, setInfoOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shownRest = showAll ? restRows : restRows.slice(0, 2);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
      >
        {GAME_TABS.map((g) => {
          const active = g.game === game;
          return (
            <Pressable
              key={g.game}
              onPress={() => onChangeGame(g.game)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Ionicons name={g.icon} size={16} color={active ? colors.primaryText : colors.textMuted} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Bilgi Yarışması kendi iki sıralamasıyla gösterilir (Solo / Hafta ve Çoklu / Ay); genel oyun tablosuyla karışmasın */}
      {game === 'quiz' ? (
        <QuizRankCard />
      ) : !loaded ? (
        <Text style={styles.muted}>Sıralama yükleniyor…</Text>
      ) : error ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={onRetry} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name={tab.icon} size={42} color={colors.textMuted} />
          <Text style={styles.stateTitle}>
            {thisMonth ? `${tab.title} için tabloda henüz kimse yok` : `${tab.title} için geçen ay kayıt yok`}
          </Text>
          <Text style={styles.stateText}>
            {thisMonth
              ? weekly
                ? 'Tablo her pazartesi güncellenir; bu haftaki oyunlar sonraki güncellemede burada görünür.'
                : 'Bu oyunu oynayanlar burada sıralanacak.'
              : 'Geçen ay bu oyundan puan kazanan olmamış.'}
          </Text>
        </View>
      ) : (
        <>
          <Podium rows={podium} unit="puan" />
          {restRows.length > 0 ? (
            <Panel>
              {shownRest.map((r, i) => (
                <RankLine
                  key={`${r.place}-${r.full_name}-${i}`}
                  row={{
                    place: r.place,
                    full_name: r.full_name,
                    points: r.score,
                    is_me: r.is_me,
                    title: r.title,
                  }}
                  subscribed={r.is_premium}
                  detail={`${levelName(r.level)} · ${r.plays} oyun, ${r.wins} galibiyet`}
                />
              ))}
            </Panel>
          ) : null}
        </>
      )}

      {game !== 'quiz' && restRows.length > 2 ? (
        <Text style={styles.moreLink} onPress={() => setShowAll((v) => !v)} accessibilityRole="button">
          {showAll ? 'İlk 5’i göster' : `Tüm listeyi göster (${rows.length} kişi)`}
        </Text>
      ) : null}
      {/* Şu anki şampiyon (geçen ayın birincisi, bu ay ünvanı taşır) */}
      {titlesOn && game !== 'quiz' ? (
        <View style={styles.champion} testID="game-champion">
          <Ionicons name="ribbon" size={22} color={MEDAL[1]} />
          <View style={styles.championText}>
            {champion ? (
              <>
                <Text style={styles.championName} numberOfLines={1}>
                  {champion.full_name}
                  {champion.is_me ? ' (sen)' : ''}
                </Text>
                <Text style={styles.championSub}>
                  {champion.label} · Son gün: {lastDayBefore(champion.valid_until)}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.championName}>{tab.title} Şampiyonu henüz yok</Text>
                <Text style={styles.championSub}>
                  Bu oyunda ayı 1. bitiren, sonraki ay “{tab.title} Şampiyonu” ünvanını taşır.
                </Text>
              </>
            )}
          </View>
        </View>
      ) : null}

      {game === 'quiz' ? null : (
        <>
          <Text style={styles.me}>
            {me
              ? `${tab.title}: ${fmtPts(me.score)} puanla ${me.place}. sıradasın (${me.plays} oyun, ${me.wins} galibiyet)${
                  weekly ? ' · son güncellemeye göre' : ''
                }.`
              : `${tab.title} oynadıkça burada sıraya girersin.`}
          </Text>

          <RankTimers info={info} onFinal={onFinal} onMore={onMore} />
          <RealNameNotice text={REAL_NAME.leaderboard} />
          <Text style={styles.note}>
            Yalnızca görseldir; para ya da hediye getirmez. Oyun puanı, o ay bu oyundan hesabına yazılan puanların
            toplamıdır.
            {titlesOn ? ` Ünvan için bu oyundan ayda en az ${titleMinPlays} puanlı oyun oynamış olmak gerekir.` : ''}
          </Text>
          <Text
            style={styles.moreLink}
            onPress={() => setInfoOpen(true)}
            accessibilityRole="button"
            testID="game-points-link"
          >
            Oyun puanı nasıl hesaplanır?
          </Text>
          <GamePointsModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
        </>
      )}
    </>
  );
}

/** İlk üç: ortada 1., solda 2., sağda 3. Basamak yüksekliği sıraya göre değişir. */
function Podium({ rows, unit = 'puan' }: { rows: BoardRow[]; unit?: string }) {
  // görsel sıra: 2. – 1. – 3.
  const order = [rows[1], rows[0], rows[2]];
  const heights: Record<number, number> = { 1: 92, 2: 68, 3: 52 };
  return (
    <View style={styles.podium} accessibilityLabel="İlk üç">
      {order.map((r, i) => {
        if (!r) return <View key={`empty-${i}`} style={styles.podiumSlot} />;
        const color = MEDAL[r.place] ?? colors.surfaceAlt;
        return (
          <View
            key={`${r.place}-${r.full_name}-${i}`}
            style={styles.podiumSlot}
            accessible
            accessibilityLabel={`${r.place}. sıra, ${r.full_name}, ${fmtPts(r.points)} ${unit}`}
          >
            <Ionicons name="trophy" size={r.place === 1 ? 26 : 20} color={color} />
            <Text style={[styles.podiumName, r.is_me && styles.podiumNameMe]} numberOfLines={2}>
              {r.full_name}
            </Text>
            <TitleBadge label={r.title} center />
            {r.eligible === false ? <Text style={styles.noPrize}>Ödül şartı eksik</Text> : null}
            <Text style={styles.podiumPoints}>
              {fmtPts(r.points)} {unit}
            </Text>
            <LinearGradient
              colors={[color, 'rgba(255,255,255,0.04)']}
              style={[styles.podiumBar, { height: heights[r.place] ?? 52 }]}
            >
              <Text style={styles.podiumPlace}>{r.place}</Text>
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

function RankLine({
  row,
  detail,
  subscribed = false,
}: {
  row: BoardRow;
  /** Rumuzun altındaki küçük açıklama (seviye adı vb.) */
  detail: string;
  subscribed?: boolean;
}) {
  return (
    <View
      style={[styles.row, row.is_me && styles.rowMe]}
      accessible
      accessibilityLabel={`${row.place}. sıra, ${row.full_name}, ${fmtPts(row.points)} puan`}
    >
      <Text style={styles.rowPlace}>{row.place}</Text>
      <View style={styles.rowBody}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {row.full_name}
          </Text>
          {row.is_me ? <Text style={styles.youTag}>Sen</Text> : null}
          {subscribed ? <Ionicons name="star" size={14} color={colors.primary} /> : null}
        </View>
        <TitleBadge label={row.title} />
        {row.eligible === false ? <Text style={styles.noPrize}>Ödül şartı eksik</Text> : null}
        <Text style={styles.level}>{detail}</Text>
      </View>
      <Text style={styles.points}>{fmtPts(row.points)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  noPrize: { color: colors.danger, fontSize: 10.5, fontFamily: fonts.semi, textAlign: 'center' },
  prizeBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFC93C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFE7A0',
  },
  prizeBtnText: { color: '#1A1200', fontFamily: fonts.extra, fontSize: 10, marginTop: -1 },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  chipTextActive: { color: colors.primaryText },
  gift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  giftIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftText: { flex: 1, gap: 2 },
  giftTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  giftSub: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  giftLink: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 12, marginTop: 2 },
  me: {
    color: colors.text,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  champion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 201, 60, 0.1)',
    borderColor: 'rgba(255, 201, 60, 0.35)',
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  championText: { flex: 1, gap: 2 },
  championName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  championSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  stateTitle: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  stateText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm },
  podiumSlot: { flex: 1, alignItems: 'center', gap: 3 },
  podiumName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, textAlign: 'center' },
  podiumNameMe: { color: colors.primary },
  podiumPoints: { color: colors.textMuted, fontSize: 12, marginBottom: 2 },
  podiumBar: {
    alignSelf: 'stretch',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  podiumPlace: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowMe: { backgroundColor: 'rgba(34, 211, 197, 0.10)' },
  rowPlace: {
    width: 28,
    color: colors.textMuted,
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700', flexShrink: 1 },
  youTag: {
    color: colors.primaryText,
    backgroundColor: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  level: { color: colors.textMuted, fontSize: 12 },
  points: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  moreLink: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  historyText: { flex: 1, gap: 2 },
  historyReason: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
  historyDate: { color: colors.textMuted, fontSize: 12 },
  historyAmount: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.md },
  historyNegative: { color: colors.danger },
});
