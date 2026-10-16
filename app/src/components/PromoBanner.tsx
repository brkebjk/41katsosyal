import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { dismissBanner, useLook, type PromoBanner as Banner } from '@/lib/look';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

function colorOf(c: Banner['color']): string {
  return colors[c];
}

function open(link: string | null) {
  if (!link) return;
  if (link.startsWith('/')) {
    try {
      router.push(link as never);
    } catch {
      // adres uygulamada yoksa geçilir
    }
  } else if (link.startsWith('https://')) {
    void Linking.openURL(link).catch(() => {});
  }
}

/**
 * Kampanya / duyuru şeridi (yönetim panelinden): ekranın üstünde ince, renkli şerit. Dokununca bağlantısı açılır;
 * çarpı ile bu telefonda kapatılır. Aynı anda en yeni şerit gösterilir.
 */
export function PromoBanner({ style }: { style?: object }) {
  const look = useLook();
  const b = look.banners.find((x) => !look.dismissed.includes(x.id));
  if (!b) return null;
  const tint = colorOf(b.color);
  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <Pressable
        onPress={() => open(b.link)}
        disabled={!b.link}
        accessibilityRole={b.link ? 'link' : 'text'}
        style={({ pressed }) => [styles.bar, { borderColor: tint }, pressed && styles.pressed]}
        testID="promo-banner"
      >
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text style={styles.text} numberOfLines={2}>
          {b.text}
        </Text>
        {b.link ? <Ionicons name="chevron-forward" size={14} color={tint} /> : null}
        <Pressable
          onPress={() => dismissBanner(b.id)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Şeridi kapat"
          testID="promo-banner-close"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    backgroundColor: colors.overlay,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.xs, lineHeight: 16 },
  pressed: { opacity: 0.8 },
});
