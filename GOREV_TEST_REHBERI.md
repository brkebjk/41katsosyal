# Görev Test Rehberi – Uzaktan Vampir–Köylü, sesli sohbet, puan kuralları

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.

## B. Agora hesabı (ücretsiz, kart istemez)
1. **agora.io** > Sign up ile hesap aç.
2. Console > **Projects** > **Create a new project**:
   - Ad: `41kat`
   - Kimlik doğrulama: **Secured mode: APP ID + Token**
3. Projenin satırında:
   - **App ID**'yi kopyala.
   - **Primary Certificate**'i etkinleştirip kopyala.
4. Supabase > **Edge Functions** > **Secrets** > iki değer ekle:
   - `AGORA_APP_ID` = App ID
   - `AGORA_APP_CERTIFICATE` = Primary Certificate
5. Supabase > Edge Functions > **Deploy a new function** > **Via Editor**:
   - Ad: `voice-token` (birebir böyle).
   - `supabase/functions/voice-token/index.ts` dosyasının tamamını yapıştır > Deploy.
   - Ayarlarından **Verify JWT** anahtarını **KAPAT**.
6. Ayda 10.000 dakika ücretsiz.
   - Uygulama ayda 9.000 kişi-dakikada sesli sohbeti kendiliğinden kapatır, ücret çıkmaz.
   - Bu sınırı Web panel > Ayarlar > `voice_month_minutes` ile değiştirebilirsin.

## C. Expo Go ile dene (ses hariç her şey)
1. Oyunlar > Vampir–Köylü > **Oda aç**.
   - "Nasıl oynanacak?" penceresi çıkmalı: **Yan yana** / **Uzaktan (sesli)**.
2. **Uzaktan (sesli)** > Otomatik Oyun.
   - Konum ve adres sorulmamalı.
   - Oyun hakkı göstergesi azalmamalı (uzaktan oda hak yemez).
3. **Açık odalar** listesinde oda "Uzaktan · sesli sohbetle · kodsuz katılınır" yazmalı.
   - Başka hesaplar **Katıl** ile kod yazmadan girmeli.
4. Oyun ekranında **Sesli sohbet** kartı görünmeli.
   - Expo Go'da "uygulamanın kendi sürümünde çalışır" yazar.
5. **Oylamayla atma:** bir oyuncunun yanındaki kırmızı **0/3** düğmesine bas.
   - Odadakilerin yarısından fazlası basınca kişi odadan çıkmalı ve yeniden girememeli.
   - Oda sahibi atılamaz.
6. **Puan:**
   - Uzaktan oyun bitince puan geçmişinde "· Uzaktan (%50)" yazmalı; puan yan yananın yarısı olmalı.
   - Günde en çok 2, ayda en çok 6 uzaktan oyundan puan alınır.
7. **Sıralama** (aylık hediye programı açıksa): o ay etkinliğe katılmamış ya da yan yana oynamamış üyede "Ödül şartı eksik" yazmalı.

## D. Sesli sohbeti iPhone'da dene (uygulamanın kendi sürümü)
Gerekenler:
- **Apple Developer Program** üyeliği (yılda 99 $; developer.apple.com/programs/enroll). Bu üyelik olmadan uygulama iPhone'a kurulamaz.
- Bir bilgisayar.

1. **expo.dev**'de ücretsiz hesap aç.
2. Bilgisayara **Node.js LTS** kur (nodejs.org).
3. Terminali aç ve sırayla yaz:
   ```
   npm install -g eas-cli
   cd 41katsosyal/app
   eas login
   eas init
   ```
   `eas init` projeyi expo.dev'e bağlar ve app.json'a proje numarasını yazar. Bu değişikliği GitHub'a gönder ya da bana söyle.
4. **Supabase anahtarlarını expo.dev'e gir:**
   - expo.dev > projen > **Environment variables** > **preview** ortamına iki değer ekle:
     - `EXPO_PUBLIC_SUPABASE_URL`
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Değerler bilgisayarındaki `.env` dosyasındakilerle aynı.
5. **iPhone'unu kaydet:**
   - Terminalde `eas device:create` yaz.
   - Çıkan bağlantıyı iPhone'da Safari ile aç > profili indir > Ayarlar > **Profil indirildi** > Yükle.
6. **Uygulamayı derle:**
   - Terminalde `eas build --profile preview --platform ios` yaz.
   - Apple hesabınla giriş yap. Sertifika sorularına **Yes** de; gerisini EAS halleder.
   - Derleme Expo sunucularında yaklaşık 15–25 dakika sürer.
7. **iPhone'a kur:**
   - Derleme bitince çıkan bağlantıyı ya da QR'ı iPhone'da aç > **Install**.
   - İlk açılışta: Ayarlar > Gizlilik ve Güvenlik > **Geliştirici Modu** > Aç (telefon yeniden başlar).
8. **Sesli sohbeti dene** (en az 2 iPhone ya da 1 iPhone + 1 Android):
   - Uzaktan oda > **Sesli sohbete katıl** → mikrofon açıklaması → telefonun mikrofon izni.
   - Sabah tartışmasında sırası gelen kişide "Sıra sende · 30 sn" yazar ve sesi duyulur.
   - Süre bitince ya da **Sözümü bitir** deyince sıradakine geçilir.
   - **Mikrofon kapalı** yapan kişinin sırası atlanır.
   - **Ses filtresi** açılınca ses kalınlaşır; herkesin listesinde o kişinin yanında sarı **Filtre** işareti görünür.
   - Uygulamayı arka plana alan kişinin sırası atlanır (45 sn'den uzun kalırsa oyundan düşer).

Not: Kodda yaptığım değişiklikler kendi sürüme kendiliğinden gelmez; yeni sürüm için 6. adımı tekrarlaman gerekir.
