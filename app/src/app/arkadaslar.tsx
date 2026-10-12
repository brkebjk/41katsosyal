import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { goToDm } from '@/components/DirectMessages';
import { openDm } from '@/lib/dm';
import { NoticeDot } from '@/components/NoticeDot';
import { ListRow, Panel } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TitleBadge } from '@/components/TitleBadge';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import {
  cancelRequest,
  FRIEND_CONSEQUENCE,
  FRIEND_WARNING,
  getMyFriendCode,
  listFriendships,
  removeFriend,
  respondToRequest,
  sendRequestByCode,
  type FriendRow,
  type Friendships,
} from '@/lib/friends';
import { timeAgo } from '@/lib/labels';
import { REAL_NAME } from '@/lib/realName';
import type { Result } from '@/lib/rpc';
import { brand, colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** “5 dk” → “5 dk önce”; “dün” ve tarihler olduğu gibi kalır. */
function ago(iso: string): string {
  const t = timeAgo(iso);
  return /^\d+ (dk|sa|gün)$/.test(t) ? `${t} önce` : t;
}

const EMPTY: Friendships = { friends: [], incoming: [], outgoing: [] };

type Note = { text: string; error: boolean };

export default function FriendsScreen() {
  const [data, setData] = useState<Friendships>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    const [list, mine] = await Promise.all([listFriendships(), getMyFriendCode()]);
    setLoadError(list.error);
    if (!list.error) setData(list.data);
    if (mine.code) setCode(mine.code);
    setLoaded(true);
    return list.error ? null : list.data;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Tek seferde tek işlem: art arda basışlar ikinci işlem başlatmaz. */
  async function guard(id: string | null, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(id);
    try {
      await task();
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  }

  const onAccept = (row: FriendRow) =>
    guard(row.id, async () => {
      const ok = await confirmAction(
        'Arkadaşlık isteğini kabul et',
        `${row.alias} rumuzlu kişi sana arkadaşlık isteği gönderdi. ${FRIEND_CONSEQUENCE}`,
        'Kabul et',
        false,
        { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
      );
      if (!ok) return;
      setNote(null);
      const res = await respondToRequest(row.id, 'accept');
      const fresh = await load();
      if (res.error) {
        setNote({ text: res.error, error: true });
        return;
      }
      const name = fresh?.friends.find((f) => f.id === row.id)?.full_name;
      await notify(
        'Artık arkadaşsınız',
        name
          ? `${name} ile arkadaş oldunuz. Akışta onun gönderi ve yorumlarında artık gerçek adı görünecek.`
          : 'Arkadaş oldunuz. Akışta onun gönderi ve yorumlarında artık gerçek adı görünecek.',
        { icon: 'people', tone: 'success' },
      );
    });

  const onDecline = (row: FriendRow) =>
    guard(row.id, async () => {
      const choice = await showDialog<'decline' | 'block' | 'cancel'>({
        title: 'İsteği reddet',
        message: `${row.alias} rumuzlu kişiye reddettiğin söylenmez. İstersen onu engelleyebilirsin: gönderi ve yorumlarını bir daha görmezsin.`,
        icon: 'close-circle',
        tone: 'default',
        buttons: [
          { label: 'Reddet', value: 'decline', style: 'primary' },
          { label: 'Reddet ve engelle', value: 'block', style: 'danger' },
          { label: 'Vazgeç', value: 'cancel', style: 'ghost' },
        ],
        cancelValue: 'cancel',
      });
      if (choice === 'cancel') return;
      setNote(null);
      const res = await respondToRequest(row.id, choice === 'block' ? 'decline_block' : 'decline');
      await load();
      setNote(
        res.error
          ? { text: res.error, error: true }
          : {
              text: choice === 'block' ? 'İstek reddedildi ve kişi engellendi.' : 'İstek reddedildi.',
              error: false,
            },
      );
    });

  const onCancel = (row: FriendRow) =>
    guard(row.id, async () => {
      const ok = await confirmAction(
        'İsteği geri çek',
        `${row.alias} rumuzlu kişiye gönderdiğin arkadaşlık isteği silinir.`,
        'Geri çek',
        false,
        { icon: 'arrow-undo', tone: 'friend' },
      );
      if (!ok) return;
      await finish(await cancelRequest(row.id), 'İstek geri çekildi.');
    });

  const onRemove = (row: FriendRow) =>
    guard(row.id, async () => {
      const name = row.full_name ?? row.alias;
      const ok = await confirmAction(
        'Arkadaşlıktan çıkar',
        `${name} ile arkadaşlığınız biter. Birbirinizin gerçek adını artık görmezsiniz; akışta yine rumuzlarla görünürsünüz. Tekrar arkadaş olmak için yeniden istek göndermen gerekir.`,
        'Çıkar',
        true,
        { icon: 'person-remove' },
      );
      if (!ok) return;
      await finish(await removeFriend(row.id), 'Arkadaşlıktan çıkarıldı.');
    });

  /** Arkadaşa özel mesaj: yazışma akış ekranında açılır (arkadaş yazışması Pazartesi kapanmaz) */
  const onMessage = (row: FriendRow) =>
    guard(row.id, async () => {
      const res = await openDm({ friendship: row.id });
      if (res.error || !res.id) {
        setNote({ text: res.error ?? 'Mesaj açılamadı.', error: true });
        return;
      }
      goToDm(res.id);
    });

  async function finish(res: Result, okText: string) {
    setNote(null);
    await load();
    setNote(res.error ? { text: res.error, error: true } : { text: okText, error: false });
  }

  const onSendByCode = () =>
    guard(null, async () => {
      const typed = codeInput.trim();
      if (typed.length < 6) {
        setNote({ text: 'Arkadaş kodu 6 karakterdir. Kodu kontrol et.', error: true });
        return;
      }
      const ok = await confirmAction(
        'Arkadaşlık isteği gönder',
        `İstek ${typed.toUpperCase()} kodlu kişiye gidecek. ${FRIEND_CONSEQUENCE}`,
        'İsteği gönder',
        false,
        { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
      );
      if (!ok) return;
      setSending(true);
      setNote(null);
      const res = await sendRequestByCode(typed);
      setSending(false);
      if (res.error) {
        setNote({ text: res.error, error: true });
        return;
      }
      setCodeInput('');
      await load();
      if (res.outcome === 'accepted') {
        await notify(
          'Artık arkadaşsınız',
          'Karşı taraf da sana istek göndermişti. Birbirinizin gerçek adını artık görebilirsiniz.',
          { icon: 'people', tone: 'success' },
        );
      } else {
        await notify('İstek gönderildi', 'Karşı taraf kabul edince arkadaşlar listesinde görünür.', {
          icon: 'paper-plane',
          tone: 'friend',
        });
      }
    });

  async function onShareCode() {
    if (!code) return;
    try {
      await Share.share({ message: `${brand.name} arkadaş kodum: ${code}` });
    } catch {
      // Paylaşım penceresi açılamadıysa kod ekranda zaten görünüyor
    }
  }

  const { friends, incoming, outgoing } = data;

  return (
    <Screen
      title="Arkadaşlar"
      subtitle="Arkadaşlar birbirinin gerçek adını görür"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => void load()}
    >
      {note ? <Text style={[styles.note, note.error ? styles.noteError : styles.noteOk]}>{note.text}</Text> : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
        </View>
      ) : null}

      {incoming.length > 0 ? (
        <View style={styles.incomingBox} testID="incoming-requests">
          <View style={styles.incomingHead}>
            <View>
              <Ionicons name="person-add" size={26} color={colors.alert} />
              <NoticeDot count={incoming.length} ringColor={colors.bg} style={styles.incomingDot} />
            </View>
            <View style={styles.incomingHeadText}>
              <Text style={styles.incomingTitle}>
                {incoming.length === 1
                  ? '1 kişi sana arkadaşlık isteği gönderdi'
                  : `${incoming.length} kişi sana arkadaşlık isteği gönderdi`}
              </Text>
              <Text style={styles.incomingSub}>Kabul etmek ya da reddetmek tamamen sana kalmış.</Text>
            </View>
          </View>
          <RealNameNotice text={REAL_NAME.friend} />
          {incoming.map((row) => (
            <View key={row.id} style={styles.requestCard} testID="incoming-request">
              <View style={styles.requestTop}>
                <Avatar index={row.avatar_index} size={52} />
                <View style={styles.personText}>
                  <Text style={styles.requestName} numberOfLines={1}>
                    {row.alias}
                  </Text>
                  <Text style={styles.personSub}>sana arkadaşlık isteği gönderdi · {ago(row.created_at)}</Text>
                </View>
              </View>
              <View style={styles.requestButtons}>
                <View style={styles.requestBtn}>
                  <PrimaryButton
                    label="Kabul et"
                    onPress={() => void onAccept(row)}
                    loading={busyId === row.id}
                    testID="incoming-accept"
                  />
                </View>
                <View style={styles.requestBtn}>
                  <PrimaryButton
                    label="Reddet"
                    variant="ghost"
                    onPress={() => void onDecline(row)}
                    disabled={busyId === row.id}
                    testID="incoming-decline"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Panel title="Arkadaşlarım">
        {friends.length > 0 ? (
          friends.map((row) => (
            <PersonRow key={row.id} row={row} title={row.full_name ?? row.alias} subtitle={`Rumuzu: ${row.alias}`}>
              <SmallButton
                label="Mesaj"
                busy={busyId === row.id}
                onPress={() => void onMessage(row)}
                accessibilityLabel={`${row.full_name ?? row.alias} kişisine özel mesaj`}
              />
              <SmallButton
                label="Çıkar"
                busy={busyId === row.id}
                onPress={() => void onRemove(row)}
                accessibilityLabel={`${row.full_name ?? row.alias} arkadaşlığını bitir`}
              />
            </PersonRow>
          ))
        ) : (
          <ListRow
            icon="people-outline"
            title={loaded ? 'Henüz arkadaşın yok' : 'Yükleniyor…'}
            subtitle={
              loaded
                ? 'Akıştaki bir gönderinin ya da yorumun ⋯ menüsünden istek gönderebilir ya da aşağıdan kodla ekleyebilirsin.'
                : undefined
            }
          />
        )}
      </Panel>

      {outgoing.length > 0 ? (
        <Panel title="Gönderdiğim istekler" hint="Karşı taraf yanıt verene kadar burada bekler.">
          {outgoing.map((row) => (
            <PersonRow key={row.id} row={row} title={row.alias} subtitle="yanıt bekleniyor">
              <SmallButton
                label="Geri çek"
                busy={busyId === row.id}
                onPress={() => void onCancel(row)}
                accessibilityLabel={`${row.alias} isteğini geri çek`}
              />
            </PersonRow>
          ))}
        </Panel>
      ) : null}

      <Panel
        title="Kodla arkadaş ekle"
        hint="Yan yana oturduğun birine kodunu söyle; o da kodu buraya yazarak sana istek gönderir."
      >
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Senin arkadaş kodun</Text>
          <View style={styles.codeRow}>
            <Text
              style={styles.code}
              selectable
              accessibilityLabel={code ? `Arkadaş kodun ${code.split('').join(' ')}` : undefined}
            >
              {code ?? '······'}
            </Text>
            {code ? (
              <Pressable
                onPress={() => void onShareCode()}
                accessibilityRole="button"
                accessibilityLabel="Kodunu paylaş"
                hitSlop={8}
                style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
              >
                <Ionicons name="share-outline" size={18} color={colors.primary} />
                <Text style={styles.shareText}>Paylaş</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.codeBox}>
          <TextField
            label="Arkadaşının kodu"
            icon="key-outline"
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            returnKeyType="send"
            onSubmitEditing={() => void onSendByCode()}
          />
          <PrimaryButton
            label="İstek gönder"
            onPress={() => void onSendByCode()}
            loading={sending}
            disabled={codeInput.trim().length < 6}
          />
        </View>
      </Panel>
    </Screen>
  );
}

function PersonRow({
  row,
  title,
  subtitle,
  children,
}: {
  row: FriendRow;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.person}>
      <Avatar index={row.avatar_index} size={44} />
      <View style={styles.personText}>
        <Text style={styles.personTitle} numberOfLines={1}>
          {title}
        </Text>
        <TitleBadge label={row.title} />
        <Text style={styles.personSub} numberOfLines={2}>
          {subtitle}
        </Text>
        <View style={styles.actions}>{children}</View>
      </View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  tone = 'ghost',
  busy,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'ghost';
  busy: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.small,
        tone === 'primary' ? styles.smallPrimary : styles.smallGhost,
        (pressed || busy) && styles.pressed,
      ]}
    >
      <Text style={[styles.smallText, tone === 'primary' ? { color: colors.primaryText } : { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  incomingBox: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.07)',
  },
  incomingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  incomingDot: { position: 'absolute', top: -8, right: -10 },
  incomingHeadText: { flex: 1, gap: 2 },
  incomingTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md, lineHeight: 22 },
  incomingSub: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  requestCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  requestTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  requestName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  requestButtons: { flexDirection: 'row', gap: spacing.sm },
  requestBtn: { flex: 1 },
  note: { fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  noteError: { color: colors.danger },
  noteOk: { color: colors.success },
  errorBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  errorText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  person: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  personText: { flex: 1, gap: 2 },
  personTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  personSub: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  small: {
    minHeight: 38,
    minWidth: 84,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPrimary: { backgroundColor: colors.primary },
  smallGhost: { borderWidth: 1.5, borderColor: colors.border },
  smallText: { fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pressed: { opacity: 0.7 },
  codeBox: { padding: spacing.lg, gap: spacing.md },
  codeLabel: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xl, letterSpacing: 6 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34, 211, 197, 0.12)',
  },
  shareText: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
});
