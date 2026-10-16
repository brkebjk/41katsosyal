import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RoleIcon } from '@/components/RoleIcon';
import { Text } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { SK_ROLES, SK_TEAMS, type SkRole } from '@/lib/shark';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Köpekbalığı Kafesi oyun rehberi: açılır bölümler. Oyunun içinden "Rehber" düğmesiyle de açılır. */
export default function SharkGuideScreen() {
  const [open, setOpen] = useState<string | null>('amac');
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));
  const sec = (k: string, icon: string, title: string, body: ReactNode) => (
    <Section key={k} open={open === k} onToggle={() => toggle(k)} icon={icon} title={title}>
      {body}
    </Section>
  );
  const rows = Array.from({ length: 11 }, (_, i) => {
    const n = i + 6;
    const s = Math.floor(n * 0.3 + 0.5);
    const q = n >= 16 ? 2 : n >= 10 ? 1 : 0;
    return { n, s, h: n - s - q, q };
  });
  return (
    <Screen
      title="Köpekbalığı Kafesi"
      subtitle="Oyun rehberi"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
      backLabel="Geri"
    >
      <RoleTable />
      {sec(
        'amac',
        '🦈',
        'Oyun nedir?',
        <>
          <P>
            Deniz temalı gizli rol oyunu (6–16 kişi). Her oyuncuya çarktan gizli bir rol gelir. Köpekbalıkları her dalışta
            birini avlar; insanlar konuşarak, oy vererek ve yetenekleriyle köpekbalıklarını bulup ekipten çıkarmaya çalışır.
            Tarafsızlar kendi gizli hedeflerinin peşindedir.
          </P>
          <P>Bir tur ortalama 5–8 dakika sürer. Her şey tek ekranda; aşağı kaydırmana gerek yok.</P>
        </>,
      )}
      {sec(
        'akis',
        '🔁',
        'Oyunun akışı',
        <>
          <Step n="1" title="Rol çarkı">Çark döner, rolün gelir. Ekranını kimseye gösterme.</Step>
          <Step n="2" title="Dalış (Resif Keşfi)">
            Görüş düşer, ekran kararır. Köpekbalıkları avını seçer, özel roller yeteneğini kullanır. Üstteki “Oksijen”
            çubuğu dalışın kalan süresidir. Seçimini bir avatara dokunup alttaki düğmeyle onaylarsın.
          </Step>
          <Step n="3" title="Su Üstü (Toplantı)">
            Su üstüne çıkılır; dalışta avlananlar ve rolleri herkese açıklanır. Konuşun, savunun, ipuçlarını paylaşın. Zıpkıncı
            zıpkın atabilir, Komutan kimliğini açabilir.
          </Step>
          <Step n="4" title="Karar Oylaması">
            Herkes şüpheliye oy verir. En çok oyu alan ekipten çıkarılır ve rolü açıklanır. Eşitlikte kimse çıkmaz. Sonra
            sıradaki dalış başlar.
          </Step>
        </>,
      )}
      {sec(
        'oylar',
        '⛓️',
        'Oylar ekranda nasıl görünür?',
        <>
          <P>Oylar herkese açıktır. Her avatarın sol üstünde büyük, sarı bir koltuk numarası vardır (1–16).</P>
          <P>
            Avatarın altındaki tahta tabela, o kişinin kime oy verdiğini koltuk numarasıyla gösterir; tabeladaki ok oy
            verdiği kişinin avatarına döner. “PAS” = oy kullanmadı.
          </P>
          <P>
            Avatarın içinde, alt ortadaki küçük simge rolü gösterir. Bunu yalnızca görmeye hakkı olanlar görür: sen kendi
            rolünü, köpekbalıkları takım arkadaşlarını, herkes açıklanan rolleri; oyun bitince herkes hepsini.
          </P>
          <P>Avatarın sağ üstündeki kırmızı sayı, o kişinin aldığı ekipten çıkarma oyudur.</P>
          <P>
            Avatar çerçevesi: kendi takımından olduğunu bildiğin oyuncu ince yeşil, bilinmeyenler sarı, rolü açığa çıkan
            rakip kırmızı çerçeveyle görünür.
          </P>
          <P>Kimliğini açmış Sahil Güvenlik Komutanı’nın oyu 2 sayılır; tabelası sarıdır ve “×2” yazar.</P>
        </>,
      )}
      {sec(
        'dagilim',
        '👥',
        'Takımlar ve rol dağılımı',
        <>
          <P>
            Köpekbalıkları oyuncuların yaklaşık %30’u, tarafsızlar 10–15 kişide 1, 16 kişide 2; geri kalan herkes
            insandır.
          </P>
          <View style={styles.table}>
            <View style={[styles.tr, styles.thRow]}>
              <Text style={[styles.th, styles.td1]}>Oyuncu</Text>
              <Text style={styles.th}>🦈</Text>
              <Text style={styles.th}>🏖️</Text>
              <Text style={styles.th}>🌀</Text>
            </View>
            {rows.map((r) => (
              <View key={r.n} style={styles.tr}>
                <Text style={[styles.td, styles.td1]}>{r.n}</Text>
                <Text style={styles.td}>{r.s}</Text>
                <Text style={styles.td}>{r.h}</Text>
                <Text style={styles.td}>{r.q}</Text>
              </View>
            ))}
          </View>
          <P>
            Köpekbalıklarında her zaman 1 Alfa vardır; diğerleri Çekiçbaş, Kaplan ve Hemşire’den rastgele gelir (5.
            köpekbalığı özelliksizdir). İnsanlarda Cankurtaran ve Oşinograf her oyunda var; Zıpkıncı 7, Komutan 8, Medyum 10
            kişiden itibaren gelir; kalanlar Tatilci’dir. Batık Hazine Avcısı’nın gelme ihtimali düşüktür (%15).
          </P>
        </>,
      )}
      {sec('kopek', '🦈', 'Köpekbalığı takımı (avcılar)', <Roles list={['alpha', 'tiger', 'hammer', 'nurse', 'shark']} />)}
      {sec(
        'insan',
        '🏖️',
        'İnsanlar (tatilciler ve koruyucular)',
        <Roles list={['lifeguard', 'oceanographer', 'spearman', 'marshal', 'medium', 'tourist']} />,
      )}
      {sec('taraf', '🌀', 'Tarafsızlar (bağımsız deniz canavarları)', <Roles list={['squid', 'surfer', 'scavenger']} />)}
      {sec(
        'sira',
        '🌙',
        'Dalışta ne sırayla olur?',
        <>
          <Step n="1" title="Çekiçbaş kilitler">Kilitlediği kişinin o resif keşfindeki yeteneği çalışmaz.</Step>
          <Step n="2" title="Korumalar">Cankurtaran ve Hemşire korur.</Step>
          <Step n="3" title="Saldırılar">
            Köpekbalıklarının avı (korunan ölmez; Mürekkep Balığı ısırılamaz), Mürekkep Balığı’nın boğması (koruma işe
            yaramaz) ve Sörfçü’nün “Telsiz Patlat”ı (korunan kurtulur).
          </Step>
          <Step n="4" title="Bilgi">Kaplan ve Oşinograf sonuçlarını alır; su üstünde notlarında görünür.</Step>
          <P>
            Köpekbalıklarının avı: en çok seçilen kişi. Eşitse Alfa’nın seçimi geçer (Alfa ölmüşse en eski köpekbalığı).
          </P>
        </>,
      )}
      {sec(
        'kazanma',
        '🏆',
        'Kim nasıl kazanır?',
        <>
          <Win color={SK_TEAMS.human.color} title="İnsanlar">
            Bütün köpekbalıkları, Dev Mürekkep Balığı ve Yalnız Sörfçü elenince.
          </Win>
          <Win color={SK_TEAMS.shark.color} title="Köpekbalıkları">
            Sayıları geri kalanlara eşit olunca (ve Mürekkep Balığı / Sörfçü hayatta değilse).
          </Win>
          <Win color={SK_ROLES.squid.color} title="Dev Mürekkep Balığı / Yalnız Sörfçü">
            Tek başına ya da biriyle baş başa kalınca.
          </Win>
          <Win color={SK_ROLES.scavenger.color} title="Batık Hazine Avcısı">
            Karar Oylamasıyla ekipten çıkarılınca. Oyun o an biter ve herkes kaybeder.
          </Win>
        </>,
      )}
      {sec(
        'puan',
        '⭐',
        'Puan',
        <>
          <P>
            Kazanan takım 1. sırada sayılır; diğerleri oyunda ne kadar uzun kaldıysa o kadar önde. Kalabalık arttıkça 1.
            sıranın puanı yükselir; 2. ve 3. sıralar da puan alır.
          </P>
          <P>Puan için en az 5 oyuncu gerekir. Yan yana oyun (konum doğrulanır) uzaktan oyunla aynı puanı verir, aylık hedefi daha yüksektir; mekân koduyla mekânda oynarsan +%25. Etkinlik oyunu Oyun Geceleri’nde 1,5 kat, Sosyal Buluşmalar ve Müzik & Eğlence’de 1,25 kat.</P>
          <P>Her ay bu oyundan uzaktan en çok 250, yan yana en çok 1.750 puan kazanılır (aylık hedef).</P>
          <P>Anlatıcılı oyunda kimse puan almaz.</P>
        </>,
      )}
      {sec(
        'anlatici',
        '🎭',
        'Anlatıcı modu',
        <P>
          Yalnızca etkinlik oyununda ve yalnızca etkinliğin sahibi seçebilir. Anlatıcı oynamaz; herkesin rolünü görür ve
          aşamaları ilerletir. Bu oyun eğlence içindir: puan yazılmaz.
        </P>,
      )}
      {sec(
        'uzaktan',
        '🎙️',
        'Uzaktan oyun ve bas-konuş',
        <>
          <P>
            Uzaktan odada herkes kendi telefonundan oynar. Konuşmak için mikrofon düğmesine basılı tut: en çok 5 saniyelik
            bir ses mesajı kaydedilir. Her tartışmada (su üstü + oylama ya da bir dalış) toplam en çok 10 saniye
            konuşabilirsin. Mesajlar sırayla çalar; konuşanın avatarı öne çıkar. Biri konuşurken sen de basabilirsin,
            senin mesajın onunki bitince duyulur.
          </P>
          <P>Kötü bir ses mesajını şikâyet etmek için konuşan oyuncunun avatarına basılı tut.</P>
          <P>
            “Uzaktan Eşleş” dersen haritada oyuncu aranır; 3 kişi olunca bekleme odası açılır. Odada 6 kişi olunca
            “Hazırım” düğmesi açılır; hazır diyenler demeyenlerden fazla olunca oyun başlar. Beklersen ya da “Davet
            bağlantısı” ile arkadaşını çağırırsan kalabalık oyun daha çok puan verir. Eşleştirmede herkes rumuzuyla görünür.
          </P>
          <P>Dalışta mikrofonlar kapalıdır; yalnızca köpekbalıkları kendi frekanslarında konuşabilir.</P>
          <P>
            Yazışma için ekrandaki yüzen 💬 baloncuğa dokun; baloncuğu istediğin yere sürükleyebilirsin. Açılan pencerenin
            başlığından tutup pencereyi taşıyabilirsin. Genel, Takım (köpekbalıkları) ve Ölüler sekmelerinde oyunun bütün
            mesaj geçmişi resif keşfi ve toplantı başlıklarıyla görünür. Yeni mesaj gelince baloncukta kırmızı sayı çıkar.
          </P>
          <P>
            Oyun başladıktan sonra oda sahibi ayrılırsa oda kapanmaz: sahiplik başka bir oyuncuya geçer ve oyun sürer.
            Eşleştirme lobisinde de böyledir.
          </P>
          <P>
            Ses mesajları en geç 10 dakika sonra sunucudan silinir. Şikâyet edilen mesaj, moderatör inceleyene kadar en çok
            14 gün saklanır.
          </P>
        </>,
      )}
      {sec(
        'gizlilik',
        '🔒',
        'Gizlilik ve hile',
        <P>
          Roller sunucuda tutulur; telefonuna yalnızca kendi rolün (köpekbalığıysan takımın) gelir. Ekranını kimseye
          gösterme. Elenenlerin ve köpekbalıklarının sohbetinde hakaret ya da kişisel bilgi isteme yasaktır; mesaja uzun
          basarak bildirebilirsin.
        </P>,
      )}
    </Screen>
  );
}

/** Bütün rollerin kısa özeti (rehberin en üstünde) */
const SHORT: Record<SkRole, string> = {
  alpha: 'Dalışta avı seçer; oylar eşitse son söz onundur.',
  tiger: 'Dalışta av + birini izler: o dalışta kimi ziyaret ettiğini öğrenir.',
  hammer: 'Dalışta av + bir insanın yeteneğini kilitler.',
  nurse: 'Dalışta av + bir köpekbalığını korur (Sörfçü ve sonraki toplantıda Zıpkın).',
  shark: 'Dalışta takımıyla avı seçer.',
  lifeguard: 'Dalışta birini korur; kendini yalnızca 1 kez.',
  oceanographer: 'Dalışta birine bakar: takımı + son 2 resif keşfinin akıntısı.',
  spearman: 'Su üstünde tek zıpkın (2. toplantıdan). Masum vursa da ölmez.',
  marshal: 'Su üstünde kimliğini açar; oyu 2 sayılır.',
  medium: 'Su üstünde ve oylamada ölülerin sohbetini okur, yazar.',
  tourist: 'Özel yeteneği yok; konuşur, oy verir.',
  squid: 'Dalışta birini boğar (kalkan deler); ısırılamaz. Tek kalırsa kazanır.',
  surfer: 'Dalışta işaretler ya da Telsiz Patlat. Tek kalırsa kazanır.',
  scavenger: 'Oylamayla ekipten çıkarılırsa oyun biter, yalnız o kazanır.',
};

const TABLE_ORDER: SkRole[] = [
  'alpha',
  'tiger',
  'hammer',
  'nurse',
  'shark',
  'lifeguard',
  'oceanographer',
  'spearman',
  'marshal',
  'medium',
  'tourist',
  'squid',
  'surfer',
  'scavenger',
];

function RoleTable() {
  return (
    <View style={styles.rtable} accessibilityLabel="Bütün roller tablosu">
      <View style={[styles.rrow, styles.rhead]}>
        <Text style={[styles.rth, styles.rcol1]}>Rol</Text>
        <Text style={[styles.rth, styles.rcol2]}>Takım</Text>
        <Text style={[styles.rth, styles.rcol3]}>Özelliği</Text>
      </View>
      {TABLE_ORDER.map((k) => {
        const r = SK_ROLES[k];
        const t = SK_TEAMS[r.team];
        return (
          <View key={k} style={styles.rrow}>
            <View style={[styles.rcol1, styles.rname]}>
              <RoleIcon role={k} size={28} />
              <Text style={[styles.rnameText, { color: r.color }]} numberOfLines={2}>
                {r.name}
              </Text>
            </View>
            <Text style={[styles.rteam, styles.rcol2, { color: t.color }]}>{t.emoji}</Text>
            <Text style={[styles.rtext, styles.rcol3]}>{SHORT[k]}</Text>
          </View>
        );
      })}
      <Text style={styles.rnote}>🦈 Köpekbalığı · 🏖️ İnsan · 🌀 Tarafsız. Ayrıntılar aşağıdaki bölümlerde.</Text>
    </View>
  );
}

function Section({ open, onToggle, icon, title, children }: {
  open: boolean;
  onToggle: () => void;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{n}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.p}>{children}</Text>
      </View>
    </View>
  );
}

function Win({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <View style={[styles.win, { borderLeftColor: color }]}>
      <Text style={[styles.stepTitle, { color }]}>{title}</Text>
      <Text style={styles.p}>{children}</Text>
    </View>
  );
}

function Roles({ list }: { list: SkRole[] }) {
  return (
    <>
      {list.map((k) => {
        const r = SK_ROLES[k];
        return (
          <View key={k} style={[styles.role, { borderColor: r.color }]}>
            <RoleIcon role={k} size={52} />
            <View style={styles.flex}>
              <Text style={[styles.roleName, { color: r.color }]}>{r.name}</Text>
              <Text style={styles.p}>{r.goal}</Text>
              {r.night ? <Text style={styles.roleNight}>{`Dalışta: ${r.night}`}</Text> : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardOpen: { borderColor: '#48CAE4' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  icon: { fontSize: 20 },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  body: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  p: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21 },
  step: { flexDirection: 'row', gap: spacing.sm },
  stepNo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 2,
    borderColor: '#FFB703',
  },
  stepNoText: { color: '#FFB703', fontFamily: fonts.black, fontSize: 13 },
  stepTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  win: { borderLeftWidth: 4, paddingLeft: spacing.sm, gap: 2 },
  role: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1 },
  roleEmoji: { fontSize: 28 },
  roleName: { fontFamily: fonts.black, fontSize: fontSizes.md },
  roleNight: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  rtable: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#48CAE4',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  rrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rhead: { backgroundColor: colors.surfaceAlt, borderTopWidth: 0 },
  rth: { color: colors.text, fontFamily: fonts.extra, fontSize: 12.5 },
  rcol1: { flex: 1.25 },
  rcol2: { width: 40, textAlign: 'center' },
  rcol3: { flex: 2 },
  rname: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remoji: { fontSize: 18 },
  rnameText: { flexShrink: 1, fontFamily: fonts.extra, fontSize: 12.5 },
  rteam: { fontSize: 16 },
  rtext: { color: colors.text, fontSize: 12.5, lineHeight: 17 },
  rnote: { color: colors.textMuted, fontSize: 11.5, padding: spacing.sm },
  table: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  thRow: { backgroundColor: colors.surfaceAlt, borderTopWidth: 0 },
  th: { flex: 1, textAlign: 'center', paddingVertical: 6, color: colors.text, fontFamily: fonts.extra, fontSize: 13 },
  td: { flex: 1, textAlign: 'center', paddingVertical: 4, color: colors.text, fontSize: 13 },
  td1: { flex: 1.4 },
});
