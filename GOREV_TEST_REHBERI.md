# Görev Test Rehberi – Kimlik doğrulama tanısı ve yazı düzenleme modu (geçici)

## 0. Kimlik doğrulama işlevini güncelle (yeni)
1. Supabase > **Edge Functions** > `verify-identity` > **Code**.
2. Kodu tamamen sil, `supabase/functions/verify-identity/index.ts` dosyasının tamamını yapıştır > **Deploy**.
3. Uygulamada doğrulamayı bir kez dene. Hata kodunu bana yaz:
   - **N-V2W…** = NVİ'nin güvenlik duvarı sunucumuzu reddediyor (yurt dışı sunucu engeli).
   - **N-V2F** = NVİ istek biçimini reddetti.
   - **N-V2P-V1P** yine çıkarsa: Edge Functions > `verify-identity` > **Logs** sekmesinde "cevabı anlaşılamadı" ile başlayan satırı kopyalayıp bana gönder. O satırda kimlik bilgisi yoktur; TC numarası *** ile gizlenir.

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.
- Web panel Cloudflare'de kendiliğinden güncellenir (2–3 dakika).

## B. Modu aç (moderatör hesabıyla)
1. Profil > **Moderatör paneli**.
2. En üstteki **Yazı düzenleme modu** anahtarını aç.
3. Düzenlenebilen yazıların altı **sarı noktalı çizgiyle** çizili olur.

## C. Yazı düzelt
1. Herhangi bir ekranda altı noktalı çizili bir yazıya **uzun bas**.
2. "Yazıyı düzenle" penceresi açılır; üstte orijinal yazı görünür.
3. Yeni halini yaz > **Kaydet**. Yazı hemen değişmeli.
4. Başka bir telefonda uygulamayı kapatıp aç: o telefonda da yeni hali görünmeli.
5. Geri almak için:
   - Aynı yazıya uzun bas > **Orijinale dön**.
   - Ya da kutuyu boşaltıp **Kaydet**.

## D. Bilmen gerekenler
- Mod açıkken düğmelerin **yazısına** dokunmak düğmeyi çalıştırmayabilir.
  - Düğmenin kenarına dokun ya da işin bitince modu kapat.
- İçinde sayı ya da isim geçen yazılar düzenlenemez (ör. "3 kişi oynuyor", "Kalan: 2").
  - Bunları bana yaz, ben düzeltirim.
- Gönderiler, adlar ve rumuzlar düzenlenemez; yalnızca uygulamanın kendi yazıları düzenlenir.
- Kurallar, sözleşme ve KVKK metinleri yine Web panel > Uygulama metinleri bölümünden düzenlenir.
- Normal üyelerde mod hiç açılmaz; yalnızca düzeltilmiş yazıları görürler.

## E. İşin bitince
1. Web panel > Sistem > **Yazı düzeltmeleri**.
   - Bütün düzeltmeleri görürsün; istediğini "Orijinale döndür" ile geri alabilirsin.
2. **Düzeltmeleri indir** ile dosyayı indir.
3. Dosyayı GitHub'da depoya yükle: **Add file > Upload files**, dal `claude/kind-goodall-dy5z7y`.
4. Bana haber ver. Düzeltmeleri koda işleyip bu özelliği tamamen kaldıracağım.
