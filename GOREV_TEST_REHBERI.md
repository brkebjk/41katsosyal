# Görev Test Rehberi – Paket: Düzeltmeler (Profil 4 sonrası)

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas (Kişisel Verilerim hatası için gerekli).
> Sonra bilgisayarında `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile uygulamayı aç.

## 1. Kişisel Verilerim & Rapor
1. Profil > Kişisel Verilerim & Rapor'u aç. Kırmızı "read-only transaction" hatası **çıkmamalı**.
2. Kullanıcı kimliği (UUID) ve kayıt tarihi görünmeli.
3. "Resmi Veri Dosyasını İndir" de çalışmalı (paylaş / kaydet penceresi açılmalı).
4. Moderatör hesabıyla Moderatör paneli > Sorunlar sekmesi de hatasız açılmalı.

## 2. Puan penceresi
Profil'de puana dokun. Her seviye satırında seviye adı üstte, sarı küçük ödül yazısı **adın altında** olmalı; yazılar üst üste binmemeli.

## 3. Akış başlığı
1. Logonun arkasında yumuşak, köşesiz turkuaz bir ışık olmalı (açık temada daha hafif).
2. Düğme sırası: solda **Süzgeç, Kurallar**; sağda **Mesajlar, Arkadaşlar**. Logo tam ortada kalmalı.

## 4. Ekran açık kalma
1. Uygulamayı açık bırak, ekrana dokunma. Telefonun kendi ekran kapanma süresi geçse de ekran **kapanmamalı**.
2. 2 dakika dokunmayınca ekran yavaşça kararmalı. Bir kez dokun: ekran aydınlanmalı ve bu dokunuş hiçbir düğmeye basmamalı.
3. Yazı yazarken (klavye açıkken) ekran kararmamalı.

## 5. Sekme başlıkları
Etkinlikler, Oyunlar, Profil başlıklarının arkasındaki ışık başlığın tam arkasında, yumuşak ve köşesiz olmalı; kayık ya da kırpık görünmemeli.

## 6. Harita
1. Tercihler'den Açık temaya geç: harita zemini (kara ve deniz) açık renk olmalı; etkinlik, oyun, yoğunluk renkleri ve ilçe adları okunmalı.
2. Haritada en çok yakınlaştır: petek adları yalnızca ekranda görünen peteklerde çıkmalı. Ortadakiler tam okunmalı, kenara doğru saydamlaşmalı. Kaydırırken eskisinden akıcı olmalı.

## 7. Yüzen düğmeler (Oyunlar ve Etkinlikler)
1. Altta yalnızca ortada yuvarlak bir **+** düğmesi görünmeli; Katıl / Oluştur düğmeleri gizli olmalı.
2. **+**'ya bas: düğmeler canlanarak görünmeli, + işareti **−**'ye dönmeli.
3. **−**'ye bas: düğmeler aynı şekilde kaybolmalı. Gizliyken o alana dokunmak hiçbir şeye basmamalı.

## 8. Harita sekme simgesi
Alttaki sekme çubuğunda Harita simgesi küçük peteklerden oluşan bir küme olmalı. Seçiliyken içi dolu, değilken çizgili görünmeli.
