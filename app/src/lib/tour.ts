// Uygulama eğitimi: ekranlardaki anlatılacak alanlar (TourTarget) ekrandaki yerlerini buraya bildirir. Eğitim o anki
// adımın alanını ister (activeTourId); alan kendini ölçer ve yerini yazar, eğitim çevresini karartır.

import { useSyncExternalStore } from 'react';

export type TourRect = { x: number; y: number; w: number; h: number };

let active: string | null = null;
const rects = new Map<string, TourRect>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Eğitimin şu an anlattığı alan (boş = eğitim yok) */
export function setActiveTourId(id: string | null): void {
  if (active === id) return;
  active = id;
  emit();
}

export function useActiveTourId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => active,
  );
}

/** Alan ekrandaki yerini yazar (pencereye göre) */
export function reportTourRect(id: string, r: TourRect): void {
  const old = rects.get(id);
  if (old && old.x === r.x && old.y === r.y && old.w === r.w && old.h === r.h) return;
  rects.set(id, r);
  emit();
}

export function useTourRect(id: string | null): TourRect | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return id ? (rects.get(id) ?? null) : null;
}

/** Ekran kapanınca alanın eski yeri silinir (yeni ekranda yeniden ölçülür) */
export function clearTourRect(id: string): void {
  if (rects.delete(id)) emit();
}

let running = true;

/** Eğitim sürüyor mu (sürerken ya da henüz bakılmadıysa sekme ipuçları gösterilmez) */
export function setTourRunning(on: boolean): void {
  if (running === on) return;
  running = on;
  emit();
}

export function useTourRunning(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running,
    () => running,
  );
}
