import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { DragDismiss } from '@/components/Sheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { REAL_NAME } from '@/lib/realName';
import { cleanRoomCode } from '@/lib/rooms';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Kodla katılmayı dener. Hata yazısı döner; başarılıysa boş döner (pencereyi üst bileşen kapatır). */
  onSubmit: (code: string) => Promise<string | null>;
};

/**
 * “Katıl” düğmesine basınca açılan davet kodu penceresi: kısa açıklama + kod kutusu. Telefonun ayrı bir penceresi
 * (Modal) olarak açılır; klavye açılırken altındaki ekranın yenilenmesi pencereyi etkilemez.
 */
export function JoinByCodeModal({ visible, onClose, onSubmit }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {visible ? (
          <DragDismiss onClose={onClose}>
            <Card onClose={onClose} onSubmit={onSubmit} />
          </DragDismiss>
        ) : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function Card({ onClose, onSubmit }: Pick<Props, 'onClose' | 'onSubmit'>) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const clean = cleanRoomCode(code);
    if (clean.length < 4) {
      setError('Oda kodunu yaz. Kod 5 harf ya da rakamdan oluşur.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(clean);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <View style={styles.card} testID="join-code-modal">
      <Text style={styles.title} accessibilityRole="header">
        Odaya katıl
      </Text>
      <Text style={styles.message}>
        Odayı açan kişinin söylediği 5 haneli kodu yaz. Bulunduğun bölge bir kez alınır; sürekli takip yapılmaz.
      </Text>
      <Text style={styles.realName}>{REAL_NAME.roomJoin}</Text>
      <TextField
        label="Oda kodu"
        icon="key-outline"
        value={code}
        onChangeText={(t) => {
          setCode(cleanRoomCode(t));
          setError(null);
        }}
        placeholder="Örn. K7M2P"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        autoFocus
        testID="join-code-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.btnRow}>
        <View style={styles.btn}>
          <PrimaryButton label="Vazgeç" onPress={onClose} variant="ghost" disabled={busy} />
        </View>
        <View style={styles.btn}>
          <PrimaryButton label="Katıl" onPress={() => void submit()} loading={busy} testID="join-code-submit" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', padding: spacing.md, paddingBottom: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1 },
  realName: { color: colors.primary, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSizes.xs + 1, lineHeight: 18, textAlign: 'center' },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
});
