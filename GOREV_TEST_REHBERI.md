# Görev Test Rehberi – Yan yana puan sınırı, 100 metre konum, deneme oyuncuları

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.
- Bu çalıştırma 8 deneme oyuncusu (bot) hesabı da oluşturur: "Deneme Botu 1–8". Bu hesaplara giriş yapılamaz.

## B. Deneme oyuncularıyla Vampir–Köylü (moderatör hesabı + 1 telefon yeterli)
1. Moderatör hesabıyla Oyunlar > Vampir–Köylü > Oda aç.
   - **Yan yana** (ya da Uzaktan) > **Otomatik Oyun** > Evet, ben de oynarım.
2. Bekleme salonunda **Deneme oyuncusu ekle (+3)** > Ekle.
   - Oyuncu listesine 3 bot gelmeli.
   - Üstte kırmızı "Deneme odası" uyarısı çıkmalı.
   - Açık odalar listesinde "Deneme odası · puan verilmez" yazmalı.
3. Gerekirse bir kez daha bas (en çok 8 bot). İkinci telefonu da odaya alabilirsin.
4. **Oyunu başlat.**
   - Botlar rolünü görür, gece seçim yapar, oy verir.
   - Oyun kendi kendine ilerleyip bitmeli.
5. Oyun bitince puan geçmişine, başarımlara ve sıralamaya **hiçbir şey yazılmamalı**.

## C. Yan yana oyun: 100 metre kuralı (2 telefon)
1. Telefon 1 yan yana oda açar.
   - Konum uyarısında "yaklaşık 100 metre" yazmalı.
2. Telefon 2 aynı masadan kodla girer: girebilmeli.
3. Telefon 2 yaklaşık 200 metre uzaklaşıp girmeye çalışır.
   - "Oda sahibinden uzaktasın… yaklaşık 100 metre (konum hatası dahil en çok 150 m)" uyarısı çıkmalı.
4. Mesafe ayarları: Web panel > Ayarlar:
   - `game_join_max_meters` (100)
   - `game_join_max_meters_cap` (150)

## D. Yan yana oyunda puan sınırı yok
- Kurallar ve Açık odalar > puan tablosu: "Yan yana oyunda günlük/aylık puan sınırı yok" yazmalı.
- Uzaktan oyun sınırları aynen geçerli: günde 2, ayda 6.
- Bilgi Yarışması ve Hazine Avı sınırları aynen geçerli.

## E. KVKK aydınlatma metnine eklenecek paragraf
Web panel > Sistem > **Uygulama metinleri** > **KVKK aydınlatma metni** ve **Gizlilik politikası**'na ekle:

```
## Yan yana oyunlarda konum
Yan yana oynanan bir oyuna girerken, oyuncuların gerçekten bir arada olduğunu kontrol etmek için telefonunun kesin konumu (enlem, boylam ve telefonun bildirdiği konum hata payı) bir kez sunucuya gönderilir. Odaya girenin kesin konumu yalnızca bu karşılaştırmada kullanılır ve hiçbir yere kaydedilmez. Oda sahibinin kesin konumu yalnızca oda katılıma açıkken tutulur; oyun başladığında, oda kapandığında ya da iptal edildiğinde (en geç 12 saat içinde) kendiliğinden silinir ve yedeklere alınmaz. Uygulama konumunu sürekli takip etmez ve arka planda konuma bakmaz. Uygulamanın diğer bölümlerinde (akış, harita, etkinlik) yalnızca bulunduğun bölgenin (peteğin) numarası kullanılır.
```

> Bu paragraf, bir sonraki pakette yazacağım hukuki metin taslaklarına da işlenecek.
