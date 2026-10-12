import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { APP_TEXT_TITLE, getAppText, type AppTextKey } from '@/lib/account';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const KEYS = Object.keys(APP_TEXT_TITLE) as AppTextKey[];

/**
 * Metni bölümlere ayırır: "## " ile başlayan satır bölüm başlığı, "• " ile başlayan satır madde olarak gösterilir.
 * Bu işaretler yoksa metin eskisi gibi düz yazı olarak görünür.
 */
function DocumentBody({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const key = `${i}`;
        if (line.startsWith('## ')) {
          return (
            <Text key={key} style={[styles.heading, i === 0 && styles.headingFirst]} accessibilityRole="header">
              {line.slice(3)}
            </Text>
          );
        }
        if (line.startsWith('• ')) {
          return (
            <View key={key} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={[styles.text, styles.bulletText]} selectable>
                {line.slice(2)}
              </Text>
            </View>
          );
        }
        if (line.trim() === '') return <View key={key} style={styles.gap} />;
        return (
          <Text key={key} style={styles.text} selectable>
            {line}
          </Text>
        );
      })}
    </View>
  );
}

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
          <DocumentBody text={current.text ?? 'Bu metin henüz eklenmedi.'} />
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
  heading: {
    color: colors.primary,
    fontFamily: fonts.semi,
    fontSize: fontSizes.md,
    lineHeight: 24,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  headingFirst: { marginTop: 0 },
  bulletRow: { flexDirection: 'row', paddingLeft: spacing.xs, marginTop: 2 },
  bulletDot: { color: colors.accent, fontSize: fontSizes.sm, lineHeight: 22, width: 16 },
  bulletText: { flex: 1 },
  gap: { height: spacing.sm },
});
