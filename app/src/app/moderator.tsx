import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AliasCodeTab } from '@/components/AliasCodeTab';
import { AnnouncementsTab } from '@/components/AnnouncementsTab';
import { EventApprovalsTab } from '@/components/EventApprovalsTab';
import { TreasuresTab } from '@/components/TreasuresTab';
import { CellCandidatesTab } from '@/components/CellCandidatesTab';
import { LeaderApplicationsTab } from '@/components/LeaderApplicationsTab';
import { Avatar } from '@/components/Avatar';
import { MemberSheet } from '@/components/MemberSheet';
import { ModMessagesTab } from '@/components/ModMessagesTab';
import { ModThreadSheet } from '@/components/ModThreadSheet';
import { ProblemReportsTab } from '@/components/ProblemReportsTab';
import { QuizQuestionsTab } from '@/components/QuizQuestionsTab';
import { NoteModal } from '@/components/NoteModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { VenuesTab } from '@/components/VenuesTab';
import { TextField } from '@/components/TextField';
import { isPetekIconName, PetekIcon } from '@/components/HexClusterIcon';
import { useAuth } from '@/lib/auth';
import { removeEvent } from '@/lib/events';
import { confirmAction } from '@/lib/dialog';
import { fmtPts, fmtPtsSigned, formatWhen, isFuture, isSubscriptionActive, timeAgo } from '@/lib/labels';
import {
  AUDIT_TEXT,
  closeReports,
  listAuditLog,
  listCloseRequests,
  listReports,
  resolveCloseRequest,
  revealCommentAuthor,
  revealPostAuthor,
  searchMembers,
  countOnlineMembers,
  isMemberOnline,
  ONLINE_MS,
  setHidden,
  type AuditRow,
  type CloseRequest,
  type Member,
  type MemberFilter,
  type ReportGroup,
} from '@/lib/moderation';
import { patchNotices, refreshNotices, useNotices } from '@/lib/notices';
import { isBackendReady } from '@/lib/supabase';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Tab =
  | 'reports'
  | 'requests'
  | 'approvals'
  | 'leaders'
  | 'treasures'
  | 'cells'
  | 'messages'
  | 'problems'
  | 'quiz'
  | 'members'
  | 'announce'
  | 'venues'
  | 'alias'
  | 'log';
type Notice = { text: string; error: boolean };
/** Üye sayfasında işlem yapılan üyenin güncel hali ve işlemin zamanı */
type Override = { member: Member; at: number };

function goToProfile() {
  if (router.canGoBack()) router.back();
  else router.replace('/profile');
}

export default function ModeratorScreen() {
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const [tab, setTab] = useState<Tab>('reports');
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const notices = useNotices();
  const [sheetMember, setSheetMember] = useState<Member | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadReload, setThreadReload] = useState(0);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!isModerator) {
    return (
      <Screen title="Moderatör paneli" onBack={goToProfile} backLabel="Profil">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bu sayfa yalnızca moderatörler içindir</Text>
          <PrimaryButton label="Profile dön" variant="ghost" onPress={goToProfile} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Moderatör paneli"
      subtitle="Şikayetler, talepler, üyeler, duyurular, mekânlar ve işlem günlüğü"
      onBack={goToProfile}
      backLabel="Profil"
      overlay={
        threadId ? (
          <ModThreadSheet
            key={threadId}
            threadId={threadId}
            onClose={() => {
              setThreadId(null);
              setThreadReload((n) => n + 1);
            }}
            onEnded={() => setNotice({ text: 'Görüşme bitirildi; yazışma silindi.', error: false })}
          />
        ) : sheetMember ? (
          <MemberSheet
            key={sheetMember.id}
            member={sheetMember}
            onClose={() => setSheetMember(null)}
            onChanged={(m) => setOverrides((prev) => ({ ...prev, [m.id]: { member: m, at: Date.now() } }))}
          />
        ) : null
      }
    >
      <Pressable
        onPress={() => router.push('/cekilis')}
        accessibilityRole="button"
        accessibilityLabel="Çekiliş yap"
        style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
      >
        <Ionicons name="gift" size={22} color={colors.primary} />
        <View style={styles.linkText}>
          <Text style={styles.cardTitle}>Çekiliş yap</Text>
          <Text style={styles.muted}>Etkinlikte katılımcılar arasından kazanan seç.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      {/* Sekmeler: kutucuklar (her satırda 4) */}
      <View style={styles.tiles} accessibilityRole="tablist">
        {(
          [
            { value: 'reports', label: 'Şikayetler', icon: 'flag', badge: openCount ?? notices.modReports },
            {
              value: 'requests',
              label: 'Kapatma',
              icon: 'close-circle',
              badge: requestCount ?? notices.modCloseRequests,
            },
            { value: 'approvals', label: 'Onaylar', icon: 'checkmark-done', badge: notices.modApprovals },
            { value: 'leaders', label: 'Başvurular', icon: 'ribbon', badge: notices.modLeaderApps },
            { value: 'treasures', label: 'Hazineler', icon: 'search-circle', badge: notices.modTreasures },
            { value: 'cells', label: 'Petek adları', icon: 'grid', badge: notices.modCellCandidates },
            { value: 'messages', label: 'Mesajlar', icon: 'chatbubbles', badge: notices.modMessages },
            { value: 'problems', label: 'Sorunlar', icon: 'bug', badge: 0 },
            { value: 'quiz', label: 'Yarışma', icon: 'help-circle', badge: 0 },
            { value: 'members', label: 'Üyeler', icon: 'people', badge: 0 },
            { value: 'announce', label: 'Duyuru', icon: 'megaphone', badge: 0 },
            { value: 'venues', label: 'Mekânlar', icon: 'storefront', badge: 0 },
            { value: 'alias', label: 'Rumuz kodu', icon: 'pricetag', badge: 0 },
            { value: 'log', label: 'Günlük', icon: 'list', badge: 0 },
          ] as { value: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; badge: number }[]
        ).map((t) => {
          const active = tab === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => {
                setNotice(null);
                setTab(t.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && styles.pressed]}
              testID={`mod-tab-${t.value}`}
            >
              {isPetekIconName(t.icon) ? (
                <PetekIcon size={20} color={active ? colors.primaryText : colors.primary} />
              ) : (
                <Ionicons name={t.icon} size={20} color={active ? colors.primaryText : colors.primary} />
              )}
              <Text style={[styles.tileText, active && styles.tileTextActive]} numberOfLines={1}>
                {t.label}
              </Text>
              {t.badge > 0 ? (
                <View style={styles.tileBadge}>
                  <Text style={styles.tileBadgeText}>{t.badge > 99 ? '99+' : t.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {notice ? (
        <Text
          style={[styles.notice, notice.error ? styles.noticeError : styles.noticeOk]}
          accessibilityLiveRegion="polite"
        >
          {notice.text}
        </Text>
      ) : null}

      {tab === 'reports' ? (
        <ReportsTab onOpenCount={setOpenCount} onMember={setSheetMember} onNotice={setNotice} />
      ) : tab === 'requests' ? (
        <RequestsTab onOpenCount={setRequestCount} onNotice={setNotice} />
      ) : tab === 'members' ? (
        <MembersTab onSelect={setSheetMember} overrides={overrides} />
      ) : tab === 'approvals' ? (
        <EventApprovalsTab onNotice={setNotice} />
      ) : tab === 'leaders' ? (
        <LeaderApplicationsTab onNotice={setNotice} />
      ) : tab === 'treasures' ? (
        <TreasuresTab onNotice={setNotice} />
      ) : tab === 'cells' ? (
        <CellCandidatesTab onNotice={setNotice} />
      ) : tab === 'messages' ? (
        <ModMessagesTab onOpen={setThreadId} reloadKey={threadReload} />
      ) : tab === 'problems' ? (
        <ProblemReportsTab onNotice={setNotice} />
      ) : tab === 'quiz' ? (
        <QuizQuestionsTab onNotice={setNotice} />
      ) : tab === 'announce' ? (
        <AnnouncementsTab onNotice={setNotice} />
      ) : tab === 'venues' ? (
        <VenuesTab onNotice={setNotice} />
      ) : tab === 'alias' ? (
        <AliasCodeTab onNotice={setNotice} />
      ) : (
        <LogTab />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Şikayetler
// ---------------------------------------------------------------------------

function ReportsTab({
  onOpenCount,
  onMember,
  onNotice,
}: {
  onOpenCount: (n: number) => void;
  onMember: (m: Member) => void;
  onNotice: (n: Notice) => void;
}) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [groupsFor, setGroupsFor] = useState<'open' | 'closed' | null>(null);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const lock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    // Açık/Kapanmış arasında hızlı geçilirse eski cevap yenisinin üstüne yazmasın
    const my = ++requestId.current;
    const res = await listReports(status);
    if (my !== requestId.current) return;
    setError(res.error);
    if (!res.error) {
      setGroups(res.data);
      setGroupsFor(status);
    }
    setLoaded(true);
  }, [status]);

  // Sekmedeki "Şikayetler (N)" sayısı, açık listedeki gerçek sayıyı gösterir
  useEffect(() => {
    if (groupsFor === 'open') {
      onOpenCount(groups.length);
      patchNotices({ modReports: groups.length });
    }
  }, [groups, groupsFor, onOpenCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function run(g: ReportGroup, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusyKey(g.key);
    try {
      await task();
    } finally {
      setBusyKey(null);
      lock.current = false;
    }
  }

  const onToggleHidden = (g: ReportGroup) =>
    run(g, async () => {
      if (
        !g.content ||
        g.type === 'room' ||
        g.type === 'event' ||
        g.type === 'quiz_chat' ||
        g.type === 'vv_whisper' ||
        g.type === 'vv_dead' ||
        g.type === 'dm'
      )
        return;
      const hide = !g.content.is_hidden;
      const res = await setHidden(g.type, g.targetId, hide);
      if (res.error) {
        onNotice({ text: res.error, error: true });
        return;
      }
      setGroups((prev) =>
        prev.map((x) => (x.key === g.key && x.content ? { ...x, content: { ...x.content, is_hidden: hide } } : x)),
      );
      onNotice({ text: hide ? 'İçerik gizlendi.' : 'İçerik yeniden gösteriliyor.', error: false });
    });

  const onReveal = (g: ReportGroup) =>
    run(g, async () => {
      const ok = await confirmAction(
        'Yazarı göster',
        'Yazarın gerçek adı ve hesabı açılır. Bu görüntüleme moderatör kaydına yazılır.',
        'Göster',
      );
      if (!ok) return;
      if (g.type === 'event_comment') return; // etkinlik yorumunda yazar zaten gerçek adıyla görünür
      const res = g.type === 'post' ? await revealPostAuthor(g.targetId) : await revealCommentAuthor(g.targetId);
      if (res.error || !res.data) {
        onNotice({ text: res.error ?? 'Yazar bilgisi alınamadı.', error: true });
        return;
      }
      onMember(res.data);
    });

  const onRemoveEvent = (g: ReportGroup) =>
    run(g, async () => {
      const ok = await confirmAction(
        'Etkinliği kaldır',
        'Etkinlik herkesin listesinden kalkar, kayıtlar iptal olur ve etkinlikten verilmiş puanlar geri alınır. Şikayet de çözüldü olarak kapanır.',
        'Kaldır',
        true,
      );
      if (!ok) return;
      const res = await removeEvent(g.targetId);
      if (res.error) {
        onNotice({ text: res.error, error: true });
        return;
      }
      await closeReports(g.reportIds, 'resolved');
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      onNotice({ text: 'Etkinlik kaldırıldı ve şikayet kapatıldı.', error: false });
    });

  const onClose = (g: ReportGroup, to: 'resolved' | 'dismissed') =>
    run(g, async () => {
      const res = await closeReports(g.reportIds, to);
      if (res.error) {
        onNotice({ text: res.error, error: true });
        void load();
        return;
      }
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      onNotice({
        text: to === 'resolved' ? 'Şikayet çözüldü olarak kapatıldı.' : 'Şikayet reddedildi.',
        error: false,
      });
    });

  return (
    <>
      <Segmented<'open' | 'closed'>
        value={status}
        onChange={(v) => {
          setLoaded(false);
          setStatus(v);
        }}
        options={[
          { value: 'open', label: 'Açık' },
          { value: 'closed', label: 'Kapanmış' },
        ]}
      />
      {!loaded ? (
        <Text style={styles.muted}>Şikayetler yükleniyor…</Text>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
          <PrimaryButton
            label="Tekrar dene"
            variant="ghost"
            onPress={() => {
              setLoaded(false);
              void load();
            }}
          />
        </View>
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>
          {status === 'open' ? 'Açık şikayet yok. Her şey yolunda.' : 'Kapanmış şikayet yok.'}
        </Text>
      ) : (
        groups.map((g) => (
          <ReportCard
            key={g.key}
            group={g}
            open={status === 'open'}
            busy={busyKey === g.key}
            onToggleHidden={() => void onToggleHidden(g)}
            onReveal={() => void onReveal(g)}
            onRemoveEvent={() => void onRemoveEvent(g)}
            onClose={(to) => void onClose(g, to)}
          />
        ))
      )}
    </>
  );
}

function ReportCard({
  group,
  open,
  busy,
  onToggleHidden,
  onReveal,
  onRemoveEvent,
  onClose,
}: {
  group: ReportGroup;
  open: boolean;
  busy: boolean;
  onToggleHidden: () => void;
  onReveal: () => void;
  onRemoveEvent: () => void;
  onClose: (to: 'resolved' | 'dismissed') => void;
}) {
  const reasons = [...new Set(group.reasons)].slice(0, 3);
  const c = group.content;
  const typeLabel =
    group.type === 'post'
      ? 'Gönderi'
      : group.type === 'comment'
        ? 'Yorum'
        : group.type === 'venue_review'
          ? 'Mekân yorumu'
          : group.type === 'room'
            ? 'Oyun odası'
            : group.type === 'event'
              ? 'Etkinlik'
              : group.type === 'quiz_chat'
                ? 'Yarışma sohbeti'
                : group.type === 'vv_whisper'
                  ? 'Vampir fısıltısı'
                  : group.type === 'vv_dead'
                    ? 'Elenenler sohbeti'
                    : group.type === 'dm'
                      ? 'Özel mesaj'
                      : 'Etkinlik yorumu';
  const canHide =
    group.type !== 'room' &&
    group.type !== 'event' &&
    group.type !== 'quiz_chat' &&
    group.type !== 'vv_whisper' &&
    group.type !== 'vv_dead' &&
    group.type !== 'dm';
  return (
    <View style={styles.reportCard} accessibilityLabel={`${typeLabel} şikayeti`}>
      <View style={styles.reportHead}>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>{typeLabel}</Text>
        </View>
        <Text style={styles.reportCount}>{group.count} şikayet</Text>
        <Text style={[styles.muted, styles.reportTime]}>{timeAgo(group.latest)}</Text>
      </View>

      {c ? (
        <View style={styles.reportBody}>
          <Text style={styles.reportAlias}>
            {c.alias}
            {c.is_hidden ? '  · gizli' : ''}
          </Text>
          <Text style={styles.reportText} numberOfLines={group.type === 'event' ? 10 : 6}>
            {c.body}
          </Text>
        </View>
      ) : (
        <Text style={styles.muted}>Bu içerik silinmiş.</Text>
      )}

      <Text style={styles.muted}>Neden: {reasons.join(' · ')}</Text>

      {open ? (
        <View style={styles.btnRow}>
          {c && canHide ? (
            <SmallButton
              label={c.is_hidden ? 'Göster' : 'Gizle'}
              icon={c.is_hidden ? 'eye' : 'eye-off-outline'}
              onPress={onToggleHidden}
              disabled={busy}
            />
          ) : null}
          {c && (group.type === 'post' || group.type === 'comment') ? (
            <SmallButton label="Yazarı göster" icon="person-outline" onPress={onReveal} disabled={busy} />
          ) : null}
          {c && group.type === 'event' && !c.cancelled ? (
            <SmallButton label="Etkinliği kaldır" icon="trash-outline" onPress={onRemoveEvent} disabled={busy} />
          ) : null}
          <SmallButton label="Çözüldü" icon="checkmark" onPress={() => onClose('resolved')} disabled={busy} primary />
          <SmallButton label="Sorun yok" icon="close" onPress={() => onClose('dismissed')} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

function SmallButton({
  label,
  icon,
  onPress,
  disabled,
  primary = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.small,
        primary && styles.smallPrimary,
        disabled && styles.smallDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={15} color={primary ? colors.primaryText : colors.text} />
      <Text style={[styles.smallText, primary && styles.smallTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Etkinlik kapatma talepleri
// ---------------------------------------------------------------------------

function RequestsTab({ onOpenCount, onNotice }: { onOpenCount: (n: number) => void; onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<CloseRequest[]>([]);
  const [rowsFor, setRowsFor] = useState<'open' | 'closed' | null>(null);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<CloseRequest | null>(null);
  const lock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const my = ++requestId.current;
    const res = await listCloseRequests(status);
    if (my !== requestId.current) return;
    setError(res.error);
    if (!res.error) {
      setRows(res.data);
      setRowsFor(status);
    }
    setLoaded(true);
  }, [status]);

  useEffect(() => {
    if (rowsFor === 'open') {
      onOpenCount(rows.length);
      patchNotices({ modCloseRequests: rows.length });
    }
  }, [rows, rowsFor, onOpenCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function approve(r: CloseRequest) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(r.id);
    try {
      const ok = await confirmAction(
        'Talebi onayla',
        `“${r.event_title}” kapanır ve bu etkinlikten verilmiş bütün puanlar (katılımcılar ve düzenleyen) geri alınır. Bu işlem geri alınamaz.`,
        'Onayla ve kapat',
        true,
        { icon: 'checkmark-done' },
      );
      if (!ok) return;
      const res = await resolveCloseRequest(r.id, true);
      if (res.error) {
        onNotice({ text: res.error, error: true });
        void load();
        return;
      }
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      onNotice({ text: 'Etkinlik kapatıldı ve puanlar geri alındı.', error: false });
      void refreshNotices();
    } finally {
      setBusyId(null);
      lock.current = false;
    }
  }

  async function reject(r: CloseRequest, note: string): Promise<string | null> {
    const res = await resolveCloseRequest(r.id, false, note);
    if (res.error) return res.error;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setRejecting(null);
    onNotice({ text: 'Talep reddedildi. Etkinlik devam ediyor.', error: false });
    void refreshNotices();
    return null;
  }

  return (
    <>
      <Segmented<'open' | 'closed'>
        value={status}
        onChange={(v) => {
          setLoaded(false);
          setStatus(v);
        }}
        options={[
          { value: 'open', label: 'Bekleyen' },
          { value: 'closed', label: 'Sonuçlanan' },
        ]}
      />
      <Text style={styles.muted}>
        Kodla katılanı olan etkinliği düzenleyen kendisi kapatamaz. Nedenini okuyup karar ver: onaylarsan etkinlik
        kapanır ve etkinlikten verilmiş bütün puanlar geri alınır.
      </Text>
      {!loaded ? (
        <Text style={styles.muted}>Talepler yükleniyor…</Text>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
          <PrimaryButton
            label="Tekrar dene"
            variant="ghost"
            onPress={() => {
              setLoaded(false);
              void load();
            }}
          />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {status === 'open' ? 'Bekleyen kapatma talebi yok.' : 'Sonuçlanmış talep yok.'}
        </Text>
      ) : (
        rows.map((r) => (
          <View key={r.id} style={styles.reportCard} testID="close-request-card">
            <View style={styles.reportHead}>
              <View style={styles.typeTag}>
                <Text style={styles.typeTagText}>Kapatma talebi</Text>
              </View>
              <Text style={styles.reportCount}>{r.verified_count} kişi doğrulandı</Text>
              <Text style={[styles.muted, styles.reportTime]}>{timeAgo(r.created_at)}</Text>
            </View>
            <View style={styles.reportBody}>
              <Text style={styles.reportAlias}>{r.event_title}</Text>
              <Text style={styles.muted}>
                {r.host_name ?? 'Silinmiş hesap'} · {formatWhen(new Date(r.starts_at))}
              </Text>
              <Text style={styles.reportText}>{r.reason}</Text>
            </View>
            {status === 'open' ? (
              <View style={styles.btnRow}>
                <SmallButton
                  label="Onayla ve kapat"
                  icon="checkmark"
                  onPress={() => void approve(r)}
                  disabled={busyId === r.id}
                  primary
                />
                <SmallButton label="Reddet" icon="close" onPress={() => setRejecting(r)} disabled={busyId === r.id} />
              </View>
            ) : (
              <Text style={styles.muted}>
                {r.status === 'approved' ? 'Onaylandı: etkinlik kapatıldı.' : 'Reddedildi: etkinlik devam etti.'}
                {r.admin_note ? ` Not: ${r.admin_note}` : ''}
              </Text>
            )}
          </View>
        ))
      )}

      <NoteModal
        visible={rejecting !== null}
        title="Talebi reddet"
        message={
          rejecting
            ? `“${rejecting.event_title}” devam eder. Düzenleyen reddedildiğini ve notunu etkinlik kartında görür; istersen kısa bir açıklama yaz.`
            : undefined
        }
        label="Açıklama (isteğe bağlı)"
        placeholder="Örn. Etkinlik yapıldığı için kapatılamaz."
        confirmLabel="Reddet"
        onClose={() => setRejecting(null)}
        onSubmit={(note) => (rejecting ? reject(rejecting, note) : Promise.resolve(null))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Üyeler
// ---------------------------------------------------------------------------

const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'Hepsi' },
  { value: 'online', label: 'Çevrimiçi' },
  { value: 'subscribed', label: 'Aboneler' },
  { value: 'muted', label: 'Susturulmuş' },
  { value: 'banned', label: 'Askıda' },
];

function MembersTab({
  onSelect,
  overrides,
}: {
  onSelect: (m: Member) => void;
  /** Üye sayfasında işlem yapılan üyelerin güncel hali (listeden daha yeniyse satırın yerine geçer) */
  overrides: Record<string, Override>;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [fetched, setFetched] = useState<{ rows: Member[]; at: number }>({ rows: [], at: 0 });
  // Liste sunucudan daha sonra geldiyse onun hali geçerli; işlem listeden sonra yapıldıysa işlem sonrası hal
  const members = fetched.rows.map((m) => {
    const o = overrides[m.id];
    return o && o.at > fetched.at ? o.member : m;
  });
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);

  // Çevrimiçi noktaları ve toplam 10 dakikada bir kendiliğinden yenilenir
  useEffect(() => {
    if (!isBackendReady) return;
    const t = setInterval(() => setTick((n) => n + 1), ONLINE_MS);
    return () => clearInterval(t);
  }, []);

  // Yazı yazarken her harfte değil, kısa bir duraklamadan sonra ara
  useEffect(() => {
    if (!isBackendReady) return;
    const my = ++requestId.current;
    const t = setTimeout(
      async () => {
        const [res, count] = await Promise.all([searchMembers(query, filter), countOnlineMembers()]);
        if (my !== requestId.current) return;
        setError(res.error);
        if (!res.error) setFetched({ rows: res.data, at: Date.now() });
        setOnline(count);
        setLoaded(true);
      },
      query ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [query, filter, tick]);

  return (
    <>
      <View style={styles.onlineBar}>
        <View style={[styles.dot, styles.dotOn]} />
        <Text style={styles.onlineText}>
          Şu an çevrimiçi: <Text style={styles.onlineCount}>{online ?? '…'}</Text>
        </Text>
        <Text style={styles.onlineHint}>10 dakikada bir yenilenir</Text>
      </View>
      <TextField
        label="Üye ara"
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Ad, soyad ya da rumuz"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {/* Süzgeç düğmeleri dar ekranda alt satıra geçebilsin diye Segmented yerine sarmalı satır */}
      <View style={styles.chipRow} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!loaded ? (
        <Text style={styles.muted}>Üyeler yükleniyor…</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : members.length === 0 ? (
        <Text style={styles.empty}>Bu aramayla eşleşen üye yok.</Text>
      ) : (
        members.map((m) => <MemberRow key={m.id} member={m} onPress={() => onSelect(m)} />)
      )}
      {loaded && members.length >= 40 ? (
        <Text style={styles.muted}>En yeni 40 üye gösteriliyor. Aradığını bulamazsan adını yazarak ara.</Text>
      ) : null}
    </>
  );
}

function MemberRow({ member, onPress }: { member: Member; onPress: () => void }) {
  const subscribed = isSubscriptionActive(member.premium_until);
  const muted = isFuture(member.muted_until);
  const banned = Boolean(member.banned_at);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${member.full_name}, rumuz ${member.alias}`}
      style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}
    >
      <Avatar index={member.avatar_index} size={44} />
      <View style={styles.memberText}>
        <View style={styles.nameLine}>
          <View
            style={[styles.dot, isMemberOnline(member) ? styles.dotOn : styles.dotOff]}
            accessibilityLabel={isMemberOnline(member) ? 'Çevrimiçi' : 'Çevrimdışı'}
          />
          <Text style={styles.memberName} numberOfLines={1}>
            {member.full_name}
          </Text>
        </View>
        <Text style={styles.muted} numberOfLines={1}>
          {member.alias} · {fmtPts(member.points)} puan
        </Text>
        <View style={styles.tags}>
          {member.role === 'admin' ? <Tag text="Moderatör" color={colors.accent} /> : null}
          {member.role === 'sponsor' ? <Tag text="Mekân" color={colors.venue} /> : null}
          {subscribed ? <Tag text="Abone" color={colors.primary} /> : null}
          {muted ? <Tag text="Susturulmuş" color={colors.danger} /> : null}
          {banned ? <Tag text="Askıda" color={colors.danger} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// İşlem günlüğü
// ---------------------------------------------------------------------------

const PACKAGE_SHORT: Record<string, string> = {
  daily: '1 gün',
  monthly: '1 ay',
  quarterly: '3 ay',
  yearly: '1 yıl',
};

function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} dakika`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} saat`;
  return `${Math.round(minutes / 1440)} gün`;
}

function auditDetail(a: AuditRow): string {
  const d = a.detail;
  const parts: string[] = [];
  if (typeof d.minutes === 'number') parts.push(durationText(d.minutes));
  if (typeof d.package === 'string') parts.push(PACKAGE_SHORT[d.package] ?? d.package);
  if (typeof d.amount === 'number') parts.push(`${fmtPtsSigned(d.amount)} puan`);
  if (d.status === 'resolved') parts.push('Çözüldü');
  if (d.status === 'dismissed') parts.push('Sorun yok dendi');
  if (typeof d.reason === 'string' && d.reason.trim()) parts.push(`Neden: ${d.reason.trim()}`);
  return parts.join(' · ');
}

function LogTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const res = await listAuditLog();
    setError(res.error);
    if (!res.error) setRows(res.data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  return (
    <>
      <Text style={styles.muted}>Moderatörlerin son işlemleri. Bu kayıt silinemez.</Text>
      {!loaded ? (
        <Text style={styles.muted}>Günlük yükleniyor…</Text>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{error}</Text>
          <PrimaryButton
            label="Tekrar dene"
            variant="ghost"
            onPress={() => {
              setLoaded(false);
              void load();
            }}
          />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Henüz kayıtlı bir işlem yok.</Text>
      ) : (
        rows.map((a) => {
          const detail = auditDetail(a);
          return (
            <View key={a.id} style={styles.logRow}>
              <Text style={styles.logAction}>
                {AUDIT_TEXT[a.action] ?? a.action}
                {a.target_name ? ` · ${a.target_name}` : ''}
              </Text>
              {detail ? <Text style={styles.muted}>{detail}</Text> : null}
              <Text style={styles.logMeta}>
                {a.admin_name} · {timeAgo(a.created_at)}
              </Text>
            </View>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileText: { color: colors.text, fontFamily: fonts.semi, fontSize: 11 },
  tileTextActive: { color: colors.primaryText },
  tileBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  linkText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  empty: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  notice: { fontSize: fontSizes.sm, lineHeight: 20 },
  noticeError: { color: colors.danger },
  noticeOk: { color: colors.success },
  reportCard: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeTag: {
    backgroundColor: 'rgba(124, 140, 255, 0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  typeTagText: { color: colors.accent, fontFamily: fonts.extra, fontSize: 11 },
  reportCount: { color: colors.danger, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  reportTime: { flex: 1, textAlign: 'right' },
  reportBody: { gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md },
  reportAlias: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  reportText: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  chipTextActive: { color: colors.primaryText },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  smallPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallDisabled: { opacity: 0.5 },
  smallText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  smallTextPrimary: { color: colors.primaryText },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  memberText: { flex: 1, gap: 2 },
  memberName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, flexShrink: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#12b76a' },
  dotOff: { backgroundColor: '#e02424' },
  onlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onlineText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  onlineCount: { fontFamily: fonts.black },
  onlineHint: { color: colors.textMuted, fontSize: 12, marginLeft: 'auto' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tag: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 1 },
  tagText: { fontFamily: fonts.semi, fontSize: 11 },
  logRow: {
    gap: 2,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  logAction: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm, lineHeight: 20 },
  logMeta: { color: colors.textMuted, fontSize: 12 },
});
