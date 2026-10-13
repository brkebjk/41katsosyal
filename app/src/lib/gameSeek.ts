// Haritadaki petek menüsü: “Oyun arayanlar” listesi ve petek akışının özeti.
// Kurallar sunucudadır: kayıt için peteğin içinde ya da hemen yanında olmak gerekir, kayıt gece yarısına kadar geçerlidir,
// yalnızca yan yana oynanan oyunlar seçilir, listede yalnızca bu haftaki rumuz görünür.

import type { Cell } from '@/lib/hex';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type GameSeeker = {
  id: string;
  alias: string;
  avatar_index: number;
  game_type: string;
  game_title: string;
  created_at: string;
  is_mine: boolean;
  is_friend: boolean;
};

export type SeekGame = { key: string; title: string };

const SEEK_TEXT: Record<string, string> = {
  seek_not_allowed: 'Bu listeye yalnızca üyeler adını yazdırabilir.',
  location_required: 'Listeye yazılmak için konumuna bir kez bakılması gerekir.',
  seek_too_far: 'Listeye yazılmak için bu peteğin içinde ya da hemen yanında olmalısın.',
  invalid_cell: 'Bu petek haritanın dışında.',
  invalid_game: 'Bu oyun şu an seçilemiyor.',
  rate_limited: 'Biraz bekleyip tekrar dene.',
  request_not_found: 'Bu kişi artık listede değil.',
  cannot_block_self: 'Kendini engelleyemezsin.',
  already_friends: 'Zaten arkadaşsınız.',
  already_requested: 'Bu kişiye zaten istek gönderdin.',
  blocked_by_you: 'Bu kişiyi engellemişsin.',
};

export async function listGameSeekers(cell: Cell): Promise<{ data: GameSeeker[]; error: string | null }> {
  const { data, error } = await callRpc<GameSeeker[]>('game_seek_list', { p_q: cell.q, p_r: cell.r }, SEEK_TEXT);
  return { data: data ?? [], error };
}

export async function listSeekGames(): Promise<SeekGame[]> {
  const { data } = await callRpc<SeekGame[]>('game_seek_games', {}, SEEK_TEXT);
  return data ?? [];
}

export async function joinGameSeek(cell: Cell, my: Cell, gameType: string): Promise<Result> {
  return callRpcVoid(
    'game_seek_join',
    { p_q: cell.q, p_r: cell.r, p_my_q: my.q, p_my_r: my.r, p_game_type: gameType },
    SEEK_TEXT,
  );
}

export async function leaveGameSeek(): Promise<Result> {
  return callRpcVoid('game_seek_leave', {}, SEEK_TEXT);
}

export async function seekFriendRequest(id: string): Promise<{ outcome: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('game_seek_friend_request', { p_id: id }, SEEK_TEXT);
  return { outcome: error ? null : (data ?? null), error };
}

export async function seekBlock(id: string): Promise<Result> {
  return callRpcVoid('game_seek_block', { p_id: id }, SEEK_TEXT);
}

/** Petek akışı özeti: bu haftaki gönderi sayısı ve son gönderinin zamanı (içerik gelmez) */
export async function cellFeedSummary(cell: Cell): Promise<{ count: number; lastAt: string | null }> {
  const { data } = await callRpc<{ post_count: number; last_at: string | null }[]>('cell_feed_summary', {
    p_q: cell.q,
    p_r: cell.r,
  });
  const row = data?.[0];
  return { count: Number(row?.post_count) || 0, lastAt: row?.last_at ?? null };
}
