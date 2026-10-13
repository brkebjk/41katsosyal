import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { Sheet } from '@/components/Sheet';
import { confirmAction } from '@/lib/dialog';
import {
  leaveTeam,
  listTeamSeekers,
  multiplierText,
  sendTeamInvite,
  TEAM_RULE_TEXT,
  teamMultiplier,
  type TeamSeeker,
} from '@/lib/invites';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Etkinlikte ekip arayanlar (gerçek adlarıyla) ve benim ekibim. Yalnızca o etkinlikte ekip arayan ya da bir ekipte olan
 * kayıtlı üye açabilir. Ekip daveti karşı tarafın bildirim kutusuna düşer.
 */
export function TeamSheet({
  event,
  myTeamSize,
  onClose,
  onChanged,
}: {
  event: { id: string; title: string };
  myTeamSize: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<TeamSeeker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await listTeamSeekers(event.id);
    setRows(res.data);
    setError(res.error);
  }, [event.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function invite(r: TeamSeeker) {
    if (busyId) return;
    setBusyId(r.user_id);
    setMsg(null);
    const res = await sendTeamInvite(event.id, r.user_id);
    setBusyId(null);
    setMsg(res.error ? { text: res.error, error: true } : { text: `${r.full_name} kişisine davet gönderildi.`, error: false });
    void load();
  }

  async function leave() {
    const ok = await confirmAction('Ekipten ayrıl', 'Ekip bonusunu kaybedersin. Etkinlik başlamadan yeniden ekip kurabilirsin.', 'Ayrıl', true);
    if (!ok) return;
    const res = await leaveTeam(event.id);
    setMsg(res.error ? { text: res.error, error: true } : { text: 'Ekipten ayrıldın.', error: false });
    onChanged();
    void load();
  }

  const mine = (rows ?? []).filter((r) => r.in_my_team);
  const others = (rows ?? []).filter((r) => !r.in_my_team && r.seeking);
  const teamSize = mine.length > 0 ? mine.length + 1 : myTeamSize;

  return (
    <Sheet title="Ekip" subtitle={event.title} onClose={onClose}>
      <View style={styles.rule}>
        <Ionicons name="people" size={18} color={colors.primary} />
        <Text style={styles.ruleText}>{TEAM_RULE_TEXT}</Text>
      </View>
      <RealNameNotice text="Ekip arayanlar birbirini gerçek adıyla görür. Daveti kabul eden kişinin yazdığı iletişim bilgisi yalnızca daveti gönderene iletilir." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null && !error ? <Text style={styles.muted}>Yükleniyor…</Text> : null}

      {teamSize > 1 ? (
        <>
          <Text style={styles.group}>{`Ekibin · ${teamSize} kişi · ${multiplierText(teamMultiplier(teamSize))} (hepiniz kodu doğrularsanız)`}</Text>
          {mine.map((r) => (
            <View key={r.user_id} style={styles.row}>
              <Ionicons name="person" size={16} color={colors.success} />
              <Text style={styles.name} numberOfLines={1}>
                {r.full_name}
              </Text>
            </View>
          ))}
          <PrimaryButton label="Ekipten ayrıl" variant="ghost" onPress={() => void leave()} />
        </>
      ) : null}

      {rows !== null ? (
        <>
          <Text style={styles.group}>{`Ekip arayanlar (${others.length})`}</Text>
          {others.length === 0 ? (
            <Text style={styles.muted}>Şu an senden başka ekip arayan yok. Daha sonra tekrar bak.</Text>
          ) : (
            others.map((r) => (
              <View key={r.user_id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.full_name}
                  </Text>
                  <Text style={styles.muted}>
                    {r.invited_me
                      ? 'Sana davet gönderdi; bildirim kutundan yanıtla.'
                      : r.team_size > 0
                        ? `Bir ekipte (${r.team_size} kişi)`
                        : 'Ekip arıyor'}
                  </Text>
                </View>
                {r.team_size === 0 && !r.invited_me ? (
                  <PrimaryButton
                    label={r.invited_by_me ? 'Davet edildi' : 'Davet et'}
                    variant="ghost"
                    disabled={r.invited_by_me}
                    loading={busyId === r.user_id}
                    onPress={() => void invite(r)}
                  />
                ) : null}
              </View>
            ))
          )}
        </>
      ) : null}
      {msg ? <Text style={msg.error ? styles.error : styles.ok}>{msg.text}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rule: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  ruleText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 },
  group: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  flex: { flex: 1, gap: 2 },
  name: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  ok: { color: colors.success, fontSize: fontSizes.sm },
});
