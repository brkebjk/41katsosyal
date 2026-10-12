import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { cleanUsername, passwordProblem, recoverAccount, USERNAME_RE } from '@/lib/account';
import { colors, fontSizes, radii, spacing } from '@/theme';

/** Şifre sıfırlama: kullanıcı adı + 12 kurtarma kelimesi + yeni şifre. E-posta yoktur. */
export default function ForgotPasswordScreen() {
  const [username, setUsername] = useState('');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const wordCount = phrase.trim() ? phrase.trim().split(/[^A-Za-zÇĞİÖŞÜçğıöşü]+/).filter(Boolean).length : 0;

  async function onSubmit() {
    if (busy) return;
    const user = cleanUsername(username);
    if (!USERNAME_RE.test(user)) return setError('Kullanıcı adını doğru yaz.');
    if (wordCount !== 12) return setError(`12 kelimenin hepsini yaz (şu an ${wordCount} kelime).`);
    const pw = passwordProblem(password);
    if (pw) return setError(pw);
    setError(null);
    setBusy(true);
    const res = await recoverAccount(user, phrase, password);
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell compact title="Şifren yenilendi" subtitle="Yeni şifrenle giriş yapabilirsin.">
        <Text style={styles.info}>
          Hesabındaki bütün açık oturumlar kapatıldı. Kurtarma kelimelerin değişmedi, saklamaya devam et.
        </Text>
        <PrimaryButton label="Girişe dön" onPress={() => router.replace('/giris')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell compact title="Şifremi unuttum" subtitle="Kurtarma kelimelerinle yeni şifre belirle.">
      <TextField
        label="Kullanıcı adı"
        icon="at-outline"
        value={username}
        onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
        placeholder="Kullanıcı adın"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <TextField
        label={`12 kurtarma kelimesi (${wordCount}/12)`}
        icon="key-outline"
        value={phrase}
        onChangeText={setPhrase}
        placeholder="Kelimeleri sırasıyla, aralarında boşluk bırakarak yaz"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={styles.phraseInput}
      />
      <TextField
        label="Yeni şifre"
        icon="lock-closed-outline"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="En az 8 karakter, harf ve rakam"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={72}
      />
      <View style={styles.box}>
        <Text style={styles.boxText}>
          Kelimelerini de kaybettiysen hesabını kendin kurtaramazsın; bize ulaş. Çok fazla yanlış denemede
          güvenlik için 1 saat beklemen gerekir.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Şifremi yenile" onPress={() => void onSubmit()} loading={busy} />

      <View style={styles.footer}>
        <Link href="/giris" dismissTo style={styles.footerLink}>
          Girişe dön
        </Link>
        <Text
          style={styles.footerLink}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/belge', params: { doc: 'support_contact' } })}
        >
          Bize ulaş
        </Text>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  phraseInput: { minHeight: 72, textAlignVertical: 'top' },
  box: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  boxText: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  info: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  footerLink: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800' },
});
