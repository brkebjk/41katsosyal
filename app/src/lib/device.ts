// Bu telefonun kimliği (cihaz başına 1 hesap kuralı için).
//
// Android: telefonun kalıcı kimliği (ANDROID_ID) kullanılır. Uygulama silinip yeniden kurulsa da değişmez; yalnızca
// telefon fabrika ayarlarına döndürülünce değişir. Böylece uygulamayı silip kurarak yeni hesap açılamaz.
// iPhone (ve Android kimliği okunamazsa): ilk açılışta rastgele bir kimlik üretilir ve telefonun güvenli deposunda
// (SecureStore) saklanır.
// Sunucuya yalnızca kayıt olurken gider; sunucu kimliğin kendisini değil özetini (sha256) tutar.

import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'kat41_device_id';
let cached: string | null = null;

function randomId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 40; i++) out += hex[Math.floor(Math.random() * 16)];
  return `d-${Date.now().toString(36)}-${out}`;
}

/** Android'in kalıcı kimliği; okunamazsa ya da geçersizse boş. */
function androidId(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const id = (Application.getAndroidId() ?? '').trim().toLowerCase();
    // Eski bazı telefonlarda herkese aynı dönen hatalı değer kullanılmaz
    if (!/^[0-9a-f]{8,64}$/.test(id) || id === '9774d56d682e549c' || /^0+$/.test(id)) return null;
    return `android-${id}`;
  } catch {
    return null;
  }
}

/** Telefonun kimliği. Depo okunamazsa bu oturumluk bir kimlik üretilir. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const android = androidId();
  if (android) {
    cached = android;
    return android;
  }
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
