// Sunucu (Supabase) bağlantısı.
//
// Adres ve anahtar `.env` dosyasından okunur (bkz. .env.example).
// Not: Buraya yalnızca "publishable / anon" anahtarı girilir. Bu anahtar uygulamanın
// içinde durması için tasarlanmıştır, güvenlik kuralları sunucu tarafında (SQL'deki
// RLS kuralları) uygulanır. "service_role" anahtarı ASLA uygulamaya konmaz.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** .env dosyası doldurulmuşsa true */
export const isBackendReady = Boolean(url && anonKey);

/** Bağlantı hazır değilse null döner; uygulama yine de açılır. */
export const supabase: SupabaseClient | null = isBackendReady
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
