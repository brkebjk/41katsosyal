# Görev Test Rehberi – Web yönetim paneli (1. aşama) + "Moderatör" görünümü

## A. Supabase (her teslimatta)
1. Supabase > **SQL Editor** > **+ New query**.
2. `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas. Altta yeşil "Success" görmelisin.
3. Hesap doğrulamayı henüz kurmadıysan: önceki rehberdeki Adım 2 ve 3. Kısaca:
   - Edge Functions > **Secrets** > `IDENTITY_PEPPER`.
   - `verify-identity` işlevini yayınla. Verify JWT **kapalı** olmalı.
   - Uygulamada çıkan hata kodları: K1 = işlev yok, K2 = oturum, K3 = işlev hatası, K4 = internet, K5 = parola eksik, K6 = veritabanı güncel değil.

## B. Web paneli Cloudflare'de yayınla (bir kez)
1. https://dash.cloudflare.com adresinde ücretsiz hesap aç ya da giriş yap.
2. Sol menü: **Workers & Pages** > **Create** (Oluştur) > **Pages** sekmesi > **Connect to Git** (Import an existing Git repository).
3. GitHub hesabını bağla ve `brkebjk/41katsosyal` deposunu seç.
4. Ayarlar:
   - **Production branch:** `claude/kind-goodall-dy5z7y`
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory (Advanced / Gelişmiş):** `admin-web`
5. **Environment variables** bölümüne 3 değer ekle:
   - `VITE_SUPABASE_URL` → mobil uygulamadaki `.env` dosyasındaki `EXPO_PUBLIC_SUPABASE_URL` ile aynı
   - `VITE_SUPABASE_ANON_KEY` → `.env` dosyasındaki `EXPO_PUBLIC_SUPABASE_ANON_KEY` ile aynı
   - `NODE_VERSION` → `22`
   - Uygulamanın `.env` dosyasında `EXPO_PUBLIC_LOGIN_DOMAIN` varsa: `VITE_LOGIN_DOMAIN` adıyla aynı değeri de ekle.
6. **Save and Deploy**. Birkaç dakika sonra `https://....pages.dev` adresi verilir. Bu adres panelin adresidir; kimseyle paylaşma.
7. Sonraki teslimatlarda bir şey yapmana gerek yok: her gönderimde panel kendiliğinden güncellenir.

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
