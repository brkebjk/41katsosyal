import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DeleteAccountSheet } from '@/components/DeleteAccountSheet';
import { HexGauge } from '@/components/HexGauge';
import { InfoModal } from '@/components/InfoModal';
import { LeaderApplySheet } from '@/components/LeaderApplySheet';
import { MyThreadsSheet } from '@/components/MyThreadsSheet';
import { NotificationSettingsSheet } from '@/components/NotificationSettingsSheet';
import { ImageSlot } from '@/components/ImageSlot';
import { NoticeBanner } from '@/components/NoticeBanner';
import { ListRow, Meter, Panel } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { RecoveryPhraseSetup } from '@/components/RecoveryPhraseSetup';
import { Screen } from '@/components/Screen';
import { SponsorCodeModal } from '@/components/SponsorCodeModal';
import { SponsorProfile } from '@/components/SponsorProfile';
import { TextField } from '@/components/TextField';
import type { AppTextKey } from '@/lib/account';
import { getPlayCounts, progressFor, totalEarned, TOTAL_ACHIEVEMENTS } from '@/lib/achievements';
import { useAuth } from '@/lib/auth';
import { confirmAction, notify } from '@/lib/dialog';
import { eventGaugeAction } from '@/lib/eventQuota';
import { getQuota, type Quota } from '@/lib/events';
import { listBlocks, unblock, type BlockedAuthor } from '@/lib/feed';
import { listFriendships, type Friendships } from '@/lib/friends';
import { quotaInfo } from '@/lib/gameInfo';
import { imageAspect } from '@/lib/images';
import {
  fmtPts,
  formatDate,
  isSubscriptionActive,
  isLifetimeSubscription,
  isReservedName,
  lastDayBefore,
  RESERVED_NAME_TEXT,
} from '@/lib/labels';
import { DEFAULT_LIMITS, getLimits, type Limits } from '@/lib/membership';
import { useNotices } from '@/lib/notices';
import { REAL_NAME } from '@/lib/realName';
import { getMyTitles, listLevels, type LevelInfo, type MyTitle } from '@/lib/ranking';
import { useTabResetKey } from '@/lib/tabReset';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Bir sonraki rumuz değişimine (Pazartesi 00:00, Türkiye saati) kalan süre: "2 gün 5 sa", "3 sa 12 dk" */
function aliasCountdown(now: number): string {
  const OFFSET = 3 * 3600 * 1000;
  const ist = new Date(now + OFFSET);
  const dow = ist.getUTCDay();
  const daysAhead = (8 - dow) % 7 || 7; // bir sonraki Pazartesi
  const target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysAhead) - OFFSET;
  const mins = Math.max(0, Math.floor((target - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

/** Sekmeden ayrılınca ekran baştan kurulur (açık pencereler kapanır, seçimler sıfırlanır) */
export default function ProfileScreenTab() {
  const resetKey = useTabResetKey('profile');
  return <ProfileScreen key={resetKey} />;
}

function ProfileScreen() {
  const { profile, account, previewMode, leavePreview, refreshProfile, refreshAccount, signOut, updateFullName } =
    useAuth();
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [blocks, setBlocks] = useState<BlockedAuthor[]>([]);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friendships | null>(null);
  const [titles, setTitles] = useState<MyTitle[]>([]);
  const [aliasShown, setAliasShown] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<'account' | 'app' | 'custom' | null>(null);
  const [overlay, setOverlay] = useState<'delete' | 'recovery' | 'leader' | 'notify' | 'threads' | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [quotaInfoOpen, setQuotaInfoOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const notices = useNotices();

  // Seviye listesi ve hak sayıları bir kez okunur
  useEffect(() => {
    let active = true;
    void listLevels().then((l) => {
      if (active) setLevels(l);
    });
    void getLimits().then((l) => {
      if (active) setLimits(l);
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshQuota = useCallback(async () => {
    const q = await getQuota();
    if (q.data) setQuota(q.data);
  }, []);

  // Rumuz sayacı dakikada bir ilerler
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sekmeye her dönüşte puanı, hakları ve başarımları tazele (oyunlardan puan gelmiş olabilir).
  // Rumuz her girişte yeniden gizlenir.
  useFocusEffect(
    useCallback(() => {
      setAliasShown(false);
      setNow(Date.now());
      void refreshProfile();
      void refreshAccount();
      void refreshQuota();
      void listBlocks().then((b) => {
        if (!b.error) setBlocks(b.data);
      });
      void getPlayCounts().then((c) => {
        if (!c.error) setEarned(totalEarned(progressFor(c.data)));
      });
      void listFriendships().then((f) => {
        if (!f.error) setFriends(f.data);
      });
      void getMyTitles().then((t) => {
        if (!t.error) setTitles(t.data);
      });
      // Başka sekmeye geçilince profil ilk haline döner: açılır bölümler ve pencereler kapanır, sayfa başa sarılır
      return () => {
        setOpen(null);
        setOverlay(null);
        setCodeOpen(false);
        setQuotaInfoOpen(false);
        setBlocksOpen(false);
        setEditing(false);
        setMessage(null);
        setResetKey((k) => k + 1);
      };
    }, [refreshProfile, refreshAccount, refreshQuota]),
  );

  // Önizleme modu: giriş yapılmadan ekranlar geziliyor
  if (!profile) {
    return (
      <Screen title="Profil" subtitle="Önizleme modu">
        <Panel>
          <ListRow title="Giriş yapılmadı" subtitle="Sunucu bağlanınca burada adın, rumuzun ve puanın görünecek." />
        </Panel>
        {previewMode ? <PrimaryButton label="Girişe dön" onPress={leavePreview} variant="ghost" /> : null}
      </Screen>
    );
  }

  const points = profile.points;
  const current = [...levels].reverse().find((l) => points >= l.min_points) ?? levels[0];
  const next = levels.find((l) => l.min_points > points);
  const progress =
    next && current ? Math.min(1, (points - current.min_points) / (next.min_points - current.min_points)) : 1;
  const subscribed = isSubscriptionActive(profile.premium_until);
  const isModerator = profile.role === 'admin';
  const nameLeft = account ? account.name_changes_left : 0;
  const canRename = isModerator || (nameLeft ?? 0) > 0;

  const openText = (doc: AppTextKey) => router.push({ pathname: '/belge', params: { doc } });

  async function saveName() {
    const name = nameDraft.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60) {
      setMessage({ text: 'Ad 2 ile 60 karakter arasında olmalı.', error: true });
      return;
    }
    if (!isModerator && isReservedName(name)) {
      setMessage({ text: RESERVED_NAME_TEXT, error: true });
      return;
    }
    if (name === profile?.full_name) {
      setEditing(false);
      return;
    }
    if (!isModerator) {
      const ok = await confirmAction(
        'Adın değişsin mi?',
        `Yeni adın “${name}” olacak. Bu hakkı yalnızca 1 kez kullanabilirsin; sonra adını değiştiremezsin.`,
        'Değiştir',
      );
      if (!ok) return;
    }
    setSaving(true);
    const result = await updateFullName(name);
    setSaving(false);
    if (result.error) {
      setMessage({ text: result.error, error: true });
      return;
    }
    setEditing(false);
    setMessage({ text: 'Adın güncellendi.', error: false });
  }

  async function onUnblock(b: BlockedAuthor) {
    if (unblockingId) return;
    setUnblockingId(b.id);
    setBlockMessage(null);
    const res = await unblock(b.id);
    setUnblockingId(null);
    if (res.error) {
      setBlockMessage(res.error);
      return;
    }
    setBlocks((prev) => prev.filter((x) => x.id !== b.id));
  }

  async function onSignOut() {
    if (await confirmAction('Çıkış yap', 'Hesabından çıkmak istediğine emin misin?', 'Çıkış yap')) {
      await signOut();
    }
  }

  // Hak göstergeleri: oyun (sarı) ve etkinlik (mor). Kullanılmamış mekân kodu hakkı oyun hakkına 1 ekler.
  const hasCredit = quota?.sponsor_credit === true;
  const gamesUnlimited = quota !== null && (quota.is_moderator || quota.games_limit === null);
  const gamesRemaining =
    quota === null || gamesUnlimited
      ? null
      : Math.max(0, (quota.games_limit ?? 0) - quota.games_used) + (hasCredit ? 1 : 0);
  const gamesFull = quota?.games_limit == null ? null : quota.games_limit + (hasCredit ? 1 : 0);
  const eventsUnlimited = quota !== null && (quota.is_moderator || quota.events_limit === null);
  const eventsRemaining =
    quota === null || eventsUnlimited ? null : Math.max(0, (quota.events_limit ?? 0) - quota.events_used);
  const isLeader = quota?.is_leader === true;
  const leaderPending = quota?.leader_pending === true;

  /** Etkinlik hakkı göstergesi: abone değilse seçim; aboneyse doğrudan lider başvurusu. */
  async function onEventGauge() {
    if ((await eventGaugeAction(quota, subscribed)) === 'leader') setOverlay('leader');
  }

  const sheet =
    overlay === 'leader' ? (
      <LeaderApplySheet
        initialName={profile.full_name}
        onClose={() => setOverlay(null)}
        onDone={() => {
          setOverlay(null);
          void refreshQuota();
          void notify('Başvurun alındı', 'Moderatör başvurunu inceleyecek; sonuç bildirim kutuna düşer.', {
            icon: 'checkmark-circle',
            tone: 'success',
          });
        }}
      />
    ) : overlay === 'notify' ? (
      <NotificationSettingsSheet onClose={() => setOverlay(null)} />
    ) : overlay === 'threads' ? (
      <MyThreadsSheet onClose={() => setOverlay(null)} />
    ) : overlay === 'delete' ? (
      <DeleteAccountSheet onClose={() => setOverlay(null)} />
    ) : overlay === 'recovery' ? (
      <RecoveryPhraseSetup
        mode="renew"
        onCancel={() => setOverlay(null)}
        onDone={() => {
          setOverlay(null);
          void refreshAccount();
          setMessage({ text: 'Yeni kurtarma kelimelerin kaydedildi. Eskiler artık geçersiz.', error: false });
        }}
      />
    ) : null;

  // Mekân (sponsor) hesabı: puan, seviye, abonelik, arkadaş ve rumuz yok; kod ve mekân paneli var
  if (profile.role === 'sponsor') {
    return (
      <Screen title="Profil" overlay={sheet}>
        <SponsorProfile fullName={profile.full_name} />
        <Panel>
          <ListRow icon="log-out-outline" title="Çıkış yap" onPress={onSignOut} />
          <ListRow icon="trash-outline" tone="danger" title="Hesabımı sil" onPress={() => setOverlay('delete')} />
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen key={resetKey} title="Profil" overlay={sheet}>
      {/* Seni bekleyen işler: dokununca ilgili ekrana gider */}
      {notices.friendRequests > 0 ? (
        <NoticeBanner
          icon="person-add"
          title={
            notices.friendRequests === 1
              ? '1 kişi sana arkadaşlık isteği gönderdi'
              : `${notices.friendRequests} kişi sana arkadaşlık isteği gönderdi`
          }
          text="Kabul edersen birbirinizin gerçek adını görürsünüz. Kabul etmek zorunda değilsin."
          count={notices.friendRequests}
          action="İstekleri gör ve yanıtla"
          onPress={() => router.push('/arkadaslar')}
          testID="banner-friend-requests"
        />
      ) : null}
      {isModerator &&
      notices.modReports +
        notices.modCloseRequests +
        notices.modLeaderApps +
        notices.modApprovals +
        notices.modTreasures +
        notices.modCellCandidates +
        notices.modMessages >
        0 ? (
        <NoticeBanner
          icon="shield-checkmark"
          title="Moderatör olarak bekleyen işler var"
          text={[
            notices.modReports > 0 ? `${notices.modReports} açık şikayet` : null,
            notices.modCloseRequests > 0 ? `${notices.modCloseRequests} etkinlik kapatma talebi` : null,
            notices.modLeaderApps > 0 ? `${notices.modLeaderApps} etkinlik lideri başvurusu` : null,
            notices.modApprovals > 0 ? `${notices.modApprovals} etkinlik/görsel onayı` : null,
            notices.modTreasures > 0 ? `${notices.modTreasures} bulunan hazine` : null,
            notices.modCellCandidates > 0 ? `${notices.modCellCandidates} petek adı adayı` : null,
            notices.modMessages > 0 ? `${notices.modMessages} cevap bekleyen yazışma` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          count={
            notices.modReports +
            notices.modCloseRequests +
            notices.modLeaderApps +
            notices.modApprovals +
            notices.modTreasures +
            notices.modCellCandidates +
            notices.modMessages
          }
          action="Moderatör paneline git"
          onPress={() => router.push('/moderator')}
          testID="banner-moderator"
        />
      ) : null}

      {/* Kimlik: avatar, gerçek ad, altında gizlenebilen rumuz ve rumuz sayacı */}
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.gaugeCol}>
            {quota ? (
              <HexGauge
                remaining={eventsRemaining}
                limit={quota.events_limit}
                plus={!eventsUnlimited && !isLeader && !leaderPending}
                tone="purple"
                kind="etkinlik"
                onPress={() => void onEventGauge()}
                testID="profile-events-gauge"
              />
            ) : (
              <View style={styles.gaugeSpace} />
            )}
            <Text style={styles.gaugeLabel}>Etkinlik</Text>
          </View>
          <View>
            <View style={[styles.ring, subscribed && styles.ringSubscription]}>
              <Avatar index={profile.avatar_index} size={84} />
            </View>
            <Pressable
              onPress={() => router.push('/ayricaliklar')}
              accessibilityRole="button"
              accessibilityLabel={isModerator ? 'Ayrıcalıkları yönet' : 'Abone ayrıcalıkları'}
              testID="profile-perks"
              style={({ pressed }) => [styles.gift, subscribed && styles.giftVip, pressed && styles.pressed]}
            >
              {subscribed ? (
                <Text style={styles.vipText}>VIP</Text>
              ) : (
                <Ionicons name="gift" size={22} color={colors.primaryText} />
              )}
            </Pressable>
          </View>
          <View style={styles.gaugeCol}>
            {quota ? (
              <HexGauge
                remaining={gamesRemaining}
                limit={gamesFull}
                plus={!gamesUnlimited}
                tone="yellow"
                kind="oyun"
                onPress={() => (gamesUnlimited ? undefined : setCodeOpen(true))}
                testID="profile-games-gauge"
              />
            ) : (
              <View style={styles.gaugeSpace} />
            )}
            <Text style={styles.gaugeLabel}>Oyun</Text>
          </View>
        </View>
        <Text style={styles.realName} numberOfLines={1}>
          {profile.full_name.toLocaleUpperCase('tr-TR')}
        </Text>
        <View style={styles.aliasRow}>
          <Text style={styles.aliasLabel}>Rumuz:</Text>
          <Text style={styles.alias} numberOfLines={1} testID="profile-alias">
            {aliasShown ? profile.alias : '••••••••'}
          </Text>
          <Pressable
            onPress={() => setAliasShown((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={aliasShown ? 'Rumuzu gizle' : 'Rumuzu göster'}
            testID="profile-alias-toggle"
          >
            <Ionicons name={aliasShown ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.timer} accessibilityLabel="Rumuzun değişmesine kalan süre">
            <Ionicons name="shuffle" size={12} color={colors.textMuted} />
            <Text style={styles.timerText}>{aliasCountdown(now)}</Text>
          </View>
        </View>
        {subscribed || isModerator || isLeader || leaderPending ? (
          <View style={styles.chips}>
            {isLeader ? (
              <View style={[styles.chip, styles.chipAdmin]}>
                <Ionicons name="ribbon" size={14} color={colors.accent} />
                <Text style={styles.chipAdminText}>Etkinlik Lideri</Text>
              </View>
            ) : leaderPending ? (
              <View style={[styles.chip, styles.chipPending]}>
                <Ionicons name="hourglass-outline" size={13} color={colors.textMuted} />
                <Text style={styles.chipPendingText}>Lider başvurun inceleniyor</Text>
              </View>
            ) : null}
            {subscribed ? (
              <View style={[styles.chip, styles.chipSubscription]}>
                <ImageSlot name="subscriptionBadge" style={styles.badge} />
                <Text style={styles.chipSubscriptionText}>Abone</Text>
              </View>
            ) : null}
            {isModerator ? (
              <View style={[styles.chip, styles.chipAdmin]}>
                <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
                <Text style={styles.chipAdminText}>Moderatör</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.level}>
          <View style={styles.levelTop}>
            <Text style={styles.points}>{fmtPts(points)}</Text>
            <Text style={styles.pointsLabel}>puan</Text>
            {current ? (
              <Text style={styles.levelName}>
                · Seviye {current.level} {current.name}
              </Text>
            ) : null}
          </View>
          <Meter value={progress} />
          <Text style={styles.levelHint}>
            {next
              ? `${next.name} seviyesine ${fmtPts(next.min_points - points)} puan kaldı`
              : current
                ? 'En yüksek seviyedesin'
                : ''}
          </Text>
        </View>

        {/* Başarımlar: toplam ilerleme */}
        <Pressable
          onPress={() => router.push('/basarimlar')}
          accessibilityRole="button"
          accessibilityLabel="Başarımlarım"
          style={({ pressed }) => [styles.achieve, pressed && styles.pressed]}
          testID="profile-achievements"
        >
          <View style={styles.levelTop}>
            <Ionicons name="ribbon" size={16} color={colors.primary} />
            <Text style={styles.achieveTitle}>Başarımlar</Text>
            <Text style={styles.achieveCount}>{earned === null ? '…' : `${earned}/${TOTAL_ACHIEVEMENTS}`}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
          <Meter value={earned === null ? 0 : earned / TOTAL_ACHIEVEMENTS} color={colors.accent} />
        </Pressable>
      </View>

      {/* Oyun şampiyonu ünvanları */}
      {titles.length > 0 ? (
        <Panel>
          {titles.map((t) => (
            <ListRow
              key={t.game_type}
              icon="trophy"
              title={t.label}
              subtitle={`Geçen ayın 1.’si · Son gün: ${lastDayBefore(t.valid_until)}`}
            />
          ))}
        </Panel>
      ) : null}

      {/* Abonelik */}
      {!isModerator ? (
        <Pressable
          onPress={() => router.push('/abonelik')}
          accessibilityRole="button"
          accessibilityLabel={subscribed ? 'Aboneliğin' : 'Hesabı yükselt'}
          style={({ pressed }) => [styles.subscriptionLink, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={subscribed ? ['#2A2447', '#1C2438'] : ['#4B33B5', '#8A5A12']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscriptionGradient}
          >
            <ImageSlot name="subscriptionBadge" style={styles.subscriptionBadge} />
            <View style={styles.subscriptionText}>
              <Text style={styles.subscriptionTitle}>{subscribed ? 'Abonesin' : 'Hesabı Yükselt'}</Text>
              <Text style={styles.subscriptionSub}>
                {subscribed && profile.premium_until
                  ? `${isLifetimeSubscription(profile.premium_until) ? 'Ömür boyu' : `${formatDate(profile.premium_until)} tarihine kadar`} · Avantajları gör`
                  : 'Ayrıcalıkları görüntüle.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      ) : null}

      <Panel>
        <ListRow
          icon="people"
          title="Arkadaşlarım"
          dot={notices.friendRequests}
          subtitle={
            friends && friends.incoming.length > 0
              ? `${friends.incoming.length} yeni arkadaşlık isteğin var`
              : 'Arkadaşlar birbirinin gerçek adını görür'
          }
          value={friends ? (friends.incoming.length > 0 ? 'Yanıtla' : String(friends.friends.length)) : undefined}
          onPress={() => router.push('/arkadaslar')}
        />
        {isModerator ? (
          <ListRow
            icon="shield-checkmark"
            tone="accent"
            title="Moderatör paneli"
            dot={
              notices.modReports +
              notices.modCloseRequests +
              notices.modLeaderApps +
              notices.modApprovals +
              notices.modTreasures +
              notices.modCellCandidates +
              notices.modMessages
            }
            subtitle="Şikayetler, talepler, üyeler, duyurular, mekânlar"
            onPress={() => router.push('/moderator')}
          />
        ) : null}
      </Panel>

      {/* Özelleştirmeler (açılır) */}
      <Section
        icon="color-palette"
        title="Özelleştirmeler"
        subtitle="Balonlarım ve görünümünü kişiselleştir"
        open={open === 'custom'}
        onToggle={() => setOpen((o) => (o === 'custom' ? null : 'custom'))}
      >
        <ListRow
          icon="chatbubble-ellipses"
          title="Balonlarım"
          subtitle="Oyun başarımlarıyla kazandığın balon renkleri"
          onPress={() => router.push('/balonlar')}
        />
      </Section>

      {/* Hesabım (açılır) */}
      <Section
        icon="person-circle"
        title="Hesabım"
        subtitle="Bildirimler, izinler, ad değişikliği, kurtarma kelimeleri, engellenenler, hesap silme"
        open={open === 'account'}
        onToggle={() => setOpen((o) => (o === 'account' ? null : 'account'))}
      >
        <ListRow
          icon="notifications"
          title="Bildirim ve konum"
          subtitle="Bildirim türlerini seç, telefon izinlerini gör"
          onPress={() => setOverlay('notify')}
        />
        <ListRow
          icon="shield-checkmark"
          title="Kat Görevlisi mesajlarım"
          subtitle="Moderatörle yazışmaların; cevap yazabilirsin"
          onPress={() => setOverlay('threads')}
        />
        {account?.username ? (
          <ListRow
            icon="at"
            title="Kullanıcı adın"
            subtitle={`${account.username} · yalnızca giriş için, kimse görmez`}
          />
        ) : null}
        {editing ? (
          <View style={styles.editBox}>
            <TextField
              label="Gerçek adın"
              icon="person-outline"
              value={nameDraft}
              onChangeText={setNameDraft}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
              maxLength={60}
              onSubmitEditing={() => void saveName()}
            />
            <RealNameNotice text={REAL_NAME.profileName} />
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <PrimaryButton label="Kaydet" onPress={() => void saveName()} loading={saving} />
              </View>
              <View style={styles.rowItem}>
                <PrimaryButton
                  label="Vazgeç"
                  variant="ghost"
                  onPress={() => {
                    setEditing(false);
                    setMessage(null);
                  }}
                  disabled={saving}
                />
              </View>
            </View>
          </View>
        ) : (
          <ListRow
            icon="person"
            title="Gerçek adını değiştir"
            subtitle={
              isModerator
                ? 'Moderatör olarak sınırsız değiştirebilirsin'
                : canRename
                  ? 'Yalnızca 1 kez değiştirebilirsin'
                  : 'Değiştirme hakkını kullandın. Yanlışlık varsa bize ulaş.'
            }
            value={canRename ? 'Değiştir' : undefined}
            onPress={
              canRename
                ? () => {
                    setNameDraft(profile.full_name);
                    setMessage(null);
                    setEditing(true);
                  }
                : undefined
            }
          />
        )}
        {account?.username ? (
          <ListRow
            icon="key"
            title="Kurtarma kelimelerini yenile"
            subtitle="Kaybettiysen yenilerini oluştur (mevcut şifren gerekir)"
            onPress={() => setOverlay('recovery')}
          />
        ) : null}
        {blocks.length > 0 ? (
          <ListRow
            icon="remove-circle"
            title="Engellediğim rumuzlar"
            value={String(blocks.length)}
            onPress={() => setBlocksOpen((v) => !v)}
            footer={
              blocksOpen ? (
                <View style={styles.blockList}>
                  <Text style={styles.sub}>
                    Bu kişilerin gönderi ve yorumlarını görmezsin. Rumuz değişse de engel sürer.
                  </Text>
                  {blocks.map((b) => (
                    <View key={b.id} style={styles.blockRow}>
                      <Text style={styles.blockAlias} numberOfLines={1}>
                        {b.blocked_alias}
                      </Text>
                      <Text
                        style={[styles.link, unblockingId === b.id && styles.linkBusy]}
                        accessibilityRole="button"
                        accessibilityLabel={`${b.blocked_alias} engelini kaldır`}
                        onPress={() => void onUnblock(b)}
                      >
                        Engeli kaldır
                      </Text>
                    </View>
                  ))}
                  {blockMessage ? <Text style={[styles.message, styles.messageError]}>{blockMessage}</Text> : null}
                </View>
              ) : undefined
            }
          />
        ) : null}
        <ListRow icon="trash-outline" tone="danger" title="Hesabımı sil" onPress={() => setOverlay('delete')} />
      </Section>

      {/* Uygulama (açılır) */}
      <Section
        icon="apps"
        title="Uygulama"
        subtitle="Sözleşme, açık rıza, KVKK, yarışma kuralları, bize ulaşın"
        open={open === 'app'}
        onToggle={() => setOpen((o) => (o === 'app' ? null : 'app'))}
      >
        <ListRow icon="document-text" title="Kullanıcı sözleşmesi" onPress={() => openText('legal_terms')} />
        <ListRow icon="checkmark-done" title="Açık rıza metni" onPress={() => openText('legal_consent')} />
        <ListRow icon="shield" title="KVKK aydınlatma metni" onPress={() => openText('legal_kvkk')} />
        <ListRow icon="trophy-outline" title="Yarışma kuralları" onPress={() => router.push('/kurallar')} />
        <ListRow icon="mail" title="Bize ulaşın" onPress={() => openText('support_contact')} />
      </Section>

      {message ? (
        <Text style={[styles.message, message.error ? styles.messageError : styles.messageOk]}>{message.text}</Text>
      ) : null}

      {/* Çıkış: en altta, ayrı */}
      <Pressable
        onPress={() => void onSignOut()}
        accessibilityRole="button"
        accessibilityLabel="Çıkış yap"
        testID="profile-signout"
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Çıkış yap</Text>
      </Pressable>

      <SponsorCodeModal
        visible={codeOpen}
        onClose={() => setCodeOpen(false)}
        onRedeemed={() => void refreshQuota()}
        hasCredit={hasCredit}
        onInfo={() => {
          setCodeOpen(false);
          setQuotaInfoOpen(true);
        }}
      />
      {(() => {
        const q = quotaInfo(limits.freeGames, limits.subscriptionGames);
        return (
          <InfoModal
            visible={quotaInfoOpen}
            onClose={() => setQuotaInfoOpen(false)}
            title={q.title}
            icon={q.icon}
            items={q.items}
          />
        );
      })()}
    </Screen>
  );
}

/** Açılır bölüm: başlığa dokununca içindeki satırlar görünür. */
function Section({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, open && styles.sectionOpen]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.sectionHead, open && styles.sectionHeadOpen, pressed && styles.pressed]}
      >
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.sectionText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!open ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  gaugeCol: { alignItems: 'center', gap: 2, width: 72 },
  gaugeSpace: { width: 60, height: 68 },
  gaugeLabel: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  giftVip: { backgroundColor: '#1A1200', borderColor: colors.primary },
  vipText: { color: colors.primary, fontFamily: fonts.black, fontSize: 13, letterSpacing: 0.5 },
  gift: {
    position: 'absolute',
    top: -6,
    right: -10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPending: { backgroundColor: colors.surface },
  chipPendingText: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 46,
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 90, 0.45)',
  },
  signOutText: { color: colors.danger, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  ring: {
    padding: 4,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: spacing.xs,
  },
  ringSubscription: { borderColor: colors.primary },
  realName: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg + 2, textAlign: 'center' },
  aliasRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  aliasLabel: { color: colors.textMuted, fontSize: 12 },
  alias: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi, flexShrink: 1 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  timerText: { color: colors.textMuted, fontSize: 11 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipSubscription: { backgroundColor: 'rgba(34, 211, 197, 0.15)' },
  chipSubscriptionText: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: '800' },
  chipAdmin: { backgroundColor: 'rgba(124, 140, 255, 0.18)' },
  chipAdminText: { color: colors.accent, fontSize: fontSizes.xs, fontWeight: '800' },
  badge: { height: 18, aspectRatio: imageAspect.subscriptionBadge },
  level: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.md },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  points: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xl },
  pointsLabel: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  levelName: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm, flexShrink: 1 },
  levelHint: { color: colors.textMuted, fontSize: 12 },
  achieve: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  achieveTitle: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  achieveCount: { color: colors.accent, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pressed: { opacity: 0.85 },
  subscriptionLink: { borderRadius: radii.lg, overflow: 'hidden' },
  subscriptionGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  subscriptionBadge: { height: 40, aspectRatio: imageAspect.subscriptionBadge },
  subscriptionText: { flex: 1, gap: 2 },
  subscriptionTitle: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: fontSizes.md },
  subscriptionSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17 },
  section: { borderRadius: radii.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  sectionOpen: { borderWidth: 1, borderColor: colors.border },
  sectionHeadOpen: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 0 },
  sectionBody: { paddingVertical: spacing.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(34, 211, 197, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  sectionSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  editBox: { gap: spacing.md, padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  sub: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  link: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: '800' },
  linkBusy: { opacity: 0.5 },
  message: { fontSize: fontSizes.sm, textAlign: 'center' },
  messageError: { color: colors.danger },
  messageOk: { color: colors.success },
  blockList: { gap: spacing.sm },
  blockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  blockAlias: { flex: 1, color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
});
