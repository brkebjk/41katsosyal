import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { formatDate } from '@/lib/labels';
import { MODAL_ORIENTATIONS } from '@/lib/orientation';
import { brand, colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  name: string;
  /** Abonelik bitiş tarihi (ISO) */
  subscriptionUntil: string | null;
  /** Kartın altında gösterilecek ayrıcalık (işletme adı ve başlık) */
  perkLine: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Kasada gösterilen üyelik kartı. Saniyesi akan canlı saat vardır; ekran görüntüsü paylaşılarak kullanılamasın
 * diye kasadaki kişi saatin aktığını görür. Kartta yalnızca üyenin gerçek adı ve abonelik bitiş tarihi bulunur.
 */
export function MemberCardModal({ visible, onClose, name, subscriptionUntil, perkLine }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose} supportedOrientations={MODAL_ORIENTATIONS}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {visible ? (
          <Card name={name} subscriptionUntil={subscriptionUntil} perkLine={perkLine} onClose={onClose} />
        ) : null}
      </View>
    </Modal>
  );
}

function Card({ name, subscriptionUntil, perkLine, onClose }: Omit<Props, 'visible'>) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  return (
    <View style={styles.wrap} testID="member-card">
      <LinearGradient
        colors={['#4B33B5', '#8A5A12']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.top}>
          <Text style={styles.brand}>{brand.name}</Text>
          <View style={styles.badge}>
            <Ionicons name="star" size={14} color={colors.primary} />
            <Text style={styles.badgeText}>Abone</Text>
          </View>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.until}>
          {subscriptionUntil ? `${formatDate(subscriptionUntil)} tarihine kadar geçerli` : 'Abonelik'}
        </Text>
        {perkLine ? <Text style={styles.perk}>{perkLine}</Text> : null}
        <View style={styles.clockBox}>
          <Text style={styles.clock} testID="member-card-clock">
            {clock}
          </Text>
          <Text style={styles.clockLabel}>Canlı saat: ekran görüntüsü geçerli sayılmaz</Text>
        </View>
      </LinearGradient>
      <PrimaryButton label="Kapat" variant="ghost" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.85)',
  },
  wrap: { gap: spacing.md },
  card: { borderRadius: radii.lg, padding: spacing.xl, gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brand: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.md, flexShrink: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11, 15, 26, 0.45)',
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  badgeText: { color: colors.primary, fontFamily: fonts.extra, fontSize: 12 },
  name: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.xl, lineHeight: 34 },
  until: { color: 'rgba(255,255,255,0.85)', fontSize: fontSizes.sm },
  perk: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: fontSizes.sm, lineHeight: 20 },
  clockBox: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(11, 15, 26, 0.5)',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  clock: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 34, letterSpacing: 2 },
  clockLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
});
