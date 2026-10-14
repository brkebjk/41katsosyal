import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import {
  createCrew,
  getCrewView,
  kickFromCrew,
  leaveCrew,
  renameCrew,
  respondCrewInvite,
  type CrewView,
} from '@/lib/crew';
import { confirmAction, notify } from '@/lib/dialog';
import { fmtPts, timeAgo } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Tarih: "12 Ekim 14:30" */
const when = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Ekibim: ekip kur, gelen davetleri cevapla, üyeler (kurucu ad değiştirir, üye atar), bu ayki ekip puanı ve sıra,
 * ekip sohbeti (mesaj kutusunda ekibin adıyla). Davet, oyun ekranında arkadaşının avatarına dokununca gönderilir.
 */
export default function CrewScreen() {
  const [view, setView] = useState<CrewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Verinin okunduğu an (katkının sayılıp sayılmadığını göstermek için) */
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const res = await getCrewView();
    setError(res.error);
    setLoadedAt(Date.now());
    if (res.data) setView(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(key: string, fn: () => Promise<{ error: string | null }>, done?: string) {
    if (busy) return;
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) {
      void notify('Olmadı', res.error, { icon: 'alert-circle', tone: 'danger' });
      return;
    }
    if (done) void notify('Tamam', done, { icon: 'checkmark-circle', tone: 'success' });
    setEditing(false);
    setName('');
    void load();
  }

  const crew = view?.crew ?? null;
  const waitText = view?.next_change_at ? `Ekibe yeniden ${when(view.next_change_at)} sonra girebilirsin.` : null;

  return (
    <Screen
      title="Ekibim"
      subtitle="Arkadaşlarınla ekip kur, Ekip Sıralaması'nda yarışın"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      onRefresh={() => void load()}
    >
      {error && !view ? <Text style={styles.muted}>{error}</Text> : null}

      {/* Gelen davetler */}
      {view && view.invites.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ekip davetleri</Text>
          {view.invites.map((i) => (
            <View key={i.id} style={styles.invite}>
              <Text style={styles.inviteText}>
                {`${i.from_name} seni “${i.crew_name}” ekibine davet etti (${i.members}/${view.max_members} kişi).`}
              </Text>
              {crew ? (
                <Text style={styles.small}>Kabul edersen şu anki ekibinden ayrılırsın.</Text>
              ) : null}
              <View style={styles.row}>
                <View style={styles.flex}>
                  <PrimaryButton
                    label="Katıl"
                    loading={busy === `acc:${i.id}`}
                    onPress={() => void run(`acc:${i.id}`, () => respondCrewInvite(i.id, true), 'Ekibe katıldın.')}
                  />
                </View>
                <View style={styles.flex}>
                  <PrimaryButton
                    label="Reddet"
                    variant="ghost"
                    loading={busy === `dec:${i.id}`}
                    onPress={() => void run(`dec:${i.id}`, () => respondCrewInvite(i.id, false))}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {view && !crew ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Henüz bir ekibin yok</Text>
          <Text style={styles.text}>
            Ekip kur ya da oyunda arkadaşının avatarına dokunup “Ekibe davet et” de. Ekibin yoksa davetle birlikte ekip
            kurulur.
          </Text>
          {waitText ? <Text style={styles.small}>{waitText}</Text> : null}
          <TextField
            label="Ekip adı"
            icon="people-outline"
            value={name}
            onChangeText={setName}
            maxLength={30}
            placeholder="Ör. Gece Kurtları"
            testID="crew-name"
          />
          <PrimaryButton
            label="Ekip kur"
            disabled={name.trim().length < 2}
            loading={busy === 'create'}
            onPress={() => void run('create', () => createCrew(name.trim()), 'Ekibin kuruldu.')}
            testID="crew-create"
          />
        </View>
      ) : null}

      {crew ? (
        <>
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Ionicons name="people" size={22} color={colors.primary} />
              <Text style={styles.crewName} numberOfLines={1}>
                {crew.name}
              </Text>
              {crew.is_founder ? (
                <Pressable
                  onPress={() => {
                    setEditing((e) => !e);
                    setName(crew.name);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Ekibin adını değiştir"
                >
                  <Ionicons name={editing ? 'close' : 'create-outline'} size={20} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
            {editing ? (
              <>
                <TextField label="Yeni ad" icon="create-outline" value={name} onChangeText={setName} maxLength={30} />
                <PrimaryButton
                  label="Kaydet"
                  disabled={name.trim().length < 2}
                  loading={busy === 'rename'}
                  onPress={() => void run('rename', () => renameCrew(name.trim()))}
                />
              </>
            ) : null}
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmtPts(crew.month_points)}</Text>
                <Text style={styles.statLabel}>bu ay ekip puanı</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{crew.rank ? `${crew.rank}.` : '—'}</Text>
                <Text style={styles.statLabel}>Ekip Sıralaması</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmtPts(crew.my_points)}</Text>
                <Text style={styles.statLabel}>senin katkın</Text>
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <PrimaryButton
                  label="Ekip sohbeti"
                  onPress={() => router.navigate({ pathname: '/akis', params: { crew: '1', t: String(Date.now()) } })}
                  testID="crew-chat"
                />
              </View>
              <View style={styles.flex}>
                <PrimaryButton
                  label="Sıralama"
                  variant="ghost"
                  onPress={() => router.push({ pathname: '/siralama', params: { tab: 'crew' } })}
                />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{`Üyeler (${crew.members.length}/${view?.max_members ?? 5})`}</Text>
            {crew.members.map((m) => {
              const pending = new Date(m.counts_from).getTime() > loadedAt;
              return (
                <View key={m.id} style={styles.member}>
                  <Avatar index={m.avatar} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {`${m.is_me ? 'Sen' : m.name}${m.is_founder ? ' · Kurucu' : ''}`}
                    </Text>
                    <Text style={styles.small}>
                      {pending
                        ? `Katkısı ${when(m.counts_from)} sonra sayılır`
                        : `Bu ay ${fmtPts(m.month_points)} puan · ${timeAgo(m.joined_at)} katıldı`}
                    </Text>
                  </View>
                  {crew.is_founder && !m.is_me ? (
                    <Pressable
                      onPress={async () => {
                        if (await confirmAction('Ekipten çıkarılsın mı?', `${m.name} ekipten çıkarılacak.`, 'Çıkar', true)) {
                          void run(`kick:${m.id}`, () => kickFromCrew(m.id));
                        }
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.name} ekipten çıkar`}
                      style={styles.kick}
                    >
                      <Ionicons name="person-remove" size={18} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {crew.pending.map((p) => (
              <Text key={p.id} style={styles.small}>{`⏳ ${p.name} davet edildi, cevap bekleniyor`}</Text>
            ))}
            <PrimaryButton
              label="Ekipten ayrıl"
              variant="danger"
              loading={busy === 'leave'}
              onPress={async () => {
                const text = crew.is_founder
                  ? 'Kurucu sensin; ayrılırsan kuruculuk en eski üyeye geçer. Ekibe haftada 1 kez girilebildiği için hemen başka ekibe giremeyebilirsin.'
                  : 'Ekibe haftada 1 kez girilebildiği için hemen başka ekibe giremeyebilirsin.';
                if (await confirmAction('Ekipten ayrılınsın mı?', text, 'Ayrıl', true)) {
                  void run('leave', leaveCrew);
                }
              }}
            />
          </View>
        </>
      ) : null}

      {/* Kurallar */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ekip kuralları</Text>
        {[
          `Ekip en çok ${view?.max_members ?? 5} kişidir. Ekibe yalnızca arkadaşını davet edebilirsin: oyunda arkadaşının avatarına dokun, “Ekibe davet et” de.`,
          'Ekipçe oynanan puanlı oyunların puanı Ekip Sıralaması’na yazılır (aynı oyunda ekipten en az 2 kişi). Kişisel puanın ve aylık hedeflerin değişmez.',
          `Ekibe yeni giren üyenin ekip puanına katkısı ${view?.contrib_days ?? 3} gün sonra sayılmaya başlar.`,
          'Her üye haftada 1 kez ekibe girebilir (ekip kurmak, katılmak ya da değiştirmek).',
          'Kurucu ekibin adını değiştirir ve üye çıkarabilir. Kurucu ayrılırsa kuruculuk en eski üyeye geçer.',
          'Ekip sohbeti mesaj kutusunda ekibin adıyla görünür; @rumuz ile ekip arkadaşını etiketleyebilirsin.',
        ].map((t) => (
          <Text key={t} style={styles.rule}>{`• ${t}`}</Text>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  rule: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: spacing.sm },
  invite: { gap: 6, paddingVertical: 4 },
  inviteText: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crewName: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  statValue: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.lg },
  statLabel: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  memberName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  kick: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
});
