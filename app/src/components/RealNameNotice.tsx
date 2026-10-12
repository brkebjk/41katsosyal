import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  /** Uyarının asıl cümlesi: gerçek adın nerede, kime görüneceği */
  text: string;
  /** Kısa başlık; verilmezse “Gerçek adın görünür” yazılır */
  title?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Gerçek adın göründüğü her yerde kullanılan kırmızı, çerçeveli uyarı kutusu.
 * Rumuz yerine gerçek ad çıkacağı için kullanıcının bunu işlemden ÖNCE açıkça görmesi gerekir.
 */
export function RealNameNotice({ text, title = 'Gerçek adın görünür', style, testID = 'real-name-notice' }: Props) {
  return (
    <View style={[styles.box, style]} testID={testID} accessibilityRole="alert">
      <Ionicons name="eye" size={20} color={colors.alert} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.1)',
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 2 },
  title: { color: colors.alert, fontFamily: fonts.black, fontSize: 14 },
  text: { color: colors.alert, fontFamily: fonts.semi, fontSize: 13, lineHeight: 19 },
});
