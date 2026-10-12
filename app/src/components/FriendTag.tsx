import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, radii } from '@/theme';

/** Adı gerçek olarak gösterilen kişinin yanında çıkan küçük "Arkadaş" etiketi. */
export function FriendTag() {
  return (
    <View style={styles.tag} accessibilityLabel="Arkadaşın">
      <Ionicons name="people" size={11} color="#B7A8FF" />
      <Text style={styles.text}>Arkadaş</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124, 92, 255, 0.2)',
  },
  text: { color: '#B7A8FF', fontFamily: fonts.semi, fontSize: 11 },
});
