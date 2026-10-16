# Görev Test Rehberi – Yeni eğitim, admin her şehirde, yollar, açılış görünümleri

## A. Supabase artık kendiliğinden güncellenir (bir kez kurulum)
1. Supabase > projen > üstte **Connect** > **Session pooler** sekmesi > **URI** satırını kopyala.
2. İçindeki `[YOUR-PASSWORD]` yerine veritabanı şifreni yaz. Şifrende `@ # / ? %` gibi işaretler varsa önce **Project Settings > Database > Reset database password** ile yalnızca harf ve rakamdan oluşan yeni bir şifre al.
3. GitHub > `41katsosyal` reposu > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
   - Name: `SUPABASE_DB_URL`
   - Secret: 2. adımdaki adres
4. Repo > **Actions** sekmesi > **Supabase şemasını uygula** > kırmızı çalıştırmayı aç > **Re-run all jobs**. Yeşil olursa kurulum bitti.
5. Bundan sonra her teslimde SQL kendiliğinden uygulanır. 1-4 parçalarını çalıştırmana gerek yok. Kırmızı görürsen bana söyle.
6. Şifreyi ya da adresi sohbete yapıştırma.

## B. Uygulama eğitimi (yeni hesapla ya da eğitimi görmemiş hesapla)
1. İzinler ve şehir seçiminden sonra eğitim kendiliğinden başlar. Sekmelere dokunman gerekmez, sekmeler kendisi açılır.
2. Her adımda yalnızca anlatılan alan açık kalır, geri kalan her yer kararır. Alanın açıklaması yazar.
3. **Devam** ile sıradaki alan gelir (16 adım: sekmeler, Akış, Etkinlik, Harita, Oyun, Profil).
4. Sağ alttaki küçük **Geç**: eğitim biter, yalnızca hoş geldin ekranı açılır.
5. Hoş geldin ekranında **Yarışma kuralları**, **Ödül programı** ve **Başla** var.

## C. Admin (moderatör) hesabı
1. Başka şehri ziyaret et: kısıt yok. Petek menüsünün tamamı açılır.
2. Akış ve Etkinlikler baktığın şehrin içeriğini gösterir. Oraya gönderi yazabilir, etkinlik açabilirsin.
3. Üye hesabında değişiklik yok: ziyarette yalnızca harita görünür.

## D. Harita
1. Kaydırmayı bırakınca yollar 1 saniye sonra görünür.
2. Ziyaret görünümleri:
   - İstanbul: Marmara'dan Karadeniz'e bütün Boğaz hattı,
   - İzmir: Karşıyaka ve altındaki ilçeler (Bayraklı, Bornova, Konak, Karabağlar, Balçova, Buca),
   - Kocaeli: Derince ve körfez.
