import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { respondCrewInvite } from '@/lib/crew';
import { refreshNotices } from '@/lib/notices';
import { colors, fonts } from '@/theme';

/**
 * Klan davetine olduğu yerden yanıt: Kabul et / Reddet. Üstten çıkan bildirimde (oyun sırasında da), bildirim
 * kutusunda ve akıştaki mesaj kutusunda görünür. Kabul edersen şu anki klanından ayrılırsın.
 */
export function CrewInviteButtons({ inviteId, onDone }: { inviteId: string; onDone?: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'accepted' | 'declined' | 'gone'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (state !== 'idle') return;
    setState('busy');
    setError(null);
    const res = await respondCrewInvite(inviteId, accept);
    if (res.error) {
      setState('gone');
      setError(res.error);
      return;
    }
    setState(accept ? 'accepted' : 'declined');
    void refreshNotices();
    onDone?.();
  }

  if (state === 'accepted') return <Text style={styles.done}>Klana katıldın.</Text>;
  if (state === 'declined') return <Text style={styles.done}>Reddettin.</Text>;
  if (state === 'gone') return <Text style={styles.done}>{error ?? 'Bu davet artık geçerli değil.'}</Text>;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void respond(true)}
        disabled={state === 'busy'}
        accessibilityRole="button"
        testID="crew-accept"
        style={({ pressed }) => [styles.btn, styles.accept, pressed && styles.pressed]}
      >
        <Text style={styles.acceptText}>Kabul et</Text>
      </Pressable>
      <Pressable
        onPress={() => void respond(false)}
        disabled={state === 'busy'}
        accessibilityRole="button"
        testID="crew-decline"
        style={({ pressed }) => [styles.btn, styles.decline, pressed && styles.pressed]}
      >
        <Text style={styles.declineText}>Reddet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: colors.success },
  decline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  acceptText: { color: '#06201D', fontFamily: fonts.extra, fontSize: 13 },
  declineText: { color: colors.text, fontFamily: fonts.extra, fontSize: 13 },
  pressed: { opacity: 0.75 },
  done: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
});
