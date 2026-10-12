// Mağazadaki aboneliği sunucuya işletir.
//
// Abonelik kaydı yalnızca sunucuda (Edge Function `sync-abonelik`) tutulur: işlevi mağaza bilgisini
// RevenueCat'ten kendisi doğrular. Uygulama "abonelik oldum" diye bir şey bildiremez.

import { supabase } from '@/lib/supabase';

export type SyncResult = { ok: boolean; storeActive: boolean };

export async function syncSubscription(): Promise<SyncResult> {
  if (!supabase) return { ok: false, storeActive: false };
  try {
    const { data, error } = await supabase.functions.invoke('sync-premium', { method: 'POST' });
    if (error || !data) return { ok: false, storeActive: false };
    return { ok: true, storeActive: Boolean((data as { store_active?: boolean }).store_active) };
  } catch {
    return { ok: false, storeActive: false };
  }
}
