import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  title: string;
  /** true ise "PeopleHere Özel" biçimi: sarı çerçeve ve yıldız simgesi */
  official?: boolean;
  /** Gruptaki öğe sayısı */
  count?: number;
  /** Başlığın altındaki kısa açıklama */
  hint?: string;
};

/** Listelerde grup başlığı. Moderatörün başlattıkları "PeopleHere Özel" olarak ayrı ve üstte gösterilir. */
export function SectionHeader({ title, official = false, count, hint }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.row}>
        {official ? (
          <View style={styles.badge}>
            <Ionicons name="star" size={14} color={colors.primaryText} />
            <Text style={styles.badgeText}>{title}</Text>
          </View>
        ) : (
          <Text style={styles.title}>{title}</Text>
        )}
        {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  badgeText: { color: colors.primaryText, fontFamily: fonts.black, fontSize: fontSizes.sm },
  title: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.md },
  count: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
