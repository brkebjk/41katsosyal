# Görev Test Rehberi – Paket: Görseller ve Arayüz 2

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas (akış süzgeci için gerekli).
> Sonra bilgisayarında `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile uygulamayı aç.
> Not: Uygulama simgesi ve açılış ekranı Expo Go'da görünmez; mağaza sürümünde görünür.

## 1. Görseller
1. Etkinlikler sekmesini aç. 10 kategori kutusunun hepsinde yeni fotoğraflar görünmeli.
2. Akış sekmesinin üstünde ve giriş ekranında yeni "41" logosu görünmeli (arka planı şeffaf olmalı).
3. Profil > "Hesabı Yükselt" kutusunda ve Abonelik ekranında yeni yıldızlı rozet görünmeli.

## 2. Profil
1. En alttaki **Çıkış yap** düğmesi kırmızı dolu ve beyaz yazılı olmalı.
2. Gerçek adın, puanın ve başarım sayısı (yalnızca sayı) **sarı** olmalı. "Hesabım" başlığı da sarı olmalı.
3. **Başarımlar** artık büyük, renkli bir kutu olmalı (kupa simgesi, ilerleme çubuğu).
4. Puan alanına dokun: puan halkası, seviyen ve 5 seviye basamağı olan sabit bir pencere açılmalı (kaydırma olmamalı).
5. **Arkadaşlarım**'a dokun: ayrı sayfa değil, alttan açılan bir pencere gelmeli. Aşağı sürükleyince kapanmalı.
6. "Hesabım"ı aç, sonra Başarımlar'a girip geri dön: Hesabım **açık kalmalı**. Başka bir sekmeye geçip geri gelince kapanmalı.

## 3. Bilgi Yarışması
1. Oyunlar > Bilgi Yarışması'nı aç. "Nasıl oynanır?" ve ses düğmesi sarı olmalı.
2. Ortadaki büyük **OYNA**'ya dokun: Uzaktan'daki gibi bir pencere açılmalı (oynat düğmesi, kurallar, jokerler).
3. **Yan Yana**'ya dokun: iki oyuncu adı ve BAŞLA olan bir pencere açılmalı. BAŞLA'ya basınca oyun ekranı açılmalı.
4. Bu pencereleri üç yoldan kapatmayı dene: sağ üstteki çarpı, telefonun geri tuşu/hareketi ve ekranın sol kenarından sağa kaydırma.
5. **Uzaktan**'ı aç: 5 joker kartı tek sırada yan yana durmalı; puan tablosu dahil her şey kaydırmadan görünmeli.

## 4. Oyunlar sekmesi
1. "Oyun davetlerini al" yazısı ve zarf simgesi sarı olmalı.
2. "Oda kuralları" ve "Oyun puanı nasıl hesaplanır?" kutuları sarı çerçeveli olmalı.
3. **Oda Oluştur** > **Bilgi Yarışması**'nı seç: doğrudan Uzaktan özel oda açılmalı (oda kodu görünür).
4. Canın 0 iken ya da günlük oyun sınırın dolmuşken aynısını dene: oda açılmamalı, nedenini söyleyen bir uyarı çıkmalı.

## 5. Akış
1. Yazı kutusu ve yanındaki düğmeler belirgin çerçeveli ve gölgeli olmalı. Gönder düğmesi yazı kutusuyla aynı boyda olmalı; çok satır yazınca o da uzamalı.
2. Üstte süzgeç düğmesinin yanında **Arkadaşlarım** düğmesi olmalı; dokununca arkadaşlar penceresi açılmalı. Kurallar simgesi sarı olmalı.
3. Şunları ayrı ayrı gönderi olarak paylaşmayı dene; hepsi **"paylaşılamaz"** hatası vermeli:
   - Kendi arkadaş kodun (Arkadaşlarım penceresinde yazıyor), küçük harfle ya da `K X M P T A` gibi aralıklı yazılmış hâli
   - Açık bir oyun odasının ya da Bilgi Yarışması özel odasının kodu
   - `0532 123 45 67` gibi bir telefon numarası, `ali@ornek.com`, `www.ornek.com`, `insta: kullaniciadi`
4. Aynı hatayı yorum yazarken de görmelisin.
5. Ağır bir küfür yaz (ör. "siktir"): gönderide `*****` olarak görünmeli. "amk", "aq", "mal" olduğu gibi kalmalı. "Canım sıkıldım", "eksik", "götür" gibi kelimeler bozulmamalı.

## 6. Etkinlikler
1. Altta **Oluştur** solda, **Katılım Doğrula** sağda olmalı.
2. "Etkinlik puanları nasıl çalışır?" sarı olmalı.
3. **Keşfet** (turkuaz) ve **Ekip Bul** (lavanta) dolu renkli düğmeler olmalı; seçilince beyaz çerçeve almalı.

## 7. Konum izni
1. Telefonun ayarlarından Expo Go'nun konum iznini kapat (ya da "her seferinde sor" yap).
2. Konum isteyen bir şey yap (ör. haritada "Konumum" ya da gönderiye konum ekleme). "Konumunu 1 kez isteyeceğim" penceresinde sarı **"Gerektiğinde konum iznini otomatik ver"** anahtarı olmalı.
3. Anahtarı aç: telefonun izin penceresi çıkmalı. İzin verince pencere kapanmalı ve işlem devam etmeli.
4. Aynı işlemi tekrarla: bu pencere bir daha çıkmamalı.

## 8. Sekme başlıkları
Etkinlikler, Oyunlar ve Profil sekmelerinde üstteki başlığın arkasında turkuaz-mor bir ışık, solunda sarı ince bir çizgi olmalı. Üçünde de aynı görünmeli.
