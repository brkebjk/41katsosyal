import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { DEFAULT_CONTEST, contestOn, getContest, type Contest } from '@/lib/contest';
import { useIdentityEnabled } from '@/lib/identityFlag';
import {
  attendTiersText,
  DEFAULT_RULES,
  getPointRules,
  getRankingInfo,
  listLevels,
  quizRuleSummary,
  type LevelInfo,
  type PointRules,
} from '@/lib/ranking';
import { LEVEL_RULES, perkText } from '@/lib/levelPerks';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type SectionData = { title: string; lines: string[] };

/**
 * Yarışma ve hediye kuralları. Mağaza kuralları gereği (Apple 5.3, Google Play yarışmalar politikası)
 * resmi kurallar uygulamanın içinde, ödül verilmeden önce okunabilir olmalıdır.
 * Sayılar ve metinler sunucudaki ayarlardan gelir; hediye programı kapalıyken hediyeden söz edilmez.
 */
function buildSections(
  contest: Contest,
  rules: PointRules,
  on: boolean,
  weekly: boolean,
  levels: LevelInfo[],
  identityOn: boolean,
): SectionData[] {
  const sections: SectionData[] = [];

  if (on) {
    sections.push({
      title: 'Düzenleyen',
      lines: [
        `Bu program ${contest.organizer} tarafından düzenlenir. Sorular için: ${contest.contact}`,
        'Apple ve Google bu programın sponsoru değildir, programla ilgisi yoktur ve sorumluluk kabul etmez.',
      ],
    });
  }

  const free = [
    'Sıralamaya girmek ve hediye için yarışmak ücretsizdir. Herhangi bir ödeme yapman gerekmez.',
    'Abonelik puanını ya da hediye kazanma şansını artırmaz. Aboneler daha çok etkinlik ve oyun açabilir; ancak puan için konulan üst sınırlar herkes için aynıdır (yalnızca Seviye 4 ödülü, Bilgi Yarışması puan sınırlarını büyütür).',
  ];
  if (!rules.paidEvents) {
    free.push('Ücretli etkinliklere katılmak ya da ücretli etkinlik açmak puan getirmez.');
  }
  sections.push({ title: 'Katılım ücretsizdir', lines: free });

  if (on) {
    sections.push({
      title: 'Kimler katılabilir',
      lines: [
        '18 yaşını doldurmuş, hesabı yasaklanmamış her üye katılabilir.',
        'Moderatörler ve uygulama ekibi sıralamaya girmez, hediye alamaz.',
        ...(identityOn
          ? [
              'Hesabını doğrulamamış (sarı tiki olmayan) üyeler sıralamada yer alır ama hediye ya da sıralama ödülü alamaz; ödül sıradaki doğrulanmış üyeye geçer. Hesabını Profil sekmesinden doğrulayabilirsin.',
            ]
          : []),
      ],
    });
    sections.push({
      title: 'Dönem ve kazananlar',
      lines: [
        'Her takvim ayı ayrı bir dönemdir (Türkiye saati). Sıralama ayın ilk gününde sıfırlanır.',
        weekly
          ? 'Puanların hemen hesabına yazılır; ancak sıralama tablosu haftada bir (pazartesi 00:00) güncellenir. Ay bittiğinde “Geçen ay” tablosu kesin sonuçları gösterir ve kazananlar bu kesin tabloya göre belirlenir.'
          : 'Sıralama tablosu puanlarla birlikte anında güncellenir. Ay bittiğinde “Geçen ay” tablosu kesin sonuçları gösterir ve kazananlar bu tabloya göre belirlenir.',
        'Dönem sonunda Genel puan sıralamasındaki ilk 3 üye kazanır. Her dönemde 3 kazanan vardır.',
        'Hediye alabilmek için o ay en az bir etkinliğe katılmış ya da en az bir yan yana oyun oynamış olmak gerekir. Yalnızca uzaktan oynayan üye hediye alamaz; hediye şartı sağlayan sıradaki üyeye geçer.',
        'Puanlar eşitse o puana önce ulaşan üye öne geçer.',
        'Oyun sıralamaları hediyeye dahil değildir; yalnızca görseldir.',
      ],
    });
  }

  sections.push({
    title: 'Puanlar nasıl kazanılır',
    lines: [
      'Oyunlarda masadaki ya da odadaki oyuncu sayısı arttıkça puan çarpanı yükselir; yalnızca 1. değil, 2., 3. ve sonraki sıralar da puan kazanır. Arkadaşlarını davet ettikçe herkes daha çok puan alır.',
      'Uzaktan oyun (sesli sohbetle): aynı sonucun yan yana oyundaki puanının yarısını verir ve günlük/aylık puan sınırı yan yana oyundan düşüktür. Uzaktan oyun oyun hakkından yemez; yan yana oyun iki kat puan verir ve oyun hakkından yer.',
      `Etkinlik açmak: +${rules.eventCreate} puan (ayda en fazla ${rules.eventCreateMonthEvents} etkinlik).`,
      `Etkinliğe katılıp kodu yazmak: kalabalık etkinlik daha çok puan getirir (${attendTiersText(rules)}); 41. Kat Özel etkinliklerde her basamağa +${rules.eventAttendOfficialBonus} puan eklenir. Etkinlik kalabalıklaştıkça daha önce puan alanlara da aradaki fark yazılır. Katılabileceğin etkinlik sayısında sınır yoktur; ancak puan, etkinlikte en az ${rules.eventMinAttendees} kişinin katılımı kodla ve bölge bilgisiyle doğrulanınca eklenir.`,
      `Etkinliğine gelen katılımcılar: kişi başı +${rules.hostPerAttendee} puan (bir etkinlikte en fazla ${rules.hostAttendeeCap} kişi, ayda en fazla ${rules.hostMonthCap} puan).`,
      `Oyun oynamak: oyuna ne kadar çok kişi katılırsa puan o kadar artar. 1. sıranın puanı oyuncu sayısı × kalabalık çarpanıdır: 4 kişiden sonra her oyuncu çarpanı %10 artırır (4 kişi 4, 6 kişi 7, 8 kişi 11, 10 kişi 16, en çok ${rules.gameTopCap}); puan, oyunu kaçıncı sırada bitirdiğine göre verilir: 1. sıra hepsini alır, her sıra aşağıda biraz azalır, son sıra 1 puan alır. Puan için oyun en az ${rules.gameMinPlayers} kişiyle oynanmalıdır (günde en fazla ${rules.gameDailyCap}, ayda en fazla ${rules.gameMonthCap} oyun).`,
      `Bilgi Yarışması: uzaktan oynanır, oyun hakkını harcamaz ama her oyun 1 can harcar (en çok ${rules.quizMaxLives} can, her ${rules.quizLifeMinutes} dakikada 1 can dolar). ${quizRuleSummary(rules)} Özel odada aynı kişilerden biriyle oynanan maçlardan günde en çok 5 puan alınır. Solo / Hafta sıralamasında (haftanın toplam doğrusu, yalnızca 5+ doğrulu koşular) ilk 3 sonraki hafta 10 canla oynar; Çoklu / Ay (Uzaktan) sıralamasında ilk 3'e moderatör onayıyla 1 aylık abonelik verilir.${identityOn ? ' Bu ödülleri yalnızca hesabını doğrulamış üyeler alır.' : ''} Uzaktan maç başladıktan sonra çıkan kaybeder. Çekiliş puan getirmez.`,
    ],
  });

  // Seviyeler ve ödülleri
  sections.push({
    title: 'Seviyeler ve seviye ödülleri',
    lines: [
      ...levels.map(
        (l) => `Seviye ${l.level} · ${l.name} (${l.min_points.toLocaleString('tr-TR')} puan): ${perkText(l.perk)}.`,
      ),
      ...LEVEL_RULES,
    ],
  });

  if (rules.titlesEnabled > 0) {
    sections.push({
      title: 'Oyun şampiyonu ünvanları',
      lines: [
        `Her oyunun ay birincisi, sonraki ay boyunca “<Oyun> Şampiyonu” ünvanını taşır. Ünvan için o oyundan o ay puan getiren en az ${rules.titleMinPlays} oyun oynamış olmak gerekir. Puan eşitse önce daha çok kazanan, sonra puana daha erken ulaşan alır.`,
        'Ünvan yalnızca görseldir; puan, hediye ya da başka bir avantaj getirmez. Yalnızca gerçek adın göründüğü yerlerde gösterilir.',
      ],
    });
  }

  sections.push({
    title: 'Adil oyun',
    lines: [
      'Katılım, etkinliği açan kişinin yerinde verdiği kodla ve katılımcının o sırada bulunduğu bölgeyle doğrulanır (konum yalnızca kod yazılırken bir kez alınır, tam konum saklanmaz). Kodu önceden paylaşmak, sahte hesap açmak, kendi etkinliğine sahte katılımcı eklemek ya da puanı başka haksız yollarla artırmak yasaktır.',
      on
        ? 'Şüpheli kayıtları moderatörler inceler. Haksız kazanılan puanlar silinebilir ve üye programdan çıkarılabilir. Hediyeler bu inceleme bittikten sonra verilir.'
        : 'Şüpheli kayıtları moderatörler inceler. Haksız kazanılan puanlar silinebilir.',
    ],
  });

  if (on) {
    sections.push({
      title: 'Hediyeler ve teslim',
      lines: [
        contest.prizes,
        `Kazananlar dönem bittikten sonra en geç ${contest.awardDays} gün içinde duyurulur ve hediyeler bu süre içinde teslim edilir.`,
        'Hediyeyi teslim edebilmek için adın, yaşın ve iletişim bilgilerin doğrulanabilir. Bu bilgiler yalnızca hediyenin teslimi için kullanılır. Kazananın adı uygulamada ya da duyurularda yayımlanabilir.',
        'Kazanana ulaşılamazsa ya da kazanan koşulları sağlamıyorsa hediye bir sonraki sıradaki üyeye verilir.',
      ],
    });
  }

  sections.push({
    title: 'Görünürlük',
    lines: ['Sıralamada gerçek adın ve puanın diğer üyelere görünür. Akıştaki rumuzun sıralamada yer almaz.'],
  });

  if (on) {
    sections.push({
      title: 'Değişiklikler',
      lines: [
        'Düzenleyen, kuralları üyelere önceden duyurarak güncelleyebilir. Güncel kurallar her zaman bu sayfadadır.',
      ],
    });
  }

  return sections;
}

export default function RulesScreen() {
  const identityOn = useIdentityEnabled();
  const [contest, setContest] = useState<Contest>(DEFAULT_CONTEST);
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);
  const [weekly, setWeekly] = useState(true);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [c, r, inf, lv] = await Promise.all([getContest(), getPointRules(), getRankingInfo(), listLevels()]);
    setContest(c);
    setRules(r);
    setWeekly(inf ? inf.weekly : true);
    setLevels(lv);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([getContest(), getPointRules(), getRankingInfo(), listLevels()]).then(([c, r, inf, lv]) => {
      if (!active) return;
      setContest(c);
      setRules(r);
      setWeekly(inf ? inf.weekly : true);
      setLevels(lv);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const on = contestOn(contest);
  const sections = buildSections(contest, rules, on, weekly, levels, identityOn);

  return (
    <Screen
      title="Yarışma kuralları"
      subtitle="Sıralama, hediyeler ve katılım koşulları"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => void load()}
    >
      {!loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : (
        <>
          {!on ? (
            <View style={styles.banner} testID="contest-off">
              <Ionicons name="information-circle" size={22} color={colors.primary} />
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>Hediye programı şu an kapalı</Text>
                <Text style={styles.text}>
                  Şu anda sıralamadaki üyelere hediye verilmiyor; sıralama ve puanlar eğlence içindir. Program açılınca
                  kuralların tamamı bu sayfada yer alır.
                </Text>
              </View>
            </View>
          ) : null}
          {sections.map((s) => (
            <View key={s.title} style={styles.card}>
              <Text style={styles.cardTitle} accessibilityRole="header">
                {s.title}
              </Text>
              {s.lines.map((line, i) => (
                <Text key={i} style={styles.text}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
  },
  bannerText: { flex: 1, gap: 4 },
  bannerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
});
