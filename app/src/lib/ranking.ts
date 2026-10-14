// Sıralama (puan tablosu) ve puan geçmişi.

import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type RankRow = {
  /** Eşit puanlılar aynı sırayı alır. Sunucu sayıyı metin olarak gönderebilir. */
  place: number;
  full_name: string;
  points: number;
  level: number;
  is_premium: boolean;
  is_me: boolean;
  /** Geçerli oyun şampiyonu ünvanı (varsa). Ünvan yalnızca gerçek adın göründüğü yerlerde gösterilir. */
  title: string | null;
  /** Aylık hediye şartı: o ay en az bir etkinlik katılımı ya da yan yana oyun (eski sunucuda gelmez) */
  eligible?: boolean;
};

/** 'this' = bu ay, 'last' = geçen ay. Sıralama her ay sıfırdan başlar. */
export type RankPeriod = 'this' | 'last';

/**
 * Sıralama tablosunun durumu. Puanlar hesaba anında yazılır; yalnızca “Bu ay” tablosu haftada bir
 * (pazartesi 00:00, Türkiye saati; ay başında da) güncellenir. “Geçen ay” tablosu kesindir.
 */
export type RankingInfo = {
  /** true: tablo haftada bir güncellenir; false: tablo anında güncellenir */
  weekly: boolean;
  /** Tablonun kapsadığı an (son güncelleme) */
  asOf: string;
  /** Sonraki güncelleme (haftalık kapalıysa null) */
  nextAt: string | null;
  monthStart: string;
  /** Sıfırlama anı (sonraki ayın başı) */
  monthEnd: string;
  /** Bu ay hesabıma yazılan puan (anında; tabloda henüz görünmeyebilir) */
  myPoints: number;
  /** Tablodaki yerim (tabloda yoksam null) */
  myPlace: number | null;
};

type RankingInfoRaw = {
  weekly: boolean;
  as_of: string;
  next_at: string | null;
  month_start: string;
  month_end: string;
  my_points: number | string;
  my_place: number | string | null;
};

export async function getRankingInfo(): Promise<RankingInfo | null> {
  const { data } = await callRpc<RankingInfoRaw[]>('ranking_info');
  const r = Array.isArray(data) ? data[0] : null;
  if (!r) return null;
  return {
    weekly: r.weekly === true,
    asOf: r.as_of,
    nextAt: r.next_at,
    monthStart: r.month_start,
    monthEnd: r.month_end,
    myPoints: Number(r.my_points),
    myPlace: r.my_place === null ? null : Number(r.my_place),
  };
}

export async function getLeaderboard(period: RankPeriod): Promise<{ data: RankRow[]; error: string | null }> {
  const { data, error } = await callRpc<RankRow[]>('get_monthly_leaderboard', {
    p_limit: 100,
    p_months_ago: period === 'last' ? 1 : 0,
  });
  const rows = (data ?? []).map((r) => ({
    ...r,
    place: Number(r.place),
    points: Number(r.points),
    level: Number(r.level),
  }));
  return { data: rows, error };
}

/** Geçen haftanın (pazartesi–pazar) kesinleşmiş sıralaması; `game` boşsa genel puan. */
export async function getLastWeekLeaderboard(
  game: string | null,
): Promise<{ data: { place: number; full_name: string; score: number; is_me: boolean }[]; error: string | null }> {
  const { data, error } = await callRpc<{ place: number; full_name: string; score: number; is_me: boolean }[]>(
    'get_last_week_leaderboard',
    { p_game: game, p_limit: 10 },
  );
  return {
    data: (data ?? []).map((r) => ({ ...r, place: Number(r.place), score: Number(r.score) })),
    error,
  };
}

export type PointEvent = { id: number; amount: number; reason: string; created_at: string };

/** Kendi puan hareketlerim (en yeni önce). */
export async function listMyPointEvents(): Promise<{ data: PointEvent[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase
    .from('point_events')
    .select('id, amount, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return { data: [], error: 'Puan geçmişi okunamadı.' };
  return { data: (data ?? []) as PointEvent[], error: null };
}

/** perk: seviyenin ödülü (bkz. lib/levelPerks.ts); ödülü olmayan seviyede boş */
export type LevelInfo = { level: number; name: string; min_points: number; perk: string | null };

export async function listLevels(): Promise<LevelInfo[]> {
  if (!supabase) return [];
  // Tüm sütunlar istenir: sunucu güncellenmeden önce de (perk sütunu yokken) liste okunabilsin
  const { data } = await supabase.from('levels').select('*').order('min_points');
  return ((data ?? []) as Partial<LevelInfo>[]).map((l) => ({
    level: Number(l.level),
    name: String(l.name ?? ''),
    min_points: Number(l.min_points ?? 0),
    perk: l.perk ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Oyun sıralamaları (yalnızca görsel; ödülü yoktur)
// ---------------------------------------------------------------------------

export type GameRankRow = {
  place: number;
  full_name: string;
  plays: number;
  wins: number;
  /** Oyun puanı = o ay bu oyundan hesabına yazılan puanların toplamı */
  score: number;
  level: number;
  is_premium: boolean;
  is_me: boolean;
  title: string | null;
};

/** Oyun sıralaması da her ay sıfırlanır; “Bu ay” haftada bir güncellenir, “Geçen ay” kesindir. */
export async function getGameLeaderboard(
  game: string,
  period: RankPeriod = 'this',
): Promise<{ data: GameRankRow[]; error: string | null }> {
  const { data, error } = await callRpc<GameRankRow[]>('get_game_leaderboard', {
    p_game: game,
    p_limit: 50,
    p_months_ago: period === 'last' ? 1 : 0,
  });
  const rows = (data ?? []).map((r) => ({
    ...r,
    place: Number(r.place),
    plays: Number(r.plays),
    wins: Number(r.wins),
    score: Number(r.score),
    level: Number(r.level),
  }));
  return { data: rows, error };
}

// ---------------------------------------------------------------------------
// Oyun şampiyonu ünvanları
//   Her oyunun geçen ayki 1.'si, içinde bulunulan ay boyunca “<Oyun> Şampiyonu” ünvanını taşır.
//   Ünvan sunucuda her seferinde geçen ayın sıralamasından hesaplanır (ayrıca saklanmaz); akışta görünmez,
//   yalnızca gerçek adın göründüğü yerlerde (sıralama, etkinlik, arkadaş listesi, açık odalar, profil) gösterilir.
// ---------------------------------------------------------------------------

export type MyTitle = {
  game_type: string;
  /** “Tabu Şampiyonu” */
  label: string;
  /** Ünvanın geçerli olduğu son an (ayın sonu) */
  valid_until: string;
  score: number;
  plays: number;
};

export async function getMyTitles(): Promise<{ data: MyTitle[]; error: string | null }> {
  const { data, error } = await callRpc<MyTitle[]>('my_titles');
  return {
    data: (data ?? []).map((t) => ({ ...t, score: Number(t.score), plays: Number(t.plays) })),
    error,
  };
}

export type GameChampion = {
  full_name: string;
  label: string;
  valid_until: string;
  score: number;
  plays: number;
  is_me: boolean;
};

/** Bir oyunun şu anki şampiyonu; yoksa null. */
export async function getGameChampion(game: string): Promise<GameChampion | null> {
  const { data } = await callRpc<GameChampion[]>('get_game_champion', { p_game: game });
  const r = Array.isArray(data) ? data[0] : null;
  return r ? { ...r, score: Number(r.score), plays: Number(r.plays) } : null;
}

// ---------------------------------------------------------------------------
// Bu ay puanlarım (kaynağa göre) ve puan kuralları
// ---------------------------------------------------------------------------

export type PointSourceRow = { source: string; points: number; entries: number };

export async function getMyMonthPoints(): Promise<{ data: PointSourceRow[]; error: string | null }> {
  const { data, error } = await callRpc<PointSourceRow[]>('my_points_this_month');
  const rows = (data ?? []).map((r) => ({ ...r, points: Number(r.points), entries: Number(r.entries) }));
  return { data: rows, error };
}

export const SOURCE_LABELS: Record<string, string> = {
  event_create: 'Etkinlik açtın',
  event_attend: 'Etkinliğe katıldın',
  event_host: 'Etkinliğine gelenler',
  event_team: 'Ekip bonusu',
  event_reversal: 'İptal edilen etkinlik (geri alındı)',
  game_play: 'Oyun oynadın',
  game_remote: 'Uzaktan oyun oynadın',
  quiz_play: 'Bilgi Yarışması',
  game_win: 'Oyun kazandın (eski kural)',
  admin: 'Moderatör puanı',
  treasure: 'Hazine buldun',
  event_rate: 'Etkinlik puanladın',
  event_rated: 'Etkinliğin puanlandı',
};

/** Puan kuralları sunucuda (`app_settings`, `pts_*`) tutulur; moderatör değiştirebilir. Burada yalnızca ekranda gösterilir. */
export type PointRules = {
  eventCreate: number;
  /** Ayda kaç etkinlik açmaktan puan alınır (abonelik dahil herkes için aynı) */
  eventCreateMonthEvents: number;
  /** 1 ise ücretli etkinlikler de puan verir (varsayılan 0: puan vermez) */
  paidEvents: number;
  /** Katılım puanı kalabalığa göre: 4–9 kişi / 10–19 / 20–39 / 40+ */
  eventAttend: number;
  eventAttend10: number;
  eventAttend20: number;
  eventAttend40: number;
  /** 41. Kat Özel etkinliklerde her basamağa eklenen puan */
  eventAttendOfficialBonus: number;
  /** Etkinlikte puanların açılması için kodla ve konumla doğrulanması gereken en az kişi sayısı */
  eventMinAttendees: number;
  hostPerAttendee: number;
  hostAttendeeCap: number;
  hostMonthCap: number;
  pairCooldownDays: number;
  /** Bir üye aynı gün (Türkiye saati) aynı kategorideki kaç etkinlikten katılım puanı alır (0 = sınırsız) */
  eventCategoryDaily: number;
  /** Bir üye aynı üyenin açtığı etkinliklerden kaç günde bir katılım puanı alır (0 = sınırsız; 41. Kat Özel hariç) */
  eventHostDays: number;
  /** Etkinlik başladıktan kaç saat sonra kapanır */
  eventDurationHours: number;
  /** Oyunda alınabilecek en yüksek puan (1. sıra; oyuncu sayısı bundan azsa oyuncu sayısı kadar) */
  gameTopCap: number;
  gameMinPlayers: number;
  gameDailyCap: number;
  gameMonthCap: number;
  /** Bilgi Yarışması (uzaktan): az puan, ayrı sınırlar. Puan ayarları 100 katı olarak saklanır (100 = 1 puan). */
  quizWinBase: number;
  quizSolo5: number;
  quizSolo8: number;
  quizSolo12: number;
  /** Bilgi Yarışması'ndan günde / ayda alınabilecek en çok puan (toplam) */
  quizDailyPoints: number;
  quizMonthPoints: number;
  quizMaxLives: number;
  quizLifeMinutes: number;
  quizDailyGames: number;
  /** Yan yana oyunun puan çarpanı (uzaktan oyunun kaç katı) */
  sideMult: number;
  /** Her oyunun aylık puan hedefi (sınırı): uzaktan / yan yana */
  remoteMonthPoints: number;
  sideMonthPoints: number;
  /** Mekân kodu ile mekânda oynanan yan yana oyunun puanı (yüzde; 125 = +%25) */
  venueBonusPct: number;
  /** Köpekbalığı Kafesi ve Vampir–Köylü puan için en az oyuncu */
  partyMinPlayers: number;
  /** Mekân kodu kaç saat geçerli */
  sponsorCreditHours: number;
  /** Etkinlik puanlama: puan veren / 5 ve 4 yıldız alan düzenleyen / düzenleyenin aylık puanlama sınırı */
  eventRate: number;
  eventRated5: number;
  eventRated4: number;
  eventRatedMonthCap: number;
  /** 1 ise oyun şampiyonu ünvanları açık */
  titlesEnabled: number;
  /** Ünvan için bir oyunda o ay puan getiren en az oyun sayısı */
  titleMinPlays: number;
};

export const DEFAULT_RULES: PointRules = {
  eventCreate: 50,
  eventCreateMonthEvents: 2,
  paidEvents: 0,
  eventAttend: 100,
  eventAttend10: 120,
  eventAttend20: 140,
  eventAttend40: 170,
  eventAttendOfficialBonus: 30,
  eventMinAttendees: 4,
  hostPerAttendee: 25,
  hostAttendeeCap: 25,
  hostMonthCap: 1000,
  pairCooldownDays: 30,
  eventCategoryDaily: 1,
  eventHostDays: 2,
  eventDurationHours: 3,
  gameTopCap: 24,
  gameMinPlayers: 4,
  gameDailyCap: 5,
  gameMonthCap: 15,
  quizWinBase: 300,
  quizSolo5: 100,
  quizSolo8: 120,
  quizSolo12: 150,
  quizDailyPoints: 100000,
  quizMonthPoints: 250,
  quizMaxLives: 5,
  quizLifeMinutes: 30,
  quizDailyGames: 100000,
  sideMult: 7,
  remoteMonthPoints: 250,
  sideMonthPoints: 1750,
  venueBonusPct: 125,
  partyMinPlayers: 5,
  sponsorCreditHours: 6,
  eventRate: 15,
  eventRated5: 12,
  eventRated4: 6,
  eventRatedMonthCap: 300,
  titlesEnabled: 1,
  titleMinPlays: 5,
};

const RULE_KEYS: Record<string, keyof PointRules> = {
  pts_event_create: 'eventCreate',
  pts_event_create_month_events: 'eventCreateMonthEvents',
  pts_paid_events: 'paidEvents',
  pts_event_attend: 'eventAttend',
  pts_event_attend_10: 'eventAttend10',
  pts_event_attend_20: 'eventAttend20',
  pts_event_attend_40: 'eventAttend40',
  pts_event_attend_official_bonus: 'eventAttendOfficialBonus',
  pts_event_min_attendees: 'eventMinAttendees',
  pts_event_host_per_attendee: 'hostPerAttendee',
  pts_event_host_attendee_cap: 'hostAttendeeCap',
  pts_event_host_month_cap: 'hostMonthCap',
  pts_pair_cooldown_days: 'pairCooldownDays',
  pts_event_attend_category_daily: 'eventCategoryDaily',
  pts_event_attend_host_days: 'eventHostDays',
  event_duration_hours: 'eventDurationHours',
  pts_game_top_cap: 'gameTopCap',
  pts_game_min_players: 'gameMinPlayers',
  pts_game_daily_cap: 'gameDailyCap',
  pts_game_month_cap: 'gameMonthCap',
  pts_quiz_win_base: 'quizWinBase',
  pts_quiz_solo_5: 'quizSolo5',
  pts_quiz_solo_8: 'quizSolo8',
  pts_quiz_solo_12: 'quizSolo12',
  pts_quiz_daily_points: 'quizDailyPoints',
  pts_quiz_month_points: 'quizMonthPoints',
  quiz_max_lives: 'quizMaxLives',
  quiz_life_minutes: 'quizLifeMinutes',
  quiz_daily_games: 'quizDailyGames',
  pts_side_mult: 'sideMult',
  pts_remote_month_points: 'remoteMonthPoints',
  pts_side_month_points: 'sideMonthPoints',
  pts_venue_bonus_pct: 'venueBonusPct',
  pts_party_min_players: 'partyMinPlayers',
  sponsor_credit_valid_hours: 'sponsorCreditHours',
  pts_event_rate: 'eventRate',
  pts_event_rated_5: 'eventRated5',
  pts_event_rated_4: 'eventRated4',
  pts_event_rated_month_cap: 'eventRatedMonthCap',
  titles_enabled: 'titlesEnabled',
  title_min_plays: 'titleMinPlays',
};

/** Bilgi Yarışması puan ayarı (100 katı saklanır) → ekranda gösterilecek puan, ör. 125 → "1.25" */
export function quizPts(v: number): string {
  return String(Math.round(Number(v) || 0) / 100);
}

/** Bilgi Yarışması puan kuralının tek satırlık özeti (puan bilgi ekranları için) */
export function quizRuleSummary(r: PointRules): string {
  return `Solo Maraton: 5 doğru +${quizPts(r.quizSolo5)}, 8 doğru +${quizPts(r.quizSolo8)}, 12 doğru +${quizPts(r.quizSolo12)}. Uzaktan kazanana 2 kişide +${quizPts(r.quizWinBase * 1.25)}, 5 kişide +${quizPts(r.quizWinBase * 2)}. Aylık puan hedefi ${r.quizMonthPoints} puan.`;
}

export async function getPointRules(): Promise<PointRules> {
  if (!supabase) return DEFAULT_RULES;
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', Object.keys(RULE_KEYS));
  if (error || !data) return DEFAULT_RULES;
  const out: PointRules = { ...DEFAULT_RULES };
  for (const row of data as { key: string; value: unknown }[]) {
    const field = RULE_KEYS[row.key];
    const n = Number(row.value);
    if (field && Number.isFinite(n) && n >= 0 && n <= 100000) out[field] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aylık puan hedefleri (giriş ekranlarındaki hedef çubukları, Oyunlar'daki "Kalan hedef")
// ---------------------------------------------------------------------------

export type GoalGame = 'shark_cage' | 'vampire_villager';

export type GameGoals = {
  remote_cap: number;
  side_cap: number;
  side_mult: number;
  venue_pct: number;
  party_min_players: number;
  /** Bilgi Yarışması: bu ay kazanılan / aylık hedef (seviye çarpanı dahil) */
  quiz: { earned: number; cap: number };
  /** Bu ay her oyundan uzaktan ve yan yana kazanılan */
  games: Record<GoalGame, { remote: number; side: number }>;
  /** Bu ay etkinliklerden kazanılan (sınırsız) */
  events: number;
};

export async function getMyGameGoals(): Promise<GameGoals | null> {
  const { data } = await callRpc<GameGoals>('my_game_goals', {});
  if (!data || typeof data !== 'object') return null;
  const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const g = (k: GoalGame) => ({ remote: n(data.games?.[k]?.remote), side: n(data.games?.[k]?.side) });
  return {
    remote_cap: n(data.remote_cap),
    side_cap: n(data.side_cap),
    side_mult: n(data.side_mult) || 1,
    venue_pct: n(data.venue_pct) || 100,
    party_min_players: n(data.party_min_players),
    quiz: { earned: n(data.quiz?.earned), cap: n(data.quiz?.cap) },
    games: { shark_cage: g('shark_cage'), vampire_villager: g('vampire_villager') },
    events: n(data.events),
  };
}

/** Bir oyunun bu ayki puan hedefi (uzaktan + yan yana): toplam hedef ve kalan */
export function goalOf(goals: GameGoals, game: GoalGame | 'quiz'): { left: number; cap: number } {
  if (game === 'quiz') return { cap: goals.quiz.cap, left: Math.max(0, goals.quiz.cap - goals.quiz.earned) };
  const e = goals.games[game];
  return {
    cap: goals.remote_cap + goals.side_cap,
    left: Math.max(0, goals.remote_cap - e.remote) + Math.max(0, goals.side_cap - e.side),
  };
}

// ---------------------------------------------------------------------------
// Oyun sonucum (oyun bitince: kaçıncı sırada bitirdim, kaç puan yazıldı)
// ---------------------------------------------------------------------------

export type MyGameResult = {
  /** Bu oyunda bitirilen sıra (eşit bitirenlerde ortalama sıraya göre en iyi sıra) */
  best_rank: number | null;
  players: number | null;
  /** Sıranın puan değeri */
  result_points: number;
  /** Hesaba gerçekten yazılan puan (günlük/aylık sınır dolduysa 0) */
  awarded: number;
  /** 'ok' puan yazıldı · 'cap' günlük/aylık sınır doldu · 'too_few' puan için oyuncu az · 'none' sonuç yok */
  note: 'ok' | 'cap' | 'too_few' | 'none';
};

export async function getMyGameResult(roomId: string): Promise<MyGameResult | null> {
  const { data } = await callRpc<MyGameResult[]>('my_game_result', { p_room_id: roomId });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    best_rank: row.best_rank === null ? null : Number(row.best_rank),
    players: row.players === null ? null : Number(row.players),
    result_points: Number(row.result_points),
    awarded: Number(row.awarded),
    note: row.note,
  };
}

/** 0,5'e yuvarlar (sunucudaki round(x × 2) / 2 ile aynı; artı sayılar için) */
function half(x: number): number {
  return Math.round(x * 2 + 1e-9) / 2;
}

/**
 * 1. sıranın puanı (kalabalık çarpanı, sunucudaki _game_top_points ile aynı):
 * oyuncu sayısı × (1 + 0,1 × (oyuncu sayısı − 4)), 0,5'e yuvarlı, en çok `cap`. 4→4 · 5→5,5 · 6→7 · 8→11 · 10→16 · 12→21,5.
 */
export function topPoints(players: number, cap: number): number {
  return Math.min(cap, half(players * (1 + 0.1 * Math.max(0, players - 4))));
}

/**
 * Sıraya göre oyun puanı (sunucudaki formülün aynısı, ekranda örnek göstermek için):
 * 1. sıranın puanı × (oyuncu sayısı − sıra + 1) ÷ oyuncu sayısı, 0,5'e yuvarlanır, en az 1.
 */
export function placePoints(players: number, place: number, cap: number): number {
  if (players < 1 || place < 1 || place > players) return 0;
  return Math.max(1, half((topPoints(players, cap) * (players - place + 1)) / players));
}

/** Etkinlik katılım puanı (kalabalığa göre basamak, sunucudaki _event_attend_pts ile aynı) */
export function attendPoints(rules: PointRules, attendees: number, official = false): number {
  const base =
    attendees >= 40
      ? rules.eventAttend40
      : attendees >= 20
        ? rules.eventAttend20
        : attendees >= 10
          ? rules.eventAttend10
          : rules.eventAttend;
  return base + (official ? rules.eventAttendOfficialBonus : 0);
}

/** Katılım basamakları tek satırda: "4–9 kişi +30 · 10–19 +35 · 20–39 +40 · 40+ +50" */
export function attendTiersText(r: PointRules): string {
  return `4–9 kişi +${r.eventAttend} · 10–19 +${r.eventAttend10} · 20–39 +${r.eventAttend20} · 40+ kişi +${r.eventAttend40}`;
}
