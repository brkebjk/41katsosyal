import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { Text } from '@/components/AppText';
import { useIdentityEnabled } from '@/lib/identityFlag';
import { AuthShell } from '@/components/AuthShell';
import { PrimaryButton } from '@/components/PrimaryButton';
import { NameVisibilityTable } from '@/components/NameVisibilityTable';
import { TextField } from '@/components/TextField';
import { cleanUsername, passwordProblem, USERNAME_HINT, USERNAME_RE } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { isReservedName, RESERVED_NAME_TEXT } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

export default function RegisterScreen() {
  // Kimlik doğrulama kapalıyken (varsayılan) ödül uyarısı gösterilmez
  const identityOn = useIdentityEnabled();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  async function onSubmit() {
    if (submitting) return;
    const name = fullName.trim().replace(/\s+/g, ' ');
    const user = cleanUsername(username);
    if (name.length < 2 || name.length > 60) return setError('Gerçek adın 2 ile 60 karakter arasında olmalı.');
    if (isReservedName(name)) return setError(RESERVED_NAME_TEXT);
    if (!USERNAME_RE.test(user)) return setError(`Kullanıcı adı uygun değil. ${USERNAME_HINT}`);
    const pw = passwordProblem(password);
    if (pw) return setError(pw);
    if (!accepted) return setError('Devam etmek için kullanıcı sözleşmesini ve metinleri kabul etmelisin.');

    setError(null);
    setSubmitting(true);
    const result = await signUp(name, user, password, inviteCode);
    setSubmitting(false);
    if (result.error) setError(result.error);
    // Başarılıysa uygulama kendiliğinden açılır ve önce kurtarma kelimeleri gösterilir.
  }

  const openText = (doc: string) => router.push({ pathname: '/belge', params: { doc } });

  return (
    <AuthShell compact title="Kayıt ol" subtitle="Gerçek adın, kullanıcı adın ve şifren yeterli. Soyadı zorunlu değil.">
      <TextField
        label="Gerçek adın"
        icon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Ör. Ayşe Yılmaz"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        maxLength={60}
        onSubmitEditing={() => usernameRef.current?.focus()}
      />
      <View style={styles.nameGuide} testID="real-name-guide">
        <Text style={styles.nameGuideText}>
          Uygulamada istersen anonim kalabilir, gerçek adını gizli tutabilirsin.
        </Text>
        <Text style={styles.caps}>
          Gerçek adı ile kayıt olmayan kullanıcılar SIRALAMA ÖDÜLLERİNDEN yararlanamaz. Kayıttan sonra adını yalnızca 1 kez
          değiştirebilirsin.
        </Text>
      </View>
      <NameVisibilityTable />

      <TextField
        ref={usernameRef}
        label="Kullanıcı adı (giriş için)"
        icon="at-outline"
        value={username}
        onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
        placeholder="ör. ayse.y"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="next"
        maxLength={20}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Text style={styles.hint}>
        {`${USERNAME_HINT} Kullanıcı adın kimseye gösterilmez; akışta sana her hafta yeni bir rumuz verilir.`}
      </Text>
      <TextField
        ref={passwordRef}
        label="Şifre"
        icon="lock-closed-outline"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="En az 8 karakter, harf ve rakam"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        maxLength={72}
        onSubmitEditing={onSubmit}
      />
      <TextField
        label="Davet kodu (isteğe bağlı)"
        icon="gift-outline"
        value={inviteCode}
        onChangeText={(t) => setInviteCode(t.replace(/\s/g, '').toUpperCase())}
        placeholder="Seni davet eden arkadaşının kodu"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        help="Seni bir arkadaşın davet ettiyse kodunu yaz. Sen puan kazandıkça arkadaşın ödül kazanır. Şimdi yazmazsan kayıttan sonraki 7 gün içinde Profil > Arkadaşlarını davet et ekranından da girebilirsin."
      />
      <View style={styles.infoBox}>
        <Ionicons name="key-outline" size={18} color={colors.primary} />
        <Text style={styles.infoText}>
          E-posta istemiyoruz. Kayıttan sonra sana 12 kurtarma kelimesi verilecek; şifreni unutursan hesabını
          yalnızca bu kelimelerle kurtarabilirsin. Her telefondan yalnızca 1 hesap açılabilir.
        </Text>
      </View>

      {identityOn ? (
      <View style={styles.infoBox}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.highlight} />
        <Text style={styles.infoText}>
          Sıralama ödülleri (aylık hediye, abonelik, can) yalnızca hesabını doğrulamış üyelere verilir. Hesabını doğrulamazsan
          sıralamada yer alırsın ama ödül alamazsın. Doğrulamayı kayıttan sonra Profil sekmesinden yapabilirsin.
        </Text>
      </View>
      ) : null}

      <View style={styles.checkRow}>
        <Pressable
          onPress={() => setAccepted((a) => !a)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          hitSlop={8}
        >
          <Ionicons
            name={accepted ? 'checkbox' : 'square-outline'}
            size={24}
            color={accepted ? colors.primary : colors.textMuted}
          />
        </Pressable>
        <Text style={styles.checkText}>
          <Text style={styles.docLink} onPress={() => openText('legal_terms')}>
            Kullanıcı sözleşmesini
          </Text>
          {', '}
          <Text style={styles.docLink} onPress={() => openText('legal_kvkk')}>
            KVKK aydınlatma metnini
          </Text>
          {' ve '}
          <Text style={styles.docLink} onPress={() => openText('legal_consent')}>
            açık rıza metnini
          </Text>
          {' okudum, kabul ediyorum.'}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton label="Kayıt ol" onPress={onSubmit} loading={submitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Zaten hesabın var mı?</Text>
        <Link href="/giris" dismissTo style={styles.footerLink}>
          Giriş yap
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  nameGuide: {
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: -spacing.xs,
  },
  nameGuideText: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  caps: { color: colors.danger, fontFamily: fonts.extra, fontSize: fontSizes.xs, lineHeight: 18 },
  hint: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18, marginTop: -spacing.xs },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  infoText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  checkRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  checkText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  docLink: { color: colors.primary, fontWeight: '700' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  footerText: { color: colors.textMuted, fontSize: fontSizes.sm },
  footerLink: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800' },
});
