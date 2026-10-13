import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { goToDm } from '@/components/DirectMessages';
import { openDm } from '@/lib/dm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { PetekIcon } from '@/components/HexClusterIcon';
import { notify, notifyReportSent, showDialog } from '@/lib/dialog';
import {
  getAliasProfile,
  MENTION_RE,
  REPORT_REASONS,
  reportContent,
  type AliasProfile,
  type AliasProfilePost,
} from '@/lib/feed';
import { nextAliasChange, timeAgo } from '@/lib/labels';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/akis');
}

/**
 * Haftalık rumuz profili: bir gönderi ya da yorumun yazarının BU HAFTAKİ rumuzu, bu hafta akışta (petek akışı dahil)
 * paylaştıkları, kodla katıldığı etkinlik sayısı ve oynadığı oyun sayısı. Gerçek ad gösterilmez. Petek gönderilerinde
 * hangi petekte yazıldığı gizlidir. Her Pazartesi 00:00'da rumuzla birlikte sıfırlanır.
 */
export default function AliasProfileScreen() {
  const params = useLocalSearchParams<{ post?: string; comment?: string; alias?: string }>();
  const post = typeof params.post === 'string' ? params.post : null;
  const comment = typeof params.comment === 'string' ? params.comment : null;
  const aliasParam = typeof params.alias === 'string' ? params.alias : null;
  const [data, setData] = useState<AliasProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await getAliasProfile({ post, comment, alias: aliasParam });
    setData(res.data);
    setError(res.error);
    setLoaded(true);
  }, [post, comment, aliasParam]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  const reset = nextAliasChange();
  const [dmBusy, setDmBusy] = useState(false);

  /** Özel mesaj: yazışma açılır ya da başlatılır (yeni yazışmayı abone başlatır), akış ekranında açılır */
  async function messagePerson() {
    if (dmBusy) return;
    setDmBusy(true);
    const res = await openDm({
      post: post ?? undefined,
      comment: comment ?? undefined,
      alias: !post && !comment ? (aliasParam ?? undefined) : undefined,
    });
    setDmBusy(false);
    if (res.error || !res.id) {
      void notify('Mesaj gönderilemiyor', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'chatbubbles' });
      return;
    }
    goToDm(res.id);
  }

  /** Kişi şikayeti: profilin açıldığı gönderi/yorum üzerinden moderatöre gider (moderatör yazarı görebilir) */
  async function reportPerson() {
    const reason = await showDialog<string | null>({
      title: 'Bu kişiyi şikayet et',
      message: 'Şikayetin yalnızca moderatörlere gider; şikayet ettiğin kişi bunu bilmez.',
      icon: 'flag',
      buttons: [
        ...REPORT_REASONS.map((r) => ({ label: r, value: `Kişi şikayeti: ${r}`, style: 'primary' as const })),
        { label: 'Vazgeç', value: null, style: 'ghost' as const },
      ],
      cancelValue: null,
    });
    if (!reason) return;
    // Etiketten açılan profilde kişinin bu haftaki son gönderisi üzerinden bildirilir (moderatör yazarı görebilir)
    const viaPost = post ?? (!comment ? (data?.posts[0]?.id ?? null) : null);
    const res = viaPost
      ? await reportContent('post', viaPost, reason)
      : comment
        ? await reportContent('comment', comment, reason)
        : null;
    if (!res) return void notify('Şikayet gönderilemedi', 'Bu kişinin bu hafta bildirilebilecek bir gönderisi yok.');
    if (res.error) return void notify('Şikayet gönderilemedi', res.error, { icon: 'alert-circle' });
    await notifyReportSent();
  }

  return (
    <Screen
      title={data ? data.alias : 'Rumuz profili'}
      subtitle="Bu haftanın profili"
      onBack={goBack}
      backLabel="Geri"
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      {!loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : error || !data ? (
        <View style={styles.empty}>
          <Ionicons name="person-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{error ?? 'Profil açılamadı.'}</Text>
          <PrimaryButton label="Geri dön" variant="ghost" onPress={goBack} />
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <Avatar index={data.avatar_index} size={72} ring />
            <View style={styles.flex}>
              <Text style={styles.alias} numberOfLines={2}>
                {data.alias}
                {data.is_me ? ' (sen)' : ''}
              </Text>
              <Text style={styles.reset}>{`Rumuz ve profil ${reset.label} sıfırlanır (${reset.remaining})`}</Text>
            </View>
          </View>

          <View style={styles.stats}>
            <Stat icon="chatbubbles" value={data.post_count} label="Gönderi" />
            <Stat icon="at" value={data.mentions ?? 0} label="Bahsedilme" />
            <Stat icon="calendar" value={data.events} label="Etkinlik" />
            <Stat icon="game-controller" value={data.games} label="Oyun" />
          </View>

          <Text style={styles.section}>Bu hafta paylaştıkları</Text>
          {data.posts.length === 0 ? (
            <Text style={styles.muted}>Bu hafta henüz bir şey paylaşmadı.</Text>
          ) : (
            data.posts.map((p) => (
              <ProfilePost
                key={p.id}
                post={p}
                onOpen={() => router.navigate({ pathname: '/akis', params: { post: p.id, t: String(Date.now()) } })}
              />
            ))
          )}
          {!data.is_me ? (
            <>
              <PrimaryButton label="Özel mesaj gönder" onPress={() => void messagePerson()} loading={dmBusy} />
              <PrimaryButton label="Bu kişiyi şikayet et" variant="ghost" onPress={() => void reportPerson()} />
            </>
          ) : null}
          <Text style={styles.note}>
            Bu sayfada yalnızca bu haftanın rumuzu ve etkinlikleri görünür; gerçek ad ve hangi petekte yazıldığı
            gösterilmez. Her Pazartesi 00:00’da sıfırlanır.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Metindeki @rumuzları renkli gösterir */
function Body({ text }: { text: string }) {
  const parts: { t: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ t: text.slice(last, i), tag: false });
    parts.push({ t: m[0], tag: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), tag: false });
  return (
    <Text style={styles.body}>
      {parts.map((p, i) =>
        p.tag ? (
          <Text key={i} style={styles.mention}>
            {p.t}
          </Text>
        ) : (
          p.t
        ),
      )}
    </Text>
  );
}

function ProfilePost({ post, onOpen }: { post: AliasProfilePost; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Gönderiyi akışta aç"
      style={({ pressed }) => [styles.post, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.postHead}>
        <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        {post.in_cell ? (
          <View style={styles.chip}>
            <PetekIcon size={11} color={colors.accent} />
            <Text style={styles.chipText}>Petek akışı</Text>
          </View>
        ) : null}
        {post.place_name ? (
          <View style={styles.chip}>
            <Ionicons name="location" size={11} color={colors.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {post.place_name}
            </Text>
          </View>
        ) : null}
        {post.is_reply ? <Text style={styles.time}>· cevap</Text> : null}
      </View>
      <Body text={post.body} />
      {post.thread.map((t, i) => (
        <View key={t.id} style={styles.part}>
          <Text style={styles.partNo}>{`${i + 2}/${post.thread.length + 1}`}</Text>
          <Body text={t.body} />
        </View>
      ))}
      <View style={styles.counts}>
        <Count icon="heart" n={post.like_count} />
        <Count icon="chatbubble" n={post.comment_count} />
        <Count icon="happy" n={post.laugh_count} />
        <Count icon="add-circle" n={post.plus_count} />
        <Count icon="remove-circle" n={post.minus_count} />
      </View>
    </Pressable>
  );
}

function Count({ icon, n }: { icon: React.ComponentProps<typeof Ionicons>['name']; n: number }) {
  return (
    <View style={styles.count}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.countText}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  emptyText: { color: colors.text, fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  alias: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl },
  reset: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.xl },
  statLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi },
  section: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, marginTop: spacing.xs },
  post: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  time: { color: colors.textMuted, fontSize: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 180,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { color: colors.text, fontSize: 11, fontFamily: fonts.semi, flexShrink: 1 },
  body: { color: colors.text, fontSize: fontSizes.md, lineHeight: 22 },
  mention: { color: colors.accent, fontWeight: '800' },
  part: { gap: 2, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  partNo: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.extra },
  counts: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
