import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { KeyboardLift } from '@/components/KeyboardLift';
import { colors, fonts, fontSizes, spacing } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Verilirse başlık yazısının yerine bu içerik gösterilir (ör. logo + slogan). */
  header?: ReactNode;
  children: ReactNode;
  /** Verilirse sayfa aşağı çekilerek yenilenebilir */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Kaydırılan içeriğin dışında, ekranın üstüne binen katman (ör. alt menü) */
  overlay?: ReactNode;
  /** Verilirse başlığın üstünde "Geri" düğmesi görünür (sekme dışı ekranlar için) */
  onBack?: () => void;
  backLabel?: string;
  /** Başlık satırının sağ üst köşesine konan küçük öğe (ör. oyun hakkı göstergesi) */
  headerRight?: ReactNode;
  /** Kaydırılan içeriğin altında sabit duran alan (ör. yazı kutusu); klavye açılınca onunla yukarı kayar */
  footer?: ReactNode;
  /**
   * true ise `footer` içeriğin üstünde yüzer (arkasında zemin yoktur, altındaki içerik görünür). İçeriğin sonu
   * düğmelerin altında kalmasın diye kaydırılan alanın altına düğmeler kadar boşluk eklenir.
   */
  floatingFooter?: boolean;
};

/** Tüm sekme ekranlarının ortak iskeleti: başlık + kaydırılabilir içerik. */
export function Screen({
  title,
  subtitle,
  header,
  children,
  onRefresh,
  refreshing = false,
  overlay,
  onBack,
  backLabel = 'Geri',
  headerRight,
  footer,
  floatingFooter = false,
}: Props) {
  const [footH, setFootH] = useState(0);
  return (
    <View style={styles.root}>
      {/* Üstte hafif mor bir ışıma: akşam gökyüzü, kulenin üst katları */}
      <LinearGradient
        colors={['rgba(124, 140, 255, 0.24)', 'rgba(124, 140, 255, 0.07)', 'rgba(7, 22, 34, 0)']}
        locations={[0, 0.5, 1]}
        style={styles.glow}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardLift style={styles.flex}>
          {/* İç kutu: klavye açılınca küçülür; yüzen alt alan onun altına yaslandığı için klavyenin üstünde kalır */}
          <View style={styles.flex}>
          <KeyboardAwareScroll
            contentContainerStyle={[styles.content, floatingFooter && footer ? { paddingBottom: spacing.lg + footH } : null]}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
          >
            <View style={styles.header}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  accessibilityRole="button"
                  accessibilityLabel={backLabel}
                  hitSlop={10}
                  style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                  <Text style={styles.backText}>{backLabel}</Text>
                </Pressable>
              ) : null}
              <View style={styles.titleRow}>
                <View style={styles.titleCol}>
                  {header ?? (
                    <>
                      {onBack ? (
                        <Text style={styles.title} accessibilityRole="header">
                          {title}
                        </Text>
                      ) : (
                        // Sekme başlıkları (Etkinlikler, Oyunlar, Profil…): arkasında kenarlara doğru yumuşakça kaybolan
                        // yuvarlak bir ışık (köşesiz), solda sarı çizgi
                        <View style={styles.titleWrap}>
                          <Svg style={styles.titleGlow} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <Defs>
                              <RadialGradient id="titleGlow" cx="42" cy="50" r="50" gradientUnits="userSpaceOnUse">
                                <Stop offset="0" stopColor="#22D3C5" stopOpacity="0.34" />
                                <Stop offset="0.55" stopColor="#7C8CFF" stopOpacity="0.16" />
                                <Stop offset="1" stopColor="#7C8CFF" stopOpacity="0" />
                              </RadialGradient>
                            </Defs>
                            <Ellipse cx="42" cy="50" rx="58" ry="50" fill="url(#titleGlow)" />
                          </Svg>
                          <View style={styles.titleBar} />
                          <Text style={[styles.title, styles.titleLit]} accessibilityRole="header">
                            {title}
                          </Text>
                        </View>
                      )}
                      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    </>
                  )}
                </View>
                {headerRight ? <View style={styles.right}>{headerRight}</View> : null}
              </View>
            </View>
            {children}
          </KeyboardAwareScroll>
          {footer && floatingFooter ? (
            <View style={styles.floatFooter} onLayout={(e) => setFootH(Math.round(e.nativeEvent.layout.height))}>
              {footer}
            </View>
          ) : null}
          </View>
          {footer && !floatingFooter ? footer : null}
        </KeyboardLift>
        {overlay}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    pointerEvents: 'none',
  },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  floatFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  header: { gap: spacing.xs, paddingTop: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleCol: { flex: 1, gap: spacing.xs },
  right: { alignItems: 'flex-end' },
  title: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.xl - 2,
  },
  titleWrap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.xxl,
    marginLeft: -4,
  },
  // Işık yazının dışına taşar; kenarları tamamen saydam olduğu için köşe görünmez
  titleGlow: { position: 'absolute', top: -14, left: -20, right: -30, bottom: -14, pointerEvents: 'none' },
  titleBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.highlight,
  },
  // Yazı gölgesi kullanılmaz: Android'de gölge yazı kutusunun sınırında kesilip köşeli görünüyordu
  titleLit: { color: colors.text },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -4,
    paddingVertical: 4,
  },
  backPressed: { opacity: 0.6 },
  backText: {
    color: colors.primary,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
  },
});
