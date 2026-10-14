# Görev Test Rehberi – Köpekbalığı Kafesi, bas-konuş, oyun ses düğmesi

## A. Supabase'i güncelle
Şema dosyası SQL Editor için çok büyüdüğü için 3 parçaya bölündü: `supabase/parcalar/` klasöründe.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run > Success.
3. Yeni sorgu aç > `3.sql` > Run > Success.
- Sıra önemli: 1, 2, 3. Yarıda hata alırsan hatayı bana ilet; baştan tekrar çalıştırmak zarar vermez.
- Vampir–Köylü olduğu gibi duruyor.

## B. Köpekbalığı Kafesi (moderatör hesabı + 1 telefon, botlarla)
1. Oyunlar > **Köpekbalığı Kafesi** > Oda aç > **Yan yana** > **Otomatik Oyun**.
2. Kıyı ekranında **+3 deneme oyuncusu**'na 2 kez bas (6 kişi olmalı) > **Oyunu başlat**.
3. **Rol çarkı** döner ve rolünde durur > **Rolümü gördüm, hazırım**.
4. **Dalış (gece)**:
   - Ekran kararır, kabarcıklar yükselir, uzakta köpekbalığı gölgeleri süzülür.
   - Üstte "Oksijen %" çubuğu azalır.
   - Rolün varsa ortada büyük yazı çıkar ("AVINI SEÇ" gibi) > avatara dokun > alttaki düğmeyle onayla.
5. **Plaj (gündüz)**:
   - Ekran aydınlanır: güneş, deniz, dalga, kum.
   - Ortada maskesi kırılanlar yazar.
   - Ölen avatar soluklaşır, üstünde 🤿 ve "Maske kırıldı" yazar.
6. **Kafes oylaması**:
   - Her avatarın sol üstünde büyük sarı numara var.
   - Oy verince başının üstünde tahta tabela çıkar: "→7".
   - Avatarın sağ üstündeki kırmızı sayı, aldığı oy.
7. Oyun bitince kazanan takım rengi ve herkesin rolü avatarların altında görünür.
8. Alt şerit:
   - **Rolüm**: rolün ve notların.
   - **Takım**: köpekbalığıysan takım sohbeti.
   - **Ölüler**: elenenlerin sohbeti.
   - **Rehber**: açılır bölümlü oyun rehberi.

## C. Uzaktan oda ve bas-konuş (2 telefon; Expo Go'da da çalışır)
1. Telefon 1: Köpekbalığı Kafesi > **Uzaktan** > oda aç, botları ekle. Telefon 2: Açık odalar'dan katıl.
2. Plajda **BASILI TUT, KONUŞ** düğmesine basılı tut, konuş, bırak.
   - İlk seferde açıklama ve mikrofon izni çıkar. Sonra tekrar bas.
3. Diğer telefonda ses çalmalı.
   - Üstte yeşil "🔊 #1 Ad konuşuyor" çıkar.
   - Konuşanın avatarında 🔊 görünür.
4. İki telefon art arda konuşursa mesajlar sırayla çalar.
5. Dalışta düğme "🔇 Dalışta mikrofonlar kapalı" olur. Köpekbalıkları yalnızca birbirini duyar.
6. Kötü bir ses mesajını bildirmek için yeşil "konuşuyor" yazısına uzun bas.
   - Moderatör web panel > Şikayetler'de **Ses mesajını dinle**.

## D. Etkinlikte anlatıcı
- Etkinlik sahibi > Etkinlik oyunu aç > **Köpekbalığı Kafesi** > **Anlatıcı olurum (oynamam)**.
- Anlatıcı herkesin rolünü görür ve aşamaları ilerletir.
- Hak düşmez, kimse puan almaz.
- Etkinlik dışında anlatıcı seçeneği çıkmaz.

## E. Bilgi Yarışması'nda ses düğmesi
- Maç, Solo Maraton ve Yan yana ekranlarının üstünde 🔊 düğmesi var.
- Yalnızca oyun seslerini kapatır.

## F. KVKK metnine eklenecek paragraf
Web panel > Sistem > Uygulama metinleri > **KVKK aydınlatma metni** ve **Gizlilik politikası**'na ekle:

```
## Uzaktan oyunlarda bas-konuş ses mesajları
Köpekbalığı Kafesi'nin uzaktan odalarında, yalnızca konuşma düğmesine basılı tuttuğunuz sürece (en çok 5 saniye) sesiniz kaydedilir ve odadaki oyunculara sırayla çalınması için sunucumuza gönderilir. Ses mesajları en geç 10 dakika sonra kalıcı olarak silinir ve yedeklere alınmaz. Bir oyuncu ses mesajını şikâyet ederse, o mesaj moderatörün incelemesi için en çok 14 gün saklanır, sonra silinir. Mikrofonunuz başka hiçbir zaman açılmaz.
```
