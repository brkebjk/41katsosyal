// Edge Function: sync-premium
//
// Uygulama bir satın alma ya da "geri yükle" sonrası bunu çağırır. İşlev, giriş yapmış üyenin
// mağaza aboneliğini RevenueCat'ten KENDİSİ sorar (uygulamanın söylediğine güvenmez) ve sonucu
// veritabanına yazar. Üyenin premium'u yalnızca bu yolla (ya da moderatör eliyle) açılır.
//
// Gerekli gizli değerler (Supabase > Edge Functions > Secrets):
//   REVENUECAT_SECRET_KEY   RevenueCat "Secret API key" (sk_ ile başlar). Uygulamaya ASLA konmaz.
//   REVENUECAT_ENTITLEMENT  (isteğe bağlı) RevenueCat'te oluşturduğun hak adı. Varsayılan: premium
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RC_KEY = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';
const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium';
const LIFETIME = '2100-01-01T00:00:00Z';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Hakkın bitiş zamanı; hak yoksa ya da bittiyse null. Ödeme sorunu "ek süre" varsa o da sayılır. */
function entitlementUntil(ent: Record<string, unknown> | undefined): string | null {
  if (!ent) return null;
  if (ent.expires_date === null) return LIFETIME;
  const times = [ent.expires_date, ent.grace_period_expires_date]
    .map((v) => (typeof v === 'string' ? Date.parse(v) : NaN))
    .filter((t) => Number.isFinite(t));
  const best = times.length ? Math.max(...times) : 0;
  return best > Date.now() ? new Date(best).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RC_KEY) return json({ error: 'not_configured' }, 500);

  // 1) Kim çağırıyor? (giriş yapmış üyenin oturum anahtarı doğrulanır)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  // 2) Mağaza bilgisini RevenueCat'ten sor
  let until: string | null;
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return json({ error: 'store_lookup_failed' }, 502);
    const body = await res.json();
    until = entitlementUntil(body?.subscriber?.entitlements?.[ENTITLEMENT]);
  } catch {
    return json({ error: 'store_lookup_failed' }, 502);
  }

  // 3) Veritabanına işle (bu işlevi yalnızca sunucu çağırabilir)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin.rpc('service_set_store_premium', { p_user: userId, p_until: until });
  if (error) return json({ error: 'save_failed' }, 500);

  return json({ store_active: until !== null, until });
});
