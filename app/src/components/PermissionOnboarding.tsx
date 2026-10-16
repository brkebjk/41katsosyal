import Ionicons from '@expo/vector-icons/Ionicons';
import { reloadAppAsync } from 'expo';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { NotificationPrefsForm } from '@/components/NotificationPrefsForm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { askNotificationPermission, syncEventReminders } from '@/lib/localNotify';
import { ALL_ON, getNotifyPrefs, saveNotifyPrefs, type NotifyPrefs } from '@/lib/notifyPrefs';
import {
  colors,
  fonts,
  fontSizes,
  hasThemePref,
  isLight,
  prefIsLight,
  radii,
  saveThemePref,
  spacing,
  type ThemePref,
} from '@/theme';

const flagKey = (userId: string) => `peoplehere_perm_onboard_v1_${userId.replace(/[^A-Za-z0-9_-]/g, '')}`;

async function isDone(userId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(flagKey(userId))) === '1';
  } catch {
    return true; // depo okunamıyorsa üyeyi her açılışta rahatsız etmeyelim
  }
}

async function markDone(userId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(flagKey(userId), '1');
  } catch {
    // yok say
  }
}

/**
 * Kayıttan sonra / bu telefonda ilk girişte bir kez: önce bildirim türleri ve bildirim izni, sonra konum izni
 * (“uygulamayı kullanırken”). İkisi de atlanabilir; tercihler sonra Profil → Hesabım'dan değiştirilir.
 * Uygulama indirildikten sonraki ilk girişte (telefonda hiç tema seçilmediyse) en sonda tema sorulur; varsayılan açık tema.
 */
export function PermissionOnboarding({ userId }: { userId: string }) {
  const [step, setStep] = useState<'checking' | 'notify' | 'location' | 'theme' | 'done'>('checking');
  // Tema yalnızca bu telefonda hiç seçilmediyse sorulur (ilk kurulum)
  const [askTheme] = useState(() => !hasThemePref());
  const total = askTheme ? 3 : 2;

  useEffect(() => {
    let alive = true;
    void isDone(userId).then((done) => {
      if (alive) setStep(done || Platform.OS === 'web' ? 'done' : 'notify');
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (step === 'checking' || step === 'done') return null;

  async function finish() {
    await markDone(userId);
    setStep('done');
  }

  function afterLocation() {
    if (askTheme) setStep('theme');
    else void finish();
  }

  return (
    <View style={styles.root} testID="permission-onboarding">
      {step === 'notify' ? (
        <NotifyStep total={total} onNext={() => setStep('location')} />
      ) : step === 'location' ? (
        <LocationStep total={total} onNext={afterLocation} />
      ) : (
        <ThemeStep total={total} onNext={() => void finish()} />
      )}
    </View>
  );
}

function Shell({
  icon,
  title,
  step,
  children,
  footer,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  step: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.shell, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.step}>{step}</Text>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={34} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

function NotifyStep({ total, onNext }: { total: number; onNext: () => void }) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(ALL_ON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getNotifyPrefs().then((res) => {
      if (alive && res.data) setPrefs(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save(askOs: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveNotifyPrefs(prefs);
    if (res.error) {
      setBusy(false);
      return setError(res.error);
    }
    if (askOs) {
      await askNotificationPermission();
      void syncEventReminders();
    }
    setBusy(false);
    onNext();
  }

  return (
    <Shell
      icon="notifications"
      title="Hangi bildirimleri istersin?"
      step={`1 / ${total}`}
      footer={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="İzin ver ve devam et" onPress={() => void save(true)} loading={busy} />
          <PrimaryButton label="Şimdi değil" variant="ghost" onPress={() => void save(false)} disabled={busy} />
        </>
      }
    >
      <Text style={styles.lead}>
        Oyun davetlerini, özel etkinlikleri ve sana gelen istekleri kaçırma. İstediğin türü kapatabilirsin; bunu sonra
        Profil → Hesabım → “Bildirim ve konum” bölümünden de değiştirebilirsin.
      </Text>
      <NotificationPrefsForm value={prefs} onChange={setPrefs} disabled={busy} />
    </Shell>
  );
}

function LocationStep({ total, onNext }: { total: number; onNext: () => void }) {
  const [busy, setBusy] = useState(false);

  async function allow() {
    if (busy) return;
    setBusy(true);
    try {
      const now = await Location.getForegroundPermissionsAsync();
      if (!now.granted && now.canAskAgain) await Location.requestForegroundPermissionsAsync();
    } catch {
      // izin penceresi açılamazsa geçilir
    }
    setBusy(false);
    onNext();
  }

  return (
    <Shell
      icon="location"
      title="Konum izni"
      step={`2 / ${total}`}
      footer={
        <>
          <PrimaryButton label="Konum iznini ver" onPress={() => void allow()} loading={busy} />
          <PrimaryButton label="Şimdi değil" variant="ghost" onPress={onNext} disabled={busy} />
        </>
      }
    >
      <Text style={styles.lead}>
        Telefonun soracak: <Text style={styles.strong}>“Uygulamayı kullanırken”</Text> seçeneğini seç.
      </Text>
      <View style={styles.list}>
        <Bullet icon="eye-off" text="Sürekli takip yok. Uygulama kapalıyken ya da arka plandayken konumuna hiç bakılmaz." />
        <Bullet
          icon="hand-left"
          text="Konumuna yalnızca sen bir şey yaparken bir kez bakılır: oyuna girerken, etkinlik kodu girerken, hazine ararken, gönderiye yer eklerken."
        />
        <Bullet
          icon="lock-closed"
          text="Tam konumun kaydedilmez; çoğu yerde yalnızca bulunduğun peteğin numarası kullanılır. Yalnızca yan yana oyuna girerken, oda sahibine ~100 metre yakın olduğunu kontrol etmek için kesin konumun bir kez kullanılır."
        />
        <Bullet icon="flash" text="İzin verirsen her seferinde ayrıca “konumuna bakacağım” uyarısı görmezsin." />
      </View>
      <Text style={styles.small}>İzni istediğin zaman telefonunun ayarlarından kapatabilirsin.</Text>
    </Shell>
  );
}

const THEMES: { key: ThemePref; label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'light', label: 'Açık', sub: 'Aydınlık zemin (varsayılan)', icon: 'sunny' },
  { key: 'dark', label: 'Koyu', sub: 'Gece için koyu zemin', icon: 'moon' },
  { key: 'system', label: 'Telefonun ayarı', sub: 'Telefon açıksa açık, koyuysa koyu', icon: 'phone-portrait' },
];

/** İlk kurulumda tema tercihi. Seçim telefonda saklanır; görünüm değişecekse uygulama bir kez yeniden başlar. */
function ThemeStep({ total, onNext }: { total: number; onNext: () => void }) {
  const [pick, setPick] = useState<ThemePref>('light');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    saveThemePref(pick);
    const changes = prefIsLight(pick) !== isLight;
    onNext();
    if (!changes) return;
    try {
      await reloadAppAsync('Tema seçildi');
    } catch {
      // yeniden başlatılamazsa tema uygulama bir sonraki açılışta görünür
    }
  }

  return (
    <Shell
      icon="color-palette"
      title="Hangi görünümü istersin?"
      step={`${total} / ${total}`}
      footer={<PrimaryButton label="Kaydet ve başla" onPress={() => void save()} loading={busy} />}
    >
      <Text style={styles.lead}>Bunu sonra Profil → Tercihler bölümünden istediğin zaman değiştirebilirsin.</Text>
      <View style={styles.themeList}>
        {THEMES.map((t) => {
          const on = pick === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setPick(t.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              testID={`onboard-theme-${t.key}`}
              style={[styles.themeRow, on && styles.themeRowOn]}
            >
              <Ionicons name={t.icon} size={22} color={on ? colors.primary : colors.textMuted} />
              <View style={styles.themeText}>
                <Text style={styles.themeLabel}>{t.label}</Text>
                <Text style={styles.themeSub}>{t.sub}</Text>
              </View>
              <Ionicons
                name={on ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={on ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    </Shell>
  );
}

function Bullet({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={16} color={colors.primary} style={styles.bulletIcon} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, elevation: 90 },
  shell: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  step: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi, textAlign: 'center' },
  iconCircle: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  lead: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  strong: { fontFamily: fonts.extra, color: colors.primary },
  list: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface },
  bullet: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletIcon: { marginTop: 2 },
  bulletText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  small: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
  themeList: { gap: spacing.sm },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  themeRowOn: { borderColor: colors.primary },
  themeText: { flex: 1, gap: 2 },
  themeLabel: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  themeSub: { color: colors.textMuted, fontSize: fontSizes.xs },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
});
