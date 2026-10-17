// Ekran yönü: uygulama dikey çalışır; yalnızca Okey ve 101 masası yatay açılır. Kilit kurulamazsa (ör. web) sessizce
// geçilir, ekranlar o anki yöne göre düzenlenir.

import * as ScreenOrientation from 'expo-screen-orientation';

export function lockPortrait(): void {
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

export function lockLandscape(): void {
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
}

/** iOS'ta yatay ekranda açılan pencere (Modal) bu yönleri desteklemezse uygulama kapanır; pencereler hepsini kabul eder. */
export const MODAL_ORIENTATIONS: ('portrait' | 'landscape' | 'landscape-left' | 'landscape-right')[] = [
  'portrait',
  'landscape',
  'landscape-left',
  'landscape-right',
];
