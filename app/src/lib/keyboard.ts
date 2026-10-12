// Ekran klavyesi: klavyenin üst kenarının ekrandaki yeri ve "odaklı kutuyu görünür yap" isteği.
// Klavyeyi sürekli izlemek gibi bir şey değildir; yalnızca klavye açıkken ekranın nereye kadar
// göründüğünü anlamak içindir. Bilgi sunucuya gitmez.

import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

/** Klavye olayından klavyenin üst kenarının ekran konumu (dp). Klavye kapalıysa null. */
function keyboardTopOf(e: KeyboardEvent): number | null {
  const { screenY, height } = e.endCoordinates;
  const screenHeight = Dimensions.get('screen').height;
  if (!(height > 0)) return null;
  const y = Number.isFinite(screenY) && screenY > 0 ? screenY : screenHeight - height;
  // iOS "klavye gizlendi" olayını ekranın en altına inen bir kare olarak da bildirir
  return y >= screenHeight - 1 ? null : y;
}

/**
 * Klavyenin yüksekliği (dp). Kapalıyken 0. Android'de pencere içi koordinatlar (ör. Modal) ekran koordinatlarından
 * farklı olabildiği için, alanın klavyenin altına girip girmediği ikinci bir yolla da (pencere yüksekliğinden) hesaplanır.
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onShow = (e: KeyboardEvent) => setH(Math.max(0, e.endCoordinates.height || 0));
    const onHide = () => setH(0);
    const subs =
      Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillShow', onShow), Keyboard.addListener('keyboardWillHide', onHide)]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];
    return () => subs.forEach((x) => x.remove());
  }, []);
  return h;
}

/**
 * Klavyenin üst kenarının ekran konumu. Klavye kapalıyken null döner.
 * iOS'ta klavye açılırken (animasyon başlarken), Android'de açıldıktan sonra güncellenir.
 */
export function useKeyboardTop(): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onShow = (e: KeyboardEvent) => setTop(keyboardTopOf(e));
    const onHide = () => setTop(null);
    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),
            Keyboard.addListener('keyboardWillChangeFrame', onShow),
            Keyboard.addListener('keyboardWillHide', onHide),
          ]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return top;
}

// ---------------------------------------------------------------------------
// "Odaklı kutuyu görünür yap" isteği
// ---------------------------------------------------------------------------

const revealListeners = new Set<() => void>();

/** Kaydırılabilir alanlar bu isteği dinler: yazı kutusuna dokunulunca kutu klavyenin üstünde kalsın diye. */
export function onRevealRequest(fn: () => void): () => void {
  revealListeners.add(fn);
  return () => {
    revealListeners.delete(fn);
  };
}

/** Bir yazı kutusu odak aldığında çağrılır. */
export function requestReveal() {
  revealListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Hesaplar (ekrandan bağımsız, saf)
// ---------------------------------------------------------------------------

/**
 * Bir kutunun klavyenin altında kalmaması için içeriğin ne kadar kaydırılacağını hesaplar.
 * - `fieldTop`/`fieldHeight`: kutunun kaydırılan içerik içindeki konumu
 * - `scrollY`: şu anki kaydırma
 * - `visible`: kaydırma alanının klavyenin üstünde kalan görünür yüksekliği
 * - `maxScroll`: en fazla kaydırılabilecek miktar
 * Dönen değer yeni kaydırma konumudur (değişmeyecekse `scrollY` ile aynıdır).
 */
export function scrollTargetFor(
  fieldTop: number,
  fieldHeight: number,
  scrollY: number,
  visible: number,
  maxScroll: number,
  margin = 24,
): number {
  if (!(visible > 0)) return scrollY;
  let next = scrollY;
  // Altta kalıyorsa yukarı kaydır
  if (fieldTop + fieldHeight + margin > scrollY + visible) next = fieldTop + fieldHeight + margin - visible;
  // Kutu görünür alandan büyükse ya da üstte kalıyorsa kutunun üstü görünsün
  if (fieldTop - margin < next) next = fieldTop - margin;
  return Math.min(Math.max(0, next), Math.max(0, maxScroll));
}

/** Bir alanın alt kenarı klavyenin altına giriyorsa kaç dp yukarı itilmesi gerektiği. */
export function liftFor(containerBottom: number, keyboardTop: number | null): number {
  if (keyboardTop === null) return 0;
  return Math.max(0, Math.round(containerBottom - keyboardTop));
}
