import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { confirmAction } from '@/lib/dialog';
import { formatWhen } from '@/lib/labels';
import { PROBLEM_CATEGORIES, type ProblemReport } from '@/lib/problemReport';
import { callRpc, callRpcVoid } from '@/lib/rpc';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/** Moderatör paneli > Sorunlar: üyelerin “Bir Sorun Bildir” ile gönderdikleri (açık / kapatılan). */
export function ProblemReportsTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<ProblemReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (s: 'open' | 'closed') => {
    const res = await callRpc<ProblemReport[]>('admin_list_problem_reports', { p_status: s });
    setError(res.error);
    setRows(res.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load(status);
  }, [load, status]);

  async function onClose(r: ProblemReport) {
    if (busyId) return;
    const ok = await confirmAction('Bildirimi kapat', 'Bu sorun bildirimi “kapatılan” listesine taşınacak.', 'Kapat');
    if (!ok) return;
    setBusyId(r.id);
    const res = await callRpcVoid('admin_close_problem_report', { p_id: r.id });
    setBusyId(null);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: 'Bildirim kapatıldı.', error: false });
    void load(status);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.switchRow}>
        {(['open', 'closed'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatus(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === s }}
            style={[styles.switchBtn, status === s && styles.switchOn]}
          >
            <Text style={[styles.switchText, status === s && styles.switchTextOn]}>
              {s === 'open' ? 'Açık' : 'Kapatılan'}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>{status === 'open' ? 'Açık sorun bildirimi yok.' : 'Kapatılan bildirim yok.'}</Text>
      ) : (
        rows.map((r) => {
          const cat = PROBLEM_CATEGORIES.find((c) => c.key === r.category);
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.head}>
                <Ionicons name={cat?.icon ?? 'help-circle'} size={16} color={colors.highlight} />
                <Text style={styles.cat}>{cat?.label ?? r.category}</Text>
                <Text style={styles.time}>{formatWhen(new Date(r.created_at))}</Text>
              </View>
              <Text style={styles.body} selectable>
                {r.message}
              </Text>
              <Text style={styles.meta} selectable>
                {[
                  r.user_full_name ? `Üye: ${r.user_full_name} (${r.user_alias ?? ''})` : 'Üye: silinmiş hesap',
                  r.contact_name ? `Ad: ${r.contact_name}` : null,
                  r.app_version ? `Sürüm: ${r.app_version}${r.platform ? ` · ${r.platform}` : ''}` : null,
                ]
                  .filter(Boolean)
                  .join('\n')}
              </Text>
              <View style={styles.actions}>
                {r.contact_email ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`mailto:${r.contact_email}`)}
                    style={styles.contact}
                    accessibilityRole="button"
                  >
                    <Ionicons name="mail" size={14} color={colors.primary} />
                    <Text style={styles.contactText}>{r.contact_email}</Text>
                  </Pressable>
                ) : null}
                {r.contact_phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${(r.contact_phone ?? '').replace(/[^0-9+]/g, '')}`)}
                    style={styles.contact}
                    accessibilityRole="button"
                  >
                    <Ionicons name="call" size={14} color={colors.primary} />
                    <Text style={styles.contactText}>{r.contact_phone}</Text>
                  </Pressable>
                ) : null}
              </View>
              {r.status === 'open' ? (
                <PrimaryButton
                  label="Kapat"
                  variant="ghost"
                  onPress={() => void onClose(r)}
                  loading={busyId === r.id}
                />
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  switchRow: { flexDirection: 'row', gap: spacing.sm },
  switchBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  switchTextOn: { color: colors.primaryText },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cat: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  time: { color: colors.textMuted, fontSize: 11 },
  body: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  contactText: { color: colors.primary, fontFamily: fonts.semi, fontSize: 12 },
});
