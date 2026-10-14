// Etkinlik ve kota işlemleri: sunucudaki fonksiyonları (RPC) çağırır, hata kodlarını Türkçeleştirir.

import type { EventCategory } from '@/lib/eventCategories';
import type { Cell } from '@/lib/hex';
import { requireEventLocation } from '@/lib/map';
import { callRpc, callRpcVoid, rpcErrorText, BACKEND_MISSING, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type EventItem = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  capacity: number;
  fee_amount: number;
  /** Moderatörün açtığı etkinliklerde "41. Kat Sosyal", üyenin açtığında üyenin gerçek adı */
  host_name: string;
  /** Etkinliği açan üyenin geçerli oyun şampiyonu ünvanı (varsa); moderatör etkinliklerinde boştur */
  host_title: string | null;
  is_mine: boolean;
  registered_count: number;
  is_registered: boolean;
  /** Ücretli etkinlikte benim için ücret alınmayacaksa true (abonelik muafiyeti) */
  fee_waived: boolean;
  /** Moderatörün açtığı ("41. Kat Özel") etkinlik. Sunucu hesaplar; ad taklit edilemez. */
  is_official: boolean;
  category: EventCategory;
  /** 0 = yaş sınırı yok, 16 / 18 / 21 */
  min_age: number;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  /** Katılımını kodla doğruladım mı? */
  checked_in: boolean;
  /** Şu an kod girişi açık mı? (etkinlikten 5 dk önce başlar, başlangıçtan 3 saat sonra etkinlikle birlikte kapanır) */
  checkin_open: boolean;
  /** Kodla katılımını doğrulayanların sayısı; yalnızca etkinliği açan görür, diğerlerinde null */
  checked_in_count: number | null;
  /** Haritadaki bölgesi (petek). Eski etkinliklerde boştur; haritada görünmezler. */
  cell_q: number | null;
  cell_r: number | null;
  /** Etkinliğin kapanacağı an (başlangıçtan 3 saat sonra); kapanınca listeden kalkar */
  closes_at: string;
  /** Doğrulanmış katılımımdan kazandığım puan (doğrulamadıysam null). Yeterli kişi dolana kadar 0 görünür. */
  my_points: number | null;
  /** Puan yazılmadıysa nedeni: 'category_daily' (bugün bu kategoriden aldın) ya da 'host_cooldown' (bu düzenleyenden yakın zamanda aldın) */
  my_points_note: string | null;
  /** Yalnızca düzenleyende: son kapatma talebinin durumu ('pending' = moderatör bekliyor, 'rejected' = reddedildi) */
  close_request: string | null;
  /** Yalnızca düzenleyende: reddedilen talepte moderatörün yazdığı not (varsa) */
  close_request_note: string | null;
  /** Yalnızca düzenleyende: kodla katılan olduğu için etkinliği kendi kapatamaz, moderatöre talep gönderir */
  close_needs_request: boolean;
  /** Etkinliği bir sponsor (mekân) hesabı açtıysa kimliği: adına dokununca mekân profili açılır */
  host_sponsor_id?: string | null;
  /** Bu etkinlikte ekip arayan kişi sayısı (herkese görünür) */
  team_seekers?: number;
  /** Ben ekip arıyor muyum? */
  my_seeking?: boolean;
  /** Ekibimin büyüklüğü (ekipte değilsem 0) */
  my_team_size?: number;
  /** 'pending' = moderatör onayı bekliyor (Konser & Festival); yalnızca açan ve moderatör görür */
  approval?: 'pending' | 'approved' | 'rejected';
  /** Etkinlik görseli (Storage yolu). Onay bekleyen görsel yalnızca açana ve moderatöre gelir. */
  image_path?: string | null;
  /** Yalnızca açanda ve moderatörde: görselin onay durumu */
  image_status?: 'pending' | 'approved' | 'rejected' | null;
  /** Moderatör etiketi: 'tanitim_isbirligi' = Tanıtım & İşbirliği */
  tag?: string | null;
  /** Oyunlu etkinlik: düzenleyen etkinlik başlayınca (en az 4 doğrulamayla) etkinlik oyunu açabilir, puan Oyun Geceleri’nde 1,5, Sosyal Buluşmalar ve Müzik & Eğlence’de 1,25 kat */
  with_games?: boolean;
};

export const EVENT_TAGS: Record<string, string> = { tanitim_isbirligi: 'Tanıtım & İşbirliği' };

/** Etkinliğe katılan sayısı: düzenleyen de katılımcı sayılır (+1). */
export function attendeeCount(e: Pick<EventItem, 'registered_count' | 'is_official'>): number {
  return e.registered_count + 1;
}

export type Quota = {
  is_moderator: boolean;
  /** Sponsor (mekân) hesap: oyun oynamaz, etkinlik sınırsız */
  is_sponsor?: boolean;
  /** Girilmiş, henüz kullanılmamış (süresi dolmamış) mekân kodu var mı? */
  sponsor_credit?: boolean;
  sponsor_credit_until?: string | null;
  is_premium: boolean;
  /** null = sınırsız (moderatör). Ücretsiz üyede 1, abonede 4 gibi sayılar (moderatör değiştirebilir). */
  events_limit: number | null;
  events_used: number;
  games_limit: number | null;
  games_used: number;
  /** Onaylı Etkinlik Lideri mi? (aylık etkinlik hakkı artar) */
  is_leader?: boolean;
  /** Bekleyen etkinlik lideri başvurusu var mı? */
  leader_pending?: boolean;
};

export type NewEvent = {
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  capacity: number;
  /** 0 = ücretsiz */
  fee: number;
  category: EventCategory;
  /** Zorunlu: 0 = yaş sınırı yok, 16, 18 ya da 21 */
  minAge: number;
  /** Zorunlu: haritadan seçilen petek (etkinliğin yaklaşık bölgesi) */
  cell: Cell;
  /** Oyunlu etkinlik mi? */
  withGames?: boolean;
};

/** Etkinlik ekranına özel hata metinleri (ortak metinlerin yerine geçer). */
/** Aynı gün aynı petekte ikinci etkinliğe katılım denemesi */
export const SAME_CELL_TODAY =
  'Bugün bu bölgede (aynı petekte) bir etkinliğe zaten katıldın. Bir üye aynı gün aynı petekte yalnızca bir etkinliğe katılabilir.';

const EVENT_TEXT: Record<string, string> = {
  venue_not_on_map: 'Mekânın henüz haritada değil. Moderatörden mekânını haritaya eklemesini iste.',
  quota_exceeded: 'Bu ayki etkinlik hakkını kullandın. Hak her ay başında yenilenir.',
  invalid_title: 'Başlık 3 ile 120 karakter arasında olmalı.',
  invalid_description: 'Açıklama 10 ile 1000 karakter arasında olmalı.',
  invalid_location: 'Adres tarifi 3 ile 120 karakter arasında olmalı.',
  invalid_start: 'Etkinlik zamanı ileri bir tarih olmalı (en fazla 1 yıl sonrası).',
  invalid_capacity: 'Kontenjan 4 ile 10.000 arasında bir sayı olmalı (puan verilebilmesi için en az 4 kişi gerekir).',
  invalid_fee: 'Ücret 0 ile 100.000 ₺ arasında olmalı.',
  invalid_category: 'Bir kategori seçmelisin.',
  event_games_category: 'Oyunlu etkinlik yalnızca Oyun Geceleri, Sosyal Buluşmalar ve Müzik & Eğlence kategorilerinde açılabilir.',
  invalid_min_age: 'Yaş sınırını seçmelisin (sınır yoksa "Yaş sınırı yok" seç).',
  invalid_cell: 'Haritadan etkinliğin yapılacağı bölgeyi (peteği) seçmelisin.',
  event_cell_daily_limit:
    'Aynı petekte günde en çok 1 etkinlik açabilirsin. Bugün bu petekte zaten bir etkinlik açtın; yarın tekrar dene ya da başka bir petek seç.',
  fee_not_allowed: 'Şu anda üyeler ücretli etkinlik açamıyor. Ücretsiz bir etkinlik oluşturabilirsin.',
  muted: 'Hesabın geçici olarak susturuldu, şu an etkinlik oluşturamazsın.',
  event_full: 'Etkinliğin kontenjanı doldu.',
  event_not_found: 'Bu etkinlik artık yok. Liste yenileniyor.',
  event_ended: 'Bu etkinlik sona erdi.',
  invalid_body: 'Yorum boş olamaz ve en fazla 300 karakter olabilir.',
  rate_limited: 'Çok hızlı yazıyorsun. Bir dakika bekleyip tekrar dene.',
  already_checked_in: 'Katılımını kodla doğruladığın için kaydını artık geri çekemezsin.',
  not_registered: 'Kodu girebilmek için önce etkinliğe katılmış olmalısın.',
  host_cannot_checkin: 'Etkinliği açan kişi kendi kodunu giremez; kodu katılımcılara sen verirsin.',
  checkin_not_open: 'Kod girişi etkinlik başlamadan 5 dakika önce açılır. O zaman tekrar dene.',
  checkin_closed:
    'Kod girişi kapandı. Konser & Festival etkinliklerinde kod girişi başlangıçtan 45 dakika sonra, diğer etkinliklerde başlangıçtan 3 saat sonra (ya da düzenleyen etkinliği bitirince) kapanır.',
  close_request_required:
    'Etkinliğe kodla katılan kişiler var, bu yüzden etkinliği kendin kaldıramazsın. Moderatöre açıklamalı bir kapatma talebi gönder.',
  close_request_not_needed: 'Kodla katılan olmadığı için talebe gerek yok, etkinliği doğrudan kaldırabilirsin.',
  invalid_reason: 'Açıklama 10 ile 500 karakter arasında olmalı.',
  close_request_exists: 'Bu etkinlik için zaten bekleyen bir kapatma talebin var. Moderatörün yanıtını bekle.',
  too_many_attempts: 'Çok fazla yanlış deneme yaptın. 10 dakika sonra tekrar dene.',
  same_cell_today: SAME_CELL_TODAY,
  location_required:
    'Katılımını doğrulamak için bulunduğun bölgenin bilinmesi gerekiyor. Konum iznini verip tekrar dene.',
  too_far:
    'Etkinliğin yapıldığı bölgede görünmüyorsun, bu yüzden katılımın doğrulanamadı. Etkinlik yerine gelince tekrar dene.',
  comment_not_found: 'Bu yorum artık yok.',
  daily_event_limit:
    'Aynı gün en fazla 2 etkinliğe katılabilirsin. O günkü başka bir katılımını iptal edip tekrar dene.',
  daily_category_limit: 'Aynı gün aynı kategoriden yalnızca 1 etkinliğe katılabilirsin.',
  own_event: 'Kendi etkinliğine zaten katılımcı olarak sayılıyorsun.',
  event_pending: 'Bu etkinlik moderatör onayı bekliyor; onaylanınca paylaşabilirsin.',
  invalid_image: 'Görsel yüklenemedi. Tekrar dene.',
  invalid_stars: '1 ile 5 arasında yıldız seç.',
  not_verified: 'Yalnızca kodla katılımını doğruladığın etkinlikleri puanlayabilirsin.',
  event_not_ended: 'Etkinlik bittikten sonra puanlayabilirsin.',
  rating_closed: 'Puanlama süresi doldu (etkinlik bittikten sonra 7 gün).',
  already_rated: 'Bu etkinliği zaten puanladın.',
  share_cooldown: 'Etkinliği 5 dakikada bir paylaşabilirsin.',
  close_too_early: 'Etkinliği başlangıçtan 45 dakika sonra kapatabilirsin.',
  close_not_enough: 'Kapatmak için en az 4 kişinin kodu girmiş olması gerekir.',
  event_closed: 'Bu etkinlik zaten kapatıldı.',
  forbidden: 'Bu işlemi yalnızca etkinliği açan kişi yapabilir.',
  invalid_tag: 'Geçersiz etiket.',
};

const eventError = (message: string | undefined) => rpcErrorText(message, EVENT_TEXT);

/** Puan yazılmama nedenini (sunucu kodu) kullanıcıya anlatan cümle. */
export function pointsNoteText(note: string | null | undefined): string | null {
  if (note === 'category_daily')
    return 'Bugün bu kategoriden bir etkinlikte zaten puan aldığın için bu etkinlikten puan yazılmadı (günde kategori başına 1 etkinlik).';
  if (note === 'host_cooldown')
    return 'Bu etkinliği açan kişinin etkinliğinden yakın zamanda puan aldığın için bu etkinlikten puan yazılmadı.';
  return null;
}

export async function listEvents(): Promise<{ data: EventItem[]; error: string | null }> {
  if (!supabase) return { data: [], error: BACKEND_MISSING };
  const { data, error } = await supabase.rpc('list_events');
  if (error) return { data: [], error: eventError(error.message) };
  const rows = (data ?? []) as EventItem[];
  // numeric alanlar bazı durumlarda metin olarak gelebilir
  return { data: rows.map((e) => ({ ...e, fee_amount: Number(e.fee_amount) })), error: null };
}

export async function getQuota(): Promise<{ data: Quota | null; error: string | null }> {
  if (!supabase) return { data: null, error: BACKEND_MISSING };
  const { data, error } = await supabase.rpc('my_quota');
  if (error) return { data: null, error: eventError(error.message) };
  return { data: data as Quota, error: null };
}

export async function createEvent(input: NewEvent): Promise<{ error: string | null; id?: string; pending?: boolean }> {
  if (!supabase) return { error: BACKEND_MISSING };
  const { data, error } = await supabase.rpc('create_event', {
    p_title: input.title,
    p_description: input.description,
    p_location: input.location,
    p_starts_at: input.startsAt.toISOString(),
    p_capacity: input.capacity,
    p_fee_amount: input.fee,
    p_category: input.category,
    p_min_age: input.minAge,
    p_cell_q: input.cell.q,
    p_cell_r: input.cell.r,
    p_with_games: input.withGames ?? false,
  });
  if (error) return { error: eventError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string; approval?: string } | null;
  return { error: null, id: row?.id, pending: row?.approval === 'pending' };
}

export async function registerForEvent(eventId: string): Promise<Result> {
  if (!supabase) return { error: BACKEND_MISSING };
  const { error } = await supabase.rpc('register_for_event', { p_event_id: eventId });
  return { error: error ? eventError(error.message) : null };
}

export async function cancelRegistration(eventId: string): Promise<Result> {
  if (!supabase) return { error: BACKEND_MISSING };
  const { error } = await supabase.rpc('cancel_event_registration', { p_event_id: eventId });
  return { error: error ? eventError(error.message) : null };
}

/**
 * Etkinliği kaldırır (açan kişi ya da moderatör). Etkinliğe kodla katılan biri olduysa açan kişi bunu yapamaz;
 * onun yerine `requestEventClose` ile moderatöre talep gönderir.
 */
export async function removeEvent(eventId: string): Promise<Result> {
  if (!supabase) return { error: BACKEND_MISSING };
  const { error } = await supabase.rpc('cancel_event', { p_event_id: eventId });
  return { error: error ? eventError(error.message) : null };
}

export const CLOSE_REASON_MIN = 10;
export const CLOSE_REASON_MAX = 500;

/** Kodla katılanı olan etkinliği kapatmak için moderatöre açıklamalı talep gönderir. */
export async function requestEventClose(eventId: string, reason: string): Promise<Result> {
  return callRpcVoid('request_event_close', { p_event_id: eventId, p_reason: reason }, EVENT_TEXT);
}

// ---------------------------------------------------------------------------
// Beğeni ve yorum
// ---------------------------------------------------------------------------

export const EVENT_COMMENT_MAX = 300;

export type EventComment = {
  id: string;
  event_id: string;
  /** Üyelerde gerçek ad; moderatör yorumlarında "41. Kat Sosyal" */
  author_name: string;
  is_official: boolean;
  body: string;
  is_hidden: boolean;
  created_at: string;
  is_mine: boolean;
  /** Yazarın geçerli oyun şampiyonu ünvanı (varsa); gerçek adın göründüğü yerlerde gösterilir */
  author_title: string | null;
  /** Yorumu bir sponsor (mekân) hesabı yazdıysa kimliği */
  sponsor_id?: string | null;
};

/** Beğeniyi aç/kapat. liked: yeni durum (true = beğenildi). */
export async function toggleEventLike(eventId: string): Promise<{ liked: boolean | null; error: string | null }> {
  const { data, error } = await callRpc<boolean>('toggle_event_like', { p_event_id: eventId }, EVENT_TEXT);
  return { liked: error ? null : data === true, error };
}

export async function listEventComments(eventId: string): Promise<{ data: EventComment[]; error: string | null }> {
  const { data, error } = await callRpc<EventComment[]>('list_event_comments', { p_event_id: eventId }, EVENT_TEXT);
  return { data: data ?? [], error };
}

export async function addEventComment(eventId: string, body: string): Promise<Result> {
  return callRpcVoid('add_event_comment', { p_event_id: eventId, p_body: body }, EVENT_TEXT);
}

export async function deleteEventComment(commentId: string): Promise<Result> {
  return callRpcVoid('delete_my_event_comment', { p_comment_id: commentId }, EVENT_TEXT);
}

export async function reportEventComment(commentId: string, reason: string): Promise<Result> {
  return callRpcVoid('report_content', { p_type: 'event_comment', p_id: commentId, p_reason: reason }, EVENT_TEXT);
}

// ---------------------------------------------------------------------------
// Katılım doğrulama (kod)
// ---------------------------------------------------------------------------

/** Etkinliği açanın (ya da resmi etkinlikte moderatörün) göreceği katılım kodu. */
export async function getEventCode(eventId: string): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('my_event_code', { p_event_id: eventId }, EVENT_TEXT);
  return { code: error ? null : (data ?? null), error };
}

/** Kodu yeniler (eski kod geçersiz olur; kod birine yanlışlıkla gittiyse kullanılır). */
export async function regenerateEventCode(eventId: string): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('regenerate_event_code', { p_event_id: eventId }, EVENT_TEXT);
  return { code: error ? null : (data ?? null), error };
}

export type VerifyResult =
  | {
      ok: true;
      already: boolean;
      /** Bu etkinlikten kazandığın puan. Yeterli kişi doğrulanana kadar 0 kalır. */
      points: number;
      /** Şimdiye kadar kodla ve konumla doğrulanan kişi sayısı */
      verified: number;
      /** Puanların açılması için gereken kişi sayısı (varsayılan 4) */
      needed: number;
      /** Puanlar açıldı mı? */
      released: boolean;
      /** Puan yazılmadıysa nedeni: 'category_daily' ya da 'host_cooldown' (yoksa null) */
      note: string | null;
    }
  | { ok: false; wrongCode: true }
  | { ok: false; wrongCode: false; error: string };

type VerifyRow = {
  ok: boolean;
  already?: boolean;
  points?: number;
  verified?: number;
  needed?: number;
  released?: boolean;
  note?: string | null;
};

/**
 * Etkinlik sahibinin verdiği kodu girerek katıldığını doğrular. Önce konumsuz denenir; kod doğruysa ve sunucu
 * bölge bilgisini isterse, “konumunu 1 kez isteyeceğim” uyarısıyla bölge bir kez alınıp yeniden denenir. Yanlış kodla
 * konum hiç istenmez. Puan, etkinlikte yeterli sayıda (en az 4) kişi doğrulanınca açılır.
 */
export async function verifyAttendance(eventId: string, code: string): Promise<VerifyResult> {
  let first = await callRpc<VerifyRow>('verify_event_attendance', { p_event_id: eventId, p_code: code }, EVENT_TEXT);
  if (first.error === EVENT_TEXT.location_required) {
    const loc = await requireEventLocation();
    if (!loc.ok) return { ok: false, wrongCode: false, error: loc.message };
    first = await callRpc<VerifyRow>(
      'verify_event_attendance',
      { p_event_id: eventId, p_code: code, p_cell_q: loc.cell.q, p_cell_r: loc.cell.r },
      EVENT_TEXT,
    );
  }
  const { data, error } = first;
  if (error) return { ok: false, wrongCode: false, error };
  if (data?.ok) {
    return {
      ok: true,
      already: data.already === true,
      points: Number(data.points ?? 0),
      verified: Number(data.verified ?? 0),
      needed: Number(data.needed ?? 4),
      released: data.released === true,
      note: data.note ?? null,
    };
  }
  return { ok: false, wrongCode: true };
}

/** Kod, harf/rakam dışındaki işaretler ve boşluklar atılarak büyük harfe çevrilir. */
export function cleanEventCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/**
 * Etkinliğin görseli haritada gösterilir mi? Yalnızca Konser & Festival ve 41. Kat Özel etkinliklerde, görsel
 * moderatör onayındayken değil. (Etkinlikler sekmesindeki görsel bundan etkilenmez.)
 */
export function showsImageOnMap(
  e: Pick<EventItem, 'category' | 'is_official' | 'image_path' | 'image_status'>,
): boolean {
  if (!e.image_path || e.image_status === 'pending') return false;
  return e.category === 'konser_festival' || e.is_official;
}

/** Haritada bir petekteki etkinlikleri bulmak için anahtar */
export const cellKey = (q: number, r: number) => `${q},${r}`;

/** Haritaya konacak etkinlik bölgeleri: petek başına etkinlik sayısı ve en yakın etkinlik zamanı. */
export type EventCellMark = { q: number; r: number; count: number };

export function eventCellMarks(events: readonly EventItem[]): EventCellMark[] {
  const by = new Map<string, EventCellMark>();
  for (const e of events) {
    if (e.cell_q === null || e.cell_r === null || e.cell_q === undefined || e.cell_r === undefined) continue;
    const k = cellKey(e.cell_q, e.cell_r);
    const cur = by.get(k);
    if (cur) cur.count += 1;
    else by.set(k, { q: e.cell_q, r: e.cell_r, count: 1 });
  }
  return [...by.values()];
}

// ---------------------------------------------------------------------------
// Katıldığım etkinlikler ve puanlama
// ---------------------------------------------------------------------------

export type AttendedEvent = {
  id: string;
  title: string;
  starts_at: string;
  category: string;
  host_name: string;
  checked_in: boolean;
  ended: boolean;
  my_stars: number | null;
  can_rate: boolean;
  avg_stars: number | null;
  rating_count: number;
};

export async function listAttendedEvents(): Promise<{ data: AttendedEvent[]; error: string | null }> {
  const { data, error } = await callRpc<AttendedEvent[]>('my_attended_events', {}, EVENT_TEXT);
  return {
    data: (data ?? []).map((e) => ({ ...e, avg_stars: e.avg_stars === null ? null : Number(e.avg_stars) })),
    error,
  };
}

/** Etkinliği 1–5 yıldızla puanlar (bir kez). Döner: kazandığım puan. */
export async function rateEvent(eventId: string, stars: number): Promise<{ error: string | null; points?: number }> {
  const { data, error } = await callRpc<{ ok: boolean; points: number }>(
    'rate_event',
    { p_event_id: eventId, p_stars: stars },
    EVENT_TEXT,
  );
  return { error, points: data?.points };
}

/** Düzenleyen etkinliğini kapatır (başlangıçtan 45 dk sonra, en az 4 doğrulama, etkinlik peteğinde). */
export async function hostCloseEvent(eventId: string, my: { q: number; r: number }): Promise<Result> {
  return callRpcVoid(
    'host_close_event',
    { p_event_id: eventId, p_my_q: my.q, p_my_r: my.r },
    {
      ...EVENT_TEXT,
      location_required: 'Etkinliği bitirmek için konumunun bilinmesi gerekiyor. Konum iznini verip tekrar dene.',
      too_far: 'Etkinliği bitirmek için etkinlik yerinde (aynı ya da komşu petekte) olmalısın.',
    },
  );
}

/** Etkinliği akışta yeniden paylaşmak için kalan saniye. */
export async function eventShareWait(eventId: string): Promise<number> {
  const { data } = await callRpc<number>('event_share_wait', { p_event_id: eventId }, EVENT_TEXT);
  return typeof data === 'number' ? data : 0;
}

/** Moderatör: etiket ekle/kaldır. */
export async function setEventTag(eventId: string, tag: string | null): Promise<Result> {
  return callRpcVoid('admin_set_event_tag', { p_event_id: eventId, p_tag: tag }, EVENT_TEXT);
}

/** Moderatör: etkinliği 41. Kat Özel mi yoksa normal olarak mı yayınlıyor. */
export async function setEventOfficial(eventId: string, official: boolean): Promise<Result> {
  return callRpcVoid('admin_set_event_official', { p_event_id: eventId, p_official: official }, EVENT_TEXT);
}
