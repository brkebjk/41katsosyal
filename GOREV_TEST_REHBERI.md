# Görev Test Rehberi – Köpekbalığı Kafesi, bas-konuş, oyun ses düğmesi

## A. Supabase'i güncelle
Şema dosyası SQL Editor için çok büyüdüğü için 3 parçaya bölündü: `supabase/parcalar/` klasöründe.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run > Success.
3. Yeni sorgu aç > `3.sql` > Run > Success.
- Sıra önemli: 1, 2, 3. Yarıda hata alırsan hatayı bana ilet; baştan tekrar çalıştırmak zarar vermez.
- Vampir–Köylü olduğu gibi duruyor.

## A2. Köpekbalığı Kafesi giriş ekranı (yeni)
1. Oyunlar > **Köpekbalığı Kafesi** kutusuna dokun: tema ekranı açılır, kaydırma yok.
2. Arka plan:
   - Üstte gökyüzü, güneş ve dalgalar var.
   - Altta su altı, kabarcıklar ve ışık hüzmeleri var.
   - Bir 🤿 dalgıç sürekli denize dalar.
   - Yazılar okunur kalmalı.
3. Sayaçlar:
   - 🏖️ Yan yana: "∞ puan sınırı yok" + bu ay kalan oda hakkın.
   - 🌊 Uzaktan: "bugün kalan 2/2" ve "bu ay kalan 6/6" puanlı oyun.
4. Ortadaki rol kartlarını sağa-sola kaydır: 14 rol tek tek. Alttaki noktalar takım rengindedir.
5. Puan kutusuna dokun: puan tablosu açılır.
6. **YAN YANA** ya da **UZAKTAN** düğmesi doğrudan oda açar ("nasıl oynanacak" sorusu çıkmaz).
7. **Açık odalar · kodla katıl**, var olan odaları listeler. **Rehber** düğmesi oyun rehberini açar.

## A3. Bu paketteki yenilikler (iki oyun)
- **Tartışmayı hızlı geç:**
  - Vampir–Köylü'de sabahta, Köpekbalığı'nda plajda alttaki kutuyu işaretle.
  - Yaşayanların yarısından fazlası işaretleyince oylama hemen başlar.
  - Botlu odada botlar da işaretler, bu yüzden tartışma çabuk geçer.
- **Çıkış:**
  - Oyun ekranında telefonun Geri tuşu ve kenardan kaydırma çalışmaz.
  - Çıkış yalnızca sol üstteki kırmızı, kapı simgeli düğmeyle olur.
- **Köpekbalığı oy tabelası:**
  - Tabela artık avatarın altında.
  - İçindeki ok, oy verilen kişinin avatarına döner.
- **Rol simgesi:**
  - Avatarın içinde, alt ortada küçük rol simgesi var.
  - Yalnızca görmeye hakkı olan görür: kendin, takımın, açıklananlar, oyun sonunda herkes.
- **Yazışma (Köpekbalığı):**
  - Altta "💬 Mesaj yaz…" çubuğu var; dokununca yazışma açılır.
  - Plajda ve oylamada yaşayanlar yazar, herkes okur.
  - Dalışta kapalıdır. Fısıltı yoktur.
- **Rehber:** En üstte bütün rollerin özelliklerini gösteren tablo var.
- **Bas-konuş:**
  - Biri kaydederken gelen ses kesilmeden çalmaya devam eder.
  - Ses çalınamazsa altta kırmızı uyarı çıkar ("Ses indirilemedi / kaydedilemedi / çalınamadı"). Hangisi çıkarsa bana yaz.

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
