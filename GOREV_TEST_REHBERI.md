# Görev Test Rehberi – Büyük düzeltme paketi (parça parça gelir)

## A. Güncelle
1. `git pull origin claude/kind-goodall-dy5z7y`
2. `cd app`, sonra `npx expo start -c --tunnel`
3. SQL kendiliğinden uygulanır (GitHub > Actions > "Supabase şemasını uygula" yeşil olunca, ~3 dk).

## B. Köpekbalığı Kafesi ve Vampir–Köylü: süre, gecikme, bas-konuş
1. Uzaktan oyunda (mümkünse kalabalık, deneme botlarıyla 16 kişi) süre sayacı saniye saniye akmalı; 2 sn atlamamalı,
   ileri geri oynamamalı.
2. Süre bitince sıradaki aşama 1–2 sn içinde gelmeli. Seçim yaparken altta kırmızı "Oyun bu aşamadan çoktan geçmiş"
   uyarısı çıkmamalı.
3. Bas-konuş: düğmeye basılı tut, konuş, bırak. Parmağın düğmede biraz kaysa da kayıt kesilmemeli; bırakınca gitmeli.
4. Biri konuşurken (ses mesajı çalarken) sen basılı tutunca onun sesi hemen susmalı, sen bırakınca kaldığı yerden
   devam etmeli (yansıma olmamalı).
5. Bir hata olursa (ör. "10 saniyelik hakkın doldu") ne olduğu yazmalı.

## C. Köpekbalığı Kafesi ve Vampir–Köylü giriş ekranı (yeni tasarım)
1. Oyunlar > Köpekbalığı Kafesi: büyük oyun başlığı, aylık hedef, ortada dikey kaydırmalı **rol tabelası**
   (takımlara göre; ikon, rol adı, altında küçük sınıf ve özellik). Bir role dokununca ayrıntısı açılır.
2. Altta büyük **Yan yana** / **Uzaktan eşleş** düğmeleri ve Açık odalar. Sağ üstte Puanlar ve Rehber.
3. Ekrandan sağa kaydırarak geri çık: arkadaki beyaz dalgalar ve yüzen köpekbalığı önceki ekranın üstüne taşmamalı.
4. Vampir–Köylü giriş ekranı aynı düzende olmalı. Oyun içi ve lobi ekranları değişmedi.

## D. Oyunlar sekmesi
1. Ödül podyumu artık küçük bir şerit: ayın ilk 3'ü madalya, ad ve puanla tek blokta. Şeride dokununca sıralama ve
   ödüller açılır.
2. Davet ayarı ve çekiliş kutusu küçüldü; "Kurallar" ve "Puanlar" OYUNLAR başlığının yanında.
3. Oyun kutuları ekranda daha yukarıdan başlar (açılışta 4 oyun görünür).

## E. Uygulama eğitimi ve hoş geldin (her hesapta 1 kez)
1. Yeni hesapla gir: izin ekranları ve şehir seçiminden sonra eğitim başlar.
2. Anlatılan alan dışı kararır; kutu yok: büyük yazı, zıplayan ok ve alanın çevresinde parlayan çerçeve. Ekrana dokun
   ya da **Devam** ile ilerle; sağ üstte **Geç** var. 7 kısa adım, sonda hoş geldin ekranı.
3. Eğitim bir kez çıkar; ikinci kez başlamamalı. Sekmelerde ayrıca ipucu kartı çıkmaz.
4. Aynı hesapla başka telefondan (ya da uygulamayı silip yükleyip) gir: eğitim ve hoş geldin bir daha çıkmamalı.

## F. Etkinlikler
1. Bir etkinliğe **Katıl** de: başlıkta hak göstergesinin solunda o etkinliğin küçük kartı çıkar (resmi, adı, altında
   başlamasına kalan süre).
2. Birden çok etkinliğe katıldıysan kartta sayısı yazar ve kart, başlamasına en az süre kalan etkinliği gösterir.
   Karta dokununca katıldığın bütün etkinlikler listelenir; birine dokununca o etkinlik açılır.
3. Saat çakışması: aynı gün, başlangıçları 2 saatten yakın ikinci bir etkinliğe katılmaya çalışınca hata yazar
   ("Bu saatlere yakın katıldığın başka bir etkinlik var…"). 2 saat, web panel > Sistem > Ayarlar >
   `event_overlap_minutes` ile değiştirilebilir (0 = kapalı).
