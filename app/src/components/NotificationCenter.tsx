import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { FriendRequestButtons } from '@/components/FriendRequestButtons';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { ModThreadSheet } from '@/components/ModThreadSheet';
import { InviteAcceptRow, RoomInviteChat } from '@/components/RoomInviteChat';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { CloseX } from '@/components/CloseX';
import { cellName } from '@/lib/cellNames';
import { districtOf } from '@/lib/hex';
import { respondTeamInvite } from '@/lib/invites';
import { timeAgo } from '@/lib/labels';
import {
  deleteNotification,
  KIND_LABEL,
  listNotifications,
  markAllRead,
  notificationTarget,
  type AppNotification,
  type NotificationKind,
} from '@/lib/notifications';
import { refreshNotices, useNotices } from '@/lib/notices';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const KIND_ICON: Record<NotificationKind, IconName> = {
  admin_message: 'shield-checkmark',
  friend_request: 'person-add',
  system: 'information-circle',
  game_invite: 'game-controller',
  team_invite: 'people',
  mention: 'at',
  dm: 'chatbubbles',
  room_msg: 'chatbubble-ellipses',
  announcement: 'megaphone',
};

const KIND_COLOR: Record<NotificationKind, string> = {
  admin_message: colors.accent,
  friend_request: colors.primary,
  system: colors.textMuted,
  game_invite: colors.accent,
  team_invite: colors.primary,
  mention: colors.accent,
  dm: colors.primary,
  room_msg: colors.game,
  announcement: colors.primary,
};

/** Duyurunun türüne göre simge: özel etkinlik, hazine ya da genel duyuru */
function iconOf(n: AppNotification): IconName {
  if (n.kind === 'announcement') {
    if (n.data?.akind === 'treasure') return 'search';
    if (n.data?.akind === 'raffle') return 'gift';
    if (n.data?.akind === 'special_event') return 'sparkles';
  }
  return KIND_ICON[n.kind] ?? 'notifications';
}

const threadOf = (n: AppNotification): string | null =>
  n.kind === 'admin_message' && typeof n.data?.thread_id === 'string' ? n.data.thread_id : null;

/** Harita ekranının üstündeki bildirim kutusu: dokununca bildirim listesi açılır. */
export function NotificationBar({ onPress }: { onPress: () => void }) {
  const { notifications } = useNotices();
  const unread = notifications > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Bildirimler, ${notifications} yeni` : 'Bildirimler'}
      testID="notification-bar"
      style={({ pressed }) => [styles.bar, unread && styles.barUnread, pressed && styles.pressed]}
    >
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={18} color={colors.primary} />
      <Text style={styles.barText} numberOfLines={1}>
        {unread ? `Bildirimler · ${notifications} yeni` : 'Bildirimler'}
      </Text>
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{notifications > 99 ? '99+' : notifications}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Harita ekranının sağ üst köşesindeki yuvarlak bildirim düğmesi (okunmamış sayısı rozetle). */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { notifications } = useNotices();
  const unread = notifications > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Bildirimler, ${notifications} yeni` : 'Bildirimler'}
      testID="notification-bar"
      style={({ pressed }) => [styles.bell, unread && styles.bellUnread, pressed && styles.pressed]}
    >
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={22} color={colors.primary} />
      {unread ? (
        <View style={styles.bellBadge}>
          <Text style={styles.badgeText}>{notifications > 99 ? '99+' : notifications}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Bildirim listesi (ekranın ortasında açılan pencere). Açılınca hepsi okundu sayılır. */
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  /** Oyun daveti yazışması (oda sahibi ↔ daveti kabul eden) */
  const [roomChat, setRoomChat] = useState<string | null>(null);
  /** “Kopyalandı” bildirimi (oda kodu kopyalanınca 1,5 sn) */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyCode(code: string) {
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  const load = useCallback(async () => {
    const res = await listNotifications();
    setItems(res.data);
    setError(res.error);
    if (!res.error && res.data.some((n) => !n.is_read)) void markAllRead();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
    return () => {
      void refreshNotices();
    };
  }, [load]);

  function open(n: AppNotification) {
    const thread = threadOf(n);
    if (thread) return setThreadId(thread);
    const target = notificationTarget(n);
    if (!target) return;
    onClose();
    router.push(target);
  }

  async function remove(n: AppNotification) {
    setItems((prev) => (prev ? prev.filter((x) => x.id !== n.id) : prev));
    await deleteNotification(n.id);
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={styles.modalCard} testID="notification-panel">
          <View style={styles.modalHead}>
            <Ionicons name="notifications" size={20} color={colors.primary} />
            <Text style={styles.modalTitle} accessibilityRole="header">
              Bildirimler
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={18} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {items === null ? (
              <Text style={styles.muted}>Yükleniyor…</Text>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={28} color={colors.textMuted} />
                <Text style={styles.muted}>Henüz bildirimin yok.</Text>
              </View>
            ) : (
              items.map((n) => {
                const tappable = threadOf(n) !== null || notificationTarget(n) !== null;
                return (
                  <Pressable
                    key={`${n.source}-${n.id}`}
                    onPress={() => open(n)}
                    disabled={!tappable}
                    accessibilityRole={tappable ? 'button' : undefined}
                    testID="notification-row"
                    style={({ pressed }) => [styles.item, !n.is_read && styles.itemUnread, pressed && styles.pressed]}
                  >
                    <View style={[styles.iconBox, { borderColor: KIND_COLOR[n.kind] ?? colors.border }]}>
                      <Ionicons name={iconOf(n)} size={18} color={KIND_COLOR[n.kind] ?? colors.text} />
                    </View>
                    <View style={styles.itemText}>
                      <Text style={styles.kind}>
                        {`${KIND_LABEL[n.kind] ?? 'Bildirim'} · ${timeAgo(n.created_at)}`}
                        {!n.is_read ? <Text style={styles.newTag}> • yeni</Text> : null}
                      </Text>
                      <Text style={styles.itemTitle}>{n.title}</Text>
                      {n.body ? <Text style={styles.itemBody}>{n.body}</Text> : null}
                      {n.kind === 'game_invite' && typeof n.data.q === 'number' && typeof n.data.r === 'number' ? (
                        <Text style={styles.itemPlace}>
                          {`Bölge: ${cellName({ q: n.data.q, r: n.data.r })} · ${districtOf(n.data.q, n.data.r) ?? 'Kocaeli'}`}
                        </Text>
                      ) : null}
                      {typeof n.data.code === 'string' && n.data.code ? (
                        <Pressable
                          onPress={() => void copyCode(String(n.data.code))}
                          accessibilityRole="button"
                          accessibilityLabel={`Oda kodunu kopyala: ${String(n.data.code)}`}
                          testID="notification-copy-code"
                          style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.copyCode}>{String(n.data.code)}</Text>
                          <Ionicons name="copy" size={16} color={colors.primaryText} />
                          <Text style={styles.copyText}>Kopyala</Text>
                        </Pressable>
                      ) : null}
                      {n.kind === 'game_invite' && typeof n.data.room_id === 'string' ? (
                        <InviteAcceptRow roomId={n.data.room_id} onOpenChat={setRoomChat} />
                      ) : null}
                      {n.kind === 'room_msg' && typeof n.data.invite_id === 'string' ? (
                        <Pressable
                          onPress={() => setRoomChat(String(n.data.invite_id))}
                          accessibilityRole="button"
                          testID="room-msg-reply"
                          style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
                        >
                          <Ionicons name="arrow-undo" size={15} color={colors.primaryText} />
                          <Text style={styles.copyText}>{n.data.accepted ? 'Mesaj yaz' : 'Cevapla'}</Text>
                        </Pressable>
                      ) : null}
                      {n.kind === 'friend_request' && typeof n.data.request_id === 'string' ? (
                        <FriendRequestButtons requestId={n.data.request_id} />
                      ) : null}
                      {n.kind === 'team_invite' && typeof n.data.invite_id === 'string' ? (
                        <TeamInviteActions inviteId={n.data.invite_id} initial={String(n.data.status ?? 'pending')} />
                      ) : null}
                      {tappable ? (
                        <Text style={styles.open}>
                          {threadOf(n)
                            ? 'Yazışmayı aç · cevap yaz'
                            : n.kind === 'game_invite'
                              ? 'Haritada görmek için dokun'
                              : 'Görmek için dokun'}
                        </Text>
                      ) : null}
                    </View>
                    {n.source === 'personal' ? (
                      <Pressable
                        onPress={() => void remove(n)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Bildirimi sil"
                      >
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
        {copied ? (
          <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.toastText}>Kopyalandı</Text>
          </View>
        ) : null}
      </KeyboardLift>
      {/* Uyarı pencereleri (ör. “Daveti kabul et”) bildirim penceresinin önünde görünsün */}
      <DialogHost />
      {roomChat ? (
        <RoomInviteChat
          inviteId={roomChat}
          onClose={() => {
            setRoomChat(null);
            void load();
          }}
        />
      ) : null}
      {threadId ? (
        <ModThreadSheet
          threadId={threadId}
          onClose={() => {
            setThreadId(null);
            void load();
          }}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellUnread: { borderColor: colors.primary },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  modalCard: {
    maxHeight: '82%',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  modalScroll: { flexGrow: 0 },
  modalContent: { gap: spacing.sm },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  barUnread: { borderColor: colors.primary },
  barText: { color: colors.text, fontFamily: fonts.semi, fontSize: 13, flexShrink: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  copyCode: { color: colors.primaryText, fontFamily: fonts.black, fontSize: fontSizes.md, letterSpacing: 2 },
  copyText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 12 },
  toast: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  itemUnread: { borderWidth: 1, borderColor: colors.primary },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, gap: 2 },
  kind: { color: colors.textMuted, fontSize: 11 },
  newTag: { color: colors.primary, fontWeight: '800' },
  itemTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  itemBody: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  open: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  itemPlace: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  inviteBox: { gap: spacing.sm, marginTop: spacing.sm },
  inviteBtns: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  answered: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
});

/** Ekip davetine yanıt: kabulde iletişim bilgisi istenir; yalnızca daveti gönderene iletilir. */
function TeamInviteActions({ inviteId, initial }: { inviteId: string; initial: string }) {
  const [status, setStatus] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (busy) return;
    if (accept && contact.trim().length < 3) return setError('İletişim bilgisini yaz (en az 3 karakter).');
    setBusy(true);
    setError(null);
    const res = await respondTeamInvite(inviteId, accept, accept ? contact.trim() : undefined);
    setBusy(false);
    if (res.error) return setError(res.error);
    setStatus(accept ? 'accepted' : 'declined');
  }

  if (status === 'accepted') return <Text style={styles.answered}>Kabul ettin; iletişim bilgin gönderildi.</Text>;
  if (status === 'declined') return <Text style={styles.answered}>Reddettin.</Text>;
  if (status !== 'pending') return <Text style={styles.answered}>Bu davet artık geçerli değil.</Text>;
  return (
    <View style={styles.inviteBox}>
      {asking ? (
        <>
          <TextField
            label="İletişim bilgin (telefon ya da sosyal medya)"
            icon="call-outline"
            value={contact}
            onChangeText={setContact}
            maxLength={200}
            placeholder="Ör. 05xx xxx xx xx ya da @kullaniciadi"
          />
          <Text style={styles.kind}>Bu bilgi yalnızca daveti gönderen kişiye bildirim olarak iletilir.</Text>
          <PrimaryButton label="Kabul et ve gönder" onPress={() => void respond(true)} loading={busy} />
          <PrimaryButton label="Vazgeç" variant="ghost" onPress={() => setAsking(false)} disabled={busy} />
        </>
      ) : (
        <View style={styles.inviteBtns}>
          <View style={styles.flex}>
            <PrimaryButton label="Kabul et" onPress={() => setAsking(true)} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Reddet" variant="ghost" onPress={() => void respond(false)} loading={busy} />
          </View>
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
