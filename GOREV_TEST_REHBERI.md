# Görev Test Rehberi – Klan, oyun ekranı düzeni, yeni terimler, ölüm nedeni, bekleme odası sohbeti

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe **4 parça**.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
4. Yeni sorgu aç > `4.sql` > Run.
- Sıra önemli: 1, 2, 3, 4. "Run and enable RLS" çıkarsa onu seç.

## B. Oyun ekranı (iki oyun)
1. Üstteki oyun adı ve olay yazısı ortada ve biraz daha büyük.
2. Kaçıncı tur rozeti en altta, **Rolüm** ile **Rehber** (Vampir'de **Nasıl?**) arasında.
3. Süre çubuğu bu alt şeridin hemen üstünde.
4. Kutucuklar:
   - aşama değişince yerinden oynamaz,
   - numara sol üst köşede,
   - durum yazısı (Avlandı vb.) küçük, simgesiz, rumuzun üstünde,
   - oy tabelası ve rumuz daha küçük.
5. Ortada çıkan büyük yazı simgesiz ve iki noktasız (ör. **KONUŞUN**, altında "Köpekbalığı kim ?").
6. **Rolüm** listesinde açığa çıkan rollerin yanında yalnızca oyuncu numarası var, rumuz yok:
   - takım arkadaşı yeşil halkalı,
   - ölen düşman kırmızı halkalı.

## C. Köpekbalığı terimleri
- Gece → **Resif Keşfi**, gün → **Toplantı**, plaj → **Su Üstü**.
- Oylama → **Karar Oylaması**. En çok oyu alan **ekipten çıkarılır**, sonra sıradaki dalış başlar.
- Sohbetteki olay satırları küçük ve simgesiz (ör. "1. Resif Keşfinde avlandı - …").
- Rehber ve giriş ekranı da yeni terimlerle.

## D. Ölünce neden öldüğün (iki oyun)
1. Ölen kişinin ekranında bir kez büyük **ELENDİN** yazısı çıkar, altında neden yazar:
   - "Köpekbalıkları seni avladı", "Zıpkıncı seni vurdu",
   - "Dev Mürekkep Balığı seni boğdu", "Yalnız Sörfçü seni yaktı",
   - "Karar Oylamasıyla ekipten çıkarıldın",
   - Vampir'de "Vampirler seni ısırdı" / "Oylamayla köyden çıkarıldın".
2. Aynı yazı sohbette **🔒 Sana özel** satırı olarak durur. Kimin yaptığı (numara) asla yazmaz.

## E. Tartışmayı geç
- Uzaktan odada mikrofon kutusunun sağında küçük yuvarlak yeşil **Geç** düğmesi var.
- Basınca kaç kişinin geçmek istediği görünür (ör. 3/10). Tekrar basınca geri alınır.
- Yan yana odada bu düğme alt şeritte durur.

## F. Bekleme odası sohbeti
1. Bekleme odasında sohbet baloncuğu görünür; odadaki herkes yazabilir.
2. Yeni elde önceki 2 elin herkese açık mesajları okunur. Başlıkta "Önceki el · …" yazar.

## G. Atma oylaması
- Başlatan kişi ortada oylama bandını görür.
- Diğerleri yalnızca sağ üstte küçük pencereyi bir kez görür. Seçince kapanır; kırmızı oyuncular düğmesiyle tekrar açılır.

## H. Oda sınırı
- Bir oda en çok oyuncu sayısını (16) asla geçemez; botlar da yalnızca boş yer kadar eklenir.

## I. Klan
1. Eski "Ekip" sistemi artık **Klan**: Profil > **Klanım**, Sıralama > **Klan** sekmesi.
2. Oyunda gelen klan daveti üstten kayarak 5 sn görünür (**Kabul et / Reddet**).
3. Seçmezsen davet Akış > Mesajlar'ın en üstünde durur.

## J. Diğer
1. Seviye 2 ödülü: aylık etkinlik hakkı **2**.
2. Reddedilen arkadaşlık isteği aynı kişiye en erken **1 saat** sonra yeniden gönderilebilir.
3. Web panel > Şikâyetler'de klan sohbeti şikâyetleri de görünür.
