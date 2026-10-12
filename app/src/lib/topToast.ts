// Üstten kayan bildirim: uygulama açıkken yeni bir bildirim ya da duyuru gelince ekranın üstünde birkaç saniye
// görünür, telefon kısa titrer. Sunucuya yarım dakikada bir “yeni bir şey var mı?” diye sorulur.

import { useSyncExternalStore } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

import { refreshNotices } from '@/lib/notices';
import type { NotificationKind } from '@/lib/notifications';
import { showPhoneNotification } from '@/lib/localNotify';
import { callRpc } from '@/lib/rpc';

export type ToastItem = {
  id: string;
  source: 'personal' | 'announcement';
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  /** Aynı anda gelen diğer bildirimlerin sayısı */
  more: number;
};

let current: ToastItem | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(item: ToastItem | null): void {
  current = item;
  emit();
}

export function useToast(): ToastItem | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => null,
  );
}

function buzz() {
  try {
    if (Platform.OS === 'android') Vibration.vibrate([0, 180, 90, 180]);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // titreşim yoksa geçilir
  }
}

type Row = Omit<ToastItem, 'more'>;

let since: string | null = null;
const seen = new Set<string>();
let polling = false;

/** Uygulama açılırken: son 10 dakikada gelmiş, okunmamış bildirimler de bir kez gösterilir. */
export function resetToastClock(): void {
  since = new Date(Date.now() - 10 * 60_000).toISOString();
  seen.clear();
  showToast(null);
}

/** Yeni bildirim var mı? Varsa en yenisi üstte gösterilir (diğerleri “+N” olarak yazılır). */
export async function pollToasts(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    if (!since) resetToastClock();
    // 5 saniyelik pay: geç kaydedilen bir bildirim kaçmasın (aynısı “seen” ile ikinci kez gösterilmez)
    const from = since ? new Date(Date.parse(since) - 5000).toISOString() : null;
    const { data, error } = await callRpc<Row[]>('my_new_notifications', { p_since: from });
    if (error || !data || data.length === 0) return;
    const fresh = data.filter((r) => !seen.has(`${r.source}-${r.id}`));
    for (const r of data) {
      seen.add(`${r.source}-${r.id}`);
      if (!since || Date.parse(r.created_at) >= Date.parse(since)) since = r.created_at;
    }
    if (fresh.length === 0) return;
    const latest = fresh[fresh.length - 1];
    showToast({ ...latest, data: latest.data ?? {}, more: fresh.length - 1 });
    buzz();
    // Moderatör çekilişi: telefonun bildirim alanına da düşer
    for (const r of fresh) {
      if (r.source === 'announcement' && (r.data as { akind?: string } | null)?.akind === 'raffle') {
        void showPhoneNotification(r.title, r.body, '/games');
      }
    }
    void refreshNotices();
  } finally {
    polling = false;
  }
}
