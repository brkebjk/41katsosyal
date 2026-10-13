// Web paneli sunucu bağlantısı. Yalnızca "publishable / anon" anahtar kullanılır; bütün yetki kontrolleri sunucudadır
// (moderatör olmayan biri paneli açsa bile hiçbir veriyi göremez ve hiçbir işlem yapamaz).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cloudflare'e değer yapıştırılırken gelebilecek boşluk ve tırnakları temizler */
function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

const url = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Ayar sorunu varsa ekranda gösterilecek açıklama (yoksa boş) */
export let configProblem: string | null = null;

function makeClient(): SupabaseClient | null {
  if (!url || !anonKey) {
    configProblem =
      'Sunucu adresi ya da anahtarı girilmemiş. Cloudflare > projen > Settings > Variables and Secrets bölümünde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlanmalı.';
    return null;
  }
  if (!/^https:\/\/[^\s/]+$/.test(url)) {
    configProblem = `VITE_SUPABASE_URL değeri geçersiz görünüyor (“${url.slice(0, 60)}”). https://xxxx.supabase.co biçiminde olmalı; sonunda / ya da başka bir şey olmamalı.`;
    return null;
  }
  try {
    return createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kat41-admin' },
    });
  } catch (e) {
    configProblem = `Sunucu bağlantısı kurulamadı: ${String(e)}`;
    return null;
  }
}

export const supabase: SupabaseClient | null = makeClient();
export const isBackendReady = supabase !== null;

const LOGIN_DOMAIN = import.meta.env.VITE_LOGIN_DOMAIN || 'uye.kat41sosyal.app';

/** Mobil uygulamadaki gibi: kullanıcı adı giriş adresine çevrilir ("@" içeriyorsa olduğu gibi) */
export function loginEmail(input: string): string {
  const t = input.trim();
  if (t.includes('@')) return t.toLowerCase();
  return `${t.toLowerCase().replace(/\s+/g, '')}@${LOGIN_DOMAIN}`;
}

/** Herkese açık kutudaki dosyanın adresi */
export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
