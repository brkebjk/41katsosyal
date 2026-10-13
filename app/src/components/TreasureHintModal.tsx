import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CloseX } from '@/components/CloseX';
import { cellName } from '@/lib/cellNames';
import { DIFFICULTY_LABEL, TREASURE_COLORS, treasureImageUrl, type Treasure } from '@/lib/treasure';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** “İpucunu gör”: ipucu metni; fotoğrafı varsa “Fotoğrafı gör” ile fotoğraflar açılır. */
export function TreasureHintModal({ treasure, onClose }: { treasure: Treasure | null; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const [showPhotos, setShowPhotos] = useState(false);
  const t = treasure;
  const imgW = Math.min(width - spacing.lg * 4, 420);
  return (
    <Modal visible={t !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        {t ? (
          <View style={[styles.card, { borderColor: TREASURE_COLORS[t.difficulty] }]} testID="treasure-hint">
            <View style={styles.head}>
              <Ionicons name="bulb" size={20} color={TREASURE_COLORS[t.difficulty]} />
              <Text style={styles.title} numberOfLines={1}>
                {`İpucu · ${cellName({ q: t.cell_q, r: t.cell_r })}`}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
                <CloseX size={16} />
              </Pressable>
            </View>
            <Text style={styles.meta}>{`${DIFFICULTY_LABEL[t.difficulty]} hazine · ${t.points} puan`}</Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
              <Text style={styles.hint}>{t.hint}</Text>
              {t.image_paths.length > 0 ? (
                showPhotos ? (
                  t.image_paths.map((p) => (
                    <Image
                      key={p}
                      source={{ uri: treasureImageUrl(p) ?? undefined }}
                      contentFit="contain"
                      style={{ width: imgW, height: imgW * 0.75, borderRadius: radii.md }}
                    />
                  ))
                ) : (
                  <View style={styles.stretch}>
                    <PrimaryButton
                      label={`Fotoğrafı gör (${t.image_paths.length})`}
                      variant="ghost"
                      onPress={() => setShowPhotos(true)}
                    />
                  </View>
                )
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.82)' },
  card: {
    maxHeight: '86%',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs },
  scroll: { flexGrow: 0 },
  body: { gap: spacing.md, alignItems: 'center' },
  stretch: { alignSelf: 'stretch' },
  hint: { alignSelf: 'stretch', color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
});
