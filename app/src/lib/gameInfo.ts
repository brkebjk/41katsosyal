// Oyun ve puan bilgi pencerelerinin metinleri. Sayılar sunucu ayarlarından (`PointRules`) gelir; metin tek yerde durur,
// böylece Oyunlar, Sıralama ve oyun ekranlarında aynı şey anlatılır.

import type Ionicons from '@expo/vector-icons/Ionicons';

import { identityEnabledNow } from '@/lib/identityFlag';
import { LEVEL_QUIZ_MULT } from '@/lib/levelPerks';
import { placePoints, quizPts, topPoints, quizRuleSummary, type PointRules } from '@/lib/ranking';

export type InfoItem = {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Kalın yazılan kısa başlık (satırın başında) */
  lead?: string;
  text: string;
};

export type InfoContent = { title: string; icon: InfoItem['icon']; items: InfoItem[]; note?: string };

export type PointsTableData = {
  /** Tablonun hesaplandığı oyuncu sayısı */
  size: number;
  /** Odadaki gerçek kişi sayısı (verilmediyse örnek tablo) */
  actual: number | null;
  /** Puan için gereken en az oyuncu sayısı */
  minPlayers: number;
  rows: { place: number; points: number }[];
  /** Oyuncu sayısına göre 1. sıranın puanı (“kalabalık oyun, çok puan”) */
  ladder: { players: number; first: number; plus: boolean }[];
  /** Yan yana oyunun puan çarpanı (tablodaki puanlar uzaktan oyunun puanıdır) */
  sideMult: number;
};

/**
 * Puan kazanç tablosu: bu oyuncu sayısında hangi sıra kaç puan alır, bir de oyuncu sayısı arttıkça 1. sıranın puanı.
 * Odadaki kişi, puan için gereken en azdan azsa tablo en az sayıdaki oyuncuya göre gösterilir (`actual` yine gerçek sayıdır).
 */
export function pointsTable(rules: PointRules, players?: number, minPlayers?: number): PointsTableData {
  const min = Math.max(2, minPlayers ?? rules.gameMinPlayers);
  const cap = Math.max(min, rules.gameTopCap);
  const size = players === undefined ? 8 : Math.max(min, Math.min(players, 100));
  const rows = Array.from({ length: size }, (_, i) => ({
    place: i + 1,
    points: placePoints(size, i + 1, cap),
  }));
  // Kalabalık çarpanı: 1. sıranın puanı üst sınıra ulaşana kadar birkaç basamak gösterilir
  let capAt = min;
  while (capAt < 100 && topPoints(capAt, cap) < cap) capAt += 1;
  const sizes = Array.from(new Set([min, 5, 6, 8, 10, 12])).filter((n) => n >= min && n < capAt);
  sizes.push(capAt);
  const ladder = sizes.map((n) => ({ players: n, first: topPoints(n, cap), plus: n === capAt }));
  return { size, actual: players ?? null, minPlayers: min, rows, ladder, sideMult: Math.max(1, rules.sideMult) };
}

/**
 * “Oyun puanı nasıl hesaplanır?” `players` verilirse (oyunun bekleme odasında) tablo o oyuncu sayısıyla gösterilir.
 * `extra` oyuna özel ek satırlar içindir (ör. Vampir–Köylü’de takım sırası).
 */
export function gamePointsInfo(
  rules: PointRules,
  players?: number,
  extra: InfoItem[] = [],
  minPlayers?: number,
): InfoContent {
  const inGame = players !== undefined;
  const items: InfoItem[] = [];
  // Bekleme odasında “kalabalık oyun, çok puan” zaten tablodaki basamaklarla görünür; ekran kalabalık olmasın diye yazılmaz
  if (!inGame) {
    items.push({
      icon: 'people',
      lead: 'Kalabalık oyun, çok puan.',
      text: `Oyunda ne kadar çok kişi varsa kazanılacak puan o kadar artar (en çok ${rules.gameTopCap}).`,
    });
  }
  items.push(
    {
      icon: 'podium',
      lead: 'Bitirdiğin sıra belirler.',
      text: '1. olan en yüksek puanı alır, her sıra aşağıda biraz azalır, sonuncu 1 puan alır. Aynı sırada bitirenler puanı paylaşır.',
    },
    ...extra,
    {
      icon: 'people-circle',
      lead: `Yan yana ×${rules.sideMult}.`,
      text: `Aynı masada (konum doğrulanarak) oynanan oyun, uzaktan oyunun ${rules.sideMult} katı puan verir. Mekân kodu ile mekânda oynarsan +%${Math.max(0, rules.venueBonusPct - 100)}.`,
    },
    {
      icon: 'flag',
      lead: 'Aylık hedef.',
      text: `Her oyundan ayda uzaktan en çok ${fmtNum(rules.remoteMonthPoints)}, yan yana en çok ${fmtNum(rules.sideMonthPoints)} puan kazanılır. Oyun sayısı sınırsız; hedefe ulaşınca o ay o oyundan puan yazılmaz. Puan için oyun en az ${minPlayers ?? rules.gameMinPlayers} kişiyle oynanmalı.`,
    },
  );
  // Oyunun içindeyken (bekleme odası) ekran kalabalık olmasın diye Bilgi Yarışması satırı konmaz
  if (!inGame) {
    items.push({
      icon: 'help-circle',
      lead: 'Bilgi Yarışması.',
      text: quizRuleSummary(rules),
    });
  }
  return {
    title: inGame ? 'Puan kazanç tablosu' : 'Oyun puanı nasıl hesaplanır?',
    icon: 'trophy',
    items,
    note: 'Çekiliş puan getirmez.',
  };
}

/** Vampir–Köylü’ye özel: takım ve oyunda kalma sırası. */
export const VAMPIRE_RANK_ITEM: InfoItem = {
  icon: 'moon',
  lead: 'Vampir–Köylü’de sıra.',
  text: 'Kazanan takım üstte yer alır. Takımın içinde oyunda en uzun süre kalan öne geçer; aynı turda elenenler eşit sayılır.',
};

export const SHARK_RANK_ITEM: InfoItem = {
  icon: 'water',
  lead: 'Köpekbalığı Kafesi’nde sıra.',
  text: 'Kazanan takım (ya da tek başına kazanan tarafsız) üstte yer alır. Diğerleri oyunda ne kadar uzun kaldıysa o kadar önde; aynı anda elenenler eşit sayılır. Anlatıcılı oyunda puan yoktur.',
};

/** Bilgi Yarışması hakkında kısa bilgi (oyun kutusuna dokununca). */
export function quizInfo(rules: PointRules, enabled: boolean): InfoContent {
  return {
    title: 'Bilgi Yarışması',
    icon: 'help-circle',
    items: [
      {
        icon: 'heart',
        lead: `${rules.quizMaxLives} can.`,
        text: `Her oyun 1 can harcar; her ${rules.quizLifeMinutes} dakikada 1 can dolar. Oyun sayısında sınır yok. Seviye 5'te can sınırsızdır.`,
      },
      {
        icon: 'person',
        lead: 'Solo Maraton.',
        text: '3 sandıktan birini seç; şanslıysan joker çıkar (Süre Dondur, Çift Cevap, Yarı Yarıya), joker nadirdir. 12 soru kolaydan zora gider, süre her soruda kısalır. İlk yanlışta maraton biter.',
      },
      {
        icon: 'podium',
        lead: 'Maraton puanı.',
        text: `5 doğru +${quizPts(rules.quizSolo5)}, 8 doğru +${quizPts(rules.quizSolo8)}, 12 doğru +${quizPts(rules.quizSolo12)} puan. Solo / Hafta sıralamasında haftanın bütün doğruları toplanır (yalnızca en az 5 doğrulu koşular); ilk 3 sonraki hafta 10 canla oynar.`,
      },
      {
        icon: 'people',
        lead: 'Uzaktan (2–5 kişi).',
        text: 'Rastgele eşleş (bekleme odasında “Hazırım” de) ya da arkadaşlarınla kodlu özel oda kur. 5 raunt: kategori oylaması, 2 soru, kaos. Doğru = 100 + kalan her saniye × 10; yanlış puan düşürmez. Herkes yalnızca rumuzuyla görünür.',
      },
      {
        icon: 'flame',
        lead: 'Kaos ve kartlar.',
        text: 'Doğru ve hızlı cevaplar Kaos Barını doldurur; dolunca kaosta 4 gizli sandıktan birini açarsın: Hırsız, Rus Ruleti, Kalkan, Süre Dondurma, 50/50… ya da boş.',
      },
      {
        icon: 'trophy',
        lead: 'Kazanana puan.',
        text: `Yalnızca kazanan alır: 2 kişide +${quizPts(rules.quizWinBase * 1.25)}, 3 kişide +${quizPts(rules.quizWinBase * 1.5)}, 4 kişide +${quizPts(rules.quizWinBase * 1.75)}, 5 kişide +${quizPts(rules.quizWinBase * 2)}. Zirvede eşitlik olursa ani ölüm sorusu: en hızlı doğru kazanır.`,
      },
      {
        icon: 'phone-portrait',
        lead: 'Yan Yana.',
        text: 'Tek telefonda 2 kişi: ekran ikiye bölünür, üst yarı karşıdaki oyuncu için ters döner. 3 raunt × 3 soru (toplam 9 soru), her biri 15 sn. Can harcamaz, puan vermez; günde 10 oyun.',
      },
      {
        icon: 'globe',
        lead: 'Çoklu / Ay sıralaması.',
        text: 'Uzaktan maçlardan ay boyunca kazanılan puana göre. Ayın ilk 3’üne 1 aylık abonelik hediye (moderatör onayıyla).',
      },
      ...(identityEnabledNow()
        ? [
            {
              icon: 'shield-checkmark-outline' as const,
              lead: 'Ödüller yalnızca doğrulanmış hesaba.',
              text: 'Hesabını doğrulamayan üyeler Solo / Hafta ve Çoklu / Ay sıralamalarında yer alır ama ödül (can, abonelik) alamaz; ödül sıradaki doğrulanmış üyeye geçer. Hesabını Profil sekmesinden doğrulayabilirsin.',
            },
          ]
        : []),
      {
        icon: 'shield-checkmark',
        lead: 'Puan sınırı.',
        text: `Bilgi Yarışması'nın aylık puan hedefi ${fmtNum(rules.quizMonthPoints)} puan; hedefe ulaşınca o ay puan yazılmaz. Yanlış cevap puan düşürmez. Seviye 4'te kazandığın puan ve hedef ${String(LEVEL_QUIZ_MULT).replace('.', ',')} katına çıkar.`,
      },
      {
        icon: 'exit',
        lead: 'Kaçmak yok.',
        text: 'Uzaktan maç başladıktan sonra çıkan ya da uygulamadan uzun süre ayrılan kaybeder. Maratondan çıkarsan o ana kadar ulaştığın basamağın puanı yazılır.',
      },
      {
        icon: 'ticket',
        lead: 'Petek sıralaması.',
        text: 'Bilgi Yarışması puanı petek sıralamasına sayılmaz.',
      },
    ],
    note: enabled ? undefined : 'Sorular hazırlanıyor, çok yakında burada olacak.',
  };
}

/** “Odaya katıl” kutusunun altındaki oda kuralları. */
export function roomRulesInfo(rules: PointRules): InfoContent {
  return {
    title: 'Oda kuralları',
    icon: 'key',
    items: [
      {
        icon: 'key-outline',
        lead: 'Kod.',
        text: 'Odayı açan kişi kodu yanında oturanlara söyler. Kod listede görünmez; listeden “Katıl”a basınca da sorulur.',
      },
      {
        icon: 'location',
        lead: 'Konum.',
        text: 'Yan yana oynanan oyunlara girerken konumuna bir kez bakılır: oda sahibine yaklaşık 100 metre (konum hatası dahil en çok 150 m) yakın olmalısın; konum izni vermeden girilemez. Sürekli takip yok. Odaya girenin kesin konumu kaydedilmez; oda sahibinin konumu yalnızca oda katılıma açıkken tutulur, sonra silinir.',
      },
      {
        icon: 'map',
        lead: 'Bölge.',
        text: 'Oda açarken haritadan bir bölge (petek) seçip adres tarifi yazarsın. Odaya yalnızca o bölgede ya da hemen yanındaki bölgelerde bulunanlar girebilir.',
      },
      {
        icon: 'game-controller',
        lead: 'Sınırsız oyun.',
        text: `Oyun hakkı yok, herkes istediği kadar oda açar ve oynar. Her oyunun aylık puan hedefi var: uzaktan ${fmtNum(rules.remoteMonthPoints)}, yan yana ${fmtNum(rules.sideMonthPoints)} puan.`,
      },
      {
        icon: 'exit',
        lead: 'Tek oyun.',
        text: 'Aynı anda tek oyunun içinde olabilirsin. Oyundayken menüye dönersen oyundan çıkarılırsın.',
      },
    ],
  };
}

/** Oyunun kısa “Nasıl oynanır?” rehberi (Açık odalar ekranında). */
export const HOW_TO_PLAY: Record<string, InfoItem[]> = {
  shark_cage: [
    {
      icon: 'water',
      lead: 'Dalış ve plaj.',
      text: 'Çarktan gizli bir rol gelir. Dalışta (gece) köpekbalıkları avlanır, özel roller yeteneğini kullanır; plajda (gündüz) konuşulur, sonra şüpheli oylamayla kafese atılır. 6–16 kişi.',
    },
    {
      icon: 'eye',
      lead: 'Açık oy.',
      text: 'Her avatarın büyük bir koltuk numarası var. Altındaki tabela kime oy verdiğini gösterir (ok o kişiye döner), kırmızı sayı aldığı oyu gösterir. Ayrıntılar oyunun içindeki Rehber’de.',
    },
    {
      icon: 'trophy',
      lead: 'Kazanmak.',
      text: 'İnsanlar köpekbalıklarını ve tarafsız katilleri, köpekbalıkları sayıca eşitliği arar; tarafsızların kendi gizli hedefleri var.',
    },
  ],
  vampire_villager: [
    {
      icon: 'people',
      lead: 'Roller.',
      text: 'Herkes gizli bir rol alır: vampir, doktor, dedektif ya da köylü. Rolünü yalnızca sen görürsün.',
    },
    {
      icon: 'moon',
      lead: 'Gece.',
      text: 'Vampirler birini ısırır, doktor birini korur, dedektif birine bakıp vampir olup olmadığını öğrenir.',
    },
    {
      icon: 'sunny',
      lead: 'Gündüz.',
      text: 'Sabah kimin öldüğü açıklanır. Masada konuşursunuz, sonra herkes oy verip bir kişiyi köyden çıkarır.',
    },
    {
      icon: 'headset',
      lead: 'Uzaktan oyna.',
      text: 'Uzaktan Eşleş ile herkes kendi telefonundan oynar. Sabah tartışmasında bas-konuş ses mesajlarıyla konuşulur (her tartışmada 10 sn). Yan yana oyun 7 kat puan verir.',
    },
    {
      icon: 'trophy',
      lead: 'Kazanmak.',
      text: 'Bütün vampirler elenirse köylüler, vampirler köylülere eşit olursa vampirler kazanır.',
    },
  ],
  taboo: [
    {
      icon: 'people',
      lead: 'Takımlar.',
      text: 'Masadakiler iki takıma ayrılır. Sırası gelen anlatıcı telefonunda kartı görür.',
    },
    {
      icon: 'chatbubble-ellipses',
      lead: 'Anlat.',
      text: 'Kartın üstündeki kelimeyi, altındaki yasaklı kelimeleri söylemeden takımına anlatırsın.',
    },
    {
      icon: 'close-circle',
      lead: 'Yasak.',
      text: 'Yasaklı kelimeyi söylersen ya da el kol hareketi yaparsan kart geçersiz olur.',
    },
    { icon: 'trophy', lead: 'Kazanmak.', text: 'Süre içinde en çok kelimeyi bildiren takım kazanır.' },
  ],
  charades: [
    {
      icon: 'people',
      lead: 'Takımlar.',
      text: 'Masadakiler iki takıma ayrılır. Sırası gelen anlatıcı telefonunda film ya da kelimeyi görür.',
    },
    {
      icon: 'film',
      lead: 'Anlat.',
      text: 'Konuşmadan, yalnızca hareketlerle anlatırsın; ses çıkarmak ve harf göstermek yasaktır.',
    },
    { icon: 'timer', lead: 'Süre.', text: 'Her anlatım için süre sınırlıdır; takımın bilirse puan alırsınız.' },
    { icon: 'trophy', lead: 'Kazanmak.', text: 'Turlar bitince en çok bilen takım kazanır.' },
  ],
  find_killer: [
    {
      icon: 'people',
      lead: 'Roller.',
      text: 'Biriniz gizlice katil olur, diğerleri dedektiftir. Rolünü yalnızca sen görürsün.',
    },
    { icon: 'search', lead: 'İpuçları.', text: 'Her turda ipuçları açılır; masada konuşup şüphelileri tartışırsınız.' },
    { icon: 'hand-left', lead: 'Oylama.', text: 'Tur sonunda herkes katil olduğunu düşündüğü kişiye oy verir.' },
    {
      icon: 'trophy',
      lead: 'Kazanmak.',
      text: 'Katil yakalanırsa dedektifler, yakalanmadan sona kalırsa katil kazanır.',
    },
  ],
  quiz: [
    {
      icon: 'heart',
      lead: 'Canlar.',
      text: 'En çok 5 can; her oyun 1 can harcar, her 30 dakikada 1 can dolar. Oyun sayısı sınırsız.',
    },
    {
      icon: 'person',
      lead: 'Solo Maraton.',
      text: 'Sandık seç, şanslıysan joker çıkar. 12 soru kolaydan zora; süre her soruda kısalır. İlk yanlışta biter. 5 / 8 / 12 doğru basamakları puan getirir.',
    },
    {
      icon: 'people',
      lead: 'Uzaktan.',
      text: '2–5 kişi: rastgele eşleş ya da kodlu oda kur. Bekleme odasında yeterince kişi “Hazırım” deyince (3 kişide 2) başlar; 5 kişi olunca hemen. 5 raunt; her rauntta kategori oylaması, 2 soru (10 sn) ve kaos. Doğru = 100 + kalan saniye × 10.',
    },
    {
      icon: 'phone-portrait',
      lead: 'Yan Yana.',
      text: 'Tek telefonda 2 kişi karşılıklı oynar; ekran ikiye bölünür. Puan vermez, can harcamaz.',
    },
    {
      icon: 'flame',
      lead: 'Kaos.',
      text: 'Kaos Barı dolunca gizli sandık aç; çıkan jokerleri soru sırasında kullan.',
    },
    {
      icon: 'exit',
      lead: 'Çıkmak.',
      text: 'Uzaktan maç başladıktan sonra çıkan ya da uygulamadan 25 saniyeden uzun ayrılan kaybeder. Maratondan çıkarsan ulaştığın basamağın puanı yazılır.',
    },
  ],
  treasure_hunt: [
    {
      icon: 'map',
      lead: 'Hazineler.',
      text: 'Moderatörler şehrin peteklerine 3 kelimelik kodlar gizler. Haritada büyüteçli petekler hazinedir.',
    },
    { icon: 'bulb', lead: 'İpucu.', text: 'Peteğe dokun, ipucunu oku ve kâğıda yazılmış kodu o bölgede ara.' },
    {
      icon: 'key',
      lead: 'Kod.',
      text: 'Kodu bulunca Hazine Avı ekranına yaz; peteğe en çok 1 petek yakın olmalısın. Kodu ilk giren puanı alır.',
    },
    {
      icon: 'trophy',
      lead: 'Puan.',
      text: 'Kolay, orta, zor ve imkânsız hazinelerin puanı farklıdır; ayda en çok 3 hazine bulabilirsin.',
    },
  ],
  raffle: [
    { icon: 'gift', lead: 'Çekiliş.', text: 'Etkinlikte moderatör açar; kodla katılan herkes çekilişe girer.' },
    { icon: 'trophy', lead: 'Kazanan.', text: 'Kazanan rastgele seçilir ve ekranda gösterilir.' },
  ],
};

/** Oyunun başlaması için gereken en az kişi (sunucu ayarı gelene kadar varsayılan). */
export const DEFAULT_MIN_PLAYERS: Record<string, number> = {
  shark_cage: 6,
  vampire_villager: 5,
  find_killer: 5,
  quiz: 1,
  taboo: 4,
  charades: 4,
  raffle: 1,
  treasure_hunt: 1,
};

/** Mekân kodu düğmesine dokununca açılan açıklama. */
export function venueInfo(rules: PointRules): InfoContent {
  const bonus = Math.max(0, rules.venueBonusPct - 100);
  return {
    title: 'Mekân bonusu',
    icon: 'storefront',
    items: [
      {
        icon: 'storefront',
        lead: `Mekânda oyna, +%${bonus} puan.`,
        text: `Anlaşmalı bir mekândan aldığın kodu gir, sonra o mekânda (mekânın peteğinde ya da hemen yanında) yan yana oda aç. O oyunda herkesin puanı %${bonus} artar.`,
      },
      {
        icon: 'time',
        lead: `${rules.sponsorCreditHours} saat geçerli.`,
        text: `Kod girildikten sonra ${rules.sponsorCreditHours} saat içinde o mekânda açtığın ilk yan yana odada kullanılır. Kullanılmamış kodun varken yeni kod girilemez.`,
      },
      {
        icon: 'shield-checkmark',
        lead: 'Aylık hedef aynı kalır.',
        text: `Bonus, oyunun aylık puan hedefini (yan yana ${fmtNum(rules.sideMonthPoints)}) aşmaz; hedefe daha çabuk ulaşırsın.`,
      },
      {
        icon: 'game-controller',
        lead: 'Oyun hakkı yok.',
        text: 'Herkes istediği kadar oyun oynar; kod yalnızca mekân bonusu verir.',
      },
    ],
  };
}

const fmtNum = (n: number) => Math.round(n).toLocaleString('tr-TR');
