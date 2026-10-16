// Profil > Hesabı doğrula: TC kimlik no, ad, soyad ve doğum tarihi (gün, ay, yıl) NVİ'nin kimlik doğrulama servisine sorulur.
// Sorguyu uygulama değil sunucu (Edge Function `verify-identity`) yapar; TC kimlik numarası hiçbir yere kaydedilmez.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

export type IdentityInput = {
  tc: string;
  firstName: string;
  lastName: string;
  birthDay: number;
  birthMonth: number;
  birthYear: number;
};

const RESULT_TEXT: Record<string, string> = {
  invalid_tc: 'TC kimlik numarası geçersiz görünüyor. 11 haneyi kontrol et.',
  invalid_name: 'Adını ve soyadını nüfus cüzdanındaki gibi, yalnızca harflerle yaz.',
  invalid_year: 'Doğum tarihini gün, ay ve yıl olarak kimliğindeki gibi yaz (ör. 7 / 3 / 1995).',
  invalid_date: 'Doğum tarihini gün, ay ve yıl olarak kimliğindeki gibi yaz (ör. 7 / 3 / 1995).',
  mismatch:
    'Bilgiler nüfus kaydıyla uyuşmadı. Adını (varsa ikinci adınla), soyadını ve doğum tarihini (gün, ay, yıl) kimliğindeki gibi yaz.',
  date_mismatch:
    'Adın, soyadın ve doğum yılın uyuştu ama doğum günü ya da ayı uyuşmadı. Kimliğindeki gibi yaz; sorun sürerse Profil > Sorun bildir ile haber ver. (N-D)',
  rate_limited: 'Bugün çok fazla deneme yaptın. Yarın tekrar deneyebilirsin.',
  used: 'Bu kimlik bilgileriyle başka bir hesap doğrulanmış. Bir kişi yalnızca bir hesabı doğrulayabilir.',
  already: 'Hesabın zaten doğrulanmış.',
  not_allowed: 'Bu hesap doğrulanamaz.',
  disabled: 'Kimlik doğrulama şu an kullanılamıyor. Yakında yeniden açılacak.',
  nvi_unavailable: 'Nüfus kayıt servisine şu an ulaşılamıyor. Bu deneme hakkından sayılmadı; biraz sonra tekrar dene.',
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
        birthDay: input.birthDay,
        birthMonth: input.birthMonth,
        birthYear: input.birthYear,
      },
    });
    if (error) return { ok: false, error: await invokeErrorText(error) };
    const result = String((data as { result?: unknown } | null)?.result ?? '');
    if (result === 'ok') return { ok: true, error: null };
    if (result === 'nvi_unavailable') {
      const detail = String((data as { detail?: unknown }).detail ?? '');
      return { ok: false, error: `${RESULT_TEXT.nvi_unavailable}${detail ? ` (N-${detail})` : ''}` };
    }
    return { ok: false, error: RESULT_TEXT[result] ?? `Doğrulama yapılamadı. Biraz sonra tekrar dene. (${result || 'K0'})` };
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene. (K4)' };
  }
}

// ---------------------------------------------------------------------------
// Doğrulama ekranına yönlendirme ve akıştaki günlük hatırlatma
// ---------------------------------------------------------------------------

let pendingVerify = false;

/** Profil sekmesini açar ve “Hesabı doğrula” penceresini gösterir (her ekrandan çağrılabilir). */
export function openIdentityVerify(): void {
  pendingVerify = true;
  router.navigate('/profile');
}

/** Profil ekranı açılınca: doğrulama penceresi istenmiş mi? (bir kez okunur) */
export function takeIdentityVerifyRequest(): boolean {
  const v = pendingVerify;
  pendingVerify = false;
  return v;
}

const REMIND_KEY = (userId: string) => `peoplehere.verifyReminder.${userId}`;
/** Türkiye saatiyle bugünün tarihi (YYYY-AA-GG) */
const todayTr = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Akış ekranına girince doğrulama hatırlatması gösterilsin mi? “Bir daha gösterme” seçilmediyse günde bir kez (o günün
 * ilk akış ziyaretinde) evet döner ve bugünü işaretler.
 */
export async function takeVerifyReminder(userId: string): Promise<boolean> {
  try {
    const saved = await AsyncStorage.getItem(REMIND_KEY(userId));
    if (saved === 'never' || saved === todayTr()) return false;
    await AsyncStorage.setItem(REMIND_KEY(userId), todayTr());
    return true;
  } catch {
    return false;
  }
}

/** “Bunu bir daha gösterme” */
export async function muteVerifyReminder(userId: string): Promise<void> {
  await AsyncStorage.setItem(REMIND_KEY(userId), 'never').catch(() => {});
}
