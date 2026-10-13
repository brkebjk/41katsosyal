# Görev Test Rehberi – Paket: Profil 4 (Sorun Bildir, Kişisel Veriler, Davet, Tema)

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas.
> Sonra bilgisayarında `app` klasöründe **`npm install`** çalıştır (yeni paketler eklendi), ardından `npx expo start -c` ile Expo Go'da aç.
> İsteğe bağlı: Supabase > Table Editor > `app_settings` tablosunda `website_url` (web siten) ve `app_download_url` (mağaza bağlantısı) değerlerini doldur.

## 1. Profil düzeni
1. Profil'de **Bildirim ve konum** artık Arkadaşlarım'ın hemen altında, tek başına durmalı.
2. Hesabım çekmecesinin altında **Kişisel Verilerim & Rapor** satırı ve sarı çerçeveli **Bir Sorun Bildir** düğmesi olmalı.
3. Uygulama çekmecesinde **Gizlilik politikası** ve **Sıkça sorulan sorular (SSS)** olmalı; dokununca metinler açılmalı.
4. Uygulama çekmecesinin altında her zaman açık **Tercihler** kutusu olmalı: Tema, Dil, Uygulamayı değerlendir, Arkadaşlarını davet et.
5. En altta, Çıkış'ın altında **Web sitesi** ve **Sürüm bilgisi** düğmeleri olmalı. Sürüm bilgisine dokun: logo ve altında küçük sürüm yazısı açılmalı.

## 2. Bir Sorun Bildir
1. Düğmeye dokun; ortada **Sorun Bildir** penceresi açılmalı.
2. Bir sorun türü seçmeden gönder: uyarı çıkmalı. Tür seç, kısa (10 karakterden az) mesajla gönder: uyarı çıkmalı.
3. Ad soyad hazır gelmeli. Yanlış bir e-posta yaz (ör. `abc`): "E-posta geçersiz" uyarısı çıkmalı.
4. Düzgün doldurup gönder: "Bildirimin alındı" çıkmalı.
5. Moderatör hesabıyla: bildirim gelmeli; Moderatör paneli > **Sorunlar** sekmesinde bildirim görünmeli; e-posta/telefona dokununca e-posta/arama açılmalı; **Kapat** ile "Kapatılan" listesine geçmeli.

## 3. Kişisel Verilerim & Rapor
1. Kullanıcı kimliği (UUID) ve kayıt tarihi görünmeli; UUID'ye dokununca kopyalanmalı.
2. **Açık rızalar**: iki anahtar açık gelmeli. Birini kapat: onay sorulmalı, kapandıktan sonra ekrana tekrar girince kapalı kalmalı.
   - "Haritadaki anonim yoğunluğa sayılmak" kapalıyken haritada petek bildirimi yap: yoğunluğa sayılmamalı.
3. **Kabul edilen sözleşmeler**: 4 metin listelenmeli, dokununca açılmalı.
4. **Reddet ve hesabımı silmeye git**: başka yolu olmadığını anlatan uyarı, sonra hesap silme penceresi açılmalı (silmeden vazgeç).
5. **Resmi Veri Dosyasını İndir (.JSON)**: telefonun paylaş/kaydet penceresi açılmalı; dosyayı kaydedip açınca hesabın, gönderilerin, puan geçmişin vb. görünmeli.

## 4. Arkadaşlarını davet et
1. Ekranın en üstünde davet puanı ve ilerleme çubuğu, altında **değiştirilemeyen davet kodun** olmalı (dokununca kopyalanır).
2. **Bağlantı olarak paylaş**: paylaşım penceresi kod (ve doldurduysan indirme bağlantısı) ile açılmalı.
3. **Rehberden davet et**: rehber izni istenmeli, kişi seçince SMS uygulaması hazır mesajla açılmalı.
4. Davet testi (2 telefon ya da 2 hesap):
   - Yeni hesap açarken kayıt ekranındaki **Davet kodu** alanına kodunu yaz.
   - Yeni hesap 100 puana ulaşınca (deneme için Supabase > `point_events` tablosuna o kişiye 100 puanlık bir satır ekleyebilirsin), seni davet edene "Davet puanı kazandın" bildirimi gelmeli; davet puanı 1 artmalı.
   - Kodu kayıtta yazmayı unutan, kayıttan sonraki 7 gün içinde davet ekranındaki "Seni biri davet etti mi?" kutusundan girebilmeli.
5. **Mağaza** (her öğe bir kez): Elçi unvanı 1, petek adı hakkı 2, 1 aylık abonelik 3 davet puanı.
   - Puanın yetmiyorsa "Satın al" soluk olmalı.
   - **Elçi** al: Profil'de unvanlar arasında "Elçi · Davet ödülü · kalıcı" görünmeli; arkadaşlarının listesinde adının yanında da çıkmalı.
   - **Petek adı** al, **Kullan**'a bas: harita açılır, özel adı olmayan bir petek seç, yeni adı yaz, Onayla, "Emin misin?", Eminim. Haritada o peteğin adı değişmeli. Uygunsuz kelime ya da "41 kat" içeren ad reddedilmeli.
   - **1 aylık abonelik** al: Profil'de abone görünmeli.

## 5. Tema
1. Tercihler > Tema > **Açık**: "Şimdi yeniden başlat" de. Uygulama hatasız yeniden açılmalı ve açık renklerle gelmeli (kartlar beyaz, yazılar koyu, sarı vurgular koyu kehribar). Daha önce hata aldıysan Expo Go'yu tamamen kapatıp projeyi yeniden aç; tema tercihin kayıtlı kalır.
2. Harita ve oyun ekranları açık temada da okunur olmalı (harita koyu kalır, üstündeki kartlar açık renk olur).
3. **Sistem**'i seç: telefonun karanlık/aydınlık moduna göre açılmalı. **Koyu** ile eski görünüme dönmeli.
4. Dil: TR seçili, **EN "Yakında"** yazmalı.

## 6. Akışta abone rozeti
Abone bir hesapla gönderi paylaş: akışta gönderinin rumuzunun yanındaki saatin hemen yanında küçük abone rozeti görünmeli. Abone olmayanlarda görünmemeli.
