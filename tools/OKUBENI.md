# tools klasörü (sen çalıştırmayacaksın)

Bu klasördeki dosyalar, harita verisini yeniden üretmek ve indirme boyutunu ölçmek içindir. Bu işleri Claude yapar; sen hiçbirini çalıştırmak zorunda değilsin.

- `yer_listesi_hazirla.py`: Overture Maps yerlerinden Kocaeli listesini hazırlar ve `supabase/places_kocaeli.csv` dosyasını üretir (hassas kategoriler çıkarılır).
- `petek_izgarasi_hazirla.py`: Kocaeli'nin kara peteklerini hesaplar, `kocaeli_cells.json` dosyasını üretir (uygulamadaki `src/lib/kocaeliCells.json` ve şemadaki `map_land_ranges` bununla aynıdır).
- `hexgrid.py`: petek matematiği; uygulamadaki `src/lib/hex.ts` ile birebir aynı sonucu vermelidir.
- `boyut-olc.mjs`: uygulamanın Android ve iPhone paketini derleyip indirme boyutunu ölçer (kod, görseller, yazı tipleri). Her sürümden önce çalıştırılır; sonuç `BOYUT_TAKIBI.md` tablosuna yazılır. Komut: `node tools/boyut-olc.mjs --json`

Yer listesini her ay yenilemek için Claude'a yazman yeterli.
