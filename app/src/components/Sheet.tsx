import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardLift } from '@/components/KeyboardLift';
import { useBackClose } from '@/lib/backPress';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Aşağı bu kadar sürüklenince (ya da hızlıca çekilince) panel kapanır */
const CLOSE_DISTANCE = 90;

/**
 * Panelin üst kısmından (tutamak ve başlık) tutup aşağı sürükleyince kapatma. İçerik kaydırılabildiği için
 * sürükleme yalnızca üst kısımdan başlar. Döner: panelin kayma değeri ve üst kısma verilecek dokunma işleyicileri.
 */
export function useDragToClose(onClose: () => void) {
  const [dy] = useState(() => new Animated.Value(0));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => dy.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > 1.1) {
            Animated.timing(dy, {
              toValue: 700,
              duration: 180,
              useNativeDriver: true,
            }).start(() => onClose());
          } else {
            Animated.spring(dy, {
              toValue: 0,
              useNativeDriver: true,
              friction: 7,
            }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(dy, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dy, onClose],
  );
  return { translateY: dy, handlers: responder.panHandlers };
}

/**
 * Alttan açılan kart pencerelerine (ör. kod yazma) sürükleyerek kapatma: kartın üstüne bir tutamak koyar; tutamaktan
 * tutup aşağı sürükleyince pencere kapanır.
 */
export function DragDismiss({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const drag = useDragToClose(onClose);
  return (
    <Animated.View style={{ transform: [{ translateY: drag.translateY }] }}>
      <View {...drag.handlers} style={styles.cardGrab} accessibilityHint="Kapatmak için aşağı sürükle">
        <View style={styles.handle} />
      </View>
      {children}
    </Animated.View>
  );
}

type DragHandlers = ReturnType<typeof useDragToClose>['handlers'];
const DragCtx = createContext<DragHandlers | null>(null);

/**
 * Tam ekran alttan açılan pencereler (gönderi, yorumlar, yeni gönderi…) için: içindeki `DragGrab` şeridinden tutup
 * aşağı sürükleyince pencere kapanır. İçerik kaydırması etkilenmez.
 */
export function DragScreen({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const drag = useDragToClose(onClose);
  return (
    <DragCtx.Provider value={drag.handlers}>
      <Animated.View style={[styles.flex, { transform: [{ translateY: drag.translateY }] }]}>{children}</Animated.View>
    </DragCtx.Provider>
  );
}

/** `DragScreen` içindeki tutamak şeridi (pencerenin en üstüne konur) */
export function DragGrab() {
  const handlers = useContext(DragCtx);
  return (
    <View {...(handlers ?? {})} style={styles.screenGrab} accessibilityHint="Kapatmak için aşağı sürükle">
      <View style={styles.handle} />
    </View>
  );
}

/**
 * Ekranın altından çıkan panel. Ayrı bir pencere (Modal) açmaz; bulunduğu ekranın üstüne biner.
 * Böylece başka bir pencerenin içinde de güvenle kullanılır. Kapsayıcı ekranın `flex: 1` olması gerekir.
 * Üst kısmından tutup aşağı sürükleyince kapanır.
 */
export function Sheet({ title, subtitle, onClose, children }: Props) {
  const drag = useDragToClose(onClose);
  // Android geri tuşu / geri hareketi paneli kapatır
  useBackClose(true, onClose);
  return (
    <View style={[styles.root, styles.passThrough]}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" accessibilityRole="button" />
      <KeyboardLift style={[styles.kav, styles.passThrough]}>
        <Animated.View
          style={[styles.panel, { transform: [{ translateY: drag.translateY }] }]}
          accessibilityViewIsModal
        >
          {/* Tutamak + başlık: buradan tutup aşağı sürükleyince panel kapanır */}
          <View {...drag.handlers} style={styles.grab} accessibilityHint="Kapatmak için aşağı sürükle">
            <View style={styles.handle} />
            {title ? (
              <View style={styles.head}>
                <Text style={styles.title} numberOfLines={2}>
                  {title}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            ) : null}
          </View>
          <KeyboardAwareScroll
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {children}
          </KeyboardAwareScroll>
        </Animated.View>
      </KeyboardLift>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenGrab: { alignItems: 'center', justifyContent: 'center', height: 22 },
  passThrough: { pointerEvents: 'box-none' },
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.7)',
  },
  kav: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg + 6,
    borderTopRightRadius: radii.lg + 6,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.sm,
  },
  grab: { paddingTop: 2 },
  cardGrab: { paddingTop: spacing.md, paddingBottom: 2 },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
    opacity: 0.6,
    marginBottom: spacing.sm,
  },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  title: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
  },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  body: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
