// Bu telefonun kimliği (cihaz başına 1 hesap kuralı için).
//
// İlk açılışta rastgele bir kimlik üretilir ve telefonun güvenli deposunda (SecureStore) saklanır.
// Sunucuya yalnızca kayıt olurken gider; sunucu kimliğin kendisini değil özetini (sha256) tutar.

import * as SecureStore from 'expo-secure-store';

const KEY = 'kat41_device_id';
let cached: string | null = null;

function randomId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 40; i++) out += hex[Math.floor(Math.random() * 16)];
  return `d-${Date.now().toString(36)}-${out}`;
}

/** Telefonun kimliği. Depo okunamazsa bu oturumluk bir kimlik üretilir. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved && saved.length >= 16) {
      cached = saved;
      return saved;
    }
    const fresh = randomId();
    await SecureStore.setItemAsync(KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    cached = randomId();
    return cached;
  }
}
