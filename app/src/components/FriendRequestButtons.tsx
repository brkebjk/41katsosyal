import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { confirmAction } from '@/lib/dialog';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING, respondToRequest } from '@/lib/friends';
import { refreshNotices } from '@/lib/notices';
import { colors, fonts } from '@/theme';

/**
 * Arkadaşlık isteğine olduğu yerden yanıt: Onayla / Reddet. Üstten çıkan bildirimde (oyun sırasında da) ve harita
 * ekranındaki bildirim kutusunda görünür. Onaylarken gerçek ad uyarısı (kırmızı) çıkar. Yanıtlanmış ya da geri
 * çekilmiş istekte "artık geçerli değil" yazar.
 */
export function FriendRequestButtons({ requestId, onDone }: { requestId: string; onDone?: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'accepted' | 'declined' | 'gone'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (state !== 'idle') return;
    if (accept) {
      const ok = await confirmAction('Arkadaşlık isteğini kabul et', FRIEND_CONSEQUENCE, 'Kabul et', false, {
        icon: 'person-add',
        tone: 'friend',
        warning: FRIEND_WARNING,
      });
      if (!ok) return;
    }
    setState('busy');
    setError(null);
    const res = await respondToRequest(requestId, accept ? 'accept' : 'decline');
    if (res.error) {
      // Yanıtlanmış ya da geri çekilmiş istek
      setState('gone');
      setError(res.error);
      return;
    }
    setState(accept ? 'accepted' : 'declined');
    void refreshNotices();
    onDone?.();
  }

  if (state === 'accepted') return <Text style={styles.done}>Kabul ettin, artık arkadaşsınız.</Text>;
  if (state === 'declined') return <Text style={styles.done}>Reddettin.</Text>;
  if (state === 'gone') return <Text style={styles.done}>{error ?? 'Bu istek artık geçerli değil.'}</Text>;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => void respond(true)}
        disabled={state === 'busy'}
        accessibilityRole="button"
        testID="friend-accept"
        style={({ pressed }) => [styles.btn, styles.accept, pressed && styles.pressed]}
      >
        <Text style={styles.acceptText}>Onayla</Text>
      </Pressable>
      <Pressable
        onPress={() => void respond(false)}
        disabled={state === 'busy'}
        accessibilityRole="button"
        testID="friend-decline"
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
  accept: { backgroundColor: colors.primary },
  decline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  acceptText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 13 },
  declineText: { color: colors.text, fontFamily: fonts.extra, fontSize: 13 },
  pressed: { opacity: 0.75 },
  done: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
});
