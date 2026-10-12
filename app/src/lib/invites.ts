// Oyun davetleri, etkinlik ekipleri ve oyun/etkinlik bildirme. Bütün kurallar sunucuda uygulanır.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

const TEXT: Record<string, string> = {
  room_closed: 'Oyun başladı ya da oda kapandı; artık davet gönderilemez.',
  invite_limit: 'Bu odadan gönderilebilecek davet sınırına ulaştın.',
  event_started: 'Etkinlik başladı; ekip değişikliği yapılamaz.',
  not_registered: 'Önce etkinliğe katılmalısın.',
  not_seeking: 'Ekip arayanları görmek için önce “Ekip arıyorum”u aç.',
  target_not_seeking: 'Bu kişi artık ekip aramıyor.',
  target_in_team: 'Bu kişi başka bir ekibe katılmış.',
  team_full: 'Ekip dolu (en çok 8 kişi).',
  already_invited: 'Bu kişiye zaten davet gönderdin.',
  already_in_team: 'Zaten bir ekiptesin. Önce ekibinden ayrıl.',
  invite_not_found: 'Bu davet artık geçerli değil.',
  invalid_contact: 'İletişim bilgisi 3 ile 200 karakter arasında olmalı.',
  not_in_team: 'Bir ekipte değilsin.',
  invalid_target: 'Bu kişiye davet gönderilemez.',
  event_not_found: 'Bu etkinlik artık yok.',
  invalid_type: 'Bu içerik bildirilemez.',
  invite_not_accepted: 'Önce davetin kabul edilmesi gerekiyor.',
  room_msg_limit: 'Bu yazışmadaki mesaj hakkın doldu.',
  invalid_body: 'Mesaj 1 ile 200 karakter arasında olmalı.',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz.',
  forbidden: 'Bu yazışmaya erişimin yok.',
  muted: 'Hesabın geçici olarak susturuldu.',
  room_chat_closed: 'Oda kapandı ya da davetli odaya girdi; bu yazışma kapandı.',
};

// ---------------------------------------------------------------------------------------------
// Oyun davetleri
// ---------------------------------------------------------------------------------------------

// ---- Paket 33: daveti kabul et ve oda sahibiyle kısa yazışma (gerçek adla; özel mesajlarda listelenmez) ----

/** Oda sahibi, daveti kabul eden kişiye adres tarifi için en çok bu kadar mesaj gönderebilir */
export const ROOM_HOST_MSG_LIMIT = 3;

export type MyRoomInvite = { invite_id: string; accepted: boolean; open: boolean; joined?: boolean };

export async function getMyRoomInvite(roomId: string): Promise<MyRoomInvite | null> {
  const { data, error } = await callRpc<MyRoomInvite | null>('my_room_invite', { p_room_id: roomId }, TEXT);
  return error ? null : (data ?? null);
}

export async function acceptRoomInvite(roomId: string): Promise<{ inviteId: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('accept_room_invite', { p_room_id: roomId }, TEXT);
  return { inviteId: error ? null : (data ?? null), error };
}

export type RoomThread = {
  role: 'host' | 'guest';
  other_name: string;
  game: string | null;
  place_note: string | null;
  open: boolean;
  /** Davetli odaya girdi (yazışma bu yüzden kapandı) */
  joined?: boolean;
  left: number;
  messages: { id: string; body: string; mine: boolean; created_at: string }[];
};

export async function getRoomThread(inviteId: string): Promise<{ data: RoomThread | null; error: string | null }> {
  return callRpc<RoomThread>('room_invite_thread', { p_invite: inviteId }, TEXT);
}

export async function sendRoomMessage(inviteId: string, body: string): Promise<Result> {
  return callRpcVoid('room_invite_message', { p_invite: inviteId, p_body: body }, TEXT);
}

/** Oda sahibinin oyun ekranında: daveti kabul edenler ve her birine kalan mesaj hakkı */
export type AcceptedInvite = {
  invite_id: string;
  name: string;
  closed: boolean;
  joined: boolean;
  left: number;
  replies: number;
};

export async function getAcceptedInvites(roomId: string): Promise<{ data: AcceptedInvite[]; error: string | null }> {
  const { data, error } = await callRpc<AcceptedInvite[]>('room_accepted_invites', { p_room_id: roomId }, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function setGameInvites(on: boolean): Promise<Result> {
  return callRpcVoid('set_game_invites', { p_on: on }, TEXT);
}

export type InviteTargets = { friends: { id: string; name: string }[]; nearby: number; sent: number };

export async function getInviteTargets(roomId: string): Promise<{ data: InviteTargets | null; error: string | null }> {
  return callRpc<InviteTargets>('room_invite_targets', { p_room_id: roomId }, TEXT);
}

export async function sendRoomInvites(
  roomId: string,
  friendIds: string[],
  nearby: boolean,
): Promise<{ sent: number; error: string | null }> {
  const { data, error } = await callRpc<number>(
    'send_room_invites',
    { p_room_id: roomId, p_user_ids: friendIds, p_nearby: nearby },
    TEXT,
  );
  return { sent: typeof data === 'number' ? data : 0, error };
}

// ---------------------------------------------------------------------------------------------
// Etkinlik ekipleri
// ---------------------------------------------------------------------------------------------

/** Ekip puan çarpanı: ekipten kodla katılımı doğrulanan kişi sayısına göre */
export function teamMultiplier(n: number): number {
  if (n >= 8) return 2;
  if (n >= 4) return 1.5;
  if (n >= 2) return 1.25;
  return 1;
}

export function multiplierText(m: number): string {
  return `x${String(m).replace('.', ',')}`;
}

export const TEAM_RULE_TEXT =
  'Etkinliğe ekipçe gelip hepiniz kodu doğrularsanız katılım puanınız artar: 2 kişi x1,25 · 4 kişi x1,5 · 8 kişi x2. ' +
  'Ekip etkinlik başlamadan kurulur; en çok 8 kişidir.';

export async function setTeamSeeking(eventId: string, on: boolean): Promise<Result> {
  return callRpcVoid('set_team_seeking', { p_event_id: eventId, p_on: on }, TEXT);
}

export type TeamSeeker = {
  user_id: string;
  full_name: string;
  in_my_team: boolean;
  team_size: number;
  invited_by_me: boolean;
  invited_me: boolean;
  seeking: boolean;
};

export async function listTeamSeekers(eventId: string): Promise<{ data: TeamSeeker[]; error: string | null }> {
  const { data, error } = await callRpc<TeamSeeker[]>('list_team_seekers', { p_event_id: eventId }, TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function sendTeamInvite(eventId: string, userId: string): Promise<Result> {
  return callRpcVoid('send_team_invite', { p_event_id: eventId, p_to: userId }, TEXT);
}

export async function respondTeamInvite(inviteId: string, accept: boolean, contact?: string): Promise<Result> {
  return callRpcVoid(
    'respond_team_invite',
    { p_invite_id: inviteId, p_accept: accept, p_contact: contact ?? null },
    TEXT,
  );
}

export async function leaveTeam(eventId: string): Promise<Result> {
  return callRpcVoid('leave_event_team', { p_event_id: eventId }, TEXT);
}

// ---------------------------------------------------------------------------------------------
// Oyun odası ya da etkinliği bildir
// ---------------------------------------------------------------------------------------------

export async function reportTarget(type: 'room' | 'event', id: string, reason: string): Promise<Result> {
  return callRpcVoid('report_content', { p_type: type, p_id: id, p_reason: reason }, TEXT);
}
