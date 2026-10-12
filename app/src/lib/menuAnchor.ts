import type { GestureResponderEvent } from 'react-native';

/** Menünün açıldığı dokunuş noktası (ekran koordinatı). Verilirse menü oradan baloncuk gibi açılır. */
export type MenuAnchor = { x: number; y: number };

/** Dokunuşun ekran üzerindeki yeri */
export function anchorOf(e: GestureResponderEvent): MenuAnchor {
  return { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
}
