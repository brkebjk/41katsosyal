import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PlayButton } from '@/components/QuizBits';
import { TextField } from '@/components/TextField';
import { CloseX } from '@/components/CloseX';
import {
  CATEGORY_COLOR,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  OPTION_COLORS,
  OPTION_LETTERS,
  sideAnswer,
  sideStart,
  sideState,
  sideVote,
  type QuizCategory,
  type SideState,
} from '@/lib/quiz';
import { playSound } from '@/lib/sounds';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const nowMs = () => Date.now();
const READ_LOCK_MS = 600;
/** Oyuncu renkleri: 1 = alttaki (turuncu), 2 = üstteki (mavi) */
const P_COLOR = { 1: '#FF8A1A', 2: '#3B82F6' } as const;
/** Üstteki oyuncunun şık renkleri (alttakinden farklı; şıkların yeri de farklı karışır) */
const P2_OPTION_COLORS: [string, string][] = [
  ['#3B82F6', '#1E40AF'],
  ['#84CC16', '#4D7C0F'],
  ['#EF4444', '#991B1B'],
  ['#06B6D4', '#0E7490'],
];

type Props = {
  /** Devam eden oyun (yoksa önce isimler sorulur) */
  gameId: string | null;
  defaultName: string;
  todayCount: number;
  dailyLimit: number;
  onGame: (id: string | null) => void;
  /** Oyun sürüyor mu (çıkarken soru sormak için) */
  onLive: (live: boolean) => void;
  onExit: () => void;
  onLeave: () => void;
};

/**
 * Yan Yana: tek telefonda 2 kişi. Ekran ikiye bölünür; üst yarı karşıda oturan oyuncu için ters çevrilir.
 * İkisi de aynı soruyu kendi yarısında cevaplar. Sorular ve doğru cevap sunucudadır. Puan vermez, can harcamaz.
 */
export function SideBySideView({
  gameId,
  defaultName,
  todayCount,
  dailyLimit,
  onGame,
  onLive,
  onExit,
  onLeave,
}: Props) {
  const [id, setId] = useState<string | null>(gameId);
  const [name1, setName1] = useState(defaultName);
  const [name2, setName2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<SideState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(nowMs);
  const [pending, setPending] = useState<{ q: number; p1: number | null; p2: number | null }>({
    q: -1,
    p1: null,
    p2: null,
  });
  const [votes, setVotes] = useState<{ r: number; p1: QuizCategory | null; p2: QuizCategory | null }>({
    r: -1,
    p1: null,
    p2: null,
  });
  const lastVote = useRef(-1);
  const refresh = useRef<() => void>(() => {});
  const lastReveal = useRef(-1);
  const lastTick = useRef(-1);
  const ended = useRef(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const t0 = Date.now();
      const res = await sideState(id);
      if (!alive) return;
      if (res.data) {
        const t1 = Date.now();
        setS(res.data);
        setOffset(Date.parse(res.data.server_now) - (t0 + t1) / 2);
        if (res.data.status !== 'playing') return;
      } else if (res.error) {
        setErr(res.error);
      }
      timer = setTimeout(() => void tick(), 700);
    };
    refresh.current = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(t);
  }, []);

  const live = !!s && s.status === 'playing';
  useEffect(() => {
    onLive(live);
  }, [live, onLive]);

  // Cevaplar açılınca ve oyun bitince ses + titreşim
  useEffect(() => {
    if (!s) return;
    if (s.phase === 'reveal' && lastReveal.current !== s.q_index) {
      lastReveal.current = s.q_index;
      const anyOk = !!(s.reveal?.['1']?.ok || s.reveal?.['2']?.ok);
      playSound(anyOk ? 'correct' : 'wrong');
      void Haptics.notificationAsync(
        anyOk ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
    }
    if (s.phase === 'vote' && lastVote.current !== s.round) {
      lastVote.current = s.round;
      playSound('card', 0.7);
    }
    if (s.status === 'finished' && !ended.current) {
      ended.current = true;
      playSound(s.score1 === s.score2 ? 'lose' : 'win');
    }
  }, [s]);

  // Son 3 saniye: tik sesi
  const serverNow = now + offset;
  const remainMs = s ? Math.max(0, Date.parse(s.phase_ends_at) - serverNow) : 0;
  const sec = Math.ceil(remainMs / 1000);
  useEffect(() => {
    if (!s || s.phase !== 'question' || sec > 3 || sec < 1 || lastTick.current === sec) return;
    if (s.answered['1'] && s.answered['2']) return;
    lastTick.current = sec;
    playSound('tick', 0.5);
  }, [s, sec]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await sideStart(name1, name2);
    setBusy(false);
    if (res.error || !res.data) return setErr(res.error ?? 'Oyun başlatılamadı.');
    playSound('start');
    ended.current = false;
    lastReveal.current = -1;
    lastVote.current = -1;
    setS(null);
    setId(res.data);
    onGame(res.data);
  }

  async function answer(player: 1 | 2, choice: number) {
    if (!s || !id) return;
    setPending((p) => ({
      q: s.q_index,
      p1: p.q === s.q_index ? p.p1 : null,
      p2: p.q === s.q_index ? p.p2 : null,
      [`p${player}`]: choice,
    }));
    playSound('tap', 0.6);
    void Haptics.selectionAsync();
    const res = await sideAnswer(id, s.q_index, player, choice);
    if (res.error) {
      setPending((p) => ({ ...p, [`p${player}`]: null }));
      setErr(res.error);
    } else setErr(null);
    refresh.current();
  }

  async function vote(player: 1 | 2, cat: QuizCategory) {
    if (!s || !id) return;
    setVotes((v) => ({
      r: s.round,
      p1: v.r === s.round ? v.p1 : null,
      p2: v.r === s.round ? v.p2 : null,
      [`p${player}`]: cat,
    }));
    playSound('tap', 0.6);
    void Haptics.selectionAsync();
    const res = await sideVote(id, player, cat);
    if (res.error) {
      setVotes((v) => ({ ...v, [`p${player}`]: null }));
      setErr(res.error);
    } else setErr(null);
    refresh.current();
  }

  // --- İsimler (başlamadan önce) ---
  if (!id) {
    const left = Math.max(0, dailyLimit - todayCount);
    return (
      <View style={styles.setup}>
        <View style={styles.setupHead}>
          <Pressable onPress={onExit} hitSlop={10} accessibilityRole="button" style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Geri</Text>
          </Pressable>
        </View>
        <PlayButton
          label="BAŞLA"
          size={130}
          disabled={busy || left < 1}
          onPress={() => void start()}
          testID="side-start"
          colors={['#5EA8FF', '#1E40AF']}
        />
        <Text style={styles.setupTitle}>Yan Yana</Text>
        <Text style={styles.setupSub}>
          Telefonu ikinizin ortasına koyun. Ekran ikiye bölünür; üst yarı karşıda oturan için ters döner. 3 raunt × 3
          soru: her raunt başında kategori seçin. Şıkların yeri ve rengi ikinizde farklıdır. Puan vermez, can harcamaz.
        </Text>
        <View style={styles.names}>
          <View style={styles.flex}>
            <TextField
              label="Alttaki oyuncu"
              value={name1}
              onChangeText={setName1}
              maxLength={14}
              placeholder="1. Oyuncu"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Üstteki oyuncu"
              value={name2}
              onChangeText={setName2}
              maxLength={14}
              placeholder="2. Oyuncu"
            />
          </View>
        </View>
        <Text style={styles.setupNote}>{`Bugün ${todayCount}/${dailyLimit} Yan Yana oyunu`}</Text>
        {err ? <Text style={styles.err}>{err}</Text> : null}
      </View>
    );
  }

  if (!s) {
    return (
      <View style={styles.center}>
        {err ? <Text style={styles.err}>{err}</Text> : <ActivityIndicator color={colors.primary} />}
        {err ? (
          <Text style={styles.link} onPress={onExit}>
            Geri dön
          </Text>
        ) : null}
      </View>
    );
  }

  const startedAt = Date.parse(s.phase_started_at);
  const canTap =
    s.status === 'playing' && s.phase === 'question' && serverNow - startedAt >= READ_LOCK_MS && remainMs > 0;
  const mine = (pl: 1 | 2): number | null => {
    if (s.reveal?.[pl] && s.reveal[pl].c >= 0) return s.reveal[pl].c;
    if (pending.q === s.q_index) return pl === 1 ? pending.p1 : pending.p2;
    return null;
  };
  const finished = s.status !== 'playing';
  const myVote = (pl: 1 | 2): QuizCategory | null => (votes.r === s.round ? (pl === 1 ? votes.p1 : votes.p2) : null);
  const canVote = s.status === 'playing' && s.phase === 'vote' && remainMs > 0;

  const half = (pl: 1 | 2) => (
    <Half
      s={s}
      player={pl}
      name={pl === 1 ? s.name1 : s.name2}
      score={pl === 1 ? s.score1 : s.score2}
      other={pl === 1 ? s.score2 : s.score1}
      correct={pl === 1 ? s.correct1 : s.correct2}
      choice={mine(pl)}
      answered={s.answered[pl]}
      canTap={canTap && !s.answered[pl] && mine(pl) === null}
      remainMs={remainMs}
      onAnswer={(i) => void answer(pl, i)}
      vote={myVote(pl)}
      voted={s.voted[pl]}
      canVote={canVote && !s.voted[pl] && myVote(pl) === null}
      onVote={(c) => void vote(pl, c)}
    />
  );

  return (
    <View style={styles.root}>
      <View style={[styles.half, styles.flip]}>{half(2)}</View>
      <View style={styles.mid}>
        <Pressable
          onPress={onLeave}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Oyunu bitir"
          style={styles.midBtn}
        >
          <CloseX size={16} />
        </Pressable>
        <View style={styles.midCenter}>
          <Text style={styles.midScore}>
            <Text style={{ color: P_COLOR[1] }}>{s.score1}</Text>
            {'  –  '}
            <Text style={{ color: P_COLOR[2] }}>{s.score2}</Text>
          </Text>
          <Text style={styles.midInfo}>
            {finished
              ? 'Oyun bitti'
              : s.phase === 'intro'
                ? 'Hazır olun!'
                : s.phase === 'vote'
                  ? `Raunt ${s.round} / ${s.rounds} · Kategori seçin`
                  : `Raunt ${s.round} · Soru ${s.q_index + 1} / ${s.total}`}
          </Text>
        </View>
        {finished ? (
          <Pressable
            onPress={() => {
              setId(null);
              setS(null);
              onGame(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Tekrar oyna"
            style={styles.midBtn}
          >
            <Ionicons name="refresh" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <Text style={styles.midSec}>{s.phase === 'question' || s.phase === 'vote' ? sec : ''}</Text>
        )}
      </View>
      <View style={styles.half}>{half(1)}</View>
      {finished ? (
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
        >
          <Ionicons name="home" size={18} color={colors.text} />
          <Text style={styles.menuText}>Menüye dön</Text>
        </Pressable>
      ) : null}
      {err && !finished ? <Text style={styles.errFloat}>{err}</Text> : null}
    </View>
  );
}

/** Bir oyuncunun yarısı: adı, skoru, süre, soru ve 2×2 şıklar; açıklamada sonuç; oyun bitince kazandın/kaybettin */
function Half({
  s,
  player,
  name,
  score,
  other,
  correct,
  choice,
  answered,
  canTap,
  remainMs,
  onAnswer,
  vote,
  voted,
  canVote,
  onVote,
}: {
  s: SideState;
  player: 1 | 2;
  name: string;
  score: number;
  other: number;
  correct: number;
  choice: number | null;
  answered: boolean;
  canTap: boolean;
  remainMs: number;
  onAnswer: (i: number) => void;
  vote: QuizCategory | null;
  voted: boolean;
  canVote: boolean;
  onVote: (c: QuizCategory) => void;
}) {
  const c = P_COLOR[player];
  const [pop] = useState(() => new Animated.Value(1));
  const reveal = s.phase === 'reveal' ? s.reveal : null;
  const my = reveal?.[player] ?? null;
  useEffect(() => {
    if (!reveal) return;
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [reveal, pop]);

  if (s.status !== 'playing') {
    const outcome = score > other ? 'KAZANDIN!' : score < other ? 'Kaybettin' : 'Berabere';
    return (
      <View style={styles.endBox}>
        <Ionicons
          name={score > other ? 'trophy' : score < other ? 'sad' : 'git-compare'}
          size={46}
          color={score > other ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.endTitle, { color: score > other ? colors.primary : colors.text }]}>{outcome}</Text>
        <Text style={styles.endSub}>{`${name} · ${score} puan · ${correct}/${s.total} doğru`}</Text>
      </View>
    );
  }

  if (s.phase === 'vote' && s.vote_options) {
    return (
      <View style={styles.halfBody}>
        <View style={styles.halfHead}>
          <View style={[styles.dot, { backgroundColor: c }]} />
          <Text style={[styles.halfName, { color: c }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.halfScore}>{score}</Text>
        </View>
        <Text style={styles.voteTitle}>{`${s.round}. raunt: kategori seç`}</Text>
        <View style={styles.voteRow}>
          {s.vote_options.map((cat) => {
            const on = vote === cat;
            const col = CATEGORY_COLOR[cat];
            return (
              <Pressable
                key={cat}
                onPress={() => onVote(cat)}
                disabled={!canVote}
                accessibilityRole="button"
                accessibilityLabel={`${name}: ${CATEGORY_LABEL[cat]} kategorisini seç`}
                style={({ pressed }) => [
                  styles.voteCard,
                  { borderColor: on ? '#FFFFFF' : col },
                  (voted || vote !== null) && !on && styles.optDim,
                  pressed && styles.pressed,
                ]}
              >
                <LinearGradient
                  colors={[col, colors.surfaceAlt]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[styles.fill, styles.soft]}
                />
                <Ionicons name={CATEGORY_ICON[cat]} size={30} color="#FFFFFF" />
                <Text style={styles.voteText} numberOfLines={1} adjustsFontSizeToFit>
                  {CATEGORY_LABEL[cat]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.wait}>
          {voted || vote !== null ? 'Seçimin alındı ✓' : 'Farklı seçerseniz kura ile biri gelir'}
        </Text>
      </View>
    );
  }

  if (s.phase === 'intro' || !s.question) {
    return (
      <View style={styles.endBox}>
        <Text style={[styles.introName, { color: c }]}>{name}</Text>
        <Text style={styles.endSub}>Soru birazdan geliyor…</Text>
      </View>
    );
  }

  const total = s.question_seconds * 1000;
  // Her oyuncunun şık sırası ve rengi farklı
  const options = player === 1 ? s.question.options : (s.question.options2 ?? s.question.options);
  const palette = player === 1 ? OPTION_COLORS : P2_OPTION_COLORS;
  const correctIdx = reveal ? (player === 1 ? reveal.correct : reveal.correct2) : undefined;
  const ratio = s.phase === 'question' ? Math.max(0, Math.min(1, remainMs / total)) : 0;
  return (
    <View style={styles.halfBody}>
      <View style={styles.halfHead}>
        <View style={[styles.dot, { backgroundColor: c }]} />
        <Text style={[styles.halfName, { color: c }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.halfScore}>{score}</Text>
        <View style={[styles.catChip, { borderColor: CATEGORY_COLOR[s.question.category] }]}>
          <Text style={[styles.catText, { color: CATEGORY_COLOR[s.question.category] }]}>
            {CATEGORY_LABEL[s.question.category]}
          </Text>
        </View>
      </View>
      <View style={styles.timer}>
        <View
          style={[styles.timerFill, { width: `${ratio * 100}%`, backgroundColor: ratio > 0.3 ? c : colors.danger }]}
        />
      </View>
      <Text style={styles.q} numberOfLines={4} adjustsFontSizeToFit>
        {s.question.text}
      </Text>
      <View style={styles.grid}>
        {options.map((opt, i) => {
          const isCorrect = correctIdx === i;
          const isMine = choice === i;
          const wrongMine = !!reveal && isMine && !isCorrect;
          return (
            <Pressable
              key={i}
              onPress={() => onAnswer(i)}
              disabled={!canTap}
              accessibilityRole="button"
              accessibilityLabel={`${name}: ${OPTION_LETTERS[i]} şıkkı ${opt}`}
              style={({ pressed }) => [
                styles.opt,
                isMine && !reveal && { borderColor: '#FFFFFF' },
                isCorrect && styles.optOk,
                wrongMine && styles.optBad,
                !!reveal && !isCorrect && !isMine && styles.optDim,
                pressed && styles.pressed,
              ]}
            >
              {!reveal ? (
                <LinearGradient
                  colors={palette[i]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.fill, isMine ? null : styles.soft]}
                />
              ) : null}
              <Text style={styles.optLetter}>{OPTION_LETTERS[i]}</Text>
              <Text style={styles.optText} numberOfLines={3} adjustsFontSizeToFit>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {reveal ? (
        <Animated.Text
          style={[styles.res, { color: my?.ok ? colors.success : colors.danger, transform: [{ scale: pop }] }]}
        >
          {my?.ok ? `Doğru! +${my.pts}` : my && my.c === -1 ? 'Süre doldu' : 'Yanlış'}
        </Animated.Text>
      ) : (
        <Text style={styles.wait}>
          {answered || choice !== null ? 'Cevabın alındı ✓' : 'Hızlı ol: kalan her saniye +10'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  soft: { opacity: 0.55 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  half: { flex: 1, padding: spacing.sm },
  flip: { transform: [{ rotate: '180deg' }] },
  halfBody: { flex: 1, gap: 6 },
  halfHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  halfName: { flexShrink: 1, fontFamily: fonts.black, fontSize: fontSizes.md },
  halfScore: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md, fontVariant: ['tabular-nums'] },
  catChip: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, borderWidth: 1 },
  catText: { fontSize: 11, fontFamily: fonts.extra },
  timer: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  timerFill: { height: 6, borderRadius: 3 },
  q: { color: colors.text, fontFamily: fonts.extra, fontSize: 17, lineHeight: 23 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: {
    width: '48.8%',
    flexGrow: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  optOk: { backgroundColor: '#15996B', borderColor: '#34D399' },
  optBad: { backgroundColor: '#B3264A', borderColor: '#FF5C7A' },
  optDim: { opacity: 0.45 },
  optLetter: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 13 },
  optText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 14 },
  voteTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md, textAlign: 'center' },
  voteRow: { flex: 1, flexDirection: 'row', gap: 6 },
  voteCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 6,
    borderRadius: radii.lg,
    borderWidth: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  voteText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 14 },
  res: { fontFamily: fonts.black, fontSize: fontSizes.lg, textAlign: 'center' },
  wait: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  mid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  midBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  midCenter: { flex: 1, alignItems: 'center' },
  midScore: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg, fontVariant: ['tabular-nums'] },
  midInfo: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  midSec: { width: 40, textAlign: 'center', color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xl },
  endBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  endTitle: { fontFamily: fonts.black, fontSize: 34 },
  endSub: { color: colors.textMuted, fontSize: fontSizes.md, textAlign: 'center' },
  introName: { fontFamily: fonts.black, fontSize: 30 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  menuText: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  errFloat: { position: 'absolute', alignSelf: 'center', top: '48%', color: colors.danger, fontSize: 12 },
  setup: { flex: 1, alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  setupHead: { alignSelf: 'stretch' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -4, paddingVertical: 4 },
  backText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  setupTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xxl },
  setupSub: { color: colors.textMuted, fontSize: fontSizes.md, lineHeight: 22, textAlign: 'center' },
  names: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  setupNote: { color: colors.textMuted, fontSize: fontSizes.sm },
  err: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  link: {
    color: colors.primary,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: 6,
  },
});
