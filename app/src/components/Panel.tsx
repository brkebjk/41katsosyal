import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NoticeDot } from '@/components/NoticeDot';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Tek bir yüzey üzerinde, ince çizgilerle ayrılmış satırlar. Her bilgi için ayrı kutu çizmek yerine
 * ilgili satırları bir arada tutar; ekran daha sade ve derli toplu görünür.
 */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) =>
    isValidElement(c) && c.type === Fragment ? flatten((c.props as { children?: ReactNode }).children) : [c],
  );
}

export function Panel({ children, title, hint }: { children: ReactNode; title?: string; hint?: string }) {
  const items = flatten(children).filter(Boolean);
  return (
    <View style={styles.wrap}>
      {title ? (
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      ) : null}
      <View style={styles.panel}>
        {items.map((child, i) => (
          <View key={i} style={i > 0 ? styles.divided : undefined}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

type RowProps = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Sağ tarafta kısa değer ("3/5", "Düzenle" gibi) */
  value?: string;
  /** Verilirse satır dokunulabilir olur ve sağda ok görünür */
  onPress?: () => void;
  tone?: 'default' | 'danger' | 'accent';
  /** Başlığın altına konacak ek içerik (ör. ilerleme çubuğu) */
  footer?: ReactNode;
  accessibilityLabel?: string;
  /** Satırın ikonunun köşesinde kırmızı nokta çıkar (sayı verilirse içinde sayı yazar, 0 ise nokta yoktur) */
  dot?: number;
};

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  tone = 'default',
  footer,
  accessibilityLabel,
  dot,
}: RowProps) {
  const iconColor = tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.primary;
  const body = (
    <>
      <View style={styles.rowTop}>
        {icon ? (
          <View style={[styles.iconBox, tone === 'danger' && styles.iconBoxDanger]}>
            <Ionicons name={icon} size={18} color={iconColor} />
            {dot && dot > 0 ? (
              <NoticeDot size={12} ringColor={colors.surface} style={styles.rowDot} testID="row-dot" />
            ) : null}
          </View>
        ) : null}
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, tone === 'danger' && styles.rowTitleDanger]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
        </View>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

/** İnce ilerleme çubuğu (0–1). */
export function Meter({ value, color = colors.primary }: { value: number; color?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={styles.meter}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { gap: 2, paddingHorizontal: spacing.xs },
  title: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.md },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  panel: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  divided: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 176, 32, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDot: { position: 'absolute', top: -3, right: -3 },
  iconBoxDanger: { backgroundColor: 'rgba(255, 92, 122, 0.12)' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  rowTitleDanger: { color: colors.danger },
  rowSub: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 19 },
  rowValue: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  footer: { paddingLeft: 34 + spacing.md },
  meter: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: radii.pill },
});
