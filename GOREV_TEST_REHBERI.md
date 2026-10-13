# Görev Test Rehberi – Kimlik doğrulama: NVİ bağlantı teşhisi

## A. Güncelle (iki şey)
1. **Veritabanı:** Supabase > **SQL Editor** > **+ New query** > `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**. Yeşil "Success" görmelisin.
2. **İşlev:**
   - Supabase > **Edge Functions** > `verify-identity` > **Code** sekmesine gir.
   - İçindeki kodun **tamamını sil**.
   - Bilgisayarındaki `supabase/functions/verify-identity/index.ts` dosyasının tamamını yapıştır.
   - **Deploy** düğmesine bas. Verify JWT kapalı kalsın.

## B. Telefonda tekrar dene
1. Bilgisayarda `app` klasöründe `npx expo start -c` çalıştır ve Expo Go ile aç.
2. Profil > avatarın yanındaki kalkan > bilgilerini yaz > **Doğrula**.
3. Yine "Nüfus kayıt servisine ulaşılamıyor" çıkarsa artık sonunda bir kod olacak (ör. **N-H403**). Bu kodu bana yaz.
   - Bu hata artık günlük 5 deneme hakkından **sayılmaz**.
4. Ayrıca şu ekranın fotoğrafını gönder:
   - Supabase > **Edge Functions** > `verify-identity` > **Logs** sekmesi.
   - Kırmızı "NVİ ..." satırı, NVİ'nin neden reddettiğini yazar.
   - Bu satırlarda TC numarası yer almaz; içinde 11 haneli bir sayı geçerse *** ile gizlenir.

| Kod | Anlamı |
|---|---|
| N-H403 (ya da H4xx) | NVİ, Supabase'in sunucusundan gelen isteği reddediyor (yurt dışı engeli olabilir) |
| N-H5xx | NVİ servisinin kendisinde arıza var; daha sonra tekrar dene |
| N-T | NVİ 15 saniyede cevap vermedi |
| N-C | Bağlantı kurulamadı (ağ ya da sertifika sorunu) |
| N-P | NVİ cevap verdi ama cevap beklenen biçimde değil |

## Web panel açılmıyorsa
Panel artık boş beyaz sayfa göstermez; sorun neyse ekrana yazar. Önce Cloudflare'in yeni sürümü yayınlamasını bekle (2–3 dakika), sonra sırayla şunlara bak:

1. **Cloudflare > Workers & Pages > projen (kat41-panel) > Deployments** sekmesi. En üstteki satırın durumu ne?
   - **Failed / Başarısız:** satıra tıkla, **View details / Build log** ekranının fotoğrafını gönder.
   - **In progress / Building:** bitmesini bekle.
   - **Success:** 2. adıma geç.
2. Satırdaki adrese tıkla (…pages.dev). Ekranda ne yazıyor?
   - **"Sunucu adresi ya da anahtarı girilmemiş"** ya da **"VITE_SUPABASE_URL değeri geçersiz"**:
     1. **Settings** > **Variables and Secrets** (ya da Environment variables) bölümünde değerleri düzelt.
     2. Adres `https://xxxx.supabase.co` biçiminde olmalı; sonunda / olmamalı.
     3. Sonra **Deployments** > en üstteki satırın **⋯** menüsü > **Retry deployment**.
   - **"Panel açılırken hata oluştu"** ya da **"Panel açılamadı"**: ekranın fotoğrafını gönder.
   - **Tarayıcı "Bu siteye ulaşılamıyor" diyorsa:** proje yeni kurulduysa adresin açılması 5–10 dakika sürebilir; bekleyip yenile.
   - **Giriş ekranı geldiyse** panel çalışıyor demektir: moderatör hesabının kullanıcı adı ve şifresiyle gir.

## C. Panel testi
1. Panel adresini bilgisayarda aç. Moderatör hesabının **uygulamadaki kullanıcı adı ve şifresiyle** gir.
   - Moderatör olmayan bir hesapla girmeyi dene: "Bu hesap moderatör değil" yazmalı ve içeri alınmamalı.
2. Girdikten sonra telefondaki moderatör hesabı **açık kalmalı** (çıkış yaptırılmamalı).
3. **Özet**: açık şikayet, onay bekleyen, sorun bildirimi sayıları görünmeli.
4. **Şikayetler**:
   - Bir şikayette Gizle / Yeniden göster çalışmalı.
   - "Yazarı göster" üyenin sayfasını açmalı ve bu işlem İşlem günlüğüne yazılmalı.
   - Haklı / Haksız ile şikayet kapanmalı.
5. **Üyeler**:
   - Ad ya da rumuzla ara. Doğrulanmış üyelerin yanında ✔ görünmeli.
   - Bir üyeye sırayla dene: sustur ve susturmayı kaldır, abonelik ver ve kaldır, puan ver, mesaj gönder.
   - Mesaj üyenin telefonuna "Moderatör" adıyla gelmeli.
   - Doğrulanmış bir üyede **Doğrulamayı kaldır**:
     - Telefonda sarı tik kalkmalı ve ad eski haline dönmeli.
     - Üyeye bildirim gelmeli.
     - Üye avatarın yanındaki kalkanla yeniden doğrulayabilmeli.
6. **Onaylar**:
   - Kontroldeki profil resimleri görünmeli; Onayla ya da Reddet çalışmalı.
   - Onay bekleyen etkinlik ve etkinlik görselleri görünmeli.
7. **Sorun bildirimleri**: açık bildirimler görünmeli ve Kapat ile kapanmalı.
8. **İşlem günlüğü**: yaptığın işlemler moderatörün **gerçek adıyla** listelenmeli.
9. **Çıkış yap**: panelden çıkınca telefondaki oturum yine açık kalmalı.

## D. "Moderatör" görünümü (telefonda)
1. Moderatör hesabının adı her yerde **Moderatör** görünmeli: profil, gönderi, yorum, etkinlik yorumu, oyunlar.
2. Moderatörün akıştaki gönderi ve yorumlarında adın yanında **kırmızı kalkan** simgesi olmalı.
3. Moderatör rumuz kodunu (#41) seçtiyse rumuzu **Moderatör#41** olmalı ve akışta `@#41` ile etiketlenebilmeli.
4. Üyeye giden moderatör mesajları ve bildirimleri "Kat Görevlisi" değil **Moderatör** yazmalı.
5. Normal bir üye adını "Moderatör" yapmayı denerse kabul edilmemeli.
