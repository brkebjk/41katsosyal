import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/lib/auth';
import { colors, fontSizes } from '@/theme';

const WORD = 'onaylıyorum';

function fold(t: string): string {
  return t
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
}

/** Hesabı kalıcı silme: kutucuğa “onaylıyorum” yazılmadan düğme açılmaz (sunucu da ayrıca denetler). */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const { deleteAccount } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = fold(text) === fold(WORD);

  async function onDelete() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount(text.trim());
    setBusy(false);
    if (res.error) setError(res.error);
  }

  return (
    <Sheet title="Hesabı kalıcı olarak sil" onClose={onClose}>
      <Text style={styles.text}>
        Hesabın, puanların, gönderilerin ve yorumların silinir; açtığın etkinlikler iptal olur. Bu işlem geri
        alınamaz. Bu telefondan yeni bir hesap açılamaz.
      </Text>
      <TextField
        label={`Onaylamak için “${WORD}” yaz`}
        icon="warning-outline"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={WORD}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label="Hesabımı kalıcı olarak sil"
        variant="danger"
        onPress={() => void onDelete()}
        disabled={!ready}
        loading={busy}
      />
      <PrimaryButton label="Vazgeç" variant="ghost" onPress={onClose} disabled={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
