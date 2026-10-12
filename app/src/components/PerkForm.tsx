import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardLift } from '@/components/KeyboardLift';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { DialogHost } from '@/components/DialogHost';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { CloseX } from '@/components/CloseX';
import { confirmAction } from '@/lib/dialog';
import { deletePerk, inputToIso, isoToInput, savePerk, type Perk } from '@/lib/perks';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  /** Düzenlenen ayrıcalık; boşsa yeni ayrıcalık eklenir */
  perk: Perk | null;
  onClose: () => void;
  /** Kaydedilince ya da silinince çağrılır (liste yenilensin diye) */
  onChanged: () => void;
};

/** Moderatör: anlaşmalı işletme için abone ayrıcalığı ekle / düzenle / gizle / sil. */
export function PerkForm(props: Props) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
      presentationStyle="pageSheet"
      statusBarTranslucent
      navigationBarTranslucent
    >
      {props.visible ? <FormBody key={props.perk?.id ?? 'new'} {...props} /> : null}
      <DialogHost />
    </Modal>
  );
}

function FormBody({ perk, onClose, onChanged }: Props) {
  const [business, setBusiness] = useState(perk?.business_name ?? '');
  const [title, setTitle] = useState(perk?.title ?? '');
  const [description, setDescription] = useState(perk?.description ?? '');
  const [howTo, setHowTo] = useState(perk?.how_to ?? '');
  const [district, setDistrict] = useState(perk?.district ?? '');
  const [until, setUntil] = useState(isoToInput(perk?.valid_until ?? null));
  const [sort, setSort] = useState(String(perk?.sort_order ?? 100));
  const [active, setActive] = useState(perk?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  async function onSave() {
    if (busy) return;
    const b = business.trim();
    const t = title.trim();
    const d = description.trim();
    if (b.length < 2 || b.length > 80) return setError('İşletme adı zorunlu: 2 ile 80 karakter.');
    if (t.length < 3 || t.length > 120) return setError('Ayrıcalık başlığı zorunlu: 3 ile 120 karakter.');
    if (d.length < 5 || d.length > 400) return setError('Açıklama zorunlu: 5 ile 400 karakter.');
    if (howTo.trim().length > 400) return setError('“Nasıl kullanılır” en fazla 400 karakter olabilir.');
    const iso = inputToIso(until);
    if (iso === undefined) return setError('Son gün şu biçimde yazılmalı: 25.12.2026 (süresizse boş bırak).');
    const order = Number(sort.trim() === '' ? '100' : sort.trim());
    if (!Number.isInteger(order) || order < 0 || order > 1000) {
      return setError('Sıra numarası 0 ile 1000 arasında bir sayı olmalı.');
    }
    setError(null);
    setBusy('save');
    const res = await savePerk({
      id: perk?.id ?? null,
      businessName: b,
      title: t,
      description: d,
      howTo: howTo.trim(),
      district: district.trim(),
      validUntil: iso,
      isActive: active,
      sortOrder: order,
    });
    setBusy(null);
    if (res.error) return setError(res.error);
    onChanged();
  }

  async function onDelete() {
    if (!perk || busy) return;
    const ok = await confirmAction(
      'Ayrıcalığı sil',
      `“${perk.business_name} – ${perk.title}” kalıcı olarak silinir. Geçici olarak kaldırmak istiyorsan silmek yerine “Üyelere göster”i kapat.`,
      'Sil',
    );
    if (!ok) return;
    setBusy('delete');
    const res = await deletePerk(perk.id);
    setBusy(null);
    if (res.error) return setError(res.error);
    onChanged();
  }

  return (
    <DragScreen onClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <DragGrab />
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {perk ? 'Ayrıcalığı düzenle' : 'Ayrıcalık ekle'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
            <CloseX size={20} />
          </Pressable>
        </View>
        <KeyboardLift style={styles.flex} inModal>
          <KeyboardAwareScroll
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.note}>
              Aboneler tüm ayrıntıları görür. Abone olmayan üyeler yalnızca işletme adını ve başlığı görür.
            </Text>
            <TextField
              label="İşletme adı *"
              icon="storefront-outline"
              value={business}
              onChangeText={setBusiness}
              placeholder="Örn. Kule Kafe"
              maxLength={80}
              testID="perk-business"
            />
            <TextField
              label="Ayrıcalık başlığı *"
              icon="pricetag-outline"
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Tüm içeceklerde %10 indirim"
              maxLength={120}
              testID="perk-title"
            />
            <TextField
              label="Açıklama *"
              icon="document-text-outline"
              value={description}
              onChangeText={setDescription}
              placeholder="Ayrıcalığın kapsamı, koşulları"
              multiline
              maxLength={400}
              style={styles.multiline}
              textAlignVertical="top"
              testID="perk-description"
            />
            <TextField
              label="Nasıl kullanılır? (isteğe bağlı)"
              icon="information-circle-outline"
              value={howTo}
              onChangeText={setHowTo}
              placeholder="Örn. Kasada üyelik kartını göster"
              multiline
              maxLength={400}
              style={styles.multiline}
              textAlignVertical="top"
              testID="perk-howto"
            />
            <TextField
              label="Bölge / ilçe (isteğe bağlı)"
              icon="location-outline"
              value={district}
              onChangeText={setDistrict}
              placeholder="Örn. İzmit"
              maxLength={40}
            />
            <TextField
              label="Son geçerlilik günü (isteğe bağlı)"
              icon="calendar-outline"
              value={until}
              onChangeText={setUntil}
              placeholder="GG.AA.YYYY, süresizse boş bırak"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              testID="perk-until"
            />
            <TextField
              label="Sıra numarası (küçük olan üstte)"
              icon="swap-vertical-outline"
              value={sort}
              onChangeText={(v) => setSort(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Pressable
              onPress={() => setActive((a) => !a)}
              accessibilityRole="switch"
              accessibilityState={{ checked: active }}
              style={styles.switchRow}
              testID="perk-active"
            >
              <Ionicons
                name={active ? 'checkbox' : 'square-outline'}
                size={24}
                color={active ? colors.primary : colors.textMuted}
              />
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Üyelere göster</Text>
                <Text style={styles.note}>
                  Kapatırsan ayrıcalık üyelere görünmez; yalnızca sen (moderatör) görürsün.
                </Text>
              </View>
            </Pressable>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton label="Kaydet" onPress={() => void onSave()} loading={busy === 'save'} />
            {perk ? (
              <PrimaryButton
                label="Ayrıcalığı sil"
                variant="danger"
                onPress={() => void onDelete()}
                loading={busy === 'delete'}
              />
            ) : null}
            <Text style={styles.footnote}>* ile işaretli alanlar zorunludur.</Text>
          </KeyboardAwareScroll>
        </KeyboardLift>
      </SafeAreaView>
    </DragScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  note: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
  multiline: { minHeight: 80, paddingTop: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footnote: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
});
