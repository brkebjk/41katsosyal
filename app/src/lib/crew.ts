// Ekip (oyun ekibi): arkadaş olanlar kalıcı bir ekip kurar (en çok 5 kişi). Ekipçe oynanan puanlı oyunların puanı
// Ekip Sıralaması'na da yazılır. Her üye haftada 1 kez ekibe girer; yeni üyenin katkısı 3 gün sonra sayılır.
// Bütün kurallar sunucudadır; buradaki sayılar yalnızca ekranda anlatmak için.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type CrewMember = {
  id: string;
  /** Arkadaşınsa gerçek adı, değilse bu haftaki rumuzu */
  name: string;
  alias: string;
  avatar: number;
  is_me: boolean;
  is_founder: boolean;
  is_friend: boolean;
  joined_at: string;
  /** Ekip puanına katkısının sayılmaya başladığı an */
  counts_from: string;
  month_points: number;
};

export type CrewInvite = { id: string; crew_name: string; from_name: string; created_at: string; members: number };

export type CrewView = {
  max_members: number;
  contrib_days: number;
  /** Ekibe yeniden girebileceğin an (haftada 1 kuralı); boşsa şimdi girebilirsin */
  next_change_at: string | null;
  crew: {
    id: string;
    name: string;
    is_founder: boolean;
    created_at: string;
    month_points: number;
    my_points: number;
    rank: number | null;
    members: CrewMember[];
    pending: { id: string; name: string; created_at: string }[];
  } | null;
  invites: CrewInvite[];
};

export type CrewMessage = { id: string; alias: string; avatar: number; body: string; mine: boolean; created_at: string };

export type CrewInbox = {
  id: string;
  name: string;
  unread: number;
  members: number;
  last_body: string | null;
  last_alias: string | null;
  last_mine: boolean | null;
  last_at: string;
} | null;

export type CrewRankRow = { place: number; crew_name: string; members: number; points: number; is_mine: boolean };

export type CrewTarget = { friend: boolean; same_crew: boolean; can_invite: boolean };

export const CREW_MAX_BODY = 500;

const CREW_TEXT: Record<string, string> = {
  crew_not_allowed: 'Bu hesap ekip kuramaz.',
  crew_already_member: 'Zaten bir ekiptesin. Yeni ekip kurmak için önce ekibinden ayrıl.',
  crew_change_wait: 'Ekibe haftada 1 kez girilebilir (kurmak, katılmak, değiştirmek). Biraz sonra tekrar dene.',
  crew_invalid_name: 'Ekip adı 2 ile 30 karakter arasında olmalı; bağlantı ya da iletişim bilgisi içeremez.',
  crew_not_member: 'Bir ekipte değilsin.',
  crew_founder_only: 'Bunu yalnızca ekibin kurucusu yapabilir.',
  crew_target_invalid: 'Bu kişi ekibe davet edilemez.',
  crew_not_friend: 'Ekibe yalnızca arkadaşını davet edebilirsin. Önce arkadaş ekle.',
  crew_already_in: 'Bu kişi zaten ekibinde.',
  crew_invite_exists: 'Bu kişiye zaten davet gönderdin.',
  crew_full: 'Ekip dolu (en çok 5 kişi, bekleyen davetler dahil).',
  crew_invite_not_found: 'Davet bulunamadı.',
  crew_invite_closed: 'Bu davet artık geçerli değil.',
  invalid_body: 'Mesaj 1 ile 500 karakter arasında olmalı.',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz.',
  rate_limited: 'Çok hızlı gidiyorsun. Biraz bekleyip tekrar dene.',
  muted: 'Hesabın geçici olarak susturuldu. Bu sürede yazamazsın.',
};

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export async function getCrewView(): Promise<{ data: CrewView | null; error: string | null }> {
  const { data, error } = await callRpc<CrewView>('crew_view', {}, CREW_TEXT);
  if (error || !data) return { data: null, error: error ?? 'Ekip bilgisi okunamadı.' };
  const c = data.crew;
  return {
    data: {
      ...data,
      crew: c
        ? {
            ...c,
            month_points: num(c.month_points),
            my_points: num(c.my_points),
            rank: c.rank === null || c.rank === undefined ? null : num(c.rank),
            members: (c.members ?? []).map((m) => ({ ...m, month_points: num(m.month_points) })),
            pending: c.pending ?? [],
          }
        : null,
      invites: data.invites ?? [],
    },
    error: null,
  };
}

export async function createCrew(name: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('crew_create', { p_name: name }, CREW_TEXT);
  return { id: data, error };
}

export function renameCrew(name: string): Promise<Result> {
  return callRpcVoid('crew_rename', { p_name: name }, CREW_TEXT);
}

export function inviteToCrew(userId: string): Promise<Result> {
  return callRpcVoid('crew_invite', { p_target: userId }, CREW_TEXT);
}

export function respondCrewInvite(inviteId: string, accept: boolean): Promise<Result> {
  return callRpcVoid('crew_invite_respond', { p_invite: inviteId, p_accept: accept }, CREW_TEXT);
}

export function leaveCrew(): Promise<Result> {
  return callRpcVoid('crew_leave', {}, CREW_TEXT);
}

export function kickFromCrew(userId: string): Promise<Result> {
  return callRpcVoid('crew_kick', { p_user: userId }, CREW_TEXT);
}

/** Oyun ekranındaki oyuncu penceresi: bu kişiyi ekibime davet edebilir miyim? */
export async function crewTargetStatus(roomId: string, userId: string): Promise<CrewTarget | null> {
  const { data } = await callRpc<CrewTarget>('crew_target_status', { p_room: roomId, p_target: userId });
  return data ?? null;
}

export async function listCrewMessages(): Promise<{ data: CrewMessage[] | null; error: string | null }> {
  const { data, error } = await callRpc<CrewMessage[]>('crew_messages_list', {}, CREW_TEXT);
  return { data: error ? null : (data ?? []), error };
}

export function sendCrewMessage(body: string): Promise<Result> {
  return callRpcVoid('crew_say', { p_body: body }, CREW_TEXT);
}

export async function getCrewInbox(): Promise<CrewInbox> {
  const { data } = await callRpc<CrewInbox>('crew_inbox');
  return data ? { ...data, unread: num(data.unread), members: num(data.members) } : null;
}

export async function getCrewLeaderboard(
  monthsAgo = 0,
): Promise<{ data: CrewRankRow[]; error: string | null }> {
  const { data, error } = await callRpc<CrewRankRow[]>('get_crew_leaderboard', { p_limit: 100, p_months_ago: monthsAgo });
  return {
    data: error ? [] : (data ?? []).map((r) => ({ ...r, place: num(r.place), members: num(r.members), points: num(r.points) })),
    error,
  };
}

export function reportCrewMessage(messageId: string, reason: string): Promise<Result> {
  return callRpcVoid('report_content', { p_type: 'crew_msg', p_id: messageId, p_reason: reason }, CREW_TEXT);
}
