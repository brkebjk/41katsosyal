# Görev Test Rehberi – Küçük temizlikler ve Expo proje kimliği

## A. Güncelle
1. Proje klasöründe: `git pull origin claude/kind-goodall-dy5z7y`
2. `cd app`, sonra `npx expo start -c --tunnel`

## B. Ne değişti
1. Var olmayan "KURULUM_REHBERI.md" dosyasına yönlendiren yazılar düzeltildi. Bu yazılar yalnızca sunucu bağlantısı
   yokken (giriş ekranı, Akış) ya da harita üyelere kapalıyken (yalnızca moderatöre, Harita ekranının bilgi bölümünde) görünür.
   Harita için yazı artık: "web panelde Sistem > Ayarlar’dan map_public ayarını aç".
2. `tools/OKUBENI.md`: mekân listelerinin toplu yeniden üretilmediği, yalnızca değişen satırların düzeltildiği yazıldı.
3. Yanlışlıkla depoya girmiş Python önbellek dosyası kaldırıldı.
4. Expo proje kimliği (Project ID) uygulama ayarına eklendi. Telefona bildirim ve uzaktan güncelleme için gerekiyordu.

## C. Kontrol
1. Uygulama her zamanki gibi açılıyor ve çalışıyor.
2. Profil > Bildirim ve konum: **Telefona anlık bildirim** açıkken, bildirim izni verdiysen, başka bir hesaptan sana
   arkadaşlık isteği gönder. Telefona "Yeni bir arkadaşlık isteğin var" bildirimi gelmeli.
   (Gelmezse sorun değil: Supabase'de pg_net eklentisinin açık olması da gerekiyor, aşağıdaki D-2.)

## D. Bir kez yapılacaklar (sen)
1. GitHub > depo > Settings > Secrets and variables > Actions > **New repository secret** ile şu üçünü ekle:
   - `EXPO_TOKEN`: expo.dev > Account settings > Access tokens > yeni anahtar.
   - `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY`: değerleri bilgisayarındaki `app/.env` dosyasında.
2. Supabase > Database > Extensions: **pg_net** açık mı bak, kapalıysa aç.
3. Anahtarları sohbete yapıştırma.
