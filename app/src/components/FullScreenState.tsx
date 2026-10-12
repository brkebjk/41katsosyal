import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, fontSizes, spacing } from '@/theme';

type Props = {
  /** true ise dönen yükleniyor göstergesi çıkar */
  busy?: boolean;
  message?: string;
  actions?: { label: string; onPress: () => void; variant?: 'primary' | 'ghost' }[];
};

/** Tüm ekranı kaplayan "yükleniyor" ya da "bir sorun var" katmanı. */
export function FullScreenState({ busy = false, message, actions = [] }: Props) {
  return (
    <View style={styles.root}>
      {busy ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actions.map((a) => (
        <View key={a.label} style={styles.action}>
          <PrimaryButton label={a.label} onPress={a.onPress} variant={a.variant} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  message: { color: colors.text, fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22 },
  action: { alignSelf: 'stretch' },
});
