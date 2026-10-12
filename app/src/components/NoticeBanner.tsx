import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NoticeDot } from '@/components/NoticeDot';
import { colors, fonts, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  title: string;
  text?: string;
  /** Kırmızı noktanın içindeki sayı */
  count?: number;
  /** Sağdaki eylem yazısı (ör. “Gör ve yanıtla”) */
  action: string;
  onPress: () => void;
  testID?: string;
};

/** Ekranın üstünde duran kırmızı çerçeveli “seni bekleyen bir iş var” kutusu. Dokununca ilgili ekrana gider. */
export function NoticeBanner({ icon, title, text, count, action, onPress, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${action}`}
      testID={testID}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={24} color={colors.alert} />
        <NoticeDot count={count} size={13} ringColor={colors.surface} style={styles.dot} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {text ? <Text style={styles.text}>{text}</Text> : null}
        <Text style={styles.action}>{action} ›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.1)',
  },
  pressed: { opacity: 0.8 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: -4, right: -6 },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 15 },
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  action: { color: colors.alert, fontFamily: fonts.extra, fontSize: 13, paddingTop: 2 },
});
