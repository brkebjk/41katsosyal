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
  not_configured:
    'Hesap doğrulama sunucuda yarım kurulmuş: Supabase > Edge Functions > Secrets bölümünde IDENTITY_PEPPER eksik ya da 32 karakterden kısa. (K5)',
  failed: 'Doğrulama kaydedilemedi: veritabanı güncel değil olabilir (schema.sql yeniden çalıştırılmalı). (K6)',
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

/**
 * İşlev çağrılamadıysa nedenini ayırt eder; ekranda kısa bir kodla gösterilir (destek için):
 * K1 = işlev Supabase'de yok (yayınlanmamış ya da adı farklı), K2 = oturum / "Verify JWT" sorunu,
 * K3 = işlev içinde hata (çoğunlukla IDENTITY_PEPPER eksik), K4 = telefonun internet bağlantısı.
 */
async function invokeErrorText(error: unknown): Promise<string> {
  const name = (error as { name?: string } | null)?.name ?? '';
  const ctx = (error as { context?: unknown } | null)?.context;
  const status = ctx instanceof Response ? ctx.status : typeof (ctx as { status?: unknown })?.status === 'number'
    ? (ctx as { status: number }).status
    : 0;
  if (name === 'FunctionsFetchError') {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene. (K4)';
  }
  if (status === 404) {
    return 'Hesap doğrulama sunucuda henüz kurulmamış: Supabase\'de "verify-identity" işlevi bulunamadı. (K1)';
  }
  if (status === 401 || status === 403) {
    return 'Oturumun doğrulanamadı. Çıkış yapıp yeniden giriş yap; düzelmezse işlevin ayarı kontrol edilmeli. (K2)';
  }
  if (name === 'FunctionsRelayError' || status >= 500) {
    return 'Doğrulama işlevi çalışırken hata oluştu. Supabase ayarları kontrol edilmeli. (K3)';
  }
  return `Doğrulama yapılamadı. Biraz sonra tekrar dene.${status ? ` (K${status})` : ''}`;
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
    if (error) return { ok: false, error: await invokeErrorText(error) };
    const result = String((data as { result?: unknown } | null)?.result ?? '');
    if (result === 'ok') return { ok: true, error: null };
    return { ok: false, error: RESULT_TEXT[result] ?? `Doğrulama yapılamadı. Biraz sonra tekrar dene. (${result || 'K0'})` };
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene. (K4)' };
  }
}
