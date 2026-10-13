import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { confirmRecoveryPhrase, createRecoveryPhrase } from '@/lib/account';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  /** 'setup': kayıttan sonra zorunlu (kapatılamaz). 'renew': profilden yenileme (şifre ister, kapatılabilir). */
  mode: 'setup' | 'renew';
  onDone: () => void;
  onCancel?: () => void;
};

function fold(t: string): string {
  const map: Record<string, string> = { ı: 'i', İ: 'i', I: 'i', ş: 's', Ş: 's', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', â: 'a', î: 'i', û: 'u' };
  return t
    .trim()
    .replace(/[ıİIşŞçÇğĞöÖüÜâîû]/g, (c) => map[c] ?? c)
    .toLowerCase();
}

function pickTwo(): [number, number] {
  const a = Math.floor(Math.random() * 12);
  let b = Math.floor(Math.random() * 11);
  if (b >= a) b += 1;
  return a < b ? [a, b] : [b, a];
}

/**
 * 12 kurtarma kelimesi: üretir, bir kez gösterir, iki kelimeyi yazdırarak kaydedildiğini doğrular.
 * Şifresini unutan üye hesabını yalnızca bu kelimelerle kurtarabilir (e-posta yoktur).
 */
export function RecoveryPhraseSetup({ mode, onDone, onCancel }: Props) {
  const [step, setStep] = useState<'intro' | 'show' | 'verify'>('intro');
  const [words, setWords] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState(['', '']);
  const [check, setCheck] = useState<[number, number]>(() => pickTwo());

  async function generate() {
    if (busy) return;
    if (mode === 'renew' && password.length === 0) return setError('Mevcut şifreni yaz.');
    setBusy(true);
    setError(null);
    const res = await createRecoveryPhrase(mode === 'renew' ? password : undefined);
    setBusy(false);
    if (res.error || !res.words) return setError(res.error ?? 'Kelimeler oluşturulamadı.');
    setWords(res.words);
    setStep('show');
  }

  async function verify() {
    if (!words || busy) return;
    const ok = fold(answers[0]) === fold(words[check[0]]) && fold(answers[1]) === fold(words[check[1]]);
    if (!ok) {
      setError('Kelimeler eşleşmedi. Kaydettiğin listeye bakıp tekrar yaz.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await confirmRecoveryPhrase();
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
  }

  return (
    <View style={styles.root} testID="recovery-setup">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <Ionicons name="key" size={34} color={colors.primary} />
            <Text style={styles.title}>Kurtarma kelimelerin</Text>
          </View>

          {step === 'intro' ? (
            <>
              <Text style={styles.text}>
                Hesabında e-posta yok. Şifreni unutursan hesabını yalnızca sana vereceğimiz 12 kelimeyle
                kurtarabilirsin. Kelimeleri bir sonraki ekranda bir kez göstereceğiz.
              </Text>
              <View style={styles.warn}>
                <Text style={styles.warnText}>
                  • Ekran görüntüsü al ya da bir kağıda yaz.{'\n'}• Kimseyle paylaşma; biz de asla sormayız.
                  {'\n'}• Kaybedersen ve şifreni de unutursan hesabını kurtaramazsın.
                </Text>
              </View>
              {mode === 'renew' ? (
                <>
                  <Text style={styles.text}>
                    Yeni kelimeler oluşturunca eskileri geçersiz olur. Devam etmek için mevcut şifreni yaz.
                  </Text>
                  <TextField
                    label="Mevcut şifren"
                    icon="lock-closed-outline"
                    password
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label="Kelimelerimi göster" onPress={() => void generate()} loading={busy} />
              {onCancel ? <PrimaryButton label="Vazgeç" variant="ghost" onPress={onCancel} /> : null}
            </>
          ) : null}

          {step === 'show' && words ? (
            <>
              <Text style={styles.text}>
                Şimdi ekran görüntüsü al ya da sırasıyla bir kağıda yaz. Bu kelimeler bir daha gösterilmez.
              </Text>
              <View style={styles.grid} testID="recovery-words">
                {words.map((w, i) => (
                  <View key={`${i}-${w}`} style={styles.wordBox}>
                    <Text style={styles.wordNo}>{i + 1}</Text>
                    <Text style={styles.word} selectable>
                      {w}
                    </Text>
                  </View>
                ))}
              </View>
              <PrimaryButton
                label="Kaydettim, devam et"
                onPress={() => {
                  setAnswers(['', '']);
                  setError(null);
                  setCheck(pickTwo());
                  setStep('verify');
                }}
              />
            </>
          ) : null}

          {step === 'verify' && words ? (
            <>
              <Text style={styles.text}>Kaydettiğinden emin olalım: istenen iki kelimeyi yaz.</Text>
              <TextField
                label={`${check[0] + 1}. kelime`}
                icon="create-outline"
                value={answers[0]}
                onChangeText={(t) => setAnswers((a) => [t, a[1]])}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextField
                label={`${check[1] + 1}. kelime`}
                icon="create-outline"
                value={answers[1]}
                onChangeText={(t) => setAnswers((a) => [a[0], t])}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label="Doğrula ve bitir" onPress={() => void verify()} loading={busy} />
              <PrimaryButton
                label="Kelimeleri tekrar göster"
                variant="ghost"
                onPress={() => {
                  setError(null);
                  setStep('show');
                }}
              />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 100,
    elevation: 100,
  },
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  head: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  text: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21 },
  warn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 92, 122, 0.08)',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  warnText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordBox: {
    width: '31%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wordNo: { color: colors.textMuted, fontSize: 11, width: 16, textAlign: 'right' },
  word: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, flexShrink: 1 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
});
