import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuizChat } from '@/components/QuizChat';
import { JokerCard, QuizChest, RewardPopup, type CardLook } from '@/components/QuizBits';
import { CloseX } from '@/components/CloseX';
import { SoundToggle } from '@/components/SoundToggle';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import { quizCardImages } from '@/lib/images';
import { fmtPts } from '@/lib/labels';
import {
  ARENA_COLOR_KEYS,
  ARENA_COLORS,
  arenaAnswer,
  arenaKick,
  arenaNote,
  arenaOpenChest,
  arenaReady,
  arenaSetColor,
  arenaStart,
  arenaState,
  arenaUseCard,
  arenaVote,
  blockPlayer,
  onlineLeaderboard,
  CARD_INFO,
  CATEGORY_COLOR,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  colorHex,
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  OPTION_COLORS,
  OPTION_LETTERS,
  reportChatMessage,
  sendChat,
  TONE_LABEL,
  type ArenaCard,
  type ArenaEvent,
  type ArenaPlayer,
  type ArenaState,
  type CardKind,
  type ChatMsg,
  type OnlineRankRow,
  type QuizCategory,
} from '@/lib/quiz';
import { playSound } from '@/lib/sounds';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const nowMs = () => Date.now();
/** Soru göründükten sonra şıklar bu kadar ms kilitli (sunucu 0,5 sn'den hızlı cevabı kabul etmez) */
const READ_LOCK_MS = 700;
/** Maç bittikten sonra sohbet bu kadar süre açık kalır */
const CHAT_AFTER_MS = 2 * 60 * 1000;
/** Olay balonları ekranda bu kadar kalır */
const TOAST_MS = 4500;
/** Yazılan mesaj oyuncunun dairesinin üstünde bu kadar kalır */
const BUBBLE_MS = 5000;

export type ArenaLive = { live: boolean; phase: ArenaState['phase'] | null };

type Props = {
  matchId: string;
  /** Özel odada aynı kişilerden biriyle günde en çok kaç puan (bilgi yazısı) */
  groupDaily: number;
  /** Maç durumu (çıkarken doğru uyarı için) */
  onLive: (live: ArenaLive) => void;
  /** Çıkma isteği (sol üstteki çarpı) */
  onLeave: () => void;
  onExit: () => void;
  /** Yeni rastgele maç */
  onAgain: () => void;
  /** Bekleme odası dağıldı: yeniden rakip aranır */
  onRequeue: () => void;
  /** Bekleme odasından çıkarıldım (hazır demedim / bağlantım koptu) */
  onRemoved: () => void;
};

export function cardLook(k: CardKind): CardLook {
  const c = CARD_INFO[k];
  return { label: c.label, short: c.short, icon: c.icon, color: c.color, image: quizCardImages[k] };
}

type Sheet = { card: ArenaCard; mode: 'use' };
type Reward = { title: string; kind: CardKind | 'empty' | null; note?: string | null };

/**
 * Bilgi Yarışması Uzaktan (2–5 kişi): oda, giriş, kategori oylaması, sorular, kaos (sandık), ani ölüm, sonuç.
 * Sunucudan ~0,9 sn'de bir durum okunur; bütün kurallar sunucudadır.
 */
export function ArenaView({ matchId, groupDaily, onLive, onLeave, onExit, onAgain, onRequeue, onRemoved }: Props) {
  const [s, setS] = useState<ArenaState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(nowMs);
  const [pending, setPending] = useState<{ q: number; choice: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  const refresh = useRef<() => void>(() => {});
  const lastReveal = useRef('');
  const lastEvent = useRef(0);
  const lastPhase = useRef<string | null>(null);
  const requeued = useRef(false);
  const [pop] = useState(() => new Animated.Value(0));
  const onRemovedRef = useRef(onRemoved);
  useEffect(() => {
    onRemovedRef.current = onRemoved;
  }, [onRemoved]);

  // Sunucudan durum: maç sürerken ~0,9 sn'de bir; bitince sohbet için 2 dakika boyunca 2,5 sn'de bir
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let doneAt: number | null = null;
    const tick = async () => {
      const t0 = Date.now();
      const res = await arenaState(matchId);
      if (!alive) return;
      if (res.data) {
        const t1 = Date.now();
        setS(res.data);
        setOffset(Date.parse(res.data.server_now) - (t0 + t1) / 2);
        if (res.data.status !== 'playing' && doneAt === null) {
          doneAt = t1;
          setFinishedAt(t1);
        }
      } else if (res.error) {
        setErr(res.error);
        // Odadan çıkarıldıysa ya da maç silindiyse sormayı bırak
        if (res.error === 'Bu maç artık yok.') {
          if (lastPhase.current === 'ready') onRemovedRef.current();
          return;
        }
      }
      if (doneAt !== null && Date.now() - doneAt > CHAT_AFTER_MS) return;
      timer = setTimeout(() => void tick(), doneAt !== null ? 2500 : 900);
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
  }, [matchId]);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(t);
  }, []);

  const live = s?.status === 'playing' && !s.me.left;
  const phase = s?.phase ?? null;
  useEffect(() => {
    onLive({ live, phase });
    if (phase) lastPhase.current = phase;
  }, [live, phase, onLive]);

  // Aşama sesleri: maç başlıyor, kaos, ani ölüm, sonuç
  const lastPhaseSound = useRef<string | null>(null);
  const soundKey = s ? (s.status !== 'playing' ? `end:${s.me.outcome ?? ''}` : s.phase) : null;
  useEffect(() => {
    if (!soundKey || lastPhaseSound.current === soundKey) return;
    const prev = lastPhaseSound.current;
    lastPhaseSound.current = soundKey;
    if (prev === null && soundKey.startsWith('end:')) return; // bitmiş maça geri dönüldü
    if (soundKey === 'intro') playSound('start');
    else if (soundKey === 'chaos' || soundKey === 'sudden') playSound('chaos', 0.7);
    else if (soundKey === 'end:win') playSound('win');
    else if (soundKey.startsWith('end:')) playSound('lose', 0.7);
  }, [soundKey]);

  // Bekleme odası dağıldı: yeniden aramaya dön
  const requeue = s?.status === 'abandoned' && s.me.note === 'requeue';
  useEffect(() => {
    if (!requeue || requeued.current) return;
    requeued.current = true;
    onRequeue();
  }, [requeue, onRequeue]);

  // Cevaplar açılınca: titreşim ve puan balonu
  useEffect(() => {
    if (!s || (s.phase !== 'reveal' && s.phase !== 'sudden_reveal')) return;
    const key = `${s.phase}:${s.q_index}`;
    if (lastReveal.current === key) return;
    lastReveal.current = key;
    const ok = s.me.answer?.correct === true;
    void Haptics.notificationAsync(
      ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
    if (s.me.answer) playSound(ok ? 'correct' : 'wrong');
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [s, pop]);

  // Bana yönelik olaylar (puanım çalındı, bombam patladı, zarf geldi): titreşim
  useEffect(() => {
    if (!s || s.events.length === 0) return;
    const newest = s.events[s.events.length - 1].n;
    if (lastEvent.current === 0) {
      lastEvent.current = newest;
      return;
    }
    for (const e of s.events) {
      if (e.n <= lastEvent.current) continue;
      if ((e.k === 'thief' || e.k === 'trade_offer') && e.t === s.my_slot) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        playSound(e.k === 'thief' ? 'steal' : 'card');
      } else if (e.k === 'bomb') {
        if (e.a === s.my_slot) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        playSound('bomb', e.a === s.my_slot ? 0.9 : 0.5);
      } else if (e.k === 'thief' || e.k === 'freeze' || e.k === 'roulette_on') {
        playSound('card', 0.5);
      }
    }
    lastEvent.current = newest;
  }, [s]);

  // Sohbet açılınca okunmamışlar sıfırlanır. Düğmenin işleyicisi sabit kalır (sürüklerken kopmasın)
  const openChat = useCallback(() => setChatOpen(true), []);
  const theirsNow = s ? s.chat.filter((m) => !m.mine).length : 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- açık sohbette gelen mesajlar okunmuş sayılır
    if (chatOpen) setChatSeen(theirsNow);
  }, [chatOpen, theirsNow]);

  // Rakipten yeni sohbet mesajı: kısa “pıt” sesi
  const theirCount = s ? s.chat.filter((m) => !m.mine).length : 0;
  const lastTheirs = useRef(-1);
  useEffect(() => {
    if (lastTheirs.current >= 0 && theirCount > lastTheirs.current) playSound('pop', 0.6);
    lastTheirs.current = theirCount;
  }, [theirCount]);

  // Son 3 saniye (henüz cevaplamadıysam): tik sesi
  const tickSec =
    s && s.status === 'playing' && (s.phase === 'question' || s.phase === 'sudden') && !s.me.answer
      ? Math.ceil(
          Math.max(0, Date.parse(s.phase === 'question' ? s.me.deadline : s.phase_ends_at) - (now + offset)) / 1000,
        )
      : 0;
  const lastTick = useRef(-1);
  useEffect(() => {
    if (tickSec < 1 || tickSec > 3 || lastTick.current === tickSec) return;
    lastTick.current = tickSec;
    playSound('tick', 0.5);
  }, [tickSec]);

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

  const st = s;
  const serverNow = now + offset;
  const endsAt = Date.parse(st.phase_ends_at);
  const startedAt = Date.parse(st.phase_started_at);
  const remainMs = Math.max(0, endsAt - serverNow);
  const me = st.players.find((p) => p.is_me) ?? null;
  const alive = st.players.filter((p) => !p.left);
  const rivals = alive.filter((p) => !p.is_me);
  const toasts = st.events
    .filter((e) => serverNow - Date.parse(e.at) < TOAST_MS && e.k !== 'category')
    .slice(-2)
    .map((e) => ({ n: e.n, text: eventText(e, st) }))
    .filter((t): t is { n: number; text: string } => !!t.text);

  async function run<T>(
    fn: () => Promise<{ error: string | null; data?: T | null }>,
    onOk?: (data: T | null | undefined) => void,
  ) {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      setErr(null);
      onOk?.(res.data);
    }
    refresh.current();
  }

  // --- soru ---
  const inQuestion = st.phase === 'question' || st.phase === 'sudden';
  const myDeadline = st.phase === 'question' ? Date.parse(st.me.deadline) : endsAt;
  const myRemain = Math.max(0, myDeadline - serverNow);
  const canSudden = st.phase !== 'sudden' || (me?.sudden ?? false);
  const myChoice = st.me.answer?.choice ?? (pending && pending.q === st.q_index ? pending.choice : null);
  const canAnswer =
    st.status === 'playing' &&
    inQuestion &&
    canSudden &&
    !st.me.left &&
    myChoice === null &&
    serverNow - startedAt >= READ_LOCK_MS &&
    myRemain > 0;

  async function answer(i: number) {
    if (!canAnswer || st.me.hidden.includes(i)) return;
    setPending({ q: st.q_index, choice: i });
    void Haptics.selectionAsync();
    playSound('tap', 0.6);
    const res = await arenaAnswer(st.id, st.q_index, i);
    if (res.error) {
      setPending(null);
      setErr(res.error);
    } else setErr(null);
    refresh.current();
  }

  async function playCard(card: ArenaCard, target: number | null) {
    setSheet(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('card');
    await run(() => arenaUseCard(st.id, card.id, target));
  }

  async function openChest(i: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('chest');
    await run(
      () => arenaOpenChest(st.id, i),
      (d) => {
        if (!d) return;
        setReward({
          title: 'Sandığından çıkan',
          kind: d.kind,
          note: d.lost ? 'Elin dolu olduğu için bu kart kayboldu (en çok 4 kart).' : null,
        });
      },
    );
  }

  async function sendMsg(body: string): Promise<string | null> {
    const res = await sendChat(matchId, body);
    if (!res.error) refresh.current();
    return res.error;
  }

  async function report(msg: ChatMsg) {
    const reason = await showDialog<string | null>({
      title: 'Mesajı bildir',
      message: `“${msg.body}”\n\nBu mesaj moderatörlere iletilir. Gönderen, kimin bildirdiğini bilmez.`,
      icon: 'flag',
      buttons: [
        { label: 'Hakaret / taciz', value: 'Hakaret ya da taciz', style: 'primary' },
        { label: 'Cinsel içerik', value: 'Cinsel içerik', style: 'primary' },
        {
          label: 'Dolandırıcılık / kişisel bilgi',
          value: 'Dolandırıcılık ya da kişisel bilgi isteme',
          style: 'primary',
        },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    const res = await reportChatMessage(msg.id, reason);
    if (res.error) return void notify('Bildirilemedi', res.error, { icon: 'alert-circle' });
    await notify('Şikayetin alındı', 'Konu çözüldüğünde sana bildirim gelecek.', { icon: 'flag', tone: 'success' });
  }

  async function block(p: ArenaPlayer) {
    setBlockOpen(false);
    const ok = await confirmAction(
      'Oyuncuyu engelle',
      `${p.alias} ile bir daha eşleşmezsin. Akışta da onun gönderilerini görmezsin.`,
      'Engelle',
      true,
    );
    if (!ok) return;
    const res = await blockPlayer(matchId, p.slot);
    await notify(res.error ? 'Engellenemedi' : 'Engellendi', res.error ?? 'Bu kişiyle bir daha eşleşmeyeceksin.', {
      icon: res.error ? 'alert-circle' : 'checkmark-circle',
    });
  }

  const chatClosed = finishedAt !== null && now - finishedAt > CHAT_AFTER_MS;
  const finished = st.status !== 'playing';
  const theirs = st.chat.filter((m) => !m.mine).length;
  const unread = chatOpen ? 0 : Math.max(0, theirs - chatSeen);
  // Son birkaç saniyede yazılan mesajlar oyuncunun dairesinin üstünde kısa balon olarak görünür
  const bubbles: Record<number, string> = {};
  for (const m of st.chat) {
    if (serverNow - Date.parse(m.at) > BUBBLE_MS) continue;
    const p = m.mine ? me : st.players.find((x) => !x.is_me && x.alias === m.alias);
    if (p) bubbles[p.slot] = m.body;
  }
  // Giriş (geri sayım) ekranında puan şeridi yok: yalnızca katılanların avatarı ve rumuzu yan yana
  const showStrip = !finished && st.phase !== 'lobby' && st.phase !== 'ready' && st.phase !== 'intro';
  const showBar = !!me && !finished && st.phase !== 'lobby' && st.phase !== 'ready' && st.phase !== 'intro';
  const inQ = !finished && !!st.question && ['question', 'reveal', 'sudden', 'sudden_reveal'].includes(st.phase);

  return (
    <View style={styles.root}>
      {/* Üst satır: çıkış, başlık, belirgin raunt sayacı */}
      <View style={styles.top}>
        {!finished ? (
          <Pressable
            onPress={onLeave}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Çık"
            style={styles.topBtn}
          >
            <CloseX size={18} />
          </Pressable>
        ) : (
          <View style={styles.topBtn} />
        )}
        <SoundToggle />
        <Text style={styles.topTitle} numberOfLines={1}>
          {titleOf(st)}
        </Text>
        {st.round > 0 && !finished ? (
          <LinearGradient
            colors={['#7C5CFF', '#4B2FB8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roundChip}
            accessibilityLabel={`Raunt ${st.round} / ${st.rounds}`}
          >
            <Text style={styles.roundKicker}>RAUNT</Text>
            <Text style={styles.roundText}>
              {st.round}
              <Text style={styles.roundOf}>{`/${st.rounds}`}</Text>
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.topBtn} />
        )}
      </View>

      {showStrip ? <PlayersRing s={st} bubbles={bubbles} /> : null}

      {/* Olay balonları */}
      <View style={styles.toasts} pointerEvents="none">
        {toasts.map((t) => (
          <View key={t.n} style={styles.toast}>
            <Text style={styles.toastText} numberOfLines={2}>
              {t.text}
            </Text>
          </View>
        ))}
      </View>

      {inQ && st.question ? (
        // Soru ekranı kaydırmasız: her şey tek ekrana sığar
        <View style={styles.qBody}>
          {st.phase === 'sudden' || st.phase === 'sudden_reveal' ? (
            <View style={styles.sudden}>
              <Ionicons name="flash" size={18} color="#1A1200" />
              <Text style={styles.suddenText} numberOfLines={1}>
                {`ANİ ÖLÜM · ${st.players
                  .filter((p) => p.sudden)
                  .map((p) => p.alias)
                  .join(' – ')}`}
              </Text>
            </View>
          ) : null}
          {inQuestion ? <TimerBar remainMs={myRemain} totalMs={st.question_seconds * 1000} cut={st.me.cut} /> : null}
          <View style={styles.qCard}>
            <View style={styles.qMeta}>
              <Chip
                color={CATEGORY_COLOR[st.question.category]}
                icon={CATEGORY_ICON[st.question.category]}
                label={CATEGORY_LABEL[st.question.category]}
              />
              <Chip color={DIFFICULTY_COLOR[st.question.difficulty]} label={DIFFICULTY_LABEL[st.question.difficulty]} />
              {st.me.roulette ? <Chip color="#EF4444" icon="dice" label="Rulet" /> : null}
              {me?.shield ? <Chip color="#22C55E" icon="shield-checkmark" label="Kalkan" /> : null}
              {inQuestion ? <Text style={styles.secs}>{Math.ceil(myRemain / 1000)}</Text> : null}
            </View>
            <Text style={styles.qText} numberOfLines={5} adjustsFontSizeToFit minimumFontScale={0.7}>
              {st.question.text}
            </Text>
          </View>

          <View style={styles.options}>
            {st.question.options.map((opt, i) => {
              const reveal = st.reveal;
              const isCorrect = reveal !== null && reveal.correct === i;
              const isMine = myChoice === i;
              const isHidden = st.me.hidden.includes(i);
              const isWrongMine = reveal !== null && isMine && !isCorrect;
              const pickers = reveal ? reveal.answers.filter((a) => a.choice === i) : [];
              return (
                <Pressable
                  key={i}
                  onPress={() => void answer(i)}
                  disabled={!canAnswer || isHidden}
                  accessibilityRole="button"
                  accessibilityLabel={`${OPTION_LETTERS[i]} şıkkı: ${opt}${isHidden ? ', elendi' : ''}`}
                  accessibilityState={{ selected: isMine, disabled: !canAnswer || isHidden }}
                  testID={`arena-option-${i}`}
                  style={({ pressed }) => [
                    styles.opt,
                    isMine && !reveal && styles.optMine,
                    isCorrect && styles.optCorrect,
                    isWrongMine && styles.optWrong,
                    reveal !== null && !isCorrect && !isMine && styles.optDim,
                    isHidden && styles.optOut,
                    pressed && styles.pressed,
                  ]}
                >
                  {!reveal && !isHidden ? (
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
                  <Text
                    style={[styles.optText, isHidden && styles.optTextOut]}
                    numberOfLines={3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {opt}
                  </Text>
                  {isCorrect ? <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" /> : null}
                  {pickers.length > 0 ? (
                    <View style={styles.pickers}>
                      {pickers.map((a) => {
                        const p = st.players.find((x) => x.slot === a.slot);
                        return (
                          <View key={a.slot} style={[styles.pickDot, { borderColor: colorHex(p?.color) }]}>
                            <Avatar index={p?.avatar ?? 1} size={14} />
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Durum satırı */}
          {st.phase === 'reveal' || st.phase === 'sudden_reveal' ? (
            <Animated.View style={[styles.result, { transform: [{ scale: pop }] }]}>
              {st.phase === 'sudden_reveal' ? (
                <Text style={[styles.resultText, { color: colors.primary }]}>
                  {st.reveal?.winner_slot
                    ? `${st.players.find((p) => p.slot === st.reveal?.winner_slot)?.alias ?? ''} kazandı!`
                    : 'Kimse bilemedi…'}
                </Text>
              ) : st.me.answer?.correct ? (
                <Text
                  style={[styles.resultText, { color: colors.success }]}
                >{`Doğru! +${st.me.answer.points ?? 0}`}</Text>
              ) : st.me.answer && st.me.answer.choice === -1 ? (
                <Text style={[styles.resultText, { color: colors.textMuted }]}>Süre doldu</Text>
              ) : st.me.answer ? (
                <Text style={[styles.resultText, { color: colors.danger }]}>Yanlış</Text>
              ) : null}
            </Animated.View>
          ) : st.phase === 'sudden' && !canSudden ? (
            <Text style={styles.wait}>Berabere kalanlar yarışıyor…</Text>
          ) : myChoice !== null ? (
            <Text
              style={styles.wait}
            >{`Cevabın alındı · ${alive.filter((p) => p.answered).length}/${alive.length}`}</Text>
          ) : (
            <Text style={styles.wait}>Doğru = 100 + kalan saniye × 10</Text>
          )}

          {st.reveal ? <RevealTable s={st} /> : null}
          {st.phase === 'reveal' || st.phase === 'sudden_reveal' ? (
            <Text style={styles.next}>{`${nextLabel(st)} · ${Math.ceil(remainMs / 1000)} sn`}</Text>
          ) : null}

          {/* Elimdeki kartlar (soru sırasında) */}
          {st.phase === 'question' ? (
            <Hand
              cards={st.me.cards}
              used={st.me.used}
              active={!st.me.left}
              onCard={(c) => setSheet({ card: c, mode: 'use' })}
            />
          ) : null}
          {err ? <Text style={styles.err}>{err}</Text> : null}
        </View>
      ) : (
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {finished ? (
            <ResultPanel s={st} onAgain={onAgain} onExit={onExit} onBlock={() => setBlockOpen(true)} />
          ) : st.phase === 'ready' ? (
            <ReadyPanel
              s={st}
              seconds={Math.ceil(remainMs / 1000)}
              busy={busy}
              onReady={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                playSound('start', 0.6);
                void run(() => arenaReady(st.id));
              }}
              onLeave={onLeave}
            />
          ) : st.phase === 'lobby' ? (
            <LobbyPanel
              s={st}
              busy={busy}
              groupDaily={groupDaily}
              onColor={(c) => void run(() => arenaSetColor(st.id, c))}
              onKick={(slot) => void run(() => arenaKick(st.id, slot))}
              onStart={() => void run(() => arenaStart(st.id))}
              onLeave={onLeave}
            />
          ) : st.phase === 'intro' ? (
            <IntroPanel s={st} seconds={Math.ceil(remainMs / 1000)} />
          ) : st.phase === 'vote' ? (
            <VotePanel
              s={st}
              seconds={Math.ceil(remainMs / 1000)}
              busy={busy}
              onVote={(c) => {
                playSound('tap', 0.6);
                void run(() => arenaVote(st.id, c));
              }}
            />
          ) : st.phase === 'chaos' ? (
            <ChaosPanel s={st} seconds={Math.ceil(remainMs / 1000)} busy={busy} onChest={(i) => void openChest(i)} />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>
      )}

      {/* Kaos Barı: eskiden sohbetin olduğu yerde, en altta */}
      {showBar && me ? <ChaosBar value={me.bar} chaos={st.phase === 'chaos'} /> : null}

      {/* Yüzen sohbet düğmesi: sürükleyip istediğin yere koyabilirsin, dokununca sohbet açılır */}
      <ChatFab bottom={showBar ? 76 : 18} unread={unread} onPress={openChat} />

      {chatOpen ? (
        <Popup
          title="Sohbet"
          subtitle="Yalnızca rumuzlar görünür"
          icon="chatbubbles"
          onClose={() => {
            setChatSeen(st.chat.filter((m) => !m.mine).length);
            setChatOpen(false);
          }}
        >
          <QuizChat
            chat={st.chat}
            alwaysOpen
            disabledText={chatClosed ? 'Bu maçın sohbeti kapandı.' : null}
            onSend={sendMsg}
            onReport={(m) => void report(m)}
            onQuickSent={() => {
              setChatSeen(st.chat.filter((m) => !m.mine).length);
              setChatOpen(false);
            }}
          />
        </Popup>
      ) : null}

      {sheet ? (
        <CardSheet
          sheet={sheet}
          s={st}
          rivals={rivals}
          onClose={() => setSheet(null)}
          onUse={(c, t) => void playCard(c, t)}
        />
      ) : null}
      {reward ? (
        <RewardPopup
          title={reward.title}
          items={
            reward.kind && reward.kind !== 'empty'
              ? [
                  {
                    look: cardLook(reward.kind),
                    desc: CARD_INFO[reward.kind].desc,
                    tag: TONE_LABEL[CARD_INFO[reward.kind].tone],
                  },
                ]
              : []
          }
          emptyText="Sandık boş çıktı. Bir dahaki sefere!"
          note={reward.note}
          onClose={() => setReward(null)}
        />
      ) : null}
      {blockOpen ? (
        <Popup title="Bir oyuncuyu engelle" icon="hand-left" onClose={() => setBlockOpen(false)}>
          {st.players
            .filter((p) => !p.is_me)
            .map((p) => (
              <Pressable
                key={p.slot}
                onPress={() => void block(p)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
              >
                <View style={[styles.ring, { borderColor: colorHex(p.color) }]}>
                  <Avatar index={p.avatar} size={30} />
                </View>
                <Text style={styles.pickName}>{p.alias}</Text>
                <Ionicons name="ban" size={18} color={colors.danger} />
              </Pressable>
            ))}
        </Popup>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Parçalar
// ---------------------------------------------------------------------------

function titleOf(s: ArenaState): string {
  if (s.status !== 'playing') return s.status === 'abandoned' ? 'Maç kapandı' : 'Maç bitti';
  switch (s.phase) {
    case 'lobby':
      return 'Özel oda';
    case 'intro':
      return 'Maç başlıyor';
    case 'vote':
      return `Raunt ${s.round} · Kategori oylaması`;
    case 'question':
    case 'reveal':
      return `Raunt ${s.round} · Soru ${(s.q_index % 2) + 1}/2`;
    case 'chaos':
      return 'KAOS!';
    case 'sudden':
    case 'sudden_reveal':
      return 'Ani ölüm';
    default:
      return 'Uzaktan';
  }
}

function nameOf(s: ArenaState, slot: number | null): string {
  if (slot === null) return '';
  const p = s.players.find((x) => x.slot === slot);
  if (!p) return '?';
  return p.is_me ? `${p.alias} (sen)` : p.alias;
}

function cardName(k: string | null | undefined): string {
  if (!k) return '';
  if (k === 'empty') return 'boş';
  return CARD_INFO[k as CardKind]?.label ?? k;
}

/** Olay → ekrandaki kısa yazı */
function eventText(e: ArenaEvent, s: ArenaState): string | null {
  const a = nameOf(s, e.a);
  const t = nameOf(s, e.t);
  const mine = e.a === s.my_slot;
  switch (e.k) {
    case 'roulette_on':
      return `${a} Rus Ruleti çekti! 🎲`;
    case 'roulette_win':
      return `${a} Rus Ruletini kazandı: +${e.v} 🎉`;
    case 'roulette_lose':
      return `${a} Rus Ruletinde ${e.v} puan kaybetti 💥`;
    case 'shield':
      return `${a} kalkanını açtı 🛡️`;
    case 'freeze':
      return e.v ? `${a} süreleri dondurdu! ${e.v} kişi −3 sn ❄️` : `${a} Süre Dondurma kullandı ama kimseye işlemedi`;
    case 'thief':
      return e.t === s.my_slot ? `${a} senden ${e.v} puan çaldı! 🦹` : `${a}, ${t} oyuncusundan ${e.v} puan çaldı 🦹`;
    case 'thief_blocked':
      return `${t} kalkanıyla ${a} hırsızını durdurdu 🛡️`;
    case 'chest':
      return mine ? (e.c ? `Sandığından: ${cardName(e.c)} 🎁` : null) : `${a} bir sandık açtı 🎁`;
    case 'bomb':
      return `💣 ${a} elindeki bomba patladı: −${e.v}`;
    case 'trade_offer':
      return e.t === s.my_slot ? `${a} sana kapalı zarf uzattı 🦈` : `${a}, ${t} oyuncusuna kapalı zarf uzattı 🦈`;
    case 'trade':
      if (mine) return `Takas oldu: ${cardName(e.c)} verdin${e.c2 ? `, ${cardName(e.c2)} aldın` : ''} 🦈`;
      if (e.t === s.my_slot) return `Zarftan ${cardName(e.c)} çıktı${e.c2 ? `; ${cardName(e.c2)} verdin` : ''} 🦈`;
      return `${a} ile ${t} takas yaptı 🦈`;
    case 'trade_declined':
      return `${t} zarfı geri çevirdi`;
    case 'left':
      return `${a} maçtan ayrıldı`;
    case 'sudden':
      return 'Ani ölüm! En hızlı doğru cevap kazanır ⚡';
    default:
      return null;
  }
}

function Chip({
  color,
  label,
  icon,
}: {
  color: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function TimerBar({ remainMs, totalMs, cut }: { remainMs: number; totalMs: number; cut: number }) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainMs / totalMs)) : 0;
  const color = ratio > 0.5 ? colors.success : ratio > 0.25 ? colors.primary : colors.danger;
  return (
    <View style={styles.timerRow}>
      <View style={styles.timer} accessibilityLabel={`Kalan süre ${Math.ceil(remainMs / 1000)} saniye`}>
        <View style={[styles.timerFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
      {cut > 0 ? (
        <View style={styles.cut}>
          <Ionicons name="snow" size={12} color="#5EC8FF" />
          <Text style={styles.cutText}>{`−${cut} sn`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Sürüklenebilir yüzen sohbet düğmesi (az kaydırma dokunma sayılır) */
function ChatFab({ bottom, unread, onPress }: { bottom: number; unread: number; onPress: () => void }) {
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Önceki konum ofset olarak saklanır; sürükleme ona eklenir
        onPanResponderGrant: () => pos.extractOffset(),
        onPanResponderMove: (_e, g) => pos.setValue({ x: g.dx, y: g.dy }),
        onPanResponderRelease: (_e, g) => {
          pos.flattenOffset();
          if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) onPress();
        },
        onPanResponderTerminate: () => pos.flattenOffset(),
      }),
    [pos, onPress],
  );
  return (
    <Animated.View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Sohbet, ${unread} yeni mesaj` : 'Sohbet'}
      accessibilityHint="Dokununca sohbet açılır; sürükleyerek yerini değiştirebilirsin"
      testID="arena-chat-btn"
      style={[styles.chatFab, { bottom, transform: pos.getTranslateTransform() }]}
    >
      <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      {unread > 0 ? (
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Üstte oyuncular: daire avatar, puan dairenin üstünde; son mesaj kısa balon olarak en üstte */
function PlayersRing({ s, bubbles }: { s: ArenaState; bubbles: Record<number, string> }) {
  const showAnswered = s.phase === 'question' || s.phase === 'sudden';
  const size = s.players.length >= 5 ? 40 : 46;
  return (
    <View style={styles.strip}>
      {s.players.map((p) => {
        const c = colorHex(p.color);
        const say = bubbles[p.slot];
        return (
          <View key={p.slot} style={[styles.pCol, p.left && styles.pLeft]}>
            {say ? (
              <View style={[styles.say, { borderColor: c }]} pointerEvents="none">
                <Text style={styles.sayText} numberOfLines={2}>
                  {say}
                </Text>
                <View style={[styles.sayTail, { borderTopColor: c }]} />
              </View>
            ) : null}
            <Text style={[styles.pScore, p.is_me && { color: c }]}>{p.left ? '—' : p.score}</Text>
            <View>
              <View style={[styles.pCircle, { borderColor: c, borderWidth: p.is_me ? 3.5 : 2.5 }]}>
                <Avatar index={p.avatar} size={size} />
              </View>
              {showAnswered && p.answered ? (
                <View style={styles.tick}>
                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                </View>
              ) : null}
              {p.shield ? (
                <View style={styles.shieldDot}>
                  <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                </View>
              ) : null}
              {p.cards > 0 ? (
                <View style={styles.cardsDot}>
                  <Text style={styles.cardsDotText}>{p.cards}</Text>
                </View>
              ) : null}
              {p.bar >= 100 && !p.is_me ? (
                <View style={styles.flameDot}>
                  <Ionicons name="flame" size={10} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.pName, p.is_me && { color: c }]} numberOfLines={1}>
              {p.is_me ? 'Sen' : p.alias}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Hand({
  cards,
  used,
  active,
  onCard,
}: {
  cards: ArenaCard[];
  used: CardKind[];
  active: boolean;
  onCard: (c: ArenaCard) => void;
}) {
  if (cards.length === 0) {
    return <Text style={styles.handEmpty}>Kartın yok · Kaos Barını doldur, sandık aç!</Text>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.handScroll}
      contentContainerStyle={styles.hand}
    >
      {cards.map((c) => (
        <JokerCard
          key={c.id}
          look={cardLook(c.k)}
          size="sm"
          used={used.includes(c.k)}
          disabled={!active || c.k === 'bomb'}
          onPress={() => onCard(c)}
          testID={`arena-card-${c.k}`}
        />
      ))}
    </ScrollView>
  );
}

/** Sıradaki aşamanın adı (açıklama ekranında geri sayımla) */
function nextLabel(s: ArenaState): string {
  if (s.phase === 'sudden_reveal') return s.reveal?.winner_slot ? 'Sonuçlar geliyor' : 'Yeni ani ölüm sorusu';
  if (s.q_index % 2 === 0) return 'Sıradaki: 2. soru';
  if (s.round >= s.rounds) return 'Sıradaki: sonuç';
  return 'Sıradaki: KAOS';
}

/** Benim Kaos Barım: en altta, büyük ve yüzdeli; dolunca parlar */
function ChaosBar({ value, chaos }: { value: number; chaos: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const full = v >= 100;
  return (
    <View style={[styles.cbWrap, full && styles.cbFull]} accessibilityLabel={`Kaos Barı yüzde ${v}`}>
      <View style={styles.cbHead}>
        <Ionicons name="flame" size={18} color={full ? '#FFB020' : '#FF6A1A'} />
        <Text style={styles.cbLabel}>KAOS BARIN</Text>
        <Text style={styles.cbHint} numberOfLines={1}>
          {full ? (chaos ? 'Sandığını seç!' : 'DOLU! Kaosta sandık açacaksın') : 'Doğru + hızlı cevap doldurur'}
        </Text>
        <Text style={[styles.cbValue, full && { color: '#FFB020' }]}>{`%${v}`}</Text>
      </View>
      <View style={styles.cbTrack}>
        <LinearGradient
          colors={full ? ['#FFB020', '#FF3B3B'] : ['#7C5CFF', '#FF6A1A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.cbFill, { width: `${Math.max(v, v > 0 ? 3 : 0)}%` }]}
        />
        {[25, 50, 75].map((t) => (
          <View key={t} style={[styles.cbTick, { left: `${t}%` }]} />
        ))}
      </View>
    </View>
  );
}

/** Rastgele eşleşme bekleme odası: oyuncular, “Hazırım”, geri sayım */
function ReadyPanel({
  s,
  seconds,
  busy,
  onReady,
  onLeave,
}: {
  s: ArenaState;
  seconds: number;
  busy: boolean;
  onReady: () => void;
  onLeave: () => void;
}) {
  const me = s.players.find((p) => p.is_me);
  const readyCount = s.players.filter((p) => p.ready).length;
  const need = s.ready_need ?? 2;
  return (
    <View style={styles.readyBox}>
      <Text style={styles.h1}>Rakipler bulundu!</Text>
      <Text style={styles.sub}>
        {s.players.length >= 5
          ? '5 kişi oldu, maç başlıyor…'
          : `${need} kişi hazır olunca odadaki herkesle maç başlar. 5 kişi olursa hemen başlar.`}
      </Text>
      <View style={styles.readySeats}>
        {Array.from({ length: 5 }).map((_, i) => {
          const p = s.players[i];
          return (
            <View key={i} style={styles.readySeat}>
              {p ? (
                <>
                  <View style={[styles.ringBig, { borderColor: colorHex(p.color) }]}>
                    <Avatar index={p.avatar} size={46} />
                  </View>
                  {p.ready ? (
                    <View style={styles.readyTick}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  ) : null}
                  <Text style={styles.readyName} numberOfLines={1}>
                    {p.is_me ? 'Sen' : p.alias}
                  </Text>
                  <Text style={[styles.readyState, p.ready && { color: colors.success }]}>
                    {p.ready ? 'Hazır' : 'Bekliyor'}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.emptySeat}>
                    <Ionicons name="person-add" size={20} color={colors.textMuted} />
                  </View>
                  <Text style={styles.readyName}>Boş</Text>
                </>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.readyCount}>{`${readyCount} / ${need} hazır · ${Math.max(0, seconds)} sn`}</Text>
      {me?.ready ? (
        <Text style={styles.readyDone}>Hazırsın! Diğerleri bekleniyor…</Text>
      ) : (
        <Pressable
          onPress={onReady}
          disabled={busy}
          accessibilityRole="button"
          testID="arena-ready"
          style={({ pressed }) => [styles.readyBtn, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={['#34D399', '#15996B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fill}
          />
          <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
          <Text style={styles.readyBtnText}>Hazırım</Text>
        </Pressable>
      )}
      <Text style={styles.small}>
        Maç başlayınca herkesten 1 can harcanır. Süre dolduğunda hazır demeyenler odadan çıkarılır.
      </Text>
      <Text style={styles.link} onPress={onLeave}>
        Vazgeç
      </Text>
    </View>
  );
}

/** Cevaplar açılınca: herkesin doğru/yanlışı ve aldığı puan (yan yana küçük kutular) */
function RevealTable({ s }: { s: ArenaState }) {
  const rows = (s.reveal?.answers ?? [])
    .map((a) => ({ a, p: s.players.find((x) => x.slot === a.slot) }))
    .filter((r) => r.p)
    .sort((x, y) => y.a.points - x.a.points || x.a.ms - y.a.ms);
  return (
    <View style={styles.revealBox}>
      {rows.map(({ a, p }) => (
        <View
          key={a.slot}
          style={[styles.revealChip, { borderColor: colorHex(p?.color) }, p?.is_me && styles.revealMe]}
        >
          <Avatar index={p?.avatar ?? 1} size={20} />
          <Text style={styles.revealName} numberOfLines={1}>
            {p?.is_me ? 'Sen' : p?.alias}
          </Text>
          <Ionicons
            name={a.correct ? 'checkmark-circle' : a.choice === -1 ? 'time' : 'close-circle'}
            size={16}
            color={a.correct ? colors.success : a.choice === -1 ? colors.textMuted : colors.danger}
          />
          <Text style={[styles.revealPts, a.points > 0 && { color: colors.success }]}>
            {a.points > 0 ? `+${a.points}` : '0'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LobbyPanel({
  s,
  busy,
  groupDaily,
  onColor,
  onKick,
  onStart,
  onLeave,
}: {
  s: ArenaState;
  busy: boolean;
  groupDaily: number;
  onColor: (c: (typeof ARENA_COLOR_KEYS)[number]) => void;
  onKick: (slot: number) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const host = s.players.find((p) => p.is_host);
  const amHost = host?.is_me ?? false;
  const mine = s.players.find((p) => p.is_me)?.color ?? null;
  return (
    <>
      <LinearGradient
        colors={['#3B1F8F', '#1C1640']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.codeCard}
      >
        <Text style={styles.kicker}>ODA KODU</Text>
        <Text style={styles.code} selectable testID="arena-code">
          {s.code}
        </Text>
        <Text style={styles.codeSub}>Arkadaşların Bilgi Yarışması → Uzaktan → “Koda katıl” ile bu kodu yazsın.</Text>
      </LinearGradient>

      <Text style={styles.section}>{`Oyuncular (${s.players.length}/5)`}</Text>
      {s.players.map((p) => (
        <View key={p.slot} style={styles.lobbyRow}>
          <View style={[styles.ring, { borderColor: colorHex(p.color) }]}>
            <Avatar index={p.avatar} size={32} />
          </View>
          <Text style={styles.lobbyName} numberOfLines={1}>
            {p.is_me ? `${p.alias} (sen)` : p.alias}
          </Text>
          {p.is_host ? (
            <View style={styles.hostTag}>
              <Ionicons name="star" size={11} color="#1A1200" />
              <Text style={styles.hostText}>Kurucu</Text>
            </View>
          ) : null}
          {amHost && !p.is_me ? (
            <Pressable
              onPress={() => onKick(p.slot)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${p.alias} odadan çıkar`}
            >
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}

      <Text style={styles.section}>Rengini seç</Text>
      <View style={styles.colors}>
        {ARENA_COLOR_KEYS.map((c) => {
          const taken = s.players.some((p) => !p.is_me && p.color === c);
          const isMine = mine === c;
          return (
            <Pressable
              key={c}
              onPress={() => onColor(c)}
              disabled={taken || isMine || busy}
              accessibilityRole="button"
              accessibilityLabel={`${ARENA_COLORS[c].label}${taken ? ', başkası seçti' : ''}`}
              accessibilityState={{ selected: isMine, disabled: taken }}
              style={[
                styles.colorDot,
                { backgroundColor: ARENA_COLORS[c].hex },
                isMine && styles.colorMine,
                taken && styles.colorTaken,
              ]}
            >
              {isMine ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
      </View>

      {amHost ? (
        <PrimaryButton
          label={
            s.players.length < 2 ? 'En az 2 kişi gerekli' : `Maçı başlat (${s.players.length} kişi · herkesten 1 can)`
          }
          onPress={onStart}
          disabled={s.players.length < 2}
          loading={busy}
          testID="arena-start"
        />
      ) : (
        <Text style={styles.waitHost}>Kurucunun maçı başlatması bekleniyor…</Text>
      )}
      <Text style={styles.small}>
        {`Özel odada da kazanan puan alır; ancak aynı kişilerden biriyle oynanan maçlardan günde en çok ${groupDaily} puan yazılır.`}
      </Text>
      <Text style={styles.link} onPress={onLeave}>
        {amHost ? 'Odayı kapat' : 'Odadan çık'}
      </Text>
    </>
  );
}

function IntroPanel({ s, seconds }: { s: ArenaState; seconds: number }) {
  return (
    <View style={styles.intro}>
      <View style={styles.introRow}>
        {s.players.map((p) => (
          <View key={p.slot} style={styles.introCol}>
            <View style={[styles.ringBig, { borderColor: colorHex(p.color) }]}>
              <Avatar index={p.avatar} size={52} />
            </View>
            <Text style={styles.introName} numberOfLines={1}>
              {p.is_me ? 'Sen' : p.alias}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.countdown}>{Math.max(1, seconds)}</Text>
      <Text style={styles.introWarn}>Şimdi vazgeçersen canın geri verilir. Maç başladıktan sonra çıkan kaybeder.</Text>
    </View>
  );
}

function VotePanel({
  s,
  seconds,
  busy,
  onVote,
}: {
  s: ArenaState;
  seconds: number;
  busy: boolean;
  onVote: (c: QuizCategory) => void;
}) {
  const opts = s.vote?.options ?? [];
  return (
    <View style={styles.vote}>
      <Text style={styles.voteRound}>{`${s.round}. RAUNT`}</Text>
      <Text style={styles.h1}>Kategori seç</Text>
      <Text style={styles.sub}>{`En çok oy alan gelir · ${Math.max(0, seconds)} sn`}</Text>
      <View style={styles.voteRow}>
        {opts.map((c) => {
          const n = s.vote?.counts[c] ?? 0;
          const mine = s.me.vote === c;
          const col = CATEGORY_COLOR[c];
          return (
            <Pressable
              key={c}
              onPress={() => onVote(c)}
              disabled={busy || s.me.left}
              accessibilityRole="button"
              accessibilityLabel={`${CATEGORY_LABEL[c]}, ${n} oy`}
              accessibilityState={{ selected: mine }}
              testID={`arena-vote-${c}`}
              style={({ pressed }) => [
                styles.voteCard,
                { borderColor: mine ? '#FFFFFF' : col },
                mine && styles.voteCardOn,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={[`${col}66`, 'rgba(20,26,43,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.fill}
              />
              <View style={[styles.voteIcon, { backgroundColor: `${col}40` }]}>
                <Ionicons name={CATEGORY_ICON[c]} size={30} color="#FFFFFF" />
              </View>
              <Text style={styles.voteLabel} numberOfLines={1} adjustsFontSizeToFit>
                {CATEGORY_LABEL[c]}
              </Text>
              <View style={styles.voteCount}>
                {n === 0 ? <Text style={styles.voteZero}>0 oy</Text> : null}
                {Array.from({ length: n }).map((_, i) => (
                  <View key={i} style={[styles.voteDot, { backgroundColor: col }]} />
                ))}
              </View>
              {mine ? (
                <View style={styles.voteMine}>
                  <Ionicons name="checkmark" size={14} color="#0B0F1A" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChaosPanel({
  s,
  seconds,
  busy,
  onChest,
}: {
  s: ArenaState;
  seconds: number;
  busy: boolean;
  onChest: (i: number) => void;
}) {
  const me = s.players.find((p) => p.is_me);
  const res = s.me.chest_result ? s.me.chest_result.split(':')[0] : null;
  return (
    <View style={styles.chaos}>
      <LinearGradient
        colors={['#FF6A1A', '#B3264A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.chaosHead}
      >
        <Ionicons name="flame" size={24} color="#FFFFFF" />
        <Text style={styles.chaosTitle}>KAOS!</Text>
        <Text style={styles.chaosTime}>{Math.max(0, seconds)}</Text>
      </LinearGradient>
      {s.me.chest === 'eligible' ? (
        <View style={styles.chestArea}>
          <Text style={styles.h2}>Barın doldu! Bir sandık seç</Text>
          <View style={styles.chests4}>
            {[0, 1, 2, 3].map((i) => (
              <QuizChest key={i} open={false} disabled={busy} onPress={() => onChest(i)} size={68} label={`${i + 1}`} />
            ))}
          </View>
          <Text style={styles.small}>Joker ya da boş · Seçmezsen rastgele açılır</Text>
        </View>
      ) : s.me.chest === 'picked' || res ? (
        <View style={styles.chestArea}>
          <Text style={styles.h2}>{res === 'empty' ? 'Sandık boş çıktı' : `Çıkan: ${res ? cardName(res) : ''}`}</Text>
          {res && res !== 'empty' ? <JokerCard look={cardLook(res as CardKind)} size="sm" /> : null}
          <Text style={styles.small}>Diğerleri sandığını açıyor…</Text>
        </View>
      ) : (
        <Text
          style={styles.sub}
        >{`Barın %${Math.min(100, me?.bar ?? 0)} · bu kez sandık yok. Diğerleri sandık açıyor…`}</Text>
      )}
    </View>
  );
}

function CardSheet({
  sheet,
  s,
  rivals,
  onClose,
  onUse,
}: {
  sheet: Sheet;
  s: ArenaState;
  rivals: ArenaPlayer[];
  onClose: () => void;
  onUse: (c: ArenaCard, target: number | null) => void;
}) {
  const info = CARD_INFO[sheet.card.k];
  const used = s.me.used.includes(sheet.card.k);
  const answered = s.me.answer !== null;
  const blockedByAnswer = (sheet.card.k === 'roulette' || sheet.card.k === 'fifty') && answered;
  const usable = sheet.mode === 'use' && s.phase === 'question' && !used && !blockedByAnswer && sheet.card.k !== 'bomb';
  const needsTarget = sheet.card.k === 'thief';
  return (
    <Popup title={info.label} subtitle={TONE_LABEL[info.tone]} icon="sparkles" onClose={onClose}>
      <View style={styles.sheetTop}>
        <JokerCard look={cardLook(sheet.card.k)} size="md" />
        <Text style={styles.sheetDesc}>{info.desc}</Text>
      </View>
      {sheet.card.k === 'bomb' ? (
        <Text style={styles.sheetNote}>Bomba artık oyunda yok; maç sonunda kendiliğinden kalkar.</Text>
      ) : used ? (
        <Text style={styles.sheetNote}>Bu kart türünü bu soruda zaten kullandın.</Text>
      ) : blockedByAnswer ? (
        <Text style={styles.sheetNote}>Bu kart cevap vermeden önce kullanılır.</Text>
      ) : null}
      {usable && needsTarget ? (
        <>
          <Text style={styles.sheetLabel}>Kimden çalacaksın?</Text>
          {rivals.map((p) => (
            <Pressable
              key={p.slot}
              onPress={() => onUse(sheet.card, p.slot)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
            >
              <View style={[styles.ring, { borderColor: colorHex(p.color) }]}>
                <Avatar index={p.avatar} size={30} />
              </View>
              <Text style={styles.pickName}>{p.alias}</Text>
              {p.shield ? <Ionicons name="shield-checkmark" size={16} color="#22C55E" /> : null}
              <Text style={styles.pickScore}>{p.score}</Text>
            </Pressable>
          ))}
        </>
      ) : usable ? (
        <PrimaryButton label={`${info.label} kullan`} onPress={() => onUse(sheet.card, null)} />
      ) : null}
    </Popup>
  );
}

const MEDAL = ['#FFD54A', '#C9D3E0', '#E0915A'];

function ResultPanel({
  s,
  onAgain,
  onExit,
  onBlock,
}: {
  s: ArenaState;
  onAgain: () => void;
  onExit: () => void;
  onBlock: () => void;
}) {
  const [top, setTop] = useState<OnlineRankRow[] | null>(null);
  const done = s.status === 'finished';
  useEffect(() => {
    if (!done) return;
    let alive = true;
    // Puanlar maç bitince yazılır; sıralamayı biraz sonra oku
    const t = setTimeout(() => {
      void onlineLeaderboard(0).then((r) => {
        if (alive) setTop(r.data.slice(0, 3));
      });
    }, 800);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [done]);

  const o = s.me.outcome;
  const head =
    s.status === 'abandoned'
      ? {
          icon: 'pause-circle' as const,
          grad: ['#4B5563', '#1F2937'] as [string, string],
          color: colors.textMuted,
          title: s.me.note === 'closed' ? 'ODA KAPANDI' : 'MAÇ SAYILMADI',
        }
      : o === 'win'
        ? {
            icon: 'trophy' as const,
            grad: ['#FFD54A', '#FF7A1A'] as [string, string],
            color: colors.primary,
            title: 'KAZANDIN!',
          }
        : o === 'draw'
          ? {
              icon: 'git-compare' as const,
              grad: ['#5EA8FF', '#1E40AF'] as [string, string],
              color: colors.event,
              title: 'BERABERE',
            }
          : {
              icon: 'medal' as const,
              grad: ['#9B7BFF', '#4B2FB8'] as [string, string],
              color: colors.text,
              title: s.me.place ? `${s.me.place}. OLDUN` : 'KAYBETTİN',
            };
  const ranked = [...s.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const note = arenaNote(s);
  return (
    <View style={styles.resultWrap} testID="arena-result">
      <LinearGradient colors={head.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resultHero}>
        <View style={styles.resultIcon}>
          <Ionicons name={head.icon} size={44} color="#FFFFFF" />
        </View>
        <Text style={styles.resultTitle}>{head.title}</Text>
        {done ? (
          s.me.awarded > 0 ? (
            <Text style={styles.award} accessibilityLabel={`${fmtPts(s.me.awarded)} genel puan kazandın`}>
              {`+${fmtPts(s.me.awarded)} PUAN`}
            </Text>
          ) : (
            <Text style={styles.awardNone}>BU MAÇTAN PUAN YOK</Text>
          )
        ) : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </LinearGradient>

      {done ? (
        <View style={styles.standings}>
          {ranked.map((p) => (
            <View key={p.slot} style={[styles.standRow, p.is_me && styles.standMe]}>
              <Text style={[styles.standPlace, p.place && p.place <= 3 ? { color: MEDAL[p.place - 1] } : null]}>
                {p.place ?? '-'}
              </Text>
              <View style={[styles.ring, { borderColor: colorHex(p.color) }]}>
                <Avatar index={p.avatar} size={28} />
              </View>
              <Text style={styles.standName} numberOfLines={1}>
                {p.is_me ? 'Sen' : p.alias}
                {p.left ? ' · ayrıldı' : ''}
              </Text>
              <Text style={styles.standCorrect}>{`${p.correct} ✓`}</Text>
              <Text style={styles.standScore}>{p.score}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {done ? (
        <View style={styles.monthBox}>
          <View style={styles.monthHead}>
            <Ionicons name="podium" size={16} color={colors.primary} />
            <Text style={styles.monthTitle}>Bu ayın Çoklu sıralaması</Text>
          </View>
          {top === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : top.length === 0 ? (
            <Text style={styles.small}>Bu ay henüz sıralamada kimse yok.</Text>
          ) : (
            top.map((r) => (
              <View key={r.place} style={[styles.monthRow, r.is_me && styles.standMe]}>
                <View style={[styles.medal, { backgroundColor: MEDAL[r.place - 1] ?? colors.surfaceAlt }]}>
                  <Text style={styles.medalText}>{r.place}</Text>
                </View>
                <Avatar index={r.avatar} size={26} />
                <Text style={styles.standName} numberOfLines={1}>
                  {r.is_me ? `${r.alias} (sen)` : r.alias}
                </Text>
                <Text style={styles.monthPts}>{`${fmtPts(r.points)} p`}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      <View style={styles.resultBtns}>
        {!s.is_private ? (
          <Pressable
            onPress={onAgain}
            accessibilityRole="button"
            style={({ pressed }) => [styles.bigBtn, pressed && styles.pressed]}
            testID="arena-again"
          >
            <LinearGradient
              colors={['#FFB020', '#FF7A1A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fill}
            />
            <Ionicons name="people" size={20} color="#1A1200" />
            <Text style={styles.bigBtnText}>Yeni maç bul (1 can)</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          testID="arena-menu"
        >
          <Ionicons name="home" size={18} color={colors.text} />
          <Text style={styles.menuText}>Menüye dön</Text>
        </Pressable>
        {s.players.length > 1 && done ? (
          <Text style={styles.linkMuted} onPress={onBlock}>
            Bir oyuncuyla bir daha eşleşme
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  // Altta yüzen sohbet düğmesine yer kalsın
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 88 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  soft: { opacity: 0.55 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  topBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  roundChip: { minWidth: 58, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.md, alignItems: 'center' },
  roundKicker: { color: '#E9E3FF', fontFamily: fonts.black, fontSize: 9, letterSpacing: 1.5 },
  roundText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 20, lineHeight: 23 },
  roundOf: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
    zIndex: 5,
  },
  pCol: { flex: 1, maxWidth: 84, alignItems: 'center', gap: 2 },
  pCircle: { borderRadius: 999, padding: 2 },
  say: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 4,
    alignSelf: 'center',
    minWidth: 54,
    maxWidth: 140,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#F4F6FB',
    zIndex: 10,
  },
  sayText: { color: '#071622', fontSize: 14, lineHeight: 17, fontFamily: fonts.extra, textAlign: 'center' },
  sayTail: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  flameDot: {
    position: 'absolute',
    left: -4,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF6A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pLeft: { opacity: 0.4 },
  ring: { borderWidth: 2, borderRadius: 999, padding: 1 },
  ringBig: { borderWidth: 3, borderRadius: 999, padding: 2 },
  tick: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  shieldDot: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsDot: {
    position: 'absolute',
    right: -5,
    top: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsDotText: { color: '#FFFFFF', fontSize: 9, fontFamily: fonts.black },
  pName: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi, maxWidth: '100%' },
  pScore: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontVariant: ['tabular-nums'] },
  toasts: { position: 'absolute', top: 150, left: spacing.lg, right: spacing.lg, zIndex: 10, gap: 6 },
  toast: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  toastText: { color: colors.text, fontSize: 14, fontFamily: fonts.extra, textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 4 },
  cut: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cutText: { color: '#5EC8FF', fontSize: 11, fontFamily: fonts.extra },
  sudden: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  suddenText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 12 },
  qBody: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm },
  qCard: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 96,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
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
  secs: {
    marginLeft: 'auto',
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  qText: { flexShrink: 1, color: colors.text, fontFamily: fonts.extra, fontSize: 20, lineHeight: 27 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  opt: {
    width: '48%',
    flexGrow: 1,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  optMine: { borderColor: '#FFFFFF' },
  optCorrect: { backgroundColor: '#15996B', borderColor: '#34D399' },
  optWrong: { backgroundColor: '#B3264A', borderColor: '#FF5C7A' },
  optDim: { opacity: 0.5 },
  optOut: { opacity: 0.3 },
  letter: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  letterText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
  optText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 15 },
  optTextOut: { textDecorationLine: 'line-through' },
  outTag: { color: colors.textMuted, fontSize: 11 },
  pickers: { position: 'absolute', top: 3, right: 3, flexDirection: 'row', gap: 1 },
  pickDot: { borderWidth: 2, borderRadius: 999 },
  result: { alignItems: 'center', gap: 2 },
  resultText: { fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  resultSub: { color: colors.textMuted, fontSize: fontSizes.md, textAlign: 'center' },
  wait: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  err: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  link: {
    color: colors.primary,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: 6,
  },
  linkMuted: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center', paddingVertical: 4 },
  small: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  handScroll: { flexGrow: 0, marginTop: 'auto' },
  hand: { gap: spacing.sm, paddingTop: 6, paddingRight: 64, paddingBottom: 2 },
  handEmpty: { marginTop: 'auto', color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingRight: 56 },
  codeCard: { alignItems: 'center', gap: 4, padding: spacing.lg, borderRadius: radii.lg, overflow: 'hidden' },
  kicker: { color: 'rgba(244,246,251,0.7)', fontFamily: fonts.black, fontSize: 11, letterSpacing: 2 },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: 44, letterSpacing: 8 },
  codeSub: { color: 'rgba(244,246,251,0.85)', fontSize: 12, textAlign: 'center' },
  section: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginTop: spacing.xs },
  lobbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lobbyName: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  hostTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  hostText: { color: '#1A1200', fontSize: 10, fontFamily: fonts.black },
  colors: { flexDirection: 'row', justifyContent: 'space-between' },
  colorDot: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  colorMine: { borderWidth: 3, borderColor: '#FFFFFF' },
  colorTaken: { opacity: 0.2 },
  waitHost: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.sm },
  intro: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.md },
  introRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  introCol: { alignItems: 'center', gap: 4, width: 64 },
  introName: { color: colors.text, fontSize: 11, fontFamily: fonts.semi },
  countdown: { color: colors.primary, fontFamily: fonts.black, fontSize: 64 },
  rules: { alignSelf: 'stretch', gap: 8, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface },
  ruleLine: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  ruleText: { flex: 1, color: colors.text, fontSize: fontSizes.md, lineHeight: 21 },
  introWarn: { color: colors.alert, fontSize: fontSizes.xs, textAlign: 'center' },
  vote: { gap: spacing.md },
  voteRound: { color: colors.primary, fontFamily: fonts.black, fontSize: 14, letterSpacing: 3, textAlign: 'center' },
  voteRow: { flexDirection: 'row', gap: spacing.sm },
  h1: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  h2: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md, textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22 },
  voteCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 160,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    borderRadius: radii.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  voteCardOn: { transform: [{ scale: 1.04 }] },
  voteIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  voteLabel: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md, textAlign: 'center' },
  voteCount: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 12 },
  voteZero: { color: colors.textMuted, fontSize: 11 },
  voteMine: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteDot: { width: 10, height: 10, borderRadius: 5 },
  chaos: { gap: spacing.sm },
  chaosStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 24,
    backgroundColor: colors.primary,
    color: '#1A1200',
    fontFamily: fonts.black,
    fontSize: 13,
  },
  stepTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  chaosHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  chaosTitle: { flex: 1, color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.xl, letterSpacing: 2 },
  chaosTime: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.xl, fontVariant: ['tabular-nums'] },
  chestArea: { alignItems: 'center', gap: spacing.sm },
  chests4: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  offerText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontFamily: fonts.extra },
  offerYes: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  offerYesText: { color: '#071622', fontFamily: fonts.black, fontSize: 12 },
  offerNo: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerNoText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12 },
  outText: { color: '#5EC8FF', fontSize: fontSizes.md, textAlign: 'center', fontFamily: fonts.extra },
  sheetTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  sheetDesc: { flex: 1, color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  sheetNote: { color: colors.alert, fontSize: fontSizes.sm, textAlign: 'center' },
  sheetLabel: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, marginTop: spacing.sm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    marginTop: 6,
  },
  pickName: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  pickScore: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: 12 },
  resultWrap: { gap: spacing.md },
  resultHero: { alignItems: 'center', gap: 6, padding: spacing.lg, borderRadius: radii.lg, overflow: 'hidden' },
  resultIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 32, letterSpacing: 1 },
  award: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 42, letterSpacing: 1 },
  awardNone: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.black, fontSize: fontSizes.md, letterSpacing: 1 },
  note: { color: '#FFFFFF', fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  standings: { gap: 4, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface },
  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
  },
  standMe: { backgroundColor: 'rgba(124, 140, 255, 0.18)' },
  standPlace: {
    width: 20,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.black,
    fontSize: fontSizes.sm,
  },
  standName: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
  standCorrect: { color: colors.success, fontSize: 11, fontFamily: fonts.semi },
  standScore: { width: 52, textAlign: 'right', color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.sm },
  resultBtns: { gap: spacing.sm },
  monthBox: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.4)',
  },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
  },
  medal: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 12 },
  monthPts: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.sm },
  menuBtn: {
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
  menuText: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  bigBtnText: { color: '#1A1200', fontFamily: fonts.black, fontSize: fontSizes.md },
  next: { color: colors.primary, fontSize: fontSizes.sm, fontFamily: fonts.extra, textAlign: 'center' },
  chatFab: {
    position: 'absolute',
    right: spacing.md,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: fonts.black },
  cbWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255, 106, 26, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 106, 26, 0.45)',
  },
  cbFull: { borderColor: '#FFB020', backgroundColor: 'rgba(34, 211, 197, 0.14)' },
  cbHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cbLabel: { color: colors.text, fontFamily: fonts.black, fontSize: 12, letterSpacing: 1 },
  cbValue: { color: '#FF8A3D', fontFamily: fonts.black, fontSize: fontSizes.md, fontVariant: ['tabular-nums'] },
  cbTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  cbFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  cbTick: { position: 'absolute', top: 3, bottom: 3, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  cbHint: { flex: 1, color: colors.textMuted, fontSize: 11, textAlign: 'right' },
  readyBox: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  readySeats: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  readySeat: { alignItems: 'center', gap: 4, width: 62 },
  readyTick: {
    position: 'absolute',
    top: 34,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  emptySeat: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyName: { color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  readyState: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.extra },
  readyCount: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.lg },
  readyDone: { color: colors.success, fontFamily: fonts.extra, fontSize: fontSizes.md, paddingVertical: spacing.md },
  readyBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 60,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  readyBtnText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.xl },
  revealBox: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  revealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  revealMe: { backgroundColor: 'rgba(124, 140, 255, 0.18)' },
  revealName: { maxWidth: 70, color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  revealPts: { color: colors.textMuted, fontFamily: fonts.black, fontSize: 12 },
});
