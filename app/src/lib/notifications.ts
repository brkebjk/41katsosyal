// Bildirim kutusu (harita ekranının üstünde): moderatör mesajları, genel duyurular, arkadaşlık istekleri ve
// sistem mesajları. Sonraki sürümlerde oyun ve etkinlik ekibi davetleri de buraya gelecek.

import type { Href } from 'expo-router';

import { patchNotices } from '@/lib/notices';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type NotificationKind =
  | 'admin_message'
  | 'friend_request'
  | 'system'
  | 'game_invite'
  | 'team_invite'
  | 'mention'
  | 'dm'
  | 'room_msg'
  | 'crew_invite'
  | 'crew_mention'
  | 'announcement';

export type AppNotification = {
  id: string;
  /** 'personal' = yalnızca bana, 'announcement' = herkese duyuru */
  source: 'personal' | 'announcement';
  kind: NotificationKind;
  title: string;
  body: string;
  data: { route?: string } & Record<string, unknown>;
  created_at: string;
  is_read: boolean;
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  admin_message: 'Moderatör mesajı',
  friend_request: 'Arkadaşlık isteği',
  system: 'Sistem',
  game_invite: 'Oyun daveti',
  team_invite: 'Ekip daveti',
  mention: 'Bahsetme',
  dm: 'Özel mesaj',
  room_msg: 'Oda yazışması',
  crew_invite: 'Klan daveti',
  crew_mention: 'Klan sohbeti',
  announcement: 'Duyuru',
};

/** Bildirimden açılabilecek ekranlar (sunucudan gelen adres yalnızca bu listedeyse açılır) */
const ROUTES = [
  '/arkadaslar',
  '/events',
  '/games',
  '/akis',
  '/profile',
  '/abonelik',
  '/acik-odalar',
  '/hazine',
  '/cekilis',
  '/klan',
] as const;
type SimpleRoute = Exclude<(typeof ROUTES)[number], '/acik-odalar' | '/akis'>;

/** Bildirime dokununca açılacak ekran (yoksa null). */
export function notificationTarget(n: { kind: string; data?: Record<string, unknown> | null }): Href | null {
  const data = n.data ?? {};
  // Oyun daveti: harita odanın peteğine gider ve peteği sarı okla gösterir
  if (n.kind === 'game_invite' && typeof data.q === 'number' && typeof data.r === 'number') {
    return { pathname: '/', params: { q: String(data.q), r: String(data.r), t: String(Date.now()), arrow: '1' } };
  }
  const route = typeof data.route === 'string' ? data.route : null;
  if (!route || !(ROUTES as readonly string[]).includes(route)) return null;
  if (route === '/acik-odalar') {
    const game = typeof data.game === 'string' ? data.game : undefined;
    return { pathname: '/acik-odalar', params: game ? { game } : {} };
  }
  if (route === '/akis') {
    if (typeof data.dm === 'string') return { pathname: '/akis', params: { dm: data.dm, t: String(Date.now()) } };
    if (data.crew === true) return { pathname: '/akis', params: { crew: '1', t: String(Date.now()) } };
    return data.mentions === true ? { pathname: '/akis', params: { m: String(Date.now()) } } : '/akis';
  }
  return route as SimpleRoute;
}

export async function listNotifications(): Promise<{ data: AppNotification[]; error: string | null }> {
  const { data, error } = await callRpc<AppNotification[]>('list_my_notifications');
  return { data: error ? [] : (data ?? []), error };
}

/** Kutu açılınca hepsi okundu sayılır; harita sekmesindeki nokta söner. */
export async function markAllRead(): Promise<Result> {
  const res = await callRpcVoid('mark_notifications_read');
  if (!res.error) patchNotices({ notifications: 0 });
  return res;
}

export async function deleteNotification(id: string): Promise<Result> {
  return callRpcVoid('delete_my_notification', { p_id: id });
}
