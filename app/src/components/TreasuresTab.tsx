import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Segmented } from '@/components/Segmented';
import { cellName } from '@/lib/cellNames';
import { confirmAction } from '@/lib/dialog';
import { areaOf } from '@/lib/hex';
import { formatWhen, timeAgo } from '@/lib/labels';
import { refreshNotices } from '@/lib/notices';
import {
  adminListTreasures,
  adminMarkTreasuresSeen,
  adminRemoveTreasure,
  DIFFICULTY_LABEL,
  TREASURE_COLORS,
  type AdminTreasure,
} from '@/lib/treasure';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/** Moderatör: hazineler. Bulunan hazineler bildirim olarak düşer; bu sekme açılınca görüldü sayılır. */
export function TreasuresTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'active' | 'found'>('active');
  const [rows, setRows] = useState<AdminTreasure[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminListTreasures(status);
    setError(res.error);
    setRows(res.error ? [] : res.data);
    if (!res.error && status === 'found' && res.data.some((t) => !t.admin_seen)) {
      await adminMarkTreasuresSeen();
      void refreshNotices();
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function remove(t: AdminTreasure) {
    const ok = await confirmAction('Hazineyi kaldır', `${cellName({ q: t.cell_q, r: t.cell_r })} peteğindeki hazine kalkar.`, 'Kaldır', true);
    if (!ok) return;
    const res = await adminRemoveTreasure(t.id);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: 'Hazine kaldırıldı.', error: false });
    void load();
  }

  return (
    <>
      <Segmented<'active' | 'found'>
        value={status}
        onChange={(v) => {
          setRows(null);
          setStatus(v);
        }}
        options={[
          { value: 'active', label: 'Etkin' },
          { value: 'found', label: 'Bulunanlar' },
        ]}
      />
      <Text style={styles.muted}>
        Yeni hazineyi haritada bir peteğe dokunup “Bu peteğe hazine gizle” ile eklersin. Ayda en çok 300 hazine gizlenebilir.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{status === 'active' ? 'Etkin hazine yok.' : 'Henüz bulunan hazine yok.'}</Text>
      ) : (
        rows.map((t) => (
          <View
            key={t.id}
            style={[styles.card, { borderColor: TREASURE_COLORS[t.difficulty] }, !t.admin_seen && styles.cardNew]}
            testID="admin-treasure"
          >
            <View style={styles.head}>
              <Ionicons name="search" size={18} color={TREASURE_COLORS[t.difficulty]} />
              <Text style={styles.title} numberOfLines={1}>
                {cellName({ q: t.cell_q, r: t.cell_r })}
              </Text>
              <Text style={[styles.diff, { color: TREASURE_COLORS[t.difficulty] }]}>{DIFFICULTY_LABEL[t.difficulty]}</Text>
            </View>
            <Text style={styles.code} selectable>{`Kod: ${t.code}`}</Text>
            <Text style={styles.meta}>{`İpucu: ${t.hint}`}</Text>
            <Text style={styles.meta}>
              {t.found_at
                ? `Bulan: ${t.finder_name ?? 'Silinmiş hesap'} · ${timeAgo(t.found_at)}`
                : `${areaOf(t.cell_q, t.cell_r)} · son gün ${formatWhen(new Date(t.expires_at))}`}
            </Text>
            <View style={styles.btns}>
              <View style={styles.flex}>
                <PrimaryButton
                  label="Haritada gör"
                  variant="ghost"
                  onPress={() =>
                    router.navigate({
                      pathname: '/',
                      params: { q: String(t.cell_q), r: String(t.cell_r), t: String(Date.now()) },
                    })
                  }
                />
              </View>
              {!t.found_at ? (
                <View style={styles.flex}>
                  <PrimaryButton label="Kaldır" variant="ghost" onPress={() => void remove(t)} />
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1.5, backgroundColor: colors.surface },
  cardNew: { backgroundColor: 'rgba(34, 211, 197, 0.08)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  diff: { fontFamily: fonts.semi, fontSize: fontSizes.xs },
  code: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  btns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
