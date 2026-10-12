import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Pencere kapatma simgesi: bütün uygulamada aynı kırmızı yuvarlak düğme (içinde beyaz çarpı).
 * Dokunma işini çevresindeki Pressable yapar; bu yalnızca görünümdür.
 */
export function CloseX({ size = 24 }: { size?: number }) {
  const d = Math.round(size * 1.55);
  return (
    <View style={[styles.circle, { width: d, height: d, borderRadius: d / 2 }]}>
      <Ionicons name="close" size={Math.round(size * 0.95)} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
});
