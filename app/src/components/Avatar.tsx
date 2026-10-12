import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AVATAR_COUNT, avatarImages } from '@/lib/images';
import { colors } from '@/theme';

type Props = {
  /** Veritabanındaki avatar_index (1–12) */
  index: number;
  size?: number;
  ring?: boolean;
  /** Mekân hesabının profil resmi (adres). Verilirse hayvan avatarı yerine bu resim görünür. */
  uri?: string | null;
};

/** Yuvarlak avatar. Akışta ve sıralamada da aynı bileşen kullanılacak. */
export function Avatar({ index, size = 64, ring = false, uri }: Props) {
  const safe = Math.min(Math.max(Math.round(index) || 1, 1), AVATAR_COUNT);
  const source = uri ? { uri } : avatarImages[safe - 1];

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, ring && styles.ring]}>
      {source ? <Image source={source} contentFit="cover" style={{ width: size, height: size }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  ring: { borderWidth: 2, borderColor: colors.accent },
});
