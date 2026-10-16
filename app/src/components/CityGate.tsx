import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CITY_KEYS, CITY_NAMES, setMyCity, type CityKey } from '@/lib/city';
import { cityOfLocation } from '@/lib/hex';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Telefonun daha önce izin verilmiş son konumu hangi şehirde? İzin sorulmaz; izin yoksa boş. */
async function suggestCity(): Promise<CityKey | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 6 * 60 * 60 * 1000 });
    if (!pos) return null;
    return cityOfLocation(pos.coords.longitude, pos.coords.latitude);
  } catch {
    return null;
  }
}

/**
 * Girişten sonra şehrini seçmemiş üyeye bir kez: İstanbul, Kocaeli ya da İzmir. Telefonun konumu bir şehri gösteriyorsa
 * o şehir önerilir (seçili gelir). Seçim sonra yalnızca göçle değişir (Profil > Şehrim).
 */
export function CityGate() {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<CityKey | null>(null);
  const [suggested, setSuggested] = useState<CityKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void suggestCity().then((c) => {
      if (!alive || !c) return;
      setSuggested(c);
      setPicked((p) => p ?? c);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function confirm() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const res = await setMyCity(picked);
    setBusy(false);
    if (res.error) setError(res.error);
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
          Şehrini seç
        </Text>
        <Text style={styles.lead}>
          Haritan, akışın ve etkinliklerin bu şehre göre gelir. Uzaktan oyunlar bütün illere açıktır.
        </Text>
        <View style={styles.list}>
          {CITY_KEYS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setPicked(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked === c }}
              style={({ pressed }) => [styles.row, picked === c && styles.rowOn, pressed && styles.pressed]}
              testID={`city-${c}`}
            >
              <Ionicons
                name={picked === c ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={picked === c ? colors.primary : colors.textMuted}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{CITY_NAMES[c]}</Text>
                {suggested === c ? <Text style={styles.rowSub}>Konumuna göre önerilen</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={styles.small}>
          Şehrini sonra değiştirmek göçtür: göç listesine yazılırsın, aylık sıralama sıfırlandığında yeni şehrine geçersin.
          Diğer şehirlerin haritasına, akışına ve etkinliklerine istediğin zaman ziyaretçi olarak bakabilirsin.
        </Text>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          label={picked ? `${CITY_NAMES[picked]} ile başla` : 'Bir şehir seç'}
          onPress={() => void confirm()}
          disabled={!picked}
          loading={busy}
          testID="city-confirm"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 95, elevation: 95 },
  shell: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  body: { gap: spacing.md },
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
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowOn: { borderColor: colors.primary },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  rowSub: { color: colors.primary, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  small: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
