import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { ImageSlot } from '@/components/ImageSlot';
import { getWebsiteUrl } from '@/lib/account';
import { notify } from '@/lib/dialog';
import { imageAspect } from '@/lib/images';
import { appVersion } from '@/lib/problemReport';
import { brand, colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Profilin en altı: Web sitesi ve Sürüm bilgisi (dokununca logo ve sürüm numarası açılır). */
export function AppInfoButtons() {
  const [versionOpen, setVersionOpen] = useState(false);

  async function onWebsite() {
    const url = await getWebsiteUrl();
    if (url) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // aşağıdaki açıklama gösterilir
      }
    }
    await notify('Web sitemiz yakında', 'Web sitemiz hazır olunca bu düğme seni oraya götürecek.', { icon: 'globe' });
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void onWebsite()}
        accessibilityRole="button"
        testID="profile-website"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Ionicons name="globe-outline" size={18} color={colors.primary} />
        <Text style={styles.text}>Web sitesi</Text>
      </Pressable>
      <Pressable
        onPress={() => setVersionOpen(true)}
        accessibilityRole="button"
        testID="profile-version"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.text}>Sürüm bilgisi</Text>
      </Pressable>

      <Modal visible={versionOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVersionOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setVersionOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <View style={styles.card} testID="version-card">
            <ImageSlot name="logo" style={{ height: 150, aspectRatio: imageAspect.logo }} />
            <Text style={styles.name}>{brand.name}</Text>
            <Text style={styles.version}>{`Sürüm ${appVersion()} · ${Platform.OS === 'ios' ? 'iOS' : 'Android'}`}</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(5, 7, 14, 0.8)',
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg, marginTop: spacing.sm },
  version: { color: colors.textMuted, fontSize: 12 },
});
