import { StyleSheet, Text, View } from 'react-native';

import { ImageSlot } from '@/components/ImageSlot';
import { imageAspect } from '@/lib/images';
import { brand, colors, fonts, fontSizes, spacing } from '@/theme';

const LOGO_HEIGHT = 64;

/** Akış sekmesinin başlığı: solda logo, yanında slogan. */
export function BrandHeader() {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={`${brand.name}. ${brand.slogan}`}>
      <ImageSlot name="logo" style={{ height: LOGO_HEIGHT, aspectRatio: imageAspect.logo }} />
      <View style={styles.textCol}>
        <Text style={styles.slogan}>{brand.slogan}</Text>
        <View style={styles.bar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xs },
  textCol: { flex: 1, gap: spacing.sm },
  slogan: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.lg,
    lineHeight: 26,
  },
  // Kule penceresi sarısından küçük bir çizgi
  bar: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.primary },
});
