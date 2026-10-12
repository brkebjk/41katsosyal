// Sunucudaki fonksiyonları (RPC) çağırmak ve hata kodlarını Türkçeleştirmek için ortak yardımcılar.

import { supabase } from '@/lib/supabase';

export type Result = { error: string | null };

export const BACKEND_MISSING = 'Sunucu bağlantısı kurulmadı.';

/**
 * Hesaba başka bir telefondan giriş yapılınca bu telefondaki oturum geçersiz olur ve sunucu her isteğe
 * 'session_replaced' cevabı verir. Oturum yöneticisi (auth.tsx) burada bir dinleyici kaydeder ve çıkış yapar.
 */
let onSessionReplaced: (() => void) | null = null;
export function setSessionReplacedHandler(handler: (() => void) | null): void {
  onSessionReplaced = handler;
}
export function checkSessionReplaced(message: string | undefined): boolean {
  if (!message || !message.includes('session_replaced')) return false;
  onSessionReplaced?.();
  return true;
}
const GENERIC_ERROR = 'Bir sorun oluştu. Biraz sonra tekrar dene.';

/** Her yerde aynı anlama gelen hata kodları. Bir ekran farklı bir metin isterse `extra` verir. */
const COMMON_TEXT: Record<string, string> = {
  not_authenticated: 'Oturumun kapanmış görünüyor. Uygulamayı kapatıp yeniden aç.',
  banned: 'Hesabın askıya alındı.',
  muted: 'Hesabın geçici olarak susturuldu, şu an yazamazsın.',
  forbidden: 'Bu işlem için yetkin yok.',
  premium_required: 'Bu işlem için abonelik gerekiyor.',
  rate_limited: 'Çok hızlı davranıyorsun. Biraz bekleyip tekrar dene.',
  invalid_body: 'Metin boş olamaz ve çok uzun olmamalı.',
  post_not_found: 'Bu gönderi artık yok. Akış yenileniyor.',
  comment_not_found: 'Bu yorum artık yok.',
  target_not_found: 'Bu içerik artık yok.',
  invalid_reason: 'Şikayet nedeni 3 ile 300 karakter arasında olmalı.',
  cannot_block_self: 'Kendini engelleyemezsin.',
  cannot_target_admin: 'Moderatörlere bu işlem uygulanamaz.',
  user_not_found: 'Bu üye bulunamadı.',
  invalid_minutes: 'Süre geçersiz.',
  invalid_amount: 'Puan 0 olamaz ve 10.000’i geçemez.',
  report_not_found: 'Bu şikayet artık yok.',
  room_not_found: 'Bu kodla bir oda bulunamadı. Kodu kontrol et.',
  room_closed: 'Bu odaya artık katılım kapalı.',
  room_full: 'Oda dolu.',
  already_in_game:
    'Zaten başka bir oyunun içindesin (başka bir telefonda açık kalmış olabilir). O oyundan ayrılmadan yenisine giremezsin.',
  invalid_mode: 'Oyun şekli geçersiz.',
  game_not_available: 'Bu oyun şu anda açık değil.',
  not_a_raffle: 'Bu oda bir çekiliş odası değil.',
  no_players: 'Odada henüz kimse yok, çekiliş yapılamaz.',
  invalid_status: 'Oda durumu geçersiz.',
  invalid_transition: 'Oda bu duruma geçirilemez.',
  quota_exceeded: 'Bu ayki hakkını kullandın.',
  already_drawn: 'Bu çekiliş zaten yapılmış.',
  cannot_friend_self: 'Kendine arkadaşlık isteği gönderemezsin.',
  already_friends: 'Bu kişiyle zaten arkadaşsınız.',
  already_requested: 'Bu kişiye zaten bir istek gönderdin. Yanıt vermesini bekle.',
  blocked_by_you: 'Bu kişiyi engellemişsin. Önce Profil sekmesinden engeli kaldırmalısın.',
  request_not_found: 'Bu istek artık yok. Liste yenileniyor.',
  code_not_found: 'Bu kodla bir üye bulunamadı. Kodu kontrol et (6 harf ya da rakam).',
  too_many_requests: 'Yanıt bekleyen çok fazla isteğin var. Birkaçını geri çekip tekrar dene.',
  invalid_action: 'Bu işlem geçersiz.',
  sponsor_not_allowed: 'Mekân hesapları bu işlemi yapamaz.',
  session_replaced: 'Hesabına başka bir telefondan giriş yapıldı. Bu telefondaki oturum kapatıldı.',
  reserved_name: 'Bu ad kullanılamaz. “41. Kat”, “Moderatör” veya “Yönetici” içeren adlar ayrılmıştır.',
};

/** Sunucunun hata mesajındaki kodu bulup anlaşılır bir cümleye çevirir. */
export function rpcErrorText(message: string | undefined, extra: Record<string, string> = {}): string {
  const msg = message ?? '';
  for (const table of [extra, COMMON_TEXT]) {
    for (const [code, text] of Object.entries(table)) {
      if (msg.includes(code)) return text;
    }
  }
  const lower = msg.toLowerCase();
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.';
  }
  return __DEV__ && msg ? `${GENERIC_ERROR} [${msg}]` : GENERIC_ERROR;
}

/** Sonuç döndüren bir sunucu fonksiyonunu çağırır. */
export async function callRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  extra: Record<string, string> = {},
): Promise<{ data: T | null; error: string | null }> {
  if (!supabase) return { data: null, error: BACKEND_MISSING };
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    checkSessionReplaced(error.message);
    return { data: null, error: rpcErrorText(error.message, extra) };
  }
  return { data: (data ?? null) as T | null, error: null };
}

/** Sonuç beklemeyen (yalnızca başarılı mı diye bakılan) bir sunucu fonksiyonunu çağırır. */
export async function callRpcVoid(
  name: string,
  args: Record<string, unknown> = {},
  extra: Record<string, string> = {},
): Promise<Result> {
  const { error } = await callRpc<unknown>(name, args, extra);
  return { error };
}
