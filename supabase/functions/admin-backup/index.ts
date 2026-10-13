// Edge Function: admin-backup
//
// Web yönetim paneli > Sistem > Yedekleme. İki iş yapar:
//   { action: 'export' }            → bütün veritabanının (public şeması) yedeğini JSON olarak döndürür
//   { action: 'restore', data }     → verilen yedeği geri yükler (tek işlem; hata olursa hiçbir şey değişmez)
// Yalnızca WEB PANELDEN giriş yapmış moderatör çağırabilir (telefondaki oturumla çağrılamaz). Giriş hesapları
// (e-posta, şifre) yedeğe girmez ve geri yüklemede hiçbir giriş hesabına dokunulmaz. Şifreleme panelde (tarayıcıda)
// yapılır: dosya bilgisayara şifreli iner, şifre sunucuya hiç gelmez.
//
// Kurulum: bu işlevi "Verify JWT" KAPALI olarak yayınla (giriş kontrolünü işlev kendisi yapar).
// Gizli değer gerekmez: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY ve SUPABASE_DB_URL
// Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Oturum anahtarının içindeki oturum kimliği (anahtar önce Supabase'e doğrulatılır) */
function sessionIdOf(token: string): string | null {
  try {
    const part = token.split('.')[1] ?? '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

const KNOWN = ['invalid_backup', 'backup_has_no_members', 'forbidden'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !DB_URL) return json({ result: 'not_configured' });

  // 1) Kim çağırıyor? Web panel oturumu olan moderatör mü?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;
  const sid = sessionIdOf(token);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: prof } = await admin.from('profiles').select('role, banned_at').eq('id', userId).maybeSingle();
  if (!prof || prof.role !== 'admin' || prof.banned_at) return json({ result: 'forbidden' });
  const { data: web } = await admin
    .from('admin_web_sessions')
    .select('session_id')
    .eq('session_id', sid ?? '00000000-0000-0000-0000-000000000000')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!web) return json({ result: 'web_panel_only' });

  let body: { action?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ result: 'invalid_request' });
  }
  const project = new URL(SUPABASE_URL).host;

  // 2) Veritabanına doğrudan bağlan (uzun sürebilecek işlem için zaman sınırı yok)
  const sql = postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15 });
  try {
    await sql`set statement_timeout = 0`;
    if (body.action === 'export') {
      const [row] = await sql`select public.admin_backup_export(${userId}::uuid) as d`;
      return json({ result: 'ok', backup: { ...(row.d as Record<string, unknown>), project } });
    }
    if (body.action === 'restore') {
      const data = body.data;
      if (!data || typeof data !== 'object') return json({ result: 'invalid_backup' });
      if (data.project !== project) return json({ result: 'wrong_project' });
      const [row] = await sql`select public.admin_backup_restore(${sql.json(data as never)}, ${userId}::uuid) as r`;
      return json({ result: 'ok', summary: row.r });
    }
    return json({ result: 'invalid_request' });
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    const code = KNOWN.find((k) => msg.includes(k));
    if (code) return json({ result: code });
    console.error(`admin-backup hata: ${msg.slice(0, 500)}`);
    return json({ result: 'failed', detail: msg.slice(0, 200) });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
