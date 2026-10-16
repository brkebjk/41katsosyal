import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { KeyboardLift } from '@/components/KeyboardLift';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { ImageSlot } from '@/components/ImageSlot';
import { imageAspect } from '@/lib/images';
import { brand, colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Uzun formlarda (kayıt) logo ve rozetler küçültülür, form rahat sığar */
  compact?: boolean;
};

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: 'people', label: 'Yeni insanlar' },
  { icon: 'calendar', label: 'Etkinlikler' },
  { icon: 'game-controller', label: 'Oyunlar' },
];

/** Giriş ve kayıt ekranlarının ortak görünümü: tam ekran arka plan, logo, slogan, kart. */
export function AuthShell({ title, subtitle, children, compact = false }: Props) {
  const logoHeight = compact ? 80 : 128;

  return (
    <View style={styles.root}>
      <ImageSlot name="loginBackground" contentFit="cover" style={styles.fill} />
      {/* Üstte kule görünür kalsın, aşağı indikçe zemin koyulaşsın */}
      <LinearGradient
        colors={['rgba(11,15,26,0.05)', 'rgba(11,15,26,0.55)', 'rgba(11,15,26,0.94)']}
        locations={[0, 0.42, 0.8]}
        style={[styles.fill, styles.noTouch]}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardLift style={styles.safe}>
          <KeyboardAwareScroll
            contentContainerStyle={[styles.content, compact && styles.contentCompact]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              {/* Logo (işaret + PeopleHere yazısı) koyu zemin için çizildi: opak koyu bir plakanın üstünde durur */}
              <View
                style={[styles.plate, compact && styles.plateCompact]}
                accessible
                accessibilityRole="header"
                accessibilityLabel={brand.name}
              >
                <LinearGradient
                  colors={['#1D2547', '#071622']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.fill}
                />
                <ImageSlot name="logo" style={{ height: logoHeight, aspectRatio: imageAspect.logo }} />
              </View>

              <View style={styles.sloganPill}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
                <Text style={styles.sloganText}>{brand.slogan}</Text>
              </View>

              {!compact ? (
                <View style={styles.features}>
                  {FEATURES.map((f) => (
                    <View key={f.label} style={styles.feature}>
                      <Ionicons name={f.icon} size={14} color={colors.accent} />
                      <Text style={styles.featureText}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              <View style={styles.body}>{children}</View>
            </View>
          </KeyboardAwareScroll>
        </KeyboardLift>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  noTouch: { pointerEvents: 'none' },
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.lg,
  },
  contentCompact: { gap: spacing.lg },
  brand: { alignItems: 'center', gap: spacing.md },
  plate: {
    minWidth: 118,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 211, 197, 0.65)',
    backgroundColor: colors.bg, // opak zemin: arkadaki görsel plakanın içinden görünmez
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  plateCompact: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 22 },
  sloganPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(11, 15, 26, 0.82)',
    borderColor: 'rgba(34, 211, 197, 0.45)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  sloganText: {
    flexShrink: 1,
    color: colors.primary,
    fontFamily: fonts.semi,
    fontSize: 13,
    textAlign: 'center',
  },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(124, 140, 255, 0.16)',
    borderColor: 'rgba(124, 140, 255, 0.4)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  featureText: { color: '#F2FAFF', fontFamily: fonts.semi, fontSize: 12 },
  card: {
    backgroundColor: colors.overlay,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  body: { gap: spacing.lg, marginTop: spacing.md },
});
