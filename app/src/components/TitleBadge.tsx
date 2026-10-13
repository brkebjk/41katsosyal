import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { radii } from '@/theme';

type Props = {
  /** “Tabu Şampiyonu” ya da “Tabu Şampiyonu +1”. Boşsa hiçbir şey çizilmez. */
  label: string | null | undefined;
  /** Ortalanmış yerlerde (kürsü) true */
  center?: boolean;
};

/**
 * Oyun şampiyonu ünvanı rozeti. Yalnızca gerçek adın göründüğü yerlerde (sıralama, etkinlik, arkadaş listesi,
 * açık odalar, profil) kullanılır; akışta (rumuzlu gönderi ve yorumlarda) ASLA kullanılmaz.
 */
export function TitleBadge({ label, center = false }: Props) {
  if (!label) return null;
  return (
    <View
      style={[styles.badge, center && styles.center]}
      accessibilityLabel={`Ünvan: ${label}`}
      testID="title-badge"
    >
      <Ionicons name="ribbon" size={11} color={GOLD} />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const GOLD = '#FFC93C';

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 201, 60, 0.16)',
    maxWidth: '100%',
  },
  center: { alignSelf: 'center' },
  text: { color: GOLD, fontSize: 11, fontWeight: '800', flexShrink: 1 },
});
