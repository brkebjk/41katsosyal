import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardLift } from '@/components/KeyboardLift';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { DialogHost } from '@/components/DialogHost';
import { PlacePicker } from '@/components/PlacePicker';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { CloseX } from '@/components/CloseX';
import { createPost, mentionTag, POST_MAX } from '@/lib/feed';
import type { Place } from '@/lib/map';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  alias: string;
  /** Mekân hesabı: rumuz yoktur, gönderi mekânın adıyla yayınlanır */
  isSponsor?: boolean;
  /** “Cevapla” ile açıldıysa cevaplanan gönderi: yazarı @rumuz ile etiketlenir */
  replyTo?: { id: string; alias: string } | null;
  onClose: () => void;
  onCreated: () => void;
};

/**
 * Yeni gönderi penceresi (sade): üstte “Anonim yazıyorsun”, altında konum ekle, sonra yazı kutusu. Paylaş düğmesi
 * yoktur; kutunun içindeki yuvarlak gönder düğmesiyle paylaşılır.
 */
export function PostComposer({ visible, alias, isSponsor = false, replyTo = null, onClose, onCreated }: Props) {
  const [text, setText] = useState(replyTo ? `${mentionTag(replyTo.alias)} ` : '');
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const length = text.trim().length;
  const canSend = length > 0 && length <= POST_MAX && !submitting;

  async function onSubmit() {
    if (submitting) return;
    const body = text.trim();
    if (body.length < 1) return setError('Önce bir şeyler yaz.');
    if (body.length > POST_MAX) return setError(`Gönderi en fazla ${POST_MAX} karakter olabilir.`);
    setError(null);
    setSubmitting(true);
    const res = await createPost(body, place?.id ?? null, replyTo?.id ?? null);
    setSubmitting(false);
    if (res.error) return setError(res.error);
    onCreated();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <DragGrab />
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {replyTo ? 'Cevapla' : 'Yeni gönderi'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={20} />
            </Pressable>
          </View>
          <KeyboardLift style={styles.flex} inModal>
            <KeyboardAwareScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View
                style={styles.anon}
                accessibilityLabel={isSponsor ? `Mekân adınla yazıyorsun: ${alias}` : 'Anonim yazıyorsun'}
              >
                <Ionicons name={isSponsor ? 'storefront-outline' : 'eye-off-outline'} size={14} color={colors.accent} />
                <Text style={styles.anonText}>
                  {isSponsor ? `Mekân adınla yazıyorsun · ${alias}` : `Anonim yazıyorsun · ${alias}`}
                </Text>
              </View>

              <PlacePicker value={place} onChange={setPlace} />

              <View style={styles.box}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Ne düşünüyorsun?"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                  multiline
                  maxLength={POST_MAX}
                  autoFocus
                  textAlignVertical="top"
                  style={styles.input}
                  accessibilityLabel="Ne düşünüyorsun?"
                />
                <View style={styles.boxFoot}>
                  <Text style={styles.counter}>{`${length}/${POST_MAX}`}</Text>
                  <Pressable
                    onPress={() => void onSubmit()}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel="Gönder"
                    testID="composer-send"
                    style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && styles.pressed]}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Ionicons name="arrow-up" size={22} color={colors.primaryText} />
                    )}
                  </Pressable>
                </View>
              </View>
              {replyTo ? (
                <Text style={styles.footnote}>
                  {`${mentionTag(replyTo.alias)} etiketlendi; gönderin onun ekranında “senden bahsedildi” olarak işaretlenir.`}
                </Text>
              ) : (
                <Text style={styles.footnote}>
                  Birini etiketlemek için @ ile rumuzunu yaz (ör. @Kaptan#145 ya da kısaca @#145).
                </Text>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.footnote}>
                Kurallara aykırı içerikler kaldırılabilir; moderatörler gerektiğinde yazarı görebilir.
              </Text>
            </KeyboardAwareScroll>
          </KeyboardLift>
        </SafeAreaView>
      </DragScreen>
      <DialogHost />
    </Modal>
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  anon: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124, 140, 255, 0.14)',
  },
  anonText: { color: colors.accent, fontSize: 12, fontFamily: fonts.semi },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: { minHeight: 150, color: colors.text, fontSize: fontSizes.md, lineHeight: 22, padding: 0 },
  boxFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: colors.textMuted, fontSize: fontSizes.xs },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footnote: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
});
