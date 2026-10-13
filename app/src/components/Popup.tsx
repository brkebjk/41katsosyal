import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { CloseX } from '@/components/CloseX';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onClose: () => void;
  children: ReactNode;
  /** Kaydırılan alanın altında sabit duran kısım (ör. düğmeler) */
  footer?: ReactNode;
  testID?: string;
};

/** Ekranın sol kenarından bu kadar içeride başlayan sağa kaydırma "geri" sayılır */
const EDGE = 40;
/** Bu kadar sağa kaydırınca (ya da hızlıca fırlatınca) pencere kapanır */
const CLOSE_DX = 80;

/**
 * Kaydırarak geri: ekranın sol kenarından sağa kaydırınca pencere kapanır (iPhone'daki geri hareketi gibi).
 * Android'de telefonun kendi geri hareketi zaten pencereyi kapatır.
 */
function useEdgeSwipeClose(onClose: () => void) {
  const [dx] = useState(() => new Animated.Value(0));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          g.x0 <= EDGE && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => dx.setValue(Math.max(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > CLOSE_DX || g.vx > 0.8) {
            Animated.timing(dx, { toValue: 500, duration: 160, useNativeDriver: true }).start(() => onClose());
          } else {
            Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dx, onClose],
  );
  return { translateX: dx, handlers: responder.panHandlers };
}

/**
 * Ekranın ortasında açılan pencere (alttan çıkan panel değil). İçerik uzunsa pencerenin içinde kayar; dışına ya da
 * sağ üstteki çarpıya dokununca kapanır. Telefonun geri tuşu ve sol kenardan sağa kaydırma da pencereyi kapatır.
 * İçindeki uyarı pencereleri de bu pencerenin üstünde görünür.
 */
export function Popup({ title, subtitle, icon, onClose, children, footer, testID }: Props) {
  const { height } = useWindowDimensions();
  const swipe = useEdgeSwipeClose(onClose);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.flex} {...swipe.handlers}>
      <KeyboardLift style={styles.root} inModal>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <Animated.View
          style={[styles.card, { maxHeight: Math.round(height * 0.86), transform: [{ translateX: swipe.translateX }] }]}
          testID={testID}
          accessibilityViewIsModal
        >
          <View style={styles.head}>
            {icon ? (
              <View style={styles.badge}>
                <Ionicons name={icon} size={18} color={colors.primary} />
              </View>
            ) : null}
            <View style={styles.headText}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={18} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardLift>
      </View>
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.8)' },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 2 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 16 },
  scroll: { flexGrow: 0 },
  body: { gap: spacing.sm, paddingBottom: 2 },
  footer: { gap: spacing.sm },
});
