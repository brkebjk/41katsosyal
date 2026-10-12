import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatBubble } from '@/components/ChatBubble';
import { Meter } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { listMySkins, setMySkin, skinColors, type MySkin } from '@/lib/bubbleSkins';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const SAMPLE = 'Bu akşam kim geliyor?';

export default function BubblesScreen() {
  const [skins, setSkins] = useState<MySkin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMySkins();
    setError(res.error);
    if (!res.error) setSkins(res.data);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function choose(key: string) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    const res = await setMySkin(key);
    if (res.error) {
      setNotice(res.error);
    } else {
      setSkins((cur) => cur.map((s) => ({ ...s, selected: s.key === key })));
      setNotice('Balon rengin güncellendi. Yeni gönderi ve yorumlarında bu renk görünür.');
    }
    setBusy(null);
  }

  const earned = skins.filter((s) => s.unlocked && s.key !== 'standard').length;
  const rewardCount = skins.filter((s) => s.key !== 'standard').length;

  return (
    <Screen
      title="Balonlarım"
      subtitle="Akıştaki konuşma balonlarının rengi"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => void load()}
    >
      <Text style={styles.intro}>
        Bir oyunun en yüksek başarımına ulaşınca o oyunun balon rengini kazanırsın. Seçtiğin renk tüm gönderi ve
        yorumlarında görünür. Rumuzun her hafta değişse de balon rengin aynı kalır; yani rengini görenler bunun aynı
        kişi olabileceğini fark edebilir.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
        </View>
      ) : !loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : (
        <>
          <Text style={styles.count}>
            {earned}/{rewardCount} renk kazanıldı
          </Text>
          {notice ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          <View style={styles.list}>
            {skins.map((s) => (
              <SkinCard key={s.key} skin={s} busy={busy === s.key} onChoose={() => void choose(s.key)} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function SkinCard({ skin, busy, onChoose }: { skin: MySkin; busy: boolean; onChoose: () => void }) {
  const c = skinColors(skin.key);
  const verb = skin.key === 'raffle' ? 'çekilişe katıl' : 'oyun oyna';
  return (
    <View style={[styles.card, skin.selected && styles.cardSelected]}>
      <View style={styles.head}>
        <Text style={styles.name}>{skin.label}</Text>
        {skin.selected ? <Text style={styles.selectedTag}>Seçili</Text> : null}
      </View>
      <View style={[styles.preview, !skin.unlocked && styles.previewLocked]}>
        <ChatBubble skin={skin.key}>
          <Text style={[styles.sample, { color: c.text }]}>{SAMPLE}</Text>
        </ChatBubble>
      </View>
      {skin.unlocked ? (
        skin.selected ? null : (
          <PrimaryButton label="Bunu seç" variant="ghost" onPress={onChoose} loading={busy} />
        )
      ) : (
        <View style={styles.lock}>
          {skin.key === 'vampire_villager' ? (
            <Text style={styles.lockText}>
              Vampir–Köylü’nün 5 başarım görevinin hepsini tamamla (Başarımlar ekranında görebilirsin).
            </Text>
          ) : (
            <>
              <Text style={styles.lockText}>
                {skin.required_plays.toLocaleString('tr-TR')} {verb} ve en yüksek başarımı kazan:{' '}
                {Math.min(skin.plays, skin.required_plays).toLocaleString('tr-TR')}/
                {skin.required_plays.toLocaleString('tr-TR')}
              </Text>
              <Meter value={Math.min(skin.plays / Math.max(skin.required_plays, 1), 1)} color={c.border} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  errorBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  errorText: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  count: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.md },
  notice: { color: colors.success, fontSize: fontSizes.sm, lineHeight: 20 },
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardSelected: { borderColor: colors.primary },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  selectedTag: { color: colors.primary, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  preview: { paddingVertical: spacing.xs },
  previewLocked: { opacity: 0.45 },
  sample: { fontSize: fontSizes.md, lineHeight: 23 },
  lock: { gap: spacing.sm },
  lockText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
