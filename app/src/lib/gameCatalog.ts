// Oyunların ekranda görünen adı, kısa açıklaması ve simgesi. Oyunlar ekranı, “Açık odalar” ekranı ve harita aynı
// listeyi kullanır; bir oyunun adı ya da açıklaması değişecekse yalnızca burası değişir.

import type Ionicons from '@expo/vector-icons/Ionicons';

import type { GameKey } from '@/lib/images';

export type GameInfo = {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Görsel gelene kadar kutunun arka planı */
  fallback: [string, string];
};

export const GAMES: Record<GameKey, GameInfo> = {
  vampire_villager: {
    title: 'Vampir–Köylü',
    description: 'Gizli roller, gece ve gündüz',
    icon: 'moon',
    fallback: ['#4A2590', '#0B0F1A'],
  },
  taboo: {
    title: 'Tabu',
    description: 'Yasaklı kelimelerle anlat',
    icon: 'chatbubble-ellipses',
    fallback: ['#8A3A1F', '#14080A'],
  },
  charades: {
    title: 'Sessiz Sinema',
    description: 'Konuşmadan anlat',
    icon: 'film',
    fallback: ['#0F5A6E', '#0B0F1A'],
  },
  find_killer: {
    title: 'Katili Bul',
    description: 'İpuçlarıyla gizemi çöz',
    icon: 'search',
    fallback: ['#454B63', '#0B0F1A'],
  },
  quiz: {
    title: 'Bilgi Yarışması',
    description: 'Solo ya da 2–5 kişi uzaktan (HAK YEMEZ)',
    icon: 'help-circle',
    fallback: ['#1F57B8', '#0B0F1A'],
  },
  treasure_hunt: {
    title: 'Hazine Avı',
    description: 'Şehirde gizli kodları bul',
    icon: 'search-circle',
    fallback: ['#1F7A4D', '#0B0F1A'],
  },
  raffle: {
    title: 'Çekiliş',
    description: 'Etkinlikte moderatör yapar',
    icon: 'gift',
    fallback: ['#9A6500', '#1A1200'],
  },
};

/** Oyun anahtarından görünen ad (bilinmeyen oyunda anahtarın kendisi). */
export function gameTitle(key: string): string {
  return (GAMES as Record<string, GameInfo | undefined>)[key]?.title ?? key;
}

/** Anahtar bilinen bir oyun mu? */
export function isGameKey(key: string | undefined): key is GameKey {
  return key !== undefined && key in GAMES;
}
