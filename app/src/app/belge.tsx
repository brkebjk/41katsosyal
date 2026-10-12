import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { APP_TEXT_TITLE, getAppText, type AppTextKey } from '@/lib/account';
import { colors, fontSizes, radii, spacing } from '@/theme';

const KEYS = Object.keys(APP_TEXT_TITLE) as AppTextKey[];

/**
 * Uygulama metinleri: kullanıcı sözleşmesi, açık rıza, KVKK ve “Bize ulaşın”. Giriş yapmadan da açılır.
 * Metinler sunucudaki app_settings tablosundan gelir; moderatör oradan günceller.
 */
export default function DocumentScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const key: AppTextKey = KEYS.includes(params.doc as AppTextKey) ? (params.doc as AppTextKey) : 'legal_terms';
  const [loaded, setLoaded] = useState<{ key: AppTextKey; text: string | null; error: string | null } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void getAppText(key).then((r) => {
      if (active) setLoaded({ key, text: r.text, error: r.error });
    });
    return () => {
      active = false;
    };
  }, [key]);

  const current = loaded?.key === key ? loaded : null;

  return (
    <Screen
      title={APP_TEXT_TITLE[key]}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      backLabel="Geri"
    >
      <View style={styles.card}>
        {!current ? (
          <Text style={styles.muted}>Yükleniyor…</Text>
        ) : current.error ? (
          <Text style={styles.error}>{current.error}</Text>
        ) : (
          <Text style={styles.text} selectable>
            {current.text ?? 'Bu metin henüz eklenmedi.'}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg },
  text: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
