// Web paneli sunucu bağlantısı. Yalnızca "publishable / anon" anahtar kullanılır; bütün yetki kontrolleri sunucudadır
// (moderatör olmayan biri paneli açsa bile hiçbir veriyi göremez ve hiçbir işlem yapamaz).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isBackendReady = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isBackendReady
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kat41-admin' },
    })
  : null;

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
