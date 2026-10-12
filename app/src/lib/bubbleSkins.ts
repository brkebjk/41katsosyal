// Konuşma balonu renkleri. Akıştaki gönderi ve yorumlar bu renklerle çizilir.
// Renkler Canva'daki "Konuşma Balonları" tasarımından alındı (sade, düz renk).
// Bir oyunun en yüksek başarımına ulaşınca o oyunun balon rengi kazanılır (kural sunucuda).

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { colors } from '@/theme';

export type SkinColors = {
  /** Balonun içi */
  fill: string;
  /** Balonun ince kenar çizgisi */
  border: string;
  /** Balondaki yazı */
  text: string;
};

/** Anahtarlar veritabanındaki `bubble_skins.key` ile birebir aynıdır. */
export const SKIN_COLORS: Record<string, SkinColors> = {
  // Standart balon uygulamanın koyu temasına uyar; renkli balonlar kazanılan ödüldür.
  standard: { fill: colors.surfaceAlt, border: '#2F3A57', text: colors.text },
  raffle: { fill: '#FFF1CC', border: '#E8B931', text: '#4A3600' },
  vampire_villager: { fill: '#F6DDE3', border: '#8E2F4A', text: '#4A1424' },
  taboo: { fill: '#E8E0F8', border: '#7B5CC4', text: '#2D1B5E' },
  charades: { fill: '#D6F1EE', border: '#1F9C8F', text: '#0B4A44' },
  find_killer: { fill: '#DCE8FB', border: '#3B6FD0', text: '#11295C' },
  quiz: { fill: '#DDF1DF', border: '#3A9A4D', text: '#14471F' },
};

/** Bilinmeyen ya da boş anahtar (ör. sunucu henüz güncellenmediyse) standart balona döner. */
export function skinColors(key: string | null | undefined): SkinColors {
  return (key && SKIN_COLORS[key]) || SKIN_COLORS.standard;
}

/** Balonlarım ekranında gösterilen oyun sırası */
export const SKIN_ORDER = [
  'standard',
  'vampire_villager',
  'find_killer',
  'quiz',
  'taboo',
  'charades',
  'raffle',
] as const;

export type MySkin = {
  key: string;
  label: string;
  game_type: string;
  required_plays: number;
  plays: number;
  unlocked: boolean;
  selected: boolean;
};

const SKIN_TEXT: Record<string, string> = {
  skin_locked: 'Bu balonu henüz kazanmadın. O oyunun en yüksek başarımına ulaşınca açılır.',
  skin_not_found: 'Bu balon bulunamadı.',
};

export async function listMySkins(): Promise<{ data: MySkin[]; error: string | null }> {
  const { data, error } = await callRpc<MySkin[]>('my_bubble_skins', {}, SKIN_TEXT);
  const rows = (data ?? []).map((r) => ({
    ...r,
    plays: Number(r.plays),
    required_plays: Number(r.required_plays),
  }));
  rows.sort((a, b) => SKIN_ORDER.indexOf(a.key as never) - SKIN_ORDER.indexOf(b.key as never));
  return { data: rows, error };
}

export async function setMySkin(key: string): Promise<Result> {
  return callRpcVoid('set_bubble_skin', { p_skin: key }, SKIN_TEXT);
}
