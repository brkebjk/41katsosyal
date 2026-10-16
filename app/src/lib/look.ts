// Görünüm (yönetim panelinden): özellik aç/kapa, kampanya şeridi, şehir açılış görseli ve özel gün teması.
//
//  - Uygulama açılırken ve şehir değişince sunucudan okunur (app_look).
//  - Özel gün teması renkleri ekranlara açılışta yazıldığı için bir sonraki açılışta uygulanır: tema telefonda
//    saklanır, uygulama açılırken (theme/index.ts) okunur.
//  - Kapalı bir özelliği sunucu da reddeder; burada yalnızca girişleri gizlemek için kullanılır.

import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { callRpc } from '@/lib/rpc';
import { saveLookTheme } from '@/theme';

export type FeatureKey =
  | 'akis'
  | 'etkinlik_acma'
  | 'yan_yana'
  | 'uzaktan'
  | 'bilgi_yarismasi'
  | 'mesajlar'
  | 'hazine';

export type PromoBanner = {
  id: string;
  text: string;
  link: string | null;
  color: 'primary' | 'accent' | 'highlight' | 'event' | 'game' | 'venue';
};

type LookState = {
  features: Partial<Record<FeatureKey, boolean>>;
  banners: PromoBanner[];
  /** Şehrin açılış görselinin dosya yolu (app-look kutusu) */
  splash: string | null;
  /** Kapatılan şeritler (bu telefonda) */
  dismissed: string[];
};

const DISMISS_KEY = 'peoplehere_banner_closed';

function readDismissed(): string[] {
  try {
    const v = SecureStore.getItem(DISMISS_KEY);
    const list = v ? (JSON.parse(v) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(-50) : [];
  } catch {
    return [];
  }
}

let state: LookState = { features: {}, banners: [], splash: null, dismissed: readDismissed() };
const listeners = new Set<() => void>();

function emit(patch: Partial<LookState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const COLORS = ['primary', 'accent', 'highlight', 'event', 'game', 'venue'] as const;

type Raw = {
  features?: Record<string, unknown>;
  banners?: unknown[];
  splash?: unknown;
  theme?: Record<string, unknown>;
};

/** Görünümü sunucudan okur (şehrin şeritleri ve açılış görseli için içerik şehri verilir) */
export async function loadLook(city: string | null): Promise<void> {
  const { data, error } = await callRpc<Raw>('app_look', { p_city: city });
  if (error || !data) return;
  const features: Partial<Record<FeatureKey, boolean>> = {};
  for (const [k, v] of Object.entries(data.features ?? {})) {
    if (typeof v === 'boolean') features[k as FeatureKey] = v;
  }
  const banners: PromoBanner[] = [];
  for (const b of data.banners ?? []) {
    const r = b as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.text !== 'string') continue;
    const color = (COLORS as readonly string[]).includes(String(r.color)) ? (r.color as PromoBanner['color']) : 'primary';
    banners.push({ id: r.id, text: r.text, link: typeof r.link === 'string' ? r.link : null, color });
  }
  emit({ features, banners, splash: typeof data.splash === 'string' && data.splash ? data.splash : null });
  // Özel gün teması bir sonraki açılışta uygulanır
  saveLookTheme(data.theme ?? {});
}

/** Şeridi bu telefonda kapatır */
export function dismissBanner(id: string): void {
  const list = [...state.dismissed.filter((x) => x !== id), id].slice(-50);
  try {
    SecureStore.setItem(DISMISS_KEY, JSON.stringify(list));
  } catch {
    // kaydedilemezse yalnızca bu açılışta kapalı kalır
  }
  emit({ dismissed: list });
}

export function useLook(): LookState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Özellik açık mı (ayar yoksa açık) */
export function featureOn(f: Partial<Record<FeatureKey, boolean>>, key: FeatureKey): boolean {
  return f[key] !== false;
}

let splashTaken = false;
/** Şehir açılış görseli bu açılışta bir kez gösterilir: ilk çağrıda true, sonra hep false */
export function takeSplashTurn(): boolean {
  if (splashTaken) return false;
  splashTaken = true;
  return true;
}

/** Oturum kapanınca */
export function resetLook(): void {
  emit({ features: {}, banners: [], splash: null });
}
