# Görev Test Rehberi – Hesap doğrulamayı çalıştırma, ad biçimi, profil resmi kontrolü

> İşlev kodu bu teslimatta değişti. `verify-identity` işlevini daha önce yayınladıysan Adım 3'teki kodu **yeniden yapıştırıp tekrar Deploy et**. Adım 1'i (schema.sql) de yeniden çalıştır.

Hata büyük ihtimalle Supabase tarafının kurulmamış olmasından. Aşağıdaki adımları **sırayla** yap. Her adımın sonunda "Kontrol" satırı var.

## Adım 1 – Veritabanını güncelle
1. https://supabase.com/dashboard adresine gir ve projeni aç.
2. Sol menüden **SQL Editor**'e tıkla, sonra **+ New query**.
3. Bilgisayarındaki `supabase/schema.sql` dosyasını aç, tamamını kopyala (Ctrl+A, Ctrl+C), boş sorgu kutusuna yapıştır.
4. Sağ alttaki **Run** düğmesine bas.
5. **Kontrol:** Altta yeşil "Success" yazmalı. Kırmızı hata çıkarsa hatanın fotoğrafını bana gönder.

## Adım 2 – Gizli parolayı ekle
1. Sol menüden **Edge Functions**'a tıkla, üstteki **Secrets** sekmesine geç. Bazı ekranlarda yolu şudur: Project Settings > Edge Functions > Secrets.
2. **Add new secret**:
   - **Name:** `IDENTITY_PEPPER` (birebir böyle, büyük harflerle)
   - **Value:** en az 32 karakter, rastgele harf ve rakam. Örnek biçim: `k41xQ9vT2mLr8NwZ5pYc3HdJ7sFb0GeA6uKi`. Kendin yeni bir tane uydur.
3. **Save**.
4. Bu parolayı bir yere yaz ve **bir daha asla değiştirme**.
5. **Kontrol:** Secrets listesinde `IDENTITY_PEPPER` görünmeli.

## Adım 3 – Doğrulama işlevini yayınla
1. **Edge Functions** sayfasında **Deploy a new function** düğmesine bas ve **Via Editor**'ü seç.
2. Function name kutusuna birebir şunu yaz: `verify-identity`
3. Editördeki örnek kodun **tamamını sil**. Bilgisayarındaki `supabase/functions/verify-identity/index.ts` dosyasının tamamını kopyalayıp yapıştır.
4. **Deploy function**'a bas ve bitmesini bekle.
5. İşlevin **Details** (ya da Settings) bölümünde **"Verify JWT"** / **"Enforce JWT Verification"** anahtarını **KAPAT** ve kaydet. Giriş kontrolünü işlev kendisi yapıyor; bu anahtar açıkken bazı projelerde istek reddediliyor.
6. **Kontrol:** Edge Functions listesinde `verify-identity` görünmeli.

## Adım 4 – Telefonda dene
1. Bilgisayarda `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile aç.
2. Profil > avatarın sol üstündeki sarı kalkan > bilgilerini yaz > **Doğrula**.
3. Hata çıkarsa mesajın sonundaki **koda** bak:

| Kod | Anlamı | Ne yap |
|---|---|---|
| K1 | `verify-identity` işlevi bulunamadı | Adım 3'ü tekrar yap; ad birebir `verify-identity` olmalı |
| K2 | Oturum reddedildi | Adım 3.5'teki anahtarı kapat; uygulamadan çıkış yapıp tekrar gir |
| K3 | İşlev çalışırken hata verdi | Edge Functions > verify-identity > **Logs** ekranının fotoğrafını bana gönder |
| K4 | Telefonun internet bağlantısı yok | Bağlantını kontrol et |
| K5 | `IDENTITY_PEPPER` eksik ya da kısa | Adım 2'yi tekrar yap (en az 32 karakter) |
| K6 | Veritabanı güncel değil | Adım 1'i tekrar yap |
| "Nüfus kayıt servisine ulaşılamıyor" | NVİ, Supabase'in sunucusundan gelen isteği kabul etmiyor | Bana haber ver; başka bir yol kurarız |
| "Bilgiler uyuşmadı" | Kurulum tamam, bilgilerden biri farklı | Ad (ikinci adınla), soyad ve doğum yılını kimliğindeki gibi yaz |

4. **Başarılı olursa:**
   - "Hesabın doğrulandı" penceresi çıkar.
   - Avatarın sol üstü ve adının yanı sarı tik olur.
   - Profildeki gerçek adın nüfustaki adın olur. İki adın varsa ilki kısaltılır: **Engin Berke Taş → E.BERKE TAŞ** (profilde büyük harfle görünür).
   - Hesabım > "Gerçek adını değiştir" artık kapalıdır: "değiştirilemez" yazar.

## Adım 5 – Profil resmi kontrolü
1. Doğrulanmış hesapla avatara dokun > **Resim seç**.
2. "Resim kontrole gönderildi" penceresi çıkmalı. Profilde "Profil resmin moderatörler tarafından kontrol ediliyor" yazmalı.
3. **10–30 dakika sonra** (her seferinde farklı bir süre) uygulamada herhangi bir şey yap, örneğin akışı yenile:
   - Bildirim kutusuna "Profil resmin onaylandı" düşmeli.
   - Kontrol yazısı kaybolmalı.
   - Arkadaşların resmini görmeli.
4. Bu süre dolmadan arkadaşların resmi **görmemeli**.
