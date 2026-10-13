import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { NotificationPrefsForm } from '@/components/NotificationPrefsForm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { askNotificationPermission, hasNotificationPermission, syncEventReminders } from '@/lib/localNotify';
import { getNotifyPrefs, saveNotifyPrefs, type NotifyPrefs } from '@/lib/notifyPrefs';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Perms = { notify: boolean; location: boolean; locationCanAsk: boolean };

async function readPerms(): Promise<Perms> {
  let location = false;
  let locationCanAsk = true;
  try {
    const p = await Location.getForegroundPermissionsAsync();
    location = p.granted;
    locationCanAsk = p.canAskAgain;
  } catch {
    // okunamazsa kapalı say
  }
  return { notify: await hasNotificationPermission(), location, locationCanAsk };
}

/** Profil → Hesabım → Bildirim ve konum: bildirim türleri (sunucuda saklanır) ve telefonun izinleri. */
export function NotificationSettingsSheet({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<Perms | null>(null);
  const saveSeq = useRef(0);

  const loadPerms = useCallback(async () => setPerms(await readPerms()), []);

  useEffect(() => {
    let alive = true;
    void getNotifyPrefs().then((res) => {
      if (!alive) return;
      setPrefs(res.data);
      setError(res.error);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- izin durumu telefondan okunup yazılır
    void loadPerms();
    // Telefon ayarlarından dönünce izin durumu yenilenir
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void loadPerms();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [loadPerms]);

  async function change(next: NotifyPrefs) {
    const prev = prefs;
    setPrefs(next);
    setError(null);
    setSaving(true);
    const my = ++saveSeq.current;
    const res = await saveNotifyPrefs(next);
    if (my !== saveSeq.current) return;
    setSaving(false);
    if (res.error) {
      setPrefs(prev);
      return setError(res.error);
    }
    if (res.data) setPrefs(res.data);
    void syncEventReminders();
  }

  async function allowNotify() {
    const ok = await askNotificationPermission();
    if (!ok) await Linking.openSettings();
    void loadPerms();
    void syncEventReminders();
  }

  async function allowLocation() {
    try {
      if (perms?.locationCanAsk) {
        const p = await Location.requestForegroundPermissionsAsync();
        if (!p.granted && !p.canAskAgain) await Linking.openSettings();
      } else {
        await Linking.openSettings();
      }
    } catch {
      await Linking.openSettings();
    }
    void loadPerms();
  }

  return (
    <Sheet
      title="Bildirim ve konum"
      subtitle="Hangi bildirimlerin geleceğini seç. Değişiklik hemen kaydedilir."
      onClose={onClose}
    >
      {prefs ? (
        <NotificationPrefsForm value={prefs} onChange={(n) => void change(n)} />
      ) : (
        <Text style={styles.muted}>{error ?? 'Yükleniyor…'}</Text>
      )}
      {prefs && error ? <Text style={styles.error}>{error}</Text> : null}
      {saving ? <Text style={styles.muted}>Kaydediliyor…</Text> : null}

      <Text style={styles.section}>Telefon izinleri</Text>
      <PermRow
        icon="notifications"
        title="Bildirim izni"
        on={perms?.notify ?? false}
        onText="Açık · etkinlik hatırlatmaları telefonuna gelir"
        offText="Kapalı · etkinlik hatırlatmaları gelmez"
        action={perms && !perms.notify ? { label: 'İzin ver', onPress: () => void allowNotify() } : null}
      />
      <PermRow
        icon="location"
        title="Konum izni"
        on={perms?.location ?? false}
        onText="Uygulamayı kullanırken açık · sürekli takip yok"
        offText="Kapalı · her konum isteğinden önce sorulur"
        action={perms && !perms.location ? { label: 'İzin ver', onPress: () => void allowLocation() } : null}
      />
      <Text style={styles.muted}>
        Konumuna yalnızca sen bir şey yaparken bir kez bakılır; tam konumun kaydedilmez (yan yana oyuna girerken yalnızca
        ~100 metre yakınlık kontrolü için bir kez kullanılır). İzinleri telefonunun
        ayarlarından istediğin zaman kapatabilirsin.
      </Text>
    </Sheet>
  );
}

function PermRow({
  icon,
  title,
  on,
  onText,
  offText,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  on: boolean;
  onText: string;
  offText: string;
  action: { label: string; onPress: () => void } | null;
}) {
  return (
    <View style={styles.perm}>
      <Ionicons name={icon} size={18} color={on ? colors.success : colors.textMuted} />
      <View style={styles.permText}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permSub}>{on ? onText : offText}</Text>
      </View>
      {action ? (
        <View style={styles.permBtn}>
          <PrimaryButton label={action.label} variant="ghost" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 16, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  section: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, marginTop: spacing.sm },
  perm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  permText: { flex: 1, gap: 1 },
  permTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  permSub: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  permBtn: { width: 96 },
});
