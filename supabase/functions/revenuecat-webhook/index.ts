// Edge Function: revenuecat-webhook
//
// RevenueCat; yenileme, iptal, süre bitimi ve iade gibi olaylarda burayı çağırır. Böylece üye
// uygulamayı açmasa da premium doğru zamanda uzar ya da biter. Olayın içeriğine güvenilmez:
// ilgili üyenin aboneliği RevenueCat'ten yeniden sorulur.
//
// Kurulum: bu işlevi "Verify JWT" KAPALI olarak yayınla (RevenueCat giriş anahtarı göndermez).
// Güvenlik, aşağıdaki ortak parola ile sağlanır.
//
// Gerekli gizli değerler:
//   REVENUECAT_SECRET_KEY      RevenueCat "Secret API key"
//   REVENUECAT_WEBHOOK_SECRET  Kendi belirlediğin uzun rastgele parola. RevenueCat > Webhooks >
//                              "Authorization header value" alanına da aynısı yazılır.
//   REVENUECAT_ENTITLEMENT     (isteğe bağlı) hak adı. Varsayılan: premium

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RC_KEY = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium';
const LIFETIME = '2100-01-01T00:00:00Z';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entitlementUntil(ent: Record<string, unknown> | undefined): string | null {
  if (!ent) return null;
  if (ent.expires_date === null) return LIFETIME;
  const times = [ent.expires_date, ent.grace_period_expires_date]
    .map((v) => (typeof v === 'string' ? Date.parse(v) : NaN))
    .filter((t) => Number.isFinite(t));
  const best = times.length ? Math.max(...times) : 0;
  return best > Date.now() ? new Date(best).toISOString() : null;
}

/** Parolayı süre farkı sızdırmadan karşılaştırır. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  if (!SUPABASE_URL || !SERVICE_KEY || !RC_KEY || !WEBHOOK_SECRET) return new Response('not_configured', { status: 500 });

  const header = req.headers.get('Authorization') ?? '';
  if (!sameSecret(header, WEBHOOK_SECRET) && !sameSecret(header, `Bearer ${WEBHOOK_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = ((await req.json()) as { event?: Record<string, unknown> }).event ?? {};
  } catch {
    return new Response('bad_request', { status: 400 });
  }

  // Olayda geçen üye kimlikleri (hesap taşıma olaylarında birden fazla olabilir). Yalnızca uygulamanın
  // kullandığı biçim (Supabase kullanıcı numarası) işlenir; "anonim" kimlikler atlanır.
  const raw: unknown[] = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
  ];
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].slice(0, 10);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let failed = false;
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${RC_KEY}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) { failed = true; continue; }
      const body = await res.json();
      const until = entitlementUntil(body?.subscriber?.entitlements?.[ENTITLEMENT]);
      const { error } = await admin.rpc('service_set_store_premium', { p_user: id, p_until: until });
      // Üye silinmişse (user_not_found) yapılacak bir şey yok; yeniden denemeye gerek de yok.
      if (error && !String(error.message).includes('user_not_found')) failed = true;
    } catch {
      failed = true;
    }
  }

  // Hata durumunda 500 dönülür; RevenueCat olayı bir süre sonra yeniden gönderir.
  return new Response(failed ? 'retry' : 'ok', { status: failed ? 500 : 200 });
});
