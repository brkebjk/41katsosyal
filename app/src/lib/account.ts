// Hesap: kullanıcı adıyla giriş, kurtarma kelimeleri, hesap durumu ve uygulama metinleri.
//
// E-posta yoktur: kullanıcı adı, giriş sisteminin istediği biçime çevrilir (ad@LOGIN_DOMAIN). Bu adrese hiçbir
// zaman e-posta gönderilmez (Supabase'de "Confirm email" kapalı olmalı). Kullanıcı adı hiçbir üyeye gösterilmez.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

const LOGIN_DOMAIN = process.env.EXPO_PUBLIC_LOGIN_DOMAIN || 'uye.kat41sosyal.app';

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const USERNAME_HINT = '3–20 karakter: küçük harf (a–z), rakam, nokta ya da alt çizgi. Türkçe harf kullanma.';

/** Yazılan kullanıcı adını sadeleştirir: boşluklar atılır, küçük harfe çevrilir. */
export function cleanUsername(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

/** Giriş için kullanılacak adres. "@" içeren yazı eski (e-postalı) hesaptır, olduğu gibi kullanılır. */
export function loginEmail(input: string): string {
  const t = input.trim();
  if (t.includes('@')) return t.toLowerCase();
  return `${cleanUsername(t)}@${LOGIN_DOMAIN}`;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (password.length > 72) return 'Şifre en çok 72 karakter olabilir.';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
    return 'Şifre en az bir harf ve bir rakam içermeli.';
  }
  return null;
}

export type SignupCheck =
  | 'ok'
  | 'invalid_username'
  | 'reserved_name'
  | 'username_taken'
  | 'device_required'
  | 'device_used';

export const SIGNUP_CHECK_TEXT: Record<Exclude<SignupCheck, 'ok'>, string> = {
  invalid_username: `Kullanıcı adı uygun değil. ${USERNAME_HINT}`,
  reserved_name: 'Bu kullanıcı adı kullanılamaz. “41kat”, “moderatör” veya “yönetici” içeren adlar ayrılmıştır.',
  username_taken: 'Bu kullanıcı adı alınmış. Başka bir ad dene.',
  device_required: 'Bu telefon tanınamadı. Uygulamayı kapatıp yeniden aç.',
  device_used:
    'Bu telefondan daha önce bir hesap açılmış. Her telefondan yalnızca 1 hesap açılabilir. Hesabına giremiyorsan “Şifremi unuttum”u dene ya da bize ulaş.',
};

export async function checkSignup(
  username: string,
  deviceId: string,
): Promise<{ result: SignupCheck | null; error: string | null }> {
  const { data, error } = await callRpc<SignupCheck>('check_signup', {
    p_username: username,
    p_device: deviceId,
  });
  return { result: data, error };
}

export type AccountStatus = {
  session: 'ok' | 'replaced' | 'banned' | 'none';
  username: string | null;
  has_recovery: boolean;
  needs_recovery: boolean;
  /** Oyun davetlerini alıyor mu? (Oyunlar sekmesindeki mandal) */
  game_invites?: boolean;
  /** Boş = sınırsız (moderatör), 0 = hak kalmadı */
  name_changes_left: number | null;
};

/** Hesap durumunu okur. Ağ hatasında boş döner (oturum kapatılmaz). */
export async function getAccountStatus(): Promise<AccountStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_account_status');
  if (error || !data) return null;
  return data as AccountStatus;
}

/** Bu oturumu hesabın tek geçerli oturumu yapar (girişten hemen sonra). */
export async function claimSession(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('claim_session');
  } catch {
    /* ağ hatası: bir sonraki girişte yeniden denenir */
  }
}

const RECOVERY_TEXT: Record<string, string> = {
  password_wrong: 'Şifren yanlış.',
  too_many_attempts: 'Çok fazla yanlış deneme yapıldı. 1 saat sonra tekrar dene.',
  no_username: 'Bu hesap e-postayla açılmış; kurtarma kelimeleri yalnızca kullanıcı adıyla açılan hesaplarda kullanılır.',
  recovery_missing: 'Kurtarma kelimeleri bulunamadı. Yeniden oluştur.',
  weak_password: 'Yeni şifre en az 8 karakter olmalı, harf ve rakam içermeli.',
};

/** 12 kurtarma kelimesini üretir. Kelimeler bir daha gösterilmez. Yenilemede mevcut şifre gerekir. */
export async function createRecoveryPhrase(
  password?: string,
): Promise<{ words: string[] | null; error: string | null }> {
  const { data, error } = await callRpc<string[]>(
    'create_recovery_phrase',
    password ? { p_password: password } : {},
    RECOVERY_TEXT,
  );
  if (error) return { words: null, error };
  if (!Array.isArray(data) || data.length !== 12) return { words: null, error: 'Kelimeler oluşturulamadı.' };
  return { words: data, error: null };
}

export async function confirmRecoveryPhrase(): Promise<Result> {
  return callRpcVoid('confirm_recovery_phrase', {}, RECOVERY_TEXT);
}

/** Şifre sıfırlama: kullanıcı adı + 12 kelime + yeni şifre. */
export async function recoverAccount(
  username: string,
  phrase: string,
  newPassword: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await callRpc<{ ok: boolean; reason?: string }>(
    'recover_account',
    { p_username: cleanUsername(username), p_phrase: phrase, p_new_password: newPassword },
    RECOVERY_TEXT,
  );
  if (error) return { ok: false, error };
  if (data?.ok) return { ok: true, error: null };
  const reason = data?.reason;
  return {
    ok: false,
    error:
      reason === 'format'
        ? 'Kullanıcı adını ve 12 kelimenin hepsini, aralarında boşluk bırakarak yaz.'
        : reason === 'banned'
          ? 'Bu hesap askıya alınmış. Bize ulaş.'
          : 'Kullanıcı adı ya da kelimeler yanlış. Kelimeleri sırasıyla yazdığından emin ol.',
  };
}

export type AppTextKey =
  | 'legal_terms'
  | 'legal_consent'
  | 'legal_kvkk'
  | 'support_contact'
  | 'legal_privacy'
  | 'faq';

export const APP_TEXT_TITLE: Record<AppTextKey, string> = {
  legal_terms: 'Kullanıcı sözleşmesi',
  legal_consent: 'Açık rıza metni',
  legal_kvkk: 'KVKK aydınlatma metni',
  support_contact: 'Bize ulaşın',
  legal_privacy: 'Gizlilik politikası',
  faq: 'Sıkça sorulan sorular',
};

/** Profil > Web sitesi düğmesinin adresi (sunucudaki website_url ayarı; boşsa null) */
export async function getWebsiteUrl(): Promise<string | null> {
  const { data } = await callRpc<string>('app_text', { p_key: 'website_url' });
  const url = typeof data === 'string' ? data.trim() : '';
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Uygulama metni (giriş yapmadan da okunur). */
export async function getAppText(key: AppTextKey): Promise<{ text: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('app_text', { p_key: key });
  return { text: typeof data === 'string' ? data : null, error };
}
