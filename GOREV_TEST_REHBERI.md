# Görev Test Rehberi – Web panel (tüm bölümler), yedekleme, kayıtlar ve veri saklama

## A. Supabase'i güncelle

**1. Veritabanı**
- Supabase > **SQL Editor** > **+ New query**.
- `supabase/schema.sql` dosyasının tamamını yapıştır > **Run**.
- Yeşil "Success" görmelisin.

**2. Yedekleme işlevi (yeni)**
- Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**.
- Function name: `admin-backup` (birebir böyle).
- Editördeki örnek kodu tamamen sil.
- Bilgisayarındaki `supabase/functions/admin-backup/index.ts` dosyasının tamamını yapıştır > **Deploy function**.
- İşlevin ayarlarında **Verify JWT** anahtarını **KAPAT** ve kaydet.
- Gizli değer eklemen gerekmiyor.

**3. Web panel**
Cloudflare kendiliğinden güncellenir (2–3 dakika). Telefonda 1.1.1.1 uygulaması açıkken gir.

## B. Panel bölümleri (menü ☰)

| Bölüm | Dene |
|---|---|
| Özet | Sayılar görünmeli; sayısı olan kutuda "Aç →" ilgili bölüme gitmeli |
| Şikayetler | Gizle / Yazarı göster / Haklı / Haksız |
| Onaylar | Profil resmi ve etkinlik onayla / reddet |
| Etkinlik kapatma istekleri | Bekleyen istekte Onayla (etkinlik kapanır, puanlar geri alınır) ya da Reddet |
| Lider başvuruları | Onayla / Reddet; "Üyeyi aç" |
| Sorun bildirimleri | Kapat |
| Üyeler | Ara; susturma, askı, abonelik, puan, mesaj, doğrulamayı kaldır |
| Üye mesajları | Yazışmayı aç, cevap yaz (üyeye "Moderatör" olarak gider), görüşmeyi sonlandır |
| Akış | "Moderatör olarak yaz" ile gönderi at → uygulamada kırmızı simgeyle görünmeli. Gönderi ve yorumda Gizle / Yazarı göster |
| Duyurular | Yeni duyuru → üyelerin bildirim kutusuna düşmeli; Kaldır / Yeniden yayınla |
| Etkinlikler | Yaklaşan / Geçmiş / İptal edilen; İptal et; moderatör etkinliğinde "Resmî yap" |
| Yarışma soruları | Ara, yeni soru ekle (doğru cevabı işaretle), düzenle, yayından kaldır |
| Abone ayrıcalıkları | Ekle / düzenle / sil |
| Petek adları | Adaylar listesi; q, r ve ad yazıp Kaydet → uygulamada petek adı değişmeli |
| Mekânlar | Düzenle; haritadan kaldır |
| Hazineler | Aktif / Bulunan; Kaldır |
| İşlem günlüğü | Yaptığın her işlem moderatörün gerçek adıyla görünmeli; satıra dokununca ayrıntı açılmalı; "Excel (CSV) indir" çalışmalı |
| Trafik kayıtları (5651) | Kendi kullanıcı adınla ara: girişlerin ve gönderilerin IP adresiyle listelenmeli; CSV indir |
| Veri saklama (KVKK) | Tablo ve hukuki özet görünmeli; "Süresi dolanları şimdi temizle" çalışmalı |
| Ayarlar | Bir ayarı değiştir → İşlem günlüğünde "Ayar değiştirdi" görünmeli (eski ve yeni değerle) |
| Uygulama metinleri | Bir metni değiştir, kaydet → uygulamada Profil > Uygulama'da hemen görünmeli |
| Rumuz kodum | #41 seç / bırak |

## C. Yedekleme (önce bir deneme hesabıyla dene)
1. **Yedek al:**
   - Panel > Sistem > Yedekleme > en az 10 karakterlik bir şifre yaz (iki kez) > **Yedek al ve indir**.
   - `41kat-yedek-....json` dosyası inmeli. Şifreyi bir yere yaz.
2. **Değişiklik yap:** Uygulamada bir gönderi yaz.
3. **Geri yükle:**
   - Yedekleme > Yedekten geri yükle > indirdiğin dosyayı seç > şifreyi yaz > kutuya `GERİ YÜKLE` yaz > **Yedeği geri yükle**.
   - Önce "geri-yukleme-oncesi" yedeği inmeli.
   - Sonra "Yedek geri yüklendi" yazmalı.
   - 2. adımda yazdığın gönderi kaybolmalı.
4. Yanlış şifreyle denersen "Şifre yanlış" yazmalı ve hiçbir şey değişmemeli.

Hata yazısında "admin-backup işlevi sunucuda yok" geçiyorsa A.2 adımını yap.

## D. Yasal metinlere eklenecek paragraf
Panel > Sistem > **Uygulama metinleri** > **KVKK aydınlatma metni** ve **Gizlilik politikası** sekmelerine uygun bir yere şunu ekle ve kaydet:

```
## Trafik kayıtları
5651 sayılı Kanun gereği uygulamaya giriş yaptığında ve içerik eklediğinde (gönderi, yorum, mesaj vb.) hangi IP adresinden ve ne zaman yaptığın kaydedilir. Bu kayıtlar içeriğin kendisini içermez; 2 yıl saklanır, hesabını silsen de bu süre boyunca tutulur ve yalnızca yetkili makamların talebi üzerine paylaşılır. Süre dolunca kendiliğinden silinir.

## Saklama süreleri
• Özel mesajlar: son mesajdan 1 yıl sonra silinir.
• Akış gönderileri: 1 yıl sonra silinir.
• Bildirimler: 60 gün sonra silinir.
• Hesabını silince profilin, gönderilerin, mesajların ve oyun kayıtların hemen silinir.
• TC kimlik numaran hiç saklanmaz; yalnızca aynı kişinin ikinci bir hesabı doğrulamasını önlemek için geri çevrilemeyen bir özeti tutulur.
```

> Yayına çıkmadan önce bu metinleri ve "Veri saklama" sayfasındaki hukuki özeti bir avukata kontrol ettir. Özellikle yurt dışına aktarım (standart sözleşme ve Kurul'a bildirim) konusunu netleştir.
