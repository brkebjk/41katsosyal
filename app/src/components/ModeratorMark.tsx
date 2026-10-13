import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

/** Moderatör hesabı her yerde "Moderatör" adıyla görünür (üyeler bu adı alamaz; sunucu engeller). */
export function isModeratorName(name: string | null | undefined): boolean {
  return name === 'Moderatör' || (typeof name === 'string' && name.startsWith('Moderatör#'));
}

/** Moderatör adının yanındaki kırmızı simge */
export function ModeratorMark({ size = 15 }: { size?: number }) {
  return (
    <View accessibilityLabel="Moderatör" testID="moderator-mark">
      <Ionicons name="shield" size={size} color="#E02424" />
    </View>
  );
}
