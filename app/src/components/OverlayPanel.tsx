import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';

import { useBackClose } from '@/lib/backPress';
import { colors } from '@/theme';

/** Sol kenardan bu kadar içeride başlayan sağa kaydırma “geri” sayılır */
const EDGE = 32;

/** Dokunma işleyicilerinin okuduğu güncel kapatma işlevi (çizim bunu okumaz) */
class CloseHolder {
  fn: () => void = () => {};
  set(fn: () => void) {
    this.fn = fn;
  }
}

/**
 * Ekranın üstüne binen tam sayfa panel (ayrı pencere / Modal açmaz). Bulunduğu ekranın klavye düzeni aynen geçerli olur:
 * akıştaki yazı kutusu gibi, içindeki yazı kutusu da klavyenin (ve öneri şeridinin) üstünde kalır.
 * Kapatma: Android geri tuşu / geri hareketi ve ekranın sol kenarından sağa kaydırma. Ekranın `overlay` alanına konmalıdır.
 */
export function OverlayPanel({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [slide] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const [slideX] = useState(() => new Animated.Value(0));
  const [closer] = useState(() => new CloseHolder());
  useEffect(() => {
    closer.set(onClose);
  }, [closer, onClose]);
  useEffect(() => {
    if (!visible) return;
    slide.setValue(Dimensions.get('window').height * 0.4);
    slideX.setValue(0);
    Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [visible, slide, slideX]);
  useBackClose(visible, onClose);

  // Sol kenardan sağa kaydırınca panel kapanır (içerideki kaydırmalar etkilenmez)
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => g.x0 <= EDGE && g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => slideX.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        const width = Dimensions.get('window').width;
        if (g.dx > width * 0.3 || g.vx > 0.6) {
          Animated.timing(slideX, { toValue: width, duration: 160, useNativeDriver: true }).start(() => closer.fn());
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start(),
    }),
  );

  if (!visible) return null;
  return (
    <Animated.View
      {...swipe.panHandlers}
      style={[styles.root, { transform: [{ translateY: slide }, { translateX: slideX }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
    backgroundColor: colors.bg,
  },
});
