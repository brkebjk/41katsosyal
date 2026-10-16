// Taslaklar: doldurulabilir pencerelerde (etkinlik oluştur, gönderi, yorum, mesaj) yazılanlar telefonda saklanır.
// Uygulama arka plana atılıp telefon tarafından kapatılsa ya da yeniden yüklense bile pencere yeniden açılınca
// yazılanlar geri gelir. Gönderilince ya da pencere bilerek kapatılınca taslak silinir. Taslak yalnızca bu telefonda
// durur, sunucuya gitmez; oturum kapanınca hepsi silinir. Oyun ekranları bu kurala dahil değildir.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';

const PREFIX = 'peoplehere.draft.';
const SAVE_MS = 400;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Taslağı kaydeder (yazarken kısa bir bekleyişle); boş değer taslağı siler */
export function saveDraft(key: string, value: unknown): void {
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const k = PREFIX + key;
      void (isEmpty(value) ? AsyncStorage.removeItem(k) : AsyncStorage.setItem(k, JSON.stringify(value))).catch(() => {});
    }, SAVE_MS),
  );
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.delete(key);
  void AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}

/** Oturum kapanınca: bütün taslaklar silinir */
export async function clearAllDrafts(): Promise<void> {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* önemli değil */
  }
}

/**
 * Tek bir yazı kutusunun taslağı. `key` boşsa (ör. henüz hangi sohbet olduğu bilinmiyorsa) hiçbir şey yapmaz.
 * Kutu açılınca taslak varsa ve kutu boşsa taslak yazılır; sonra her değişiklik kaydedilir.
 */
export function useDraftText(key: string | null, value: string, setValue: (v: string) => void): void {
  const restored = useRef<string | null>(null);
  const valueRef = useRef(value);
  const setRef = useRef(setValue);
  useEffect(() => {
    valueRef.current = value;
    setRef.current = setValue;
  });

  useEffect(() => {
    restored.current = null;
    if (!key) return;
    let alive = true;
    void loadDraft<string>(key).then((v) => {
      if (!alive) return;
      if (typeof v === 'string' && v && !valueRef.current) setRef.current(v);
      restored.current = key;
    });
    return () => {
      alive = false;
    };
  }, [key]);

  useEffect(() => {
    if (!key || restored.current !== key) return;
    saveDraft(key, value);
  }, [key, value]);
}
