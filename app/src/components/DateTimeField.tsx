import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HelpLabel } from '@/components/HelpLabel';
import { DAY_SHORT, MONTH_SHORT, formatWhen } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  label: string;
  value: Date | null;
  onChange: (next: Date) => void;
  /** Kaç gün ileriye kadar seçilebilsin */
  days?: number;
  /** Başlığın yanındaki “?” ile baloncukta açılan açıklama */
  help?: string;
  /** Daha alçak kutu */
  compact?: boolean;
  /** Zorunlu alan boş: kırmızı çerçeve */
  invalid?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const HOUR_CHIP_WIDTH = 48;
const pad2 = (n: number) => String(n).padStart(2, '0');

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Tarih ve saat seçici. Telefonun kendi seçicisi yerine uygulamanın içinde, parmakla
 * kaydırılan günler ve saat düğmeleriyle çalışır; böylece iPhone, Android ve web'de aynıdır.
 */
export function DateTimeField({ label, value, onChange, days = 45, help, compact = false, invalid = false }: Props) {
  const [open, setOpen] = useState(false);
  const hourScroll = useRef<ScrollView>(null);
  const hourScrolled = useRef(false);
  const today = useMemo(() => startOfDay(new Date()), []);
  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)),
    [today, days],
  );

  const selectedDay = value ? startOfDay(value) : null;
  const hour = value ? value.getHours() : null;
  const minute = value ? value.getMinutes() : 0;
  const now = new Date();

  function emit(day: Date, h: number, m: number) {
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0));
  }

  function pickDay(day: Date) {
    // Gün seçilince saat yoksa makul bir varsayılan (20:00) atanır
    emit(day, hour ?? 20, minute);
  }

  // Saat listesi ilk açıldığında akşam saatlerine (ya da seçili saate) kaydırılır
  function scrollHoursIntoView() {
    if (hourScrolled.current) return;
    hourScrolled.current = true;
    const target = Math.max(0, (hour ?? 18) - 1);
    hourScroll.current?.scrollTo({ x: target * (HOUR_CHIP_WIDTH + 8), y: 0, animated: false });
  }

  const isToday = (d: Date) => d.getTime() === today.getTime();
  const hourDisabled = (h: number) => selectedDay !== null && isToday(selectedDay) && h < now.getHours();

  return (
    <View style={styles.wrap}>
      {help ? <HelpLabel label={label} help={help} /> : <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={() => {
          hourScrolled.current = false;
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatWhen(value) : 'seçilmedi'}`}
        style={[styles.box, compact && styles.boxCompact, open && styles.boxOpen, invalid && styles.boxInvalid]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.boxText, !value && styles.placeholder]}>
          {value ? formatWhen(value) : 'Tarih ve saat seç'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Gün</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {dayList.map((d, i) => {
              const selected = selectedDay?.getTime() === d.getTime();
              return (
                <Pressable
                  key={d.getTime()}
                  onPress={() => pickDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`}
                  style={[styles.dayChip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.dayName, selected && styles.chipTextSelected]}>
                    {i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DAY_SHORT[d.getDay()]}
                  </Text>
                  <Text style={[styles.dayNum, selected && styles.chipTextSelected]}>{d.getDate()}</Text>
                  <Text style={[styles.dayMonth, selected && styles.chipTextSelected]}>
                    {MONTH_SHORT[d.getMonth()]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.panelTitle}>Saat</Text>
          <ScrollView
            ref={hourScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            onContentSizeChange={scrollHoursIntoView}
          >
            {HOURS.map((h) => {
              const selected = hour === h;
              const disabled = hourDisabled(h) || !selectedDay;
              return (
                <Pressable
                  key={h}
                  disabled={disabled}
                  onPress={() => selectedDay && emit(selectedDay, h, minute)}
                  accessibilityRole="button"
                  accessibilityLabel={`Saat ${pad2(h)}`}
                  accessibilityState={{ selected, disabled }}
                  style={[styles.timeChip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
                >
                  <Text style={[styles.timeText, selected && styles.chipTextSelected]}>{pad2(h)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.panelTitle}>Dakika</Text>
          <View style={styles.row}>
            {MINUTES.map((m) => {
              const selected = minute === m && value !== null;
              const disabled = !selectedDay || hour === null;
              return (
                <Pressable
                  key={m}
                  disabled={disabled}
                  onPress={() => selectedDay && hour !== null && emit(selectedDay, hour, m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Dakika ${pad2(m)}`}
                  accessibilityState={{ selected, disabled }}
                  style={[styles.timeChip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
                >
                  <Text style={[styles.timeText, selected && styles.chipTextSelected]}>{pad2(m)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={styles.done}>
            <Text style={styles.doneText}>Tamam</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  boxOpen: { borderColor: colors.primary },
  boxCompact: { minHeight: 40, paddingHorizontal: spacing.sm + 2 },
  boxInvalid: { borderColor: colors.danger, borderWidth: 2 },
  boxText: { flex: 1, color: colors.text, fontSize: fontSizes.md },
  placeholder: { color: colors.textMuted },
  panel: {
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  panelTitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  dayChip: {
    width: 62,
    alignItems: 'center',
    gap: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayName: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  dayNum: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  dayMonth: { color: colors.textMuted, fontSize: 11 },
  timeChip: {
    width: HOUR_CHIP_WIDTH,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextSelected: { color: colors.primaryText },
  chipDisabled: { opacity: 0.3 },
  done: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  doneText: { color: colors.primary, fontWeight: '800', fontSize: fontSizes.sm },
});
