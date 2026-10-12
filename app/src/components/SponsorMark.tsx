import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/** Sponsor (mekân) hesaplarının adının yanındaki küçük mağaza simgesi. */
export function SponsorMark({ size = 16 }: { size?: number }) {
  return (
    <View
      style={[styles.badge, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]}
      accessibilityLabel="Mekân hesabı"
    >
      <Ionicons name="storefront" size={size - 3} color={colors.venue} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 159, 107, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 107, 0.55)',
  },
});
