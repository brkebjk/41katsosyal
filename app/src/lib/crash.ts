// Çökme takibi: uygulamada yakalanmamış bir hata olunca yalnızca hatanın yeri sunucuya yazılır (mesaj, kod satırları,
// ekran adı, uygulama sürümü, telefon türü). Üye kimliği, konum ve cihaz kimliği gönderilmez; sunucu da e-posta ve uzun
// sayıları siler. Aynı hata tek satırda sayılır; moderatör web panelindeki “Hatalar” sayfasında görür.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Bir açılışta en çok bu kadar hata gönderilir (döngüye giren bir hata sunucuyu doldurmasın) */
const MAX_PER_RUN = 10;

let installed = false;
let sent = 0;
let screen = '';
const seen = new Set<string>();

/** Hatanın hangi ekranda olduğu (kök düzen her ekran değişiminde bildirir) */
export function setCrashScreen(path: string): void {
  screen = path;
}

function parts(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: `${err.name}: ${err.message}`, stack: err.stack ?? '' };
  }
  if (typeof err === 'string') return { message: err, stack: '' };
  try {
    return { message: JSON.stringify(err), stack: '' };
  } catch {
    return { message: String(err), stack: '' };
  }
}

/** Hatayı sunucuya bildirir (sessizdir; gönderilemezse hiçbir şey olmaz) */
export function reportError(err: unknown, fatal = false): void {
  if (!supabase || sent >= MAX_PER_RUN) return;
  const { message, stack } = parts(err);
  const key = `${message}|${stack.split('\n')[1] ?? ''}`;
  if (!message || seen.has(key)) return;
  seen.add(key);
  sent += 1;
  const stackLines = stack.split('\n').slice(0, 15).join('\n');
  void Promise.resolve(
    supabase.rpc('report_client_error', {
      p_message: message.slice(0, 300),
      p_stack: stackLines.slice(0, 2000),
      p_screen: screen.slice(0, 120),
      p_platform: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
      p_version: String(Constants.expoConfig?.version ?? '').slice(0, 40),
      p_fatal: fatal,
    }),
  ).catch(() => {});
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler?: () => GlobalHandler; setGlobalHandler?: (h: GlobalHandler) => void };

/** Yakalanmamış hataları dinlemeye başlar (bir kez). Önceki davranış (geliştirici ekranı vb.) aynen sürer. */
export function installCrashReporting(): void {
  if (installed) return;
  installed = true;
  const eu = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  const prev = eu?.getGlobalHandler?.();
  eu?.setGlobalHandler?.((error, isFatal) => {
    reportError(error, Boolean(isFatal));
    prev?.(error, isFatal);
  });
}
