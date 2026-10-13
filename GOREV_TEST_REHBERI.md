# Görev Test Rehberi – Paket: Hesap doğrulama (NVİ), profil resmi, sarı tik

## Kurulum (bir kez)
1. **SQL:** Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas.
2. **Gizli değer:** Supabase > Edge Functions > **Secrets** > Add new secret.
   - Ad: `IDENTITY_PEPPER`
   - Değer: en az 32 karakterlik uzun, rastgele bir parola. Bunu bir yere not et ve **asla değiştirme**.
3. **İşlevi yayınla:** Supabase > Edge Functions > **Deploy a new function** > Via Editor.
   - Ad: `verify-identity`
   - İçerik: `supabase/functions/verify-identity/index.ts` dosyasının tamamını yapıştır.
   - **Verify JWT** açık kalsın. Sonra Deploy'a bas.
4. Bilgisayarda `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile aç.

## 1. Hesap doğrulama
1. Profil'e gir. Avatarın sol üstünde sarı kalkan simgeli yuvarlak bir düğme olmalı. Bas.
2. "Hesabını doğrula" penceresi açılmalı: Ad, Soyad, Doğum yılı, TC kimlik numarası. TC kutusu yazılırken gizli görünmeli.
3. Bilerek yanlış bir doğum yılı yaz: "Bilgiler nüfus kaydıyla uyuşmadı" yazmalı.
4. Kendi gerçek bilgilerini yaz (varsa ikinci adınla) ve "Doğrula"ya bas:
   - "Hesabın doğrulandı" penceresi çıkmalı.
   - Avatarın sol üstündeki düğme sarı tik olmalı.
   - Profildeki gerçek adın nüfustaki adın olmalı ve yanında sarı tik görünmeli.
   - Bildirim kutusuna "Hesabın doğrulandı" düşmeli.
5. Hesabım > "Gerçek adını değiştir": "Doğrulanmış hesabın adı nüfustaki addır; değiştirilemez" yazmalı.
6. Aynı TC numarasıyla başka bir hesabı doğrulamayı dene: "başka bir hesap doğrulanmış" yazmalı.
7. Günde 5 denemeden sonra "Bugün çok fazla deneme yaptın" yazmalı.

> "Nüfus kayıt servisine şu an ulaşılamıyor" yazarsa NVİ servisi Supabase sunucusundan gelen isteği kabul etmiyor olabilir. Bana haber ver.

## 2. Akışta sarı tik
1. Doğrulanmış hesapla akışa bir gönderi yaz.
2. Başka bir hesapta bu gönderinin rumuzunun hemen yanında sarı tik görünmeli.
3. Yazan hem abone hem doğrulanmışsa sarı tik, abone rozetinin **önünde** olmalı.

## 3. Profil resmi
1. Doğrulanmış hesapla Profil'de avatara dokun > "Resim seç" > galeriden bir resim seç.
   - 2 MB'tan büyük resim kabul edilmemeli.
   - Avatarında resmin görünmeli; altında "moderatör onayı bekliyor" yazmalı.
2. Moderatör hesabı > Moderatör paneli > **Onaylar**: en üstte "Profil resimleri" altında resim ve ad görünmeli. "Onayla"ya bas.
3. Bu kişiyle **arkadaş olan** bir hesapta resim şu yerlerde avatarın yerine görünmeli:
   - akıştaki gönderisi ve yorumu,
   - arkadaş listesi,
   - mesaj kutusu.
4. Arkadaşı **olmayan** bir hesapta aynı gönderide resim **görünmemeli**; normal avatar görünmeli. Rumuz profilinde ve Oyun arayanlar listesinde de görünmemeli.
5. Doğrulanmamış hesapta avatara dokununca hiçbir şey olmamalı.
6. "Reddet" denenirse üyeye "Profil resmin onaylanmadı" bildirimi gelmeli ve profilinde kırmızı yazı çıkmalı.

## 4. Petek menüsü
Haritada bu hafta gönderi olan bir peteğe dokun. Soldaki kutuda "Son gönderi X dk önce" yazısı küçülmüş ve **tam okunur** olmalı, sonunda "…" olmamalı.
