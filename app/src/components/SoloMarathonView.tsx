import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { JokerCard, jokerLook, QuizChest, RewardPopup } from '@/components/QuizBits';
import { CloseX } from '@/components/CloseX';
import { fmtPts } from '@/lib/labels';
import {
  CATEGORY_COLOR,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  JOKER_INFO,
  mmss,
  OPTION_COLORS,
  OPTION_LETTERS,
  soloAnswer,
  soloJoker,
  soloNote,
  soloPickChest,
  soloState,
  type JokerKind,
  type SoloState,
} from '@/lib/quiz';
import { playSound } from '@/lib/sounds';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const nowMs = () => Date.now();
const READ_LOCK_MS = 700;
const JOKERS: JokerKind[] = ['fifty', 'double', 'freeze'];

type Props = {
  runId: string;
  /** Maraton sürüyor mu (çıkarken uyarı için) */
  onLive: (live: boolean) => void;
  onLeave: () => void;
  onExit: () => void;
  onAgain: () => void;
};

/**
 * Solo Maraton: önce 3 gizli sandıktan biri seçilir (jokerler), sonra kolaydan zora 12 soru. Süre her soruda daralır.
 * Yanlış cevap ya da süre dolunca biter. 5, 8 ve 12 doğru basamakları puan getirir.
 */
export function SoloMarathonView({ runId, onLive, onLeave, onExit, onAgain }: Props) {
  const [s, setS] = useState<SoloState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(nowMs);
  const [pending, setPending] = useState<{ q: number; choice: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  /** Sandıktan çıkanlar penceresi kapatıldı mı */
  const [rewardClosed, setRewardClosed] = useState(false);
  /** Uzun basılan jokerin açıklaması */
  const [infoKind, setInfoKind] = useState<JokerKind | null>(null);
  const refresh = useRef<() => void>(() => {});
  const lastFx = useRef('');
  const endPlayed = useRef(false);
  const lastTick = useRef(-1);
  const [pop] = useState(() => new Animated.Value(0));
  /** Doğru cevapta ekranın ortasından sayaca kayan “+1” */
  const [fly] = useState(() => new Animated.Value(0));
  const [flyOn, setFlyOn] = useState(false);
  const { width: W, height: H } = useWindowDimensions();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const t0 = Date.now();
      const res = await soloState(runId);
      if (!alive) return;
      if (res.data) {
        const t1 = Date.now();
        setS(res.data);
        setOffset(Date.parse(res.data.server_now) - (t0 + t1) / 2);
        if (res.data.status !== 'playing') return; // bitti: sormayı bırak
      } else if (res.error) {
        setMsg({ text: res.error, tone: 'error' });
      }
      timer = setTimeout(() => void tick(), 900);
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
  }, [runId]);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(t);
  }, []);

  const live = s?.status === 'playing';
  useEffect(() => {
    onLive(live);
  }, [live, onLive]);

  // Doğru / yanlış anında titreşim ve küçük “pop” animasyonu
  useEffect(() => {
    if (!s?.last || (s.phase !== 'reveal' && s.phase !== 'finished')) return;
    const key = `${s.last.q}:${s.last.correct}`;
    if (lastFx.current === key) return;
    lastFx.current = key;
    void Haptics.notificationAsync(
      s.last.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    playSound(s.last.correct ? 'correct' : 'wrong');
    if (s.last.correct) {
      fly.setValue(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kısa animasyonun görünürlüğü
      setFlyOn(true);
      Animated.timing(fly, { toValue: 1, duration: 1100, useNativeDriver: true }).start(() => setFlyOn(false));
    }
  }, [s, pop, fly]);

  // Bitiş sesi: basamağa ulaştıysa zafer, yoksa üzgün
  const doneSound = s?.status === 'finished' ? (s.correct_count >= 5 ? 'win' : 'lose') : null;
  useEffect(() => {
    if (!doneSound || endPlayed.current) return;
    endPlayed.current = true;
    const t = setTimeout(() => playSound(doneSound), 700);
    return () => clearTimeout(t);
  }, [doneSound]);

  // Son 3 saniye: tik sesi
  const tickSec =
    s && s.phase === 'question' ? Math.ceil(Math.max(0, Date.parse(s.phase_ends_at) - (now + offset)) / 1000) : 0;
  useEffect(() => {
    if (tickSec < 1 || tickSec > 3 || lastTick.current === tickSec) return;
    lastTick.current = tickSec;
    playSound('tick', 0.5);
  }, [tickSec]);

  if (!s) {
    return (
      <View style={styles.center}>
        {msg ? <Text style={styles.err}>{msg.text}</Text> : <ActivityIndicator color={colors.primary} />}
        {msg ? <Text style={styles.link} onPress={onExit}>Geri dön</Text> : null}
      </View>
    );
  }

  const serverNow = now + offset;
  const startAt = Date.parse(s.phase_started_at);
  const endAt = Date.parse(s.phase_ends_at);
  const remain = Math.max(0, endAt - serverNow);
  const beforeStart = s.phase === 'question' && serverNow < startAt;
  const myChoice = pending && pending.q === s.q_index ? pending.choice : null;
  const hidden = s.q_state.hidden ?? [];
  const wrong = s.q_state.wrong ?? [];
  const used = s.q_state.used ?? [];
  const canAnswer =
    s.status === 'playing' && s.phase === 'question' && !beforeStart && serverNow - startAt >= READ_LOCK_MS && remain > 0 && !busy;

  async function pickChest(i: number) {
    if (busy || !s || s.phase !== 'chest') return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('chest');
    const res = await soloPickChest(s.id, i);
    setBusy(false);
    if (res.error) setMsg({ text: res.error, tone: 'error' });
    refresh.current();
  }

  async function answer(i: number) {
    if (!s || !canAnswer || hidden.includes(i) || wrong.includes(i)) return;
    setPending({ q: s.q_index, choice: i });
    setBusy(true);
    void Haptics.selectionAsync();
    playSound('tap', 0.6);
    const res = await soloAnswer(s.id, s.q_index, i);
    setBusy(false);
    if (res.error) {
      setPending(null);
      setMsg({ text: res.error, tone: 'error' });
    } else if (res.data?.retry) {
      setPending(null);
      setMsg({ text: 'Çift Cevap: yanlış ama bir hakkın daha var!', tone: 'info' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      setMsg(null);
    }
    refresh.current();
  }

  async function applyJoker(k: JokerKind) {
    if (!s || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSound('card');
    const res = await soloJoker(s.id, k);
    setBusy(false);
    setMsg(res.error ? { text: res.error, tone: 'error' } : { text: `${JOKER_INFO[k].label} kullanıldı!`, tone: 'info' });
    refresh.current();
  }

  const reached = [...s.milestones].reverse().find((m) => s.correct_count >= m.at) ?? null;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        {live ? (
          <Pressable onPress={onLeave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Maratonu bitir" style={styles.topBtn}>
            <CloseX size={16} />
          </Pressable>
        ) : (
          <View style={styles.topBtn} />
        )}
        <Text style={styles.topTitle}>Solo Maraton</Text>
        <View style={styles.correctChip} accessibilityLabel={`${s.correct_count} doğru`}>
          <Ionicons name="checkmark-circle" size={22} color="#0B0F1A" />
          <Text style={styles.correctText}>{s.correct_count}</Text>
          <Text style={styles.correctLabel}>doğru</Text>
        </View>
      </View>

      {s.status !== 'playing' ? (
        <Result s={s} reachedAt={reached?.at ?? null} onAgain={onAgain} onExit={onExit} />
      ) : (
      <>
      <Ladder s={s} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        {s.phase === 'chest' ? (
          <View style={styles.chestBox}>
            <Text style={styles.kicker}>MARATON ÖNCESİ</Text>
            <Text style={styles.h1}>Hazine sandığını seç</Text>
            <View style={styles.stepsBox}>
              <StepLine n={1} text="Aşağıdaki 3 sandıktan birine dokun." />
              <StepLine n={2} text="Şanslıysan içinden joker çıkar (nadir); çıkanların hepsi senin olur." />
              <StepLine n={3} text="Soru sırasında joker kartına dokunarak kullan." />
            </View>
            <View style={styles.chests}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.chestCol}>
                  <QuizChest open={false} disabled={busy} onPress={() => void pickChest(i)} label={`${i + 1}. sandık`} size={88} />
                  <Text style={styles.chestNo}>{`${i + 1}. sandık`}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.auto}>{`Seçmezsen ${mmss(remain)} sonra ilk sandık kendiliğinden açılır.`}</Text>
            <View style={styles.legendBox}>
              <Text style={styles.legendTitle}>Sandıktan çıkabilecek jokerler</Text>
              <View style={styles.legendRow}>
                {JOKERS.map((k) => (
                  <JokerCard key={k} look={jokerLook(k)} size="md" onPress={() => setInfoKind(k)} />
                ))}
              </View>
              <Text style={styles.auto}>Ne işe yaradığını görmek için karta dokun.</Text>
            </View>
          </View>
        ) : beforeStart && s.chests ? (
          <View style={styles.chestBox}>
            <Text style={styles.h1}>Sandıklar açıldı!</Text>
            <View style={styles.chests}>
              {s.chests.map((c, i) => (
                <QuizChest key={i} open contents={c} picked={i === s.chest_pick} size={80} />
              ))}
            </View>
            <Text style={styles.sub}>{`İlk soru ${Math.max(1, Math.ceil((startAt - serverNow) / 1000))} sn sonra…`}</Text>
          </View>
        ) : s.question ? (
          <>
            {/* Süre çubuğu: dondurulunca mavi */}
            <View style={styles.timer}>
              <View
                style={[
                  styles.timerFill,
                  {
                    width: `${Math.min(100, (remain / ((s.question_seconds + (s.q_state.frozen ? 15 : 0)) * 1000)) * 100)}%`,
                    backgroundColor: s.q_state.frozen ? '#5EC8FF' : remain > 6000 ? colors.success : remain > 3000 ? colors.primary : colors.danger,
                  },
                ]}
              />
            </View>
            <View style={styles.qCard}>
              <View style={styles.qMeta}>
                <View style={[styles.chip, { borderColor: CATEGORY_COLOR[s.question.category] }]}>
                  <Ionicons name={CATEGORY_ICON[s.question.category]} size={12} color={CATEGORY_COLOR[s.question.category]} />
                  <Text style={[styles.chipText, { color: CATEGORY_COLOR[s.question.category] }]}>
                    {CATEGORY_LABEL[s.question.category]}
                  </Text>
                </View>
                <View style={[styles.chip, { borderColor: DIFFICULTY_COLOR[s.question.difficulty] }]}>
                  <Text style={[styles.chipText, { color: DIFFICULTY_COLOR[s.question.difficulty] }]}>
                    {DIFFICULTY_LABEL[s.question.difficulty]}
                  </Text>
                </View>
                {s.q_state.frozen ? <Ionicons name="snow" size={16} color="#5EC8FF" /> : null}
                {s.phase === 'question' ? (
                  <Text style={styles.secs}>{`${Math.ceil(remain / 1000)} sn`}</Text>
                ) : null}
              </View>
              <Text style={styles.qText}>{s.question.text}</Text>
            </View>

            <View style={styles.options}>
              {s.question.options.map((opt, i) => {
                const reveal = s.phase === 'reveal' && s.last && s.last.q === s.q_index ? s.last : null;
                const isCorrect = reveal !== null && reveal.correct_choice === i;
                const isHidden = hidden.includes(i);
                const isWrong = wrong.includes(i);
                const isMine = myChoice === i || (reveal !== null && reveal.choice === i);
                return (
                  <Pressable
                    key={i}
                    onPress={() => void answer(i)}
                    disabled={!canAnswer || isHidden || isWrong}
                    accessibilityRole="button"
                    accessibilityLabel={`${OPTION_LETTERS[i]} şıkkı: ${opt}${isHidden ? ', elendi' : ''}`}
                    testID={`solo-option-${i}`}
                    style={({ pressed }) => [
                      styles.opt,
                      isMine && !reveal && styles.optMine,
                      isCorrect && styles.optCorrect,
                      (isHidden || isWrong) && styles.optOut,
                      pressed && styles.pressed,
                    ]}
                  >
                    {!reveal && !isHidden && !isWrong ? (
                      <LinearGradient
                        colors={OPTION_COLORS[i]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.fill, isMine ? null : styles.soft]}
                      />
                    ) : null}
                    <View style={[styles.letter, { backgroundColor: OPTION_COLORS[i][1] }]}>
                      <Text style={styles.letterText}>{OPTION_LETTERS[i]}</Text>
                    </View>
                    <Text style={[styles.optText, (isHidden || isWrong) && styles.optTextOut]}>{opt}</Text>
                    {isCorrect ? <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" /> : null}
                    {isHidden ? <Text style={styles.outTag}>elendi</Text> : null}
                    {isWrong ? <Ionicons name="close-circle" size={20} color={colors.danger} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Joker kartları: kırmızı rozet kalan hak; dokun = kullan, uzun bas = açıklama */}
            <Text style={styles.jokerTitle}>Jokerlerin</Text>
            <View style={styles.jokers}>
              {JOKERS.map((k) => {
                const n = s.jokers[k] ?? 0;
                const off = n < 1 || used.includes(k) || s.phase !== 'question' || !canAnswer;
                return (
                  <JokerCard
                    key={k}
                    look={jokerLook(k)}
                    count={n}
                    used={used.includes(k)}
                    disabled={off}
                    onPress={off ? undefined : () => void applyJoker(k)}
                    onLongPress={() => setInfoKind(k)}
                    testID={`solo-joker-${k}`}
                  />
                );
              })}
            </View>
            <Text style={styles.auto}>Kartın ne yaptığını görmek için uzun bas.</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        {msg ? <Text style={msg.tone === 'error' ? styles.err : styles.info}>{msg.text}</Text> : null}
      </ScrollView>
      </>
      )}

      {flyOn ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.goodToast,
            { top: H * 0.3 },
            {
              opacity: fly.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={30} color="#FFFFFF" />
          <View>
            <Text style={styles.goodTitle}>Doğru!</Text>
            <Text style={styles.goodSub}>{`${s.correct_count}. basamak`}</Text>
          </View>
        </Animated.View>
      ) : null}
      {flyOn ? (
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.fly,
            { top: H * 0.42, left: W / 2 - 40 },
            {
              opacity: fly.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: fly.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, W / 2 - 70] }) },
                { translateY: fly.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, -10, -H * 0.42 + 30] }) },
                { scale: fly.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.6, 1.6, 0.6] }) },
              ],
            },
          ]}
        >
          +1
        </Animated.Text>
      ) : null}

      {/* Sandık seçilince: çıkan jokerler ve ne işe yaradıkları (kapatılabilir; ilk soru gelince kendiliğinden kapanır) */}
      {beforeStart && s.chests && !rewardClosed ? (
        <RewardPopup
          title="Sandığından çıkanlar"
          emptyText="Bu sandık boş çıktı. Solo Maraton'da joker nadirdir; bilgine güven!"
          items={JOKERS.filter((k) => (s.jokers[k] ?? 0) > 0).map((k) => ({
            look: jokerLook(k),
            desc: JOKER_INFO[k].desc,
            count: s.jokers[k],
          }))}
          note={`İlk soru ${Math.max(1, Math.ceil((startAt - serverNow) / 1000))} sn sonra başlıyor`}
          onClose={() => setRewardClosed(true)}
        />
      ) : null}
      {infoKind ? (
        <RewardPopup
          title="Joker"
          items={[{ look: jokerLook(infoKind), desc: `${JOKER_INFO[infoKind].desc} Her joker bir soruda en çok bir kez kullanılır.` }]}
          onClose={() => setInfoKind(null)}
        />
      ) : null}
    </View>
  );
}

function StepLine({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepLine}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{n}</Text>
      </View>
      <Text style={styles.stepLineText}>{text}</Text>
    </View>
  );
}

/** 12 basamaklı merdiven: geçilenler dolu, şu anki parlak; 5, 8 ve 12. basamaklar puan getirir */
function Ladder({ s }: { s: SoloState }) {
  const mile = new Map(s.milestones.map((m) => [m.at, m.points]));
  return (
    <View style={styles.ladder} accessibilityLabel={`${s.correct_count} / ${s.total} doğru`}>
      {Array.from({ length: s.total }).map((_, i) => {
        const step = i + 1;
        const done = s.correct_count >= step;
        const current = s.status === 'playing' && s.phase !== 'chest' && s.q_index === i && !done;
        const pts = mile.get(step);
        return (
          <View key={i} style={styles.stepCol}>
            <View style={[styles.step, done && styles.stepDone, current && styles.stepNow, pts !== undefined && styles.stepMile]}>
              <Text style={[styles.stepText, done && styles.stepTextDone]}>{step}</Text>
            </View>
            {pts !== undefined ? <Text style={styles.stepPts}>{`+${fmtPts(pts)}`}</Text> : <Text style={styles.stepPts}> </Text>}
          </View>
        );
      })}
    </View>
  );
}

function Result({
  s,
  reachedAt,
  onAgain,
  onExit,
}: {
  s: SoloState;
  reachedAt: number | null;
  onAgain: () => void;
  onExit: () => void;
}) {
  const champion = s.correct_count >= s.total;
  const last = s.last;
  const head = champion
    ? { text: 'MARATON TAMAM!', color: colors.primary }
    : last && !last.correct && last.choice === -1
      ? { text: 'SÜRE DOLDU', color: colors.danger }
      : last && !last.correct
        ? { text: 'YANLIŞ CEVAP', color: colors.danger }
        : { text: 'MARATON BİTTİ', color: colors.text };
  const ratio = s.total > 0 ? Math.min(1, s.correct_count / s.total) : 0;
  const top = (s.week_top ?? []).slice(0, 3);
  return (
    <View style={styles.result} testID="solo-result">
      <Text style={[styles.resHead, { color: head.color }]}>{head.text}</Text>

      {/* Doğru sayısı çubuğu (5, 8, 12 basamakları işaretli) */}
      <View style={styles.resBarBox}>
        <View style={styles.resBarHead}>
          <Text style={styles.resBarValue}>{s.correct_count}</Text>
          <Text style={styles.resBarTotal}>{`/ ${s.total} doğru`}</Text>
        </View>
        <View style={styles.resTrack}>
          <LinearGradient
            colors={reachedAt ? ['#34D399', '#15996B'] : ['#7C5CFF', '#4B2FB8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.resFill, { width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }]}
          />
          {s.milestones.map((m) => (
            <View key={m.at} style={[styles.resTick, { left: `${(m.at / s.total) * 100}%` }]} />
          ))}
        </View>
        <View style={styles.resMarks}>
          {s.milestones.map((m) => (
            <Text
              key={m.at}
              style={[styles.resMark, { left: `${(m.at / s.total) * 100}%` }, s.correct_count >= m.at && styles.resMarkOn]}
            >
              {`${m.at}\n+${fmtPts(m.points)}`}
            </Text>
          ))}
        </View>
      </View>

      {s.awarded > 0 ? <Text style={styles.award}>{`+${fmtPts(s.awarded)} puan`}</Text> : null}
      <Text style={styles.note}>{soloNote(s)}</Text>

      <View style={styles.resStats}>
        <View style={styles.resStat}>
          <Ionicons name="star" size={18} color={colors.primary} />
          <Text style={styles.resStatValue}>{`${s.best_ever ?? s.correct_count} doğru`}</Text>
          <Text style={styles.resStatLabel}>En iyi koşun</Text>
        </View>
        <View style={styles.resStat}>
          <Ionicons name="podium" size={18} color={colors.primary} />
          <Text style={styles.resStatValue}>{s.week ? `${s.week.total} doğru` : '—'}</Text>
          <Text style={styles.resStatLabel}>{s.week ? `Bu hafta · ${s.week.place}. sıra` : 'Bu hafta sıralamada değilsin'}</Text>
        </View>
      </View>

      <View style={styles.resRank}>
        <Text style={styles.resRankTitle}>Solo / Hafta sıralaması</Text>
        {top.length === 0 ? (
          <Text style={styles.sub}>Bu hafta henüz sıralamaya giren yok.</Text>
        ) : (
          top.map((r) => (
            <View key={`${r.place}-${r.alias}`} style={[styles.resRankRow, r.is_me && styles.resRankMe]}>
              <Text style={[styles.resRankPlace, r.place <= 3 && { color: colors.primary }]}>{r.place}</Text>
              <Avatar index={r.avatar} size={28} />
              <Text style={styles.resRankName} numberOfLines={1}>
                {r.is_me ? `${r.alias} (sen)` : r.alias}
              </Text>
              <Text style={styles.resRankVal}>{`${r.correct} doğru`}</Text>
            </View>
          ))
        )}
        <Text style={styles.resRankNote}>Haftanın bütün doğruları toplanır; yalnızca en az 5 doğrulu koşular sayılır.</Text>
      </View>

      <Pressable onPress={onAgain} accessibilityRole="button" style={({ pressed }) => [styles.bigBtn, pressed && styles.pressed]} testID="solo-again">
        <LinearGradient colors={['#7C5CFF', '#4B2FB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
        <Ionicons name="refresh" size={20} color="#FFFFFF" />
        <Text style={styles.bigBtnText}>Tekrar oyna (1 can)</Text>
      </Pressable>
      <Pressable onPress={onExit} accessibilityRole="button" style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} testID="solo-menu">
        <Ionicons name="home" size={20} color={colors.text} />
        <Text style={styles.menuBtnText}>Menüye dön</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  soft: { opacity: 0.55 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  topBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  correctChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  correctText: { color: '#071622', fontFamily: fonts.black, fontSize: 24 },
  correctLabel: { color: '#071622', fontFamily: fonts.extra, fontSize: 11 },
  goodToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(21, 153, 107, 0.96)',
    borderWidth: 2,
    borderColor: '#34D399',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  goodTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 26 },
  goodSub: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  fly: {
    position: 'absolute',
    width: 80,
    textAlign: 'center',
    color: colors.success,
    fontFamily: fonts.black,
    fontSize: 46,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
  },
  ladder: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  stepCol: { alignItems: 'center', gap: 2 },
  step: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNow: { borderColor: colors.primary, borderWidth: 3, transform: [{ scale: 1.2 }] },
  stepMile: { borderColor: colors.primary },
  stepText: { color: colors.text, fontSize: 13, fontFamily: fonts.black },
  stepTextDone: { color: '#071622' },
  stepPts: { color: colors.primary, fontSize: 10, fontFamily: fonts.black },
  chestBox: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  h1: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22 },
  chests: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, alignItems: 'flex-start' },
  auto: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  timer: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 4 },
  qCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
  },
  qMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: fonts.extra },
  secs: { marginLeft: 'auto', color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  qText: { color: colors.text, fontFamily: fonts.extra, fontSize: 21, lineHeight: 29 },
  options: { gap: spacing.sm },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  optMine: { borderColor: '#FFFFFF' },
  optCorrect: { backgroundColor: '#15996B', borderColor: '#34D399' },
  optOut: { opacity: 0.35 },
  letter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  letterText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.sm },
  optText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.lg },
  optTextOut: { textDecorationLine: 'line-through' },
  outTag: { color: colors.textMuted, fontSize: 11 },
  jokerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, letterSpacing: 1, textAlign: 'center', marginTop: spacing.sm },
  jokers: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', paddingTop: 6 },
  kicker: { color: colors.accent, fontFamily: fonts.black, fontSize: 11, letterSpacing: 2 },
  stepsBox: {
    alignSelf: 'stretch',
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
  stepLineText: { flex: 1, color: colors.text, fontSize: fontSizes.md, lineHeight: 21 },
  chestCol: { alignItems: 'center', gap: 4 },
  chestNo: { color: colors.text, fontSize: 13, fontFamily: fonts.extra },
  legendBox: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  legendRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', paddingTop: 6 },
  result: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xxl - 4, textAlign: 'center' },
  award: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xl },
  note: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19, textAlign: 'center' },
  bigBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  bigBtnText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.lg },
  menuBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  menuBtnText: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  resHead: { fontFamily: fonts.black, fontSize: 32, letterSpacing: 1, textAlign: 'center' },
  resBarBox: { alignSelf: 'stretch', gap: 4, paddingBottom: 24 },
  resBarHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  resBarValue: { color: colors.text, fontFamily: fonts.black, fontSize: 38 },
  resBarTotal: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  resTrack: { height: 18, borderRadius: 9, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  resFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9 },
  resTick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.primary },
  resMarks: { height: 1 },
  resMark: {
    position: 'absolute',
    top: 2,
    width: 40,
    marginLeft: -20,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.extra,
    lineHeight: 13,
  },
  resMarkOn: { color: colors.success },
  resStats: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  resStat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  resStatValue: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  resStatLabel: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  resRank: { alignSelf: 'stretch', gap: 2, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  resRankTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, marginBottom: 2 },
  resRankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3, paddingHorizontal: 4, borderRadius: radii.sm },
  resRankMe: { backgroundColor: 'rgba(124, 140, 255, 0.22)' },
  resRankPlace: { width: 20, textAlign: 'center', color: colors.textMuted, fontFamily: fonts.black, fontSize: fontSizes.md },
  resRankName: { flex: 1, color: colors.text, fontSize: fontSizes.md },
  resRankVal: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  resRankNote: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  link: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: 6 },
  err: { color: colors.danger, fontSize: fontSizes.md, textAlign: 'center' },
  info: { color: colors.event, fontSize: fontSizes.md, textAlign: 'center', fontFamily: fonts.semi },
});
