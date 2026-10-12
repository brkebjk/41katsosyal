// 41. Kat Sosyal tasarım ayarları: renkler, boşluklar, köşe yuvarlaklıkları.
// Uygulamanın görünümünü değiştirmek istediğimizde sadece bu dosyaya dokunmamız yeterli.

export const colors = {
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
  // Harita katman renkleri: harita okunurluğu için palet değişiminde bilerek aynı bırakıldı
  event: '#35D6C3', // turkuaz: haritada etkinlik olan bölgeler
  game: '#A98BFF', // açık mor: haritada açık oyun odası olan bölgeler
  venue: '#FF9F6B', // mercan: sponsor (mekân) hesapları, mekân etkinlikleri ve mekân kartları
} as const;

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
  name: '41. Kat Sosyal',
  slogan: 'Dünyadan bir kat yukarıda buluşuyoruz',
} as const;
