import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { Text } from '@/components/AppText';
import { AuthShell } from '@/components/AuthShell';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import { isBackendReady } from '@/lib/supabase';
import { colors, fontSizes, radii, spacing } from '@/theme';


export default function LoginScreen() {
  const { signIn, notice, clearNotice, enterPreview } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function onSubmit() {
    if (submitting) return;
    if (login.trim().length < 3) return setError('Kullanıcı adını yaz.');
    if (password.length === 0) return setError('Şifreni yaz.');

    setError(null);
    clearNotice();
    setSubmitting(true);
    const result = await signIn(login, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <AuthShell title="Giriş yap" subtitle="Hesabınla PeopleHere'e geri dön.">
      {!isBackendReady ? (
        <View style={styles.devBox}>
          <Ionicons name="construct-outline" size={18} color={colors.primary} />
          <View style={styles.devTextWrap}>
            <Text style={styles.devText}>
              Sunucu bağlantısı henüz kurulmadı, bu yüzden giriş yapılamaz. KURULUM_REHBERI.md dosyasındaki
              Bölüm 2&apos;yi tamamlayınca burası çalışacak.
            </Text>
            {__DEV__ ? (
              <Text style={styles.devLink} onPress={enterPreview} accessibilityRole="button">
                Şimdilik önizleme olarak devam et
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <TextField
        label="Kullanıcı adı"
        icon="at-outline"
        value={login}
        onChangeText={setLogin}
        placeholder="Kullanıcı adın"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Şifre"
        icon="lock-closed-outline"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="Şifren"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton label="Giriş yap" onPress={onSubmit} loading={submitting} />

      <View style={styles.helpRow}>
        <Link href="/sifremi-unuttum" style={styles.helpLink}>
          Şifremi unuttum
        </Link>
        <Text
          style={styles.helpLink}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/belge', params: { doc: 'support_contact' } })}
        >
          Bize ulaş
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Hesabın yok mu?</Text>
        <Link href="/kayit" style={styles.footerLink}>
          Kayıt ol
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  devBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  devTextWrap: { flex: 1, gap: spacing.sm },
  devText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  devLink: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '700' },
  noticeBox: {
    backgroundColor: colors.bg,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noticeText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  helpRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  helpLink: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '700' },
  footerText: { color: colors.textMuted, fontSize: fontSizes.sm },
  footerLink: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800' },
});
