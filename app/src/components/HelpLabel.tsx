import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Kutu başlığı + yanında küçük “?” düğmesi. “?”ye dokununca açıklama başlığın altında konuşma baloncuğu gibi açılır;
 * tekrar dokununca (ya da baloncuğa dokununca) kapanır. Formlarda açıklama yazıları yer kaplamasın diye kullanılır.
 */
export function HelpLabel({ label, help, testID }: { label: string; help?: string; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {help ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${label}: açıklama`}
            accessibilityState={{ expanded: open }}
            testID={testID}
            style={[styles.q, open && styles.qOpen]}
          >
            <Text style={[styles.qText, open && styles.qTextOpen]}>?</Text>
          </Pressable>
        ) : null}
      </View>
      {help && open ? (
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Açıklamayı kapat">
          <View style={styles.tail} />
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{help}</Text>
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  q: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qOpen: { backgroundColor: colors.primary },
  qText: { color: colors.primary, fontFamily: fonts.black, fontSize: 11, lineHeight: 13 },
  qTextOpen: { color: colors.primaryText },
  tail: {
    marginLeft: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surfaceAlt,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bubbleText: { flex: 1, color: colors.text, fontSize: fontSizes.xs, lineHeight: 18 },
});
