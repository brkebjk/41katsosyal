# Görev Test Rehberi – Bas-konuş düzeltmesi, 16 kutucuk, yeni Vampir–Köylü ekranı

## A. Supabase'i güncelle
Şema artık `supabase/parcalar/` klasöründe **4 parça**.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
4. Yeni sorgu aç > `4.sql` > Run.
- Sıra önemli: 1, 2, 3, 4. "Run and enable RLS" çıkarsa onu seç.

## B. Bas-konuş (iki oyun, uzaktan)
1. Düğmeye basılı tut, konuş, bırak. Kayıt artık hemen kesilmemeli; karşı telefonda ses duyulmalı.
2. Konuşurken oyun sesleri susar; senin mikrofonuna gitmez.
3. Her tartışmada toplam **10 sn** konuşma hakkı var.

## C. Oda düzeni: 16 kutucuk (iki oyun)
1. Bekleme odasında 16 kutucuk görünür. Boş kutucukta numara yazmaz; biri oturunca numarası belirir.
2. Boş kutucuğa (+) dokun > oraya geçersin.
3. Oyun başlayınca boşluklar kapanır. Ör. 10 kişilik odada 16'ya oturan, en baştaki boş numaraya geçer.
4. Moderatör: **Odayı doldur (16 kişi)** ile oda deneme oyuncularıyla dolar (artık 15 deneme oyuncusu var).

## D. Köpekbalığı Kafesi
- Avatarın altında yalnızca rumuz yazar (#kod yok). Sağ alttaki güneş / maske simgeleri kalktı.
- "Maske kırıldı" yerine **Avlandı** yazar. Avlandı yazısı avatarın ortasında çıkar.
- Ölen avatarında nasıl öldüğü görünür:
  - ⛓️ kafes,
  - 🦈 avlandı,
  - 🔱 zıpkın,
  - 🚪 ayrıldı.
- **Wolvesville kuralı:** kim nasıl ölürse ölsün rolü herkese açıklanır. Ölüler yaşayanların rolünü görmez.
- **Rol çarkı:** her rolün altında gelme oranı (%) yazar. Güçlü rollerin şansı daha düşüktür.
- **Rolüm:** ekran artık kararmaz. "Bu oyundaki roller" listesinde:
  - her rolün sayısı yazar,
  - rolü açılanın numarası yanında görünür,
  - ölenin numarasının üstü çizilir.
- Alt satırda eksik kalan avatarlar sağa yaslanır (üstte 4, altta 2).
- Köpekbalığıysan dalışta sohbet baloncuğu **Takım** sekmesiyle açılır. Oyun akışı orada da akar.

## E. Vampir–Köylü (yeni ekran)
- Ekran Köpekbalığı'nın aynısı:
  - numaralı kutucuklar, üst tabela, ortada çıkan komut,
  - yüzen sohbet: Genel / 🧛 Vampirler / 💀 Ölüler,
  - rol çarkı (oranlarıyla), oyuncu penceresi, atma oylaması, bas-konuş, oyun sonu sıralama tablosu.
- Gece:
  - vampir ısıracağını seçer,
  - doktor korur,
  - dedektif bakar; sonuç sabah kendiliğinden açılır.
- Ölenin rolü herkese açıklanır.
- Fısıltı ve eski sesli oda bu ekranda yok.

## F. Açık odalar ve bildirim
- Odada oynandığı petek adı yazar. Petek adına dokununca haritada o petek açılır.
- Oda sahibi rumuzuyla görünür.
- Oyunda gelen arkadaşlık isteği üstte **5 sn** durur. Seçmezsen bildirim kutusunda Onayla / Reddet ile bekler.
