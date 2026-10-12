import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';

import { vampireImages, VAMPIRE_CARD_ASPECT } from '@/lib/images';
import { ROLES, type VvRole } from '@/lib/vampire';
import { colors, radii } from '@/theme';

type Props = {
  /** Kartın ön yüzünde gösterilecek rol */
  role: VvRole;
  /** true: rol görünür, false: kartın arkası (kule) görünür */
  faceUp: boolean;
  width: number;
  /** Verilirse karta dokunulabilir (ör. rolünü görmek için çevirmek) */
  onPress?: () => void;
};

const NATIVE = Platform.OS !== 'web';

/** Rol kartı. Yüz değiştirirken yatayda daralıp genişleyerek "çevrilir". */
export function RoleCard({ role, faceUp, width, onPress }: Props) {
  const [shown, setShown] = useState(faceUp);
  const [scale] = useState(() => new Animated.Value(1));
  const last = useRef(faceUp);

  useEffect(() => {
    if (last.current === faceUp) return;
    last.current = faceUp;
    Animated.timing(scale, { toValue: 0.02, duration: 150, useNativeDriver: NATIVE }).start(() => {
      setShown(faceUp);
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: NATIVE }).start();
    });
  }, [faceUp, scale]);

  const info = ROLES[role];
  const height = Math.round(width / VAMPIRE_CARD_ASPECT);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={faceUp ? `Rol kartı: ${info.name}` : 'Kapalı rol kartı. Görmek için dokun.'}
    >
      <Animated.View style={[styles.card, { width, height, transform: [{ scaleX: scale }] }]}>
        {shown ? (
          // Kartın üstünde yazı yok (Paket 28): rol, kartın kendi görselinden anlaşılır
          <Image source={vampireImages[info.image]} contentFit="cover" style={styles.fill} />
        ) : (
          <Image source={vampireImages.card_back} contentFit="cover" style={styles.fill} />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
});
