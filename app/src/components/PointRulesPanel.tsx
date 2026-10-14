import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { GamePointsModal } from '@/components/GamePointsModal';
import { InfoModal } from '@/components/InfoModal';
import { ListRow, Panel } from '@/components/Panel';
import type { InfoItem } from '@/lib/gameInfo';
import {
  attendTiersText,
  DEFAULT_RULES,
  SOURCE_LABELS,
  getMyMonthPoints,
  getPointRules,
  quizRuleSummary,
  type PointRules,
  type PointSourceRow,
} from '@/lib/ranking';
import { colors, fontSizes, spacing } from '@/theme';
import { fmtPts, fmtPtsSigned } from '@/lib/labels';

type Props = {
  /** Moderatörler sıralamaya girmez; kendi puan dökümü gösterilmez */
  showMine: boolean;
  /** Hediye programı açık ve kural metni doluysa true; kapalıyken hediyeden hiç söz edilmez */
  contestOn: boolean;
};

type Which = 'rules' | 'mine' | 'game' | null;

function ruleItems(rules: PointRules, contestOn: boolean): InfoItem[] {
  return [
    {
      icon: 'calendar',
      lead: `Etkinlik aç: +${rules.eventCreate}.`,
      text: `Ayda ${rules.eventCreateMonthEvents} etkinlikten puan alınır. İptal edilirse geri alınır.`,
    },
    {
      icon: 'checkmark-circle',
      lead: `Etkinliğe katıl: +${rules.eventAttend}–${rules.eventAttend40}.`,
      text: `Kalabalık etkinlik daha çok puan: ${attendTiersText(rules)}. 41. Kat Özel etkinliklerde her basamağa +${rules.eventAttendOfficialBonus}. Etkinlik yerinde, açan kişinin verdiği kodu yazarsın; bulunduğun bölge de bir kez kontrol edilir. Puan, etkinlikte en az ${rules.eventMinAttendees} kişinin katılımı doğrulanınca eklenir.${
        rules.eventCategoryDaily > 0
          ? ` Aynı gün aynı kategoriden en çok ${rules.eventCategoryDaily} etkinlikten puan alırsın.`
          : ''
      }${rules.eventHostDays > 0 ? ` Aynı kişinin etkinliklerinden ${rules.eventHostDays} günde bir.` : ''}`,
    },
    {
      icon: 'people-circle',
      lead: 'Ekip bonusu: x1,25 – x2.',
      text: 'Etkinliğe ekipçe gelip hepiniz kodu doğrularsanız katılım puanınız artar: 2 kişi x1,25 · 4 kişi x1,5 · 8 kişi x2. Ekibi etkinlik kartındaki “Ekip arıyorum” ile kurarsın.',
    },
    {
      icon: 'people',
      lead: `Etkinliğine gelenler: kişi başı +${rules.hostPerAttendee}.`,
      text: `Etkinlik başına en çok ${rules.hostAttendeeCap} kişi, ayda en çok ${rules.hostMonthCap} puan. Aynı kişi seni ${rules.pairCooldownDays} günde bir puanlandırır.`,
    },
    {
      icon: 'star',
      lead: `Etkinliği puanla: +${rules.eventRate}.`,
      text: `Düzenleyen 5 yıldızda +${rules.eventRated5}, 4 yıldızda +${rules.eventRated4} alır (ayda en çok ${rules.eventRatedMonthCap}).`,
    },
    {
      icon: 'game-controller',
      lead: `Oyun oyna: uzaktan en çok +${rules.gameTopCap}, yan yana ×${rules.sideMult}.`,
      text: `Kalabalık oyun daha çok puan; puan bitirdiğin sıraya göre. Her oyundan ayda uzaktan ${rules.remoteMonthPoints}, yan yana ${rules.sideMonthPoints} puanlık hedef. Mekân koduyla mekânda +%${Math.max(0, rules.venueBonusPct - 100)}. Ayrıntısı aşağıda.`,
    },
    {
      icon: 'help-circle',
      lead: `Bilgi Yarışması: ayda +${rules.quizMonthPoints} hedef.`,
      text: quizRuleSummary(rules),
    },
    ...(rules.titlesEnabled > 0
      ? [
          {
            icon: 'ribbon' as const,
            lead: 'Oyun şampiyonu.',
            text: 'Her oyunun ay birincisi sonraki ay “<Oyun> Şampiyonu” ünvanını taşır. Ünvan puan getirmez, yalnızca adının yanında görünür.',
          },
        ]
      : []),
    {
      icon: 'shield-checkmark',
      lead: 'Adil oyun.',
      text: `Abonelik puanı artırmaz.${rules.paidEvents ? '' : ' Ücretli etkinlikler puan getirmez.'} Hile ya da sahte hesap şüphesi moderatörlerce incelenir.${
        contestOn ? ' Hediyeler bu inceleme bittikten sonra verilir.' : ''
      }`,
    },
  ];
}

/**
 * Puan bilgileri: ekranı kalabalıklaştırmamak için kısa satırlar; ayrıntılar dokununca açılan pencerelerde.
 * Sayılar sunucu ayarlarından gelir.
 */
export function PointRulesPanel({ showMine, contestOn }: Props) {
  const [which, setWhich] = useState<Which>(null);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [mine, setMine] = useState<PointSourceRow[] | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);

  useEffect(() => {
    if (which !== 'rules' && which !== 'mine') return;
    let active = true;
    if (which === 'rules') {
      void getPointRules().then((r) => {
        if (active) setRules(r);
      });
    } else if (showMine) {
      void getMyMonthPoints().then((res) => {
        if (!active) return;
        setMineError(res.error);
        setMine(res.error ? null : res.data);
      });
    }
    return () => {
      active = false;
    };
  }, [which, showMine]);

  const total = (mine ?? []).reduce((n, r) => n + r.points, 0);

  return (
    <>
      <Panel>
        <ListRow
          icon="help-circle"
          title="Puan nasıl kazanılır?"
          subtitle="Kısa kurallar"
          onPress={() => setWhich('rules')}
        />
        {showMine ? (
          <ListRow
            icon="stats-chart"
            title="Bu ay kazandıklarım"
            subtitle="Hangi işten kaç puan"
            onPress={() => setWhich('mine')}
          />
        ) : null}
        {contestOn ? (
          <ListRow
            icon="document-text"
            title="Yarışma ve hediye kuralları"
            subtitle="Düzenleyen, hediyeler, katılım koşulları"
            onPress={() => router.push('/kurallar')}
          />
        ) : null}
      </Panel>

      <InfoModal
        visible={which === 'rules'}
        onClose={() => setWhich(null)}
        title="Puan nasıl kazanılır?"
        icon="help-circle"
        items={ruleItems(rules, contestOn)}
        note={`Katılım kodu etkinlikten 5 dakika önce açılır. Ekipçe gelenlerin katılım puanı artar (2 kişi x1,25 · 4 kişi x1,5 · 8 kişi x2); kod girişi etkinlik başladıktan 30 dakika sonra (Konser & Festival’de 15 dakika sonra) kapanır. Yanlış kodu çok denersen giriş kilitlenir. Konum yalnızca kodu yazarken bir kez alınır.`}
      >
        <Text style={styles.moreLink} onPress={() => setWhich('game')} accessibilityRole="button">
          Oyun puanı nasıl hesaplanır? →
        </Text>
      </InfoModal>

      <GamePointsModal visible={which === 'game'} onClose={() => setWhich(null)} />

      <InfoModal
        visible={which === 'mine'}
        onClose={() => setWhich(null)}
        title="Bu ay kazandıkların"
        icon="stats-chart"
      >
        {mineError ? (
          <Text style={styles.text}>{mineError}</Text>
        ) : mine === null ? (
          <Text style={styles.text}>Yükleniyor…</Text>
        ) : mine.length === 0 ? (
          <Text style={styles.text}>Bu ay henüz puan kazanmadın.</Text>
        ) : (
          <View style={styles.mine}>
            {mine.map((r) => (
              <View key={r.source} style={styles.mineRow}>
                <Text style={styles.mineLabel}>
                  {SOURCE_LABELS[r.source] ?? 'Diğer'} · {r.entries} kez
                </Text>
                <Text style={[styles.minePoints, r.points < 0 && styles.negative]}>{fmtPtsSigned(r.points)}</Text>
              </View>
            ))}
            <View style={[styles.mineRow, styles.totalRow]}>
              <Text style={styles.mineTotal}>Toplam</Text>
              <Text style={styles.mineTotal}>{fmtPts(total)}</Text>
            </View>
          </View>
        )}
      </InfoModal>
    </>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  moreLink: { color: colors.primary, fontWeight: '700', fontSize: fontSizes.sm },
  mine: { gap: spacing.sm },
  totalRow: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  mineLabel: { flex: 1, color: colors.textMuted, fontSize: 13 },
  minePoints: { color: colors.success, fontWeight: '800', fontSize: fontSizes.sm },
  negative: { color: colors.danger },
  mineTotal: { color: colors.text, fontWeight: '800', fontSize: fontSizes.sm },
});
