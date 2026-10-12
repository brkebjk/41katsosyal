import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NoticeDot } from '@/components/NoticeDot';
import { colors, fontSizes, radii, spacing } from '@/theme';

type Props<T extends string> = {
  /** `badge` doluysa seçeneğin köşesinde kırmızı sayı noktası çıkar */
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (value: T) => void;
};

/** Yan yana seçim düğmeleri (sekme gibi). Seçili olan sarı görünür. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, active && styles.itemActive]}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.badge && o.badge > 0 ? (
              <NoticeDot count={o.badge} ringColor={colors.surface} style={styles.badge} testID="segment-badge" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  itemActive: { backgroundColor: colors.primary },
  badge: { position: 'absolute', top: -6, right: -2 },
  text: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700' },
  textActive: { color: colors.primaryText },
});
