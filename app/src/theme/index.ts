import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

// PeopleHere tasarım ayarları: renkler, boşluklar, köşe yuvarlaklıkları.
// Uygulamanın görünümünü değiştirmek istediğimizde sadece bu dosyaya dokunmamız yeterli.

// Tema: Açık (varsayılan), Koyu ya da Sistem (telefonun ayarına uyar). Seçim telefonda saklanır ve uygulama
// AÇILIRKEN, ekranlar çizilmeden önce okunur (renkler ekranların stillerine açılışta yazıldığı için tema değişikliği
// uygulama yeniden açılınca uygulanır). Harita katman renkleri iki temada da aynıdır (harita okunurluğu).
export type ThemePref = 'dark' | 'light' | 'system';
const THEME_KEY = 'peoplehere_theme';

function readThemePref(): ThemePref {
  try {
    const v = SecureStore.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

/** Kayıtlı tema tercihi (uygulama açılırken okunan) */
export const themePref: ThemePref = readThemePref();

/** Bu açılışta açık tema mı kullanılıyor? */
export const isLight =
  themePref === 'light' || (themePref === 'system' && Appearance.getColorScheme() === 'light');

/** Bu telefonda tema tercihi hiç seçildi mi? (ilk girişte bir kez sorulur) */
export function hasThemePref(): boolean {
  try {
    return SecureStore.getItem(THEME_KEY) !== null;
  } catch {
    return true; // depo okunamıyorsa sorma
  }
}

/** Bu tercihle uygulama açık temayla mı açılır? */
export function prefIsLight(pref: ThemePref): boolean {
  return pref === 'light' || (pref === 'system' && Appearance.getColorScheme() === 'light');
}

/** Tema tercihini kaydeder; uygulama yeniden açılınca uygulanır. */
export function saveThemePref(pref: ThemePref): boolean {
  try {
    SecureStore.setItem(THEME_KEY, pref);
    return true;
  } catch {
    return false;
  }
}

const darkColors = {
  bg: '#071622', // en koyu arka plan (Körfez Gecesi: gece denizi laciverti)
  surface: '#0F2333', // kartlar
  surfaceAlt: '#163247', // kartların içindeki ikinci katman
  border: '#22445E',
  text: '#F2FAFF',
  textMuted: '#92B3C7',
  primary: '#22D3C5', // turkuaz: ana vurgu rengi (butonlar, seçili sekme)
  primaryText: '#04211F', // turkuaz butonların üstündeki koyu yazı
  accent: '#7C8CFF', // lavanta: ikinci vurgu
  danger: '#FF5470',
  alert: '#FF3B3B', // net kırmızı: uyarı yazıları ve bildirim noktaları (gerçek ad uyarısı, kırmızı nokta)
  success: '#34D399',
  highlight: '#FFC83D', // sarı: dikkat çekmesi gereken önemli yazılar ve simgeler (puan, göstergeler, kurallar)
  // İçeriğin üstünde yüzen yarı saydam yüzeyler (yazı kutusu düğmeleri, harita üstü kartlar)
  overlay: 'rgba(15, 35, 51, 0.92)',
  // Harita katman renkleri: harita okunurluğu için palet değişiminde bilerek aynı bırakıldı
  event: '#35D6C3', // turkuaz: haritada etkinlik olan bölgeler
  game: '#A98BFF', // açık mor: haritada açık oyun odası olan bölgeler
  venue: '#FF9F6B', // mercan: sponsor (mekân) hesapları, mekân etkinlikleri ve mekân kartları
};

const lightColors: typeof darkColors = {
  bg: '#EEF3F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E3ECF2',
  border: '#C6D6E2',
  text: '#0B1F2E',
  textMuted: '#4D6779',
  primary: '#0E9F93', // beyaz zeminde okunsun diye biraz koyu turkuaz
  primaryText: '#04211F',
  accent: '#5A67E8',
  danger: '#D9304F',
  alert: '#E02424',
  success: '#12996A',
  highlight: '#A66300', // açık zeminde sarı okunmaz: koyu kehribar
  overlay: 'rgba(255, 255, 255, 0.94)',
  event: '#35D6C3',
  game: '#A98BFF',
  venue: '#FF9F6B',
};

// Özel gün teması (yönetim panelinden): ana renk, ikinci vurgu ve dikkat rengi geçici olarak değişir. Sunucudan gelen tema
// telefonda saklanır ve bir sonraki açılışta, ekranlar çizilmeden önce uygulanır. Tarih aralığı dışındaysa uygulanmaz.
const LOOK_THEME_KEY = 'peoplehere_look_theme';
const HEX = /^#[0-9A-Fa-f]{6}$/;

type LookTheme = { primary?: string; accent?: string; highlight?: string; from?: string; to?: string };

function readLookTheme(): LookTheme | null {
  try {
    const v = SecureStore.getItem(LOOK_THEME_KEY);
    if (!v) return null;
    const t = JSON.parse(v) as LookTheme;
    const now = Date.now();
    if (t.from && Number.isFinite(Date.parse(t.from)) && now < Date.parse(t.from)) return null;
    if (t.to && Number.isFinite(Date.parse(t.to)) && now > Date.parse(t.to)) return null;
    return t;
  } catch {
    return null;
  }
}

/** Sunucudan gelen özel gün temasını saklar (bir sonraki açılışta uygulanır). Boş = tema kapalı. */
export function saveLookTheme(raw: Record<string, unknown>): void {
  const t: LookTheme = {};
  for (const k of ['primary', 'accent', 'highlight'] as const) {
    const v = raw[k];
    if (typeof v === 'string' && HEX.test(v)) t[k] = v;
  }
  if (typeof raw.from === 'string') t.from = raw.from;
  if (typeof raw.to === 'string') t.to = raw.to;
  try {
    if (!t.primary && !t.accent && !t.highlight) SecureStore.deleteItemAsync(LOOK_THEME_KEY).catch(() => {});
    else SecureStore.setItem(LOOK_THEME_KEY, JSON.stringify(t));
  } catch {
    // saklanamazsa tema uygulanmaz
  }
}

/** Ana rengin üstündeki yazı: açık renk zeminde koyu, koyu zeminde beyaz */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#04211F' : '#FFFFFF';
}

function withLook(base: typeof darkColors): typeof darkColors {
  const t = readLookTheme();
  if (!t) return base;
  return {
    ...base,
    ...(t.primary ? { primary: t.primary, primaryText: textOn(t.primary) } : null),
    ...(t.accent ? { accent: t.accent } : null),
    ...(t.highlight ? { highlight: t.highlight } : null),
  };
}

export const colors: typeof darkColors = withLook(isLight ? lightColors : darkColors);

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

// Yazı boyutları (genel küçültme: yazılar gereğinden büyük ve kalın görünüyordu)
export const fontSizes = { xs: 11, sm: 13, md: 15, lg: 18, xl: 24, xxl: 30 } as const;

// Marka yazı tipi (Montserrat). Dosyalar uygulama açılırken yüklenir (bkz. src/app/_layout.tsx).
// Yüklenemezse telefonun kendi yazı tipi kullanılır, uygulama yine çalışır.
export const fonts = {
  semi: 'Montserrat_600SemiBold',
  extra: 'Montserrat_800ExtraBold',
  black: 'Montserrat_900Black',
} as const;

export const brand = {
  name: 'PeopleHere',
  slogan: 'Şehrindeki insanlarla tanış, buluş, eğlen',
} as const;
