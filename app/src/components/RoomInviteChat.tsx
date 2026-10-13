import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { confirmAction, notify } from '@/lib/dialog';
import {
  acceptRoomInvite,
  getMyRoomInvite,
  getRoomThread,
  ROOM_HOST_MSG_LIMIT,
  sendRoomMessage,
  type MyRoomInvite,
  type RoomThread,
} from '@/lib/invites';
import { timeAgo } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Oyun daveti bildirimindeki “Kabul et”. Kabul edilince oda sahibi gerçek adını görür ve yeri tarif etmek için sana en
 * çok 3 mesaj gönderebilir; sen de ona cevap verebilirsin (yazışma bildirimlerde, özel mesajlarda listelenmez).
 */
export function InviteAcceptRow({ roomId, onOpenChat }: { roomId: string; onOpenChat: (inviteId: string) => void }) {
  const [info, setInfo] = useState<MyRoomInvite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getMyRoomInvite(roomId).then((r) => {
      if (alive) setInfo(r);
    });
    return () => {
      alive = false;
    };
  }, [roomId]);

  async function accept() {
    if (busy) return;
    const ok = await confirmAction(
      'Daveti kabul et',
      'Kabul edersen oda sahibi gerçek adını görür ve odanın yerini tarif etmek için sana en çok 3 mesaj gönderebilir. Sen de ona cevap verebilirsin. Oda kodunu oda sahibi yerinde söyler.',
      'Kabul et',
    );
    if (!ok) return;
    setBusy(true);
    const res = await acceptRoomInvite(roomId);
    setBusy(false);
    if (res.error || !res.inviteId) {
      void notify('Kabul edilemedi', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'alert-circle' });
      return;
    }
    setInfo({ invite_id: res.inviteId, accepted: true, open: true });
  }

  if (info === undefined) return null;
  if (!info || !info.open)
    return (
      <Text style={styles.closed}>
        {info?.joined ? 'Odaya girdin; oda sahibiyle yazışma kapandı.' : 'Bu oda kapandı; davet geçersiz.'}
      </Text>
    );
  return info.accepted ? (
    <Pressable
      onPress={() => onOpenChat(info.invite_id)}
      accessibilityRole="button"
      testID="invite-chat-open"
      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
    >
      <Ionicons name="chatbubble-ellipses" size={16} color={colors.primaryText} />
      <Text style={styles.smallBtnText}>Mesaj gönder</Text>
    </Pressable>
  ) : (
    <Pressable
      onPress={() => void accept()}
      disabled={busy}
      accessibilityRole="button"
      testID="invite-accept"
      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={16} color={colors.primaryText} />
          <Text style={styles.smallBtnText}>Kabul et</Text>
        </>
      )}
    </Pressable>
  );
}

/** Oda yazışması penceresi: oda sahibi ↔ daveti kabul eden (gerçek adla). Oda kapanınca yazışma silinir. */
export function RoomInviteChat({
  inviteId,
  onClose,
  onChanged,
}: {
  inviteId: string;
  onClose: () => void;
  /** Mesaj gönderilince (oda sahibinin listesi tazelensin) */
  onChanged?: () => void;
}) {
  const [thread, setThread] = useState<RoomThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await getRoomThread(inviteId);
    setError(res.error);
    if (res.data) setThread(res.data);
  }, [inviteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await sendRoomMessage(inviteId, body);
    setSending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setText('');
    void load();
    onChanged?.();
  }

  const canSend = thread !== null && thread.open && thread.left > 0;

  return (
    <Popup
      title={thread ? thread.other_name : 'Oda yazışması'}
      subtitle={
        thread ? `${thread.game ?? 'Oyun'} odası${thread.place_note ? ` · ${thread.place_note}` : ''}` : undefined
      }
      icon="chatbubble-ellipses"
      onClose={onClose}
      testID="room-invite-chat"
    >
      <View style={styles.rule}>
        <Ionicons name="information-circle" size={18} color="#1A1200" />
        <Text style={styles.ruleText}>
          {`ODA SAHİBİ, DAVETİ KABUL EDEN KİŞİYE YALNIZCA ${ROOM_HOST_MSG_LIMIT} MESAJ GÖNDEREBİLİR. BU HAK ODANIN YERİNİ TARİF ETMEK İÇİNDİR.`}
        </Text>
      </View>
      <View style={styles.nameWarn}>
        <Ionicons name="person-circle" size={18} color={colors.danger} />
        <Text style={styles.nameWarnText}>
          Bu yazışmada iki taraf da GERÇEK ADIYLA görünür. Telefon numarası gibi kişisel bilgilerini paylaşma.
        </Text>
      </View>
      {thread === null ? (
        error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : (
        <>
          {thread.messages.length === 0 ? (
            <Text style={styles.muted}>
              {thread.role === 'host' ? 'Odanın yerini tarif eden ilk mesajı yaz.' : 'Henüz mesaj yok.'}
            </Text>
          ) : (
            thread.messages.map((m) => (
              <View key={m.id} style={[styles.msg, m.mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.msgText, m.mine && styles.mineText]}>{m.body}</Text>
                <Text style={[styles.msgTime, m.mine && styles.mineText]}>{timeAgo(m.created_at)}</Text>
              </View>
            ))
          )}
          {!thread.open ? (
            <Text style={styles.muted}>
              {thread.joined
                ? thread.role === 'host'
                  ? 'Davetli odaya girdi; yazışma kapandı.'
                  : 'Odaya girdin; yazışma kapandı.'
                : 'Oda kapandı; yazışma bitti.'}
            </Text>
          ) : canSend ? (
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={thread.role === 'host' ? 'Yeri tarif et…' : 'Cevap yaz…'}
                placeholderTextColor={colors.textMuted}
                maxLength={200}
                multiline
                style={styles.input}
                accessibilityLabel="Mesaj yaz"
              />
              <Pressable
                onPress={() => void send()}
                disabled={sending || !text.trim()}
                accessibilityRole="button"
                accessibilityLabel="Gönder"
                style={[styles.send, (sending || !text.trim()) && styles.off]}
              >
                {sending ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.primaryText} />
                )}
              </Pressable>
            </View>
          ) : (
            <Text style={styles.muted}>Mesaj hakkın doldu.</Text>
          )}
          {thread.open ? <Text style={styles.left}>{`Kalan mesaj hakkın: ${thread.left}`}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
      <PrimaryButton label="Kapat" variant="ghost" onPress={onClose} />
    </Popup>
  );
}

const styles = StyleSheet.create({
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    minHeight: 36,
  },
  smallBtnText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  smallBtnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.primary },
  smallBtnGhostText: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  closed: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  pressed: { opacity: 0.8 },
  rule: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#FFC83D',
  },
  ruleText: { flex: 1, color: '#1A1200', fontFamily: fonts.black, fontSize: 13, lineHeight: 18 },
  nameWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 92, 122, 0.12)',
  },
  nameWarnText: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: 13, lineHeight: 18 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  msg: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  msgText: { color: colors.text, fontSize: fontSizes.md, lineHeight: 21 },
  mineText: { color: colors.primaryText },
  msgTime: { color: colors.textMuted, fontSize: 10, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    color: colors.text,
    fontSize: fontSizes.md,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.45 },
  left: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
