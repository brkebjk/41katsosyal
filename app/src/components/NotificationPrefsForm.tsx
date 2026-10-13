import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PREF_ITEMS, type NotifyPrefKey, type NotifyPrefs } from '@/lib/notifyPrefs';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  value: NotifyPrefs;
  onChange: (next: NotifyPrefs) => void;
  disabled?: boolean;
};

/** Bildirim türleri: en üstte “Tümü”, altında her tür için ayrı aç/kapa. */
export function NotificationPrefsForm({ value, onChange, disabled = false }: Props) {
  const keys = PREF_ITEMS.map((p) => p.key);
  const allOn = keys.every((k) => value[k]);

  function setAll(on: boolean) {
    const next = { ...value };
    keys.forEach((k) => (next[k] = on));
    onChange(next);
  }

  function setOne(key: NotifyPrefKey, on: boolean) {
    onChange({ ...value, [key]: on });
  }

  return (
    <View style={styles.box}>
      <Row
        icon="notifications"
        title="Tümü"
        subtitle={allOn ? 'Bütün bildirim türleri açık' : 'Hepsini bir kerede aç ya da kapat'}
        on={allOn}
        onToggle={setAll}
        disabled={disabled}
        strong
      />
      {PREF_ITEMS.map((p) => (
        <Row
          key={p.key}
          icon={p.icon}
          title={p.title}
          subtitle={p.subtitle}
          on={value[p.key]}
          onToggle={(on) => setOne(p.key, on)}
          disabled={disabled}
        />
      ))}
      <Text style={styles.note}>
        Moderatör mesajları, duyurular ve hesabınla ilgili sistem mesajları her zaman gelir.
      </Text>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  on,
  onToggle,
  disabled,
  strong = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  disabled: boolean;
  strong?: boolean;
}) {
  return (
    <View style={[styles.row, strong && styles.rowStrong]}>
      <Ionicons name={icon} size={18} color={on ? colors.primary : colors.textMuted} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowStrong: { borderWidth: 1, borderColor: colors.primary },
  text: { flex: 1, gap: 1 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  subtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 2 },
});
