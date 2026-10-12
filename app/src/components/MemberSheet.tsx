import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { confirmAction } from '@/lib/dialog';
import {
  fmtPts,
  formatDate,
  isSubscriptionActive,
  packageRewardText,
  subscriptionUntilText,
  type PackageType,
} from '@/lib/labels';
import {
  awardPoints,
  banMember,
  getMember,
  grantSubscription,
  muteMember,
  revokeSubscription,
  sendMemberMessage,
  unbanMember,
  unmuteMember,
  type Member,
} from '@/lib/moderation';
import type { Result } from '@/lib/rpc';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  member: Member;
  onClose: () => void;
  /** Bir işlemden sonra üyenin güncel hali verilir (listeyi tazelemek için) */
  onChanged?: (member: Member) => void;
};

const PACKAGES: PackageType[] = ['daily', 'monthly', 'quarterly', 'yearly'];
const PACKAGE_SHORT: Record<PackageType, string> = {
  daily: '1 gün',
  monthly: '1 ay',
  quarterly: '3 ay',
  yearly: '1 yıl',
};
const MUTES = [
  { minutes: 60, label: '1 saat' },
  { minutes: 1440, label: '1 gün' },
  { minutes: 10080, label: '7 gün' },
  { minutes: 43200, label: '30 gün' },
];

function isMuted(m: Member): boolean {
  return Boolean(m.muted_until) && new Date(m.muted_until as string).getTime() > Date.now();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Moderatörün bir üye üzerindeki işlemleri: abonelik ver/al, sustur, askıya al, puan ver.
 * Yalnızca moderatör hesabıyla çalışır; sunucu her işlemde yetkiyi ayrıca denetler.
 */
export function MemberSheet({ member: initial, onClose, onChanged }: Props) {
  const [member, setMember] = useState<Member>(initial);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [points, setPoints] = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');

  const subscribed = isSubscriptionActive(member.premium_until);
  const muted = isMuted(member);
  const banned = Boolean(member.banned_at);
  const isAdmin = member.role === 'admin';
  const isSponsor = member.role === 'sponsor';

  /**
   * Tek seferde tek işlem: art arda basışlar (düğme henüz kapanmadan) ikinci işlem başlatmaz.
   * `confirm` verilirse, onay sorusu da kilidin içinde sorulur.
   */
  async function act(task: () => Promise<Result>, okText: string, confirm?: () => Promise<boolean>): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      if (confirm && !(await confirm())) return false;
      setMessage(null);
      const res = await task();
      if (res.error) {
        setMessage({ text: res.error, error: true });
        return false;
      }
      const fresh = await getMember(member.id);
      if (fresh) {
        setMember(fresh);
        onChanged?.(fresh);
      }
      setMessage({ text: okText, error: false });
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function onRevoke() {
    void act(
      () => revokeSubscription(member.id),
      'Abonelik kaldırıldı.',
      () =>
        confirmAction('Aboneliği kaldır', `${member.full_name} adlı üyenin aboneliği hemen sona erer.`, 'Kaldır', true),
    );
  }

  async function onBan() {
    const done = await act(
      () => banMember(member.id, banReason.trim() || undefined),
      'Hesap askıya alındı.',
      () =>
        confirmAction(
          'Hesabı askıya al',
          `${member.full_name} adlı üye uygulamaya giremez ve hiçbir şey yazamaz. İstersen sonra kaldırabilirsin.`,
          'Askıya al',
          true,
        ),
    );
    if (done) setBanReason('');
  }

  async function onPoints(sign: 1 | -1) {
    const n = Number(points.trim());
    if (!points.trim() || !Number.isInteger(n) || n < 1 || n > 10000) {
      setMessage({ text: 'Puan için 1 ile 10.000 arasında bir sayı yaz.', error: true });
      return;
    }
    const reason = pointsReason.trim() || (sign > 0 ? 'Moderatör puanı' : 'Moderatör puan düşümü');
    const done = await act(
      () => awardPoints(member.id, sign * n, reason),
      sign > 0 ? `${n} puan verildi.` : `${n} puan düşüldü.`,
    );
    if (done) {
      setPoints('');
      setPointsReason('');
    }
  }

  return (
    <Sheet title={member.full_name} subtitle={`Rumuzu: ${member.alias}`} onClose={onClose}>
      <View style={styles.top}>
        <Avatar index={member.avatar_index} size={56} ring />
        <View style={styles.topText}>
          <Text style={styles.meta}>
            {fmtPts(member.points)} puan · kayıt: {formatDate(member.created_at)}
          </Text>
          <View style={styles.chips}>
            {isAdmin ? <Tag icon="shield-checkmark" text="Moderatör" color={colors.accent} /> : null}
            {isSponsor ? <Tag icon="storefront" text="Mekân hesabı" color={colors.venue} /> : null}
            {subscribed ? <Tag icon="star" text="Abone" color={colors.primary} /> : null}
            {muted ? <Tag icon="volume-mute" text="Susturulmuş" color={colors.danger} /> : null}
            {banned ? <Tag icon="ban" text="Askıda" color={colors.danger} /> : null}
          </View>
        </View>
      </View>

      {isAdmin ? (
        <Text style={styles.note}>Bu hesap bir moderatör. Moderatörlere işlem uygulanamaz.</Text>
      ) : (
        <>
          {/* Abonelik (mekân hesaplarında yok) */}
          {!isSponsor ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Abonelik</Text>
              <Text style={styles.note}>
                {subscribed ? subscriptionUntilText(member.premium_until as string) : 'Şu an abone değil.'} Seçtiğin
                süre mevcut süreye eklenir.
              </Text>
              <View style={styles.chipRow}>
                {PACKAGES.map((p) => (
                  <ChipButton
                    key={p}
                    label={`+ ${PACKAGE_SHORT[p]}`}
                    disabled={busy}
                    onPress={() => void act(() => grantSubscription(member.id, p), `${packageRewardText[p]} eklendi.`)}
                  />
                ))}
              </View>
              {subscribed ? (
                <PrimaryButton label="Aboneliği kaldır" variant="ghost" onPress={onRevoke} disabled={busy} />
              ) : null}
            </View>
          ) : null}

          {/* Susturma */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Susturma</Text>
            <Text style={styles.note}>
              {muted
                ? `${formatDateTime(member.muted_until as string)} tarihine kadar yazamaz.`
                : 'Susturulan üye gönderi, yorum ve etkinlik oluşturamaz; okuyabilir.'}
            </Text>
            <View style={styles.chipRow}>
              {MUTES.map((m) => (
                <ChipButton
                  key={m.minutes}
                  label={m.label}
                  disabled={busy}
                  onPress={() => void act(() => muteMember(member.id, m.minutes), `${m.label} susturuldu.`)}
                />
              ))}
            </View>
            {muted ? (
              <PrimaryButton
                label="Susturmayı kaldır"
                variant="ghost"
                onPress={() => void act(() => unmuteMember(member.id), 'Susturma kaldırıldı.')}
                disabled={busy}
              />
            ) : null}
          </View>

          {/* Askıya alma */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hesap</Text>
            {banned ? (
              <>
                <Text style={styles.note}>Hesap askıda{member.ban_reason ? `: ${member.ban_reason}` : '.'}</Text>
                <PrimaryButton
                  label="Askıyı kaldır"
                  variant="ghost"
                  onPress={() => void act(() => unbanMember(member.id), 'Askı kaldırıldı.')}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Neden? (isteğe bağlı)"
                  icon="document-text-outline"
                  value={banReason}
                  onChangeText={setBanReason}
                  placeholder="Örn. tekrarlayan hakaret"
                  maxLength={200}
                />
                <PrimaryButton label="Hesabı askıya al" variant="danger" onPress={() => void onBan()} disabled={busy} />
              </>
            )}
          </View>

          {/* Puan (mekân hesapları puan almaz) */}
          {!isSponsor ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Puan</Text>
              <TextField
                label="Puan miktarı"
                icon="trophy-outline"
                value={points}
                onChangeText={(v) => setPoints(v.replace(/[^0-9]/g, ''))}
                placeholder="Örn. 50"
                keyboardType="number-pad"
                maxLength={5}
              />
              <TextField
                label="Neden? (isteğe bağlı)"
                icon="create-outline"
                value={pointsReason}
                onChangeText={setPointsReason}
                placeholder="Örn. Vampir–Köylü galibi"
                maxLength={80}
              />
              <View style={styles.row2}>
                <View style={styles.flex}>
                  <PrimaryButton label="Puan ver" onPress={() => void onPoints(1)} disabled={busy} />
                </View>
                <View style={styles.flex}>
                  <PrimaryButton label="Puan düş" variant="ghost" onPress={() => void onPoints(-1)} disabled={busy} />
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}

      {/* Özel mesaj: üyenin bildirim kutusuna düşer ve bir yazışma açar (üye cevap yazabilir) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Özel mesaj</Text>
        <Text style={styles.msgNote}>
          Üye seni “Kat Görevlisi” olarak görür ve cevap yazabilir. Yazışma Mesajlar sekmesinde açılır.
        </Text>
        <TextField
          label="Başlık"
          icon="mail-outline"
          value={msgTitle}
          onChangeText={setMsgTitle}
          maxLength={120}
          placeholder="Ör. Gönderin hakkında"
        />
        <TextField
          label="Mesaj"
          icon="create-outline"
          value={msgBody}
          onChangeText={setMsgBody}
          maxLength={1000}
          multiline
          placeholder="Üyenin bildirim kutusuna düşer"
        />
        <PrimaryButton
          label="Mesajı gönder"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void act(
              () => sendMemberMessage(member.id, msgTitle.trim(), msgBody.trim()),
              'Mesaj gönderildi; yazışma Mesajlar sekmesinde.',
            ).then((ok) => {
              if (ok) {
                setMsgTitle('');
                setMsgBody('');
              }
            })
          }
        />
      </View>

      {message ? (
        <Text
          style={[styles.message, message.error ? styles.messageError : styles.messageOk]}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </Text>
      ) : null}
    </Sheet>
  );
}

function Tag({
  icon,
  text,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  color: string;
}) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

function ChipButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.chipBtn, disabled && styles.chipBtnDisabled, pressed && styles.pressed]}
    >
      <Text style={styles.chipBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  topText: { flex: 1, gap: spacing.xs },
  meta: { color: colors.textMuted, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: { fontSize: 12, fontWeight: '700' },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  sectionTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  msgNote: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 16 },
  note: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipBtn: {
    minHeight: 42,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  chipBtnDisabled: { opacity: 0.45 },
  chipBtnText: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  row2: { flexDirection: 'row', gap: spacing.sm },
  message: { fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  messageError: { color: colors.danger },
  messageOk: { color: colors.success },
});
