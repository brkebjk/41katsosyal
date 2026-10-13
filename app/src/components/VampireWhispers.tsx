import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import type { VvView, VvWhisper } from '@/lib/vampire';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const MAX_LEN = 120;
/** Listede en çok bu kadar fısıltı gösterilir (en yeniler) */
const SHOW = 8;

/**
 * Vampir–Köylü fısıltıları: herkes kimin kime fısıldadığını görür, içerik yalnızca gönderen ve alana görünür.
 * Her oyuncunun oyun başına sınırlı hakkı vardır; cevap vermek de hak yer.
 */
export function WhisperPanel({
  view,
  onCompose,
  onReply,
  onReport,
}: {
  view: VvView;
  onCompose: () => void;
  onReply: (w: VvWhisper) => void;
  onReport: (w: VvWhisper) => void;
}) {
  const me = view.me;
  const myId = view.players.find((p) => p.is_me)?.id ?? null;
  const night = view.phase === 'night';
  const canSend =
    view.status === 'playing' &&
    !night &&
    me.is_player &&
    me.is_alive &&
    !me.left &&
    view.whispers_left > 0 &&
    view.whisper_limit > 0;
  const aliveIds = new Set(view.players.filter((p) => p.is_alive && !p.left).map((p) => p.id));
  const list = view.whispers.slice(-SHOW).reverse();
  if (view.whisper_limit <= 0) return null;
  return (
    <View style={styles.card} testID="vv-whispers">
      <View style={styles.head}>
        <Text style={styles.title}>🤫 Fısıltılar</Text>
        {me.is_player ? <Text style={styles.left}>{`${view.whispers_left}/${view.whisper_limit} hakkın`}</Text> : null}
      </View>
      {list.length === 0 ? (
        <Text style={styles.muted}>Henüz kimse fısıldamadı. Fısıltının içeriğini yalnızca alan kişi görür.</Text>
      ) : (
        list.map((w) => {
          const mineOut = w.from === myId;
          const mineIn = w.to === myId;
          if (mineIn) {
            const canReply = canSend && aliveIds.has(w.from);
            return (
              <Pressable
                key={w.id}
                onLongPress={() => onReport(w)}
                delayLongPress={400}
                accessibilityHint="Bildirmek için uzun bas"
                style={[styles.row, styles.rowIn]}
              >
                <Text style={styles.who}>{`${w.from_name} sana ${w.reply ? 'cevap verdi' : 'fısıldadı'}`}</Text>
                <Text style={styles.body}>{`“${w.body ?? ''}”`}</Text>
                <View style={styles.actions}>
                  {canReply ? (
                    <Pressable
                      onPress={() => onReply(w)}
                      accessibilityRole="button"
                      accessibilityLabel={`${w.from_name} kişisine cevap ver`}
                      style={({ pressed }) => [styles.replyBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="arrow-undo" size={13} color="#1A1200" />
                      <Text style={styles.replyText}>Cevapla (1 hak)</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => onReport(w)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Bu fısıltıyı bildir"
                    style={styles.flag}
                  >
                    <Ionicons name="flag-outline" size={15} color={colors.textMuted} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }
          if (mineOut) {
            return (
              <View key={w.id} style={[styles.row, styles.rowOut]}>
                <Text style={styles.who}>{`Sen → ${w.to_name}`}</Text>
                <Text style={styles.body}>{`“${w.body ?? ''}”`}</Text>
              </View>
            );
          }
          return (
            <View key={w.id} style={styles.row}>
              <Text style={styles.public}>
                <Text style={styles.name}>{w.from_name}</Text>
                {', '}
                <Text style={styles.name}>{w.to_name}</Text>
                {w.reply ? ' kişisine cevap fısıldadı' : ' kişisine fısıldadı'}
              </Text>
            </View>
          );
        })
      )}
      {night && view.status === 'playing' && me.is_player && me.is_alive ? (
        <Text style={styles.muted}>🌙 Gece herkes uyuyor; fısıltı sabah açılır.</Text>
      ) : canSend ? (
        <PrimaryButton label={`Fısılda (${view.whispers_left} hak)`} variant="ghost" onPress={onCompose} />
      ) : view.status === 'playing' && me.is_player && me.is_alive && view.whispers_left <= 0 ? (
        <Text style={styles.muted}>Bu oyundaki fısıltı hakların bitti.</Text>
      ) : null}
    </View>
  );
}

/** Fısıltı yazma penceresi. `replyTo` doluysa alıcı sabittir (cevap). */
export function WhisperCompose({
  view,
  replyTo,
  initialTo = null,
  onClose,
  onSend,
}: {
  view: VvView;
  replyTo: VvWhisper | null;
  /** Avatardan açılınca alıcı önceden seçili gelir */
  initialTo?: string | null;
  onClose: () => void;
  onSend: (to: string, body: string, replyTo: string | null) => Promise<string | null>;
}) {
  const targets = view.players.filter((p) => p.is_alive && !p.left && !p.is_me);
  const [to, setTo] = useState<string | null>(replyTo ? replyTo.from : initialTo);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = text.trim();
  const ready = !!to && body.length > 0 && !busy;

  async function send() {
    if (!ready || !to) return;
    setBusy(true);
    setError(null);
    const err = await onSend(to, body, replyTo?.id ?? null);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Popup
      title={replyTo ? `${replyTo.from_name} kişisine cevap` : 'Fısılda'}
      subtitle="Herkes fısıldadığını görür, ne yazdığını yalnızca o görür."
      icon="ear"
      onClose={onClose}
      footer={
        <PrimaryButton
          label={`Gönder (${view.whispers_left} hakkından 1'i gider)`}
          onPress={() => void send()}
          disabled={!ready}
          loading={busy}
        />
      }
    >
      {replyTo ? (
        <View style={[styles.row, styles.rowIn]}>
          <Text style={styles.who}>{`${replyTo.from_name} yazdı:`}</Text>
          <Text style={styles.body}>{`“${replyTo.body ?? ''}”`}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Kime?</Text>
          <View style={styles.chips}>
            {targets.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setTo(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: to === p.id }}
                style={[styles.chip, to === p.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, to === p.id && styles.chipTextOn]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <TextField
        label={`Mesaj (${body.length}/${MAX_LEN})`}
        value={text}
        onChangeText={setText}
        maxLength={MAX_LEN}
        placeholder="Kısa ve gizli bir not…"
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.muted}>Hakaret ya da kişisel bilgi isteme yasaktır; alan kişi fısıltıyı bildirebilir.</Text>
    </Popup>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(155, 123, 255, 0.45)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  left: { color: '#C4B5FD', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  row: { gap: 4, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  rowIn: { backgroundColor: 'rgba(155, 123, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(155, 123, 255, 0.5)' },
  rowOut: { backgroundColor: colors.surfaceAlt },
  who: { color: '#C4B5FD', fontFamily: fonts.extra, fontSize: 13 },
  body: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  public: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  name: { color: colors.text, fontFamily: fonts.semi },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  replyText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 13 },
  flag: { marginLeft: 'auto', padding: 4 },
  pressed: { opacity: 0.8 },
  label: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { borderColor: '#9B7BFF', backgroundColor: 'rgba(155, 123, 255, 0.3)' },
  chipText: { color: colors.text, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  chipTextOn: { color: '#FFFFFF' },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
});
