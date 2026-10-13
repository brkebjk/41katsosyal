import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { useAuth } from '@/lib/auth';
import { openIdentityVerify } from '@/lib/identity';
import { useIdentityEnabled } from '@/lib/identityFlag';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Sıralama ve ödül ekranlarındaki not: hesabını doğrulamayan üye sıralamada yer alır ama ödül alamaz.
 * Bakan üye doğrulanmamışsa “Hesabını doğrula” bağlantısı da görünür. `onDark`: koyu zeminli kartın içinde.
 */
export function VerifyPrizeNote({ onDark = false }: { onDark?: boolean }) {
  const { profile } = useAuth();
  // Kimlik doğrulama kapalıyken (yeni yöntem bağlanana kadar) ödül için doğrulama aranmaz: not gösterilmez
  const identityOn = useIdentityEnabled();
  const canVerify = Boolean(profile && !profile.identity_verified_at && profile.role === 'user');
  const text = onDark ? '#E8EEF5' : colors.textMuted;
  if (!identityOn) return null;
  return (
    <View style={[styles.box, onDark && styles.boxDark]} testID="verify-prize-note">
      <Ionicons name="shield-checkmark" size={15} color={colors.highlight} />
      <Text style={[styles.text, { color: text }]}>
        Hesabını doğrulamayan üyeler sıralamada yer alır ama ödül alamaz; ödül sıradaki doğrulanmış üyeye geçer.
        {canVerify ? (
          <Text
            style={styles.link}
            onPress={openIdentityVerify}
            accessibilityRole="link"
            suppressHighlighting
            testID="verify-prize-link"
          >
            {' '}
            Hesabını doğrula
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

/** Profilde başarımların üstündeki küçük kutu (hesabını hiç doğrulamamış üye) */
export function VerifyRewardsBox({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Hesabını doğrula, ödülleri kaçırma"
      testID="profile-verify-box"
      style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
    >
      <Ionicons name="shield-checkmark" size={18} color={colors.highlight} />
      <Text style={styles.ctaText}>Hesabını doğrula, ödülleri kaçırma.</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.highlight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  boxDark: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  text: { flex: 1, fontSize: 12, lineHeight: 17 },
  link: { color: colors.highlight, fontFamily: fonts.extra },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.highlight,
    backgroundColor: colors.surface,
  },
  ctaText: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: 13.5 },
  pressed: { opacity: 0.7 },
});
