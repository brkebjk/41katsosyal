import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Animated, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  closeDialog,
  getSnapshot,
  registerHost,
  subscribe,
  type DialogRequest,
  type DialogTone,
} from '@/lib/dialog';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const TONES: Record<DialogTone, { tint: string; icon: string }> = {
  default: { tint: 'rgba(255, 176, 32, 0.14)', icon: colors.primary },
  danger: { tint: 'rgba(255, 92, 122, 0.15)', icon: colors.danger },
  friend: { tint: 'rgba(124, 92, 255, 0.2)', icon: '#A593FF' },
  success: { tint: 'rgba(52, 211, 153, 0.15)', icon: colors.success },
};

/**
 * Uyarı pencerelerini çizer. Ekranların üstüne biner (Modal açmaz). Kök düzende bir tane vardır;
 * ayrıca kendi penceresi olan ekranların (gönderi ayrıntısı, etkinlik formu…) içine de konur ki
 * uyarı o pencerenin önünde görünsün. Birden fazla varsa yalnızca en üsttekiler çizer.
 */
export function DialogHost() {
  const id = useId();
  useEffect(() => registerHost(id), [id]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const active = snap.hosts[snap.hosts.length - 1] === id;
  const request = snap.queue[0];
  if (!active || !request) return null;
  return <DialogView key={request.id} request={request} />;
}

function DialogView({ request }: { request: DialogRequest }) {
  const tone = TONES[request.tone];
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: native }).start();
  }, [fade]);

  // Android Geri tuşu pencereyi kapatır (vazgeçmiş sayılır)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDialog(request.id, request.cancelValue);
      return true;
    });
    return () => sub.remove();
  }, [request.id, request.cancelValue]);

  const scale = fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <View style={styles.root} accessibilityViewIsModal testID="app-dialog">
      <Pressable
        style={styles.backdrop}
        onPress={() => closeDialog(request.id, request.cancelValue)}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      />
      <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
        <View style={[styles.badge, { backgroundColor: tone.tint }]}>
          <Ionicons name={request.icon} size={24} color={tone.icon} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {request.title}
        </Text>
        {/* Uzun metin ekrandan taşmasın: metin kaydırılır, başlık ve düğmeler hep görünür */}
        {request.message || request.warning ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
            {request.warning ? (
              <View style={styles.warning} testID="dialog-warning" accessibilityRole="alert">
                <Ionicons name="warning" size={16} color={colors.danger} />
                <Text style={styles.warningText}>{request.warning}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
        <View style={styles.buttons}>
          {request.buttons.map((b) => (
            <Pressable
              key={b.label}
              onPress={() => closeDialog(request.id, b.value)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                b.style === 'primary' && styles.buttonPrimary,
                b.style === 'danger' && styles.buttonDanger,
                (b.style ?? 'ghost') === 'ghost' && styles.buttonGhost,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  b.style === 'primary' && { color: colors.primaryText },
                  b.style === 'danger' && { color: '#2A0510' },
                  (b.style ?? 'ghost') === 'ghost' && { color: colors.text },
                ]}
              >
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  scroll: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: spacing.md },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 19,
    textAlign: 'left',
  },
  warning: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 92, 122, 0.12)',
  },
  warningText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fonts.semi,
    fontSize: fontSizes.xs,
    lineHeight: 17,
  },
  buttons: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  button: {
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { borderWidth: 1.5, borderColor: colors.border },
  pressed: { opacity: 0.8 },
  buttonText: { fontFamily: fonts.semi, fontSize: fontSizes.sm, textAlign: 'center' },
});
