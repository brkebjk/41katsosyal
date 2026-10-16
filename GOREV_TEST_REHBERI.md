# Görev Test Rehberi – Expo SDK 58'e geçiş

Telefondaki Expo Go en son sürüme (SDK 58) güncellendiği için uygulama "Project is incompatible with this version of
Expo Go" hatası veriyordu. Proje SDK 58'e yükseltildi. Uygulamanın görünüşünde ve kurallarında hiçbir değişiklik yok.

## A. Bilgisayarda güncelle
1. `git pull origin claude/kind-goodall-dy5z7y`
2. `app` klasöründeki **node_modules** klasörünü sil (eski paketler yenileriyle karışmasın).
3. `cd app`, sonra `npm install`
4. `npx expo start -c --tunnel` (tunnel'ın önünde iki tire var)
5. Telefonda Expo Go'yu kapatıp aç ve QR kodu okut.

## B. Kontrol et
1. Uygulama hatasız açılıyor ve **Harita** sekmesiyle başlıyor (Tercihler'de başka bir açılış sekmesi seçtiysen o sekmeyle).
2. Giriş ve kayıt: şifre kutusuna geçiş (klavyedeki "ileri" tuşu) çalışıyor.
3. Uygulama eğitimi ve sekme ipuçları doğru yeri çerçeveliyor.
4. Mesajlarda, oyun sohbetinde (Köpekbalığı Kafesi, Vampir–Köylü) ve Bilgi Yarışması sohbetinde liste en alta kayıyor.
5. Etkinlik açma penceresinde klavye açılınca yazı kutusu görünür kalıyor, saat seçici kayıyor.
6. Avatarlar, oyun kutucukları, rol kartları ve rol ikonları görünüyor.

Bir sorun görürsen ekranın fotoğrafını ya da hata yazısını bana gönder.
