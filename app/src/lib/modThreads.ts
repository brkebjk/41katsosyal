// Kat Görevlisi (moderatör) ile yazışma. Moderatörün mesajı üyede bir yazışma açar; üye cevap yazabilir.
// Moderatör görüşmeyi bitirince yazışma tamamen silinir. Hangi moderatörün yazdığı üyeye gösterilmez.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type ThreadMessage = { id: string; from_admin: boolean; body: string; created_at: string };

export type ModThread = {
  id: string;
  title: string;
  created_at: string;
  /** Moderatör olarak mı açtım? */
  as_admin: boolean;
  member_name: string | null;
  member_alias: string | null;
  messages: ThreadMessage[];
};

export type ThreadSummary = {
  id: string;
  title: string;
  last_at: string;
  unread: boolean;
  last_body: string | null;
  last_from_admin: boolean | null;
  /** yalnızca moderatör listesinde */
  user_id?: string;
  member_name?: string;
  member_alias?: string;
  message_count?: number;
};

export const THREAD_MAX = 1000;

const TEXT: Record<string, string> = {
  thread_not_found: 'Bu yazışma artık yok. Kat Görevlisi görüşmeyi sonlandırmış olabilir.',
  invalid_body: 'Mesaj boş olamaz ve 1000 karakteri geçemez.',
  wait_for_reply: 'Üst üste en çok 3 mesaj yazabilirsin. Kat Görevlisinin cevabını bekle.',
  rate_limited: 'Biraz yavaş. Birkaç saniye sonra tekrar dene.',
  thread_full: 'Bu yazışma çok uzadı. Kat Görevlisi yeni bir görüşme açabilir.',
  forbidden: 'Bunu yalnızca moderatör yapabilir.',
};

export async function getThread(id: string): Promise<{ data: ModThread | null; error: string | null }> {
  const { data, error } = await callRpc<ModThread>('get_mod_thread', { p_thread_id: id }, TEXT);
  if (error || !data) return { data: null, error: error ?? TEXT.thread_not_found };
  return { data: { ...data, messages: Array.isArray(data.messages) ? data.messages : [] }, error: null };
}

export async function replyThread(id: string, body: string): Promise<Result> {
  return callRpcVoid('reply_mod_thread', { p_thread_id: id, p_body: body }, TEXT);
}

export async function listMyThreads(): Promise<{ data: ThreadSummary[]; error: string | null }> {
  const { data, error } = await callRpc<ThreadSummary[]>('list_my_mod_threads', undefined, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function adminListThreads(): Promise<{ data: ThreadSummary[]; error: string | null }> {
  const { data, error } = await callRpc<ThreadSummary[]>('admin_list_mod_threads', undefined, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function adminEndThread(id: string): Promise<Result> {
  return callRpcVoid('admin_end_mod_thread', { p_thread_id: id }, TEXT);
}
