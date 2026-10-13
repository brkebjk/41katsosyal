import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { notify } from '@/lib/dialog';
import { PROBLEM_CATEGORIES, submitProblemReport, type ProblemCategory } from '@/lib/problemReport';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Profil > Bir Sorun Bildir: sorun türü seçilir, sorun anlatılır, iletişim bilgileri yazılır (ad hazır gelir; e-posta
 * ve telefon isteğe bağlıdır). Bildirim moderatörlere gider.
 */
export function ProblemReportPopup({ defaultName, onClose }: { defaultName: string; onClose: () => void }) {
  const [category, setCategory] = useState<ProblemCategory | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSend() {
    if (sending) return;
    if (!category) return setError('Önce bir sorun türü seç.');
    if (message.trim().length < 10) return setError('Sorunu biraz daha anlat (en az 10 karakter).');
    setError(null);
    setSending(true);
    const res = await submitProblemReport({ category, message, name, email, phone });
    setSending(false);
    if (res.error) return setError(res.error);
    onClose();
    await notify(
      'Bildirimin alındı',
      'Teşekkürler! Moderatörlerimiz inceleyip gerekirse yazdığın iletişim bilgilerinden sana dönecek.',
      { icon: 'checkmark-circle', tone: 'success' },
    );
  }

  return (
    <Popup
      title="Sorun Bildir"
      subtitle="Yaşadığın sorunu anlat; moderatörlerimiz inceleyip dönüş yapsın."
      icon="bug"
      onClose={onClose}
      testID="problem-report"
      footer={<PrimaryButton label="Gönder" onPress={() => void onSend()} loading={sending} testID="problem-send" />}
    >
      <Text style={styles.label}>Sorun türü</Text>
      <View style={styles.chips}>
        {PROBLEM_CATEGORIES.map((c) => {
          const on = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => {
                setCategory(c.key);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Ionicons name={c.icon} size={14} color={on ? colors.primaryText : colors.primary} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Mesajın</Text>
      <TextInput
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setError(null);
        }}
        placeholder="Ne oldu? Hangi ekranda, ne yaparken? Ne olmasını bekliyordun?"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        multiline
        maxLength={2000}
        style={styles.message}
        accessibilityLabel="Sorun mesajı"
        testID="problem-message"
      />
      <Text style={styles.counter}>{`${message.length}/2000`}</Text>

      <Text style={styles.label}>İletişim bilgilerin</Text>
      <TextField label="Ad soyad" icon="person-outline" value={name} onChangeText={setName} maxLength={80} compact />
      <TextField
        label="E-posta (isteğe bağlı)"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={120}
        compact
      />
      <TextField
        label="Telefon (isteğe bağlı)"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={30}
        compact
      />
      <Text style={styles.note}>
        İletişim bilgilerin yalnızca bu bildirime dönüş yapmak için kullanılır. Uygulama sürümün ve telefon türün de
        bildirime eklenir.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Popup>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  chipTextOn: { color: colors.primaryText },
  pressed: { opacity: 0.8 },
  message: {
    minHeight: 110,
    maxHeight: 200,
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 20,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    textAlignVertical: 'top',
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: 'right' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
});
