import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PlacePicker } from '@/components/PlacePicker';
import { CloseX } from '@/components/CloseX';
import { PetekIcon } from '@/components/HexClusterIcon';
import { createPost, mentionTag, POST_MAX, THREAD_MAX } from '@/lib/feed';
import type { Cell } from '@/lib/hex';
import { notify } from '@/lib/dialog';
import { findNearbyPlaces, type Place } from '@/lib/map';
import { useDraftText } from '@/lib/drafts';
import { contentCity } from '@/lib/city';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  alias: string;
  isSponsor?: boolean;
  /** “Cevapla” ile seçilen gönderi: yazarı @rumuz ile etiketlenir */
  replyTo?: { id: string; alias: string } | null;
  onClearReply?: () => void;
  /** Zincir: kendi gönderime devam ekleniyor (part = eklenecek parçanın sırası, ör. 2) */
  threadOf?: { id: string; part: number } | null;
  onClearThread?: () => void;
  /** Petek akışına yazılıyorsa: hedef petek ve bulunduğum petek (konum eklenemez) */
  cell?: { cell: Cell; my: Cell } | null;
  /** Petek akışında kutunun üstünde görünen ad */
  cellLabel?: string | null;
  onCreated: () => void;
  onError: (message: string) => void;
};

/**
 * Akışın en altındaki yazı kutusu: pencere açılmaz, yazı doğrudan kutuya yazılır ve yazı uzadıkça kutu büyür.
 * Klavye açılınca kutu klavyeyle birlikte yukarı kayar. Yanındaki “+” ile gönderiye konum (yer) eklenir.
 */
export function InlineComposer({
  alias,
  isSponsor = false,
  replyTo = null,
  onClearReply,
  threadOf = null,
  onClearThread,
  cell = null,
  cellLabel = null,
  onCreated,
  onError,
}: Props) {
  const [text, setText] = useState('');
  // Yazılan gönderi taslak olarak saklanır (uygulama kapanıp açılsa da kaybolmaz); yanıt ve zincir ayrı tutulur
  useDraftText(
    replyTo ? `post-reply:${replyTo.id}` : threadOf ? `post-thread:${threadOf.id}` : cell ? 'post-cell' : 'post',
    text,
    setText,
  );
  const [place, setPlace] = useState<Place | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  type Preset = { places: (Place & { meters?: number })[]; fix: { lat: number; lon: number } };
  const [preset, setPreset] = useState<Preset | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  /** “+”: önce konum izni (pencereden önce), sonra yakındaki yerler hazır listelenmiş halde pencere açılır. */
  async function onPlus() {
    if (locating) return;
    setLocating(true);
    const res = await findNearbyPlaces();
    setLocating(false);
    if (res && !res.ok) {
      await notify('Konum alınamadı', `${res.message}\n\nİstersen yerin adını yazarak arayabilirsin.`, {
        icon: 'location',
      });
    }
    setPreset(res && res.ok ? { places: res.places, fix: res.fix } : null);
    setPickerKey((k) => k + 1);
    setPlaceOpen(true);
  }
  const [busy, setBusy] = useState(false);
  /** Zincirli paylaş: açıkken ilk gönderiden sonra her gönderim aynı zincire eklenir (en çok 5 parça) */
  const [chain, setChain] = useState(false);
  const [chainRoot, setChainRoot] = useState<{ id: string; part: number } | null>(null);
  /** Gönderince kutu ilk boyutuna dönsün diye yeniden kurulur */
  const [inputKey, setInputKey] = useState(0);
  const thread = threadOf ?? (chain ? chainRoot : null);
  const body = text.trim();
  const canSend = body.length > 0 && body.length <= POST_MAX && !busy;

  async function send() {
    if (!canSend) return;
    const tag = replyTo ? mentionTag(replyTo.alias) : '';
    const value = !thread && replyTo && !body.includes(tag) ? `${tag} ${body}` : body;
    if (value.length > POST_MAX) return onError(`Gönderi en fazla ${POST_MAX} karakter olabilir.`);
    setBusy(true);
    const res = thread
      ? await createPost(value, null, null, cell, thread.id, contentCity())
      : await createPost(value, cell ? null : (place?.id ?? null), replyTo?.id ?? null, cell, null, contentCity());
    setBusy(false);
    if (res.error) return onError(res.error);
    setText('');
    setPlace(null);
    setInputKey((k) => k + 1);
    onClearReply?.();
    if (threadOf) {
      onClearThread?.();
    } else if (chain) {
      // Zincir modu: ilk gönderi zincirin başı olur; 5 parçaya ulaşınca kapanır
      const next = chainRoot ? { id: chainRoot.id, part: chainRoot.part + 1 } : res.id ? { id: res.id, part: 2 } : null;
      if (!next || next.part > THREAD_MAX) {
        setChain(false);
        setChainRoot(null);
      } else setChainRoot(next);
    }
    onCreated();
  }

  return (
    <View style={styles.wrap} testID="inline-composer">
      <View style={styles.row}>
        {/* Solda üst üste eşit boyda iki düğme: konum (+) ve zincirli paylaş */}
        <View style={styles.side}>
          {!cell && !thread ? (
            <Pressable
              onPress={() => void onPlus()}
              disabled={locating}
              accessibilityRole="button"
              accessibilityLabel="Konum ekle"
              hitSlop={4}
              testID="composer-plus"
              style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
            >
              {locating ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons name="add" size={24} color={colors.primary} />
              )}
            </Pressable>
          ) : null}
          {!threadOf ? (
            <Pressable
              onPress={() => {
                setChain((c) => !c);
                setChainRoot(null);
                setPlace(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={chain ? 'Zincirli paylaşımı kapat' : 'Zincirli paylaş'}
              accessibilityState={{ selected: chain }}
              hitSlop={4}
              testID="composer-chain"
              style={({ pressed }) => [styles.plus, chain && styles.chainOn, pressed && styles.pressed]}
            >
              <Ionicons name="git-commit-outline" size={22} color={chain ? colors.primaryText : colors.primary} />
            </Pressable>
          ) : null}
        </View>
        {/* Sağda: etiketler ("Anonim yazıyorsun" vb.) yazı kutusunun hemen üstünde, altında yazı kutusu ve gönder */}
        <View style={styles.main}>
          <View style={styles.tags}>
            <View style={styles.anon}>
              <Ionicons name={isSponsor ? 'storefront-outline' : 'eye-off-outline'} size={13} color={colors.accent} />
              <Text style={styles.anonText} numberOfLines={1}>
                {isSponsor ? `Mekân adınla yazıyorsun · ${alias}` : `Anonim yazıyorsun · ${alias}`}
              </Text>
            </View>
            {cellLabel ? (
              <View style={styles.tag}>
                <PetekIcon size={12} color={colors.primary} />
                <Text style={styles.tagText} numberOfLines={1}>
                  {cellLabel}
                </Text>
              </View>
            ) : null}
            {chain && !threadOf ? (
              <Pressable
                onPress={() => {
                  setChain(false);
                  setChainRoot(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Zincirli paylaşımı kapat"
                style={styles.tag}
              >
                <Ionicons name="git-commit-outline" size={12} color={colors.primary} />
                <Text style={styles.tagText} numberOfLines={1}>
                  {chainRoot ? `Zincir · ${chainRoot.part}/${THREAD_MAX}. parça` : 'Zincirli paylaş · 1. parça'}
                </Text>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {threadOf ? (
              <Pressable
                onPress={onClearThread}
                accessibilityRole="button"
                accessibilityLabel="Zincire eklemeyi iptal et"
                style={styles.tag}
              >
                <Ionicons name="git-commit-outline" size={12} color={colors.primary} />
                <Text
                  style={styles.tagText}
                  numberOfLines={1}
                >{`Zincire ekleniyor · ${threadOf.part}/${THREAD_MAX}`}</Text>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {replyTo && !threadOf ? (
              <Pressable
                onPress={onClearReply}
                accessibilityRole="button"
                accessibilityLabel="Cevabı iptal et"
                style={styles.tag}
              >
                <Ionicons name="return-down-forward" size={12} color={colors.primary} />
                <Text style={styles.tagText} numberOfLines={1}>{mentionTag(replyTo.alias)}</Text>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {place ? (
              <Pressable
                onPress={() => setPlace(null)}
                accessibilityRole="button"
                accessibilityLabel="Yeri kaldır"
                style={styles.tag}
              >
                <Ionicons name="location" size={12} color={colors.primary} />
                <Text style={styles.tagText} numberOfLines={1}>
                  {place.name}
                </Text>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              key={inputKey}
              value={text}
              onChangeText={setText}
              placeholder="Etiketlemek için @ ve rumuz numarasını yaz (ör. @145)"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              multiline
              maxLength={POST_MAX}
              scrollEnabled
              style={styles.input}
              accessibilityLabel="Gönderi yaz"
              testID="composer-input"
            />
            <Pressable
              onPress={() => void send()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Gönder"
              testID="composer-send"
              style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Ionicons name="send" size={22} color={colors.primaryText} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
      {body.length > POST_MAX - 80 ? <Text style={styles.counter}>{`${body.length}/${POST_MAX}`}</Text> : null}

      <Modal
        visible={placeOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPlaceOpen(false)}
      >
        <KeyboardLift style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPlaceOpen(false)} accessibilityLabel="Kapat" />
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text style={styles.modalTitle}>Konum ekle</Text>
              <Pressable
                onPress={() => setPlaceOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <CloseX size={16} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <PlacePicker
                key={pickerKey}
                value={place}
                preset={preset}
                startOpen
                onClose={() => setPlaceOpen(false)}
                onChange={(p) => {
                  setPlace(p);
                  if (p) setPlaceOpen(false);
                }}
              />
            </ScrollView>
          </View>
        </KeyboardLift>
        <DialogHost />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Arka zemin yok: yalnızca yazı kutusu ve düğmeler dolu; altındaki akış görünür
  wrap: {
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    pointerEvents: 'box-none',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, pointerEvents: 'box-none' },
  main: { flex: 1, gap: 4, pointerEvents: 'box-none' },
  // Gönder düğmesi yazı kutusuyla aynı boydadır: kutu uzadıkça düğme de uzar
  inputRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, pointerEvents: 'box-none' },
  anon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
  },
  anonText: { color: colors.accent, fontSize: fontSizes.xs, fontFamily: fonts.semi, flexShrink: 1 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
  },
  tagText: { color: colors.text, fontSize: fontSizes.xs, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, pointerEvents: 'box-none' },
  side: { gap: 6 },
  chainOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Yazı kutusu ve yanındaki düğmeler: belirgin çerçeve ve gölge (akışın üstünde ayırt edilsin)
  plus: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 211, 197, 0.55)',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  // Yazdıkça kendiliğinden uzar (en çok ~10 satır); daha uzunsa kutunun içinde kayar
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 220,
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 211, 197, 0.55)',
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  send: {
    width: 56,
    minHeight: 48,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  counter: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textAlign: 'right',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  modalRoot: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.78)' },
  modalCard: {
    maxHeight: '80%',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  modalScroll: { flexGrow: 0 },
});
