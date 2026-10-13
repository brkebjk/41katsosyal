import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { InfoItem } from '@/lib/gameInfo';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  /** Kısa satırlar: kalın bir başlık + açıklama */
  items?: InfoItem[];
  /** Satırların altında, soluk yazılan küçük not */
  note?: string;
  /** Satırlardan ÖNCE gösterilen özel içerik (ör. puan tablosu) */
  top?: ReactNode;
  /** Satırlara ek özel içerik (satırlardan sonra) */
  children?: ReactNode;
  closeLabel?: string;
};

/**
 * Kısa bilgi penceresi: ekranı kalabalıklaştırmadan, yalnızca dokununca açılır. Ekranın %80’inden uzun olursa
 * kendi içinde kayar; kısaysa kaydırma yoktur. “Anladım”la ya da dışına dokunarak kapanır.
 */
export function InfoModal({
  visible,
  onClose,
  title,
  icon,
  items,
  note,
  top,
  children,
  closeLabel = 'Anladım',
}: Props) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        <View
          style={[styles.card, { maxHeight: Math.round(height * 0.8) }]}
          testID="info-modal"
          accessibilityViewIsModal
        >
          <View style={styles.head}>
            {icon ? (
              <View style={styles.badge}>
                <Ionicons name={icon} size={20} color={colors.primary} />
              </View>
            ) : null}
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
            {top}
            {items?.map((it, i) => (
              <View key={i} style={styles.item}>
                {it.icon ? (
                  <Ionicons name={it.icon} size={16} color={colors.primary} style={styles.itemIcon} />
                ) : null}
                <Text style={styles.itemText}>
                  {it.lead ? <Text style={styles.lead}>{it.lead} </Text> : null}
                  {it.text}
                </Text>
              </View>
            ))}
            {children}
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </ScrollView>
          <PrimaryButton label={closeLabel} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** Ekranda küçük bir “ⓘ” bağlantısı; dokununca ilgili bilgi penceresi açılır. */
export function InfoLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg + 4,
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 211, 197, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  scroll: { flexGrow: 0 },
  body: { gap: spacing.md },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  itemIcon: { marginTop: 2 },
  itemText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  lead: { color: colors.highlight, fontFamily: fonts.extra },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  linkPressed: { opacity: 0.6 },
  linkText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
});
