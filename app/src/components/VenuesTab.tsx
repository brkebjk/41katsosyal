import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { VenueAdminModal } from '@/components/VenueAdminModal';
import { confirmAction } from '@/lib/dialog';
import { districtOf } from '@/lib/hex';
import { isBackendReady } from '@/lib/supabase';
import { adminListSponsors, adminRemoveVenueFromMap, starsText, type SponsorRow } from '@/lib/venues';
import { pickAndUploadVenueImage, setVenueImage, venueImageUrl } from '@/lib/venueImage';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Moderatör paneli, “Mekân” sekmesi: sponsor hesapların listesi, mekân bilgisini girme/düzenleme,
 * haritadan kaldırma ve aylık kod kullanımı. Haritaya yerleştirme harita sekmesinde petek seçilerek yapılır.
 */
export function VenuesTab({ onNotice }: { onNotice: (n: { text: string; error: boolean }) => void }) {
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<SponsorRow | null>(null);
  const [imageBusy, setImageBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminListSponsors();
    setError(res.error);
    if (!res.error) setRows(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    if (isBackendReady) void load();
  }, [load]);

  async function onRemove(s: SponsorRow) {
    const ok = await confirmAction(
      'Mekân haritadan kaldırılsın mı?',
      `“${s.name}” petek penceresinde görünmeyecek. Hesap ve yorumlar silinmez.`,
      'Kaldır',
      true,
    );
    if (!ok) return;
    const res = await adminRemoveVenueFromMap(s.user_id);
    onNotice(
      res.error ? { text: res.error, error: true } : { text: 'Mekân haritadan kaldırıldı.', error: false },
    );
    void load();
  }

  async function onImage(s: SponsorRow) {
    if (imageBusy) return;
    setImageBusy(s.user_id);
    const res = await pickAndUploadVenueImage(s.user_id);
    setImageBusy(null);
    if (res.cancelled) return;
    onNotice(res.error ? { text: res.error, error: true } : { text: 'Profil resmi kaydedildi.', error: false });
    void load();
  }

  async function onRemoveImage(s: SponsorRow) {
    const ok = await confirmAction('Profil resmi kaldırılsın mı?', `“${s.name}” yeniden simgeyle görünür.`, 'Kaldır', true);
    if (!ok) return;
    const res = await setVenueImage(s.user_id, null);
    onNotice(res.error ? { text: res.error, error: true } : { text: 'Profil resmi kaldırıldı.', error: false });
    void load();
  }

  if (!loaded) return <Text style={styles.muted}>Mekânlar yükleniyor…</Text>;

  return (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.help}>
        <Text style={styles.helpTitle}>Mekân (sponsor) hesabı nasıl eklenir?</Text>
        <Text style={styles.muted}>
          Hesabı sen yapmazsın; mekân sahibi uygulamaya normal üye olarak kayıt olur. Sonra Supabase’de SQL
          Editor’de hesabın rolünü “sponsor” yaparsın (Kurulum Rehberi’nde hazır komut var). Hesap bu listede
          görününce “Bilgileri gir” ile adres, kapanış saati ve kod kotasını girersin. Haritaya koymak için
          Harita sekmesinde bir peteğe dokunup “Bu peteğe mekân ekle”yi seçersin.
        </Text>
      </View>

      {rows.length === 0 && !error ? (
        <Text style={styles.muted}>Henüz sponsor hesap yok.</Text>
      ) : (
        rows.map((s) => {
          const where =
            s.cell_q !== null && s.cell_r !== null
              ? `Haritada · ${districtOf(s.cell_q, s.cell_r) ?? 'Kocaeli'}`
              : s.has_venue
                ? 'Bilgisi var, haritada değil'
                : 'Mekân bilgisi girilmemiş';
          return (
            <View key={s.user_id} style={styles.card}>
              <View style={styles.head}>
                {s.image_path ? <Avatar index={1} size={40} uri={venueImageUrl(s.image_path)} /> : null}
                <Text style={styles.name} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.is_banned ? <Text style={styles.banned}>Askıda</Text> : null}
              </View>
              <Text style={styles.muted}>{where}</Text>
              {s.has_venue ? (
                <>
                  <Text style={styles.muted} numberOfLines={2}>
                    {[s.address, s.closing_hours ? `Kapanış ${s.closing_hours}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={styles.muted}>
                    {`${s.avg_stars === null ? 'Henüz puan yok' : `★ ${starsText(s.avg_stars)} (${s.review_count} değerlendirme)`} · ${s.visit_count} kod kullanımı · bu ay ${s.codes_month}/${s.quota_limit} kod`}
                  </Text>
                </>
              ) : null}
              <View style={styles.btnRow}>
                <View style={styles.btn}>
                  <PrimaryButton
                    label={s.has_venue ? 'Düzenle' : 'Bilgileri gir'}
                    variant="ghost"
                    onPress={() => setEdit(s)}
                  />
                </View>
                {s.has_venue ? (
                  <View style={styles.btn}>
                    <PrimaryButton
                      label={s.image_path ? 'Resmi değiştir' : 'Profil resmi ekle (en çok 2 MB)'}
                      variant="ghost"
                      loading={imageBusy === s.user_id}
                      onPress={() => void onImage(s)}
                    />
                  </View>
                ) : null}
                {s.image_path ? (
                  <View style={styles.btn}>
                    <PrimaryButton label="Resmi kaldır" variant="ghost" onPress={() => void onRemoveImage(s)} />
                  </View>
                ) : null}
                {s.cell_q !== null ? (
                  <View style={styles.btn}>
                    <PrimaryButton
                      label="Haritadan kaldır"
                      variant="danger"
                      onPress={() => void onRemove(s)}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      )}

      <VenueAdminModal
        visible={edit !== null}
        onClose={() => setEdit(null)}
        sponsors={rows}
        sponsor={edit}
        onSaved={() => {
          setEdit(null);
          onNotice({ text: 'Mekân bilgisi kaydedildi.', error: false });
          void load();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  help: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  helpTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 107, 0.45)',
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  banned: { color: colors.danger, fontFamily: fonts.semi, fontSize: 12 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  btn: { flexGrow: 1, flexBasis: 140 },
});
