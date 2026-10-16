# tools klasörü (sen çalıştırmayacaksın)

Bu klasördeki dosyalar, harita verisini yeniden üretmek ve indirme boyutunu ölçmek içindir. Bu işleri Claude yapar; sen hiçbirini çalıştırmak zorunda değilsin.

- `overture_indir.py`: Overture Maps'ten üç ilin (İstanbul, Kocaeli, İzmir) sınırlarını, yerlerini ve ana yollarını (otoyol, D-yolu) indirir.
- `harita_hazirla.py`: şehir başına petek haritasını (`app/src/lib/maps/*.json`: petekler, ilçe sınırları, ana yollar, adlar), yer listelerini (`supabase/places_<şehir>.csv`) ve şemadaki `map_land_ranges` verisini üretir. Bütün şehirlerde petek çapı aynıdır (500 m). `--yalniz-harita` ile yalnızca harita dosyaları yazılır.
- `yer_kurallari.py`: yer listesine hangi mekânların girdiği (hassas kategoriler çıkarılır) ve kategori adları.
- `boyut-olc.mjs`: uygulamanın Android ve iPhone paketini derleyip indirme boyutunu ölçer. Komut: `node tools/boyut-olc.mjs --json`
- `sema-parcala.mjs`: `supabase/schema.sql` dosyasını SQL Editor'ın kabul ettiği boyutta `supabase/parcalar/1.sql, 2.sql, ...` parçalarına böler. Şema her değiştiğinde çalıştırılır. Komut: `node tools/sema-parcala.mjs`

Yer listesini yenilemek için Claude'a yazman yeterli.
