# Görev Test Rehberi – Gün/ay/yıl ile kimlik doğrulama, harita, çevrimiçi üyeler, doğrulama uyarıları ve profil resmi

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.
- Web panel Cloudflare'de kendiliğinden güncellenir (2–3 dakika).

**Kimlik doğrulama işlevini güncelle (yeni)**
- Supabase > **Edge Functions** > `verify-identity` > **Code**.
- Editördeki kodu tamamen sil.
- Bilgisayarındaki `supabase/functions/verify-identity/index.ts` dosyasının tamamını yapıştır > **Deploy**.
- Ayarlara ve gizli değerlere (IDENTITY_PEPPER) dokunma.

## Kimlik doğrulama (gün / ay / yıl)
1. Profil > adının yanındaki **Doğrula**.
2. Pencerede doğum tarihi için **Gün**, **Ay**, **Yıl** kutuları olmalı. Hepsini kimliğindeki gibi doldur ve TC'ni yaz > **Doğrula**.
3. Beklenen sonuçlar:
   - Doğruysa: "Hesabın doğrulandı"; adın "E.Berke Taş" biçiminde olur.
   - Gün ya da ay yanlışsa: "…doğum günü ya da ayı uyuşmadı (N-D)".
   - Başka bir bilgi yanlışsa: "Bilgiler nüfus kaydıyla uyuşmadı".
   - "ulaşılamıyor (N-…)" yazarsa: NVİ cevap vermedi; deneme hakkından sayılmaz. Parantez içindeki kodu bana yaz.
4. 31 Şubat gibi olmayan bir tarih yazarsan sunucuya hiç gitmeden uyarı çıkmalı.

## B. Harita
1. Bir peteğe dokun: menü açılır. Menüyü kapat: **aynı petek seçili kalmalı** (yukarı kalkık).
2. Seçili peteğe tekrar dokun: menü yeniden açılmalı.
3. **?** bilgi düğmesi: ilk maddedeki simge kare değil **petek** olmalı. Yoğunluk renkleri de petek şeklinde olmalı.
4. Akış, petek seçici, rumuz ve moderatör ekranlarındaki kare simgeler de petek olmalı.
5. Sarı "Buradasın: …" yazısı eskisinden küçük olmalı.

## C. Çevrimiçi üyeler (moderatör)
1. İkinci bir telefonla (ya da bir arkadaşınla) uygulamaya gir; 1–2 dakika açık kalsın.
2. **Telefonda:** Moderatör paneli > **Üyeler**.
   - En üstte "Şu an çevrimiçi: N" yazmalı.
   - Açık olan üyenin yanında **yeşil**, diğerlerinde **kırmızı** nokta olmalı.
   - **Çevrimiçi** süzgeci yalnızca yeşil noktalı üyeleri göstermeli.
3. **Webde:** Panel > Üyeler: aynı sayı, aynı noktalar, "Çevrimiçi" süzgeci ve "Şimdi yenile" olmalı. Üyeye tıklayınca "Son görülme" yazmalı.
4. Uygulamayı kapatan üye en geç 10 dakika sonra kırmızıya dönmeli (liste 10 dakikada bir kendiliğinden yenilenir).

## D. Doğrulama uyarıları (hesabı doğrulanmamış bir hesapla)
1. **Kayıt ekranı:** "Sıralama ödülleri yalnızca hesabını doğrulamış üyelere verilir" kutusu görünmeli.
2. **Akış:** sekmeye gir → "Hesabını doğrula" penceresi açılmalı.
   - "Sonra" de. Aynı gün akışa tekrar gir: pencere **çıkmamalı**. Ertesi gün ilk girişte yine çıkmalı.
   - "Bunu bir daha gösterme" anahtarını açıp kapat: bir daha hiç çıkmamalı.
   - "Hesabımı doğrula": Profil açılmalı ve doğrulama penceresi gelmeli.
3. **Sıralama notu:** "Hesabını doğrulamayan üyeler sıralamada yer alır ama ödül alamaz" yazısı şuralarda görünmeli:
   - Oyunlar sekmesi > Aylık Ödül Podyumu
   - Sıralama ekranı
   - Ödüller ekranı
   - Bilgi Yarışması sıralama kartı
   Yanındaki "Hesabını doğrula" bağlantısı doğrulama penceresini açmalı.
4. **Kurallar ve Bilgi Yarışması puan tablosu:** aynı kural yazılı olmalı.

## E. Profilim
1. **Doğrula düğmesi:** avatarın üstünde değil, avatarın altındaki adının sağında olmalı.
   - Doğrulanmamışsa "Doğrula" yazar; doğrulanmışsa sarı tik çıkar.
2. **Ödül kutusu:** doğrulanmamış hesapta başarımların üstünde "Hesabını doğrula, ödülleri kaçırma." kutusu olmalı. Dokununca doğrulama açılmalı.
3. **+ düğmesi:** avatarın sağ altında olmalı.
   - Doğrulanmamış hesap: "Önce hesabını doğrula" penceresi açılmalı.
   - Doğrulanmış hesap: resim seç → "kontrol ediliyor" yazmalı.
4. **Haftalık sınır:** aynı hafta tekrar + düğmesine bas.
   - "Bu hafta profil resmini değiştirdin…" uyarısı çıkmalı, "Resim seç" düğmesi olmamalı.
   - Resmi kaldırıp yeniden eklemek de aynı hafta olmaz.
5. **Reddedilen resim:** moderatör reddederse resim profilden kalkmalı ve üye hemen yeni resim ekleyebilmeli.
6. **Eski resimler silinir:** Supabase > **Storage** > `profile-photos` > üyenin klasöründe yalnızca güncel resim olmalı.
   - Reddedilen resmin dosyası silinmeli.
   - Webden doğrulama kaldırılınca üyenin resim dosyaları da silinmeli.

## F. Ödül kuralı (sunucu)
- **Bilgi Yarışması Solo / Hafta:** fazladan can yalnızca doğrulanmış ilk 3'e verilir. Doğrulanmamış biri ilk 3'teyse atlanır; can sıradaki doğrulanmış üyeye geçer.
- **Çoklu / Ay:** moderatörün "Çoklu / Ay sıralama ödülleri" listesinde yalnızca doğrulanmış üyeler görünür.
- **Aylık genel hediye:** moderatör kazananı belirlerken üyenin sarı tiki olup olmadığına bakmalı (Panel > Üyeler).
