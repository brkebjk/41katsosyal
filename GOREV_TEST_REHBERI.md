# Görev Test Rehberi – PeopleHere (3 şehir, göç, yeni logo, puan ve eşleşme)

## A. Supabase'i güncelle (sıra önemli)
1. **SQL Editor** > **+ New query** > `supabase/parcalar/1.sql` dosyasının tamamını yapıştır > **Run**.
2. Aynısını `2.sql`, `3.sql`, `4.sql` için yap. "Run and enable RLS" çıkarsa onu seç.
   - Bu adım üyelerin giriş adresini yeni alan adına (peoplehere.app) taşır. **Uygulamayı açmadan önce** yap, yoksa giriş yapılamaz.
3. Yeni sorguda şunu çalıştır: `truncate public.places;`
4. **Table Editor** > `places` tablosu > **Insert** > **Import data from CSV**. Şu üç dosyayı sırayla yükle:
   - `supabase/places_kocaeli.csv`
   - `supabase/places_istanbul.csv` (büyük dosya, biraz sürer)
   - `supabase/places_izmir.csv`
   Yükleme hata verirse bana ekran görüntüsünü at.

## B. Ad ve logo
- Uygulamanın adı **PeopleHere**. Simge, açılış ekranı ve giriş ekranında yeni logo var.
- Uygulamada "41. Kat" hiçbir yerde geçmez. "Özel" etiketleri artık **PeopleHere Özel**.
- Bir kez: tema seçimi ve izin tanıtımı yeniden sorulabilir (telefondaki ayar anahtarları yenilendi).

## C. Şehir seçimi ve ziyaret
1. Girişten sonra **Şehrini seç** ekranı çıkar (konum izni varsa şehrin önerilir).
2. Harita, akış ve etkinlikler seçtiğin şehre göre gelir.
3. Haritada üstteki şehir düğmesinden başka şehre **ziyaret** et:
   - "Ziyaretçisin" yazar,
   - akışta gönderi ve yorum yazılmaz, Etkinlikler'de etkinlik açılmaz.
   - Kendi şehrine dönmek için şehir düğmesinden şehrini seç (akışta **Şehrime dön** de var).
4. Haritada mahalle sınırları ve (yakınlaşınca) mahalle adları görünür. Üç şehirde petekler aynı boyda.
5. Yer aramasında yalnızca baktığın şehrin yerleri çıkar.

## D. Göç (Profil > Şehrim)
1. Gitmek istediğin şehri seç, kutuya **Göçü onaylıyorum** yaz > **Göç listesine yazıl**.
2. Ekranda "Göç listesindesin" ve geçiş tarihi (gelecek ay başı) yazar. **Göçten vazgeç** ile çıkabilirsin.
3. Moderatör hemen taşınır. Web panelde Üyeler > üye > **Şehri değiştir** ile bir üyeyi hemen taşıyabilirsin.

## E. Sıralama
- Sıralama ekranında **<Şehrin>** ve **Tüm İller** sekmeleri var. Kesinleşmiş sonuçlar da seçili sekmeye göre.

## F. Puan
- Yan yana oyun artık ×7 vermez. Her sıranın puanı yan yana ve uzaktan **aynı**.
- Yan yananın yalnızca aylık hedefi yüksek (1.750, uzaktan 250). Mekân bonusu (+%25) duruyor.

## G. Uzaktan eşleşme
1. **Uzaktan Eşleş**: açık ama başlamamış bir oda varsa hemen ona yerleşirsin.
2. Bulunamazsa ekranda geri sayım görünür; **45 sn** sonra senin için oda açılır, orada tek başına bekleyebilirsin.
3. Uzaktan odalarda "Oda sahibi" yazısı ve yıldızı yok. Herkes çıkınca oda kapanır.
4. Odada aynı lakaptan iki kişi varsa kutucukta rumuz kodla yazar (ör. Mavi Kuş#1234).

## H. Uygulamayı kapatıp açınca
- Yan yana bir oyundaysan odaya geri dönersin ve **Oyunda kal / Oyunu terk et** sorulur.
- Uzaktan oyundaysan eskisi gibi oyundan çıkarılırsın.

## I. Yazılanlar kaybolmasın
1. Etkinlik oluştur penceresine bir şeyler yaz, uygulamayı arka plana at, hatta tamamen kapat.
2. Etkinlikler sekmesine dönünce pencere yazdıklarınla açılır (görsel hariç).
3. Gönderi, yorum ve mesaj kutularında da yazılan metin kalır. Gönderince ya da etkinlik penceresini çarpıyla kapatınca silinir.

## J. Klan
- Klan sistemi tamamen kalktı (ekranlar, bonuslar, sıralama sekmesi).
