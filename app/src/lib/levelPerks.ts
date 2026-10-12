// Seviye ödülleri: her seviyenin ödülü sunucudaki `levels.perk` alanından gelir; burada yalnızca yazıları durur.
// Ödüller birikmez (yalnızca bulunduğun seviyenin ödülü geçerlidir) ve her ay yeniden verilir.

export type LevelPerk = 'game_plus1' | 'event_plus1' | 'quiz_mult' | 'unlimited_lives';

/** Seviye 4 ödülünün çarpanı (sunucuda level_quiz_mult_pct = 120) */
export const LEVEL_QUIZ_MULT = 1.2;

const PERK_TEXT: Record<LevelPerk, string> = {
  game_plus1: '+1 oyun hakkı',
  event_plus1: '+1 etkinlik hakkı',
  quiz_mult: `Bilgi Yarışması puanı ×${String(LEVEL_QUIZ_MULT).replace('.', ',')}`,
  unlimited_lives: 'Bilgi Yarışması’nda sınırsız can',
};

/** Seviyenin ödülünün kısa yazısı. Ödülü olmayan seviye için "Özellik yok". */
export function perkText(perk: string | null | undefined): string {
  return perk && perk in PERK_TEXT ? PERK_TEXT[perk as LevelPerk] : 'Özellik yok';
}

/** Seviye ödüllerinin kuralları (Başarımlar ve kurallar ekranlarında aynı metin) */
export const LEVEL_RULES: string[] = [
  'Seviyen toplam puanına göre belirlenir ve düşmez. Yalnızca bulunduğun seviyenin ödülünü alırsın; önceki seviyelerin ödülleri birikmez.',
  'Ödüller her ayın başında, aylık puan sıralaması sıfırlanırken yeniden verilir.',
  'Haklar biriktirilemez: o ay kullanmadığın oyun ya da etkinlik hakkı ay sonunda silinir, sonraki aya geçmez.',
  `Seviye 4 çarpanı (×${String(LEVEL_QUIZ_MULT).replace('.', ',')}) Bilgi Yarışması’ndan kazandığın puana ve günlük, aylık, özel oda puan sınırlarına birlikte uygulanır.`,
  'Sınırsız can, Bilgi Yarışması’ndaki günlük oyun sınırını kaldırmaz.',
];
