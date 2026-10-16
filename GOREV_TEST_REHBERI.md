# Görev Test Rehberi – Expo SDK 57'ye geri dönüş

App Store'daki Expo Go henüz SDK 57'yi açıyor. Proje yeniden SDK 57'ye alındı. Uygulamanın görünüşünde ve
kurallarında hiçbir değişiklik yok.

## A. Bilgisayardaki projeyi düzelt
Terminalden yanlışlıkla çalışan komut, bilgisayarındaki paketleri SDK 58'e çevirmiş olabilir. Önce onu geri al:
1. Proje klasöründe: `git stash` (o komutun yaptığı değişiklikleri kenara koyar, hiçbir şey silinmez).
2. `git pull origin claude/kind-goodall-dy5z7y`
3. `app` klasöründeki **node_modules** klasörünü sil.
4. `cd app`, sonra `npm install`
5. `npx expo start -c --tunnel` (tunnel'ın önünde iki tire var)
6. Terminal "Expo Go'yu güncelle", "upgrade" ya da "install" diye bir şey sorarsa **No (Hayır)** de.
7. Telefonda Expo Go'yu kapatıp aç ve QR kodu okut.

## B. Hâlâ hata verirse
1. Telefonda Expo Go'yu aç, sağ alttaki **Settings** (ya da profil) bölümüne gir.
2. "Supported SDK" ya da "SDK" yazan satırdaki sayıyı bana yaz.
3. Terminalde `cd app` içindeyken `npx expo --version` yaz ve çıkan sayıyı da bana gönder.
