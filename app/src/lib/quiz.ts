// Bilgi Yarışması: Solo Maraton (tek başına) ve Uzaktan (2–5 kişi: rastgele eşleşme ya da kodla özel oda).
//
// Bütün kurallar sunucudadır: soru sırası, süre, doğru cevap, kartlar, sandıklar ve puan. Telefon yalnızca ekranı
// çizer; doğru şık süre bitmeden telefona hiç gelmez. Başkalarının kartlarının yalnızca sayısı görünür.
// Maç sırasında telefon yaklaşık saniyede bir durumu sorar; bu aynı zamanda “oyundayım” işaretidir.

import * as Location from 'expo-location';

import { cellOf, isLand, type Cell } from '@/lib/hex';
import { fmtPts } from '@/lib/labels';
import { myCellNow } from '@/lib/myCell';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type QuizCategory = 'genel' | 'tarih' | 'cografya' | 'bilim' | 'spor' | 'sanat' | 'eglence' | 'kocaeli';

export const CATEGORY_LABEL: Record<QuizCategory, string> = {
  genel: 'Genel Kültür',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  bilim: 'Bilim',
  spor: 'Spor',
  sanat: 'Sanat & Edebiyat',
  eglence: 'Eğlence',
  kocaeli: 'Kocaeli',
};

type IconName =
  | 'bulb'
  | 'hourglass'
  | 'earth'
  | 'flask'
  | 'football'
  | 'color-palette'
  | 'film'
  | 'location';

export const CATEGORY_ICON: Record<QuizCategory, IconName> = {
  genel: 'bulb',
  tarih: 'hourglass',
  cografya: 'earth',
  bilim: 'flask',
  spor: 'football',
  sanat: 'color-palette',
  eglence: 'film',
  kocaeli: 'location',
};

export const CATEGORY_COLOR: Record<QuizCategory, string> = {
  genel: '#FFB020',
  tarih: '#E0915B',
  cografya: '#35D6C3',
  bilim: '#5EA8FF',
  spor: '#34D399',
  sanat: '#F06BD1',
  eglence: '#A98BFF',
  kocaeli: '#FF7A59',
};

/** Şık renkleri (A, B, C, D) */
export const OPTION_COLORS: [string, string][] = [
  ['#7C5CFF', '#4B2FB8'],
  ['#1FB5A6', '#127A70'],
  ['#F59E0B', '#B45309'],
  ['#EC4899', '#9D174D'],
];
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export type QuizLobby = {
  /** Devam eden uzaktan maç */
  live_match: string | null;
  /** Devam eden Solo Maraton */
  live_solo: string | null;
  /** Devam eden Yan Yana oyunu */
  live_side: string | null;
  side_today: number;
  side_daily: number;
  server_now: string;
  lives: number;
  /** Bu hafta en çok can (geçen haftanın Solo ilk 3'ü için 10) */
  max_lives: number;
  /** Geçen haftanın Solo ilk 3'ünde miyim (bu hafta 10 can) */
  champion: boolean;
  /** Geçen haftanın Solo şampiyonları */
  champions: { place: number; alias: string; avatar: number; correct: number }[];
  champion_lives: number;
  /** Bir sonraki canın dolacağı an (can doluysa boş) */
  next_life_at: string | null;
  life_minutes: number;
  games_today: number;
  daily_games: number;
  plays: number;
  wins: number;
  /** Bu haftaki Solo toplam doğrum (yalnızca 5+ doğrulu koşular) ve sıram */
  week_total: number;
  week_place: number | null;
  /** Tüm zamanların en iyi Solo koşum (doğru sayısı) */
  best_ever: number;
  points_today: number;
  points_month: number;
  daily_points: number;
  month_points: number;
  /** 2 kişilik maçı kazananın puanı (1.25) */
  duel_points: number;
  /** 2, 3, 4, 5 kişilik maçı kazananın puanı */
  arena_points: number[];
  /** Özel odada aynı kişilerden biriyle oynanan maçlardan günde en çok puan */
  private_group_daily: number;
  /** Bekleme odasında “Hazırım” için süre */
  arena_ready_seconds: number;
  online: number;
  questions: number;
  per_match: number;
  question_seconds: number;
  stale_seconds: number;
};

export type JokerKind = 'freeze' | 'double' | 'fifty';
export type JokerSet = Record<JokerKind, number>;

type CardIcon = 'snow' | 'copy' | 'cut' | 'hand-left' | 'dice' | 'shield-checkmark' | 'nuclear';

/** Solo Maraton jokerleri */
export const JOKER_INFO: Record<JokerKind, { label: string; short: string; desc: string; icon: CardIcon; color: string }> = {
  freeze: {
    label: 'Süre Dondurma',
    short: '+15 sn',
    desc: 'O anki soruya 15 saniye ekler. Süre çubuğu maviye döner.',
    icon: 'snow',
    color: '#5EC8FF',
  },
  double: {
    label: 'Çift Cevap',
    short: '2 hak',
    desc: 'O soruda yanlış cevaplarsan maraton bitmez; bir hakkın daha olur.',
    icon: 'copy',
    color: '#A98BFF',
  },
  fifty: {
    label: 'Yarı Yarıya',
    short: '2 şık eler',
    desc: 'İki yanlış şıkkı eler; iki şık arasında seçim yaparsın.',
    icon: 'cut',
    color: '#FFB020',
  },
};

// ---------------------------------------------------------------------------
// Uzaktan (2–5 kişi): renkler ve kartlar
// ---------------------------------------------------------------------------

export type ArenaColor = 'purple' | 'blue' | 'orange' | 'green' | 'pink' | 'yellow';
export const ARENA_COLORS: Record<ArenaColor, { hex: string; label: string }> = {
  purple: { hex: '#A855F7', label: 'Mor' },
  blue: { hex: '#3B82F6', label: 'Mavi' },
  orange: { hex: '#F97316', label: 'Turuncu' },
  green: { hex: '#22C55E', label: 'Yeşil' },
  pink: { hex: '#EC4899', label: 'Pembe' },
  yellow: { hex: '#EAB308', label: 'Sarı' },
};
export const ARENA_COLOR_KEYS = Object.keys(ARENA_COLORS) as ArenaColor[];
export function colorHex(c: string | null | undefined): string {
  return ARENA_COLORS[c as ArenaColor]?.hex ?? '#7C5CFF';
}

export type CardKind = 'thief' | 'roulette' | 'shield' | 'freeze' | 'fifty' | 'bomb';
export type CardInfo = {
  label: string;
  short: string;
  desc: string;
  icon: CardIcon;
  color: string;
  /** güçlü joker · sabotaj · ceza */
  tone: 'power' | 'sabotage' | 'penalty';
};

export const CARD_INFO: Record<CardKind, CardInfo> = {
  thief: {
    label: 'Hırsız',
    short: 'Rakipten puan çal',
    desc: 'Soru sırasında bir rakip seç. Cevaplar açılınca onun bu sorudaki puanının (yoksa önceki rauntta kazandığının) %25–50’sini alırsın. Kalkanı olan rakipte işe yaramaz.',
    icon: 'hand-left',
    color: '#F97316',
    tone: 'sabotage',
  },
  roulette: {
    label: 'Rus Ruleti',
    short: '2 kat ya da kayıp',
    desc: 'Cevaplamadan önce aç. Doğru bilirsen bu sorunun puanı 2 katına çıkar. Yanlış ya da boş bırakırsan bu rauntta kazandığının 2 katı (en az 200) silinir.',
    icon: 'dice',
    color: '#EF4444',
    tone: 'power',
  },
  shield: {
    label: 'Kalkan',
    short: 'Raunt boyu koruma',
    desc: 'Bu raunt boyunca Hırsız ve Süre Dondurma sana işlemez.',
    icon: 'shield-checkmark',
    color: '#22C55E',
    tone: 'power',
  },
  freeze: {
    label: 'Süre Dondurma',
    short: 'Rakipler −3 sn',
    desc: 'Henüz cevaplamamış rakiplerinin bu sorudaki süresi 3 saniye kısalır (kalkanı olanlar hariç). Sorunun son 4 saniyesinde kullanılamaz.',
    icon: 'snow',
    color: '#5EC8FF',
    tone: 'sabotage',
  },
  fifty: {
    label: '50/50',
    short: '2 yanlış şık gider',
    desc: 'Cevaplamadan önce aç: iki yanlış şık elenir. Nadir çıkar.',
    icon: 'cut',
    color: '#FFB020',
    tone: 'power',
  },
  bomb: {
    label: 'Bomba',
    short: 'Elinde tutma!',
    desc: 'Bir sonraki kaosun sonunda (ya da maç bitince) elindeyse skorunun %20’sini siler. Kaosta kapalı zarfla başka birine verebilirsin.',
    icon: 'nuclear',
    color: '#FF3B3B',
    tone: 'penalty',
  },
};
export const TONE_LABEL: Record<CardInfo['tone'], string> = { power: 'Güçlü joker', sabotage: 'Sabotaj', penalty: 'Ceza' };

export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Kolay', 2: 'Orta', 3: 'Zor' };
export const DIFFICULTY_COLOR: Record<number, string> = { 1: '#34D399', 2: '#FFB020', 3: '#FF5C7A' };

export type SoloState = {
  id: string;
  status: 'playing' | 'finished';
  phase: 'chest' | 'question' | 'reveal' | 'finished';
  q_index: number;
  total: number;
  server_now: string;
  phase_started_at: string;
  phase_ends_at: string;
  question_seconds: number;
  alias: string;
  avatar: number;
  /** Sandık seçildikten sonra üç sandığın içeriği (seçilmeden gelmez) */
  chests: JokerSet[] | null;
  chest_pick: number | null;
  jokers: JokerSet;
  q_state: { hidden?: number[]; wrong?: number[]; double?: boolean; frozen?: boolean; used?: JokerKind[] };
  question: { category: QuizCategory; text: string; options: string[]; difficulty: number } | null;
  last: { q: number; choice: number; correct: boolean; correct_choice: number | null } | null;
  correct_count: number;
  total_ms: number;
  awarded: number;
  note: string | null;
  milestones: { at: number; points: number }[];
  /** Bitince: en iyi koşum, haftalık toplamım / sıram, haftanın ilk 5'i */
  best_ever?: number | null;
  week?: { total: number; place: number; runs: number } | null;
  week_top?: { place: number; alias: string; avatar: number; correct: number; is_me: boolean }[] | null;
};

/** Solo haftalık sıralama satırı: correct = haftanın toplam doğrusu (5+ doğrulu koşular), runs = sayılan koşu */
export type SoloRankRow = { place: number; alias: string; avatar: number; correct: number; total_ms: number; runs: number; is_me: boolean };

export type ChatMsg = { id: string; mine: boolean; alias: string; body: string; at: string };

export type ArenaPhase =
  | 'ready'
  | 'lobby'
  | 'intro'
  | 'vote'
  | 'question'
  | 'reveal'
  | 'chaos'
  | 'sudden'
  | 'sudden_reveal'
  | 'finished';
export type ArenaCard = { id: number; k: CardKind; fuse: number | null };
export type ArenaPlayer = {
  slot: number;
  alias: string;
  avatar: number;
  color: string | null;
  score: number;
  correct: number;
  /** Kaos barı 0–100 */
  bar: number;
  /** Elindeki kart sayısı (kartların ne olduğu gizli) */
  cards: number;
  left: boolean;
  shield: boolean;
  voted: boolean;
  answered: boolean;
  is_me: boolean;
  is_host: boolean;
  /** Rastgele eşleşme bekleme odasında “Hazırım” dedi mi */
  ready: boolean;
  place: number | null;
  sudden: boolean;
  chest: 'eligible' | 'picked' | null;
};
export type ArenaEvent = {
  n: number;
  at: string;
  k: string;
  a: number | null;
  t: number | null;
  v: number | null;
  c?: string | null;
  c2?: string | null;
  p: boolean;
  q: number;
  r: number;
};
export type ArenaState = {
  id: string;
  status: 'playing' | 'finished' | 'abandoned';
  phase: ArenaPhase;
  is_private: boolean;
  code: string | null;
  /** Bekleme odasında maçın başlaması için gereken “Hazır” sayısı */
  ready_need: number | null;
  round: number;
  rounds: number;
  q_index: number;
  server_now: string;
  phase_started_at: string;
  phase_ends_at: string;
  question_seconds: number;
  end_reason: string | null;
  my_slot: number;
  me: {
    cards: ArenaCard[];
    left: boolean;
    vote: string | null;
    chest: 'eligible' | 'picked' | null;
    chest_result: string | null;
    chest_pick: number | null;
    hidden: number[];
    roulette: boolean;
    cut: number;
    used: CardKind[];
    thief: number | null;
    /** Benim bu sorudaki son anım (Süre Dondurma'ya uğradıysam daha erken) */
    deadline: string;
    answer: { choice: number; correct: boolean | null; points: number | null } | null;
    awarded: number;
    note: string | null;
    place: number | null;
    outcome: 'win' | 'loss' | 'draw' | null;
  };
  players: ArenaPlayer[];
  vote: { options: QuizCategory[]; counts: Record<string, number> } | null;
  category: QuizCategory | null;
  question: { category: QuizCategory; text: string; options: string[]; difficulty: number } | null;
  reveal: {
    correct: number;
    answers: { slot: number; choice: number; correct: boolean; points: number; ms: number }[];
    winner_slot: number | null;
  } | null;
  trades: {
    incoming: { id: string; from: number }[];
    outgoing: { id: string; to: number; status: 'pending' | 'accepted' | 'declined' | 'expired'; card: number } | null;
  } | null;
  events: ArenaEvent[];
  chat: ChatMsg[];
};

const TEXT: Record<string, string> = {
  game_not_available: 'Bilgi Yarışması şu an kapalı.',
  sponsor_not_allowed: 'Mekân hesapları yarışmaya katılamaz.',
  quiz_no_questions: 'Yeterli soru yok. Moderatör yeni sorular eklediğinde oynayabilirsin.',
  quiz_daily_limit: 'Bugünkü 25 oyun hakkın bitti. Yarın yine bekleriz!',
  quiz_solo_limit: 'Bugünkü oyun sınırına ulaştın. Yarın tekrar dene.',
  match_not_found: 'Bu maç artık yok.',
  answer_closed: 'Bu sorunun süresi doldu.',
  already_answered: 'Bu soruyu zaten cevapladın.',
  too_fast: 'Biraz yavaş: önce soruyu oku.',
  invalid_choice: 'Geçersiz seçim.',
  muted: 'Hesabın geçici olarak susturuldu; sohbete yazamazsın.',
  invalid_body: 'Mesaj boş olamaz ve 80 karakteri geçemez.',
  chat_closed: 'Bu maçın sohbeti kapandı.',
  rate_limited: 'Biraz yavaş yaz.',
  chat_limit: 'Bu maçta yeterince yazdın.',
  invalid_category: 'Kategori seç.',
  invalid_question: 'Soru 8 ile 220 karakter arasında olmalı.',
  invalid_options: 'Dört şıkkın hepsini yaz (en çok 80 karakter).',
  duplicate_options: 'Şıklar birbirinden farklı olmalı.',
  invalid_correct: 'Doğru şıkkı seç.',
  duplicate_question: 'Bu soru zaten var.',
  question_not_found: 'Soru bulunamadı.',
  no_lives: 'Canın kalmadı. Yeni can dolunca tekrar oynayabilirsin.',
  already_in_match: 'Devam eden bir oyunun var; önce onu bitir.',
  invalid_joker: 'Geçersiz joker.',
  no_joker: 'Bu jokerden kalmadı.',
  joker_used: 'Bu jokeri bu soruda zaten kullandın.',
  invalid_difficulty: 'Zorluk seç.',
  room_not_found: 'Bu kodla açık bir oda yok.',
  room_started: 'Bu odada maç başladı.',
  room_full: 'Oda dolu (en çok 5 kişi).',
  room_blocked: 'Bu odadaki biriyle aranızda engel var.',
  room_kicked: 'Bu odadan çıkarıldın.',
  room_limit: 'Bugün çok fazla oda kurdun. Yarın tekrar dene.',
  room_closed: 'Oda kapandı.',
  try_again: 'Bir sorun oldu, tekrar dene.',
  not_host: 'Bunu yalnızca odayı kuran yapabilir.',
  not_enough_players: 'Başlatmak için en az 2 kişi gerekir.',
  players_no_lives: 'Bazı oyuncuların canı ya da günlük hakkı bitmiş; en az 2 kişi kalmadı.',
  invalid_color: 'Geçersiz renk.',
  color_taken: 'Bu rengi başkası seçti.',
  vote_closed: 'Oylama bitti.',
  not_in_sudden: 'Ani ölüm sorusunu yalnızca berabere kalanlar cevaplar.',
  card_closed: 'Kartlar yalnızca soru sırasında kullanılır.',
  bomb_no_use: 'Bomba kullanılmaz.',
  trade_disabled: 'Kart takası kaldırıldı.',
  too_late: 'Süre Dondurma için çok geç.',
  invalid_target: 'Geçersiz hedef.',
  chaos_closed: 'Kaos aşaması bitti.',
  no_chest: 'Sandık hakkın yok.',
  trade_used: 'Bu kaosta zaten bir zarf gönderdin.',
  trade_not_found: 'Teklif bulunamadı.',
  trade_closed: 'Bu teklifin süresi geçti.',
  ready_closed: 'Bekleme odası kapandı.',
  not_a_winner: 'Bu üye o ayın ilk 3’ünde değil.',
  already_granted: 'Bu ödül zaten verildi.',
  user_not_found: 'Üye bulunamadı.',
  side_daily_limit: 'Bugünkü Yan Yana oyun hakkın bitti. Yarın yine bekleriz!',
};

export async function getQuizLobby(): Promise<{ data: QuizLobby | null; error: string | null }> {
  return callRpc<QuizLobby>('quiz_lobby', undefined, TEXT);
}

/** Bilgi Yarışması ekranındayım (20 sn'de bir). Döner: şu an oyunda olan kişi sayısı. */
export async function quizPing(): Promise<number | null> {
  const res = await callRpc<number>('quiz_ping', undefined, TEXT);
  return res.error ? null : (res.data ?? null);
}

export type FindResult =
  | { status: 'matched'; match_id: string }
  | { status: 'waiting'; waited: number; waiting: number; starts_in: number | null };

export async function findMatch(cell: Cell | null): Promise<{ data: FindResult | null; error: string | null }> {
  return callRpc<FindResult>('quiz_find_match', { p_cell_q: cell?.q ?? null, p_cell_r: cell?.r ?? null }, TEXT);
}

export async function cancelSearch(): Promise<Result> {
  return callRpcVoid('quiz_cancel_search', undefined, TEXT);
}

export async function startSolo(cell: Cell | null): Promise<{ data: string | null; error: string | null }> {
  return callRpc<string>('quiz_start_solo', { p_cell_q: cell?.q ?? null, p_cell_r: cell?.r ?? null }, TEXT);
}

export async function sendChat(matchId: string, body: string): Promise<Result> {
  return callRpcVoid('quiz_chat_send', { p_match_id: matchId, p_body: body }, TEXT);
}


/**
 * Oyundayken bulunduğun petek (haritadaki yoğunluk için). Konum izni zaten verildiyse sessizce bir kez bakılır;
 * izin yoksa hiçbir şey sorulmaz ve yoğunluğa sayılmazsın. Tam konum sunucuya gitmez, yalnızca petek numarası.
 */
export async function quietCell(): Promise<Cell | null> {
  const known = myCellNow();
  if (known) return known;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (!fix || fix.mocked === true) return null;
    const c = cellOf(fix.coords.longitude, fix.coords.latitude);
    return isLand(c.q, c.r) ? c : null;
  } catch {
    return null;
  }
}

/** Rakibin sohbet mesajını moderatörlere bildir */
export async function reportChatMessage(messageId: string, reason: string): Promise<Result> {
  return callRpcVoid('report_content', { p_type: 'quiz_chat', p_id: messageId, p_reason: reason }, {
    ...TEXT,
    target_not_found: 'Bu mesaj artık yok.',
    invalid_reason: 'Bir neden seç.',
  });
}

// ---------------------------------------------------------------------------
// Moderatör: soru bankası
// ---------------------------------------------------------------------------

export type AdminQuestion = {
  id: string;
  category: QuizCategory;
  question: string;
  options: string[];
  correct: number;
  is_active: boolean;
  times_shown: number;
  times_correct: number;
  created_at: string;
  difficulty: number;
};

export async function adminListQuestions(
  search: string,
  category: QuizCategory | null,
  offset = 0,
): Promise<{ data: AdminQuestion[]; error: string | null }> {
  const { data, error } = await callRpc<AdminQuestion[]>(
    'admin_list_quiz_questions',
    { p_search: search.trim() || null, p_category: category, p_limit: 50, p_offset: offset },
    TEXT,
  );
  return { data: error ? [] : (data ?? []), error };
}

export async function adminSaveQuestion(q: {
  id: string | null;
  category: QuizCategory;
  question: string;
  options: string[];
  correct: number;
  difficulty: number;
}): Promise<{ data: string | null; error: string | null }> {
  return callRpc<string>(
    'admin_save_quiz_question',
    {
      p_id: q.id,
      p_category: q.category,
      p_question: q.question,
      p_options: q.options,
      p_correct: q.correct,
      p_difficulty: q.difficulty,
    },
    TEXT,
  );
}

export async function adminSetQuestionActive(id: string, active: boolean): Promise<Result> {
  return callRpcVoid('admin_set_quiz_question_active', { p_id: id, p_active: active }, TEXT);
}

// ---------------------------------------------------------------------------
// Solo Maraton
// ---------------------------------------------------------------------------

export async function soloState(runId: string): Promise<{ data: SoloState | null; error: string | null }> {
  return callRpc<SoloState>('quiz_solo_state', { p_run_id: runId }, TEXT);
}

export async function soloPickChest(runId: string, index: number): Promise<Result> {
  return callRpcVoid('quiz_solo_pick_chest', { p_run_id: runId, p_index: index }, TEXT);
}

export async function soloAnswer(
  runId: string,
  qIndex: number,
  choice: number,
): Promise<{ data: { correct: boolean; retry?: boolean; correct_choice?: number } | null; error: string | null }> {
  return callRpc('quiz_solo_answer', { p_run_id: runId, p_q_index: qIndex, p_choice: choice }, TEXT);
}

export async function soloJoker(runId: string, kind: JokerKind): Promise<Result> {
  return callRpcVoid('quiz_solo_joker', { p_run_id: runId, p_kind: kind }, TEXT);
}

export async function soloLeave(runId: string): Promise<Result> {
  return callRpcVoid('quiz_solo_leave', { p_run_id: runId }, TEXT);
}

export async function soloLeaderboard(): Promise<{ data: SoloRankRow[]; error: string | null }> {
  const { data, error } = await callRpc<SoloRankRow[]>('quiz_solo_leaderboard', { p_limit: 20 }, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

/** Solo Maraton sonu notu */
export function soloNote(s: SoloState): string {
  const m = [...s.milestones].reverse().find((x) => s.correct_count >= x.at);
  if (!m) return `${s.correct_count} doğru. Puan için en az 5 doğru gerekir.`;
  switch (s.note) {
    case 'ok':
      return `${m.at} doğru basamağına ulaştın: +${fmtPts(s.awarded)} puan hesabına yazıldı.`;
    case 'cap_partial':
      return `${m.at} doğru basamağı! Günlük/aylık sınıra yaklaştığın için +${fmtPts(s.awarded)} puan yazıldı.`;
    case 'cap':
      return `${m.at} doğru basamağı! Ancak Bilgi Yarışması için bugünkü (ya da bu ayki) puan sınırın doldu.`;
    case 'win_nopoints':
      return `${m.at} doğru basamağı! (Bu hesap türü puan almaz.)`;
    default:
      return `${m.at} doğru basamağı.`;
  }
}

/** “12:34” biçiminde kalan süre */
export function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Uzaktan (2–5 kişi)
// ---------------------------------------------------------------------------

export async function arenaState(matchId: string): Promise<{ data: ArenaState | null; error: string | null }> {
  return callRpc<ArenaState>('quiz_arena_state', { p_match: matchId }, TEXT);
}

export async function arenaCreateRoom(
  color: ArenaColor | null,
  cell: Cell | null,
): Promise<{ data: { match_id: string; code: string } | null; error: string | null }> {
  return callRpc('quiz_arena_create_room', { p_color: color, p_cell_q: cell?.q ?? null, p_cell_r: cell?.r ?? null }, TEXT);
}

/**
 * Kodla odaya katıl. Yanlış kod sayılır: 10 dakikada 5 yanlışta 5 dakika engel.
 * Başarılıysa maç numarası, değilse kullanıcıya gösterilecek hata döner.
 */
export async function arenaJoinRoom(code: string, cell: Cell | null): Promise<{ data: string | null; error: string | null }> {
  const res = await callRpc<{ match_id?: string; error?: string; left?: number; wait?: number }>(
    'quiz_arena_join_room',
    { p_code: code.trim().toUpperCase(), p_color: null, p_cell_q: cell?.q ?? null, p_cell_r: cell?.r ?? null },
    TEXT,
  );
  if (res.error || !res.data) return { data: null, error: res.error ?? 'Odaya girilemedi.' };
  if (res.data.match_id) return { data: res.data.match_id, error: null };
  if (res.data.error === 'code_blocked') {
    return { data: null, error: `Çok fazla yanlış kod denedin. ${res.data.wait ?? 5} dakika sonra tekrar dene.` };
  }
  const left = res.data.left ?? 0;
  return { data: null, error: `Bu kodla açık bir oda yok. ${left > 0 ? `${left} deneme hakkın kaldı.` : ''}`.trim() };
}

export async function arenaReady(matchId: string): Promise<Result> {
  return callRpcVoid('quiz_arena_ready', { p_match: matchId }, TEXT);
}

export type OnlineRankRow = { place: number; alias: string; avatar: number; points: number; wins: number; is_me: boolean };

/** Online (Uzaktan) aylık sıralaması: 0 = bu ay, -1 = geçen ay */
export async function onlineLeaderboard(offset = 0): Promise<{ data: OnlineRankRow[]; error: string | null }> {
  const { data, error } = await callRpc<OnlineRankRow[]>('quiz_online_leaderboard', { p_offset: offset, p_limit: 20 }, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export type OnlineWinner = {
  month: string;
  place: number;
  user_id: string;
  alias: string;
  full_name: string;
  points: number;
  wins: number;
  granted: boolean;
  granted_at: string | null;
};

/** Moderatör: bir ayın Online ilk 3'ü (-1 = geçen ay) */
export async function adminOnlineWinners(offset = -1): Promise<{ data: OnlineWinner[]; error: string | null }> {
  const { data, error } = await callRpc<OnlineWinner[]>('admin_quiz_online_winners', { p_offset: offset }, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

/** Moderatör: 1 aylık abonelik ödülü ver */
export async function adminGrantOnlineReward(userId: string, offset = -1): Promise<Result> {
  return callRpcVoid('admin_quiz_grant_online_reward', { p_user: userId, p_offset: offset }, TEXT);
}

export async function arenaSetColor(matchId: string, color: ArenaColor): Promise<Result> {
  return callRpcVoid('quiz_arena_set_color', { p_match: matchId, p_color: color }, TEXT);
}

export async function arenaKick(matchId: string, slot: number): Promise<Result> {
  return callRpcVoid('quiz_arena_kick', { p_match: matchId, p_slot: slot }, TEXT);
}

export async function arenaStart(matchId: string): Promise<Result> {
  return callRpcVoid('quiz_arena_start', { p_match: matchId }, TEXT);
}

export async function arenaVote(matchId: string, category: string): Promise<Result> {
  return callRpcVoid('quiz_arena_vote', { p_match: matchId, p_category: category }, TEXT);
}

export async function arenaAnswer(matchId: string, qIndex: number, choice: number): Promise<Result> {
  return callRpcVoid('quiz_arena_answer', { p_match: matchId, p_q_index: qIndex, p_choice: choice }, TEXT);
}

export async function arenaUseCard(matchId: string, cardId: number, target: number | null): Promise<{ data: { kind: CardKind; hit: number } | null; error: string | null }> {
  return callRpc('quiz_arena_use_card', { p_match: matchId, p_card: cardId, p_target: target }, TEXT);
}

export async function arenaOpenChest(matchId: string, index: number): Promise<{ data: { kind: CardKind | 'empty'; lost: boolean } | null; error: string | null }> {
  return callRpc('quiz_arena_open_chest', { p_match: matchId, p_index: index }, TEXT);
}

export async function arenaTradeOffer(matchId: string, cardId: number, target: number): Promise<Result> {
  return callRpcVoid('quiz_arena_trade_offer', { p_match: matchId, p_card: cardId, p_target: target }, TEXT);
}

export async function arenaTradeRespond(
  tradeId: string,
  accept: boolean,
): Promise<{ data: { accepted: boolean; got?: CardKind; gave?: CardKind | null } | null; error: string | null }> {
  return callRpc('quiz_arena_trade_respond', { p_trade: tradeId, p_accept: accept }, TEXT);
}

export async function arenaLeave(matchId: string): Promise<Result> {
  return callRpcVoid('quiz_arena_leave', { p_match: matchId }, TEXT);
}

export async function blockPlayer(matchId: string, slot: number): Promise<Result> {
  return callRpcVoid('quiz_block_player', { p_match: matchId, p_slot: slot }, TEXT);
}

/** Uzaktan maç sonu notu */
export function arenaNote(s: ArenaState): string {
  const aw = fmtPts(s.me.awarded);
  switch (s.me.note) {
    case 'ok':
      return `Tebrikler! Hesabına +${aw} puan yazıldı.`;
    case 'cap_partial':
      return `Kazandın! Günlük/aylık Bilgi Yarışması puan sınırına yaklaştığın için +${aw} puan yazıldı.`;
    case 'cap':
      return 'Kazandın! Ancak Bilgi Yarışması için bugünkü (ya da bu ayki) puan sınırın doldu.';
    case 'group_partial':
      return `Kazandın! Bu kişilerle özel odada bugünkü sınıra yaklaştığın için +${aw} puan yazıldı.`;
    case 'group_cap':
      return 'Kazandın! Bu kişilerle özel odada bugün yeterince puan aldın; bu galibiyet puan getirmedi.';
    case 'few_correct':
      return 'Kazandın! Puan için en az 4 doğru cevap gerekir.';
    case 'early_forfeit':
      return 'Rakiplerin ilk sorularda ayrıldı; bu maç sayılmadı.';
    case 'win_nopoints':
      return 'Kazandın! (Bu hesap türü puan almaz.)';
    case 'draw':
      return 'Ani ölümde de kazanan çıkmadı; berabere biten maç puan getirmez.';
    case 'left':
      return 'Maçtan ayrıldığın için kaybettin.';
    case 'cancelled':
      return 'Diğer oyuncular maç başlamadan vazgeçti; maç sayılmadı ve canın geri verildi.';
    case 'requeue':
      return 'Bekleme odası dağıldı; yeniden rakip aranıyor…';
    case 'closed':
      return 'Oda kapandı.';
    case 'abandoned':
      return 'Maç yarıda kaldı; sayılmadı.';
    case 'loss':
      return 'Bu sefer olmadı. Kaybeden puan kaybetmez; tekrar dene!';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Yan Yana (tek telefonda 2 kişi; can harcamaz, puan vermez)
// ---------------------------------------------------------------------------

export type SideAnswer = { c: number; ok: boolean; pts: number; ms: number };
export type SideState = {
  id: string;
  status: 'playing' | 'finished';
  phase: 'intro' | 'vote' | 'question' | 'reveal' | 'finished';
  q_index: number;
  total: number;
  round: number;
  rounds: number;
  server_now: string;
  phase_started_at: string;
  phase_ends_at: string;
  question_seconds: number;
  name1: string;
  name2: string;
  score1: number;
  score2: number;
  correct1: number;
  correct2: number;
  /** Raunt başında seçilebilecek 3 kategori (yalnızca 'vote' aşamasında) */
  vote_options: QuizCategory[] | null;
  voted: { '1': boolean; '2': boolean };
  round_category: QuizCategory | null;
  /** options: alttaki oyuncunun şık sırası, options2: üstteki oyuncunun (farklı karışık) */
  question: { category: QuizCategory; text: string; options: string[]; options2: string[]; difficulty: number } | null;
  answered: { '1': boolean; '2': boolean };
  /** correct: alttaki oyuncunun sırasında doğru şık, correct2: üsttekinin */
  reveal: { '1'?: SideAnswer; '2'?: SideAnswer; correct?: number; correct2?: number } | null;
};

export async function sideStart(name1: string, name2: string): Promise<{ data: string | null; error: string | null }> {
  return callRpc<string>('quiz_side_start', { p_name1: name1, p_name2: name2 }, TEXT);
}

export async function sideState(id: string): Promise<{ data: SideState | null; error: string | null }> {
  return callRpc<SideState>('quiz_side_state', { p_id: id }, TEXT);
}

export async function sideAnswer(id: string, qIndex: number, player: 1 | 2, choice: number): Promise<Result> {
  return callRpcVoid('quiz_side_answer', { p_id: id, p_q_index: qIndex, p_player: player, p_choice: choice }, TEXT);
}

export async function sideVote(id: string, player: 1 | 2, category: QuizCategory): Promise<Result> {
  return callRpcVoid('quiz_side_vote', { p_id: id, p_player: player, p_category: category }, TEXT);
}

export async function sideLeave(id: string): Promise<Result> {
  return callRpcVoid('quiz_side_leave', { p_id: id }, TEXT);
}
