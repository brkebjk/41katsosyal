// Hazine Avı: moderatör şehrin peteklerine 3 kelimelik kodlar gizler; kodu ilk bulan puanı alır (tek kullanımlık).
// Kodlar yalnızca moderatöre gelir; üyeler haritada hazinenin peteğini, zorluğunu ve ipucunu görür.

import type Ionicons from '@expo/vector-icons/Ionicons';

import * as ImagePicker from 'expo-image-picker';

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type Difficulty = 'kolay' | 'orta' | 'zor' | 'imkansiz';

export const DIFFICULTIES: Difficulty[] = ['kolay', 'orta', 'zor', 'imkansiz'];

/** Haritadaki renkler: yoğunluk (pembe), etkinlik (turkuaz), oyun (lila), mekân (mercan) ve PeopleHere Özel (altın) ile çakışmaz */
export const TREASURE_COLORS: Record<Difficulty, string> = {
  kolay: '#5BE37D',
  orta: '#3F8CFF',
  zor: '#F03DFF',
  imkansiz: '#FFFFFF',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  kolay: 'Kolay',
  orta: 'Orta',
  zor: 'Zor',
  imkansiz: 'İmkânsız',
};

export const DIFFICULTY_ICON: Record<Difficulty, React.ComponentProps<typeof Ionicons>['name']> = {
  kolay: 'leaf',
  orta: 'compass',
  zor: 'flame',
  imkansiz: 'diamond',
};

export const DEFAULT_TREASURE_POINTS: Record<Difficulty, number> = { kolay: 25, orta: 60, zor: 120, imkansiz: 500 };

export type Treasure = {
  id: string;
  cell_q: number;
  cell_r: number;
  difficulty: Difficulty;
  hint: string;
  expires_at: string;
  points: number;
  /** İpucu fotoğrafları (Storage yolları, en çok 3) */
  image_paths: string[];
};

export type TreasureStatus = {
  found_this_month: number;
  monthly_limit: number;
  found_total: number;
  /** Hazine Avı başarım ödülü (100 hazine): ömür boyu abonelik kazanıldı mı */
  lifetime?: boolean;
  points: Record<Difficulty, number>;
};

const TREASURE_TEXT: Record<string, string> = {
  forbidden: 'Bu hesap türü hazine kodu giremez.',
  location_required: 'Kodu girmek için bulunduğun bölgenin bilinmesi gerekiyor. Konum iznini verip tekrar dene.',
  too_many_attempts: 'Çok fazla yanlış deneme yaptın. Bir süre sonra tekrar dene (saatte en çok 6, günde 20 deneme).',
  treasure_monthly_limit: 'Bu ayki hazine hakkını doldurdun. Hak her ayın başında yenilenir.',
  invalid_cell: 'Bu petek haritada değil.',
  invalid_difficulty: 'Zorluk seviyesini seç.',
  invalid_hint: 'İpucu 3 ile 300 karakter arasında olmalı.',
  invalid_expiry: 'Geçerlilik tarihi en az 1 saat, en çok 120 gün sonrası olmalı.',
  treasure_exists: 'Bu petekte zaten etkin bir hazine var. Önce onu kaldır.',
  treasure_month_max: 'Bu ay gizlenebilecek en fazla hazine sayısına ulaşıldı.',
  code_failed: 'Kod üretilemedi, tekrar dene.',
  request_not_found: 'Bu hazine artık etkin değil.',
  too_many_images: 'Bir hazineye en çok 3 fotoğraf eklenebilir.',
  invalid_image: 'Fotoğraf yüklenemedi, tekrar dene.',
};

export async function listTreasures(): Promise<Treasure[]> {
  const { data, error } = await callRpc<Treasure[]>('list_treasures', {}, TREASURE_TEXT);
  if (error || !data) return [];
  return data.map((t) => ({ ...t, points: Number(t.points), image_paths: t.image_paths ?? [] }));
}

export async function getTreasureStatus(): Promise<TreasureStatus | null> {
  const { data, error } = await callRpc<TreasureStatus>('my_treasure_status', {}, TREASURE_TEXT);
  return error ? null : data;
}

/** Kodu girer. ok=false: kod yanlış ya da hazinenin yakınında değilsin (ikisi aynı cevabı alır). */
export async function redeemTreasure(
  code: string,
  my: { q: number; r: number },
): Promise<{ error: string | null; ok?: boolean; points?: number; difficulty?: Difficulty }> {
  const { data, error } = await callRpc<{ ok: boolean; points?: number; difficulty?: Difficulty }>(
    'redeem_treasure',
    { p_code: code, p_my_q: my.q, p_my_r: my.r },
    TREASURE_TEXT,
  );
  if (error) return { error };
  return { error: null, ok: data?.ok === true, points: data?.points, difficulty: data?.difficulty };
}

// ---------------------------------------------------------------------------
// Moderatör
// ---------------------------------------------------------------------------

export type AdminTreasure = {
  id: string;
  cell_q: number;
  cell_r: number;
  code: string;
  hint: string;
  difficulty: Difficulty;
  expires_at: string;
  created_at: string;
  found_at: string | null;
  finder_name: string | null;
  removed_at: string | null;
  admin_seen: boolean;
  image_paths: string[];
};

const IMG_BUCKET = 'treasure-images';
const IMG_MAX = 2 * 1024 * 1024;
const IMG_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function treasureImageUrl(path: string): string | null {
  if (!supabase) return null;
  return supabase.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Moderatör: hazineye ipucu fotoğrafı ekler (en çok 3, her biri en çok 2 MB). */
export async function adminAddTreasureImage(
  treasureId: string,
  existing: string[],
): Promise<{ error: string | null; cancelled?: boolean; paths?: string[] }> {
  if (!supabase) return { error: 'Sunucu bağlantısı kurulmadı.' };
  if (existing.length >= 3) return { error: 'Bir hazineye en çok 3 fotoğraf eklenebilir.' };
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'Galeri izni verilmedi.' };
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (res.canceled || !res.assets?.[0]) return { error: null, cancelled: true };
  const asset = res.assets[0];
  const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  const ext = IMG_TYPES[mime];
  if (!ext) return { error: 'Yalnızca JPG, PNG ya da WEBP yüklenebilir.' };
  if (asset.fileSize && asset.fileSize > IMG_MAX) return { error: 'Fotoğraf 2 MB’tan büyük.' };
  let body: ArrayBuffer;
  try {
    body = await (await fetch(asset.uri)).arrayBuffer();
  } catch {
    return { error: 'Fotoğraf okunamadı.' };
  }
  if (body.byteLength > IMG_MAX) return { error: 'Fotoğraf 2 MB’tan büyük.' };
  const path = `treasures/${treasureId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from(IMG_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) return { error: 'Fotoğraf yüklenemedi. (Storage’da “treasure-images” kutusu kurulu olmalı.)' };
  const paths = [...existing, path];
  const set = await callRpcVoid('admin_set_treasure_images', { p_id: treasureId, p_paths: paths }, TREASURE_TEXT);
  if (set.error) {
    void supabase.storage.from(IMG_BUCKET).remove([path]);
    return { error: set.error };
  }
  return { error: null, paths };
}

/** Moderatör: hazinenin fotoğraflarından birini kaldırır. */
export async function adminRemoveTreasureImage(treasureId: string, existing: string[], path: string): Promise<Result> {
  const paths = existing.filter((p) => p !== path);
  const res = await callRpcVoid('admin_set_treasure_images', { p_id: treasureId, p_paths: paths }, TREASURE_TEXT);
  if (!res.error && supabase) void supabase.storage.from(IMG_BUCKET).remove([path]);
  return res;
}

export async function adminListTreasures(
  status: 'active' | 'found' | 'all',
): Promise<{ data: AdminTreasure[]; error: string | null }> {
  const { data, error } = await callRpc<AdminTreasure[]>('admin_list_treasures', { p_status: status }, TREASURE_TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function adminCreateTreasure(input: {
  cell: { q: number; r: number };
  difficulty: Difficulty;
  hint: string;
  expiresAt: Date;
}): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await callRpc<{ id: string; code: string }[]>(
    'admin_create_treasure',
    {
      p_q: input.cell.q,
      p_r: input.cell.r,
      p_difficulty: input.difficulty,
      p_hint: input.hint.trim(),
      p_expires_at: input.expiresAt.toISOString(),
    },
    TREASURE_TEXT,
  );
  if (error) return { error };
  const row = Array.isArray(data) ? data[0] : (data as { code?: string } | null);
  return { error: null, code: row?.code };
}

export async function adminRemoveTreasure(id: string): Promise<Result> {
  return callRpcVoid('admin_remove_treasure', { p_id: id }, TREASURE_TEXT);
}

export async function adminMarkTreasuresSeen(): Promise<Result> {
  return callRpcVoid('admin_mark_treasures_seen', {}, TREASURE_TEXT);
}
