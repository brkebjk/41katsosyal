// Başarımlar: her oyun için 5 tane. Sayaçlar sunucuda tutulur (bir oda "bitti" olunca, bir hazine bulununca vb. artar);
// buradaki eşikler yalnızca ekranda göstermek içindir. Ödüller (Paket 26) son basamakta sunucuda bir kez verilir:
//  - Vampir–Köylü: 5 görevin hepsi → Vampir balonu + Vampir–Köylü puanları kalıcı ×1,25
//  - Bilgi Yarışması: 10.000 oyun → Bilgi Yarışması balonu + en çok can kalıcı 6
//  - Hazine Avı: 100 hazine → ömür boyu abonelik
//  - diğer oyunlar: en yüksek başarım → o oyunun balon rengi

import type Ionicons from '@expo/vector-icons/Ionicons';

import type { GameKey } from '@/lib/images';
import { callRpc } from '@/lib/rpc';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Vampir–Köylü görev sayaçları (oyun sayısı dışında) */
export type VvStatKey = 'nights' | 'protects' | 'finds' | 'hanged';
export type RewardKey = 'vv_master' | 'quiz_master' | 'treasure_master';

export type Achievement = {
  name: string;
  need: number;
  /** Hangi sayaca bakılır (yoksa o oyunun oynama sayısı) */
  stat?: VvStatKey;
  /** Özel açıklama (yoksa oyunun describe cümlesi) */
  desc?: string;
};

export type GameAchievements = {
  game: GameKey;
  title: string;
  icon: IconName;
  /** "oyna" ya da "katıl" gibi sayıyla birlikte okunan fiil: "5 oyun oyna" */
  describe: (need: number) => string;
  items: Achievement[];
  /** true: basamak değil görev listesi (hepsi bitince ödül) */
  tasks?: boolean;
  /** Sunucunun verdiği ödül (yoksa en yüksek başarımda balon rengi) */
  reward?: { key: RewardKey; text: string };
};

const play = (n: number) => `${n} oyun oyna`;
const nf = (n: number) => n.toLocaleString('tr-TR');

export const ACHIEVEMENTS: GameAchievements[] = [
  {
    game: 'vampire_villager',
    title: 'Vampir–Köylü',
    icon: 'moon',
    describe: (n) => `${nf(n)} oyuna katıl`,
    tasks: true,
    reward: { key: 'vv_master', text: 'Vampir balonu + Vampir–Köylü puanların kalıcı 1,25 kat' },
    items: [
      { name: 'Köyün Müdavimi', need: 100 },
      { name: 'Gece Bekçisi', need: 100, stat: 'nights', desc: '100 gece hayatta kal' },
      { name: 'Köyün Şifacısı', need: 50, stat: 'protects', desc: 'Doktorken 50 kez başka birini koru' },
      { name: 'Darağacı Gedikli', need: 25, stat: 'hanged', desc: '25 kez köy oylamasıyla asıl' },
      { name: 'Vampir Avcısı', need: 200, stat: 'finds', desc: 'Dedektifken 200 kez vampir bul' },
    ],
  },
  {
    game: 'find_killer',
    title: 'Katili Bul',
    icon: 'search',
    describe: play,
    items: [
      { name: 'Dedektif Çırağı', need: 1 },
      { name: 'İz Sürücü', need: 5 },
      { name: 'Sorgu Ustası', need: 10 },
      { name: 'Baş Dedektif', need: 25 },
      { name: 'Katilin Kâbusu', need: 50 },
    ],
  },
  {
    game: 'quiz',
    title: 'Bilgi Yarışması',
    icon: 'help-circle',
    describe: (n) => `${nf(n)} oyun oyna`,
    reward: { key: 'quiz_master', text: 'Bilgi Yarışması balonu + en çok can kalıcı 6' },
    items: [
      { name: 'Isınma Turu', need: 1 },
      { name: 'Bilgi Avcısı', need: 100 },
      { name: 'Yarışma Yıldızı', need: 2500 },
      { name: 'Bilgi Kulesi', need: 5000 },
      { name: 'Bilgi Efsanesi', need: 10000 },
    ],
  },
  {
    game: 'taboo',
    title: 'Tabu',
    icon: 'chatbubble-ellipses',
    describe: play,
    items: [
      { name: 'İlk Kelime', need: 1 },
      { name: 'Dil Cambazı', need: 5 },
      { name: 'Laf Ustası', need: 10 },
      { name: 'Tabu Şampiyonu', need: 25 },
      { name: 'Sözün Efendisi', need: 50 },
    ],
  },
  {
    game: 'charades',
    title: 'Sessiz Sinema',
    icon: 'film',
    describe: play,
    items: [
      { name: 'İlk Sahne', need: 1 },
      { name: 'Mimik Ustası', need: 5 },
      { name: 'Sessiz Yıldız', need: 10 },
      { name: 'Pandomim Sanatçısı', need: 25 },
      { name: 'Sinema Efsanesi', need: 50 },
    ],
  },
  {
    game: 'treasure_hunt',
    title: 'Hazine Avı',
    icon: 'search-circle',
    describe: (n) => `${n} hazine bul`,
    reward: { key: 'treasure_master', text: 'Ömür boyu abonelik' },
    items: [
      { name: 'İlk Hazine', need: 1 },
      { name: 'İz Peşinde', need: 10 },
      { name: 'Define Avcısı', need: 25 },
      { name: 'Şehrin Kâşifi', need: 50 },
      { name: 'Hazine Efsanesi', need: 100 },
    ],
  },
  {
    game: 'raffle',
    title: 'Çekiliş',
    icon: 'ticket',
    describe: (n) => `${n} çekilişe katıl`,
    items: [
      { name: 'İlk Bilet', need: 1 },
      { name: 'Şansını Dene', need: 3 },
      { name: 'Çekiliş Müdavimi', need: 5 },
      { name: 'Şans Meleği', need: 10 },
      { name: 'Çekiliş Kralı', need: 20 },
    ],
  },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.reduce((n, g) => n + g.items.length, 0);

export type AchStats = {
  /** Oyun başına oynama sayısı (hiç oynanmamış oyun yoktur, 0 sayılır) */
  plays: Record<string, number>;
  vv: Partial<Record<VvStatKey, number>>;
  rewards: RewardKey[];
};

export const EMPTY_STATS: AchStats = { plays: {}, vv: {}, rewards: [] };

/** Oyun sayıları, Vampir görev sayaçları ve kazanılan ödüller (yalnızca kendin) */
export async function getPlayCounts(): Promise<{ data: AchStats; error: string | null }> {
  const { data, error } = await callRpc<{
    plays: Record<string, number>;
    vv: Partial<Record<VvStatKey, number>>;
    rewards: RewardKey[];
  }>('my_achievement_stats');
  if (error || !data) return { data: EMPTY_STATS, error };
  const plays: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.plays ?? {})) plays[k] = Number(v) || 0;
  const vv: Partial<Record<VvStatKey, number>> = {};
  for (const [k, v] of Object.entries(data.vv ?? {})) vv[k as VvStatKey] = Number(v) || 0;
  return { data: { plays, vv, rewards: data.rewards ?? [] }, error: null };
}

export type GameProgress = {
  game: GameAchievements;
  plays: number;
  /** Kazanılan başarım sayısı (0–5) */
  earned: number;
  /** Sıradaki başarım; hepsi kazanıldıysa null */
  next: Achievement | null;
  /** Bir başarımın şu anki sayacı */
  valueOf: (a: Achievement) => number;
  /** Ödül kazanıldı mı (balon rengi olan oyunlarda: en yüksek başarım) */
  rewarded: boolean;
};

export function achievementText(game: GameAchievements, a: Achievement): string {
  return a.desc ?? game.describe(a.need);
}

export function progressFor(stats: AchStats): GameProgress[] {
  return ACHIEVEMENTS.map((game) => {
    const plays = stats.plays[game.game] ?? 0;
    const valueOf = (a: Achievement) => (a.stat ? (stats.vv[a.stat] ?? 0) : plays);
    const earned = game.items.filter((a) => valueOf(a) >= a.need).length;
    const rewarded = game.reward ? stats.rewards.includes(game.reward.key) : earned >= game.items.length;
    return { game, plays, earned, next: game.items.find((a) => valueOf(a) < a.need) ?? null, valueOf, rewarded };
  });
}

export function totalEarned(progress: GameProgress[]): number {
  return progress.reduce((n, p) => n + p.earned, 0);
}
