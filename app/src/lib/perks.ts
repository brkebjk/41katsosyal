// Abonelik ayrıcalıkları: anlaşmalı işletmelerin abonelere özel avantajları.
// Moderatör ekler/düzenler. Abone olmayan üyeye açıklama ve “nasıl kullanılır” metni sunucudan hiç gelmez.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type Perk = {
  id: string;
  business_name: string;
  title: string;
  /** Abone olmayan üyede null (sunucu göndermez) */
  description: string | null;
  how_to: string | null;
  district: string | null;
  /** YYYY-MM-DD; boşsa süresiz */
  valid_until: string | null;
  /** Gizli ayrıcalığı yalnızca moderatör görür */
  is_active: boolean;
  sort_order: number;
  /** Bu üye için ayrıntılar kilitli mi? (abone değil) */
  locked: boolean;
};

export type PerkInput = {
  id: string | null;
  businessName: string;
  title: string;
  description: string;
  howTo: string;
  district: string;
  /** YYYY-MM-DD ya da boş (süresiz) */
  validUntil: string | null;
  isActive: boolean;
  sortOrder: number;
};

const PERK_TEXT: Record<string, string> = {
  invalid_business: 'İşletme adı 2 ile 80 karakter arasında olmalı.',
  invalid_title: 'Ayrıcalık başlığı 3 ile 120 karakter arasında olmalı.',
  invalid_description: 'Açıklama 5 ile 400 karakter arasında olmalı.',
  invalid_how_to: '“Nasıl kullanılır” metni en fazla 400 karakter olabilir.',
  invalid_district: 'Bölge adı 2 ile 40 karakter arasında olmalı (ya da boş bırak).',
  invalid_valid_until: 'Son geçerlilik günü bugünden önce olamaz.',
  invalid_sort: 'Sıra numarası 0 ile 1000 arasında olmalı.',
  perk_not_found: 'Bu ayrıcalık artık yok. Liste yenileniyor.',
};

export async function listPerks(): Promise<{ data: Perk[]; error: string | null }> {
  const { data, error } = await callRpc<Perk[]>('list_perks', {}, PERK_TEXT);
  return { data: (data ?? []).map((p) => ({ ...p, sort_order: Number(p.sort_order) })), error };
}

export async function savePerk(input: PerkInput): Promise<Result> {
  return callRpcVoid(
    'admin_save_perk',
    {
      p_id: input.id,
      p_business_name: input.businessName,
      p_title: input.title,
      p_description: input.description,
      p_how_to: input.howTo,
      p_district: input.district,
      p_valid_until: input.validUntil,
      p_is_active: input.isActive,
      p_sort_order: input.sortOrder,
    },
    PERK_TEXT,
  );
}

export async function deletePerk(id: string): Promise<Result> {
  return callRpcVoid('admin_delete_perk', { p_id: id }, PERK_TEXT);
}

/** “2026-11-05” → “5.11.2026” (forma yazılacak biçim) */
export function isoToInput(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : '';
}

/** “5.11.2026” → “2026-11-05”. Boş metin süresiz demektir (null). Geçersizse undefined. */
export function inputToIso(text: string): string | null | undefined {
  const t = text.trim();
  if (t.length === 0) return null;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Süresi bitmiş mi? (YYYY-MM-DD, telefonun yerel gününe göre) */
export function perkExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return validUntil < today;
}
