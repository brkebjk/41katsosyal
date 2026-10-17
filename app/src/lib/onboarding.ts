// İlk giriş sırası: izin ekranları → şehir seçimi → uygulama eğitimi (sekme sekme) → hoş geldin. Her adım bir öncekinin
// bitmesini bekler. Eğitimin görüldüğü hesapta saklanır (her hesapta bir kez, telefondan bağımsız); sunucuya
// ulaşılamazsa bu telefondaki kayda bakılır.

import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { callRpc, callRpcVoid } from '@/lib/rpc';

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

async function localDone(userId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(tourKey(userId))) === '1';
  } catch {
    return true; // depo okunamıyorsa üyeyi her açılışta rahatsız etmeyelim
  }
}

export async function isTourDone(userId: string): Promise<boolean> {
  const res = await callRpc<boolean>('my_tour_done');
  if (res.error || typeof res.data !== 'boolean') return localDone(userId);
  if (res.data) return true;
  // Bu telefonda eskiden görülmüşse hesaba da işlenir (bir daha hiçbir telefonda çıkmaz)
  if (await localDone(userId)) {
    void callRpcVoid('mark_tour_done');
    return true;
  }
  return false;
}

/** Eğitim başlarken çağrılır: yarıda kalsa da bu hesapta bir daha gösterilmez */
export async function markTourDone(userId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(tourKey(userId), '1');
  } catch {
    // yok say
  }
  await callRpcVoid('mark_tour_done');
}
