import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryIcon';
import type { CategoryInfo } from '@/lib/eventCategories';
import { eventCategoryImages } from '@/lib/images';
import { colors, fonts, fontSizes } from '@/theme';

type Props = {
  info: CategoryInfo;
  /** Kategorideki yaklaşan etkinlik sayısı */
  count: number;
  width: number;
  height: number;
  /** Hafif eğim (derece) ve yatay kayma (piksel): oyun kutularındaki "yamuk yumuk" görünüm */
  tilt?: { deg: number; dx: number };
  selected?: boolean;
  onPress: () => void;
};

/** Etkinlik kategorisi için dikdörtgen kutu. Görsel gelene kadar renkli arka plan ve simge görünür. */
export function CategoryTile({
  info,
  count,
  width,
  height,
  tilt = { deg: 0, dx: 0 },
  selected = false,
  onPress,
}: Props) {
  const image = eventCategoryImages[info.key];
  const countText = count === 0 ? 'Yaklaşan etkinlik yok' : `${count} etkinlik`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}. ${countText}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          height,
          transform: [{ translateX: tilt.dx }, { rotate: `${tilt.deg}deg` }, { scale: pressed ? 0.98 : 1 }],
        },
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {image ? (
        <Image source={image} contentFit="cover" style={styles.fill} />
      ) : (
        <>
          <LinearGradient
            colors={info.fallback}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.fill}
          />
          <CategoryIcon
            info={info}
            size={Math.round(height * (info.withMotorbike ? 0.5 : 0.62))}
            color="rgba(255,255,255,0.16)"
            style={styles.fallbackIcon}
          />
        </>
      )}
      <LinearGradient
        colors={['rgba(8,10,20,0)', 'rgba(8,10,20,0.85)']}
        locations={[0.25, 1]}
        style={[styles.fill, styles.noTouch]}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {info.title}
        </Text>
        <Text style={[styles.count, count === 0 && styles.countZero]} numberOfLines={1}>
          {countText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
  },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  pressed: { opacity: 0.85 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  fallbackIcon: { position: 'absolute', top: '12%', right: 10 },
  text: { paddingHorizontal: 12, paddingVertical: 9, gap: 1 },
  title: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  count: { color: 'rgba(230, 234, 245, 0.85)', fontSize: 11 },
  countZero: { color: 'rgba(230, 234, 245, 0.55)' },
});
