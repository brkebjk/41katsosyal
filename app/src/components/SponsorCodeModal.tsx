import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DialogHost } from '@/components/DialogHost';
import { InfoLink } from '@/components/InfoModal';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { cleanSponsorCode, redeemFailText, redeemSponsorCode } from '@/lib/venues';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Kod kabul edilince çağrılır (kalan hak tazelensin diye) */
  onRedeemed: () => void;
  /** Zaten kullanılmamış bir sponsor hakkı var mı? (varsa yeni kod alınamaz) */
  hasCredit: boolean;
  /** “Oyun hakkım nasıl çalışır?” bilgi penceresini açar */
  onInfo: () => void;
};

/**
 * Oyunlar sekmesindeki hak göstergesine dokununca açılır: mekândan alınan kodu girerek 1 ek oyun odası hakkı kazanılır.
 * Kod yalnızca oda hakkı verir; puan vermez.
 */
export function SponsorCodeModal(props: Props) {
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

function Card({ onClose, onRedeemed, hasCredit, onInfo }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (code.length < 4) {
      setError('Kodu yaz (6 harf ya da rakam).');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await redeemSponsorCode(code);
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Kod denenemedi. Biraz sonra tekrar dene.');
      return;
    }
    if (!res.data.ok) {
      setError(redeemFailText(res.data.reason));
      return;
    }
    setDone(res.data.venue_name ?? 'Mekân');
    onRedeemed();
  }

  if (done) {
    return (
      <View style={styles.card} testID="sponsor-code-done">
        <Text style={styles.title} accessibilityRole="header">
          1 oyun hakkı kazandın
        </Text>
        <Text
          style={styles.message}
        >{`${done} sana 1 ek oyun odası hakkı verdi. Oda Oluştur'a basıp kullanabilirsin.`}</Text>
        <PrimaryButton label="Tamam" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.card} testID="sponsor-code-modal">
      <Text style={styles.title} accessibilityRole="header">
        Mekân kodu gir
      </Text>
      <Text style={styles.message}>
        {hasCredit
          ? 'Zaten kullanılmamış bir mekân hakkın var. Önce onu kullan; sonra yeni kod girebilirsin.'
          : 'Anlaşmalı bir mekândan aldığın kodu yaz. Kod sana 1 ek oyun odası hakkı verir. Her mekânın kodunu günde bir kez kullanabilirsin.'}
      </Text>
      <TextField
        label="Kod"
        icon="ticket-outline"
        value={code}
        onChangeText={(t) => {
          setCode(cleanSponsorCode(t));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        editable={!hasCredit}
        testID="sponsor-code-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label="Kodu kullan"
        onPress={() => void submit()}
        loading={busy}
        disabled={hasCredit || code.length === 0}
        testID="sponsor-code-submit"
      />
      <View style={styles.info}>
        <InfoLink label="Oyun hakkım nasıl çalışır?" onPress={onInfo} />
      </View>
      <PrimaryButton label="Kapat" onPress={onClose} variant="ghost" disabled={busy} />
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
  info: { alignItems: 'center' },
});
