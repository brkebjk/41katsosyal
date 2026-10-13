# Görev Test Rehberi – Web yönetim paneli (1. aşama) + "Moderatör" görünümü

## A. Supabase (her teslimatta)
1. Supabase > **SQL Editor** > **+ New query**.
2. `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas. Altta yeşil "Success" görmelisin.
3. Hesap doğrulamayı henüz kurmadıysan: önceki rehberdeki Adım 2 ve 3. Kısaca:
   - Edge Functions > **Secrets** > `IDENTITY_PEPPER`.
   - `verify-identity` işlevini yayınla. Verify JWT **kapalı** olmalı.
   - Uygulamada çıkan hata kodları: K1 = işlev yok, K2 = oturum, K3 = işlev hatası, K4 = internet, K5 = parola eksik, K6 = veritabanı güncel değil.

## B. Web paneli Cloudflare'de yayınla (bir kez)

> Cloudflare'de birbirine benzeyen iki kurulum ekranı var: **Workers** ve **Pages**. Bize **Pages** lazım.
> Ekranda **"Deploy command"** diye bir kutu görürsen yanlış ekrandasın (Workers). Geri dön ve 3. adımdaki Pages bağlantısını kullan.

**1. Giriş**
- https://dash.cloudflare.com adresine gir (hesabın yoksa **Sign up** ile ücretsiz aç).

**2. Workers & Pages sayfası**
- Sol menüde **Compute (Workers)** ya da **Workers & Pages** yazan yere tıkla.
- Sağ üstteki mavi **Create** ya da **Create application** düğmesine bas.

**3. Pages'i seç**
- Açılan sayfada ya üstte **Workers | Pages** diye iki sekme olur ya da sayfanın en altında küçük bir yazı olur: **"Looking to deploy Pages? Get started"**.
- **Pages** sekmesine ya da **Get started** yazısına tıkla.
- Sonra **Import an existing Git repository** (Var olan Git deposunu içe aktar) altındaki **Get started** düğmesine bas.

**4. GitHub'ı bağla**
- **Connect GitHub** düğmesine bas.
- GitHub sayfası açılır: **Only select repositories** seç, listeden `41katsosyal` deposunu seç, **Install & Authorize** düğmesine bas.
- Cloudflare'e dönünce depo listesinde `41katsosyal`'ı seç ve **Begin setup** düğmesine bas.

**5. "Set up builds and deployments" sayfası** (kutuları şöyle doldur)

| Ekrandaki kutunun adı | Ne yazacaksın / ne seçeceksin |
|---|---|
| **Project name** | `kat41-panel` (adres bu ad olur: kat41-panel.pages.dev) |
| **Production branch** | Açılır listeden **`claude/kind-goodall-dy5z7y`** seç. `main` **seçme**: panel kodu henüz orada değil. |
| **Framework preset** | **None** |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory (advanced)** | Bu yazıya tıkla, açılan **Path** kutusuna `admin-web` yaz |
| **Environment variables (advanced)** | Bu yazıya tıkla. Aşağıdaki 3 satırı **+ Add variable** ile tek tek ekle |

Environment variables bölümü (her satırda solda **Variable name**, sağda **Value** kutusu vardır):

| Variable name (sol kutu) | Value (sağ kutu) |
|---|---|
| `VITE_SUPABASE_URL` | Bilgisayarındaki `app/.env` dosyasında `EXPO_PUBLIC_SUPABASE_URL=` yazan satırın **eşittirden sonraki** kısmı (https://... ile başlar) |
| `VITE_SUPABASE_ANON_KEY` | Aynı dosyada `EXPO_PUBLIC_SUPABASE_ANON_KEY=` satırının eşittirden sonraki kısmı (uzun bir anahtar) |
| `NODE_VERSION` | `22` |

> `app/.env` dosyasında `EXPO_PUBLIC_LOGIN_DOMAIN=` diye dolu bir satır varsa 4. değişkeni de ekle: `VITE_LOGIN_DOMAIN` = o satırın değeri. Yoksa ekleme.

**6. Yayınla**
- **Save and Deploy** düğmesine bas ve 1–3 dakika bekle.
- Bitince **Success** ve `https://kat41-panel.pages.dev` gibi bir adres görünür. Panelin adresi budur.
- Bu adresi tarayıcıda yer imlerine ekle, kimseyle paylaşma.

**Hata çıkarsa**
- Build sırasında kırmızı hata çıkarsa sayfadaki **View build log** / **Build log** ekranının fotoğrafını bana gönder.
- Panel açılıyor ama "Sunucu adresi girilmemiş" yazıyorsa 5. adımdaki değişkenlerden biri eksik ya da yanlış yazılmış:
  1. Projeye gir > **Settings** > **Environment variables** (ya da **Variables and Secrets**) bölümünden düzelt.
  2. **Deployments** sekmesine geç, en üstteki yayının yanındaki **⋯** > **Retry deployment** ile yeniden yayınla.

Sonraki teslimatlarda bir şey yapmana gerek yok: her gönderimde panel kendiliğinden güncellenir.

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
