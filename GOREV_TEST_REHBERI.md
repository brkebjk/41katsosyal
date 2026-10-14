# Görev Test Rehberi – Oyuncu penceresi, atma penceresi, puan kuralları, açık odalar, Vampir girişi

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe 3 parça.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
- Sıra önemli: 1, 2, 3. "Run and enable RLS" çıkarsa onu seç.

## B. Oyun ekranı (iki oyun)
1. Üst tabela küçüldü. Yalnızca başlık ve altında en son olay yazar (ör. "Konuşun! Köpekbalığı kim?" / "3. gece maskesi kırıldı › ⑤").
2. Avatarlar biraz büyüdü. Adın altında rol yazmaz. Rol ikonu avatarın altında küçük yuvarlak çerçevededir.
3. Avatara bir kez dokun > küçük oyuncu penceresi açılır:
   - Rolü açıksa rolü ve özelliği görünür.
   - **Atma oylaması başlat**, **Arkadaş ekle**, **Ses mesajını şikâyet et** (uzaktan) düğmeleri vardır.
   - Arkadaş eklerken gerçek ad uyarısı çıkar.
4. Sağ üstteki kırmızı 👥 > oyuncuya dokun > aynı pencere açılır, artık önde açılır.
5. Atma oylaması başlayınca kırmızı 👥 düğmesinin altında küçük pencere açılır: "③ Ali, ⑤ Veli için atma oylaması başlattı" > **Atılsın / Atılmasın**.
6. Mikrofonun üstünde yeşil yazı vardır: "Oyun zevkini arttırmak için sırayla konuş."
   - Senin sesin çalınırken bu yazı "👂 Seni dinliyorlar" olur.
7. Oyun sonu tablosunda rol ikonları küçüldü, adların üstüne binmez.
8. Bekleme odasında ve yeni elde herkes aynı numarada kalır. Biri çıkarsa yeri boş kalır, yeni gelen o numarayı alır.

## C. Oyunda gelen arkadaşlık isteği
1. Telefon 1 oyundayken telefon 2 ona istek atsın.
2. Telefon 1'de üstte bildirim çıkar > **Onayla / Reddet** (15 sn durur).
3. Seçmezsen harita > bildirim kutusunda aynı düğmelerle bekler.

## D. Giriş ekranları ve açık odalar
1. Oyunlar > Vampir–Köylü artık Köpekbalığı gibi kendi giriş ekranıyla açılır: rol kartları kaydırmalı, Yan yana, Uzaktan eşleş.
2. **Yan yana** düğmesine basınca pencere hemen açılır. Düğmenin üstünde kırmızı **5x Puan** etiketi var.
3. Açık odalar ekranında:
   - **Oda oluştur** yok. Odalar en üstte listelenir.
   - **Puan tablosu** dokununca açılır.
   - **Kodla katıl** altta yüzen yuvarlak düğmedir.
4. Listede uzaktan odalar yoktur. Yan yana, etkinlik ve 41. Kat Özel oyunlar görünür. Hepsine kod ve konumla girilir.
   - Moderatör odasında "41. Kat Özel Oyun" etiketi var.
   - Etkinlik odasında "Etkinlik Oyunu" etiketi var. Dokununca etkinliğin penceresi açılır.
5. Uzaktan eşleşte bekleyen bir uzaktan oda varsa önce oraya alınırsın.

## E. Puan kuralları (bir kez çevrilir, web panelden değiştirilebilir)
| Ne | Yeni değer |
|---|---|
| Uzaktan oyun puanı | Yan yananın %20'si (yan yana 5 kat) |
| Uzaktan puanlı oyun sınırı | Günde 10, ayda 100 |
| Bilgi Yarışması | Günde 15 puan, aylık sınır pratikte yok (450) |
| Oda hakkı | Ücretsiz 3, abone 12 / ay |
| Etkinlik açma | Ücretsiz 1, abone 4, lider 8 (aynı) |
| Etkinlik oyunu | Oyun Geceleri ×1,5; Sosyal Buluşmalar ve Müzik & Eğlence ×1,25 |

- Oyunlu etkinlik yalnızca bu üç kategoride açılır. Diğer kategorilerde formda "Etkinlikte oyun" seçeneği hiç çıkmaz.
