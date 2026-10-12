import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NoteModal } from '@/components/NoteModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { cellName } from '@/lib/cellNames';
import { districtOf } from '@/lib/hex';
import { sendMemberMessage } from '@/lib/moderation';
import { refreshNotices } from '@/lib/notices';
import { callRpc, callRpcVoid } from '@/lib/rpc';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };
type Candidate = {
  id: string;
  cell_q: number;
  cell_r: number;
  user_id: string;
  full_name: string;
  kind: 'host' | 'player';
  month_start: string;
  count_last: number;
  count_prev: number;
  admin_seen: boolean;
  created_at: string;
};

/**
 * Moderatör: petek adı adayları. Bir petekte bitmiş son iki ayın ikisinde de en çok oyun oynayan ya da en çok etkinlik
 * düzenleyen üye buraya düşer. Moderatör üyeye mesaj gönderip peteğe adını verebilir (petek menüsündeki kalem).
 */
export function CellCandidatesTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [msgFor, setMsgFor] = useState<Candidate | null>(null);

  const load = useCallback(async () => {
    await callRpc<number>('admin_refresh_cell_candidates');
    const { data, error } = await callRpc<Candidate[]>('admin_list_cell_candidates');
    if (error) onNotice({ text: error, error: true });
    setRows(data ?? []);
    if ((data ?? []).some((c) => !c.admin_seen)) {
      await callRpcVoid('admin_mark_cell_candidates_seen');
      void refreshNotices();
    }
  }, [onNotice]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function send(c: Candidate, note: string): Promise<string | null> {
    const body =
      note.trim().length > 0
        ? note.trim()
        : `${cellName({ q: c.cell_q, r: c.cell_r })} peteğinde iki aydır ${c.kind === 'host' ? 'en çok etkinlik düzenleyen' : 'en çok oyun oynayan'} sensin! Bu peteğe bir ad vermek ister misin? Önerini bize yaz.`;
    const res = await sendMemberMessage(c.user_id, 'Peteğine ad verebilirsin', body);
    if (res.error) return res.error;
    setMsgFor(null);
    onNotice({ text: `${c.full_name} kişisine mesaj gönderildi.`, error: false });
    return null;
  }

  return (
    <>
      <Text style={styles.muted}>
        Bir petekte son iki ayın ikisinde de en çok oyun oynayan (her ay en az 3 oyun) ya da en çok etkinlik düzenleyen
        (her ay en az 2 etkinlik) üyeler. Kişiye mesaj gönder; adı petek menüsündeki kalemle verirsin.
      </Text>
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Şu an aday yok.</Text>
      ) : (
        rows.map((c) => (
          <View key={c.id} style={[styles.card, !c.admin_seen && styles.cardNew]} testID="cell-candidate">
            <View style={styles.head}>
              <Ionicons name={c.kind === 'host' ? 'calendar' : 'game-controller'} size={18} color={colors.primary} />
              <Text style={styles.title} numberOfLines={1}>
                {c.full_name}
              </Text>
            </View>
            <Text style={styles.meta}>
              {`${cellName({ q: c.cell_q, r: c.cell_r })} · ${districtOf(c.cell_q, c.cell_r) ?? 'Kocaeli'}`}
            </Text>
            <Text style={styles.meta}>
              {`${c.kind === 'host' ? 'Etkinlik düzenleyen' : 'Oyun oynayan'} · son ay ${c.count_last}, önceki ay ${c.count_prev}`}
            </Text>
            <View style={styles.btns}>
              <View style={styles.flex}>
                <PrimaryButton label="Mesaj gönder" onPress={() => setMsgFor(c)} />
              </View>
              <View style={styles.flex}>
                <PrimaryButton
                  label="Haritada gör"
                  variant="ghost"
                  onPress={() =>
                    router.navigate({
                      pathname: '/',
                      params: { q: String(c.cell_q), r: String(c.cell_r), t: String(Date.now()) },
                    })
                  }
                />
              </View>
            </View>
          </View>
        ))
      )}
      <NoteModal
        visible={msgFor !== null}
        title="Üyeye mesaj"
        message={msgFor ? `${msgFor.full_name} bildirim kutusunda görür. Boş bırakırsan hazır mesaj gider.` : undefined}
        label="Mesaj (isteğe bağlı)"
        placeholder="Peteğe vermek istediğin adı bize yaz…"
        confirmLabel="Gönder"
        max={1000}
        onClose={() => setMsgFor(null)}
        onSubmit={(note) => (msgFor ? send(msgFor, note) : Promise.resolve(null))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardNew: { borderColor: colors.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs },
  btns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
});
