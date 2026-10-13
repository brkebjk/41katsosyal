import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { useIdentityEnabled } from '@/lib/identityFlag';
import { confirmAction } from '@/lib/dialog';
import { fmtPts } from '@/lib/labels';
import { adminGrantOnlineReward, adminOnlineWinners, type OnlineWinner } from '@/lib/quiz';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };

/**
 * Moderatör: Bilgi Yarışması Çoklu (Uzaktan) aylık sıralamasının ilk 3'ü. Geçen ay bittiği için ödül verilebilir
 * (1 aylık abonelik, kişi başı bir kez). Bu ay yalnızca önizlemedir. Vermeden önce hile şüphesine bakılmalı
 * (aynı kişilerle sürekli oynama, çok hızlı cevaplar vb.).
 */
export function QuizRewardsCard({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [offset, setOffset] = useState<-1 | 0>(-1);
  const identityOn = useIdentityEnabled();
  const [rows, setRows] = useState<OnlineWinner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminOnlineWinners(offset);
    setRows(res.data);
    setError(res.error);
  }, [offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme
    void load();
  }, [load]);

  async function grant(w: OnlineWinner) {
    const ok = await confirmAction(
      'Abonelik ödülü',
      `${w.alias} (${w.full_name}) geçen ayın Çoklu / Ay sıralamasında ${identityOn ? 'doğrulanmış üyeler arasında ' : ''}${w.place}. oldu (${fmtPts(w.points)} puan, ${w.wins} galibiyet). 1 aylık abonelik verilsin mi?`,
      'Ver',
    );
    if (!ok) return;
    setBusy(w.user_id);
    const res = await adminGrantOnlineReward(w.user_id, -1);
    setBusy(null);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: `${w.alias} kullanıcısına 1 aylık abonelik verildi.`, error: false });
    void load();
  }

  return (
    <View style={styles.card} testID="quiz-rewards">
      <View style={styles.head}>
        <Ionicons name="gift" size={18} color={colors.primary} />
        <Text style={styles.title}>Çoklu / Ay sıralama ödülleri</Text>
      </View>
      <View style={styles.tabs}>
        <Text style={[styles.tab, offset === -1 && styles.tabOn]} onPress={() => setOffset(-1)}>
          Geçen ay
        </Text>
        <Text style={[styles.tab, offset === 0 && styles.tabOn]} onPress={() => setOffset(0)}>
          Bu ay (önizleme)
        </Text>
      </View>
      {identityOn ? (
        <Text style={styles.sub}>
          Yalnızca hesabını doğrulamış üyeler listelenir; doğrulamayanlar atlanır, ödül sıradaki doğrulanmış üyeye geçer.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>Bu ay için sıralamada kimse yok.</Text>
      ) : (
        rows.map((w) => (
          <View key={w.user_id} style={styles.row}>
            <Text style={styles.place}>{w.place}</Text>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>{`${w.alias} · ${w.full_name}`}</Text>
              <Text style={styles.sub}>{`${fmtPts(w.points)} puan · ${w.wins} galibiyet`}</Text>
            </View>
            {w.granted ? (
              <Text style={styles.done}>Verildi</Text>
            ) : offset === -1 ? (
              <Pressable
                onPress={() => void grant(w)}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, busy !== null && styles.off, pressed && styles.pressed]}
              >
                <Text style={styles.btnText}>{busy === w.user_id ? '…' : '1 ay ver'}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
      <Text style={styles.muted}>
        Ödül yalnızca biten ay için verilir. Vermeden önce şüpheli oyun (hep aynı kişilerle oynama, sahte hesap) var mı
        bak; gerekirse Üyeler sekmesinden incele.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.4)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 12,
    fontFamily: fonts.semi,
    overflow: 'hidden',
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary, color: '#1A1200' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  place: { width: 22, textAlign: 'center', color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.md },
  name: { color: colors.text, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  sub: { color: colors.textMuted, fontSize: 12 },
  done: { color: colors.success, fontFamily: fonts.extra, fontSize: 12 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.primary },
  btnText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 12 },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
});
