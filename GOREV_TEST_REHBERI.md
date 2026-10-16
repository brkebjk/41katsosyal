# Görev Test Rehberi – İlk giriş, eğitim, ziyaret, harita

## A. Supabase'i güncelle
1. **SQL Editor** > **+ New query** > `supabase/parcalar/1.sql` dosyasının tamamını yapıştır > **Run**.
2. Aynısını `2.sql`, `3.sql`, `4.sql` için yap.
3. Yer listesi (places) değişmedi, CSV'leri yeniden yüklemen gerekmez.

## B. İlk giriş (yeni hesapla dene)
1. Önce izin ekranları gelir (bildirim, konum, tema).
2. Sonra **Bulunduğun şehir** ekranı:
   - konumuna bir kez bakılır, yalnızca bulunduğun şehir seçilir,
   - diğer şehirler kilitli görünür ("Sonra göçle geçebilirsin"),
   - altta göçün nasıl olduğu yazar.
3. Haritaların dışındaysan sana en yakın şehir gelir. Konum izni vermezsen **Konumumu tekrar dene** / **Telefon ayarlarını aç** çıkar.

## C. Uygulama eğitimi (bir kez; eski hesaplarda da bir kez çıkar)
1. Sırayla **Akış, Etkinlik, Harita, Oyun, Profil** sekmesine dokunman istenir (ok sekmeyi gösterir).
2. Dokununca o sekmede neler olduğu yazar. **Devam** ile sıradakine geçilir.
3. En sonda **Hoş geldin!** ekranı: **Yarışma kuralları**, **Ödül programı**, **Başla**.

## D. Ziyaret ve göç
1. Haritada büyütecin hemen üstünde mor **⟳** düğmesi var: Şehrim (göç ve ziyaret) açılır.
2. Başka şehri ziyaret edince yalnızca haritası açılır:
   - İzmir: Balçova ortada, çevre ilçeler görünür,
   - Kocaeli: Derince ortada,
   - İstanbul: Kadıköy ortada, orta yakınlıkta.
3. Ziyarette bir peteğe dokununca yalnızca özeti görünür (kaç etkinlik, oyun, mekân var). İçine girilmez.
4. Akış ve Etkinlikler her zaman kendi şehrin.
5. Profil > Şehrim'den ziyaret et: artık hata vermez. Kutulardaki yazılar sığıyor.

## E. Harita
- Mahalle çizgileri ve mahalle adları kalktı. Mahalle adı yalnızca petek menüsünde, petek adının altında.
- İlçe sınırları ve ana yolların (otoyol, D-100 gibi) soluk silüeti görünür. Köprüler de dahil.
- İlçe adlarının çevresindeki gölge kalktı (tek renk).
- Kocaeli'de Başiskele, İzmit, Derince, Gölcük, Körfez adları körfez kıyısına yakın.
- Yakınlaştırıp uzaklaştırırken alt ortada (Şehrin Temposu'nun üstünde) ölçek çubuğu çıkar (ör. "2 km").

## F. Arkadaşlar
- Başka şehirdeki arkadaşının adının yanında şehri yazar (ör. 📍 İzmir).
