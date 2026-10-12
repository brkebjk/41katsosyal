import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { NoteModal } from '@/components/NoteModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Segmented } from '@/components/Segmented';
import { confirmAction } from '@/lib/dialog';
import { categoryInfo } from '@/lib/eventCategories';
import { timeAgo } from '@/lib/labels';
import {
  listLeaderApplications,
  resolveLeaderApplication,
  setEventLeader,
  type LeaderApplication,
} from '@/lib/moderation';
import { patchNotices, refreshNotices } from '@/lib/notices';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

const AUDIENCE_TEXT: Record<string, string> = {
  '1-10': '1–10 kişi',
  '10-30': '10–30 kişi',
  '30-100': '30–100 kişi',
  '100+': '100+ kişi',
};

/** Moderatör: etkinlik lideri başvuruları. Bütün alanlar (ad, telefon, kategoriler, kitle) yalnızca burada görünür. */
export function LeaderApplicationsTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<LeaderApplication[]>([]);
  const [rowsFor, setRowsFor] = useState<'open' | 'closed' | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<LeaderApplication | null>(null);
  const lock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const my = ++requestId.current;
    const res = await listLeaderApplications(status);
    if (my !== requestId.current) return;
    setError(res.error);
    if (!res.error) {
      setRows(res.data);
      setRowsFor(status);
    }
    setLoaded(true);
  }, [status]);

  useEffect(() => {
    if (rowsFor === 'open') patchNotices({ modLeaderApps: rows.length });
  }, [rows, rowsFor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function approve(r: LeaderApplication) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(r.id);
    try {
      const ok = await confirmAction(
        'Başvuruyu onayla',
        `${r.full_name} Etkinlik Lideri olur; aylık etkinlik hakkı artar ve profilinde rozet görünür.`,
        'Onayla',
        false,
        { icon: 'ribbon' },
      );
      if (!ok) return;
      const res = await resolveLeaderApplication(r.id, true);
      if (res.error) {
        onNotice({ text: res.error, error: true });
        void load();
        return;
      }
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      onNotice({ text: `${r.full_name} artık Etkinlik Lideri.`, error: false });
      void refreshNotices();
    } finally {
      setBusyId(null);
      lock.current = false;
    }
  }

  async function reject(r: LeaderApplication, note: string): Promise<string | null> {
    const res = await resolveLeaderApplication(r.id, false, note);
    if (res.error) return res.error;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setRejecting(null);
    onNotice({ text: 'Başvuru reddedildi. Üye 7 gün sonra yeniden başvurabilir.', error: false });
    void refreshNotices();
    return null;
  }

  async function removeLeader(r: LeaderApplication) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(r.id);
    try {
      const ok = await confirmAction(
        'Liderliği kaldır',
        `${r.full_name} artık Etkinlik Lideri olmaz; aylık etkinlik hakkı normale döner.`,
        'Kaldır',
        true,
      );
      if (!ok) return;
      const res = await setEventLeader(r.user_id, false);
      if (res.error) return onNotice({ text: res.error, error: true });
      onNotice({ text: 'Liderlik kaldırıldı.', error: false });
      void load();
    } finally {
      setBusyId(null);
      lock.current = false;
    }
  }

  return (
    <>
      <Segmented<'open' | 'closed'>
        value={status}
        onChange={(v) => {
          setLoaded(false);
          setStatus(v);
        }}
        options={[
          { value: 'open', label: 'Bekleyen' },
          { value: 'closed', label: 'Sonuçlanan' },
        ]}
      />
      <Text style={styles.muted}>
        Telefon numarası yalnızca bu ekranda görünür; başka hiçbir yerde gösterilmez. Onaylanan üyenin aylık etkinlik hakkı artar.
      </Text>
      {!loaded ? (
        <Text style={styles.muted}>Başvurular yükleniyor…</Text>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
          <PrimaryButton
            label="Tekrar dene"
            variant="ghost"
            onPress={() => {
              setLoaded(false);
              void load();
            }}
          />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{status === 'open' ? 'Bekleyen başvuru yok.' : 'Sonuçlanmış başvuru yok.'}</Text>
      ) : (
        rows.map((r) => (
          <View key={r.id} style={styles.card} testID="leader-app-card">
            <View style={styles.head}>
              <Ionicons name="ribbon" size={18} color={colors.accent} />
              <Text style={styles.name} numberOfLines={1}>
                {r.full_name}
              </Text>
              <Text style={styles.muted}>{timeAgo(r.created_at)}</Text>
            </View>
            {r.profile_name !== r.full_name ? (
              <Text style={styles.muted}>{`Hesaptaki ad: ${r.profile_name}`}</Text>
            ) : null}
            <Pressable
              onPress={() => void Linking.openURL(`tel:${r.phone}`)}
              accessibilityRole="link"
              accessibilityLabel={`Ara: ${r.phone}`}
              style={styles.line}
            >
              <Ionicons name="call-outline" size={15} color={colors.primary} />
              <Text style={styles.phone}>{r.phone}</Text>
            </Pressable>
            <View style={styles.line}>
              <Ionicons name="people-outline" size={15} color={colors.textMuted} />
              <Text style={styles.text}>{`Ortalama kitle: ${AUDIENCE_TEXT[r.audience] ?? r.audience}`}</Text>
            </View>
            <View style={styles.chips}>
              {r.categories.map((c) => (
                <View key={c} style={styles.chip}>
                  <Text style={styles.chipText}>{categoryInfo(c).title}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.muted}>
              {[r.is_premium ? 'Abone' : 'Abone değil', r.is_leader ? 'Şu an Etkinlik Lideri' : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {status === 'open' ? (
              <View style={styles.btnRow}>
                <View style={styles.flex}>
                  <PrimaryButton label="Onayla" onPress={() => void approve(r)} disabled={busyId === r.id} />
                </View>
                <View style={styles.flex}>
                  <PrimaryButton
                    label="Reddet"
                    variant="ghost"
                    onPress={() => setRejecting(r)}
                    disabled={busyId === r.id}
                  />
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.muted}>
                  {r.status === 'approved' ? 'Onaylandı.' : 'Reddedildi.'}
                  {r.admin_note ? ` Not: ${r.admin_note}` : ''}
                </Text>
                {r.is_leader ? (
                  <PrimaryButton
                    label="Liderliği kaldır"
                    variant="ghost"
                    onPress={() => void removeLeader(r)}
                    disabled={busyId === r.id}
                  />
                ) : null}
              </>
            )}
          </View>
        ))
      )}

      <NoteModal
        visible={rejecting !== null}
        title="Başvuruyu reddet"
        message={rejecting ? `${rejecting.full_name} bildirim alır; istersen kısa bir açıklama yaz.` : undefined}
        label="Açıklama (isteğe bağlı)"
        placeholder="Örn. Şimdilik yeterli etkinlik geçmişi yok."
        confirmLabel="Reddet"
        onClose={() => setRejecting(null)}
        onSubmit={(note) => (rejecting ? reject(rejecting, note) : Promise.resolve(null))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phone: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  text: { color: colors.text, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124, 140, 255, 0.16)',
  },
  chipText: { color: colors.accent, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
});
