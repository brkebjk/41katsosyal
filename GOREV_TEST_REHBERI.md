# Görev Test Rehberi – Kamerayla profil resmi (abonelere), kimlik doğrulama kapalı, yazı düzenleme modu

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.
- Edge Function'a dokunmana gerek yok.
- Web panel Cloudflare'de kendiliğinden güncellenir.

## 1. Kimlik doğrulama kapalı
1. Profil: adın yanında **Doğrula** düğmesi ve başarımların üstündeki "Hesabını doğrula" kutusu görünmemeli.
2. Akış: "Hesabını doğrula" uyarısı çıkmamalı.
3. Sıralama, Ödüller, Oyunlar podyumu, Bilgi Yarışması ve Kurallar: "doğrulanmamış üye ödül alamaz" yazıları görünmemeli.
4. Kayıt ekranında doğrulama kutusu olmamalı.
5. Yeniden açmak için: Web panel > Sistem > **Ayarlar** > `identity_verification_enabled` = `true`.
   - Bunu yalnızca çalışan bir doğrulama yöntemi bağlandığında yap.

## 2. Profil resmi (abonelere)
1. **Abone olmayan hesap:** avatarın sağ altındaki **+** → "Profil resmi abonelere özel" penceresi.
   - "Aboneliğe bak" abonelik ekranını açmalı.
2. **Abone hesap:** **+** → **Kamerayla çek**.
   - İlk seferde kamera izni ekranı açılmalı ve şu açıklama yazmalı: "Cihaz dosyalarınız bizi ilgilendirmiyor. Kişi gerçekliğini maksimize etmek ve küçük yaşta kullanıcıların önüne geçmek için profil fotoğrafı eklemek için sadece kameranı kullanabilirsin."
   - **Kameraya izni ver** → telefonun izin penceresi → İzin ver.
   - Expo Go'da telefonun kendi izin penceresinde Expo Go'nun yazısı çıkar. Bizim açıklamamız uygulamanın kendi sürümünde orada da görünür.
3. Uygulamanın içinde kare kadrajlı kamera açılmalı.
   - Sağ alttaki düğme ön ve arka kamera arasında geçmeli.
   - Ortadaki düğmeyle çek → önizleme → **Tekrar çek** ya da **Kullan**.
4. **Kullan** → "Resim kontrole gönderildi".
   - 10–30 dakika içinde onaylanmalı, ya da moderatör onaylamalı / reddetmeli.
5. Galeriden seçme seçeneği hiçbir yerde olmamalı.
6. Aynı hafta yeniden + → "Bu hafta profil resmini değiştirdin…" uyarısı çıkmalı; + yerinde kalan gün yazmalı.
7. Abonelik bitince profil resmi arkadaşlarda görünmez olur; yeniden abone olunca geri gelir.

## 3. Yazı düzenleme modu (geçici)

### Modu aç (moderatör hesabıyla)
1. Profil > **Moderatör paneli**.
2. En üstteki **Yazı düzenleme modu** anahtarını aç.
3. Düzenlenebilen yazıların altı **sarı noktalı çizgiyle** çizili olur.

### Yazı düzelt
1. Herhangi bir ekranda altı noktalı çizili bir yazıya **uzun bas**.
2. "Yazıyı düzenle" penceresi açılır; üstte orijinal yazı görünür.
3. Yeni halini yaz > **Kaydet**. Yazı hemen değişmeli.
4. Başka bir telefonda uygulamayı kapatıp aç: o telefonda da yeni hali görünmeli.
5. Geri almak için:
   - Aynı yazıya uzun bas > **Orijinale dön**.
   - Ya da kutuyu boşaltıp **Kaydet**.

### Bilmen gerekenler
- Mod açıkken düğmelerin **yazısına** dokunmak düğmeyi çalıştırmayabilir.
  - Düğmenin kenarına dokun ya da işin bitince modu kapat.
- İçinde sayı ya da isim geçen yazılar düzenlenemez (ör. "3 kişi oynuyor", "Kalan: 2").
  - Bunları bana yaz, ben düzeltirim.
- Gönderiler, adlar ve rumuzlar düzenlenemez; yalnızca uygulamanın kendi yazıları düzenlenir.
- Kurallar, sözleşme ve KVKK metinleri yine Web panel > Uygulama metinleri bölümünden düzenlenir.
- Normal üyelerde mod hiç açılmaz; yalnızca düzeltilmiş yazıları görürler.

### İşin bitince
1. Web panel > Sistem > **Yazı düzeltmeleri**.
   - Bütün düzeltmeleri görürsün; istediğini "Orijinale döndür" ile geri alabilirsin.
2. **Düzeltmeleri indir** ile dosyayı indir.
3. Dosyayı GitHub'da depoya yükle: **Add file > Upload files**, dal `claude/kind-goodall-dy5z7y`.
4. Bana haber ver. Düzeltmeleri koda işleyip bu özelliği tamamen kaldıracağım.
