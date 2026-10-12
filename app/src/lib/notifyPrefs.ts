// Bildirim tercihleri: hangi tür bildirimlerin geleceğini üye seçer. Tercihler sunucuda saklanır;
// kapatılan türde (oyun daveti, arkadaşlık isteği, bahsetme) sunucu bildirimi hiç oluşturmaz.

import { callRpc, type Result } from '@/lib/rpc';

export type NotifyPrefKey = 'game_invite' | 'special_events' | 'friend_request' | 'mention' | 'event_reminder';
export type NotifyPrefs = Record<NotifyPrefKey, boolean>;

type IconName =
  | 'game-controller'
  | 'sparkles'
  | 'person-add'
  | 'at'
  | 'alarm';

export const PREF_ITEMS: { key: NotifyPrefKey; title: string; subtitle: string; icon: IconName }[] = [
  { key: 'game_invite', title: 'Oyun davetleri', subtitle: 'Yakındaki ya da arkadaşının oyun odası çağrısı', icon: 'game-controller' },
  {
    key: 'special_events',
    title: 'Özel etkinlikler ve hazineler',
    subtitle: 'Yeni 41. Kat Özel etkinlik ve yeni hazine duyuruları',
    icon: 'sparkles',
  },
  { key: 'friend_request', title: 'Arkadaşlık istekleri', subtitle: 'Biri seni arkadaş olarak eklemek istediğinde', icon: 'person-add' },
  { key: 'mention', title: 'Bahsetmeler', subtitle: 'Akışta biri senden @rumuzunla bahsettiğinde', icon: 'at' },
  {
    key: 'event_reminder',
    title: 'Etkinlik hatırlatmaları',
    subtitle: 'Ön kayıt yaptığın etkinlik başlamadan 30 dakika önce',
    icon: 'alarm',
  },
];

export const ALL_ON: NotifyPrefs = {
  game_invite: true,
  special_events: true,
  friend_request: true,
  mention: true,
  event_reminder: true,
};

const TEXT: Record<string, string> = { invalid_prefs: 'Tercihler kaydedilemedi. Tekrar dene.' };

function clean(raw: unknown): NotifyPrefs {
  const out = { ...ALL_ON };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(ALL_ON) as NotifyPrefKey[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

export async function getNotifyPrefs(): Promise<{ data: NotifyPrefs | null; error: string | null }> {
  const { data, error } = await callRpc<unknown>('get_notification_prefs', undefined, TEXT);
  return { data: error ? null : clean(data), error };
}

export async function saveNotifyPrefs(prefs: Partial<NotifyPrefs>): Promise<Result & { data?: NotifyPrefs }> {
  const { data, error } = await callRpc<unknown>('set_notification_prefs', { p_prefs: prefs }, TEXT);
  if (error) return { error };
  return { error: null, data: clean(data) };
}
