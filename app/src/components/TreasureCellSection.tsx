import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Image } from 'expo-image';

import { DialogHost } from '@/components/DialogHost';
import { TreasureHintModal } from '@/components/TreasureHintModal';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { CloseX } from '@/components/CloseX';
import { cellName } from '@/lib/cellNames';
import { confirmAction, notify } from '@/lib/dialog';
import type { Cell } from '@/lib/hex';
import { formatWhen } from '@/lib/labels';
import {
  adminAddTreasureImage,
  adminRemoveTreasureImage,
  treasureImageUrl,
  adminCreateTreasure,
  adminListTreasures,
  adminRemoveTreasure,
  DIFFICULTIES,
  DIFFICULTY_ICON,
  DIFFICULTY_LABEL,
  TREASURE_COLORS,
  type AdminTreasure,
  type Difficulty,
  type Treasure,
} from '@/lib/treasure';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Petek menüsündeki hazine bölümü. Üye: hazine varsa zorluk, puan ve “İpucunu gör”. Moderatör: ayrıca kodu görür,
 * hazineyi kaldırır ya da boş peteğe yeni hazine gizler.
 */
export function TreasureCellSection({
  cell,
  treasure,
  isModerator,
  onChanged,
}: {
  cell: Cell;
  treasure: Treasure | null;
  isModerator: boolean;
  onChanged: () => void;
}) {
  const [admin, setAdmin] = useState<AdminTreasure | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);

  async function addPhoto() {
    if (!admin || imgBusy) return;
    setImgBusy(true);
    const res = await adminAddTreasureImage(admin.id, admin.image_paths ?? []);
    setImgBusy(false);
    if (res.error) return void notify('Fotoğraf eklenemedi', res.error);
    if (res.paths) {
      setAdmin({ ...admin, image_paths: res.paths });
      onChanged();
    }
  }

  async function removePhoto(path: string) {
    if (!admin) return;
    const ok = await confirmAction('Fotoğrafı kaldır', 'Bu ipucu fotoğrafı kaldırılsın mı?', 'Kaldır', true);
    if (!ok) return;
    const res = await adminRemoveTreasureImage(admin.id, admin.image_paths ?? [], path);
    if (res.error) return void notify('Kaldırılamadı', res.error);
    setAdmin({ ...admin, image_paths: (admin.image_paths ?? []).filter((p) => p !== path) });
    onChanged();
  }

  const loadAdmin = useCallback(async () => {
    if (!isModerator) return;
    const res = await adminListTreasures('active');
    setAdmin(res.data.find((t) => t.cell_q === cell.q && t.cell_r === cell.r) ?? null);
  }, [isModerator, cell.q, cell.r]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void loadAdmin();
  }, [loadAdmin]);

  async function remove() {
    if (!admin) return;
    const ok = await confirmAction('Hazineyi kaldır', `${cellName(cell)} peteğindeki hazine haritadan kalkar.`, 'Kaldır', true);
    if (!ok) return;
    const res = await adminRemoveTreasure(admin.id);
    if (res.error) return void notify('Kaldırılamadı', res.error);
    setAdmin(null);
    onChanged();
  }

  const t = treasure;
  return (
    <>
      {t ? (
        <View style={[styles.box, { borderColor: TREASURE_COLORS[t.difficulty] }]} testID="map-treasure">
          <View style={styles.head}>
            <Ionicons name="search" size={20} color={TREASURE_COLORS[t.difficulty]} />
            <Text style={[styles.title, { color: TREASURE_COLORS[t.difficulty] }]}>
              {`Bu petekte ${DIFFICULTY_LABEL[t.difficulty].toLocaleLowerCase('tr')} bir hazine var`}
            </Text>
          </View>
          <Text style={styles.meta}>{`${t.points} puan · son gün ${formatWhen(new Date(t.expires_at))}`}</Text>
          {isModerator && admin ? (
            <>
              <Text style={styles.code} selectable>{`Kod: ${admin.code}`}</Text>
              <View style={styles.photos}>
                {(admin.image_paths ?? []).map((p) => (
                  <Pressable key={p} onLongPress={() => void removePhoto(p)} accessibilityLabel="Fotoğraf (silmek için basılı tut)">
                    <Image source={{ uri: treasureImageUrl(p) ?? undefined }} contentFit="cover" style={styles.thumb} />
                  </Pressable>
                ))}
                {(admin.image_paths ?? []).length < 3 ? (
                  <Pressable
                    onPress={() => void addPhoto()}
                    disabled={imgBusy}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.thumb, styles.addThumb, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name={imgBusy ? 'hourglass-outline' : 'camera'} size={20} color={colors.primary} />
                    <Text style={styles.addThumbText}>{`${(admin.image_paths ?? []).length}/3`}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.meta}>İpucu fotoğrafı ekle (en çok 3, her biri 2 MB). Silmek için fotoğrafa basılı tut.</Text>
            </>
          ) : null}
          <View style={styles.btns}>
            <View style={styles.flex}>
              <PrimaryButton
                label="İpucunu gör"
                variant="ghost"
                onPress={() => setHintOpen(true)}
              />
            </View>
            {isModerator ? (
              <View style={styles.flex}>
                <PrimaryButton label="Kaldır" variant="ghost" onPress={() => void remove()} />
              </View>
            ) : (
              <View style={styles.flex}>
                <PrimaryButton label="Kodu gir" onPress={() => router.push('/hazine')} />
              </View>
            )}
          </View>
        </View>
      ) : isModerator ? (
        <PrimaryButton label="Bu peteğe hazine gizle" variant="ghost" onPress={() => setFormOpen(true)} />
      ) : null}
      <TreasureHintModal key={t?.id ?? 'none'} treasure={hintOpen ? t : null} onClose={() => setHintOpen(false)} />
      {isModerator ? (
        <TreasureCreateModal
          visible={formOpen}
          cell={cell}
          onClose={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            void loadAdmin();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

/** Moderatör: peteğe hazine gizleme penceresi. Kod sunucuda üretilir ve kaydedince bir kez gösterilir. */
function TreasureCreateModal({
  visible,
  cell,
  onClose,
  onCreated,
}: {
  visible: boolean;
  cell: Cell;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [hint, setHint] = useState('');
  const [expires, setExpires] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    if (!difficulty) return setError('Zorluk seviyesini seç.');
    if (hint.trim().length < 3) return setError('İpucu en az 3 karakter olmalı.');
    if (!expires || expires.getTime() < Date.now() + 3600_000) return setError('Geçerlilik tarihi en az 1 saat sonrası olmalı.');
    setBusy(true);
    setError(null);
    const res = await adminCreateTreasure({ cell, difficulty, hint, expiresAt: expires });
    setBusy(false);
    if (res.error) return setError(res.error);
    await notify(
      'Hazine gizlendi',
      `Kodu kâğıda yaz ve ${cellName(cell)} peteğinde sakla:\n\n${res.code ?? ''}\n\nKod moderatör panelinde > Hazineler’de de görünür.`,
      { icon: 'key', tone: 'success' },
    );
    setDifficulty(null);
    setHint('');
    setExpires(null);
    onCreated();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardLift style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={styles.modalCard}>
          <View style={styles.head}>
            <Ionicons name="search" size={20} color={colors.primary} />
            <Text style={styles.modalTitle}>{`Hazine gizle · ${cellName(cell)}`}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={16} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Zorluk</Text>
            <View style={styles.chips}>
              {DIFFICULTIES.map((d) => {
                const on = difficulty === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDifficulty(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, { borderColor: TREASURE_COLORS[d] }, on && { backgroundColor: TREASURE_COLORS[d] }]}
                  >
                    <Ionicons name={DIFFICULTY_ICON[d]} size={14} color={on ? '#071622' : TREASURE_COLORS[d]} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{DIFFICULTY_LABEL[d]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label="İpucu"
              icon="bulb-outline"
              value={hint}
              onChangeText={setHint}
              maxLength={300}
              multiline
              placeholder="Örn. Saat kulesinin gölgesi öğlen nereye düşer?"
            />
            <DateTimeField label="Geçerlilik (son gün ve saat)" value={expires} onChange={setExpires} days={120} />
            <Text style={styles.meta}>Kod 3 kelimeden oluşur ve kaydedince gösterilir. Kodu ilk giren puanı alır; kod tek kullanımlıktır.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Hazineyi gizle" onPress={() => void save()} loading={busy} />
          </ScrollView>
        </View>
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1.5, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  code: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  btns: { flexDirection: 'row', gap: spacing.sm },
  photos: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  thumb: { width: 64, height: 64, borderRadius: radii.md },
  addThumb: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addThumbText: { color: colors.primary, fontSize: 10, fontFamily: fonts.semi },
  flex: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: spacing.md },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.78)' },
  modalCard: {
    maxHeight: '90%',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  modalBody: { gap: spacing.md, paddingTop: spacing.sm },
  label: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  chipText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  chipTextOn: { color: '#071622' },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
