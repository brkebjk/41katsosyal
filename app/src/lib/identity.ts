// Profil > Hesabı doğrula: TC kimlik no, ad, soyad ve doğum yılı NVİ'nin kimlik doğrulama servisine sorulur.
// Sorguyu uygulama değil sunucu (Edge Function `verify-identity`) yapar; TC kimlik numarası hiçbir yere kaydedilmez.

import { supabase } from '@/lib/supabase';

export type IdentityInput = { tc: string; firstName: string; lastName: string; birthYear: string };

const RESULT_TEXT: Record<string, string> = {
  invalid_tc: 'TC kimlik numarası geçersiz görünüyor. 11 haneyi kontrol et.',
  invalid_name: 'Adını ve soyadını nüfus cüzdanındaki gibi, yalnızca harflerle yaz.',
  invalid_year: 'Doğum yılını 4 haneli yaz (ör. 1995).',
  mismatch:
    'Bilgiler nüfus kaydıyla uyuşmadı. Adını (varsa ikinci adınla), soyadını ve doğum yılını kimliğindeki gibi yaz.',
  rate_limited: 'Bugün çok fazla deneme yaptın. Yarın tekrar deneyebilirsin.',
  used: 'Bu kimlik bilgileriyle başka bir hesap doğrulanmış. Bir kişi yalnızca bir hesabı doğrulayabilir.',
  already: 'Hesabın zaten doğrulanmış.',
  not_allowed: 'Bu hesap doğrulanamaz.',
  nvi_unavailable: 'Nüfus kayıt servisine şu an ulaşılamıyor. Biraz sonra tekrar dene.',
  not_configured: 'Hesap doğrulama henüz açılmadı. Biraz sonra tekrar dene.',
};

/** TC kimlik numarasının resmi kontrol haneleri tutuyor mu? (sunucu da ayrıca denetler) */
export function tcLooksValid(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

export async function verifyIdentity(input: IdentityInput): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) return { ok: false, error: 'Sunucu bağlantısı kurulmadı.' };
  try {
    const { data, error } = await supabase.functions.invoke('verify-identity', {
      method: 'POST',
      body: {
        tc: input.tc,
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: Number(input.birthYear),
      },
    });
    if (error || !data) return { ok: false, error: 'Doğrulama yapılamadı. İnternet bağlantını kontrol edip tekrar dene.' };
    const result = String((data as { result?: unknown }).result ?? '');
    if (result === 'ok') return { ok: true, error: null };
    return { ok: false, error: RESULT_TEXT[result] ?? 'Doğrulama yapılamadı. Biraz sonra tekrar dene.' };
  } catch {
    return { ok: false, error: 'Doğrulama yapılamadı. İnternet bağlantını kontrol edip tekrar dene.' };
  }
}
