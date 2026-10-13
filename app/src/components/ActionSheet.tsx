import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { Sheet } from '@/components/Sheet';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

import type { MenuAnchor } from '@/lib/menuAnchor';

export type { MenuAnchor };

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type ActionOption = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  title?: string;
  subtitle?: string;
  options: ActionOption[];
  onClose: () => void;
  /** Dokunulan nokta: menü alttan değil, o noktadan konuşma baloncuğu gibi açılır */
  anchor?: MenuAnchor;
};

/** Alt menü: bir başlık ve alt alta seçenekler. Seçenek işlemi menüyü gerekirse kendisi kapatır. */
export function ActionSheet({ title, subtitle, options, onClose, anchor }: Props) {
  if (anchor)
    return <BubbleMenu title={title} subtitle={subtitle} options={options} onClose={onClose} anchor={anchor} />;
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <View style={styles.list}>
        {options.map((o) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            onPress={o.onPress}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {o.icon ? <Ionicons name={o.icon} size={20} color={o.destructive ? colors.danger : colors.text} /> : null}
            <Text style={[styles.label, o.destructive && styles.labelDanger]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <Text style={styles.cancelText}>Vazgeç</Text>
      </Pressable>
    </Sheet>
  );
}

const BUBBLE_MAX_W = 270;
const EDGE = 12;
const TAIL = 8;

/**
 * Dokunulan yerden açılan baloncuk menü (rumuz / avatar menüsü). Ekranın üst yarısında dokunulduysa noktanın altında,
 * alt yarısında dokunulduysa üstünde açılır; küçük üçgen dokunulan yeri gösterir. Dışına dokununca kapanır.
 */
function BubbleMenu({ title, subtitle, options, onClose, anchor }: Props & { anchor: MenuAnchor }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.min(BUBBLE_MAX_W, winW - EDGE * 2);
  const left = Math.max(EDGE, Math.min(winW - width - EDGE, anchor.x - 28));
  const below = anchor.y < winH * 0.55;
  const tailLeft = Math.max(14, Math.min(width - 14 - TAIL * 2, anchor.x - left - TAIL));
  const maxH = below ? winH - anchor.y - TAIL - 24 : anchor.y - TAIL - 40;
  const tail = <View style={[styles.tail, below ? styles.tailUp : styles.tailDown, { marginLeft: tailLeft }]} />;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        style={styles.bubbleBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      />
      <View
        style={[styles.bubbleWrap, { left, width }, below ? { top: anchor.y + 6 } : { bottom: winH - anchor.y + 6 }]}
        accessibilityViewIsModal
      >
        {below ? tail : null}
        <View style={[styles.bubble, { maxHeight: Math.max(160, maxH) }]}>
          {title || subtitle ? (
            <View style={styles.bubbleHead}>
              {title ? (
                <Text style={styles.bubbleTitle} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.bubbleSub} numberOfLines={4}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {options.map((o, i) => (
              <Pressable
                key={o.label}
                accessibilityRole="button"
                onPress={o.onPress}
                style={({ pressed }) => [
                  styles.bubbleRow,
                  i === options.length - 1 && styles.bubbleRowLast,
                  pressed && styles.bubbleRowPressed,
                ]}
              >
                {o.icon ? (
                  <Ionicons name={o.icon} size={18} color={o.destructive ? colors.danger : colors.primary} />
                ) : null}
                <Text style={[styles.bubbleLabel, o.destructive && styles.labelDanger]}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {below ? null : tail}
      </View>
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  bubbleBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.45)',
  },
  bubbleWrap: { position: 'absolute' },
  bubble: {
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.primary,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: TAIL,
    borderRightWidth: TAIL,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailUp: { borderBottomWidth: TAIL, borderBottomColor: colors.primary },
  tailDown: { borderTopWidth: TAIL, borderTopColor: colors.primary },
  bubbleHead: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bubbleTitle: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  bubbleSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bubbleRowLast: { borderBottomWidth: 0 },
  bubbleRowPressed: { backgroundColor: 'rgba(34, 211, 197, 0.14)' },
  bubbleLabel: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  list: { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  label: { flex: 1, color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  labelDanger: { color: colors.danger },
  cancel: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
});
