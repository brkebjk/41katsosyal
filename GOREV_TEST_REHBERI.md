# Görev Test Rehberi – Etiketleme, profil başlığı, Bilgi Yarışması ve göstergeler

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.
- Önceki teslimattaki `verify-identity` işlevini henüz yüklemediysen onu da yükle:
  - Edge Functions > `verify-identity` > Code.
  - `supabase/functions/verify-identity/index.ts` dosyasının tamamını yapıştır > Deploy.

## B. Etiketleme
1. Arkadaşının rumuz numarasını öğren (ör. Kaptan#145 → 145).
2. Akışa `selam @145` yaz ve gönder.
   - Gönderi akışta **@Kaptan#145** olarak, renkli görünmeli.
   - Arkadaşına "Akışta senden bahsedildi" bildirimi gitmeli.
3. `@#145` ve `@Kaptan#145` yazınca da aynı sonuç çıkmalı.
4. Sahibi olmayan bir numara (`@99999`) değişmeden kalmalı ve kimse etiketlenmemeli.

## C. Profilim
1. Doğrulanmamış hesap:
   - Ad tam ortada durmalı; küçük **Doğrula** düğmesi adın sağında olmalı ve adı sola itmemeli.
2. Avatarın üstündeki hediye / VIP düğmesi eskisinden küçük olmalı.
3. Avatarın sağ altındaki **+** düğmesi küçük olmalı.
   - Profil resmi yüklediysen + yerine çok küçük "6 gün" gibi kalan gün yazmalı.
   - Bir hafta dolunca yeniden + görünmeli.

## D. Bilgi Yarışması
1. Oyunlar > Bilgi Yarışması: başlık kartındaki "N kişi oynuyor" kutusu açık ve koyu temada okunur olmalı.
   - Beyaz yazı, yeşil sayı ve nokta.
2. **Nasıl oynanır?** listesinde "Ödüller yalnızca doğrulanmış hesaba" maddesi olmalı.
3. **Puan sistemi** penceresindeki "Sıralama ödülleri" tablosunda "Hesabı doğrulanmamış üye: ödül alamaz" satırı olmalı.

## E. Göstergeler
- Profilde etkinlik ya da oyun hakkı bitince altıgen göstergenin çerçevesi koyu kırmızı değil, **açık kırmızı** olmalı.
