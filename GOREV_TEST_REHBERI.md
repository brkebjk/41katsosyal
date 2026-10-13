# Görev Test Rehberi – Vampir–Köylü yeni ekran, açık oylar, odadan atma

## A. Supabase'i güncelle
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.

## B. Yeni oyun ekranı (moderatör hesabı + 1 telefon)
1. Oyunlar > Vampir–Köylü > Oda aç > **Yan yana** > **Otomatik Oyun** > Evet, ben de oynarım.
2. Ekranın tamamında gece görseli olmalı. Yazılar ve düğmeler görselin üstünde durmalı.
   - Sayfa aşağı kaymamalı; her şey tek ekranda olmalı.
3. Altta **+3 deneme oyuncusu** > Ekle > **Oyunu başlat**.
4. Rol aşaması: ortada rol kartı çıkar. Karta dokun > **Rolümü gördüm, hazırım**.
5. Gece / sabah / oylama:
   - Ortada oyuncuların avatarları görünmeli.
   - Ölen oyuncunun avatarı kararmalı, üstünde kurukafa olmalı, adının üstü çizilmeli.
   - Gece rolün varsa (vampir, doktor, dedektif) avatara dokunarak seç > alttaki düğmeye bas.
6. Oylamada:
   - Avatara dokun > **Oy ver: …**. Oy vermek istemezsen **Pas**.
   - Avatarın üstünde kırmızı ✋ ile **kaç oy aldığı** görünmeli.
   - Adın altında **kime oy verdiği** görünmeli (→ Ad). Pas geçen için "Pas", henüz oy vermeyen için "Düşünüyor".
7. Alt şerit:
   - **Fısıltı**: liste açılır. Fısıldamak için bir avatara dokunup "… kişisine fısılda" da diyebilirsin.
   - **Rolüm**: rol kartın ve (dedektifsen) notların.
   - **Elenenler** (elendiysen), **Kartlar**, **Nasıl?**.
   - Son fısıltı tek satır olarak görünür. İçeriği orada yazmaz, yanındakiler görmesin diye.

## C. Uzaktan sesli odada atma (2 telefon + botlar)
> Ses, Expo Go'da çalışmaz. Atma oylamasının kendisi Expo Go'da da denenebilir.
1. Telefon 1 (moderatör): **Uzaktan (sesli)** oda açar, **+3 deneme oyuncusu** ekler.
2. Telefon 2 odaya katılır. Oyun başlar.
3. Gece ve sabah, avatara uzun basınca atma seçeneği **çıkmamalı**.
4. Sabah konuşmaları bitip oylama başlayınca avatara uzun bas > **Odadan atma oyu ver (1/4)**.
   - Avatarın sol üstünde kırmızı "1/4" görünür.
5. Kural:
   - Bir kişiyi **4 kişi** atmak isterse 10 saniye geri sayım başlar ("10 sn").
   - Süre dolunca kişi odadan çıkar ve o odaya geri giremez.
   - Odada daha az kişi varsa (ör. 3 kişi daha), diğer herkesin oyu gerekir.
   - Süre dolmadan oy geri alınırsa sayaç durur.
   - Botlar atma oyu vermez. 2 telefonla "1/4", "2/4" görünür ama atma gerçekleşmez. Tam deneme için 5 gerçek kişi gerekir.
6. Ayarlar: Web panel > Ayarlar:
   - `voice_kick_min_votes` (4)
   - `voice_kick_seconds` (10)
