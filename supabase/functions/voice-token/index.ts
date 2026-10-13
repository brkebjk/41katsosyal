// Edge Function: voice-token
//
// Uzaktan oyun odasındaki sesli sohbet için Agora ses anahtarı (token) verir. Ses Agora üzerinden doğrudan telefonlar
// arasında taşınır; sunucumuza ses gelmez ve ses KAYDEDİLMEZ. Bu işlev yalnızca "bu kişi bu odanın sesine girebilir mi"
// diye veritabanına sorar (service_voice_token) ve kısa süreli (5 dakika) bir anahtar üretir. Anahtar süresi dolmadan
// uygulama yenisini ister; odadan atılan ya da oyundan çıkan kişiye yeni anahtar verilmez.
//
// Kurulum: bu işlevi "Verify JWT" KAPALI olarak yayınla (giriş kontrolünü işlev kendisi yapar).
// Gerekli gizli değerler (Supabase > Edge Functions > Secrets):
//   AGORA_APP_ID           Agora Console > Projects > App ID
//   AGORA_APP_CERTIFICATE  Agora Console > Projects > Primary Certificate (uygulamaya konmaz)
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2';
import agora from 'npm:agora-token@2.0.5';

const { RtcRole, RtcTokenBuilder } = agora;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_ID = Deno.env.get('AGORA_APP_ID') ?? '';
const APP_CERT = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';
/** Anahtarın geçerlilik süresi (saniye). Kısa tutulur: atılan kişi en geç bu sürede sesten düşer. */
const TOKEN_SECONDS = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !APP_ID || !APP_CERT) return json({ result: 'not_configured' });

  // 1) Kim çağırıyor?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);

  let body: { roomId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ result: 'invalid_request' });
  }
  const roomId = typeof body.roomId === 'string' ? body.roomId : '';
  if (!UUID_RE.test(roomId)) return json({ result: 'invalid_request' });

  // 2) Bu odanın sesine girebilir mi? (odada mı, atılmış mı, aylık ses kotası doldu mu)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.rpc('service_voice_token', { p_user: auth.user.id, p_room_id: roomId });
  if (error) return json({ result: 'failed' });
  const info = data as { result: string; uid?: number; channel?: string };
  if (info.result !== 'ok' || !info.uid || !info.channel) return json({ result: info.result ?? 'failed' });

  // 3) Kısa süreli anahtar. Konuşma sırası sunucuda belirlenir; uygulama yalnızca sırası gelenin mikrofonunu açar.
  const rtcToken = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    info.channel,
    info.uid,
    RtcRole.PUBLISHER,
    TOKEN_SECONDS,
    TOKEN_SECONDS,
  );
  return json({ result: 'ok', appId: APP_ID, channel: info.channel, uid: info.uid, token: rtcToken, expiresIn: TOKEN_SECONDS });
});
