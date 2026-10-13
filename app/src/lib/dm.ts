// Özel mesajlar (DM). Yalnızca rumuzla yazışılır; iki kişi arkadaşsa gerçek ad görünür. Yazışmayı yalnızca abone
// başlatır, karşı taraf cevap verebilir. Karşı taraf cevap verene kadar en çok 3 mesaj. Arkadaş olmayanların yazışması
// her Pazartesi kapanır (rumuzlar değişir). Bütün kurallar sunucudadır; buradaki sayılar yalnızca ekranda anlatmak için.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export const DM_MAX = 500;
export const DM_STREAK = 3;

export type DmThread = {
  id: string;
  other_name: string;
  other_avatar: number;
  is_friend: boolean;
  last_body: string | null;
  last_at: string;
  last_mine: boolean | null;
  unread: number;
  i_started: boolean;
};

export type DmMessage = { id: string; body: string; mine: boolean; created_at: string };

export type DmView = {
  id: string;
  other_name: string;
  other_avatar: number;
  my_alias: string;
  is_friend: boolean;
  blocked: boolean;
  i_started: boolean;
  streak: number;
  can_send: boolean;
  messages: DmMessage[];
};

const DM_TEXT: Record<string, string> = {
  dm_subscribers_only: 'Yeni bir yazışmayı yalnızca aboneler başlatabilir. Sana gelen mesajlara cevap verebilirsin.',
  dm_target_not_found: 'Bu kişiye şu an mesaj gönderilemiyor (içerik kaldırılmış ya da geçen haftadan olabilir).',
  dm_self: 'Kendine mesaj gönderemezsin.',
  dm_not_allowed: 'Bu hesaba özel mesaj gönderilemez.',
  dm_blocked: 'Bu kişiyle yazışma engellendi.',
  dm_rate_limited: 'Bugün çok fazla yeni yazışma başlattın. Yarın tekrar dene.',
  dm_closed: 'Bu yazışma kapandı. Arkadaş olmayanların yazışması her Pazartesi kapanır.',
  dm_reply_only: 'Bu yazışmada karşı taraf yazınca cevap verebilirsin.',
  dm_wait_reply: 'Karşı taraf cevap verene kadar en çok 3 mesaj gönderebilirsin.',
  invalid_body: 'Mesaj 1 ile 500 karakter arasında olmalı.',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz.',
  rate_limited: 'Çok hızlı yazıyorsun. Biraz bekleyip tekrar dene.',
  muted: 'Hesabın geçici olarak susturuldu. Bu sürede mesaj yazamazsın.',
  target_not_found: 'Bu mesaj bulunamadı.',
  invalid_reason: 'Bir neden seç.',
};

/** Yazışma başlatır ya da açık olanı döndürür. Kişi gönderi, yorum ya da arkadaşlık üzerinden seçilir. */
export async function openDm(target: {
  post?: string;
  comment?: string;
  friendship?: string;
  /** @rumuz etiketinden ya da rumuz profilinden (bu haftaki rumuz) */
  alias?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>(
    'dm_open',
    {
      p_post: target.post ?? null,
      p_comment: target.comment ?? null,
      p_friendship: target.friendship ?? null,
      p_alias: target.alias ?? null,
    },
    DM_TEXT,
  );
  return { id: error ? null : (data ?? null), error };
}

/**
 * Mesaj kutusundaki “+”: alıcıyı yazarak bulur. “Kaptan#145” / “#145” rumuzdur (bu haftaki); başka bir metin yalnızca
 * arkadaşlarının gerçek adında aranır. Büyük/küçük harf önemsizdir. Eşleşme yoksa yazışma açılmaz.
 */
export async function openDmByName(query: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>(
    'dm_open_by_name',
    { p_query: query },
    {
      dm_target_not_found:
        'Bu ada sahip kimse bulunamadı. Rumuzu “Kaptan#145” ya da “#145” biçiminde, gerçek adı ise yalnızca arkadaşların için tam yaz.',
      dm_name_ambiguous: 'Bu adla birden çok arkadaşın var. Kişinin rumuzunu (ör. #145) yaz.',
      ...DM_TEXT,
    },
  );
  return { id: error ? null : (data ?? null), error };
}

export async function listDms(): Promise<{ data: DmThread[]; error: string | null }> {
  const { data, error } = await callRpc<DmThread[]>('dm_list', {}, DM_TEXT);
  return { data: (data ?? []).map((t) => ({ ...t, unread: Number(t.unread) || 0 })), error };
}

export async function dmUnreadCount(): Promise<number> {
  const { data, error } = await callRpc<number>('dm_unread_count', {}, DM_TEXT);
  return error ? 0 : Number(data) || 0;
}

export async function viewDm(id: string): Promise<{ data: DmView | null; error: string | null }> {
  const { data, error } = await callRpc<DmView>('dm_view', { p_thread: id }, DM_TEXT);
  return { data: error ? null : data, error };
}

export async function sendDm(id: string, body: string): Promise<Result> {
  return callRpcVoid('dm_send', { p_thread: id, p_body: body }, DM_TEXT);
}

export async function blockDm(id: string): Promise<Result> {
  return callRpcVoid('dm_block', { p_thread: id }, DM_TEXT);
}

export async function reportDm(messageId: string, reason: string): Promise<Result> {
  return callRpcVoid('report_content', { p_type: 'dm', p_id: messageId, p_reason: reason }, DM_TEXT);
}
