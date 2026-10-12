// Gerçek adın göründüğü yerlerde gösterilen kırmızı uyarı metinleri. Hepsi tek yerde: metin değişince her yerde değişir.

export const REAL_NAME = {
  /** Kayıt ekranı */
  signup:
    'Puan sıralamasında, açtığın etkinliklerde, etkinlik yorumlarında, mekân yorumlarında ve katıldığın oyun odalarında adın rumuzla değil, kayıtta yazdığın gerçek adınla görünür. Akıştaki gönderi ve yorumlarında ise rumuz kullanılır.',
  /** Sıralama ekranı */
  leaderboard: 'Sıralamada adın ve puanın gerçek adınla tüm üyelere görünür. Rumuzun görünmez.',
  /** Etkinlik açarken */
  eventHost: 'Etkinliği açan kişi olarak gerçek adın tüm üyelere görünür.',
  /** Etkinlik yorumu yazarken */
  eventComment:
    'Etkinlik yorumlarında rumuz yoktur: yorumun gerçek adınla, herkesin göreceği şekilde yayınlanır.',
  /** Oyun odası açarken */
  roomHost: 'Oda sahibi olarak gerçek adın açık odalar listesinde ve oyuncu listesinde tüm üyelere görünür.',
  /** Odaya katılırken */
  roomJoin: 'Odaya girince gerçek adın oyuncu listesinde odadaki herkese görünür.',
  /** Arkadaşlık isteği gönderirken / kabul ederken */
  friend:
    'Arkadaş olursanız gerçek adın karşı tarafa görünür. Akıştaki tüm gönderi ve yorumlarında (eskiler dahil) onun ekranında rumuzun yerine gerçek adın çıkar.',
  /** Mekâna puan/yorum yazarken */
  venueReview:
    'Mekân puanın ve yorumun rumuzla değil, gerçek adınla tüm üyelere görünür. Yorumunu istediğin zaman silebilirsin.',
  /** Profilde adı düzenlerken */
  profileName:
    'Bu ad sıralamada, açtığın etkinliklerde, etkinlik yorumlarında, oyun odalarında ve arkadaşlarına görünür.',
} as const;
