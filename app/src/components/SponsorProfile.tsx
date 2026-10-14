import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { ListRow, Panel } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stars } from '@/components/VenueSheet';
import { confirmAction, notify } from '@/lib/dialog';
import { formatWhen } from '@/lib/labels';
import {
  createSponsorCode,
  getSponsorPanel,
  starsText,
  type SponsorCode,
  type SponsorPanel,
} from '@/lib/venues';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';
import { Avatar } from '@/components/Avatar';
import { venueImageUrl } from '@/lib/venueImage';

const STATUS_TEXT: Record<SponsorCode['status'], string> = {
  active: 'Kullanılmadı',
  used: 'Kullanıldı',
  expired: 'Süresi doldu',
};

/**
 * Mekân (sponsor) hesabının profil gövdesi: mekân bilgisi, puanı ve mekân bonusu kodları.
 * Sponsor hesaplar puan toplamaz, sıralamada yer almaz; bu yüzden puan/seviye alanları gösterilmez.
 */
export function SponsorProfile({ fullName }: { fullName: string }) {
  const [panel, setPanel] = useState<SponsorPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getSponsorPanel();
    if (res.error) setError(res.error);
    else {
      setError(null);
      setPanel(res.data);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onCreate() {
    if (busy || !panel?.venue) return;
    const ok = await confirmAction(
      'Yeni kod oluşturulsun mu?',
      `Kod ${panel.valid_hours ?? 24} saat geçerli olur ve tek bir üyeye mekân bonusu verir (mekânında açtığı yan yana oyunda herkese +%25 puan). Bu ayki kod hakkından 1 düşer.`,
      'Kod oluştur',
    );
    if (!ok) return;
    setBusy(true);
    const res = await createSponsorCode();
    setBusy(false);
    if (res.error || !res.data) {
      await notify('Kod oluşturulamadı', res.error ?? 'Bir sorun oldu. Biraz sonra tekrar dene.');
      return;
    }
    void load();
    try {
      await Share.share({ message: `${fullName} mekân bonusu kodu: ${res.data.code}` });
    } catch {
      // Paylaşım açılamadıysa kod listede görünüyor
    }
  }

  async function onShare(code: string) {
    try {
      await Share.share({ message: `${fullName} mekân bonusu kodu: ${code}` });
    } catch {
      // Kod ekranda zaten görünüyor
    }
  }

  const left = panel?.venue ? Math.max(0, (panel.quota_limit ?? 0) - (panel.quota_used ?? 0)) : 0;

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.ring}>
          {panel?.image_path ? (
            <Avatar index={1} size={84} uri={venueImageUrl(panel.image_path)} />
          ) : (
            <Ionicons name="storefront" size={44} color={colors.venue} />
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {fullName}
        </Text>
        <View style={styles.chip}>
          <Ionicons name="storefront" size={14} color={colors.venue} />
          <Text style={styles.chipText}>Mekân hesabı</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {panel && !panel.venue ? (
        <Panel>
          <ListRow
            icon="time-outline"
            title="Mekân bilgilerin henüz girilmedi"
            subtitle="Moderatör adres, telefon ve kapanış saatini girdikten sonra kod oluşturabilirsin."
          />
        </Panel>
      ) : null}

      {panel?.venue ? (
        <>
          <Panel title="Mekânım">
            <ListRow icon="location-outline" title="Adres" subtitle={panel.address ?? ''} />
            {panel.phone ? <ListRow icon="call-outline" title="Telefon" subtitle={panel.phone} /> : null}
            <ListRow icon="time-outline" title="Kapanış saati" subtitle={panel.closing_hours ?? ''} />
            <ListRow
              icon="star"
              title="Mekân puanı"
              subtitle={
                panel.avg_stars === null || panel.avg_stars === undefined
                  ? 'Henüz değerlendirme yok'
                  : `${starsText(panel.avg_stars)} / 5 · ${panel.review_count ?? 0} değerlendirme`
              }
              footer={
                panel.avg_stars !== null && panel.avg_stars !== undefined ? (
                  <Stars value={panel.avg_stars} />
                ) : undefined
              }
            />
            <ListRow
              icon="people-outline"
              title="Kod kullanım sayısı"
              subtitle="Üyelerin mekânının kodunu toplam kullanma sayısı"
              value={String(panel.visit_count ?? 0)}
            />
            <ListRow
              icon={panel.on_map ? 'map' : 'map-outline'}
              title={panel.on_map ? 'Haritada görünüyorsun' : 'Henüz haritada değilsin'}
              subtitle={
                panel.on_map
                  ? 'Bulunduğun petege dokunan üyeler mekânını görür.'
                  : 'Moderatör seni bir peteğe yerleştirince burada görünür.'
              }
            />
          </Panel>

          <Panel
            title="Mekân bonusu kodları"
            hint="Müşterine bir kod ver; kodu giren üye birkaç saat içinde mekânında açtığı yan yana oyunda herkese +%25 puan kazandırır. Kodlar tek kullanımlıktır."
          >
            <ListRow
              icon="ticket-outline"
              title="Bu ayki kod hakkın"
              subtitle={`${panel.quota_used ?? 0} kullanıldı, ${left} kaldı`}
              value={`${panel.quota_used ?? 0}/${panel.quota_limit ?? 0}`}
            />
            <View style={styles.action}>
              <PrimaryButton
                label="Kod oluştur"
                onPress={() => void onCreate()}
                loading={busy}
                disabled={left <= 0}
                testID="sponsor-create-code"
              />
              {left <= 0 ? (
                <Text style={styles.sub}>Bu ayki kod hakkın bitti. Ay başında yenilenir.</Text>
              ) : null}
            </View>
            {(panel.codes ?? []).length > 0 ? (
              (panel.codes ?? []).map((c) => (
                <View key={c.code} style={styles.codeRow}>
                  <View style={styles.codeInfo}>
                    <Text style={[styles.code, c.status !== 'active' && styles.codeDim]}>{c.code}</Text>
                    <Text style={styles.sub}>
                      {c.status === 'active'
                        ? `${STATUS_TEXT[c.status]} · ${formatWhen(new Date(c.expires_at))} tarihine kadar`
                        : STATUS_TEXT[c.status]}
                    </Text>
                  </View>
                  {c.status === 'active' ? (
                    <Pressable
                      onPress={() => void onShare(c.code)}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.code} kodunu paylaş`}
                      hitSlop={8}
                      style={styles.share}
                    >
                      <Ionicons name="share-outline" size={18} color={colors.primary} />
                      <Text style={styles.shareText}>Paylaş</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[styles.sub, styles.pad]}>Henüz kod oluşturmadın.</Text>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 159, 107, 0.14)',
    borderWidth: 2,
    borderColor: 'rgba(255, 159, 107, 0.6)',
  },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 107, 0.55)',
    backgroundColor: 'rgba(255, 159, 107, 0.12)',
  },
  chipText: { color: colors.venue, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  action: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sub: { color: colors.textMuted, fontSize: 12 },
  pad: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  codeInfo: { flex: 1, gap: 2 },
  code: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg, letterSpacing: 3 },
  codeDim: { color: colors.textMuted, textDecorationLine: 'line-through' },
  share: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
});
