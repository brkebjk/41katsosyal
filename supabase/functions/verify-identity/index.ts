// Edge Function: verify-identity
//
// Profil > "Hesabı doğrula". Uygulama TC kimlik no, ad, soyad ve doğum yılını yalnızca buraya gönderir. İşlev bunları
// NVİ'nin ücretsiz kimlik doğrulama servisine (KPSPublic, TCKimlikNoDogrula) bir kez sorar ve sonucu veritabanına
// yazar. Uygulamanın "doğrulandım" demesine güvenilmez; doğrulama yalnızca bu yolla açılır.
//
// TC kimlik numarası HİÇBİR YERE yazılmaz ve günlüğe (log) basılmaz. Veritabanına yalnızca gizli anahtarla alınmış,
// geri çevrilemeyen özeti (HMAC-SHA256) gider: aynı kişi ikinci bir hesabı doğrulayamasın diye.
//
// Kurulum: bu işlevi "Verify JWT" AÇIK olarak yayınla (yalnızca giriş yapmış üye çağırabilir).
// Gerekli gizli değer (Supabase > Edge Functions > Secrets):
//   IDENTITY_PEPPER   En az 32 karakterlik uzun rastgele bir parola. Bir kez belirlenir, ASLA değiştirilmez
//                     (değişirse eski özetler tutmaz ve aynı kişi yeni bir hesabı doğrulayabilir). Uygulamaya konmaz.
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PEPPER = Deno.env.get('IDENTITY_PEPPER') ?? '';
const NVI_URL = 'https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx';
const NVI_TIMEOUT_MS = 15_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Sonuç her zaman 200 ile döner (uygulama `result` alanına bakar); yalnızca yetkisiz çağrı 401'dir. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** TC kimlik numarasının resmi kontrol hanesi kuralı (NVİ'ye boşuna sorulmasın) */
function tcValid(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === d[10];
}

const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+( [A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+)*$/;

function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');
/** "AHMET MEHMET" -> "Ahmet Mehmet" (Türkçe harf kurallarıyla) */
const title = (s: string) =>
  s
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ');

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function hmacHex(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`tc:${value}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** NVİ'ye sorar: true = uyuşuyor, false = uyuşmuyor, null = servise ulaşılamadı */
async function askNvi(tc: string, ad: string, soyad: string, year: number): Promise<boolean | null> {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><TCKimlikNoDogrula xmlns="http://tckimlik.nvi.gov.tr/WS">' +
    `<TCKimlikNo>${tc}</TCKimlikNo><Ad>${xml(upper(ad))}</Ad><Soyad>${xml(upper(soyad))}</Soyad>` +
    `<DogumYili>${year}</DogumYili>` +
    '</TCKimlikNoDogrula></soap:Body></soap:Envelope>';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NVI_TIMEOUT_MS);
  try {
    const res = await fetch(NVI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://tckimlik.nvi.gov.tr/WS/TCKimlikNoDogrula"',
      },
      body,
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    const m = /<TCKimlikNoDogrulaResult>\s*(true|false)\s*<\/TCKimlikNoDogrulaResult>/i.exec(text);
    return m ? m[1].toLowerCase() === 'true' : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || PEPPER.length < 32) return json({ result: 'not_configured' });

  // 1) Kim çağırıyor?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  // 2) Girilenleri denetle
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ result: 'invalid_input' });
  }
  const tc = typeof input.tc === 'string' ? input.tc.replace(/\D/g, '') : '';
  const ad = cleanName(input.firstName);
  const soyad = cleanName(input.lastName);
  const year = Number(input.birthYear);
  const nowYear = new Date().getUTCFullYear();
  if (!tcValid(tc)) return json({ result: 'invalid_tc' });
  if (ad.length < 2 || ad.length > 40 || !NAME_RE.test(ad) || soyad.length < 2 || soyad.length > 40 || !NAME_RE.test(soyad)) {
    return json({ result: 'invalid_name' });
  }
  if (!Number.isInteger(year) || year < 1900 || year > nowYear) return json({ result: 'invalid_year' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const hash = await hmacHex(tc);

  // 3) Deneme hakkı, daha önce doğrulanmış mı, bu kimlik başka hesapta mı?
  const start = await admin.rpc('service_identity_start', { p_user: userId, p_hash: hash });
  if (start.error) return json({ result: 'failed' });
  if (start.data !== 'ok') return json({ result: start.data });

  // 4) NVİ'ye sor
  const match = await askNvi(tc, ad, soyad, year);
  if (match === null) return json({ result: 'nvi_unavailable' });
  if (!match) return json({ result: 'mismatch' });

  // 5) Hesabı doğrula; gerçek ad nüfustaki ad olur
  const finish = await admin.rpc('service_identity_finish', {
    p_user: userId,
    p_hash: hash,
    p_full_name: `${title(ad)} ${title(soyad)}`,
  });
  if (finish.error) return json({ result: 'failed' });
  return json({ result: finish.data });
});
