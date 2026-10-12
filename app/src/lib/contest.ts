// Aylık hediye programı (gerçek hayatta ilk 3'e hediye). Bütün değerler sunucudaki `app_settings` tablosundadır;
// moderatör SQL ile doldurur (bkz. PUAN_SISTEMI.md). Program varsayılan olarak KAPALI gelir.

import { supabase } from '@/lib/supabase';

export type Contest = {
  /** Açık değilse sıralama ekranında hediyeden hiç söz edilmez */
  active: boolean;
  organizer: string;
  contact: string;
  prizes: string;
  /** Dönem bittikten en geç kaç gün içinde hediyeler duyurulur ve verilir */
  awardDays: number;
};

export const DEFAULT_CONTEST: Contest = {
  active: false,
  organizer: '',
  contact: '',
  prizes: '',
  awardDays: 15,
};

export async function getContest(): Promise<Contest> {
  if (!supabase) return DEFAULT_CONTEST;
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'contest_active',
      'contest_organizer',
      'contest_contact',
      'contest_prizes',
      'contest_award_days',
    ]);
  if (error || !data) return DEFAULT_CONTEST;
  const out: Contest = { ...DEFAULT_CONTEST };
  for (const row of data as { key: string; value: unknown }[]) {
    const v = row.value;
    if (row.key === 'contest_active') out.active = v === true || v === 'true';
    else if (row.key === 'contest_organizer') out.organizer = typeof v === 'string' ? v.trim() : '';
    else if (row.key === 'contest_contact') out.contact = typeof v === 'string' ? v.trim() : '';
    else if (row.key === 'contest_prizes') out.prizes = typeof v === 'string' ? v.trim() : '';
    else if (row.key === 'contest_award_days') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 90) out.awardDays = Math.round(n);
    }
  }
  return out;
}

/** Hediye programı açılmaya hazır mı? Düzenleyen, iletişim ve hediye metni dolu olmalı. */
export function contestReady(c: Contest): boolean {
  return c.organizer.length > 0 && c.contact.length > 0 && c.prizes.length > 0;
}

/**
 * Hediyeden söz etmek için hem program açık hem de kural metni dolu olmalı.
 * Moderatör yanlışlıkla programı açsa bile kuralları eksikse ekranlarda hediye gösterilmez.
 */
export function contestOn(c: Contest): boolean {
  return c.active && contestReady(c);
}
