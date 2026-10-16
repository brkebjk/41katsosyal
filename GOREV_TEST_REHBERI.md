# Görev Test Rehberi – Bekleyen üye, ziyaret görünümleri

## A. Supabase
SQL kendiliğinden uygulanır (GitHub > Actions > **Supabase şemasını uygula**, yaklaşık 3 dakika). Elle bir şey çalıştırma.
Kırmızı görürsen bana söyle. Şifreyi ya da bağlantı adresini sohbete yapıştırma.

## B. Ziyaret görünümleri
1. Haritada üstteki şehir düğmesinden ya da ⟳ (Şehrim) ekranından başka bir şehri ziyaret et.
2. Harita her seferinde o şehrin açılış görünümüyle gelir:
   - İstanbul: Marmara'dan Karadeniz'e bütün Boğaz hattı,
   - İzmir: Karşıyaka ve altındaki ilçeler,
   - Kocaeli: Derince ve körfez.
3. Kendi şehrine dönünce harita bulunduğun peteğe gider.

## C. Bekleyen üye (haritalarımızın dışından giren üye)
Denemek için yeni bir hesapla İstanbul, Kocaeli ve İzmir dışındayken gir.
1. Şehir seçimi yerine **Üzgünüz** ekranı açılır: "Bulunduğun şehir henüz haritalarımızda yok. Yakında senin şehrindeyiz!"
2. Şehirlerden birini seç, **… haritasını ziyaret et**. Yalnızca haritaya ziyaretçi olarak bakılır.
3. Sekme çubuğunda yalnızca **Harita** ve **Profil** görünür. Profilin üstünde "Bekleyen üyesin" yazar.
4. Bekleyen üye oyun oynayamaz, etkinliğe giremez, akışa yazamaz, mesaj ve arkadaşlık isteği gönderemez, puan alamaz.
5. Uygulama her açılışta konuma yeniden bakar. Üç şehrimizden birindeyse normal şehir seçimi açılır, üyelik orada başlar.
6. Kıyıda, vapurda ya da il sınırının 2-3 km dışında olan da o şehirde sayılır.

## D. Moderatör paneli (web)
1. **Üyeler** > **Bekleyen üyeler** sekmesi: yalnızca bekleyen üyeler listelenir. Listede "bekleyen üye" yazar.
2. Üyenin ayrıntısında, Şehir satırında ne zaman girdiği görünür.
3. **Hemen taşı** ile bir şehre taşırsan normal üye olur.
