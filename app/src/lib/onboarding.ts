// İlk giriş sırası: izin ekranları → şehir seçimi → uygulama eğitimi (sekme sekme) → hoş geldin. Her adım bir öncekinin
// bitmesini bekler. Eğitimin görüldüğü bu telefonda üye başına saklanır.

import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

let permissionsDone = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** İzin ekranları bitti (ya da daha önce görülmüştü) */
export function setPermissionsDone(v: boolean): void {
  if (permissionsDone === v) return;
  permissionsDone = v;
  listeners.forEach((l) => l());
}

export function usePermissionsDone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => permissionsDone,
    () => permissionsDone,
  );
}

const tourKey = (userId: string) => `peoplehere_tour_v1_${userId.replace(/[^A-Za-z0-9_-]/g, '')}`;

export async function isTourDone(userId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(tourKey(userId))) === '1';
  } catch {
    return true; // depo okunamıyorsa üyeyi her açılışta rahatsız etmeyelim
  }
}

export async function markTourDone(userId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(tourKey(userId), '1');
  } catch {
    // yok say
  }
}
