// Üyelik hakları: ücretsiz üye ile abonenin aylık hakları.
//
// Sayılar sunucudaki `app_settings` tablosundan okunur (moderatör değiştirebilir). Okunamazsa
// aşağıdaki varsayılanlar gösterilir. Gerçek sınırı her zaman sunucu uygular; bu sayılar yalnızca
// ekranda anlatmak içindir.

import { supabase } from '@/lib/supabase';

export type Limits = {
  freeEvents: number;
  freeGames: number;
  subscriptionEvents: number;
  subscriptionGames: number;
};

export const DEFAULT_LIMITS: Limits = { freeEvents: 1, freeGames: 3, subscriptionEvents: 4, subscriptionGames: 10 };

const KEYS: Record<string, keyof Limits> = {
  free_monthly_event_quota: 'freeEvents',
  free_monthly_game_quota: 'freeGames',
  premium_monthly_event_quota: 'subscriptionEvents',
  premium_monthly_game_quota: 'subscriptionGames',
};

export async function getLimits(): Promise<Limits> {
  if (!supabase) return DEFAULT_LIMITS;
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', Object.keys(KEYS));
  if (error || !data) return DEFAULT_LIMITS;
  const out: Limits = { ...DEFAULT_LIMITS };
  for (const row of data as { key: string; value: unknown }[]) {
    const field = KEYS[row.key];
    const n = Number(row.value);
    if (field && Number.isInteger(n) && n >= 0 && n <= 999) out[field] = n;
  }
  return out;
}

/** "ayda 3 oyun" gibi kısa bir hak cümlesi için sayıyı yazıya döker. */
export function monthly(n: number, noun: string): string {
  return `ayda ${n} ${noun}`;
}
