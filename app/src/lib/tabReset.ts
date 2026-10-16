// Sekme değişince bırakılan sekmenin ilk haline dönmesi: açık pencereler kapanır, filtreler / seçimler sıfırlanır.
// Yalnızca BAŞKA bir sekmeye geçildiğinde olur; aynı sekmeden bir ekrana gidip geri dönünce (ör. akıştan birinin
// sayfasına girip çıkınca) sekme olduğu gibi kalır.

import { useSyncExternalStore } from 'react';

const counters = new Map<string, number>();
const listeners = new Set<() => void>();
let current: string | null = null;

const focusListeners = new Set<(name: string) => void>();

/** Sekme çubuğu: bir sekme odaklandığında çağrılır */
export function tabFocused(name: string) {
  if (current !== null && current !== name) {
    counters.set(current, (counters.get(current) ?? 0) + 1);
    listeners.forEach((l) => l());
  }
  current = name;
  focusListeners.forEach((l) => l(name));
}

/** Şu an açık sekme (henüz bilinmiyorsa boş) */
export function currentTab(): string | null {
  return current;
}

/** Bir sekme her açıldığında haber verir (uygulama eğitimi); dönen işlev dinlemeyi bırakır */
export function onTabFocused(fn: (name: string) => void): () => void {
  focusListeners.add(fn);
  return () => {
    focusListeners.delete(fn);
  };
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Sekme ekranının anahtarı: sekmeden ayrılınca değişir, ekran baştan kurulur */
export function useTabResetKey(name: string): number {
  return useSyncExternalStore(
    subscribe,
    () => counters.get(name) ?? 0,
    () => 0,
  );
}
