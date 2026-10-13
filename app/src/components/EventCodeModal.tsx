import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { KeyboardLift } from '@/components/KeyboardLift';
import { DragDismiss } from '@/components/Sheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { confirmAction, notify } from '@/lib/dialog';
import { callRpc } from '@/lib/rpc';
import {
  SAME_CELL_TODAY,
  cleanEventCode,
  getEventCode,
  pointsNoteText,
  regenerateEventCode,
  verifyAttendance,
  type VerifyResult,
} from '@/lib/events';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

export type CodeRequest = { mode: 'host' | 'attendee'; event: { id: string; title: string; category?: string } };

type Props = {
  /** null ise pencere kapalıdır */
  request: CodeRequest | null;
  onClose: () => void;
  /** Katılım doğrulanınca çağrılır (liste yenilensin diye) */
  onVerified: () => void;
};

/**
 * Katılım kodu penceresi.
 * - Etkinliği açan kişi: kodu görür (ve gerekirse yeniler); kodu yerinde katılımcılara söyler.
 * - Katılan üye: etkinlik yerinde kodu yazar; doğruysa katıldığı kayda geçer ve puan kazanır.
 */
export function EventCodeModal({ request, onClose, onVerified }: Props) {
  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {request ? (
          <DragDismiss onClose={onClose}>
            {request.mode === 'host' ? (
              <HostCard key={request.event.id} event={request.event} onClose={onClose} />
            ) : (
              <AttendeeCard key={request.event.id} event={request.event} onClose={onClose} onVerified={onVerified} />
            )}
          </DragDismiss>
        ) : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function HostCard({ event, onClose }: { event: CodeRequest['event']; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getEventCode(event.id).then((res) => {
      if (!active) return;
      setCode(res.code);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [event.id]);

  async function renew() {
    const ok = await confirmAction(
      'Kodu yenile',
      'Yeni bir kod üretilir ve eski kod geçersiz olur. Kodu yanlış kişiye verdiysen yenile. Daha önce doğrulanan katılımlar etkilenmez.',
      'Yenile',
    );
    if (!ok) return;
    setBusy(true);
    const res = await regenerateEventCode(event.id);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setError(null);
      setCode(res.code);
    }
  }

  return (
    <View style={styles.card} testID="event-code-host">
      <Text style={styles.title} accessibilityRole="header">
        Katılım kodun
      </Text>
      <Text style={styles.message}>
        Bu kodu yalnızca etkinliğe gelen katılımcılara, etkinlik yerinde söyle. Kodu yazan kişinin katıldığı
        doğrulanır (bulunduğu bölge de bir kez kontrol edilir) ve ikiniz de puan kazanırsınız. Puanlar, en az
        4 kişinin katılımı doğrulanınca açılır. Kodu önceden paylaşma, ekran görüntüsü gönderme. Kodla katılan
        biri olduktan sonra etkinliği kendin kaldıramazsın; moderatöre talep gönderirsin.
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : code ? (
        <View style={styles.codeBox} accessibilityLabel={`Kod: ${code.split('').join(' ')}`}>
          <Text style={styles.code} selectable>
            {code}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Text style={styles.small}>{event.title}</Text>
      {code ? (
        <PrimaryButton label="Kodu yenile" variant="ghost" onPress={() => void renew()} loading={busy} />
      ) : null}
      <PrimaryButton label="Kapat" onPress={onClose} disabled={busy} />
    </View>
  );
}

function AttendeeCard({
  event,
  onClose,
  onVerified,
}: {
  event: CodeRequest['event'];
  onClose: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Extract<VerifyResult, { ok: true }> | null>(null);
  const concert = event.category === 'konser_festival';

  // Konser & Festival: kod düzenleyen tarafından söylenmez; katılan üye kodu kendisi görür (yine konumla doğrulanır)
  useEffect(() => {
    if (!concert) return;
    let active = true;
    void callRpc<string>('get_concert_code', { p_event_id: event.id }).then(({ data }) => {
      if (active && typeof data === 'string') setCode(data);
    });
    return () => {
      active = false;
    };
  }, [concert, event.id]);

  async function submit() {
    if (busy) return;
    if (code.length < 6) {
      setError('Kod 6 harf ya da rakamdan oluşur. Etkinliği açan kişiden öğren.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await verifyAttendance(event.id, code);
    setBusy(false);
    if (res.ok) {
      setDone(res);
      onVerified();
    } else if (res.wrongCode) {
      setError(
        'Kod yanlış. Etkinliği açan kişiden kodu tekrar öğren. Çok fazla yanlış denemede giriş 10 dakika kilitlenir.',
      );
    } else if (res.error === SAME_CELL_TODAY) {
      // Aynı gün aynı petekte ikinci etkinlik: uyarı penceresi
      setError(null);
      await notify('Bugün bu petekte zaten katıldın', SAME_CELL_TODAY, { icon: 'alert-circle' });
    } else {
      setError(res.error);
    }
  }

  if (done) {
    const waiting = !done.released;
    const noteText = pointsNoteText(done.note);
    return (
      <View style={styles.card} testID="event-code-done">
        <Text style={styles.title} accessibilityRole="header">
          {waiting ? 'Katılımın kaydedildi' : 'Katılımın doğrulandı'}
        </Text>
        <Text style={styles.message}>
          {waiting
            ? `${done.already ? 'Katılımın zaten kayıtlı.' : 'Teşekkürler!'} Puanlar, etkinlikte en az ${done.needed} kişinin katılımı doğrulanınca otomatik eklenir (şu an ${done.verified}/${done.needed}). Aynı gün aynı kategoriden yalnızca bir etkinlikten puan yazılır.`
            : noteText
              ? `Katılımın kayda geçti. ${noteText}`
              : done.already
                ? 'Bu etkinliğe katıldığın zaten kayıtlıydı.'
                : done.points > 0
                  ? `Teşekkürler! ${done.points} puan kazandın.`
                  : 'Teşekkürler! Katılımın kayda geçti. Bu etkinlik puan vermiyor.'}
        </Text>
        <PrimaryButton label="Tamam" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.card} testID="event-code-attendee">
      <Text style={styles.title} accessibilityRole="header">
        Katıldığını doğrula
      </Text>
      <Text style={styles.message}>
        {concert
          ? `“${event.title}”: konser kodu kendiliğinden yazıldı. Etkinlik alanındayken “Doğrula”ya bas; konumun bir kez kontrol edilir.`
          : `“${event.title}”: düzenleyenin söylediği 6 haneli kodu yaz.`}
      </Text>
      <TextField
        label="Katılım kodu"
        icon="key-outline"
        value={code}
        onChangeText={(t) => {
          setCode(cleanEventCode(t));
          setError(null);
        }}
        placeholder="Örn. K7M2PX"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        autoFocus
        testID="event-code-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.btnRow}>
        <View style={styles.btn}>
          <PrimaryButton label="Vazgeç" onPress={onClose} variant="ghost" disabled={busy} />
        </View>
        <View style={styles.btn}>
          <PrimaryButton label="Doğrula" onPress={() => void submit()} loading={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', padding: spacing.md, paddingBottom: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1 },
  realName: { color: colors.primary, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSizes.xs + 1, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  loader: { paddingVertical: spacing.lg },
  codeBox: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: 34, letterSpacing: 8 },
  small: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
