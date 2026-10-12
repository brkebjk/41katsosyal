# Görev Test Rehberi – Paket: Güvenlik ve Düzeltmeler 1

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas.
> Sonra bilgisayarında `app` klasöründe `npm install` çalıştır ve Expo Go ile uygulamayı aç.

## 1. Seviye adları
1. Profil sekmesini aç. Puanının yanında seviye adın görünür.
2. Yeni adlar şunlar olmalı: **Yeni Komşu → Mahalle Dostu → Sokak Kâşifi → Meydan Müdavimi → Şehrin Yıldızı**.
3. Oyun sekmesinden Sıralama'yı aç; isimlerin altındaki seviye adları da yeni adlarla görünmeli.

## 2. Haritadaki etkinlik görselleri
1. Konser & Festival kategorisinde, görselli bir etkinlik aç (ya da var olanı kullan). Görsel moderatör onayı bekliyorken haritada **görünmemeli**.
2. Moderatör hesabıyla Moderatör paneli > Onaylar'dan görseli onayla. Haritada etkinliğin peteğinin üstünde görsel kartı **görünmeli**.
3. "Sosyal" gibi başka bir kategoride görselli bir etkinlik aç ve görselini onayla. Haritada (petek kartında ve peteğe dokununca açılan listede) **görsel görünmemeli**. Etkinlikler sekmesinde ise görünmeye devam etmeli.
4. Moderatörün açtığı 41. Kat Özel etkinliğin görseli haritada görünmeli.

## 3. Bilgi metinleri
1. Oyun > Bilgi Yarışması'nın bilgi (i) penceresinde "Günde en çok **25** oyun" yazmalı.
2. Aynı pencerede Yan Yana için "**3 raunt × 3 soru (toplam 9 soru)**" yazmalı.
3. Bilgi Yarışması'nda Puan penceresinde "Günde en çok oyun: 25" görünmeli.
4. Etkinlik aç formunda Zaman alanının açıklamasında "Konser & Festival 2 saat sonra" ibaresi olmalı.
5. Etkinlikler sekmesindeki bilgi penceresinde Konser & Festival için "kod girişi başlangıçtan 45 dakika sonra kapanır" yazmalı.
6. Kod girişi süresi geçmiş bir etkinliğe kod girmeye çalışınca çıkan uyarı, Konser (45 dakika) ve diğer etkinlikler (3 saat) için doğru bilgiyi vermeli.

## 4. Anlık bildirim (sunucu yükü azaltıldı)
1. İki telefonla (ya da iki hesapla) giriş yap; ikisi de uygulama açıkta dursun.
2. Birinci hesaptan ikinciye arkadaşlık isteği gönder. İkinci telefonda üstten kayan bildirim **1–2 saniye içinde** çıkmalı.
3. Birinci hesapla yan yana oyun odası aç ve ikinci hesabı (oyun davetleri açıksa) davet et. Davet bildirimi anında gelmeli.
4. Moderatör hesabından bir duyuru gönder; diğer telefonda anında görünmeli.

## 5. Hukuki metinler
1. Profil > Uygulama bölümünden (ya da kayıt ekranındaki bağlantılardan) **Kullanıcı sözleşmesi**, **Açık rıza metni** ve **KVKK aydınlatma metni**'ni aç.
2. Bölüm başlıkları sarı renkte, maddeler mor nokta ile görünmeli.
3. Köşeli parantezli alanları ([VERİ SORUMLUSUNUN ADI] gibi) avukatla birlikte doldurman gerekiyor: Supabase > Table Editor > `app_settings` tablosunda `legal_terms`, `legal_consent` ve `legal_kvkk` satırları.

## 6. Her telefondan 1 hesap (Android)
Bu kural mağaza sürümünde tam olarak çalışır; Expo Go'da da test edilebilir:
1. Android telefonda bir hesap aç, çıkış yap.
2. Expo Go'nun verilerini sil ya da Expo Go'yu kaldırıp yeniden kur, sonra yeni bir hesap açmayı dene.
3. "Bu telefondan daha önce bir hesap açılmış" uyarısı çıkmalı.
Not: Bu telefonda daha önce eski yöntemle hesap açtıysan, yeni yöntemle bir kez daha hesap açılabilir. Bu yalnızca bir kez olur. Deneme için kuralı geçici olarak kapatmak istersen `app_settings` tablosundaki `signup_one_per_device` değerini `false` yap; yayından önce `true`'ya geri almayı unutma.
