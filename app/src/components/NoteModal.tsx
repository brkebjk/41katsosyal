import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  /** false ise pencere kapalıdır */
  visible: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  /** En az karakter (0 = not isteğe bağlı) */
  min?: number;
  max?: number;
  onClose: () => void;
  /** Notla birlikte çağrılır. Hata yazısı döner; başarılıysa boş (pencereyi üst bileşen kapatır). */
  onSubmit: (note: string) => Promise<string | null>;
};

/** Kısa bir not (ör. moderatörün kararına açıklama) yazdıran pencere. Telefonun ayrı penceresi olarak açılır. */
export function NoteModal(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={props.onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {props.visible ? <Card {...props} /> : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function Card({
  title,
  message,
  label,
  placeholder,
  confirmLabel,
  min = 0,
  max = 300,
  onClose,
  onSubmit,
}: Props) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const text = note.trim();
    if (text.length < min || text.length > max) {
      setError(`Not ${min} ile ${max} karakter arasında olmalı.`);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(text);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <View style={styles.card} testID="note-modal">
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <TextField
        label={label}
        icon="chatbox-ellipses-outline"
        value={note}
        onChangeText={(t) => {
          setNote(t);
          setError(null);
        }}
        placeholder={placeholder}
        multiline
        maxLength={max}
        style={styles.multiline}
        textAlignVertical="top"
        testID="note-modal-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label={confirmLabel} onPress={() => void submit()} loading={busy} />
      <PrimaryButton label="Vazgeç" onPress={onClose} variant="ghost" disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  multiline: { minHeight: 80, paddingTop: spacing.sm },
});
