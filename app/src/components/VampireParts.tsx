import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ROLES, type VvPlayer, type VvRole, type VvView } from '@/lib/vampire';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Rolün adını rolün rengiyle gösteren küçük etiket. */
export function RoleChip({ role }: { role: VvRole }) {
  const info = ROLES[role];
  return (
    <View style={[styles.chip, { borderColor: info.color }]}>
      <Text style={[styles.chipText, { color: info.color }]}>{info.name}</Text>
    </View>
  );
}

/** Başlıklı, çerçeveli bilgi kutusu. */
export function InfoCard({
  title,
  children,
  tone = 'default',
}: {
  title?: string;
  children: ReactNode;
  tone?: 'default' | 'danger' | 'success' | 'accent';
}) {
  return (
    <View style={[styles.card, tone !== 'default' && { borderColor: toneColor[tone] }]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={styles.cardText}>{children}</Text> : children}
    </View>
  );
}

const toneColor = {
  danger: colors.danger,
  success: colors.success,
  accent: colors.accent,
} as const;

/**
 * Verilen andan (`since`, ms) beri geçen saniyeyi sayar; `active` iken saniyede bir güncellenir.
 * Sunucu "aşama kaç sn önce başladı" der, ekran da cevabı aldığı andan beri sayarak süreyi akıtır.
 */
export function useElapsedSeconds(since: number, active: boolean): number {
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, now - since) / 1000;
}

/** "0:42" biçiminde süre. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Otomatik oyunda aşamanın kalan süresi: yazı ve azalan çubuk. */
export function PhaseClock({
  label,
  limit,
  age,
  elapsed,
}: {
  label: string;
  limit: number;
  age: number;
  elapsed: number;
}) {
  const left = Math.max(0, limit - age - elapsed);
  const ratio = limit > 0 ? Math.min(1, left / limit) : 0;
  return (
    <View
      style={styles.progress}
      accessibilityLabel={`${label}: ${clock(left)}`}
      accessibilityLiveRegion="none"
    >
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>
          {left > 0 ? label : 'Süre doldu, sıradaki aşamaya geçiliyor…'}
        </Text>
        <Text style={styles.progressCount}>{clock(left)}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

/** Bir şeyin ne kadarının tamamlandığını gösteren ince çubuk ve "3 / 5" yazısı. */
export function ProgressLine({ label, done, total }: { label: string; done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View style={styles.progress} accessibilityLabel={`${label}: ${done} / ${total}`}>
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressCount}>
          {done} / {total}
        </Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

/** "Oda sahibi" etiketi (katılımcı listelerinde odayı açan kişinin yanında görünür). */
export function HostChip() {
  return (
    <View style={styles.hostChip}>
      <Text style={styles.hostChipText}>Oda sahibi</Text>
    </View>
  );
}

/**
 * Oyuncu listesi: sağ kalanlar, elenenler, roller (görmeye hakkın varsa) ve isteğe bağlı durum simgesi.
 * Odayı açan kişi her zaman "Oda sahibi" etiketiyle görünür; oyuncu olarak katılmamışsa (ör. anlatıcı moderatör)
 * listenin başına ayrı bir satır olarak eklenir.
 */
export function PlayerList({
  players,
  status,
  showAlive = true,
  host,
}: {
  players: VvPlayer[];
  /** Satırın sağında gösterilecek ek durum (ör. "oy verdi" onay işareti) */
  status?: (p: VvPlayer) => ReactNode;
  showAlive?: boolean;
  /** Odanın sahibi. Oyuncular arasında yoksa listenin başında ayrı satır olarak gösterilir. */
  host?: VvView['host'];
}) {
  const extraHost = host && !players.some((p) => p.id === host.id) ? host : null;
  return (
    <View style={styles.list}>
      {extraHost ? (
        <View style={styles.playerRow}>
          <View style={styles.initial}>
            <Ionicons name="star" size={16} color={colors.primary} />
          </View>
          <View style={styles.playerText}>
            <View style={styles.nameLine}>
              <Text style={styles.playerName} numberOfLines={1}>
                {extraHost.name}
              </Text>
              {extraHost.is_me ? <Text style={styles.me}>Sen</Text> : null}
              <HostChip />
            </View>
            {extraHost.is_moderator ? <Text style={styles.deadText}>Anlatıcı · oyuncu değil</Text> : null}
          </View>
        </View>
      ) : null}
      {players.map((p, i) => (
        <View key={p.id} style={[styles.playerRow, (i > 0 || extraHost) && styles.divider]}>
          <View style={[styles.initial, !p.is_alive && showAlive && styles.initialDead]}>
            <Text style={styles.initialText}>{p.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.playerText}>
            <View style={styles.nameLine}>
              <Text
                style={[styles.playerName, !p.is_alive && showAlive && styles.playerNameDead]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              {p.is_me ? <Text style={styles.me}>Sen</Text> : null}
              {p.is_host ? <HostChip /> : null}
            </View>
            {!p.is_alive && showAlive ? (
              <Text style={styles.deadText}>{p.left ? 'Oyundan ayrıldı' : 'Elendi'}</Text>
            ) : null}
          </View>
          {p.role ? <RoleChip role={p.role} /> : null}
          {status ? status(p) : null}
        </View>
      ))}
    </View>
  );
}

export function CheckMark({ on, label }: { on: boolean | null | undefined; label: string }) {
  return (
    <Ionicons
      name={on ? 'checkmark-circle' : 'ellipse-outline'}
      size={20}
      color={on ? colors.success : colors.border}
      accessibilityLabel={`${label}: ${on ? 'evet' : 'hayır'}`}
    />
  );
}

export type PickOption = { id: string; name: string; note?: string; disabled?: boolean; subtle?: boolean };

/** Bir kişi seçtiren liste (ısırılacak, korunacak, bakılacak ya da oy verilecek kişi). */
export function TargetPicker({
  options,
  selected,
  onSelect,
  accent = colors.primary,
}: {
  options: PickOption[];
  selected: string | null | undefined;
  onSelect: (id: string) => void;
  accent?: string;
}) {
  return (
    <View style={styles.list}>
      {options.map((o, i) => {
        const on = selected === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onSelect(o.id)}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: o.disabled }}
            accessibilityLabel={o.note ? `${o.name}. ${o.note}` : o.name}
            style={({ pressed }) => [
              styles.pickRow,
              i > 0 && styles.divider,
              on && { backgroundColor: 'rgba(255,255,255,0.05)' },
              o.disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.radio, on && { borderColor: accent }]}>
              {on ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
            </View>
            <View style={styles.playerText}>
              <Text style={[styles.pickName, o.subtle && styles.pickSubtle]} numberOfLines={1}>
                {o.name}
              </Text>
              {o.note ? <Text style={styles.deadText}>{o.note}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    backgroundColor: 'rgba(11, 15, 26, 0.6)',
  },
  chipText: { fontFamily: fonts.semi, fontSize: 11 },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  cardText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  progress: { gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.textMuted, fontSize: fontSizes.sm },
  progressCount: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  bar: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
  list: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  initial: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(124, 140, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialDead: { backgroundColor: colors.surfaceAlt },
  initialText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  playerText: { flex: 1, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { flexShrink: 1, color: colors.text, fontSize: fontSizes.md, fontFamily: fonts.semi },
  playerNameDead: { color: colors.textMuted, textDecorationLine: 'line-through' },
  me: { color: colors.primary, fontFamily: fonts.semi, fontSize: 11 },
  hostChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: 'rgba(34, 211, 197, 0.16)',
  },
  hostChipText: { color: colors.primary, fontFamily: fonts.semi, fontSize: 10 },
  deadText: { color: colors.textMuted, fontSize: 12 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  pickName: { color: colors.text, fontSize: fontSizes.md, fontFamily: fonts.semi },
  pickSubtle: { color: colors.textMuted },
  disabled: { opacity: 0.45 },
  pressed: { backgroundColor: colors.surfaceAlt },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
