// Telefonun kendi bildirimleri (yerel bildirim): yalnızca etkinlik hatırlatıcısı.
//
//  - Sunucudan telefona “push” gönderilmez; hatırlatma telefonda kurulur ve saati gelince telefon kendisi gösterir.
//  - Hatırlatma, ön kayıt yaptığım (ya da düzenlediğim) etkinliğin başlamasından 30 dakika önce çıkar.
//  - expo-notifications'ın ana dosyası Expo Go'da (Android) uzaktan bildirim kaydı denediği için hata verir;
//    bu yüzden yalnızca gereken parçalar ayrı ayrı içe aktarılır.

import { Platform } from 'react-native';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';

import { callRpc } from '@/lib/rpc';

const CHANNEL = 'event-reminders';
const PREFIX = 'event-reminder-';
/** Hatırlatma, etkinlik başlamadan bu kadar dakika önce çıkar */
export const REMINDER_MINUTES = 30;

let prepared = false;

/** Uygulama açıkken gelen hatırlatma da ekranda gösterilsin; Android için bildirim kanalı açılır. */
async function prepare(): Promise<void> {
  if (prepared) return;
  prepared = true;
  try {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(CHANNEL, {
        name: 'Etkinlik hatırlatmaları',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }
  } catch {
    // Bildirim modülü yoksa (ör. web) sessizce geçilir
  }
}

/** Telefonun bildirim izni var mı? */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Telefonun bildirim izin penceresini açar (izin zaten varsa pencere çıkmaz). */
export async function askNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await prepare();
    const now = await getPermissionsAsync();
    if (now.granted) return true;
    if (!now.canAskAgain) return false;
    return (await requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

type ReminderRow = { id: string; title: string; starts_at: string };

let syncing: Promise<void> | null = null;

/**
 * Hatırlatmaları sunucudaki listeyle eşitler: yeni ön kayıtlar için kurar, kaydı silinen / iptal edilen / saati
 * değişen etkinliklerin hatırlatmasını kaldırır. Tercih kapalıysa sunucu boş liste döner ve hepsi silinir.
 * İzin yoksa hiçbir şey yapmaz.
 */
export function syncEventReminders(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      if (!(await hasNotificationPermission())) return;
      await prepare();
      const { data, error } = await callRpc<ReminderRow[]>('my_event_reminders');
      if (error) return;
      const rows = data ?? [];
      const wanted = new Map<string, { title: string; at: number }>();
      const now = Date.now();
      for (const row of rows) {
        const at = new Date(row.starts_at).getTime() - REMINDER_MINUTES * 60_000;
        if (Number.isFinite(at) && at > now + 15_000) wanted.set(`${PREFIX}${row.id}@${at}`, { title: row.title, at });
      }
      const existing = await getAllScheduledNotificationsAsync();
      const have = new Set<string>();
      for (const n of existing) {
        if (!n.identifier.startsWith(PREFIX)) continue;
        if (wanted.has(n.identifier)) have.add(n.identifier);
        else await cancelScheduledNotificationAsync(n.identifier);
      }
      for (const [identifier, item] of wanted) {
        if (have.has(identifier)) continue;
        await scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Etkinliğin yaklaşıyor',
            body: `“${item.title}” ${REMINDER_MINUTES} dakika sonra başlıyor. Yerinde katılım kodunu girmeyi unutma!`,
            data: { route: '/events' },
          },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: new Date(item.at), channelId: CHANNEL },
        });
      }
    } catch {
      // Hatırlatma kurulamazsa uygulama etkilenmez
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Çıkış yapılınca bu telefondaki etkinlik hatırlatmaları silinir. */
export async function clearEventReminders(): Promise<void> {
  try {
    const existing = await getAllScheduledNotificationsAsync();
    for (const n of existing) {
      if (n.identifier.startsWith(PREFIX)) await cancelScheduledNotificationAsync(n.identifier);
    }
  } catch {
    // yok say
  }
}

/**
 * Paket 28: anında telefon bildirimi (ör. moderatör çekiliş açınca). Sunucu push göndermez; uygulama açıkken (ya da
 * arka planda kısa süre çalışırken) yeni duyuruyu görünce telefonun bildirim alanına kendisi düşürür. İzin yoksa geçer.
 */
export async function showPhoneNotification(title: string, body: string, route?: string): Promise<void> {
  try {
    if (!(await hasNotificationPermission())) return;
    await prepare();
    await scheduleNotificationAsync({
      content: { title, body, data: route ? { route } : {} },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch {
    // Bildirim gösterilemezse uygulama etkilenmez
  }
}
