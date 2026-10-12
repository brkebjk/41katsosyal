// Arkadaşlık: istek gönderme, kabul/ret, arkadaş listesi.
// Arkadaş olunca iki taraf birbirinin gerçek adını görür ve akıştaki gönderi/yorumlarda rumuz yerine ad çıkar.
// Hepsi sunucu fonksiyonlarıdır (RPC); gerçek adlar yalnızca kabul edilmiş arkadaşlar için gelir.

import { patchNotices, refreshNotices, resetNotices, useNotices } from '@/lib/notices';
import { REAL_NAME } from '@/lib/realName';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type FriendKind = 'friend' | 'incoming' | 'outgoing';

export type FriendRow = {
  id: string;
  kind: FriendKind;
  /** Yalnızca arkadaşlarda dolu */
  full_name: string | null;
  alias: string;
  avatar_index: number;
  created_at: string;
  /** Yalnızca arkadaşlarda: arkadaşın geçerli oyun şampiyonu ünvanı (varsa) */
  title: string | null;
};

export type Friendships = {
  friends: FriendRow[];
  incoming: FriendRow[];
  outgoing: FriendRow[];
};

const FRIEND_TEXT: Record<string, string> = {
  rate_limited: 'Bir saatte en fazla 5 arkadaşlık isteği gönderebilirsin. Biraz sonra tekrar dene.',
};

// Yanıt bekleyen istek sayısı ortak bildirim sayaçlarında (`lib/notices.ts`) tutulur.
/** Bana gelen, yanıt bekleyen arkadaşlık isteği sayısı (Profil sekmesindeki ve ekrandaki kırmızı nokta için). */
export function useIncomingBadge(): number {
  return useNotices().friendRequests;
}

export async function listFriendships(): Promise<{ data: Friendships; error: string | null }> {
  const { data, error } = await callRpc<FriendRow[]>('my_friendships', {}, FRIEND_TEXT);
  const rows = data ?? [];
  const result: Friendships = {
    friends: rows.filter((r) => r.kind === 'friend'),
    incoming: rows.filter((r) => r.kind === 'incoming'),
    outgoing: rows.filter((r) => r.kind === 'outgoing'),
  };
  if (!error) patchNotices({ friendRequests: result.incoming.length });
  return { data: result, error };
}

/** Bildirim sayılarını sunucudan okuyup noktaları günceller. Hata olursa eski sayılar kalır. */
export async function refreshIncomingBadge(): Promise<void> {
  await refreshNotices();
}

/** Çıkış yapılınca önceki hesabın noktaları kalmasın. */
export function resetIncomingBadge(): void {
  resetNotices();
}

export type SendOutcome = 'sent' | 'accepted';

async function send(
  name: string,
  args: Record<string, unknown>,
): Promise<{ outcome: SendOutcome | null; error: string | null }> {
  const { data, error } = await callRpc<string>(name, args, FRIEND_TEXT);
  if (error) return { outcome: null, error };
  return { outcome: data === 'accepted' ? 'accepted' : 'sent', error: null };
}

export function sendRequestForPost(postId: string) {
  return send('send_friend_request_for_post', { p_post_id: postId });
}

export function sendRequestForComment(commentId: string) {
  return send('send_friend_request_for_comment', { p_comment_id: commentId });
}

/** Etkinlik yorumu (gerçek adla yazılır) üzerinden arkadaşlık isteği */
export function sendRequestForEventComment(commentId: string) {
  return send('send_friend_request_for_event_comment', { p_comment_id: commentId });
}

export function sendRequestByCode(code: string) {
  return send('send_friend_request_by_code', { p_code: code });
}

export async function getMyFriendCode(): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('my_friend_code');
  return { code: data, error };
}

export type RespondAction = 'accept' | 'decline' | 'decline_block';

export function respondToRequest(id: string, action: RespondAction): Promise<Result> {
  return callRpcVoid('respond_friend_request', { p_id: id, p_action: action }, FRIEND_TEXT);
}

export function cancelRequest(id: string): Promise<Result> {
  return callRpcVoid('cancel_friend_request', { p_id: id });
}

export function removeFriend(id: string): Promise<Result> {
  return callRpcVoid('remove_friend', { p_id: id });
}

/** Arkadaşlık isteği pencerelerinde, kırmızı gerçek ad uyarısının altında gösterilen sakin açıklama. */
export const FRIEND_CONSEQUENCE =
  'Diğer üyeler seni yine rumuzunla görmeye devam eder. İstediğin zaman arkadaşlıktan çıkabilirsin.';

/** Gönderirken ve kabul ederken pencerede KIRMIZI uyarı olarak çıkar. */
export const FRIEND_WARNING = REAL_NAME.friend;
