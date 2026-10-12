// Görsel kayıt defteri.
//
// Uygulamadaki bütün görseller buradan tek yerden yönetilir. Dosyalar
// `assets/images/` klasöründe durur. Yeni bir görsel eklemek ya da değiştirmek için
// dosyayı aynı adla klasöre koymak yeterlidir (adı değişirse buradaki `require` de değişir).

import type { ImageSourcePropType } from 'react-native';

import type { EventCategory } from '@/lib/eventCategories';

export type ImageSpec = {
  /** Ekranda yer tutucuda gösterilen kısa ad */
  label: string;
  /** Dosyanın gerçek boyutu (piksel) */
  size: string;
  /** Şeffaf arka plan (PNG) gerekiyor mu? */
  transparent: boolean;
  /** Nerede kullanılacak? */
  usage: string;
  /** assets/images/ içindeki dosya adı */
  file: string;
};

export const imageSpecs = {
  logo: {
    label: 'Logo',
    size: '490x813',
    transparent: true,
    usage: 'Giriş ekranı ve uygulama içi başlık',
    file: 'logo.png',
  },
  loginBackground: {
    label: 'Giriş arka planı',
    size: '944x1680',
    transparent: false,
    usage: 'Giriş ve kayıt ekranının tam ekran arka planı',
    file: 'giris-arka-plani.jpg',
  },
  emptyFeed: {
    label: 'Boş akış',
    size: '800x546',
    transparent: true,
    usage: 'Akışta henüz gönderi yokken gösterilen illüstrasyon',
    file: 'empty-feed.png',
  },
  subscriptionBadge: {
    label: 'Abone rozeti',
    size: '434x512',
    transparent: true,
    usage: 'Abonelerin profilinde ve gönderilerinde görünen rozet',
    file: 'abone-rozeti.png',
  },
} as const satisfies Record<string, ImageSpec>;

export type ImageKey = keyof typeof imageSpecs;

/** Görsellerin en/boy oranı (genişlik / yükseklik). Ekranda boyutu verirken işe yarar. */
export const imageAspect: Record<ImageKey, number> = {
  logo: 490 / 813,
  loginBackground: 944 / 1680,
  emptyFeed: 800 / 546,
  subscriptionBadge: 434 / 512,
};

export const images: Record<ImageKey, ImageSourcePropType | null> = {
  logo: require('../../assets/images/logo.png'),
  loginBackground: require('../../assets/images/giris-arka-plani.jpg'),
  emptyFeed: require('../../assets/images/empty-feed.png'),
  subscriptionBadge: require('../../assets/images/abone-rozeti.png'),
};

// Rastgele rumuzla birlikte atanan 12 avatar (512x512 şeffaf PNG).
// Sıra: 1 martı, 2 kaplan, 3 baykuş, 4 tilki, 5 yunus, 6 kartal,
//       7 panda, 8 ejderha, 9 kedi, 10 kurt, 11 ahtapot, 12 penguen.
// Veritabanındaki `avatar_index` değeri 1–12 arasındadır; dizide indeks = avatar_index - 1.
export const AVATAR_COUNT = 12;

export const avatarImages: (ImageSourcePropType | null)[] = [
  require('../../assets/images/avatars/avatar-01.png'),
  require('../../assets/images/avatars/avatar-02.png'),
  require('../../assets/images/avatars/avatar-03.png'),
  require('../../assets/images/avatars/avatar-04.png'),
  require('../../assets/images/avatars/avatar-05.png'),
  require('../../assets/images/avatars/avatar-06.png'),
  require('../../assets/images/avatars/avatar-07.png'),
  require('../../assets/images/avatars/avatar-08.png'),
  require('../../assets/images/avatars/avatar-09.png'),
  require('../../assets/images/avatars/avatar-10.png'),
  require('../../assets/images/avatars/avatar-11.png'),
  require('../../assets/images/avatars/avatar-12.png'),
];

// Oyun kutularının görselleri (kare, 900x900 PNG). Dosyalar `assets/images/games/` klasöründe durur.
// Bir dosya silinirse o oyunun kutusunda renkli bir yer tutucu görünür; uygulama bozulmaz.
export const GAME_KEYS = ['quiz', 'treasure_hunt', 'vampire_villager', 'taboo', 'charades', 'find_killer', 'raffle'] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export const gameTileImages: Record<GameKey, ImageSourcePropType | null> = {
  vampire_villager: require('../../assets/images/games/vampire_villager.png'),
  taboo: require('../../assets/images/games/taboo.png'),
  charades: require('../../assets/images/games/charades.png'),
  find_killer: require('../../assets/images/games/find_killer.png'),
  quiz: require('../../assets/images/games/quiz.png'),
  raffle: require('../../assets/images/games/raffle.png'),
  // Hazine Avı görseli eklenene kadar renkli yer tutucu görünür
  treasure_hunt: null,
};

// Oyunlar ekranındaki iki üst düğmenin (Katıl / Oda Oluştur) görselleri. İsteğe bağlıdır: `null` iken düğmeler kodla
// çizilen renkli degradelerle görünür. Canva'da hazırlanan düğme tasarımları (yatay, 3:1 oranında PNG/WebP)
// `assets/images/games/` klasörüne konup buraya `require(...)` ile bağlanınca düğmelerin arka planı olur;
// yazı ve simge yine kodla üstüne çizilir.
export const gameButtonImages: { join: ImageSourcePropType | null; create: ImageSourcePropType | null } = {
  join: null,
  create: null,
};

// Vampir–Köylü kart ve sahne görselleri (`assets/images/vampire/`). Kartlar 2:3 dikey, sahneler 3:2 yatay PNG'dir.
// Daha yüksek çözünürlüklü dosyaları aynı adla klasöre koymak yeterlidir.
export const VAMPIRE_IMAGE_KEYS = [
  'card_back',
  'role_villager',
  'role_vampire',
  'role_doctor',
  'role_detective',
  'scene_night',
  'scene_day',
  'win_villagers',
  'win_vampires',
] as const;
export type VampireImageKey = (typeof VAMPIRE_IMAGE_KEYS)[number];

export const vampireImages: Record<VampireImageKey, ImageSourcePropType> = {
  card_back: require('../../assets/images/vampire/card_back.png'),
  role_villager: require('../../assets/images/vampire/role_villager.png'),
  role_vampire: require('../../assets/images/vampire/role_vampire.png'),
  role_doctor: require('../../assets/images/vampire/role_doctor.png'),
  role_detective: require('../../assets/images/vampire/role_detective.png'),
  scene_night: require('../../assets/images/vampire/scene_night.png'),
  scene_day: require('../../assets/images/vampire/scene_day.png'),
  win_villagers: require('../../assets/images/vampire/win_villagers.png'),
  win_vampires: require('../../assets/images/vampire/win_vampires.png'),
};

/** Kart görselleri 2:3 (genişlik / yükseklik), sahne görselleri 3:2 */
export const VAMPIRE_CARD_ASPECT = 2 / 3;
export const VAMPIRE_SCENE_ASPECT = 3 / 2;

// Etkinlik kategorisi kutularının görselleri (yatay JPG, 1200 piksel genişlik). Kutuya kırpılarak sığdırılır.
// Bir satır `null` yapılırsa o kutuda renkli yer tutucu görünür. Değiştirmek için dosyayı
// `assets/images/events/<kategori_anahtarı>.jpg` olarak aynı adla koymak yeterlidir.
export const eventCategoryImages: Record<EventCategory, ImageSourcePropType | null> = {
  konser_festival: require('../../assets/images/events/konser_festival.jpg'),
  oyun_gecesi: require('../../assets/images/events/oyun_gecesi.jpg'),
  araba_motor: require('../../assets/images/events/araba_motor.jpg'),
  sosyal: require('../../assets/images/events/sosyal.jpg'),
  muzik: require('../../assets/images/events/muzik.jpg'),
  spor: require('../../assets/images/events/spor.jpg'),
  kultur: require('../../assets/images/events/kultur.jpg'),
  atolye: require('../../assets/images/events/atolye.jpg'),
  yemek: require('../../assets/images/events/yemek.jpg'),
  diger: require('../../assets/images/events/diger.jpg'),
};

// Bilgi Yarışması görselleri (isteğe bağlı). `null` iken ekranda kodla çizilen yedek görünüm kullanılır.
// Görsel hazır olunca dosyayı assets/images/quiz/ klasörüne koy ve satırı require(...) ile değiştir. Önerilen boyutlar:
//   chestClosed / chestOpen: 512x512 şeffaf PNG (Solo Maraton ve kaos aşamasındaki gizli sandıklar)
//   hero: 1200x600 PNG/WebP (Bilgi Yarışması ana ekranı üst kartı)
export const quizImages: Record<'chestClosed' | 'chestOpen' | 'hero', ImageSourcePropType | null> = {
  chestClosed: null,
  chestOpen: null,
  hero: null,
};

// Joker kartı görselleri (isteğe bağlı). 256x256 şeffaf PNG önerilir; `null` iken kartta simge çizilir.
// Uzaktan kartları: thief (Hırsız), roulette (Rus Ruleti), shield (Kalkan), freeze (Süre Dondurma: rakipler −3 sn),
// fifty (50/50), bomb (Bomba). Solo jokerleri: solo_freeze (+15 sn), solo_double (Çift Cevap), solo_fifty (Yarı Yarıya).
export const quizCardImages: Record<
  'thief' | 'roulette' | 'shield' | 'freeze' | 'fifty' | 'bomb' | 'solo_freeze' | 'solo_double' | 'solo_fifty',
  ImageSourcePropType | null
> = {
  thief: null,
  roulette: null,
  shield: null,
  freeze: null,
  fifty: null,
  bomb: null,
  solo_freeze: null,
  solo_double: null,
  solo_fifty: null,
};
