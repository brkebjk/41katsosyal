import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { ImageSlot } from '@/components/ImageSlot';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/auth';
import { imageAspect } from '@/lib/images';
import { isLifetimeSubscription, isSubscriptionActive, subscriptionUntilText } from '@/lib/labels';
import { DEFAULT_LIMITS, getLimits, type Limits } from '@/lib/membership';
import {
  buyPackage,
  loadPackages,
  purchasesAvailable,
  restorePurchases,
  type PurchaseOutcome,
  type StorePackage,
} from '@/lib/purchases';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const MANAGE_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

type Row = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  free: string | boolean;
  subscribed: string | boolean;
};

function buildRows(l: Limits): Row[] {
  return [
    { label: 'Gönderi, yorum ve beğeni', icon: 'chatbubbles', free: true, subscribed: true },
    { label: 'Özel mesaj başlatma', icon: 'mail', free: 'Yalnızca cevap', subscribed: true },
    { label: 'Etkinlik oluşturma', icon: 'calendar', free: `ayda ${l.freeEvents}`, subscribed: `ayda ${l.subscriptionEvents}` },
    { label: 'PeopleHere Özel ücretli etkinlikler', icon: 'star', free: 'Ücretli', subscribed: 'Ücretsiz' },
  ];
}

export default function SubscriptionScreen() {
  const { profile, refreshProfile } = useAuth();
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [packages, setPackages] = useState<StorePackage[]>([]);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(purchasesAvailable);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const lock = useRef(false);

  const subscribed = isSubscriptionActive(profile?.premium_until);
  const isStore = profile?.premium_source === 'store';

  useEffect(() => {
    let active = true;
    void getLimits().then((l) => {
      if (active) setLimits(l);
    });
    return () => {
      active = false;
    };
  }, []);

  // Satın alma kitaplığı oturum açıldıktan hemen sonra hazır olmayabilir; boş gelirse kısa aralıkla 2 kez daha denenir.
  const fetchPackages = useCallback(async (isActive: () => boolean) => {
    let res = await loadPackages();
    for (let i = 0; i < 2 && res.packages.length === 0 && isActive(); i++) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await loadPackages();
    }
    if (!isActive()) return;
    setPackages(res.packages);
    setPackagesError(res.error);
    setSelected((cur) => cur ?? res.packages[0]?.id ?? null);
    setPackagesLoading(false);
  }, []);

  useEffect(() => {
    if (!purchasesAvailable || subscribed) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum mağazadan gelen cevapla güncellenir
    void fetchPackages(() => active);
    return () => {
      active = false;
    };
  }, [subscribed, fetchPackages]);

  async function run(kind: 'buy' | 'restore', task: () => Promise<PurchaseOutcome>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      const out = await task();
      if (out.status === 'done') {
        await refreshProfile();
        setMessage({ text: 'Aboneliğin başladı. Hoş geldin!', kind: 'ok' });
      } else if (out.status === 'pending') {
        await refreshProfile();
        setMessage({ text: out.message, kind: 'ok' });
      } else if (out.status === 'none' || out.status === 'error') {
        setMessage({ text: out.message, kind: 'error' });
      }
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  const chosen = packages.find((p) => p.id === selected) ?? null;
  const rows = buildRows(limits);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={['rgba(124, 140, 255, 0.42)', 'rgba(34, 211, 197, 0.10)', 'rgba(7, 22, 34, 0)']}
            locations={[0, 0.55, 1]}
            style={styles.glow}
          />

          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityRole="button"
            accessibilityLabel="Geri"
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Geri</Text>
          </Pressable>

          <View style={styles.hero}>
            <ImageSlot name="subscriptionBadge" style={styles.badge} />
            <Text style={styles.title}>PeopleHere Abonelik</Text>
            <Text style={styles.lead}>
              Daha çok etkinlik ve özel mesaj başlatma. PeopleHere Özel etkinliklerine ücretsiz katıl.
            </Text>
          </View>

          {/* PeopleHere Özel etkinlikleri: ayda en az 4 kez */}
          <View style={styles.specialBox} testID="subscription-special-events">
            <Ionicons name="star" size={22} color={colors.highlight} />
            <View style={styles.activeText}>
              <Text style={styles.specialTitle}>PeopleHere Özel etkinlikleri ayda en az 4 kez düzenlenir</Text>
              <Text style={styles.muted}>
                Moderatörlerin düzenlediği bu etkinliklerin ücretli olanlarına aboneler ücretsiz katılır.
              </Text>
            </View>
          </View>

          {subscribed && profile?.premium_until ? (
            <View style={styles.activeBox}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <View style={styles.activeText}>
                <Text style={styles.activeTitle}>Aboneliğin aktif</Text>
                <Text style={styles.muted}>{subscriptionUntilText(profile.premium_until)}</Text>
              </View>
            </View>
          ) : null}

          {/* Anlaşmalı işletmelerdeki ayrıcalıklar */}
          <PrimaryButton label="Ayrıcalıkları gör" variant="ghost" onPress={() => router.push('/ayricaliklar')} />

          {/* Karşılaştırma: solda özellik, ortada ücretsiz, sağda öne çıkan abone sütunu */}
          <LinearGradient
            colors={['rgba(34, 211, 197, 0.55)', 'rgba(124, 140, 255, 0.45)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tableFrame}
          >
            <View style={styles.table}>
              <View style={styles.headRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.tableTitle}>Neler var?</Text>
                </View>
                <View style={[styles.cell, styles.headCell]}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.headText}>Ücretsiz</Text>
                </View>
                <LinearGradient
                  colors={['#22D3C5', '#7C8CFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.cell, styles.headCell, styles.headSubscriptionCell]}
                >
                  <ImageSlot name="subscriptionBadge" style={styles.headBadge} />
                  <Text style={styles.headSubscription}>Abone</Text>
                </LinearGradient>
              </View>
              {rows.map((r, i) => (
                <View key={r.label} style={[styles.dataRow, i % 2 === 1 && styles.dataRowAlt]}>
                  <View style={[styles.labelCell, styles.labelRow]}>
                    <View style={styles.rowIcon}>
                      <Ionicons name={r.icon} size={15} color={colors.primary} />
                    </View>
                    <Text style={styles.labelText}>{r.label}</Text>
                  </View>
                  <View style={styles.cell}>
                    <Value v={r.free} />
                  </View>
                  <View
                    style={[styles.cell, styles.cellSubscription, i === rows.length - 1 && styles.cellSubscriptionLast]}
                  >
                    <Value v={r.subscribed} subscribed />
                  </View>
                </View>
              ))}
            </View>
          </LinearGradient>
          <Text style={styles.footnote}>
            Haklar her ayın başında yenilenir; kullanılmayan haklar sonraki aya geçmez. Abonelik sıralamadaki puanını ve
            hediye kazanma şansını artırmaz; puanla abonelik kazanılmaz. Seviye ödülleri (ör. +1 etkinlik hakkı) abonelikten
            ayrıdır ve abonelere de verilir.
          </Text>

          {/* Satın alma */}
          {subscribed ? (
            isStore || isLifetimeSubscription(profile?.premium_until) ? (
              <View style={styles.buyBox}>
                <Text style={styles.buyTitle}>Aboneliğini yönet</Text>
                <Text style={styles.muted}>
                  {isStore
                    ? 'Yenilemeyi kapatmak ya da planını değiştirmek için mağaza hesabındaki abonelikler sayfasını aç.'
                    : 'Hazine Avı ödülüyle ömür boyu abonesin. Mağazadan devam eden bir aboneliğin varsa yenilemesini oradan kapatabilirsin.'}
                </Text>
                <PrimaryButton
                  label="Abonelikleri aç"
                  variant="ghost"
                  onPress={() => void Linking.openURL(MANAGE_URL)}
                />
              </View>
            ) : null
          ) : !purchasesAvailable ? (
            <View style={styles.buyBox}>
              <Text style={styles.buyTitle}>Satın alma yakında açılacak</Text>
              <Text style={styles.muted}>
                Fiyat belli olunca buradan abone olabileceksin. Şimdilik ücretsiz üyelik haklarını kullanabilirsin.
              </Text>
              <PrimaryButton label="Yakında" onPress={() => {}} disabled />
            </View>
          ) : (
            <View style={styles.buyBox}>
              <Text style={styles.buyTitle}>Planını seç</Text>
              {packagesLoading ? (
                <ActivityIndicator color={colors.primary} style={styles.loader} />
              ) : packages.length === 0 ? (
                <>
                  <Text style={styles.muted}>{packagesError ?? 'Şu an satın alınabilir bir paket yok.'}</Text>
                  <PrimaryButton
                    label="Tekrar dene"
                    variant="ghost"
                    onPress={() => {
                      setPackagesLoading(true);
                      void fetchPackages(() => true);
                    }}
                  />
                </>
              ) : (
                <>
                  <View style={styles.packages}>
                    {packages.map((p) => {
                      const on = p.id === selected;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => setSelected(p.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${p.title}, ${p.priceText}${p.per ? ` / ${p.per}` : ''}`}
                          style={[styles.pkg, on && styles.pkgOn]}
                        >
                          <Ionicons
                            name={on ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={on ? colors.primary : colors.textMuted}
                          />
                          <Text style={styles.pkgTitle}>{p.title}</Text>
                          <Text style={styles.pkgPrice}>
                            {p.priceText}
                            {p.per ? <Text style={styles.pkgPer}> / {p.per}</Text> : null}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <PrimaryButton
                    label={chosen ? `Abone ol · ${chosen.priceText}` : 'Abone ol'}
                    onPress={() => chosen && void run('buy', () => buyPackage(chosen))}
                    loading={busy === 'buy'}
                    disabled={!chosen || busy !== null}
                  />
                  <Text style={styles.legal}>
                    Abonelik, iptal edilmedikçe her dönem sonunda otomatik yenilenir. İstediğin zaman mağaza hesabındaki
                    abonelikler sayfasından iptal edebilirsin. Ödeme, mağaza hesabından alınır.
                  </Text>
                </>
              )}
            </View>
          )}

          {message ? (
            <Text style={[styles.message, message.kind === 'error' ? styles.messageError : styles.messageOk]}>
              {message.text}
            </Text>
          ) : null}

          {!subscribed && purchasesAvailable ? (
            <Text
              style={[styles.restore, busy !== null && styles.restoreBusy]}
              accessibilityRole="button"
              onPress={() => (busy === null ? void run('restore', restorePurchases) : undefined)}
            >
              {busy === 'restore' ? 'Geri yükleniyor…' : 'Satın alımları geri yükle'}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Value({ v, subscribed = false }: { v: string | boolean; subscribed?: boolean }) {
  if (v === true)
    return <Ionicons name="checkmark-circle" size={24} color={subscribed ? colors.highlight : colors.success} />;
  if (v === false) return <Ionicons name="remove" size={20} color={colors.textMuted} />;
  return <Text style={[styles.valueText, subscribed && styles.valueSubscription]}>{v}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  glow: { position: 'absolute', top: -80, left: 0, right: 0, height: 420, pointerEvents: 'none' },
  pressed: { opacity: 0.6 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -4,
    paddingVertical: 4,
  },
  backText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  badge: { height: 240, aspectRatio: imageAspect.subscriptionBadge },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  lead: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  activeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  activeText: { flex: 1, gap: 2 },
  specialBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 200, 61, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.5)',
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  specialTitle: { color: colors.highlight, fontFamily: fonts.extra, fontSize: fontSizes.md },
  activeTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  // Renkli ince çerçeve (degrade) içinde tablo
  tableFrame: { borderRadius: radii.lg + 2, padding: 1.5 },
  table: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden', paddingTop: spacing.sm },
  tableTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  headRow: { flexDirection: 'row', alignItems: 'stretch', paddingRight: spacing.sm },
  dataRow: { flexDirection: 'row', alignItems: 'stretch', paddingRight: spacing.sm },
  dataRowAlt: { backgroundColor: 'rgba(255, 255, 255, 0.025)' },
  labelCell: {
    flex: 1.6,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 211, 197, 0.12)',
  },
  labelText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontWeight: '600', lineHeight: 18 },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  headCell: { gap: 4, paddingVertical: spacing.sm },
  headSubscriptionCell: {
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    shadowColor: '#22D3C5',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  headBadge: { height: 30, aspectRatio: imageAspect.subscriptionBadge },
  // Abone sütunu: baştan sona açık turkuaz şerit, iki yanda ince çizgi
  cellSubscription: {
    backgroundColor: 'rgba(34, 211, 197, 0.12)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.45)',
  },
  cellSubscriptionLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    marginBottom: spacing.sm,
  },
  headText: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: fontSizes.xs, textAlign: 'center' },
  headSubscription: { color: colors.primaryText, fontFamily: fonts.black, fontSize: fontSizes.sm, textAlign: 'center' },
  valueText: { color: colors.textMuted, fontSize: fontSizes.xs + 1, fontWeight: '700', textAlign: 'center' },
  valueSubscription: { color: colors.highlight, fontFamily: fonts.extra },
  footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  buyBox: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  buyTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  loader: { paddingVertical: spacing.lg },
  packages: { gap: spacing.sm },
  pkg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    minHeight: 56,
  },
  pkgOn: { borderColor: colors.primary },
  pkgTitle: { flex: 1, color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  pkgPrice: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  pkgPer: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  legal: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  message: { fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  messageError: { color: colors.danger },
  messageOk: { color: colors.success },
  restore: {
    color: colors.primary,
    fontFamily: fonts.extra,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  restoreBusy: { opacity: 0.5 },
});
