import Ionicons from '@expo/vector-icons/Ionicons';
import { reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { notify, showDialog } from '@/lib/dialog';
import { colors, fonts, fontSizes, radii, saveThemePref, spacing, themePref, type ThemePref } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const THEMES: { key: ThemePref; label: string; icon: IconName }[] = [
  { key: 'light', label: 'Açık', icon: 'sunny' },
  { key: 'dark', label: 'Koyu', icon: 'moon' },
  { key: 'system', label: 'Sistem', icon: 'phone-portrait' },
];

/**
 * Profil > Tercihler (her zaman açık): tema (Açık / Koyu / Sistem), dil (İngilizce yakında), uygulamayı değerlendir,
 * arkadaşlarını davet et. Tema, renkler ekranlara açılışta yazıldığı için uygulama yeniden açılınca uygulanır.
 */
export function PreferencesPanel({ canInvite }: { canInvite: boolean }) {
  const [theme, setTheme] = useState<ThemePref>(themePref);

  async function onTheme(next: ThemePref) {
    if (next === theme) return;
    if (!saveThemePref(next)) {
      await notify('Kaydedilemedi', 'Tema tercihi bu telefonda kaydedilemedi.', { icon: 'alert-circle' });
      return;
    }
    setTheme(next);
    const choice = await showDialog<'now' | 'later'>({
      title: 'Tema değişti',
      message:
        next === themePref
          ? 'Uygulama zaten bu temayla açık.'
          : 'Yeni tema uygulama yeniden açılınca görünür. Şimdi yeniden başlatmak ister misin?',
      icon: 'color-palette',
      buttons:
        next === themePref
          ? [{ label: 'Tamam', value: 'later', style: 'primary' }]
          : [
              { label: 'Şimdi yeniden başlat', value: 'now', style: 'primary' },
              { label: 'Sonra', value: 'later', style: 'ghost' },
            ],
      cancelValue: 'later',
    });
    if (choice !== 'now') return;
    try {
      // Expo'nun önerdiği yeniden başlatma (Expo Go'da da mağaza sürümünde de çalışır). DevSettings.reload kullanılmaz:
      // Expo Go'nun yeni mimarisinde uygulamayı yarım yüklenmiş bırakıp "ExpoAsset bulunamadı" hatası veriyordu.
      await reloadAppAsync('Tema değişti');
      return;
    } catch {
      // aşağıdaki açıklama gösterilir
    }
    await notify('Uygulamayı yeniden aç', 'Uygulamayı tamamen kapatıp yeniden açınca yeni tema görünür.', {
      icon: 'refresh',
    });
  }

  async function onRate() {
    try {
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        return;
      }
      const url = StoreReview.storeUrl();
      if (url) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // aşağıdaki açıklama gösterilir
    }
    await notify(
      'Değerlendirme yakında',
      'Uygulama mağazada yayınlanınca buradan puan verip yorum yazabileceksin. İlgin için teşekkürler!',
      { icon: 'star' },
    );
  }

  return (
    <View style={styles.wrap} testID="profile-preferences">
      <Text style={styles.title} accessibilityRole="header">
        Tercihler
      </Text>
      <View style={styles.panel}>
        <View style={styles.row}>
          <View style={styles.rowHead}>
            <View style={styles.icon}>
              <Ionicons name="contrast" size={18} color={colors.primary} />
            </View>
            <Text style={styles.rowTitle}>Tema</Text>
          </View>
          <View style={styles.segment}>
            {THEMES.map((t) => {
              const on = theme === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => void onTheme(t.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Tema: ${t.label}`}
                  testID={`theme-${t.key}`}
                  style={({ pressed }) => [styles.segBtn, on && styles.segOn, pressed && styles.pressed]}
                >
                  <Ionicons name={t.icon} size={14} color={on ? colors.primaryText : colors.textMuted} />
                  <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.row, styles.divided]}>
          <View style={styles.rowHead}>
            <View style={styles.icon}>
              <Ionicons name="language" size={18} color={colors.primary} />
            </View>
            <Text style={styles.rowTitle}>Dil</Text>
          </View>
          <View style={styles.segment}>
            <View style={[styles.segBtn, styles.segOn]} accessibilityLabel="Dil: Türkçe, seçili">
              <Text style={[styles.segText, styles.segTextOn]}>TR</Text>
            </View>
            <Pressable
              onPress={() =>
                void notify('İngilizce yakında', 'İngilizce dil seçeneği üzerinde çalışıyoruz; yakında burada olacak.', {
                  icon: 'language',
                })
              }
              accessibilityRole="button"
              accessibilityLabel="İngilizce, yakında"
              style={({ pressed }) => [styles.segBtn, styles.segSoon, pressed && styles.pressed]}
            >
              <Text style={styles.segText}>EN</Text>
              <Text style={styles.soon}>Yakında</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => void onRate()}
          accessibilityRole="button"
          testID="profile-rate"
          style={({ pressed }) => [styles.row, styles.divided, styles.linkRow, pressed && styles.rowPressed]}
        >
          <View style={styles.icon}>
            <Ionicons name="star" size={18} color={colors.highlight} />
          </View>
          <Text style={[styles.rowTitle, styles.flex]}>Uygulamayı değerlendir</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        {canInvite ? (
          <Pressable
            onPress={() => router.push('/davet')}
            accessibilityRole="button"
            testID="profile-invite"
            style={({ pressed }) => [styles.row, styles.divided, styles.linkRow, pressed && styles.rowPressed]}
          >
            <View style={styles.icon}>
              <Ionicons name="gift" size={18} color={colors.highlight} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Arkadaşlarını davet et</Text>
              <Text style={styles.rowSub}>Davet puanı kazan; petek adı, abonelik ve unvan al</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.md, paddingHorizontal: spacing.xs },
  panel: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  divided: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(34, 211, 197, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  flex: { flex: 1 },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 36,
    borderRadius: radii.sm,
  },
  segOn: { backgroundColor: colors.primary },
  segSoon: { opacity: 0.7 },
  segText: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: 13 },
  segTextOn: { color: colors.primaryText },
  soon: { color: colors.highlight, fontFamily: fonts.semi, fontSize: 10 },
  pressed: { opacity: 0.8 },
});
