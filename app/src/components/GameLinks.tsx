import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Bir oyunun ekranında: o oyunun sıralamasına ve başarımlara giden iki küçük düğme. */
export function GameLinks({ game, onNavigate }: { game: string; onNavigate?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          onNavigate?.();
          router.push({ pathname: '/siralama', params: { game } });
        }}
        accessibilityRole="button"
        testID="game-link-rank"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Ionicons name="trophy" size={16} color={colors.primary} />
        <Text style={styles.text}>Sıralama</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          onNavigate?.();
          router.push('/basarimlar');
        }}
        accessibilityRole="button"
        testID="game-link-achievements"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Ionicons name="ribbon" size={16} color={colors.accent} />
        <Text style={styles.text}>Başarımlar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
});
