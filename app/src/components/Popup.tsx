import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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

/**
 * Ekranın ortasında açılan pencere (alttan çıkan panel değil). İçerik uzunsa pencerenin içinde kayar; dışına ya da
 * sağ üstteki çarpıya dokununca kapanır. İçindeki uyarı pencereleri de bu pencerenin üstünde görünür.
 */
export function Popup({ title, subtitle, icon, onClose, children, footer, testID }: Props) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.root} inModal>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.card, { maxHeight: Math.round(height * 0.86) }]} testID={testID} accessibilityViewIsModal>
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
        </View>
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
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
