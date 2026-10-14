# Görev Test Rehberi – Yeni el, eşleştirme, bas-konuş (iki oyun)

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe 3 parça.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
- Sıra önemli: 1, 2, 3. "Run and enable RLS" çıkarsa onu seç.

## B. Küçük düzeltmeler
1. **Oda yeri ekranı:** Yan yana oda açarken "oda nerede kurulacak" ekranı artık hemen açılır. Telefonun son 2 dakikadaki konumu kullanılır.
2. **Bas-konuş:**
   - Sen basılı tutarken çalan ses kısılır (hoparlörden mikrofona geri dönmez).
   - Düğme turuncu oldu.
3. **Yazışma penceresi:** Genel sekmesinde oyunun akışı renkli satırlarla yazar.
   - Örnekler: "🌙 2. gece başladı", "🦈 2. gece ③ avlandı", "⛓️ ⑤ kafese girdi", "🔱 zıpkın".
   - Sana özel gece sonuçların 🔒 ile görünür.
4. **Sağ üstteki kırmızı düğme (Köpekbalığı):** Oyuncu listesi avatarlarla açılır. Oyuncuya dokununca "Ses mesajını şikâyet et" çıkar.
5. **112:** Uzaktan oyunda güvenlik menüsünde 112 yok.

## C. Oyun bitince yeni el (iki oyunda, moderatör + botlarla dene)
1. Oyun bitince tablo görünür. 10 saniye sonra (ya da **Bekleme odasına geç** ile) herkes yeni bekleme odasına geçer.
2. Bekleme odasında **🔁 YENİ EL · 45 sn** geri sayar. **HAZIRIM**'a bas.
3. Süre dolunca hazır diyenlerle yeni el başlar.
   - Hazır demeyen odadan çıkar.
   - Hazır diyen 6'dan azsa (Vampir–Köylü'de oyunun alt sınırı) oda normal bekleme odası olarak kalır.
4. Oyun hakkı:
   - Yan yana oyunda her yeni el oda sahibinin aylık oyun hakkından 1 düşer.
   - Hakkı biten oda sahibinin yerine hakkı olan ilk oyuncu oda sahibi olur.
   - Kimsenin hakkı yoksa "yeni el açılamadı" yazar.
5. Bekleme odasında ya da başlamış uzaktan oyunda oda sahibi çıkarsa oda kapanmaz, sahiplik devredilir. Bu iki oyunda da böyle.
6. "Oyunlara dön" ile çıkan kişi yeni bekleme odasından da çıkar.

## D. Uzaktan oyun ve odalar
1. **Özel uzaktan oda yok:**
   - Köpekbalığı giriş ekranındaki düğme kaldırıldı.
   - Vampir–Köylü "Oda oluştur > Uzaktan eşleş" eşleştirme ekranını açar.
2. **Vampir–Köylü eşleştirmesi:**
   - Harita açılır, 🧛 maskeli avatar dolaşır.
   - Moderatör "+3 deneme oyuncusu" ile dener.
3. **Oda ID'si:**
   - Uzaktan lobide herkes oda ID'sini görür. Arkadaşın Oyunlar > **Kodla katıl** ile ID'yi yazıp girer.
   - Eşleşme arayanlar boş yer olan lobilere (biten oyundan sonra açılan uzaktan bekleme odaları dahil) yerleşir.
4. **Açık odalar listesi:**
   - Yan yana odalar görünür, ama içeri yalnızca oda ID'sini bilen girer.
   - Etkinlik oyunlarının üstünde mavi **ETKİNLİK OYUNU** etiketi var.
   - Uzaktan lobilere listeden doğrudan girilir.
5. Moderatör deneme için hâlâ uzaktan oda açabilir.

## E. Vampir–Köylü uzaktan bas-konuş (2 telefon)
1. Sabahta ve oylamada **BASILI TUT, KONUŞ** ile herkes konuşur. Gece yalnızca vampirler kendi aralarında konuşur.
2. Her tartışmada toplam 15 sn konuşma hakkı var.
   - Sabah süresi artık sabit sayaçla biter. Eski "sırayla konuşma" kalktı.
3. Konuşanın avatarında konuşuyor işareti, üstte yeşil "🔊 Ad konuşuyor" çıkar.
4. Şikâyet: avatara dokun > "Ses mesajını şikâyet et", ya da yeşil yazıya uzun bas.
5. Eski sesli oda (Agora) kodda duruyor, kullanılmıyor. Onunla birlikte "odadan atma oylaması" da şimdilik görünmüyor.
