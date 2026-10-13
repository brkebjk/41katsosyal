import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Ekranın altında yüzen düğmeler (Katıl / Oluştur): yerlerinde dururlar ama gizlidir. Altta, tam ortadaki “+”
 * düğmesine basınca canlanarak görünürler ve “+” “−”ye döner; “−”ye basınca aynı canlanmayla kaybolurlar.
 */
export function FloatingActions({ children, testID }: { children: ReactNode; testID?: string }) {
  const [open, setOpen] = useState(false);
  const [anim] = useState(() => new Animated.Value(0));

  function toggle() {
    const next = !open;
    setOpen(next);
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: next ? 260 : 200,
      easing: next ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID={testID}>
      <Animated.View
        pointerEvents={open ? 'box-none' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
        }}
      >
        {children}
      </Animated.View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Düğmeleri gizle' : 'Katıl ve oluştur düğmelerini göster'}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        testID={testID ? `${testID}-toggle` : undefined}
        style={({ pressed }) => [styles.fab, open && styles.fabOpen, pressed && styles.pressed]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name={open ? 'remove' : 'add'} size={30} color={open ? colors.text : colors.primaryText} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: 6, paddingBottom: 8 },
  fab: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  fabOpen: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { opacity: 0.85 },
});
