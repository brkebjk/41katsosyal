import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Etkinliği akışta yeniden paylaşmak için 5 dakika dolmadıysa: canlı geri sayım penceresi. */
export function ShareCooldownModal({
  state,
  onClose,
}: {
  state: { seconds: number; title: string; at: number } | null;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state]);

  const left = state ? Math.max(0, Math.min(state.seconds, Math.ceil(state.seconds - (now - state.at) / 1000))) : 0;
  const mm = Math.floor(left / 60);
  const ss = left % 60;
  return (
    <Modal visible={state !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={styles.card}>
          <Ionicons name="time" size={30} color={colors.primary} />
          <Text style={styles.title}>Biraz bekle</Text>
          <Text style={styles.message}>
            {left > 0
              ? `“${state?.title ?? ''}” etkinliğini 5 dakikada bir paylaşabilirsin.`
              : 'Artık yeniden paylaşabilirsin.'}
          </Text>
          <Text style={styles.timer}>{`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`}</Text>
          <View style={styles.stretch}>
            <PrimaryButton label="Tamam" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.78)' },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  message: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 19 },
  timer: { color: colors.primary, fontFamily: fonts.black, fontSize: 40, letterSpacing: 2 },
  stretch: { alignSelf: 'stretch' },
});
