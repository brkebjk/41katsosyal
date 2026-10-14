# Görev Test Rehberi – Rol ikonları, atma oylaması, ses şikâyeti kuralları

## A. Supabase'i güncelle
Şema `supabase/parcalar/` klasöründe 3 parça.
1. Supabase > **SQL Editor** > **+ New query** > `1.sql` dosyasının tamamını yapıştır > **Run** > yeşil "Success".
2. Yeni sorgu aç > `2.sql` > Run.
3. Yeni sorgu aç > `3.sql` > Run.
- Sıra önemli: 1, 2, 3. "Run and enable RLS" çıkarsa onu seç.

## B. Rol ikonları (Köpekbalığı)
- 14 rolün görseli şu yerlerde görünür:
  - avatarın içinde, alt ortada,
  - rol çarkında ve rol kartında,
  - sıralama tablosunda ve oyuncu listesinde,
  - rehber tablosunda ve giriş ekranındaki kartlarda,
  - üst tabelada ve yazışmadaki olay akışında.
- Rolünü açıklayan Komutan'ın avatarında yalnızca rol ikonu görünür; sol alttaki 🎖️ kalktı.

## C. Avatar düzeni (iki oyun)
- Her satırda hep 4 avatar var; bekleme odasında da.
- Kişi arttıkça avatarlar küçülür ama hep tek ekrana sığar.
- Oyun sırasında avatarların boyu ve yeri değişmez.
- Oyuncu numarası avatarın üst ortasında.

## D. Yazışma ve ses
- Yazışmada her mesajın başında yazanın numarası var, senin mesajında da ("③ Sen").
- Baloncuk pencere açıkken de görünür; tekrar basınca pencere kapanır. Pencerenin dışına dokununca da kapanır.
- Bas-konuşa basılı tutarken bütün oyun sesleri susar. O sırada gelen ses mesajı duraklar, bırakınca kaldığı yerden çalar.
- Uzaktan oda açmak kimse için yok (moderatör dahil); uzaktan oyun yalnızca **Uzaktan Eşleş** ile başlar.

## E. Atma oylaması (iki oyun, yan yana ve uzaktan)
1. Ne zaman açılır: yalnızca bekleme odasında ve tartışmada (Köpekbalığı plajı, Vampir sabahı).
2. Nasıl başlatılır:
   - Köpekbalığı: sağ üstteki kırmızı 👥 düğmesi > oyuncu > **Atma oylaması başlat**.
   - Vampir–Köylü: 👥 listesinden oyuncuyu seç ya da avatara dokun.
3. Üstte kırmızı bant çıkar: "⑤ atılsın mı · At 1/4 · 30 sn". Diğerleri **AT** ya da **KALSIN** der.
4. Oyuncuların yarısından fazlası "At" derse oyuncu atılır.
   - Oyundaysa elenir, rolü açıklanır.
   - O odaya geri giremez.
5. Sınırlar: aynı anda tek oylama açık olur, kişi başı odada 2 hak. Moderatör atılamaz.
6. Deneme: moderatör deneme odasında oylama başlatırsa botlar "At" der.

## F. Ses şikâyeti
1. Uzaktan oyunda konuşanın avatarında kırmızı **!** çıkar. Dokununca ses şikâyet edilir.
   - Oyuncu listesinden de şikâyet edilebilir.
2. Web panel > Şikâyetler > ses mesajı:
   - **Haklı:** konuşanın mikrofonu 7 gün kapanır, tekrarında 30 gün.
   - **Haksız:** şikâyet edenin sayacı artar. 3 haksız şikâyette 30 gün ses şikâyeti yapamaz ve 7 gün mikrofon kullanamaz.
3. Mikrofonu kapalı olan kişinin düğmesinde "🔇 Mikrofonun bir süreliğine kapatıldı" yazar.

## G. Gece ölenler
- Gece maskesi kırılanın rolü açıklanmaz (iki oyunda da).
- Rol yalnızca kafese atılınca, zıpkınla vurulunca ya da oyundan ayrılınca açıklanır.
