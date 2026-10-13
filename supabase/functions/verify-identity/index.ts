// Edge Function: verify-identity
//
// Profil > "Hesabı doğrula". Uygulama TC kimlik no, ad, soyad ve doğum tarihini (gün, ay, yıl) yalnızca buraya gönderir.
// İşlev bunları NVİ'nin ücretsiz kimlik doğrulama servisine (KPSPublicV2, KisiVeCuzdanDogrula; NVİ sitesindeki
// "T.C. Kimlik No Doğrulama" formunun aynısı, cüzdan/kart seri no boş bırakılır) sorar ve sonucu veritabanına yazar.
// Uygulamanın "doğrulandım" demesine güvenilmez; doğrulama yalnızca bu yolla açılır.
//
// TC kimlik numarası HİÇBİR YERE yazılmaz ve günlüğe (log) basılmaz. Veritabanına yalnızca gizli anahtarla alınmış,
// geri çevrilemeyen özeti (HMAC-SHA256) gider: aynı kişi ikinci bir hesabı doğrulayamasın diye.
//
// Kurulum: bu işlevi "Verify JWT with legacy secret" KAPALI olarak yayınla. Giriş kontrolünü işlev kendisi yapar
// (aşağıda 1. adım: oturum anahtarı Supabase'e sorulur; giriş yapmamış biri hiçbir şey yapamaz).
// Gerekli gizli değer (Supabase > Edge Functions > Secrets):
//   IDENTITY_PEPPER   En az 32 karakterlik uzun rastgele bir parola. Bir kez belirlenir, ASLA değiştirilmez
//                     (değişirse eski özetler tutmaz ve aynı kişi yeni bir hesabı doğrulayabilir). Uygulamaya konmaz.
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PEPPER = Deno.env.get('IDENTITY_PEPPER') ?? '';
const NVI_URL = 'https://tckimlik.nvi.gov.tr/Service/KPSPublicV2.asmx';
/** Yedek: V2 servisi hata verirse (cevap yok sayılmaz) yalnızca doğum yılını soran eski servis */
const NVI_URL_V1 = 'https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx';
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

/**
 * Profilde görünecek ad: birden çok adı olanın son adı dışındaki adları baş harfle kısaltılır, soyad aynen kalır.
 * "ENGİN BERKE" + "TAŞ" -> "E.Berke Taş"; "AYŞE" + "YILMAZ" -> "Ayşe Yılmaz".
 */
function displayName(ad: string, soyad: string): string {
  const given = title(ad).split(' ');
  const last = given.pop() ?? '';
  const initials = given.map((w) => `${w.charAt(0)}.`).join('');
  return `${initials}${last} ${title(soyad)}`;
}

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

type Birth = { day: number; month: number; year: number };
type Answer = { match: boolean | null; why: string };

/**
 * NVİ'ye bir SOAP isteği gönderir. `match`: true = uyuşuyor, false = uyuşmuyor, null = servise ulaşılamadı. Ulaşılamadıysa
 * `why` kısa nedendir (uygulamada ve Supabase > Edge Functions > Logs ekranında görünür; kimlik bilgisi içermez):
 *   T = zaman aşımı, H<kod> = NVİ bir hata kodu döndü (ör. H403 = erişim engeli), C = bağlantı/sertifika hatası,
 *   W = NVİ'nin güvenlik duvarı isteği reddetti ("Request Rejected" sayfası; çoğunlukla yurt dışı sunucu engeli),
 *   F = NVİ hata (SOAP fault) döndü, P = cevap anlaşılamadı.
 */
async function soap(url: string, method: string, inner: string): Promise<Answer> {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${method} xmlns="http://tckimlik.nvi.gov.tr/WS">${inner}</${method}></soap:Body></soap:Envelope>`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NVI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"http://tckimlik.nvi.gov.tr/WS/${method}"`,
        // Güvenlik duvarı tarayıcı dışı istemcileri reddedebiliyor: sıradan bir istemci gibi görün
        'User-Agent': 'Mozilla/5.0 (compatible; 41KatSosyal/1.0)',
        Accept: 'text/xml, application/soap+xml, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
      },
      body,
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`NVİ ${method} HTTP ${res.status}: ${text.slice(0, 300).replace(/\d{11}/g, '***')}`);
      return { match: null, why: `H${res.status}` };
    }
    const m = new RegExp(`<${method}Result>\\s*(true|false)\\s*</${method}Result>`, 'i').exec(text);
    if (!m) {
      // Görünen yazı (etiketler, betikler atılır) ve yönlendirildiyse son adres: nedeni anlamak için
      const visible = text
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\d{11}/g, '***');
      let where = '';
      try {
        where = res.redirected ? new URL(res.url).pathname : '';
      } catch {
        where = '';
      }
      console.error(
        `NVİ ${method} cevabı anlaşılamadı (HTTP ${res.status}, ${res.headers.get('content-type') ?? '-'}` +
          `${where ? `, yönlendirildi: ${where}` : ''}): ${visible.slice(0, 500)}`,
      );
      if (/request rejected|url was rejected|support id/i.test(text)) {
        const id = /support id(?: is)?\s*:?\s*(\d{6,})/i.exec(text)?.[1];
        return { match: null, why: `W${id ? id.slice(-6) : ''}` };
      }
      if (/<(?:soap:)?Fault>/i.test(text)) return { match: null, why: 'F' };
      // Kısa ipucu (rakamsız): yönlendirilen adres ve sayfadaki yazının başı
      const hint = `${where}${where ? ' ' : ''}${visible.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ./]/g, '').trim().slice(0, 50)}`;
      return { match: null, why: `X(${hint || (res.headers.get('content-type') ?? '').slice(0, 20)})` };
    }
    return { match: m[1].toLowerCase() === 'true', why: '' };
  } catch (e) {
    const timeout = ctl.signal.aborted;
    console.error(`NVİ bağlantı hatası (${timeout ? 'zaman aşımı' : 'bağlantı'}): ${String(e).slice(0, 300)}`);
    return { match: null, why: timeout ? 'T' : 'C' };
  } finally {
    clearTimeout(timer);
  }
}

/** Gün, ay ve yılla sorgu (NVİ sitesindeki form). Seri numaraları gönderilmez: kütükteki son açık kayıt doğrulanır. */
function askV2(tc: string, ad: string, soyad: string, b: Birth): Promise<Answer> {
  return soap(
    NVI_URL,
    'KisiVeCuzdanDogrula',
    `<TCKimlikNo>${tc}</TCKimlikNo><Ad>${xml(upper(ad))}</Ad><Soyad>${xml(upper(soyad))}</Soyad>` +
      '<SoyadYok>false</SoyadYok>' +
      `<DogumGun>${b.day}</DogumGun><DogumGunYok>false</DogumGunYok>` +
      `<DogumAy>${b.month}</DogumAy><DogumAyYok>false</DogumAyYok>` +
      `<DogumYil>${b.year}</DogumYil>`,
  );
}

/** Eski servis (yalnızca doğum yılı) */
function askV1(tc: string, ad: string, soyad: string, b: Birth): Promise<Answer> {
  return soap(
    NVI_URL_V1,
    'TCKimlikNoDogrula',
    `<TCKimlikNo>${tc}</TCKimlikNo><Ad>${xml(upper(ad))}</Ad><Soyad>${xml(upper(soyad))}</Soyad>` +
      `<DogumYili>${b.year}</DogumYili>`,
  );
}

/**
 * Önce gün-ay-yıl servisi sorulur; geçici bağlantı sorununda bir kez daha denenir. Bu servis hata verirse (H, P) eski
 * servise sorulur. "Uyuşmuyor" cevabı kesindir, başka servise sorulmaz. Kod başına V2/V1 eklenir (ör. N-V2H500).
 */
async function askNvi(tc: string, ad: string, soyad: string, b: Birth): Promise<Answer> {
  let a = await askV2(tc, ad, soyad, b);
  if (a.match === null && (a.why === 'T' || a.why === 'C')) {
    await new Promise((r) => setTimeout(r, 1500));
    a = await askV2(tc, ad, soyad, b);
  }
  if (a.match !== null) return a;
  if (a.why === 'T' || a.why === 'C') return { match: null, why: `V2${a.why}` };
  const old = await askV1(tc, ad, soyad, b);
  if (old.match !== null) return old;
  return { match: null, why: `V2${a.why}-V1${old.why}` };
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
  const month = Number(input.birthMonth);
  const day = Number(input.birthDay);
  const nowYear = new Date().getUTCFullYear();
  const born = new Date(Date.UTC(year, month - 1, day));
  if (!tcValid(tc)) return json({ result: 'invalid_tc' });
  if (ad.length < 2 || ad.length > 40 || !NAME_RE.test(ad) || soyad.length < 2 || soyad.length > 40 || !NAME_RE.test(soyad)) {
    return json({ result: 'invalid_name' });
  }
  if (!Number.isInteger(year) || year < 1900 || year > nowYear) return json({ result: 'invalid_year' });
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    born.getUTCFullYear() !== year ||
    born.getUTCMonth() !== month - 1 ||
    born.getUTCDate() !== day ||
    born.getTime() > Date.now()
  ) {
    return json({ result: 'invalid_date' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const hash = await hmacHex(tc);

  // 3) Deneme hakkı, daha önce doğrulanmış mı, bu kimlik başka hesapta mı?
  const start = await admin.rpc('service_identity_start', { p_user: userId, p_hash: hash });
  if (start.error) return json({ result: 'failed' });
  if (start.data !== 'ok') return json({ result: start.data });

  // 4) NVİ'ye sor
  const nvi = await askNvi(tc, ad, soyad, { day, month, year });
  if (nvi.match === null) {
    // Ulaşılamadıysa bu deneme günlük hakkından sayılmaz
    await admin.rpc('service_identity_refund', { p_user: userId });
    return json({ result: 'nvi_unavailable', detail: nvi.why });
  }
  if (!nvi.match) {
    // Hangi bilginin tutmadığını ayırmak için yalnızca doğum yılıyla da sorulur: ad, soyad ve yıl uyuşuyorsa
    // sorun gün/ay'dadır (hesap yine doğrulanmaz)
    const yearOnly = await askV1(tc, ad, soyad, { day, month, year });
    return json({ result: yearOnly.match === true ? 'date_mismatch' : 'mismatch' });
  }

  // 5) Hesabı doğrula; gerçek ad nüfustaki ad olur
  const finish = await admin.rpc('service_identity_finish', {
    p_user: userId,
    p_hash: hash,
    p_full_name: displayName(ad, soyad),
  });
  if (finish.error) return json({ result: 'failed' });
  return json({ result: finish.data });
});
