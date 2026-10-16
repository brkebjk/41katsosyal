import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/auth';
import { becomeWaitingMember, CITY_KEYS, CITY_NAMES, setMyCity, type CityKey } from '@/lib/city';
import { cellOf, cityOfR, isLand, nearLand, type Cell } from '@/lib/hex';
import { locationFailText, requestOneTimeLocation } from '@/lib/map';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Found =
  | { state: 'locating' }
  | { state: 'failed'; reason: 'declined' | 'denied' | 'timeout' | 'unavailable' | 'mocked' }
  | { state: 'ready'; city: CityKey; cell: Cell; inside: boolean }
  /** Haritalarımızın dışında (henüz olmayan bir şehirde): yalnızca ziyaret; `near` en yakın şehrimiz */
  | { state: 'outside'; near: CityKey | null };

/** Karaya en çok bu kadar petek uzaktaysa (kıyı, vapur, il sınırının hemen dışı) o şehirde sayılır (~2-3 km) */
const NEAR_CELLS = 4;

/**
 * Girişten sonra şehri olmayan üyeye: konuma bir kez bakılır, üye yalnızca bulunduğu şehri seçebilir (diğer
 * şehirler listede görünür ama seçilemez; oraya sonra göçle geçilir). Sunucuya yalnızca peteğin numarası gider; sunucu
 * da şehrin bu petekle uyuştuğuna bakar. Moderatör her şehri seçebilir.
 * Haritalarımızın dışındaysa (henüz olmayan bir şehirde): “Üzgünüz, yakında senin şehrindeyiz” yazar, şehirlerden biri
 * seçilip yalnızca haritasına ziyaretçi olarak bakılır; üye bekleyen üye olarak ayrılır (moderatör panelinde görünür).
 * Uygulama her açılışta yeniden bakar: şehirlerimizden birine gelindiyse üyelik o şehirde başlar.
 */
export function CityGate() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [found, setFound] = useState<Found>({ state: 'locating' });
  const [picked, setPicked] = useState<CityKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setFound({ state: 'locating' });
    setError(null);
    const fix = await requestOneTimeLocation('city');
    if (!fix.ok) {
      setFound({ state: 'failed', reason: fix.reason });
      return;
    }
    const cell = cellOf(fix.lon, fix.lat);
    const city = cityOfR(cell.r);
    const inside = !!city && (isLand(cell.q, cell.r) || nearLand(cell, NEAR_CELLS));
    if (city && (inside || isModerator)) {
      setFound({ state: 'ready', city, cell, inside });
      setPicked(city);
      return;
    }
    if (!city && isModerator) {
      // Moderatör haritaların çok dışında: her şehri seçebilir
      setFound({ state: 'ready', city: 'kocaeli', cell, inside: false });
      setPicked('kocaeli');
      return;
    }
    setFound({ state: 'outside', near: city });
    setPicked(city ?? CITY_KEYS[0]);
  }, [isModerator]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- açılışta konuma bir kez bakılır
    void locate();
  }, [locate]);

  async function visitAsWaiting() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const res = await becomeWaitingMember(picked);
    setBusy(false);
    if (res.error) setError(res.error);
  }

  async function confirm() {
    if (found.state !== 'ready' || !picked || busy) return;
    setBusy(true);
    setError(null);
    const res = await setMyCity(picked, picked === found.city ? found.cell : null);
    setBusy(false);
    if (res.error) setError(res.error);
  }

  const here = found.state === 'ready' ? found.city : null;

  if (found.state === 'outside') {
    return (
      <View style={styles.root} accessibilityViewIsModal testID="city-gate-outside">
        <ScrollView
          style={styles.shell}
          contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="map-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Üzgünüz
          </Text>
          <View style={styles.card}>
            <Text style={styles.leadStrong}>Bulunduğun şehir henüz haritalarımızda yok. Yakında senin şehrindeyiz!</Text>
            <Text style={styles.small}>
              O zamana kadar şehirlerimizin haritalarına ziyaretçi olarak bakabilirsin. Bu şehirlerden birine geldiğinde
              uygulamayı açman yeter; üyeliğin o şehirde başlar.
            </Text>
          </View>

          <Text style={styles.section}>Şehirlerimiz</Text>
          <View style={styles.list}>
            {CITY_KEYS.map((c) => {
              const on = picked === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setPicked(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                  testID={`city-visit-${c}`}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.textMuted} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{CITY_NAMES[c]}</Text>
                    <Text style={styles.rowSubMuted}>
                      {found.near === c ? 'Sana en yakın şehrimiz · yalnızca ziyaret' : 'Yalnızca ziyaret'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          {picked ? (
            <PrimaryButton
              label={`${CITY_NAMES[picked]} haritasını ziyaret et`}
              onPress={() => void visitAsWaiting()}
              loading={busy}
              testID="city-visit-confirm"
            />
          ) : null}
          <PrimaryButton label="Konumumu tekrar dene" variant="ghost" onPress={() => void locate()} testID="city-retry" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityViewIsModal testID="city-gate">
      <ScrollView
        style={styles.shell}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="location" size={34} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Bulunduğun şehir
        </Text>

        {found.state === 'locating' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.lead}>Konumuna bakılıyor…</Text>
          </View>
        ) : found.state === 'failed' ? (
          <View style={styles.card}>
            <Text style={styles.lead}>
              {found.reason === 'declined'
                ? 'Şehrini belirlemek için konumuna bir kez bakmam gerekiyor.'
                : locationFailText(found.reason) || 'Konumun alınamadı.'}
            </Text>
            <Text style={styles.small}>İlk girişte yalnızca bulunduğun şehri seçebilirsin.</Text>
            <PrimaryButton label="Konumumu tekrar dene" onPress={() => void locate()} testID="city-retry" />
            {found.reason === 'denied' ? (
              <PrimaryButton label="Telefon ayarlarını aç" variant="ghost" onPress={() => void Linking.openSettings()} />
            ) : null}
          </View>
        ) : (
          <>
            <View style={[styles.row, styles.rowOn]} testID={`city-${found.city}`}>
              <Ionicons name="radio-button-on" size={22} color={colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{CITY_NAMES[found.city]}</Text>
                <Text style={styles.rowSub}>
                  {found.inside ? 'Şu an buradasın' : 'Haritalarımızın dışındasın; sana en yakın şehir bu'}
                </Text>
              </View>
            </View>

            <Text style={styles.section}>Diğer şehirler</Text>
            <View style={styles.list}>
              {CITY_KEYS.filter((c) => c !== here).map((c) => {
                const on = picked === c;
                return (
                  <Pressable
                    key={c}
                    // Yalnızca moderatör başka şehir seçebilir
                    disabled={!isModerator}
                    onPress={() => setPicked(on ? here : c)}
                    accessibilityRole={isModerator ? 'radio' : undefined}
                    accessibilityState={{ selected: on, disabled: !isModerator }}
                    style={({ pressed }) => [styles.row, styles.rowOff, on && styles.rowOn, pressed && styles.pressed]}
                    testID={`city-other-${c}`}
                  >
                    <Ionicons
                      name={isModerator ? (on ? 'radio-button-on' : 'radio-button-off') : 'lock-closed'}
                      size={20}
                      color={on ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, !on && styles.rowLabelOff]}>{CITY_NAMES[c]}</Text>
                      <Text style={styles.rowSubMuted}>{isModerator ? 'Moderatör seçebilir' : 'Sonra göçle geçebilirsin'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.info}>
          <View style={styles.infoHead}>
            <Ionicons name="sync" size={16} color={colors.primary} />
            <Text style={styles.infoTitle}>Göç nasıl olur?</Text>
          </View>
          <Text style={styles.infoText}>
            Başka bir şehre geçmek göçtür. Haritadaki ⟳ düğmesinden ya da Profil &gt; Şehrim’den hedef şehri seçip kutuya
            “Göçü onaylıyorum” yazarsın; göç listesine alınırsın.
          </Text>
          <Text style={styles.infoText}>
            Aylık sıralama sıfırlandığında (ay başında) yeni şehrine geçersin. O ayın puanları eski şehrinin sıralamasında
            kalır. Göçten ay bitmeden vazgeçebilirsin.
          </Text>
          <Text style={styles.infoText}>
            Akışın, etkinliklerin ve yan yana oyunların şehrine göre gelir; uzaktan oyunlar bütün illere açıktır. Diğer
            şehirlerin haritasına ziyaretçi olarak bakabilirsin.
          </Text>
        </View>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {found.state === 'ready' && picked ? (
          <PrimaryButton
            label={`${CITY_NAMES[picked]} ile başla`}
            onPress={() => void confirm()}
            loading={busy}
            testID="city-confirm"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 95, elevation: 95 },
  shell: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  body: { gap: spacing.md },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  iconCircle: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  lead: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  leadStrong: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, lineHeight: 22, textAlign: 'center' },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.sm, marginTop: spacing.xs },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowOn: { borderColor: colors.primary },
  rowOff: { opacity: 0.85 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  rowLabelOff: { color: colors.textMuted },
  rowSub: { color: colors.primary, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  rowSubMuted: { color: colors.textMuted, fontSize: fontSizes.xs },
  info: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  infoText: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  small: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
