// Uzaktan bildirim (uygulama kapalıyken telefona gelen bildirim).
//
//  - Bildirim izni verildiyse telefonun Expo bildirim adresi sunucuya yazılır (yalnızca bu adres; başka bilgi yok).
//  - Sunucu, bildirim kutusuna düşen her bildirimi üyenin tercihine göre bu adrese genel bir cümleyle gönderir
//    (kişi adı ya da mesaj içeriği gitmez). Bildirime dokununca uygulama bildirim kutusunu açar.
//  - Çıkış yapınca adres sunucudan silinir. Proje kimliği (EAS) yoksa hiçbir şey yapılmaz.
//  - expo-notifications'ın ana dosyası Expo Go'da (Android) hata verdiği için parçalar ayrı ayrı içe aktarılır.

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { getExpoPushTokenAsync } from 'expo-notifications/build/getExpoPushTokenAsync';
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';

import { hasNotificationPermission } from '@/lib/localNotify';
import { supabase } from '@/lib/supabase';

const TOKEN_KEY = 'peoplehere_push_token';

function projectId(): string | null {
  const c = Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
    easConfig?: { projectId?: string };
  };
  return c.expoConfig?.extra?.eas?.projectId ?? c.easConfig?.projectId ?? null;
}

/** Sunucuya en son ne zaman yazıldı (uygulamaya her dönüşte tekrar tekrar yazılmasın) */
let lastAt = 0;
const AGAIN_MS = 10 * 60_000;

/** Telefonun bildirim adresini sunucuya yazar (izin yoksa ya da proje kimliği yoksa sessizce geçer) */
export async function registerPush(force = false): Promise<void> {
  if (!supabase || Platform.OS === 'web') return;
  const id = projectId();
  if (!id) return;
  if (!force && Date.now() - lastAt < AGAIN_MS) return;
  lastAt = Date.now();
  try {
    if (!(await hasNotificationPermission())) return;
    const { data: token } = await getExpoPushTokenAsync({ projectId: id });
    if (!token) return;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (!error) SecureStore.setItem(TOKEN_KEY, token);
  } catch {
    // Expo Go'da (Android) ya da ağ yokken uzaktan bildirim kurulamaz; uygulama etkilenmez
  }
}

/** Çıkış yaparken: bu telefonun adresi sunucudan silinir (bu üyenin bildirimleri bu telefona gelmez) */
export async function unregisterPush(): Promise<void> {
  if (!supabase) return;
  let token: string | null = null;
  try {
    token = SecureStore.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  if (!token) return;
  lastAt = 0;
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  } catch {
    // ağ yoksa sunucu kaydı kalır; başka biri bu telefonda giriş yapınca adres ona geçer
  }
}

function openFrom(data: unknown): void {
  // Sunucudan gelen bildirimde `url`, telefonun kendi bildiriminde `route` vardır
  const d = data as { url?: unknown; route?: unknown } | null;
  const url = d?.url ?? d?.route;
  // Yalnızca uygulamanın kendi sayfalarına gidilir
  if (typeof url === 'string' && url.startsWith('/')) {
    try {
      router.push(url as never);
    } catch {
      // ekranlar hazır değilse geçilir
    }
  }
}

/** Bildirime dokununca ilgili ekran açılır. Uygulama bildirimle açıldıysa o bildirim de bir kez işlenir. */
export function listenPushTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  let sub: { remove: () => void } | null = null;
  try {
    sub = addNotificationResponseReceivedListener((r) => openFrom(r.notification.request.content.data));
    void getLastNotificationResponseAsync()
      .then((r) => {
        if (r) openFrom(r.notification.request.content.data);
      })
      .catch(() => {});
  } catch {
    sub = null;
  }
  return () => sub?.remove();
}
