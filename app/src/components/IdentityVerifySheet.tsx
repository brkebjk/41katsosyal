import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { tcLooksValid, verifyIdentity } from '@/lib/identity';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+( [A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+)*$/;

/**
 * Profil > Hesabı doğrula. Bilgiler NVİ'nin kimlik doğrulama servisine bir kez sorulur. Uyuşursa hesap hemen
 * doğrulanır, gerçek ad nüfustaki ad olur ve akışta sarı tik görünür.
 */
export function IdentityVerifySheet({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [year, setYear] = useState('');
  const [tc, setTc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const fn = firstName.replace(/\s+/g, ' ').trim();
    const ln = lastName.replace(/\s+/g, ' ').trim();
    const y = Number(year);
    if (fn.length < 2 || !NAME_RE.test(fn) || ln.length < 2 || !NAME_RE.test(ln)) {
      return setError('Adını ve soyadını nüfus cüzdanındaki gibi, yalnızca harflerle yaz.');
    }
    if (!/^\d{4}$/.test(year) || y < 1900 || y > new Date().getFullYear()) {
      return setError('Doğum yılını 4 haneli yaz (ör. 1995).');
    }
    if (!tcLooksValid(tc)) return setError('TC kimlik numarası geçersiz görünüyor. 11 haneyi kontrol et.');
    setBusy(true);
    setError(null);
    const res = await verifyIdentity({ tc, firstName: fn, lastName: ln, birthYear: year });
    setBusy(false);
    // TC numarası ekranda bekletilmez
    setTc('');
    if (!res.ok) return setError(res.error);
    onVerified();
  }

  return (
    <Sheet title="Hesabını doğrula" subtitle="Nüfus kaydıyla resmi kontrol (NVİ)" onClose={onClose}>
      <View style={styles.info}>
        <Ionicons name="shield-checkmark" size={20} color={colors.highlight} />
        <Text style={styles.infoText}>
          Bilgilerin Nüfus ve Vatandaşlık İşleri (NVİ) kimlik doğrulama servisine bir kez sorulur. Uyuşursa hesabın
          hemen doğrulanır ve akışta rumuzunun yanında sarı tik görünür.
        </Text>
      </View>
      <TextField
        label="Ad (varsa ikinci adınla)"
        icon="person-outline"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        placeholder="ör. Ayşe Nur"
      />
      <TextField
        label="Soyad"
        icon="person-outline"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        placeholder="ör. Yılmaz"
      />
      <TextField
        label="Doğum yılı"
        icon="calendar-outline"
        value={year}
        onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="ör. 1995"
      />
      <TextField
        label="TC kimlik numarası"
        icon="card-outline"
        value={tc}
        onChangeText={(t) => setTc(t.replace(/\D/g, '').slice(0, 11))}
        keyboardType="number-pad"
        maxLength={11}
        password
        autoComplete="off"
        importantForAutofill="no"
        placeholder="11 hane"
      />
      <View style={styles.privacy}>
        <Ionicons name="lock-closed" size={16} color={colors.success} />
        <Text style={styles.privacyText}>
          TC kimlik numaran kaydedilmez ve kimseye gösterilmez; yalnızca bu kontrol için kullanılır. Bir kişinin
          birden çok hesabı doğrulamaması için geri çevrilemeyen bir özeti saklanır.
        </Text>
      </View>
      <Text style={styles.warn}>
        Doğrulanınca profildeki gerçek adın nüfustaki adın olur ve artık değiştirilemez. İki adın varsa ilki
        kısaltılır (ör. Engin Berke Taş → E.Berke Taş). Günde en çok 5 deneme yapılabilir.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Doğrula" onPress={() => void submit()} loading={busy} testID="identity-submit" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  infoText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  privacy: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  privacyText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  warn: { color: colors.highlight, fontFamily: fonts.semi, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
});
