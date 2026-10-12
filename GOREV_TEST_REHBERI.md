# Görev Test Rehberi – Paket: Seviye Ödülleri ve Arayüz 3

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas (seviye ödülleri için gerekli).
> Sonra bilgisayarında `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile uygulamayı aç.

## 1. Logo ve rozet
1. Uygulamayı açarken çıkan açılış ekranındaki ve giriş ekranındaki logo tam ortada durmalı (sağ alta kaymamalı).
2. Akış sekmesinin üstünde logo ortada, eskisinden büyük ve altında "SOSYAL" yazısı olmadan görünmeli.
3. Profil > "Hesabı Yükselt" kutusundaki rozet tam ortalı olmalı.

## 2. Abonelik ekranı
1. Profil > Hesabı Yükselt'e gir. Üstteki rozet eskisinden çok daha büyük olmalı.
2. Karşılaştırma tablosu: renkli ince çerçeve, her satırda simge, sağda turkuaz-mor başlıklı ve baştan sona açık renkli **Abone** sütunu olmalı. Abone sütunundaki değerler sarı olmalı.

## 3. Sekme başlıkları
Etkinlikler, Oyunlar ve Profil başlıklarının arkasındaki ışık kenarlara doğru yumuşakça kaybolmalı; köşe ya da kutu kenarı görünmemeli.

## 4. Etkinlikler
1. Kategori kutuları biraz daha büyük olmalı.
2. Bir kategoriye dokun: sol üstte çerçevesiz **< Geri** yazısı çıkmalı ("Tüm kategoriler" değil).

## 5. Harita
1. Bildirim yokken sağ üstteki zilin içi şeffaf olmalı (yalnızca beyaz halka ve zil).
2. Bir bildirim gelince (ör. başka hesaptan arkadaşlık isteği) düğme büyüyüp küçülmeli ve **yalnızca zil simgesi** sallanmalı; halka sallanmamalı.
3. Haritayı en çok yakınlaştır: petek adları turkuaz ve temiz görünmeli (harflerde renk bozulması olmamalı).

## 6. Oyunlar
1. Oyun kutuları eğik değil, düz durmalı (boyutları aynı).
2. Aylık Ödül Podyumu daha alçak olmalı.

## 7. Seviye ödülleri (puan ve hak sistemi)
Yeni eşikler: Seviye 2 = 250, Seviye 3 = 1.200, Seviye 4 = 3.500, Seviye 5 = 8.000 puan.
Denemek için Supabase > Table Editor > `profiles` tablosunda kendi satırındaki `points` değerini değiştirebilirsin (denemeden sonra geri al).
1. **Seviye 2 (ör. 300 puan):** Oyunlar sekmesindeki oyun hakkı göstergesi 1 fazla olmalı (ücretsiz üyede 3 yerine 4).
2. **Seviye 3 (ör. 1.300 puan):** Etkinlik hakkı 1 fazla olmalı; oyun hakkı yeniden normale dönmeli (ödüller birikmez).
3. **Seviye 4 (ör. 4.000 puan):** Bilgi Yarışması'nda sarı "Seviye 4 ödülü: … ×1,2" notu görünmeli. "Puan sistemi" penceresinde sınırlar 12 / 150, Uzaktan penceresinde kazanana puanlar 1,5 / 1,8 / 2,1 / 2,4 olmalı.
4. **Seviye 5 (ör. 9.000 puan):** Bilgi Yarışması'nda canlar kutusunda ∞ ve "Sınırsız" yazmalı. Solo oyna, can azalmamalı. Günlük oyun sınırı yine geçerli olmalı.
5. Profil > **Başarımlar**: "Seviye ödülleri" kartında her seviyenin adının yanında sarı küçük yazıyla ödülü, altında sıfırlama kuralları görünmeli.
6. Profil > puana dokun: açılan penceredeki seviye basamaklarında da ödüller sarı küçük yazıyla görünmeli.
7. Profil > Uygulama > **Yarışma kuralları**: "Seviyeler ve seviye ödülleri" bölümü olmalı.
8. Oyunlar > oyun hakkı göstergesi (bilgi penceresi), Oda kuralları ve Etkinlikler > etkinlik hakkı göstergesi pencerelerinde seviye ödülü ve "haklar biriktirilemez" bilgisi yazmalı.
