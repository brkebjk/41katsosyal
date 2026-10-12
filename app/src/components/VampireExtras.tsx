import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { RoleCard } from '@/components/RoleCard';
import { ROLE_ORDER, ROLES, type VvDeadMsg } from '@/lib/vampire';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Elenenlerin ortak sohbeti: yalnızca oyundan elenenler görür ve yazar (yaşayanlar göremez, oyunu etkilemesin).
 * Bir mesaja uzun basınca bildirilebilir.
 */
export function DeadChat({
  messages,
  canWrite,
  onSend,
  onReport,
}: {
  messages: VvDeadMsg[];
  canWrite: boolean;
  onSend: (body: string) => Promise<string | null>;
  onReport: (m: VvDeadMsg) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = text.trim();

  async function send() {
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSend(body);
    setBusy(false);
    if (err) setError(err);
    else setText('');
  }

  return (
    <View style={styles.card} testID="vv-dead-chat">
      <View style={styles.head}>
        <Ionicons name="skull" size={18} color="#C4B5FD" />
        <Text style={styles.title}>Elenenlerin sohbeti</Text>
      </View>
      <Text style={styles.muted}>Yalnızca elenenler görür. Yaşayanlara ipucu verilemez.</Text>
      {messages.length === 0 ? (
        <Text style={styles.muted}>Henüz mesaj yok.</Text>
      ) : (
        messages.slice(-30).map((m) => (
          <Pressable
            key={m.id}
            onLongPress={m.mine ? undefined : () => onReport(m)}
            delayLongPress={400}
            accessibilityHint={m.mine ? undefined : 'Bildirmek için uzun bas'}
            style={[styles.msg, m.mine ? styles.mine : styles.theirs]}
          >
            {!m.mine ? <Text style={styles.name}>{m.name}</Text> : null}
            <Text style={styles.body}>{m.body}</Text>
          </Pressable>
        ))
      )}
      {canWrite ? (
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Elenenlere yaz…"
            placeholderTextColor={colors.textMuted}
            maxLength={120}
            style={styles.input}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            accessibilityLabel="Elenenlerin sohbetine yaz"
          />
          <Pressable
            onPress={() => void send()}
            disabled={!body || busy}
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            style={[styles.send, (!body || busy) && styles.off]}
          >
            <Ionicons name="send" size={18} color={colors.primaryText} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** "Oyun kartlarını gör": bütün roller, açık kartlarıyla ve görevleriyle */
export function RoleGallery({ onClose }: { onClose: () => void }) {
  return (
    <Popup title="Oyun kartları" subtitle="Vampir–Köylü rolleri" icon="albums" onClose={onClose}>
      {ROLE_ORDER.map((r) => (
        <View key={r} style={styles.role}>
          <RoleCard role={r} faceUp width={150} />
          <View style={styles.roleText}>
            <Text style={[styles.roleName, { color: ROLES[r].color }]}>{ROLES[r].name}</Text>
            <Text style={styles.roleGoal}>{ROLES[r].goal}</Text>
            <Text style={styles.roleNight}>{ROLES[r].night}</Text>
          </View>
        </View>
      ))}
    </Popup>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(155, 123, 255, 0.4)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  muted: { color: colors.textMuted, fontSize: 13 },
  msg: { maxWidth: '85%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: 'rgba(124, 140, 255, 0.28)' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  name: { color: '#C4B5FD', fontSize: 11, fontFamily: fonts.semi },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 44,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  role: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  roleText: { alignItems: 'center', gap: 4 },
  roleName: { fontFamily: fonts.black, fontSize: fontSizes.lg },
  roleGoal: { color: colors.text, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  roleNight: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
