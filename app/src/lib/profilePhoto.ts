// Profil resmi: yalnızca hesabını NVİ ile doğrulamış üye ekleyebilir (en çok 2 MB; jpg, png, webp). Resim Supabase
// Storage'a ("profile-photos") yüklenir ve moderatör onaylayınca görünür. Rumuzla görünülen yerlerde ASLA gösterilmez;
// yalnızca gerçek adın göründüğü yerlerde (kendi profilin, arkadaşların gördüğü gönderi/yorum, arkadaş listesi,
// arkadaşla yazışma) avatarın yerine geçer. Sınırları sunucudaki kutu ve kurallar da ayrıca zorlar.

import * as ImagePicker from 'expo-image-picker';

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

const BUCKET = 'profile-photos';
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const TOO_BIG = 'Resim 2 MB’tan büyük. Daha küçük bir resim seç.';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const PHOTO_TEXT: Record<string, string> = {
  not_identity_verified: 'Profil resmi eklemek için önce hesabını doğrulamalısın.',
  invalid_image: 'Resim yüklenemedi. Tekrar dene.',
  rate_limited: 'Biraz bekleyip tekrar dene.',
  photo_weekly_limit: 'Profil resmini haftada bir değiştirebilirsin. Bir hafta dolunca tekrar dene.',
  request_not_found: 'Bu resim artık onay beklemiyor. Liste yenileniyor.',
};

/** Storage yolundan resim adresi (yol boşsa boş). */
export function profilePhotoUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const WEEK_MS = 7 * 24 * 3600_000;

/** Profil resmi haftada bir değiştirilebilir: bir sonraki değişikliğin zamanı (şimdi değiştirilebiliyorsa boş). */
export function nextPhotoChangeAt(changedAt: string | null | undefined): Date | null {
  if (!changedAt) return null;
  const next = Date.parse(changedAt) + WEEK_MS;
  return Number.isFinite(next) && next > Date.now() ? new Date(next) : null;
}

/**
 * Üyenin klasöründe `keep` dışındaki bütün dosyaları siler (eski, reddedilmiş ya da yarım kalmış resimler sunucuda
 * yer kaplamasın). Üye kendi klasörünü, moderatör herkesinkini silebilir (Storage kuralları).
 */
export async function pruneProfilePhotos(userId: string, keep: string | null): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
  if (error || !data) return;
  const old = data.map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from(BUCKET).remove(old);
}

function randomName(): string {
  const a = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Galeriden kare bir resim seçtirir, 2 MB sınırını kontrol eder, yükler ve profile bağlar (moderatör onayına gider).
 * Eski resim dosyası silinir. Döner: `cancelled` (vazgeçti) ya da hata metni.
 */
export async function pickAndUploadProfilePhoto(userId: string): Promise<{ error: string | null; cancelled?: boolean }> {
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
  // Önce klasördeki artık dosyalar temizlenir (yükleme yeri açılsın)
  const { data: me } = await supabase.from('profiles').select('photo_path').eq('id', userId).maybeSingle();
  await pruneProfilePhotos(userId, (me as { photo_path: string | null } | null)?.photo_path ?? null).catch(() => {});
  const asset = res.assets[0];
  const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return { error: 'Yalnızca JPG, PNG ya da WEBP resim yüklenebilir.' };
  if (asset.fileSize && asset.fileSize > PROFILE_PHOTO_MAX_BYTES) return { error: TOO_BIG };
  let body: ArrayBuffer;
  try {
    body = await (await fetch(asset.uri)).arrayBuffer();
  } catch {
    return { error: 'Resim okunamadı. Başka bir resim dene.' };
  }
  if (body.byteLength > PROFILE_PHOTO_MAX_BYTES) return { error: TOO_BIG };
  const path = `${userId}/${randomName()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) {
    return {
      error: /size|large/i.test(up.error.message)
        ? TOO_BIG
        : 'Resim yüklenemedi. Eski resimlerin silinmemiş olabilir; biraz sonra tekrar dene.',
    };
  }
  const set = await callRpc<string | null>('set_profile_photo', { p_path: path }, PHOTO_TEXT);
  if (set.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: set.error };
  }
  // Eski resim sunucuda saklanmaz: klasörde yalnızca yeni resim kalır
  await pruneProfilePhotos(userId, path).catch(() => {});
  return { error: null };
}

/** Profil resmini kaldırır (dosya da silinir). */
export async function removeProfilePhoto(userId: string): Promise<Result> {
  const res = await callRpc<string | null>('set_profile_photo', { p_path: null }, PHOTO_TEXT);
  if (res.error) return { error: res.error };
  if (res.data && supabase) await supabase.storage.from(BUCKET).remove([res.data]);
  await pruneProfilePhotos(userId, null).catch(() => {});
  return { error: null };
}

export type PhotoApproval = { user_id: string; full_name: string; photo_path: string; updated_at: string };

export async function listPhotoApprovals(): Promise<{ data: PhotoApproval[]; error: string | null }> {
  const { data, error } = await callRpc<PhotoApproval[]>('admin_list_photo_approvals', {}, PHOTO_TEXT);
  return { data: data ?? [], error };
}

/** Moderatör: onayla / reddet. Reddedilen resmin dosyası hemen silinir (sunucuda saklanmaz). */
export async function reviewPhoto(row: PhotoApproval, approve: boolean): Promise<Result> {
  const res = await callRpcVoid(
    'admin_review_photo',
    { p_user: row.user_id, p_path: row.photo_path, p_approve: approve },
    PHOTO_TEXT,
  );
  if (!res.error && !approve && supabase) await supabase.storage.from(BUCKET).remove([row.photo_path]).catch(() => {});
  return res;
}
