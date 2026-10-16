// Şehir: üye girişten sonra şehrini seçer (İstanbul, Kocaeli, İzmir). Akış, etkinlikler ve yan yana odalar şehre
// özeldir; uzaktan oyunlar bütün illere açıktır. Şehir değiştirmek göçtür: göç listesine yazılır, aylık sıralama
// sıfırlandığında (ay başı) yeni şehir geçerli olur. Moderatör hemen taşınır.
// Ziyaret modu: başka bir şehrin yalnızca haritasına bakılır (petek özeti görünür, içeriklere girilmez).
// Bütün kurallar sunucudadır; bu dosya yalnızca ekranda göstermek ve sunucuya sormak içindir.

import { useSyncExternalStore } from 'react';

import { CITY_KEYS, CITY_NAMES, type CityKey } from '@/lib/hex';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export { CITY_KEYS, CITY_NAMES, type CityKey };

export type CityState = {
  /** Sunucudan okundu mu */
  loaded: boolean;
  /** Kendi şehrim (henüz seçilmediyse boş) */
  my: CityKey | null;
  /** Göç listesindeysem gideceğim şehir ve geçerli olacağı an */
  next: CityKey | null;
  nextAt: string | null;
  /** Şimdi göç listesine yazılırsam göçün gerçekleşeceği an (gelecek ay başı) */
  moveAt: string | null;
  /** Moderatör: hemen taşınır */
  instant: boolean;
  /** Ziyaret edilen şehir (boşsa kendi şehrim) */
  visiting: CityKey | null;
  /** Moderatör: her şehirde her şeyi yapabilir (ziyarette kısıt yok; akış ve etkinlikler baktığı şehrin) */
  admin: boolean;
};

let state: CityState = {
  loaded: false,
  my: null,
  next: null,
  nextAt: null,
  moveAt: null,
  instant: false,
  visiting: null,
  admin: false,
};
const listeners = new Set<() => void>();
function emit(patch: Partial<CityState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const asCity = (x: unknown): CityKey | null =>
  typeof x === 'string' && (CITY_KEYS as readonly string[]).includes(x) ? (x as CityKey) : null;

const TEXT: Record<string, string> = {
  invalid_city: 'Şehir geçersiz.',
  city_already_set: 'Şehrini zaten seçtin. Şehir değiştirmek için Profil > Şehrim’den göç edebilirsin.',
  city_not_set: 'Önce şehrini seç.',
  move_not_confirmed: 'Göçü onaylamak için kutuya “Göçü onaylıyorum” yaz.',
  same_city: 'Zaten bu şehirdesin.',
  city_required: 'Önce şehrini seç.',
  wrong_city: 'Yalnızca kendi şehrinin haritasında etkinlik açabilirsin.',
  city_not_here: 'Yalnızca bulunduğun şehri seçebilirsin. Konumunu yeniden alıp tekrar dene.',
};

type Raw = { city: string | null; next: string | null; next_at: string | null; move_at: string | null; instant: boolean };

/** Şehrimi sunucudan okur (göç zamanı geldiyse sunucu göçü tamamlar) */
export async function loadCity(): Promise<void> {
  const { data, error } = await callRpc<Raw>('my_city', {}, TEXT);
  if (error || !data) return;
  const my = asCity(data.city);
  emit({
    loaded: true,
    my,
    next: asCity(data.next),
    nextAt: data.next_at,
    moveAt: data.move_at,
    instant: !!data.instant,
    // Ziyaret ettiğim şehir kendi şehrimse ziyaret biter
    visiting: state.visiting && state.visiting !== my ? state.visiting : null,
  });
}

/** Oturum kapanınca */
export function resetCity(): void {
  emit({ loaded: false, my: null, next: null, nextAt: null, moveAt: null, instant: false, visiting: null, admin: false });
}

/** İlk şehir seçimi: `cell` telefonun bir kez aldığı konumun peteği (sunucu şehrin bu petekle uyuştuğuna bakar) */
export async function setMyCity(city: CityKey, cell: { q: number; r: number } | null): Promise<Result> {
  const res = await callRpcVoid('set_my_city', { p_city: city, p_q: cell?.q ?? null, p_r: cell?.r ?? null }, TEXT);
  if (!res.error) await loadCity();
  return res;
}

export async function requestCityMove(city: CityKey, confirm: string): Promise<Result> {
  const res = await callRpcVoid('request_city_move', { p_city: city, p_confirm: confirm }, TEXT);
  if (!res.error) await loadCity();
  return res;
}

export async function cancelCityMove(): Promise<Result> {
  const res = await callRpcVoid('cancel_city_move', {}, TEXT);
  if (!res.error) await loadCity();
  return res;
}

/** Moderatör: bir üyeyi hemen başka şehre taşır */
export function adminSetCity(userId: string, city: CityKey): Promise<Result> {
  return callRpcVoid('admin_set_city', { p_user: userId, p_city: city }, TEXT);
}

/** Ziyaret modu: başka bir şehre bak (kendi şehrim ya da boş = ziyaret biter) */
export function setVisiting(city: CityKey | null): void {
  emit({ visiting: city && city !== state.my ? city : null });
}

/** Giriş yapan moderatör mü (kök düzen bildirir) */
export function setCityAdmin(admin: boolean): void {
  if (state.admin !== admin) emit({ admin });
}

export function getCityState(): CityState {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * view: haritada bakılan şehir · readOnly: ziyaretçi (moderatörde hiç) · content: akışın ve etkinliklerin şehri
 * (üyede her zaman kendi şehri; moderatörde baktığı şehir)
 */
export function useCity(): CityState & { view: CityKey | null; readOnly: boolean; content: CityKey | null } {
  const s = useSyncExternalStore(subscribe, getCityState, getCityState);
  const view = s.visiting ?? s.my;
  return { ...s, view, readOnly: s.visiting !== null && !s.admin, content: s.admin ? view : s.my };
}

/** Akışın ve etkinliklerin şehri (hook dışında; moderatörde baktığı şehir) */
export function contentCity(): CityKey | null {
  return state.admin ? (state.visiting ?? state.my) : state.my;
}

/** Şehrin adı (boşsa boş) */
export function cityName(c: CityKey | null | undefined): string {
  return c ? CITY_NAMES[c] : '';
}

/** Şehrin "-de/-da" eki: İstanbul'da, Kocaeli'de, İzmir'de */
export function cityIn(c: CityKey | null | undefined): string {
  if (!c) return '';
  return { istanbul: 'İstanbul’da', kocaeli: 'Kocaeli’de', izmir: 'İzmir’de' }[c];
}

/** Kendi şehrimin haritası (oluşturma ekranları ve süs haritaları; moderatörde baktığı şehir; okunmadıysa Kocaeli) */
export function useMyMapCity(): CityKey {
  const s = useSyncExternalStore(subscribe, getCityState, getCityState);
  return (s.admin ? (s.visiting ?? s.my) : s.my) ?? 'kocaeli';
}
