# Görev Test Rehberi – Tünel (ngrok) projeye eklendi

`npx expo start --tunnel` için gereken ngrok artık projenin içinde. Ayrıca kurmana gerek yok. Uygulamanın kendisinde
hiçbir değişiklik yok (Expo SDK 57).

## A. Güncelle ve başlat
1. Proje klasöründe: `git pull origin claude/kind-goodall-dy5z7y`
2. `cd app`, sonra `npm install`
3. `npx expo start -c --tunnel`
4. Terminal güncelleme ya da "upgrade" diye bir şey sorarsa **No (Hayır)** de.
5. QR kodu telefondaki Expo Go ile okut.

## B. Hâlâ hata verirse
1. Terminaldeki hata yazısını olduğu gibi bana gönder.
2. Telefon ve bilgisayar aynı Wi-Fi'deyse tünelsiz de açabilirsin: `npx expo start -c`
