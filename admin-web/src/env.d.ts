/// <reference types="vite/client" />

/** Ortak (mobil uygulamadan gelen) kodda kullanılan geliştirme bayrağı; web'de her zaman kapalı */
declare const __DEV__: boolean;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LOGIN_DOMAIN?: string;
}
