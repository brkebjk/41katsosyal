import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { CLOSE_REASON_MAX, CLOSE_REASON_MIN, requestEventClose } from '@/lib/events';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  /** null ise pencere kapalıdır */
  event: { id: string; title: string } | null;
  onClose: () => void;
  /** Talep gönderilince çağrılır (liste yenilensin diye) */
  onSent: () => void;
};

/**
 * Kodla katılanı olan etkinliği kapatmak için moderatöre açıklamalı talep. Etkinliğe gelen kişilerin puanları ve
 * emeği olduğu için etkinliği açan kişi onu tek başına kaldıramaz; sebep yazılır, moderatör karar verir.
 */
export function CloseRequestModal({ event, onClose, onSent }: Props) {
  return (
    <Modal
      visible={event !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {event ? <Card key={event.id} event={event} onClose={onClose} onSent={onSent} /> : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function Card({
  event,
  onClose,
  onSent,
}: {
  event: { id: string; title: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (busy) return;
    const text = reason.trim();
    if (text.length < CLOSE_REASON_MIN || text.length > CLOSE_REASON_MAX) {
      setError(`Açıklama ${CLOSE_REASON_MIN} ile ${CLOSE_REASON_MAX} karakter arasında olmalı.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await requestEventClose(event.id, text);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSent(true);
    onSent();
  }

  if (sent) {
    return (
      <View style={styles.card} testID="close-request-sent">
        <Text style={styles.title} accessibilityRole="header">
          Talebin moderatöre gitti
        </Text>
        <Text style={styles.message}>
          Moderatör açıklamanı inceler. Onaylarsa etkinlik kapanır; reddederse etkinlik devam eder. O zamana kadar
          etkinlik listede kalır.
        </Text>
        <PrimaryButton label="Tamam" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.card} testID="close-request-form">
      <Text style={styles.title} accessibilityRole="header">
        Kapatma talebi gönder
      </Text>
      <Text style={styles.message}>
        {`“${event.title}” etkinliğine kodla katılan kişiler olduğu için etkinliği kendin kapatamazsın. Nedenini yaz; moderatör inceleyip karar verir.`}
      </Text>
      <Text style={styles.warn}>
        Onaylanırsa etkinlik kapanır ve bu etkinlikten verilmiş bütün puanlar (katılımcılarınki ve seninki) geri
        alınır.
      </Text>
      <TextField
        label="Neden kapatmak istiyorsun?"
        icon="chatbox-ellipses-outline"
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          setError(null);
        }}
        placeholder="Örn. Mekân son anda kapandı, etkinlik yapılamadı."
        multiline
        maxLength={CLOSE_REASON_MAX}
        style={styles.multiline}
        textAlignVertical="top"
        testID="close-request-reason"
      />
      <Text style={styles.counter}>
        {reason.trim().length}/{CLOSE_REASON_MAX}
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Talebi gönder" onPress={() => void submit()} loading={busy} />
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
  warn: { color: colors.primary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  multiline: { minHeight: 96, paddingTop: spacing.sm },
  counter: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'right', marginTop: -spacing.sm },
});
