import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ImageSourcePropType } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { fonts, radii, spacing } from '@/theme';

type Props = {
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Degrade renkleri (soldan sağa, üstten alta) */
  colors: [string, string];
  /** Altta duran koyu “kalınlık” rengi; düğmeye hafif kabartma verir */
  edge: string;
  /** Canva tasarımı vb. hazır görsel (varsa degradenin yerine arka plan olur) */
  art?: ImageSourcePropType | null;
  onPress: () => void;
  disabled?: boolean;
  /** Basık, yatay düğme (ekranın altında sabit duran düğmeler için) */
  compact?: boolean;
  testID?: string;
};

/** Oyunlar ekranının üstündeki büyük, renkli düğmeler (“Katıl” ve “Oda Oluştur”). İkisi yan yana durur. */
export function GameActionButton({
  label,
  sub,
  icon,
  colors: grad,
  edge,
  art,
  onPress,
  disabled,
  compact = false,
  testID,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
      testID={testID}
      style={({ pressed }) => [
        styles.outer,
        compact ? styles.outerCompact : { backgroundColor: edge },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.face, compact && styles.faceCompact]}>
        {art ? (
          <Image source={art} contentFit="cover" style={styles.fill} />
        ) : (
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
        )}
        {/* Köşede büyük, silik simge: düğmeleri birbirinden hemen ayırt ettirir */}
        {compact ? null : (
          <Ionicons name={icon} size={86} color="rgba(255,255,255,0.18)" style={styles.bigIcon} />
        )}
        <View style={[styles.iconBubble, compact && styles.iconBubbleCompact]}>
          <Ionicons name={icon} size={compact ? 20 : 24} color="#FFFFFF" />
        </View>
        <View style={[styles.texts, compact && styles.textsCompact]}>
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
            {label}
          </Text>
          <Text style={styles.sub} numberOfLines={compact ? 1 : 2} adjustsFontSizeToFit={compact}>
            {sub}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, borderRadius: radii.lg + 2, paddingBottom: 4 },
  face: {
    minHeight: 118,
    borderRadius: radii.lg + 2,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
  },
  // Yüzen düğme: içeriğin üstünde durduğu için hafif gölge
  outerCompact: {
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  faceCompact: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconBubbleCompact: { width: 34, height: 34, borderRadius: 17 },
  textsCompact: { flex: 1 },
  pressed: { transform: [{ translateY: 2 }] },
  disabled: { opacity: 0.6 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bigIcon: { position: 'absolute', right: -14, bottom: -18 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { gap: 1 },
  label: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 16 },
  sub: { color: 'rgba(255,255,255,0.92)', fontFamily: fonts.semi, fontSize: 11, lineHeight: 14 },
});
