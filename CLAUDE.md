# PeopleHere – yeni oturum için hızlı not

Şehir tabanlı sosyal uygulama (eski adı "41. Kat Sosyal"). İnsanlar şehirlerindeki etkinliklere katılır, yan yana ya da
uzaktan oyun oynar, puan toplar ve aylık sıralamada yarışır. Şu an 3 şehir var: İstanbul, Kocaeli, İzmir. Alan adı
peoplehere.app.

## Kullanıcı ve çalışma kuralları (önemli)
- Kullanıcı Türkçe konuşan, yazılımcı olmayan biri; iPhone'da Expo Go ile test ediyor. Cevaplar Türkçe, kısa ve öğretici
  olmayan bir dille. Adımları numaralı yaz.
- Dal: `claude/kind-goodall-dy5z7y` (PR açılmaz, doğrudan bu dala push edilir). Commit mesajlarında model adı yazılmaz.
- "Bir şeyi düzeltirken başka bir şeyi bozma, cerrahi müdahale yap." "Oyuna engel olacak hata yapma."
- "Benim dediğim şekilde yap; mantıksızlık varsa sor."
- Köpekbalığı Kafesi oyununa yapılan her düzeltme Vampir–Köylü'ye de uygulanır (iki oyun aynı düzende).
- Veritabanı, puan ve oyun kuralları %100 güvenli olmalı (RLS, açıklar). Kural sunucuda uygulanır; uygulama yalnızca gösterir.
- Gizlilik: "Hiçbir veriyi işlemek istemiyoruz." Konum, kişi bilgisi saklanmaz. Kullanıcının kimlik (TC) bilgisi asla bir
  dosyaya, commit'e ya da kayda yazılmaz. Şifre/anahtar sohbete yapıştırılmaz; GitHub Secrets'a konur.
- Puan satılamaz. Ses kayıtları 10 dk sonra silinir (şikayet edilen 14 güne kadar).
- Otomatik test yazılmaz (yerel PostgreSQL ile elle deneme serbest). Ağır işten önce kullanıcı uyarılır.
- Her teslimde yalnızca `GOREV_TEST_REHBERI.md` kısa test rehberi olarak yeniden yazılır; başka log/md dosyası açılmaz.

## Yapı
- `app/` – Expo SDK 57, React Native 0.86, expo-router. Ekranlar `app/src/app`, sekmeler `(tabs)`: akis, events, index
  (Harita), games, profile. Ortak kod `src/components`, `src/lib`, tema `src/theme/index.ts`. Ayrıca `app/AGENTS.md` oku.
- `admin-web/` – moderatör web paneli (Vite + React, Supabase'e doğrudan bağlanır, RLS ile yalnızca admin).
- `supabase/schema.sql` – TÜM sunucu (tablolar, RLS, RPC'ler). Baştan sona tekrar çalıştırılabilir (idempotent) olmalı.
  `supabase/parcalar/` SQL Editor için 4 parçalı kopyası (`node tools/sema-parcala.mjs` ile üretilir).
  `supabase/functions/` Edge Function'lar (kimlik doğrulama, ses tokeni, RevenueCat, yedek).
- `tools/harita_hazirla.py` – harita verisi (petek ızgarası, ilçeler, yollar) üretir; `tools/OKUBENI.md`.
- `.github/workflows/supabase-sema.yml` – `schema.sql` değişince Supabase'e otomatik uygular (secret: SUPABASE_DB_URL).
  `uygulama-guncelleme.yml` – EAS Update gönderir (kurulum bekliyor, eksikse atlanır).

## Önemli kavramlar
- Harita: şehir başına 500 m'lik altıgen petekler. Genel q,r; şehir r'den anlaşılır (Kocaeli 0, İstanbul 1000, İzmir 2000
  ofseti; sunucu `_cell_city(r)`, uygulama `cityOfR`). Harita verisi `app/src/lib/maps/*.json`.
- Mekân CSV'leri (`supabase/places_*.csv`) asla toplu yeniden üretilmez; yalnızca değişen satırlar elle düzeltilir.
- Şehir: `profiles.city`, göç (`request_city_move`, ay başında geçerli), ziyaret modu (başka şehrin haritası). Moderatör
  (role admin) her şehirde her şeyi yapar. Haritaların dışından giren "bekleyen üye" (şehri yok, yalnızca ziyaret).
- Rumuz sistemi (Lakap#numara), arkadaşlık, özel mesaj, akış (şehre özel), etkinlikler (kodla katılım doğrulama),
  oyunlar: Köpekbalığı Kafesi, Vampir–Köylü (yan yana + uzaktan eşleştirme, bas-konuş ses), Okey ve 101 Okey (4 kişi,
  yan yana + uzaktan), Bilgi Yarışması, çekiliş, hazine avı. Aylık puan sınırları ve sıralamalar sunucuda.

## Bu oturumda eklenenler (özet)
- Şehirler: İstanbul/İzmir haritaları, şehir seçimi konuma bağlı (sunucu doğrular), göç ekranı (/sehir), ziyaret modu,
  şehir sekmeli sıralamalar, arkadaşın şehri etiketi.
- PeopleHere'e ad değişikliği: logo, ikonlar, giriş alan adı `uye.peoplehere.app` (tek seferlik e-posta taşıması SQL'de).
- Harita: mahalle çizgileri kaldırıldı, ana yollar (sürüklerken gizli), ölçek çubuğu, Boğaz su yolu, kıyı mekânları
  aynı ilçedeki karaya taşındı, şehir açılış görünümleri, Başiskele/İzmit etiket yerleri, açılış animasyonu, parlayan
  hareketli petekler, "şehrin şu an sessiz" kartı.
- Bekleyen üye: üzgünüz ekranı, yalnızca Harita+Profil, panelde "Bekleyen üyeler" filtresi.
- Ziyaretçi kuralı: başka şehirde etkinliğe katılır ve etkinlik puanı alır; yalnızca etkinlik oyununa girer ve oyun puanı
  almaz (`event_games_only`, `my_game_result` notu `visitor`).
- Eğitim 7 adım + sekme ipuçları (`AppTour.tsx`, `TabTips.tsx`), açılış sekmesi tercihi, boş ekran yönlendirmeleri.
- Çökme takibi (kişisel veri yok): `report_client_error`, panelde Sistem > Hatalar.
- Uzaktan bildirim altyapısı: `push_tokens`, `notifications` tetikleyicisi pg_net ile Expo'ya genel cümle gönderir;
  tercihler (telefona bildirim, mesajlar, ekip davetleri). Uzaktan güncelleme: expo-updates.
- Panel Sistem > Görünüm: kampanya şeridi (`promo_banners`), özel gün teması (`look_theme`), şehir açılış görseli
  (`look_splash`, `app-look` kutusu), özellik aç/kapa (`feature_*` ayarları; sunucu `_require_feature` ile de engeller).
- Supabase şeması GitHub Actions ile otomatik uygulanıyor.
- Okey ve 101 Okey: motor `schema.sql` sonunda (`ok_*` fonksiyonları; deste ve ıstakalar kimsenin okuyamadığı
  `okey_hidden`/`okey_racks` tablolarında, `game_rooms.state` yalnızca açık bilgi). Ekranlar `okey.tsx` (bekleme odası,
  masa, el sonu), `okey-giris.tsx`, `okey-ara.tsx`, parçalar `OkeyParts.tsx`, istemci `lib/okey.ts`, kurallar
  `gameInfo.ts` OKEY_RULES. Sıra 1→2→3→4 (soldan al, sağa at). Puan `room_players.score` → `_game_results` (4 koltuk;
  eşlide kazanan eşler tavanı paylaşır, 101'de 3+ el ×1,5). El sonunda kimsenin eli gösterilmez (yalnızca puan).
  Oda sohbeti `okey_chat` + `ok_say` (1 günde silinir, odası bildirilmişse 14 gün), engelleme `ok_block`. Uzaktan masa
  seçenekleri `sk_queue.opts` + `match_join(p_game, p_opts)` (`_ok_match_opts`); yalnızca aynı seçenektekiler ve
  birbirini engellememiş kişiler eşleşir. Desteden/yandan taş ıstakaya sürüklenerek çekilir; okey taşına dokununca ters döner.
- Ekran yönü: `app.json` orientation `default` + `expo-screen-orientation` (başlangıç PORTRAIT_UP); uygulama
  `_layout.tsx`'te dikeye kilitlenir (`lib/orientation.ts`). Yalnızca Okey masası (oynanış, el sonu, oyun sonu) yataya
  kilitlenir ve `width > height` ise yatay düzen çizilir; bekleme odası dikey. iOS'ta yatay ekranda açılan Modal
  `supportedOrientations={MODAL_ORIENTATIONS}` (lib/orientation) almazsa uygulama kapanır.

## Bekleyen işler
- Expo/EAS: Project ID `app.json`'da (slug `peoplehere`), GitHub secrets eklendi; `uygulama-guncelleme.yml` app/
  değişince iOS ve Android için `production` dalına EAS Update gönderiyor (çalışıyor). Gerçek derleme (iOS için Apple
  Developer hesabı) henüz yok; güncellemeler ancak gerçek derlemeye ulaşır, Expo Go'ya değil.
- GEÇİCİ web önizleme (yalnızca geliştirme): `.github/workflows/web-onizleme.yml` app/ değişince web paketini EAS
  Hosting'e yükler (web paketleri yalnızca iş akışında `--no-save` kurulur). Web'de yalnızca moderatör girer, kayıt
  kapalı (`src/components/WebPreviewGate.web.tsx`; telefonda `WebPreviewGate.tsx` boş). MARKETE ÇIKARKEN SİLİNECEK:
  iş akışı, iki WebPreviewGate dosyası, `_layout.tsx`'teki `<WebPreviewGate />` satırı ve expo.dev'deki Hosting yayını.
- Supabase'te pg_net eklentisinin açık olduğu doğrulanmalı (telefona bildirim için).
- Bazı oyun kutuları hâlâ "çok yakında"; İngilizce ve "uygulamayı değerlendir" yakında durumunda.
- Okey 2. aşama: taş, ıstaka ve oyun kutusu görselleri (şimdilik kodla çiziliyor; `OkTile`, `OkRack`, `images.ts`).

## Teslimden önce kontroller
- `cd app && NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit && npx eslint src`
- `node scripts/extract-ui-strings.mjs` (app içinde), `cd admin-web && npx tsc -b`, `node tools/sema-parcala.mjs`
- `npx expo export --platform ios --output-dir <geçici>` ile paket derlenebiliyor mu (sonra sil).
- SQL değişikliklerini yerel PostgreSQL'de hem temiz kurulumda hem eski şemanın üstüne iki kez çalıştırarak dene.
  Dikkat: tetikleyici fonksiyonlarında başka tablonun alanına (ör. `new.created_by`) yalnızca iç içe `if` ile eriş.
- Push sonrası GitHub Actions'ta "Supabase şemasını uygula" yeşil mi bak.
