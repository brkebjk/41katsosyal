// Mekân profil resmi: moderatör telefonundan seçer, Supabase Storage'a ("venue-images") yükler.
// Resim, mekân hesabının avatarı yerine akışta, yorumlarda ve mekân profilinde herkese görünür.
// En çok 2 MB; yalnızca jpg, png, webp. Sınırları sunucudaki kutu (bucket) da ayrıca zorlar.

import * as ImagePicker from 'expo-image-picker';

import { callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

const BUCKET = 'venue-images';
export const VENUE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Storage yolundan herkese açık resim adresi (yol boşsa boş). */
export function venueImageUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const IMAGE_TEXT: Record<string, string> = {
  invalid_image: 'Resim yüklenemedi. Tekrar dene.',
  venue_missing: 'Önce mekân bilgilerini kaydet, sonra resim ekle.',
};

/**
 * Moderatör: galeriden kare bir resim seçtirir, 2 MB sınırını kontrol eder, yükler ve mekâna bağlar.
 * Döner: `cancelled` (vazgeçti) ya da hata metni.
 */
export async function pickAndUploadVenueImage(venueId: string): Promise<{ error: string | null; cancelled?: boolean }> {
  if (!supabase) return { error: 'Sunucu bağlantısı kurulmadı.' };
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'Galeri izni verilmedi. Telefon ayarlarından izin verip tekrar dene.' };
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.[0]) return { error: null, cancelled: true };
  const asset = res.assets[0];
  const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return { error: 'Yalnızca JPG, PNG ya da WEBP resim yüklenebilir.' };
  if (asset.fileSize && asset.fileSize > VENUE_IMAGE_MAX_BYTES) {
    return { error: 'Resim 2 MB’tan büyük. Daha küçük bir resim seç.' };
  }
  let body: ArrayBuffer;
  try {
    body = await (await fetch(asset.uri)).arrayBuffer();
  } catch {
    return { error: 'Resim okunamadı. Başka bir resim dene.' };
  }
  if (body.byteLength > VENUE_IMAGE_MAX_BYTES) return { error: 'Resim 2 MB’tan büyük. Daha küçük bir resim seç.' };
  const path = `venues/${venueId}/${Date.now().toString(36)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) {
    return {
      error: /size|large/i.test(up.error.message)
        ? 'Resim 2 MB’tan büyük. Daha küçük bir resim seç.'
        : 'Resim yüklenemedi. (Yönetici: Storage’da “venue-images” kutusu kurulu olmalı.)',
    };
  }
  const set = await setVenueImage(venueId, path);
  if (set.error) {
    void supabase.storage.from(BUCKET).remove([path]);
    return { error: set.error };
  }
  return { error: null };
}

/** Moderatör: mekânın resmini ayarlar (path boşsa kaldırır). */
export async function setVenueImage(venueId: string, path: string | null): Promise<Result> {
  return callRpcVoid('admin_set_venue_image', { p_user_id: venueId, p_path: path }, IMAGE_TEXT);
}
