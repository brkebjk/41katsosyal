import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/AppText';
import { sharkRoleImages, vampireImages } from '@/lib/images';
import { roleInfo } from '@/lib/roles';
import { ROLES as VV_ROLES, type VvRole } from '@/lib/vampire';

/**
 * Rol ikonu (çıkartma görseli). Görseli olmayan rolde (ileride eklenecek roller) rolün emojisi görünür.
 * Görseller uygulamanın içindedir (sunucuya yük yok), kare ve şeffaf zeminlidir.
 * framed: oyun içinde küçük yuvarlak çerçeve (koyu zemin, rol renginde kenar); ikon çerçevenin içine sığar.
 */
export function RoleIcon({
  role,
  size = 24,
  style,
  framed,
}: {
  /** Köpekbalığı ya da Vampir–Köylü rolü */
  role: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  framed?: boolean;
}) {
  if (framed) {
    const border = size >= 30 ? 2 : 1.5;
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: border,
            borderColor: roleInfo(role)?.color ?? '#FFFFFF',
            backgroundColor: 'rgba(11, 19, 43, 0.88)',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <RoleIcon role={role} size={Math.round((size - border * 2) * 0.8)} />
      </View>
    );
  }
  // Vampir–Köylü rolü: kart görseli yuvarlak kırpılır (özel ikonlar gelene kadar)
  if (role in VV_ROLES) {
    return (
      <Image
        source={vampireImages[VV_ROLES[role as VvRole].image]}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style as never]}
        contentFit="cover"
        accessibilityLabel={roleInfo(role)?.name}
      />
    );
  }
  const src = sharkRoleImages[role];
  if (!src) {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontSize: Math.round(size * 0.8), lineHeight: size }}>{roleInfo(role)?.emoji ?? '?'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={[{ width: size, height: size }, style as never]}
      contentFit="contain"
      accessibilityLabel={roleInfo(role)?.name}
    />
  );
}
