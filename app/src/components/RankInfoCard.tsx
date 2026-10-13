import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { formatDayIstanbul } from '@/lib/labels';
import type { RankingInfo } from '@/lib/ranking';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  info: RankingInfo | null;
  /** true: “Bu ay”, false: “Geçen ay” */
  thisMonth: boolean;
  /** “Sıralama ve ünvanlar nasıl çalışır?” penceresini açar */
  onMore: () => void;
};

/**
 * Sıralamanın ne zaman güncellendiğini söyleyen küçük kart. Puanlar hesaba anında yazılır; yalnızca “Bu ay” tablosu
 * haftada bir (pazartesi 00:00) yenilenir. Kullanıcı tablonun neden hemen değişmediğini burada görür.
 */
export function RankInfoCard({ info, thisMonth, onMore }: Props) {
  let title: string;
  let text: string;
  if (!thisMonth) {
    title = 'Kesinleşmiş sonuçlar';
    text = 'Geçen ay bitti; bu tablo artık değişmez.';
  } else if (info?.weekly) {
    title = 'Tablo haftada bir güncellenir';
    text = `Son güncelleme: ${formatDayIstanbul(info.asOf)}.${
      info.nextAt ? ` Sonraki: ${formatDayIstanbul(info.nextAt)}.` : ''
    } Puanların hemen hesabına yazılır; tabloya sonraki güncellemede girer.`;
  } else {
    title = 'Tablo anında güncellenir';
    text = 'Puanların hesabına yazıldığı gibi sıralamaya da yansır.';
  }
  const resets =
    thisMonth && info ? ` Her ayın 1’inde sıfırlanır (sonraki: ${formatDayIstanbul(info.monthEnd)}).` : '';

  return (
    <View style={styles.card} testID="rank-info-card">
      <Ionicons name="refresh-circle" size={22} color={colors.primary} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>
          {text}
          {resets}
        </Text>
        <Pressable
          onPress={onMore}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Sıralama ve ünvanlar nasıl çalışır?"
          testID="rank-info-more"
        >
          <Text style={styles.link}>Sıralama ve ünvanlar nasıl çalışır?</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 3 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  text: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.primary, fontFamily: fonts.semi, fontSize: 12, paddingTop: 2 },
});
