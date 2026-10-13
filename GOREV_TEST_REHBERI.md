# Görev Test Rehberi – Paket: Rumuz #numara, harita menüsü, Oyun arayanlar, açık tema

> Önce: Supabase > SQL Editor'e yeni `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas.
> Sonra bilgisayarında `app` klasöründe `npx expo start -c` çalıştır.
> Açılış ekranı ve tema sorusunu görmek için telefonda bir kez: Ayarlar > Uygulamalar > Expo Go > Depolama > **Verileri temizle**. Sonra Expo Go ile projeyi yeniden aç ve giriş yap.

## 1. Açılış ekranı ve tema
1. Expo Go yüklenirken açık zeminde yeni logo (41 + kule) görünmeli.
2. Girişten sonra bildirim (1/3) ve konum (2/3) adımlarından sonra **3/3 "Hangi görünümü istersin?"** gelmeli. Açık seçili gelmeli.
3. **Koyu**'yu seç ve "Kaydet ve başla"ya bas: uygulama bir kez yeniden başlamalı ve koyu açılmalı. **Açık**'ı seçersen yeniden başlamadan devam etmeli.
4. Uygulamayı kapatıp aç: soru bir daha **gelmemeli**.

## 2. Rumuzlar
1. Profilde rumuzun "Kaptan#145" gibi görünmeli: tek kelime ve numara, hayvan adı yok.
2. Akışta bir gönderi yaz: `@#145` (başka bir hesabın numarası) ve `@kaptan#145` (küçük harfle) yaz. İkisi de renkli görünmeli ve o hesaba "senden bahsedildi" bildirimi gitmeli.
3. Renkli etikete dokun: "Profili gör" ve "Özel mesaj gönder" çalışmalı.
4. Moderatör hesabı > Moderatör paneli > **Rumuz kodu**: #41'i "Seç". Rumuz "Kat Görevlisi#41" olmalı. Akışta `@#41` ile etiketlenebilmeli.
5. İkinci bir moderatör hesabında #41 "Dolu" görünmeli ve seçilememeli.

## 3. Mesaj kutusunda +
1. Akış > Mesajlar > sağ üstteki **+**.
2. `#145` ya da `Kaptan#145` yaz ve oka bas: yazışma açılmalı. Bunun için abonelik gerekir, abone değilsen bunu söyleyen bir uyarı çıkmalı.
3. Bir arkadaşının gerçek adını küçük harfle yaz (ör. `ali yılmaz`): yazışma açılmalı.
4. Arkadaşın olmayan birinin gerçek adını ya da olmayan bir numarayı yaz: "bulunamadı" yazmalı, mesaj gönderilmemeli.

## 4. Harita
1. En çok yakınlaştır: petek adları düz renk olmalı. Harflerin çevresinde koyu çizgi ya da gölge olmamalı.
2. Mekânı olan petekte çerçeve olmamalı. Peteğin alt kısmında küçük **mercan renkli nokta** olmalı. Altta "Mekân" açıklaması da nokta olmalı.
3. İşaretli bir peteğe (sayı, yıldız, büyüteç, nokta) bir kez dokun: petek yükselince işaretler ve petek adı da onunla birlikte yükselmeli. Etkinlik / oyun çerçevesi de yükselen yüzde görünmeli.

## 5. Petek menüsü
1. "Buradayım" düğmesi **olmamalı**. "Burada kim var?" penceresinde "Buradayım (konumumu bildir)" yine olmalı.
2. Bu hafta gönderi olan petek: solda "Son gönderi X dk önce · Bu hafta N gönderi" yazmalı (gönderinin içeriği değil), sağda küçük **Petek akışı** düğmesi. Gönderi olmayan petekte eskisi gibi tam genişlikte düğme olmalı.
3. Gri bölge yazısı küçülmüş olmalı.
4. Oyun / Etkinlik / Mekân satırları daha büyük ve kolay okunur olmalı.

## 6. Oyun arayanlar
1. Petek menüsünde mor **"Oyun arayanlar ?"** düğmesine bas. Küçük pencere açılmalı.
2. **Listeye adımı yazdır** > bir oyun seç (yalnızca yan yana oynanan oyunlar çıkmalı). Konum sorulabilir.
   - Peteğin içinde ya da hemen yanındaysan rumuzunla listede "(sen)" olarak görünmelisin.
   - Uzaktaysan "bu peteğin içinde ya da hemen yanında olmalısın" yazmalı.
3. Başka bir hesapla aynı pencereyi aç: senin rumuzun görünmeli. Rumuza dokun; şu seçenekler çıkmalı: Profile git, Özel mesaj gönder, Arkadaşlık isteği gönder, Bu kişiyi engelle.
4. "Listeden çık" ile adın silinmeli. Kayıt gece yarısı kendiliğinden silinir.

## 7. Işıklar
1. Etkinlikler, Oyunlar ve Profil başlıklarında ışık **yazının tam arkasında** olmalı, eskisinden daha sönük.
2. Akış logosunun arkasındaki ışık daha küçük ve daha hafif olmalı.

## 8. Kişisel veri dosyası
Profil > Kişisel Verilerim > "Resmi Veri Dosyasını İndir". Açılan dosyada Türkçe başlıklar olmalı ("Hesap bilgilerim", "Gönderilerim"…). En üstte bir açıklama, tarihler "13 Ekim 2026, 14:05" biçiminde, Evet/Hayır, Açık/Kapalı yazmalı. Teknik kayıt numaraları olmamalı (yalnızca kullanıcı kimliği kalır).
