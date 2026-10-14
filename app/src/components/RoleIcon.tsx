import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/AppText';
import { sharkRoleImages } from '@/lib/images';
import { SK_ROLES, type SkRole } from '@/lib/shark';

/**
 * Rol ikonu (çıkartma görseli). Görseli olmayan rolde (ileride eklenecek roller) rolün emojisi görünür.
 * Görseller uygulamanın içindedir (sunucuya yük yok), kare ve şeffaf zeminlidir.
 */
export function RoleIcon({ role, size = 24, style }: { role: SkRole; size?: number; style?: StyleProp<ViewStyle> }) {
  const src = sharkRoleImages[role];
  if (!src) {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontSize: Math.round(size * 0.8), lineHeight: size }}>{SK_ROLES[role]?.emoji ?? '?'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={[{ width: size, height: size }, style as never]}
      contentFit="contain"
      accessibilityLabel={SK_ROLES[role]?.name}
    />
  );
}
