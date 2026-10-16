import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Panel } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import {
  CITY_KEYS,
  CITY_NAMES,
  cancelCityMove,
  loadCity,
  requestCityMove,
  setVisiting,
  useCity,
  type CityKey,
} from '@/lib/city';
import { confirmAction, notify } from '@/lib/dialog';
import { formatDate } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const CONFIRM_TEXT = 'Göçü onaylıyorum';

/** Sunucudaki karşılaştırmanın aynısı: küçük harf, Türkçe harfler sadeleşir, boşluklar teke iner */
function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Şehrim: şu anki şehir, göç listesi ve ziyaret. Göç listesine yazılan üye aylık sıralama sıfırlandığında (ay başı)
 * yeni şehrine geçer; bu ayın puanları eski şehrin sıralamasında kalır. Moderatör hemen taşınır.
 */
export default function CityScreen() {
  const city = useCity();
  const [target, setTarget] = useState<CityKey | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadCity();
    }, []),
  );

  const others = CITY_KEYS.filter((c) => c !== city.my);
  const ready = target !== null && fold(confirm) === fold(CONFIRM_TEXT);

  async function onRefresh() {
    setRefreshing(true);
    await loadCity();
    setRefreshing(false);
  }

  async function submit() {
    if (!target || !ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await requestCityMove(target, confirm.trim());
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirm('');
    setTarget(null);
    void notify(
      city.instant ? 'Taşındın' : 'Göç listesine yazıldın',
      city.instant
        ? `Artık ${CITY_NAMES[target]} haritasındasın.`
        : `Aylık sıralama sıfırlandığında ${CITY_NAMES[target]} şehrine geçeceksin.`,
      { icon: 'airplane', tone: 'success' },
    );
  }

  async function cancel() {
    const ok = await confirmAction('Göçten vazgeç', 'Göç listesinden çıkarsın ve şehrin değişmez.', 'Vazgeç');
    if (!ok) return;
    setBusy(true);
    const res = await cancelCityMove();
    setBusy(false);
    setError(res.error);
  }

  function visit(c: CityKey) {
    setVisiting(c);
    router.navigate('/');
  }

  return (
    <Screen
      title="Şehrim"
      subtitle="Göç ve ziyaret"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <Panel>
        <View style={styles.current}>
          <Ionicons name="location" size={26} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.label}>Şehrin</Text>
            <Text style={styles.cityName} testID="city-current">
              {city.my ? CITY_NAMES[city.my] : 'Seçilmedi'}
            </Text>
          </View>
        </View>
        <Text style={styles.note}>
          Haritan, akışın, etkinliklerin ve yan yana odaların bu şehre göre gelir. Uzaktan oyunlar bütün illere açıktır.
        </Text>
      </Panel>

      {city.next ? (
        <Panel>
          <View style={styles.current}>
            <Ionicons name="airplane" size={24} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.label}>Göç listesindesin</Text>
              <Text style={styles.cityName} testID="city-next">
                {`${city.my ? CITY_NAMES[city.my] : ''} → ${CITY_NAMES[city.next]}`}
              </Text>
            </View>
          </View>
          <Text style={styles.note}>
            {city.nextAt
              ? `${formatDate(city.nextAt)} günü aylık sıralama sıfırlandığında yeni şehrine geçersin. Bu ayın puanları ${city.my ? CITY_NAMES[city.my] : 'şimdiki şehrinin'} sıralamasında kalır.`
              : 'Aylık sıralama sıfırlandığında yeni şehrine geçersin.'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Göçten vazgeç" variant="ghost" onPress={() => void cancel()} loading={busy} testID="city-cancel" />
        </Panel>
      ) : city.my ? (
        <Panel>
          <Text style={styles.section}>Göç et</Text>
          <Text style={styles.note}>
            {city.instant
              ? 'Moderatör olarak hemen taşınırsın.'
              : `Göç listesine yazılırsın; aylık sıralama sıfırlandığında${city.moveAt ? ` (${formatDate(city.moveAt)})` : ''} yeni şehrine geçersin. Bu ayın puanları ${CITY_NAMES[city.my]} sıralamasında kalır.`}
          </Text>
          <View style={styles.list}>
            {others.map((c) => (
              <Pressable
                key={c}
                onPress={() => setTarget(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: target === c }}
                style={({ pressed }) => [styles.row, target === c && styles.rowOn, pressed && styles.pressed]}
                testID={`city-move-${c}`}
              >
                <Ionicons
                  name={target === c ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={target === c ? colors.primary : colors.textMuted}
                />
                <Text style={styles.rowLabel}>{CITY_NAMES[c]}</Text>
              </Pressable>
            ))}
          </View>
          {target ? (
            <TextField
              label={`Onaylamak için “${CONFIRM_TEXT}” yaz`}
              value={confirm}
              onChangeText={(t) => {
                setConfirm(t);
                setError(null);
              }}
              placeholder={CONFIRM_TEXT}
              autoCorrect={false}
              autoCapitalize="sentences"
              testID="city-move-confirm-input"
            />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label={city.instant ? 'Hemen taşın' : 'Göç listesine yazıl'}
            onPress={() => void submit()}
            disabled={!ready}
            loading={busy}
            testID="city-move-submit"
          />
        </Panel>
      ) : null}

      <Panel>
        <Text style={styles.section}>Ziyaret et</Text>
        <Text style={styles.note}>
          Diğer şehirlerin haritasına, akışına ve etkinliklerine bakabilirsin. Ziyaretteyken paylaşım, etkinlik açma ve yan
          yana oyun yoktur.
        </Text>
        <View style={styles.list}>
          {others.map((c) => (
            <Pressable
              key={c}
              onPress={() => visit(c)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              testID={`city-visit-${c}`}
            >
              <Ionicons name="eye-outline" size={20} color={colors.textMuted} />
              <Text style={styles.rowLabel}>{CITY_NAMES[c]}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  current: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { color: colors.textMuted, fontSize: fontSizes.xs },
  cityName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  section: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  note: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
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
  rowLabel: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  pressed: { opacity: 0.75 },
});
