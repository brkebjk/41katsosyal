import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = {
  /** Verilirse noktanın içinde sayı yazar (0 ya da boşsa sayısız küçük nokta çizilir) */
  count?: number;
  /** Sayısız nokta çapı */
  size?: number;
  /** Noktanın etrafındaki ince halka rengi (zemin rengi); nokta ikonların üstüne binince okunaklı kalır */
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Net kırmızı bildirim noktası. Sekmelerde, kartların köşesinde ve satırların yanında “burada yapılacak bir şey var” der. */
export function NoticeDot({ count, size = 11, ringColor = colors.bg, style, testID = 'notice-dot' }: Props) {
  const label = count && count > 0 ? (count > 9 ? '9+' : String(count)) : null;
  if (label) {
    return (
      <View
        style={[styles.pill, { borderColor: ringColor }, style]}
        testID={testID}
        accessibilityLabel={`${count} yeni`}
      >
        <Text style={styles.pillText}>{label}</Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, borderColor: ringColor },
        style,
      ]}
      testID={testID}
      accessibilityLabel="Yeni"
    />
  );
}

const styles = StyleSheet.create({
  dot: { backgroundColor: colors.alert, borderWidth: 2 },
  pill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: colors.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11, lineHeight: 14 },
});
