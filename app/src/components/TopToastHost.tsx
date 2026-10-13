import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { RoomInviteChat } from '@/components/RoomInviteChat';
import { notificationTarget } from '@/lib/notifications';
import { showToast, useToast } from '@/lib/topToast';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SHOW_MS = 5000;
const stamp = () => String(Date.now());

function iconFor(kind: string, akind: unknown): IconName {
  if (kind === 'announcement')
    return akind === 'treasure' ? 'search' : akind === 'special_event' ? 'sparkles' : 'megaphone';
  if (kind === 'admin_message') return 'shield-checkmark';
  if (kind === 'friend_request') return 'person-add';
  if (kind === 'game_invite') return 'game-controller';
  if (kind === 'team_invite') return 'people';
  if (kind === 'mention') return 'at';
  if (kind === 'room_msg') return 'chatbubble-ellipses';
  return 'notifications';
}

/** Ekranın üstünden kayan bildirim. Birkaç saniye sonra kendiliğinden kapanır; dokununca ilgili yer açılır. */
export function TopToastHost() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(-160));
  /** Oda sahibine gelen oda yazışması: bulunduğu ekrandan (ör. oyun ekranı) çıkmadan yazışma penceresi açılır */
  const [hostChat, setHostChat] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    y.setValue(-160);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    const t = setTimeout(() => {
      Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: true }).start(() => showToast(null));
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [toast, y]);

  const chatNode = hostChat ? <RoomInviteChat inviteId={hostChat} onClose={() => setHostChat(null)} /> : null;
  if (!toast) return chatNode;

  function open() {
    if (!toast) return;
    showToast(null);
    // Oda sahibi: oyun ekranından çıkarılmaz, yazışma olduğu yerde açılır
    if (toast.kind === 'room_msg' && toast.data.role === 'host' && typeof toast.data.invite_id === 'string') {
      setHostChat(toast.data.invite_id);
      return;
    }
    const target = notificationTarget(toast);
    if (target) router.push(target);
    else router.push({ pathname: '/', params: { bell: stamp() } });
  }

  return (
    <>
      {chatNode}
      <Animated.View style={[styles.wrap, { top: insets.top + 6, transform: [{ translateY: y }] }]}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`Yeni bildirim: ${toast.title}`}
          testID="top-toast"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name={iconFor(toast.kind, toast.data.akind)} size={20} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {toast.title}
            </Text>
            {toast.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {toast.body}
              </Text>
            ) : null}
            {toast.more > 0 ? <Text style={styles.more}>{`+${toast.more} yeni bildirim daha`}</Text> : null}
          </View>
          <Pressable
            onPress={() => showToast(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Bildirimi kapat"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    elevation: 100,
    pointerEvents: 'box-none',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  pressed: { opacity: 0.85 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  text: { flex: 1, gap: 1 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  body: { color: colors.text, fontSize: 12, lineHeight: 16 },
  more: { color: colors.primary, fontSize: 11, fontFamily: fonts.semi },
});
