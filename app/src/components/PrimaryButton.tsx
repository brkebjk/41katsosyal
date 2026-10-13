import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/AppText';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  testID?: string;
};

/** Uygulamanın ortak düğmesi: sarı ana düğme, çerçeveli ikincil düğme, kırmızı tehlike düğmesi. */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  testID,
}: Props) {
  const inactive = disabled || loading;
  const textColor =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.danger : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.primary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  label: { fontFamily: fonts.semi, fontSize: fontSizes.md },
});
