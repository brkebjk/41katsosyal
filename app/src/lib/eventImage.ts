// Etkinlik görseli: düzenleyen telefonundan seçer, Supabase Storage'a ("event-images") yükler.
// Üyenin görseli moderatör onaylayana kadar yalnızca kendisine görünür. En çok 2 MB; jpg, png, webp.
// Sınırları sunucudaki kutu (bucket) ve set_event_image ayrıca zorlar.

import * as ImagePicker from 'expo-image-picker';

import { callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

const BUCKET = 'event-images';
export const EVENT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TOO_BIG = 'Görsel 2 MB’tan büyük. Daha küçük bir görsel seç.';

const IMAGE_TEXT: Record<string, string> = {
  invalid_image: 'Görsel yüklenemedi. Tekrar dene.',
  event_not_found: 'Bu etkinlik artık yok.',
  event_ended: 'Etkinlik sona erdiği için görsel eklenemez.',
  forbidden: 'Yalnızca etkinliği açan kişi görsel ekleyebilir.',
  image_locked: 'Etkinliğin görseli zaten eklendi; görsel değiştirilemez ve kaldırılamaz.',
};

export function eventImageUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export type PickedImage = { uri: string; mime: string; ext: string };

/** Galeriden görsel seçtirir (yüklemez). Boyut sınırı burada da kontrol edilir. */
export async function pickEventImage(): Promise<{ image: PickedImage | null; error: string | null }> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { image: null, error: 'Galeri izni verilmedi. Telefon ayarlarından izin verip tekrar dene.' };
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.[0]) return { image: null, error: null };
  const asset = res.assets[0];
  const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return { image: null, error: 'Yalnızca JPG, PNG ya da WEBP görsel yüklenebilir.' };
  if (asset.fileSize && asset.fileSize > EVENT_IMAGE_MAX_BYTES) return { image: null, error: TOO_BIG };
  return { image: { uri: asset.uri, mime, ext }, error: null };
}

/** Seçilen görseli yükler ve etkinliğe bağlar. */
export async function uploadEventImage(userId: string, eventId: string, img: PickedImage): Promise<Result> {
  if (!supabase) return { error: 'Sunucu bağlantısı kurulmadı.' };
  let body: ArrayBuffer;
  try {
    body = await (await fetch(img.uri)).arrayBuffer();
  } catch {
    return { error: 'Görsel okunamadı. Başka bir görsel dene.' };
  }
  if (body.byteLength > EVENT_IMAGE_MAX_BYTES) return { error: TOO_BIG };
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${eventId}/${name}.${img.ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: img.mime, upsert: false });
  if (up.error) {
    return {
      error: /size|large/i.test(up.error.message)
        ? TOO_BIG
        : 'Görsel yüklenemedi. Etkinlik başına tek görsel eklenebilir. (Yönetici: “event-images” kutusu kurulu olmalı.)',
    };
  }
  return callRpcVoid('set_event_image', { p_event_id: eventId, p_path: path }, IMAGE_TEXT);
}
