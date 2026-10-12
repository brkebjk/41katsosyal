// Sponsorlu mekânlar: mekân profili, puan/yorum, sponsor oyun hakkı kodları ve moderatör işlemleri.
// Hepsi sunucudaki fonksiyonları (RPC) çağırır. Sponsor kodu yalnızca EK oda hakkı verir; puan vermez.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type Venue = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  closing_hours: string;
  on_map: boolean;
  cell_q: number | null;
  cell_r: number | null;
  /** Yıldız ortalaması (1–5, bir ondalık); değerlendirme yoksa null */
  avg_stars: number | null;
  review_count: number;
  /** Mekânın kodunun toplam kaç kez kullanıldığı */
  visit_count: number;
  /** Bu mekânın kodunu ben kaç kez kullandım? */
  my_visits: number;
  is_mine: boolean;
  /** Mekânın profil resmi (Storage yolu) */
  image_path?: string | null;
  /** Puan/yorum verebilir miyim? */
  can_review: boolean;
  /** Vermek için önce mekânın kodunu kullanmam gerekiyor mu? */
  needs_visit: boolean;
  my_review: { stars: number; body: string | null } | null;
};

export type VenueReview = {
  id: string;
  author_name: string;
  stars: number;
  body: string | null;
  is_hidden: boolean;
  created_at: string;
  is_mine: boolean;
};

/** Haritadaki petek açılınca etkinliklerin altında gösterilen mekân kartı */
export type MapVenue = {
  user_id: string;
  name: string;
  address: string;
  phone: string | null;
  closing_hours: string;
  cell_q: number;
  cell_r: number;
  avg_stars: number | null;
  review_count: number;
  visit_count: number;
  image_path?: string | null;
};

export type SponsorCode = {
  code: string;
  created_at: string;
  expires_at: string;
  status: 'active' | 'used' | 'expired';
};

/** Sponsor hesabın kendi paneli. `venue` false ise moderatör henüz mekân bilgisini girmemiştir. */
export type SponsorPanel = {
  name: string;
  venue: boolean;
  address?: string;
  phone?: string | null;
  closing_hours?: string;
  on_map?: boolean;
  cell_q?: number | null;
  cell_r?: number | null;
  /** Mekânın profil resmi (Storage yolu) */
  image_path?: string | null;
  quota_limit?: number;
  quota_used?: number;
  valid_hours?: number;
  avg_stars?: number | null;
  review_count?: number;
  visit_count?: number;
  codes?: SponsorCode[];
};

/** Moderatörün gördüğü sponsor satırı */
export type SponsorRow = {
  user_id: string;
  name: string;
  is_banned: boolean;
  has_venue: boolean;
  address: string | null;
  phone: string | null;
  closing_hours: string | null;
  cell_q: number | null;
  cell_r: number | null;
  /** Moderatörün bu mekâna özel verdiği aylık kod kotası; null = varsayılan kota */
  code_quota: number | null;
  quota_limit: number;
  codes_month: number;
  avg_stars: number | null;
  review_count: number;
  visit_count: number;
  image_path?: string | null;
};

export const REVIEW_MAX = 300;

const VENUE_TEXT: Record<string, string> = {
  venue_not_found: 'Bu mekân artık yok.',
  venue_missing: 'Mekân bilgilerin henüz girilmemiş. Moderatörle iletişime geç.',
  code_quota_exceeded: 'Bu ayki kod hakkını kullandın. Kota her ay başında yenilenir.',
  visit_required: 'Puan vermek için önce bu mekânın kodunu bir kez kullanmış olman gerekiyor.',
  invalid_stars: '1 ile 5 arasında yıldız seç.',
  invalid_body: 'Yorum en fazla 300 karakter olabilir.',
  review_not_found: 'Silinecek bir değerlendirmen yok.',
  credit_pending:
    'Kullanmadığın bir oyun hakkın var. Önce onunla bir oda aç, sonra yeni kod girebilirsin (hak biriktirilemez).',
  venue_daily_limit: 'Bu mekânın kodunu bugün zaten kullandın. Yarın tekrar kullanabilirsin.',
  too_many_attempts: 'Çok fazla yanlış deneme yaptın. 10 dakika sonra tekrar dene.',
  not_a_sponsor: 'Bu hesap sponsor (mekân) hesabı değil.',
  invalid_address: 'Adres 3 ile 200 karakter arasında olmalı.',
  invalid_phone: 'Telefon 5 ile 30 karakter arasında olmalı.',
  invalid_hours: 'Kapanış saati 2 ile 60 karakter arasında olmalı (örn. “Her gün 02:00”).',
  invalid_quota: 'Kod kotası 0 ile 1000 arasında olmalı.',
  invalid_name: 'Ad 2 ile 60 karakter arasında olmalı.',
  invalid_cell: 'Haritadan Kocaeli içinde bir petek seçmelisin.',
};

function num(x: unknown): number | null {
  return x === null || x === undefined ? null : Number(x);
}

function cleanVenue(v: Venue): Venue {
  return {
    ...v,
    avg_stars: num(v.avg_stars),
    review_count: Number(v.review_count),
    visit_count: Number(v.visit_count),
  };
}

export async function getVenue(id: string): Promise<{ data: Venue | null; error: string | null }> {
  const res = await callRpc<Venue>('get_venue', { p_venue_id: id }, VENUE_TEXT);
  return { data: res.data ? cleanVenue(res.data) : null, error: res.error };
}

export async function listVenueReviews(id: string): Promise<{ data: VenueReview[]; error: string | null }> {
  const res = await callRpc<VenueReview[]>('list_venue_reviews', { p_venue_id: id }, VENUE_TEXT);
  return { data: res.data ?? [], error: res.error };
}

export async function saveVenueReview(id: string, stars: number, body: string): Promise<Result> {
  return callRpcVoid(
    'save_venue_review',
    { p_venue_id: id, p_stars: stars, p_body: body.trim() || null },
    VENUE_TEXT,
  );
}

export async function deleteMyVenueReview(id: string): Promise<Result> {
  return callRpcVoid('delete_my_venue_review', { p_venue_id: id }, VENUE_TEXT);
}

export async function listMapVenues(): Promise<{ data: MapVenue[]; error: string | null }> {
  const res = await callRpc<MapVenue[]>('list_map_venues', {}, VENUE_TEXT);
  return {
    data: (res.data ?? []).map((v) => ({
      ...v,
      avg_stars: num(v.avg_stars),
      review_count: Number(v.review_count),
      visit_count: Number(v.visit_count),
    })),
    error: res.error,
  };
}

/** Sponsor değilse `data` null döner. */
export async function getSponsorPanel(): Promise<{ data: SponsorPanel | null; error: string | null }> {
  const res = await callRpc<SponsorPanel>('my_sponsor_panel', {}, VENUE_TEXT);
  return { data: res.data ? { ...res.data, avg_stars: num(res.data.avg_stars) } : null, error: res.error };
}

export async function createSponsorCode(): Promise<{
  data: { code: string; expires_at: string; quota_used: number; quota_limit: number } | null;
  error: string | null;
}> {
  return callRpc('create_sponsor_code', {}, VENUE_TEXT);
}

export type RedeemResult = { ok: boolean; reason?: 'invalid' | 'used' | 'expired'; venue_name?: string };

/** Üyenin girdiği sponsor kodunu dener. Yanlış kod hata değil, `ok: false` döner. */
export async function redeemSponsorCode(
  code: string,
): Promise<{ data: RedeemResult | null; error: string | null }> {
  return callRpc<RedeemResult>('redeem_sponsor_code', { p_code: code }, VENUE_TEXT);
}

/** Kod girişinde yanlış sonucun kullanıcıya gösterilecek cümlesi */
export function redeemFailText(reason: RedeemResult['reason']): string {
  if (reason === 'used') return 'Bu kod daha önce kullanılmış. Her kod tek kişiliktir.';
  if (reason === 'expired') return 'Bu kodun süresi dolmuş. Mekândan yeni bir kod iste.';
  return 'Bu kod geçerli değil. Kodu kontrol et (6 harf ya da rakam).';
}

export function cleanSponsorCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

// Moderatör ----------------------------------------------------------------

export async function adminListSponsors(): Promise<{ data: SponsorRow[]; error: string | null }> {
  const res = await callRpc<SponsorRow[]>('admin_list_sponsors', {}, VENUE_TEXT);
  return {
    data: (res.data ?? []).map((r) => ({
      ...r,
      avg_stars: num(r.avg_stars),
      review_count: Number(r.review_count),
      visit_count: Number(r.visit_count),
      codes_month: Number(r.codes_month),
      quota_limit: Number(r.quota_limit),
    })),
    error: res.error,
  };
}

export type VenueInput = {
  userId: string;
  /** Boş bırakılırsa hesabın adı değişmez */
  name?: string;
  address: string;
  phone?: string;
  hours: string;
  /** Boş = varsayılan kota */
  codeQuota: number | null;
  /** Verilirse mekân bu peteğe (haritaya) yerleşir; verilmezse mevcut yeri korunur */
  cell?: { q: number; r: number };
};

export async function adminSaveVenue(v: VenueInput): Promise<Result> {
  return callRpcVoid(
    'admin_save_venue',
    {
      p_user_id: v.userId,
      p_name: v.name?.trim() || null,
      p_address: v.address,
      p_phone: v.phone?.trim() || null,
      p_hours: v.hours,
      p_code_quota: v.codeQuota,
      p_q: v.cell ? v.cell.q : null,
      p_r: v.cell ? v.cell.r : null,
    },
    VENUE_TEXT,
  );
}

export async function adminRemoveVenueFromMap(userId: string): Promise<Result> {
  return callRpcVoid('admin_remove_venue_from_map', { p_user_id: userId }, VENUE_TEXT);
}

/** “4,3” gibi Türkçe yazımlı ortalama; değerlendirme yoksa “Yeni” */
export function starsText(avg: number | null): string {
  return avg === null ? 'Yeni' : avg.toFixed(1).replace('.', ',');
}
