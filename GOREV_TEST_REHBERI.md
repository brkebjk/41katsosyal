# Görev Test Rehberi – Köpekbalığı Kafesi ekran paketi

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe 3 parça.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
- Sıra önemli: 1, 2, 3. "Run and enable RLS" çıkarsa onu seç.
- Hata alırsan bana ilet; baştan çalıştırmak zarar vermez.

## B. Oyun ekranı (moderatör hesabı + 1 telefon, 13 bot ile 16 kişi dene)
1. Kaydırma yok:
   - Avatarlar ekrana sığar.
   - Avatara dokununca hiçbir şey kaymaz.
   - 10+ kişide üst tabela küçülür, avatarlar büyük kalır.
2. Üst satır:
   - Solda kırmızı çıkış.
   - Büyük **🌙 1. GECE / ☀️ 1. GÜN** düğmesi.
   - Daha büyük **DALIŞ / PLAJ** yazısı.
3. Üst tabela:
   - Yalnızca yapman gereken iş ve olay akışı var.
   - Kişiler adla değil, avatardaki gibi **yuvarlak numarayla** görünür.
4. Komut yazısı:
   - "⛓️ OY VER: ŞÜPHELİYİ SEÇ", "🦈 AVINI SEÇ" gibi komutlar ortada büyük çıkar.
   - 2,5 sn sonra kaybolur.
5. Oylama:
   - Oy vermeyenin avatarında sarı **?** sallanır, altında "⏳ düşünüyor" yazar.
   - Tabela adın hemen altında ve daha büyük.
6. Yetenek animasyonu:
   - Gece bir avatara dokun; rol simgen senin avatarından ona gider ve orada kalır.
   - 🛟 şamandıra kavisle atılır ve döner.
   - 🦈 dalgalanarak yüzer.
   - 🔨 gelip vurur.
   - 🔱 zıpkın dümdüz uçar.
   - 🩹 ve 🔭 süzülür.
7. Olay olunca:
   - İlgili avatar büyür, üstünde balon çıkar.
   - Balonlar: 🦈 AVLANDI, 🔱 VURULDU, ⛓️ KAFESTE, 🏆 KAZANDI.
   - Sana özel olanlar yalnızca sende görünür: 🛟 KURTARILDI, 🔨 KİLİTLENDİ.
8. Alt şeritte **Geçmiş**: bütün yazışmalar, 🌙 gece ve ☀️ gündüz başlıklarıyla ayrılır.
9. Oyun bitince sıralama tablosu çıkar:
   - Kazananlar 🏆 ile en üstte.
   - Her satırda herkesin rolü ve oyunda kaldığı süre var: ✓ sona kaldı, 🚪 ayrıldı.
10. Plajda güneş küçük ve soluk sarı, solda ufuk çizgisinde (süre çubuğuyla karışmaz).
11. Botlar artık "tartışmayı hızlı geç"i işaretlemez (iki oyunda da).

## C. Uzaktan oda (2 telefon)
1. Bas-konuş:
   - Her tartışmada kişi başı toplam **15 sn** konuşma hakkı var.
   - Düğmede kalan süre yazar. Hak bitince düğme kapanır, yeni tartışmada yenilenir.
2. Konuşanın avatarı yeşil çerçeveyle öne çıkar ve büyür.
3. Şikâyet: konuşan oyuncunun **avatarına basılı tut**.
   - Son 2 dakikada ses mesajı yoksa bunu söyler.
4. Oyun başladıktan sonra oda sahibi çıkarsa:
   - Oda kapanmaz, sahiplik başka bir gerçek oyuncuya geçer.
   - Başka gerçek oyuncu yoksa oda kapanır.

## D. Yan yana oyun
- Yan yana oda açınca aylık genel oyun hakkından 1 düşer (önceden de böyleydi; kontrol edildi).
