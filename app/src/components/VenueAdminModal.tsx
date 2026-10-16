import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { areaOf, type Cell } from '@/lib/hex';
import { adminSaveVenue, type SponsorRow } from '@/lib/venues';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Hangi sponsor hesaplar arasından seçilebilir (haritadan ekleme) */
  sponsors: SponsorRow[];
  /** Verilirse düzenlenen sponsor (listeden seçim gerekmez) */
  sponsor?: SponsorRow | null;
  /** Verilirse mekân bu peteğe yerleşir (haritadan ekleme) */
  cell?: Cell | null;
  /** Kayıt başarılı olunca çağrılır (pencereyi üst bileşen kapatır) */
  onSaved: () => void;
};

/**
 * Moderatör: sponsor hesabın mekân bilgisini girer/değiştirir (ad, adres, telefon, kapanış saati, aylık kod kotası).
 * Haritadaki bir peteğe dokunup “Mekân ekle” denirse mekân o peteğe yerleşir.
 */
export function VenueAdminModal(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={props.onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {props.visible ? <Card {...props} /> : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function Card({ onClose, sponsors, sponsor, cell, onSaved }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(sponsor?.user_id ?? null);
  const picked = sponsor ?? sponsors.find((s) => s.user_id === pickedId) ?? null;
  const [name, setName] = useState(picked?.name ?? '');
  const [address, setAddress] = useState(picked?.address ?? '');
  const [phone, setPhone] = useState(picked?.phone ?? '');
  const [hours, setHours] = useState(picked?.closing_hours ?? '');
  const [quota, setQuota] = useState(
    picked?.code_quota !== null && picked?.code_quota !== undefined ? String(picked.code_quota) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(s: SponsorRow) {
    setPickedId(s.user_id);
    setName(s.name);
    setAddress(s.address ?? '');
    setPhone(s.phone ?? '');
    setHours(s.closing_hours ?? '');
    setQuota(s.code_quota !== null ? String(s.code_quota) : '');
    setError(null);
  }

  async function submit() {
    if (busy || !picked) return;
    const q = quota.trim() === '' ? null : Number(quota);
    if (q !== null && (!Number.isInteger(q) || q < 0 || q > 1000)) {
      setError(
        'Kod kotası 0 ile 1000 arasında bir sayı olmalı (boş bırakırsan varsayılan kota geçerli olur).',
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await adminSaveVenue({
      userId: picked.user_id,
      name,
      address,
      phone,
      hours,
      codeQuota: q,
      cell: cell ?? undefined,
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else onSaved();
  }

  const needPick = !sponsor && !picked;

  return (
    <View style={styles.card} testID="venue-admin-modal">
      <Text style={styles.title} accessibilityRole="header">
        {cell ? 'Bu peteğe mekân ekle' : 'Mekân bilgisi'}
      </Text>
      {cell ? (
        <Text
          style={styles.message}
        >{`${areaOf(cell.q, cell.r)} bölgesindeki bu peteğe bir sponsor hesabı mekân olarak yerleştirilir. Mekân, yalnızca bu petek açılınca etkinliklerin altında görünür.`}</Text>
      ) : null}
      {needPick ? (
        sponsors.length === 0 ? (
          <Text style={styles.message}>
            Henüz sponsor hesap yok. Önce Supabase’de bir hesabın rolünü “sponsor” yapman gerekir (Kurulum
            Rehberi’nde anlatılıyor).
          </Text>
        ) : (
          <>
            <Text style={styles.message}>Hangi sponsor hesabı mekân olacak?</Text>
            <ScrollView style={styles.pickList} nestedScrollEnabled>
              {sponsors.map((s) => (
                <Pressable
                  key={s.user_id}
                  onPress={() => pick(s)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
                >
                  <Text style={styles.pickName}>{s.name}</Text>
                  <Text style={styles.pickSub}>
                    {s.cell_q !== null
                      ? 'Haritada'
                      : s.has_venue
                        ? 'Bilgisi var, haritada değil'
                        : 'Bilgisi girilmemiş'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )
      ) : (
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextField
            label="Mekân adı (hesabın görünen adı)"
            icon="storefront-outline"
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
          <TextField
            label="Adres *"
            icon="location-outline"
            value={address}
            onChangeText={setAddress}
            maxLength={200}
            multiline
          />
          <TextField
            label="Telefon (isteğe bağlı)"
            icon="call-outline"
            value={phone}
            onChangeText={setPhone}
            maxLength={30}
            keyboardType="phone-pad"
          />
          <TextField
            label="Kapanış saati *"
            icon="time-outline"
            value={hours}
            onChangeText={setHours}
            placeholder="Örn. Her gün 02:00"
            maxLength={60}
          />
          <TextField
            label="Aylık kod kotası (boş = varsayılan)"
            icon="ticket-outline"
            value={quota}
            onChangeText={(t) => setQuota(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
          />
        </ScrollView>
      )}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {!needPick ? (
        <PrimaryButton
          label="Kaydet"
          onPress={() => void submit()}
          loading={busy}
          testID="venue-admin-save"
        />
      ) : null}
      <PrimaryButton label="Vazgeç" onPress={onClose} variant="ghost" disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  card: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  form: { flexGrow: 0 },
  formContent: { gap: spacing.md },
  pickList: { maxHeight: 260 },
  pickRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
    gap: 2,
  },
  pickName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  pickSub: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.75 },
});
