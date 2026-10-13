// Kimlik doğrulama açık mı? (sunucudaki `identity_verification_enabled` ayarı; varsayılan KAPALI)
// NVİ'nin ücretsiz doğrulama servisi kapandığı için yeni yöntem bağlanana kadar kapalıdır. Kapalıyken doğrulama düğmeleri,
// hatırlatmaları ve "doğrulanmamış üye ödül alamaz" uyarıları gösterilmez.

import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

let enabled = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Ayarı sunucudan okur (uygulama açılışında bir kez; `force` ile yeniden) */
export function loadIdentityFlag(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'identity_verification_enabled')
      .maybeSingle();
    if (error) {
      loading = null; // giriş yapılınca yeniden denenir
      return;
    }
    const v = (data as { value: unknown } | null)?.value;
    const next = v === true || v === 'true';
    if (next !== enabled) {
      enabled = next;
      listeners.forEach((l) => l());
    }
  })();
  return loading;
}

/** Kancasız yerler için (ör. bilgi metinleri): bilinen son değer */
export function identityEnabledNow(): boolean {
  if (!loading) void loadIdentityFlag();
  return enabled;
}

const current = () => enabled;

export function useIdentityEnabled(): boolean {
  const v = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    void loadIdentityFlag();
  }, []);
  return v;
}
