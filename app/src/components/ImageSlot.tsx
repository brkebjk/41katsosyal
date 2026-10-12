import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { imageSpecs, images, type ImageKey } from '@/lib/images';
import { colors, fontSizes, radii, spacing } from '@/theme';

type Props = {
  name: ImageKey;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
};

/**
 * Kayıt defterindeki bir görseli gösterir.
 * Görsel henüz eklenmediyse geliştirme sırasında gri bir yer tutucu kutu çıkar,
 * yayınlanan uygulamada ise hiçbir şey çizilmez.
 */
export function ImageSlot({ name, style, contentFit = 'contain' }: Props) {
  const source = images[name];
  const spec = imageSpecs[name];

  if (source) {
    return <Image source={source} contentFit={contentFit} style={style as object} />;
  }

  if (!__DEV__) return null;

  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons name="image-outline" size={28} color={colors.textMuted} />
      <Text style={styles.label}>{spec.label}</Text>
      <Text style={styles.size}>
        {spec.size}
        {spec.transparent ? ' · şeffaf PNG' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  label: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
  size: { color: colors.textMuted, fontSize: fontSizes.xs },
});
