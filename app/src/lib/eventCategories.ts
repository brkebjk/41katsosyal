// Etkinlik kategorileri ve yaş sınırı seçenekleri. Anahtarlar veritabanındaki değerlerle aynıdır.

import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const EVENT_CATEGORY_KEYS = [
  'konser_festival',
  'oyun_gecesi',
  'araba_motor',
  'sosyal',
  'muzik',
  'spor',
  'kultur',
  'atolye',
  'yemek',
  'diger',
] as const;
export type EventCategory = (typeof EVENT_CATEGORY_KEYS)[number];

export type CategoryInfo = {
  key: EventCategory;
  title: string;
  icon: IconName;
  /** true ise simgenin yanına bir de motosiklet çizimi konur (Ionicons'ta motosiklet yok) */
  withMotorbike?: boolean;
  /** Görsel gelene kadar kutunun arka planı */
  fallback: [string, string];
};

export const EVENT_CATEGORIES: CategoryInfo[] = [
  { key: 'konser_festival', title: 'Konser & Festival', icon: 'mic', fallback: ['#B0137A', '#14080A'] },
  { key: 'oyun_gecesi', title: 'Oyun Geceleri', icon: 'game-controller', fallback: ['#4A2590', '#0B0F1A'] },
  {
    key: 'araba_motor',
    title: 'Araba / Motor Buluşması',
    icon: 'car-sport',
    withMotorbike: true,
    fallback: ['#8C2A12', '#0B0F1A'],
  },
  { key: 'sosyal', title: 'Sosyal Buluşmalar', icon: 'people', fallback: ['#0F5A6E', '#0B0F1A'] },
  { key: 'muzik', title: 'Müzik & Eğlence', icon: 'musical-notes', fallback: ['#8A1F5A', '#14080A'] },
  { key: 'spor', title: 'Spor & Doğa', icon: 'bicycle', fallback: ['#1F7A4D', '#0B0F1A'] },
  { key: 'kultur', title: 'Kültür & Sanat', icon: 'color-palette', fallback: ['#9A6500', '#1A1200'] },
  { key: 'atolye', title: 'Atölye & Eğitim', icon: 'school', fallback: ['#1F57B8', '#0B0F1A'] },
  { key: 'yemek', title: 'Yemek & Kahve', icon: 'cafe', fallback: ['#8A3A1F', '#14080A'] },
  { key: 'diger', title: 'Diğer', icon: 'sparkles', fallback: ['#454B63', '#0B0F1A'] },
];

export function categoryInfo(key: string | null | undefined): CategoryInfo {
  return EVENT_CATEGORIES.find((c) => c.key === key) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

/** Yaş sınırı seçenekleri. 0 = sınır yok (bu da açıkça seçilmelidir). */
export const AGE_OPTIONS = [
  { value: 0, label: 'Yaş sınırı yok' },
  { value: 16, label: '16+' },
  { value: 18, label: '18+' },
  { value: 21, label: '21+' },
] as const;

export function ageText(minAge: number): string {
  return minAge > 0 ? `${minAge}+ yaş` : 'Yaş sınırı yok';
}
