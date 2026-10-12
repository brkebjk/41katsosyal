import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { HelpLabel } from '@/components/HelpLabel';
import { requestReveal } from '@/lib/keyboard';
import { colors, fontSizes, radii, spacing } from '@/theme';

type Props = TextInputProps & {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Şifre alanı: göz simgesiyle göster/gizle düğmesi eklenir */
  password?: boolean;
  /** Başlığın yanındaki “?” ile baloncukta açılan açıklama */
  help?: string;
  /** Daha alçak kutu (uzun formlarda daha az kaydırma) */
  compact?: boolean;
  /** Zorunlu alan boş bırakıldı: kırmızı çerçeve */
  invalid?: boolean;
};

/** Etiketli, simgeli metin kutusu. */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, icon, password = false, help, compact = false, invalid = false, style, ...rest },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {help ? <HelpLabel label={label} help={help} /> : <Text style={styles.label}>{label}</Text>}
      <View
        style={[styles.box, compact && styles.boxCompact, focused && styles.boxFocused, invalid && styles.boxInvalid]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          style={[styles.input, compact && styles.inputCompact, style]}
          secureTextEntry={password && hidden}
          onFocus={(e) => {
            setFocused(true);
            requestReveal(); // klavye açık kalıp başka kutuya geçilince de kutu klavyenin üstünde kalsın
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Şifreyi göster' : 'Şifreyi gizle'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  boxFocused: { borderColor: colors.primary },
  boxCompact: { minHeight: 40, paddingHorizontal: spacing.sm + 2 },
  boxInvalid: { borderColor: colors.danger, borderWidth: 2 },
  input: { flex: 1, color: colors.text, fontSize: fontSizes.md, paddingVertical: spacing.sm },
  inputCompact: { fontSize: fontSizes.sm, paddingVertical: 6 },
});
