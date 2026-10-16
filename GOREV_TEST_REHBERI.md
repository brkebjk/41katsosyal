# Görev Test Rehberi – Toparlanma paketi

## A. Önce güncelle
1. Bilgisayarda `git pull origin claude/kind-goodall-dy5z7y`.
2. `cd app`, sonra `npm install` (yeni paket var: uzaktan güncelleme).
3. `npx expo start -c`.
4. Telefonda Expo Go'yu kapatıp aç.
5. SQL kendiliğinden uygulanır (GitHub > Actions, yaklaşık 3 dakika).

## B. Eğitim ve ipuçları (yeni hesapla)
1. Eğitim artık 7 adım: sekmeler, harita renkleri, harita düğmeleri, Akış, Etkinlikler, Oyunlar, Profil.
2. Eğitimden sonra bir sekmeyi ilk açışında altta küçük bir **ipucu kartı** çıkar ve anlatılan alanın çevresi çerçevelenir.
3. Kartta **Sonraki** ile sıradaki ipucuna geçilir, **Anladım** ile kart kapanır. Her sekmede bir kez çıkar.

## C. Boş ekranlar
1. Haritada şehirde etkinlik ve oyun yoksa altta **Şehrin şu an sessiz** kartı çıkar.
   - **Etkinlik aç** ile etkinlik penceresi açılır.
   - **Oyun başlat** ile Oyun sekmesi açılır.
   - Çarpı ile bu açılışta kapanır.
2. Akış boşsa "Şehrinde ilk sözü sen söyle" yazar ve **Etkinliklere göz at** düğmesi çıkar.
3. Etkinlik listesi boşsa **İlk etkinliği sen aç** düğmesi çıkar.

## D. Harita
1. Harita açılırken ve şehir değişince hafifçe büyüyerek belirir.
2. Hareketli petekler (2. ve 3. seviye) yavaşça parlar. Haritayı kaydırırken parlama durur.

## E. Tercihler
Profil > Tercihler > **Açılış sekmesi**: Harita, Akış ya da Etkinlik. Uygulama bir sonraki açılışta o sekmeyle açılır.

## F. Bildirim tercihleri
1. Profil > Bildirim ve konum ekranında yeni seçenekler var:
   - **Telefona anlık bildirim**,
   - **Mesajlar**,
   - **Ekip davetleri**.
2. Telefona giden bildirimde yalnızca genel bir cümle yazar ("Yeni bir arkadaşlık isteğin var" gibi). Kimin ne yazdığı gitmez.
3. Uzaktan bildirim, aşağıdaki H bölümündeki kurulumdan sonra çalışır.

## G. Web panel (moderatör)
1. **Sistem > Görünüm**:
   - **Kampanya şeridi:** Yazı, bağlantı, renk, şehir ve tarih seçilir. Harita ve Akış'ta ince şerit olarak görünür.
   - **Özel gün teması:** Hazır temalar (Yılbaşı, 23 Nisan, 29 Ekim…) ya da kendi renklerin. Üye bir sonraki açılışta görür.
   - **Şehir açılış görselleri:** Her şehre bir görsel yüklenir. Uygulama açılınca 2 saniye görünür, dokununca kapanır.
   - **Özellik aç/kapa:** Akış, etkinlik açma, yan yana ve uzaktan oyunlar, Bilgi Yarışması, mesajlar ve hazine güncelleme göndermeden kapatılır. Moderatörler kullanmaya devam eder.
2. **Sistem > Hatalar:** Uygulamada olan hatalar ve kaç kez olduğu listelenir. Kimin telefonunda olduğu bilinmez. Düzelen hatayı **Çözüldü** ile sil.

## H. Bir kez yapılacak kurulum (uzaktan güncelleme ve telefona bildirim)
1. https://expo.dev adresinde ücretsiz hesap aç ve **PeopleHere** adında bir proje oluştur.
2. Projenin **Project ID** değerini bana yaz. Gizli değil, uygulama ayarına ben eklerim.
3. expo.dev > Account settings > **Access tokens** > yeni anahtar oluştur. Bunu GitHub'a gizli anahtar olarak ekle (adı `EXPO_TOKEN`).
4. GitHub'a ayrıca şu iki gizli anahtarı ekle: `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Değerleri bilgisayarındaki `app/.env` dosyasında var.
5. Telefona yüklenecek gerçek uygulama derlemesi:
   - iPhone için Apple Developer hesabı gerekir (yıllık ücretli).
   - Android'de ücretsiz derlenip yüklenebilir.
   - Hazır olunca adım adım birlikte yaparız.
6. Anahtarları ve şifreleri sohbete yapıştırma.
