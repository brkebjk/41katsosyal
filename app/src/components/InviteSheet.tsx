import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoomInviteChat } from '@/components/RoomInviteChat';
import { Sheet } from '@/components/Sheet';
import {
  getAcceptedInvites,
  getInviteTargets,
  ROOM_HOST_MSG_LIMIT,
  sendRoomInvites,
  type AcceptedInvite,
  type InviteTargets,
} from '@/lib/invites';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Oda sahibinin “Davet et” penceresi. Yalnızca davet almayı açmış kişilere gider: arkadaşlar adıyla seçilir,
 * yakındakiler (son saatlerde odanın bölgesinde görülenler) kim oldukları gösterilmeden topluca davet edilir.
 */
export function InviteSheet({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [data, setData] = useState<InviteTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [nearby, setNearby] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  /** Daveti kabul edenler (oda sahibi bunlara yeri tarif etmek için mesaj gönderebilir) */
  const [accepted, setAccepted] = useState<AcceptedInvite[]>([]);
  const [chat, setChat] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getInviteTargets(roomId);
    setData(res.data);
    setError(res.error);
  }, [roomId]);

  const loadAccepted = useCallback(async () => {
    const res = await getAcceptedInvites(roomId);
    if (!res.error) setAccepted(res.data);
  }, [roomId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  // Yeni kabul edenler pencere açıkken de görünsün
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme
    void loadAccepted();
    const t = setInterval(() => void loadAccepted(), 8000);
    return () => clearInterval(t);
  }, [loadAccepted]);

  async function send() {
    if (busy || (picked.length === 0 && !nearby)) return;
    setBusy(true);
    setResult(null);
    const res = await sendRoomInvites(roomId, picked, nearby);
    setBusy(false);
    if (res.error) return setError(res.error);
    setResult(res.sent > 0 ? `${res.sent} kişiye davet gönderildi.` : 'Davet gönderilecek kimse kalmadı.');
    setPicked([]);
    setNearby(false);
    void load();
  }

  return (
    <Sheet
      title="Oyuna davet et"
      subtitle="Davet, kişinin harita ekranındaki bildirim kutusuna düşer. Oda kodu davette yoktur; kodu yerinde sen söylersin."
      onClose={onClose}
    >
      {accepted.length > 0 ? (
        <>
          <Text style={styles.group}>Daveti kabul edenler</Text>
          <Text style={styles.muted}>
            {`Her birine odanın yerini tarif etmek için en çok ${ROOM_HOST_MSG_LIMIT} mesaj gönderebilirsin. Yazışmada gerçek adlar görünür.`}
          </Text>
          {accepted.map((a) => (
            <View key={a.invite_id} style={styles.row}>
              <Ionicons name="person-circle" size={22} color={colors.primary} />
              <View style={styles.acceptText}>
                <Text style={styles.name} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={styles.muted}>
                  {a.closed
                    ? a.joined
                      ? 'Odaya girdi · yazışma kapandı'
                      : 'Yazışma kapandı'
                    : `Kalan mesaj hakkın: ${a.left}${a.replies > 0 ? ` · ${a.replies} cevap` : ''}`}
                </Text>
              </View>
              {!a.closed ? (
                <Pressable
                  onPress={() => setChat(a.invite_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name} ile mesajlaş`}
                  testID="invite-host-chat"
                  style={({ pressed }) => [styles.msgBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="chatbubble-ellipses" size={15} color={colors.primaryText} />
                  <Text style={styles.msgBtnText}>Mesaj gönder</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!data && !error ? <Text style={styles.muted}>Yükleniyor…</Text> : null}
      {data ? (
        <>
          <Text style={styles.group}>Arkadaşların</Text>
          {data.friends.length === 0 ? (
            <Text style={styles.muted}>Davet almayı açmış, henüz davet etmediğin arkadaşın yok.</Text>
          ) : (
            data.friends.map((f) => {
              const on = picked.includes(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.name} numberOfLines={1}>
                    {f.name}
                  </Text>
                </Pressable>
              );
            })
          )}

          <Text style={styles.group}>Yakındakiler</Text>
          <Pressable
            onPress={() => setNearby((v) => !v)}
            disabled={data.nearby === 0}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: nearby, disabled: data.nearby === 0 }}
            style={({ pressed }) => [styles.row, nearby && styles.rowOn, pressed && styles.pressed]}
          >
            <Ionicons
              name={nearby ? 'checkbox' : 'square-outline'}
              size={22}
              color={data.nearby === 0 ? colors.border : nearby ? colors.primary : colors.textMuted}
            />
            <Text style={styles.name}>
              {data.nearby === 0
                ? 'Şu an yakında davet almayı açmış kimse yok'
                : `Yakındaki ${Math.min(data.nearby, 25)} kişiye davet gönder`}
            </Text>
          </Pressable>
          <Text style={styles.muted}>
            Yakındakilerin kim olduğu sana gösterilmez. Davette, açık odalar listesindeki gibi gerçek adın görünür;
            rumuzun görünmez.
          </Text>
          {data.sent > 0 ? (
            <Text style={styles.muted}>{`Bu odadan şimdiye kadar ${data.sent} davet gönderildi.`}</Text>
          ) : null}
          {result ? <Text style={styles.ok}>{result}</Text> : null}
          <PrimaryButton
            label="Davet gönder"
            onPress={() => void send()}
            loading={busy}
            disabled={picked.length === 0 && !nearby}
          />
        </>
      ) : null}
      {chat ? (
        <RoomInviteChat
          inviteId={chat}
          onClose={() => {
            setChat(null);
            void loadAccepted();
          }}
          onChanged={() => void loadAccepted()}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowOn: { borderWidth: 1, borderColor: colors.primary },
  pressed: { opacity: 0.8 },
  name: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  ok: { color: colors.success, fontSize: fontSizes.sm },
  acceptText: { flex: 1, gap: 2 },
  msgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  msgBtnText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 13 },
});
