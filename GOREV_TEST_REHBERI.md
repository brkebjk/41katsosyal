# Görev Test Rehberi – Yüzen yazışma, yuvarlak numaralar, tabloda puan

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe 3 parça.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
- Sıra önemli: 1, 2, 3. "Run and enable RLS" çıkarsa onu seç.

## B. Yüzen yazışma baloncuğu
1. Oyun başlayınca sağda yuvarlak 💬 baloncuk çıkar. Parmağınla tutup istediğin yere sürükle.
2. Baloncuğa dokun. Pencere baloncuğun olduğu yerde açılır.
   - Pencereyi üstteki çizgili başlıktan tutup taşıyabilirsin.
3. Sekmeler:
   - **Genel**: herkese açık yazışma.
   - **🦈 Takım**: yalnızca köpekbalıkları görür.
   - **🪸 Ölüler**: elenenler ve Medyum görür.
4. Her sekmede oyunun baştan sona bütün mesajları var, 🌙 gece ve ☀️ gündüz başlıklarıyla ayrılır.
   - Yazamadığın zaman alttaki satır nedenini söyler.
5. Pencere kapalıyken yeni mesaj gelirse baloncukta **kırmızı sayı** çıkar. Sekmelerde de ayrı ayrı sayı görünür.
6. Alttaki eski mesaj çubuğu, Takım, Ölüler ve Geçmiş düğmeleri kaldırıldı. Avatarlara daha çok yer kaldı.
7. Medyum olarak plajda "Ölülerin frekansını aç" düğmesi pencereyi Ölüler sekmesinde açar.

## C. Yuvarlak oyuncu numaraları
- Düğmelerde, pencerelerde ve açıklamalarda oyuncu numarası artık "#5" değil, yuvarlak içinde "⑤" yazar.
- Örnekler: "⛓️ ⑤ KAFESE AT", "✓ ③ seçildi", "② Ayşe vurulsun mu?".
- Oy tabelasında ve üst tabelada numara avatardaki gibi yuvarlak rozettir.

## D. Oyun sonu tablosu
- Sıralama tablosunda yeni **Puan** sütunu var. Her oyuncunun bu oyundan kazandığı puan yazar, puan almayanda "—" görünür.
- Deneme odasında (botlu) herkes "—" görür, çünkü deneme odasına puan yazılmaz.
- Gerçek puanı görmek için botsuz, en az 4 kişilik bir oyun gerekir.
