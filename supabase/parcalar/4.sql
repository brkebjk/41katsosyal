-- PARÇA 4 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

-- Paket 27: üyenin gönderdiği soru arşivlerinden eklenen sorular (159 farklı soru; dosyalardaki
-- tekrar eden "Varyasyon/Versiyon" kopyaları ve doğruluğu şüpheli 6 soru alınmadı). Aynı soru varsa dokunulmaz.
insert into public.quiz_questions (category, question, options, correct, difficulty) values
  ('kocaeli', 'Kocaeli''nin plaka kodu kaçtır?', array['34', '54', '41', '16'], 2, 1),
  ('kocaeli', 'Kocaeli''nin kuzeyinde hangi deniz bulunur?', array['Marmara Denizi', 'Karadeniz', 'Ege Denizi', 'Akdeniz'], 1, 1),
  ('kocaeli', 'İzmit Körfezi''ni geçişi sağlayan asma köprünün adı nedir?', array['15 Temmuz Şehitler Köprüsü', 'Yavuz Sultan Selim Köprüsü', 'Osmangazi Köprüsü', 'Çanakkale Köprüsü'], 2, 1),
  ('kocaeli', 'Kocaeli''nin il merkezi olan ilçesinin adı nedir?', array['Gebze', 'İzmit', 'Gölcük', 'Karamürsel'], 1, 1),
  ('kocaeli', 'Kocaeli''nin geleneksel tatlısı olarak bilinen pişmaniye hangi malzeme ile yapılır?', array['Pirinç ve süt', 'Un ve şeker', 'Ceviz ve bal', 'İncir ve ceviz'], 1, 2),
  ('kocaeli', 'Kocaeli''nde bulunan ve Osmanlı dönemine ait önemli bir saat kulesi nerededir?', array['Gebze', 'İzmit', 'Kandıra', 'Karamürsel'], 1, 2),
  ('kocaeli', 'Kocaeli''nin doğusunda hangi ilimiz yer alır?', array['Bursa', 'Yalova', 'Sakarya', 'İstanbul'], 2, 1),
  ('kocaeli', 'Kocaeli''nin batısında hangi büyük metropol yer alır?', array['Bursa', 'İstanbul', 'Yalova', 'Bilecik'], 1, 1),
  ('kocaeli', 'Hereke halıları ile meşhur olan Kocaeli ilçesi hangisidir?', array['Gölcük', 'Körfez', 'Kandıra', 'Başiskele'], 1, 2),
  ('kocaeli', 'Kocaeli''nin Karadeniz''e kıyısı olan turistik ilçesi hangisidir?', array['Karamürsel', 'Kandıra', 'Kartepe', 'Derince'], 1, 1),
  ('kocaeli', 'Kış turizmi ile öne çıkan Kartepe''nin zirvesi hangi dağ silsilesi üzerindedir?', array['Köroğlu Dağları', 'Samanlı Dağları', 'Uludağ', 'Aladağlar'], 1, 3),
  ('kocaeli', 'Kocaeli''de su sporları ve kampçılık için popüler olan baraj gölü hangisidir?', array['Yuvacık Barajı', 'Sapanca Gölü', 'Terkos Gölü', 'Eymir Gölü'], 0, 2),
  ('kocaeli', 'Gebze ilçesinde bulunan ve Fatih Sultan Mehmet''in vefat ettiği konaklama yeri neresidir?', array['Topkapı Sarayı', 'Hünkar Çayırı', 'Yıldız Sarayı', 'Edirne Sarayı'], 1, 3),
  ('kocaeli', 'Kocaeli''nin en yüksek rakımlı dağı hangisidir?', array['Kartepe', 'Uludağ', 'Ilgaz', 'Bozdağ'], 0, 2),
  ('tarih', 'Osmanlı İmparatorluğu''nun kuruluş yılı hangisidir?', array['1071', '1299', '1453', '1923'], 1, 1),
  ('tarih', 'İstanbul hangi yıl feth edilmiştir?', array['1325', '1453', '1516', '1520'], 1, 1),
  ('tarih', 'Malazgirt Savaşı hangi yılda gerçekleşmiştir?', array['1071', '1176', '1299', '1402'], 0, 1),
  ('tarih', 'Türkiye Cumhuriyeti''nin ilan edildiği yıl hangisidir?', array['1920', '1922', '1923', '1938'], 2, 1),
  ('tarih', 'I. Dünya Savaşı hangi yıllar arasında gerçekleşmiştir?', array['1912-1916', '1914-1918', '1939-1945', '1920-1924'], 1, 2),
  ('tarih', 'Fransız İhtilali hangi yılda başlamıştır?', array['1776', '1789', '1804', '1815'], 1, 2),
  ('tarih', 'Ankara Savaşı hangi Türk hükümdarları arasında yapılmıştır?', array['Osman Bey - Bizans', 'Fatih - İkinci Murad', 'Yıldırım Bayezid - Timur', 'Kanuni - Charles V'], 2, 3),
  ('tarih', 'Magna Carta Libertatum hangi yıl imzalanmıştır?', array['1066', '1215', '1314', '1492'], 1, 3),
  ('tarih', 'Kurtuluş Savaşı''nı resmen sona erdiren antlaşma hangisidir?', array['Sevr Antlaşması', 'Mondros Mütarekesi', 'Lozan Barış Antlaşması', 'Mudanya Ateşkesi'], 2, 2),
  ('tarih', 'Söğüt ve Domaniç''te kurulan beylik daha sonra hangi imparatorluğa dönüşmüştür?', array['Selçuklu', 'Büyük Hun', 'Osmanlı İmparatorluğu', 'Karakoyunlu'], 2, 1),
  ('cografya', 'Türkiye''nin başkenti neresidir?', array['İstanbul', 'İzmir', 'Ankara', 'Bursa'], 2, 1),
  ('cografya', 'Yüzölçümü en büyük olan gölümüz hangisidir?', array['Tuz Gölü', 'Van Gölü', 'Beyşehir Gölü', 'Eğirdir Gölü'], 1, 2),
  ('cografya', 'Dünyanın en uzun nehirlerinden biri olan Nil Nehri hangi kıtadadır?', array['Asya', 'Afrika', 'Güney Amerika', 'Avrupa'], 1, 1),
  ('cografya', 'Dünyanın en büyük okyanusu hangisidir?', array['Atlantik', 'Hint', 'Pasifik', 'Arktik'], 2, 1),
  ('cografya', 'Türkiye''nin en yüksek dağının adı nedir?', array['Erciyes Dağı', 'Süphan Dağı', 'Ağrı Dağı', 'Kaçkar Dağı'], 2, 1),
  ('cografya', 'Hangi kıta hem bir kıta hem de bir ülke olarak kabul edilir?', array['Antarktika', 'Avustralya', 'Asya', 'Avrupa'], 1, 2),
  ('cografya', 'Brezilya''nın başkenti neresidir?', array['Rio de Janeiro', 'Sao Paulo', 'Brasilia', 'Salvador'], 2, 2),
  ('cografya', 'Dünyanın en derin çukuru olan Mariana Çukuru hangi okyanustadır?', array['Atlantik', 'Hint', 'Pasifik', 'Arktik'], 2, 3),
  ('cografya', 'Avrupa ile Asya''yı birbirinden ayıran dağ silsilesi hangisidir?', array['Alpler', 'Ural Dağları', 'Kafkaslar', 'And Dağları'], 1, 2),
  ('cografya', 'Türkiye''nin en çok yağış alan bölgesi hangisidir?', array['Akdeniz Bölgesi', 'Karadeniz Bölgesi', 'Ege Bölgesi', 'İç Anadolu Bölgesi'], 1, 1),
  ('bilim', 'Suyun kimyasal formülü nedir?', array['CO2', 'H2O', 'NaCl', 'O2'], 1, 1),
  ('bilim', 'Işığın boşluktaki hızı yaklaşık ne kadardır?', array['150.000 km/s', '300.000 km/s', '450.000 km/s', '600.000 km/s'], 1, 2),
  ('bilim', 'Güneş sistemindeki en büyük gezegen hangisidir?', array['Satürn', 'Mars', 'Jüpiter', 'Neptün'], 2, 1),
  ('bilim', 'İnsan vücudundaki en büyük organ hangisidir?', array['Karaciğer', 'Akciğer', 'Kalp', 'Deri'], 3, 2),
  ('bilim', 'Fotosentez olayında bitkiler hangi gazı tüketir?', array['Oksijen', 'Azot', 'Karbondioksit', 'Hidrojen'], 2, 1),
  ('bilim', 'Hangi elementin simgesi ''Au''dur?', array['Gümüş', 'Bakır', 'Altın', 'Demir'], 2, 2),
  ('bilim', 'Penisilini bulan bilim insanı kimdir?', array['Louis Pasteur', 'Alexander Fleming', 'Marie Curie', 'Albert Einstein'], 1, 2),
  ('bilim', 'Hücrenin enerji üretim merkezi olan organel hangisidir?', array['Ribozom', 'Mitokondri', 'Golgi cisimciği', 'Kloroplast'], 1, 2),
  ('bilim', 'Atomun çekirdeğinde hangi parçacıklar bulunur?', array['Proton ve Elektron', 'Proton ve Nötron', 'Elektron ve Nötron', 'Yalnız Elektron'], 1, 3),
  ('bilim', 'Rölativite (Görelilik) teorisini ortaya atan fizikçi kimdir?', array['Isaac Newton', 'Galileo Galilei', 'Albert Einstein', 'Nikola Tesla'], 2, 1),
  ('spor', 'Futbol maçları normal sürede kaçar dakikadır?', array['60 dakika', '80 dakika', '90 dakika', '120 dakika'], 2, 1),
  ('spor', 'Modern Olimpiyatlar ilk kez hangi şehirde düzenlenmiştir?', array['Paris', 'Atina', 'Londra', 'Roma'], 1, 2),
  ('spor', 'Basketbol maçında bir saha içi basketi en fazla kaç puan değerindedir?', array['1 puan', '2 puan', '3 puan', '4 puan'], 2, 1),
  ('spor', 'Tenis maçında ''Grand Slam'' turnuvaları yılda kaç kez yapılır?', array['2', '3', '4', '5'], 2, 2),
  ('spor', 'Hangi spor dalında ''korsan vuruşu'' veya ''smash'' terimleri sıkça kullanılır?', array['Futbol', 'Voleybol', 'Halter', 'Güreş'], 1, 1),
  ('spor', 'Maraton koşusu tam olarak kaç kilometre mesafededir?', array['21.097 metre', '42.195 metre', '50.000 metre', '10.000 metre'], 1, 3),
  ('spor', 'Satranç oyununda kaç taşla başlanır?', array['16 taş', '24 taş', '32 taş', '64 taş'], 2, 1),
  ('spor', 'Voleybol takımında sahada aynı anda kaç oyuncu bulunur?', array['5', '6', '7', '11'], 1, 1),
  ('spor', 'Boks maçlarında bir raunt genellikle kaç dakikadır?', array['2 dakika', '3 dakika', '4 dakika', '5 dakika'], 1, 2),
  ('sanat', 'Mona Lisa tablosunun ressamı kimdir?', array['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Rembrandt'], 1, 1),
  ('sanat', 'İstiklal Marşı''mızın bestecisi kimdir?', array['Mehmet Akif Ersoy', 'Zeki Üngör', 'Osman Zeki Üngör', 'Cemal Reşit Rey'], 2, 2),
  ('sanat', 'Osman Hamdi Bey''in en ünlü tablosu hangisidir?', array['Hünkar', 'Kaplumbağa Terbiyecisi', 'İstanbul Sokakları', 'Gecenin Sessizliği'], 1, 1),
  ('sanat', 'Dünyaca ünlü ''Yıldızlı Gece'' tablosunun sahibi kimdir?', array['Claude Monet', 'Pablo Picasso', 'Vincent van Gogh', 'Salvador Dali'], 2, 2),
  ('sanat', 'Türkiye''nin ilk opera sanatçısı ve ''Divaya'' unvanı verilen sanatçısı kimdir?', array['Leyla Gencer', 'Semiha Berksoy', 'Suna Korad', 'Pervin Çapar'], 1, 3),
  ('sanat', 'Sinemanın babaları olarak kabul edilen Fransız mucitler kimlerdir?', array['Lumière Kardeşler', 'Méliès Kardeşler', 'Edison ve Ford', 'Chaplin ve Keaton'], 0, 2),
  ('sanat', 'Türk edebiyatında ''Şair-i Azam'' olarak bilinen sanatçısı kimdir?', array['Namık Kemal', 'Ziya Paşa', 'Abdülhak Hâmid Tarhan', 'Tevfik Fikret'], 2, 3),
  ('sanat', 'Heykel sanatında ''Düşünen Adam'' eserinin yaratıcısı kimdir?', array['Michelangelo', 'Donatello', 'Auguste Rodin', 'Bernini'], 2, 2),
  ('sanat', 'Yakup Kadri Karaosmanoğlu''nun yaban adlı romanında anlattığı ana tema nedir?', array['Kurtuluş Savaşı', 'Aydın-köylü çatışması', 'İstanbul hayatı', 'Osmanlı''nın çöküşü'], 1, 2),
  ('sanat', 'Klasik müzikte ''Dokuzuncu Senfoni'' ile tanınan ve sağır olduktan sonra bile eser veren besteci kimdir?', array['Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Ludwig van Beethoven', 'Frédéric Chopin'], 2, 1),
  ('eglence', 'Yüzüklerin Efendisi''nde Tek Yüzük''ü yok etmekle görevli hobbit kimdir?', array['Aragorn', 'Gandalf', 'Frodo Baggins', 'Samwise Gamgee'], 2, 1),
  ('eglence', 'Harry Potter serisinde büyücülük okulunun adı nedir?', array['Durmstrang', 'Beauxbatons', 'Hogwarts', 'Ilvermorny'], 2, 1),
  ('eglence', 'Game of Thrones dizisindeki meşhur kış mottosu nedir?', array['Fire and Blood', 'Winter is Coming', 'We Do Not Sow', 'Ours is the Fury'], 1, 2),
  ('eglence', 'Minecraft oyununun yaratıcısı olan geliştirici kimdir?', array['Notch', 'Gabe Newell', 'Hideo Kojima', 'Will Wright'], 0, 2),
  ('eglence', 'Yunan mitolojisinde Zeus''un eşi ve tanrıların kraliçesi kimdir?', array['Athena', 'Afrodit', 'Hera', 'Artemis'], 2, 1),
  ('eglence', 'GTA serisinin yapımcısı olan oyun şirketi hangisidir?', array['Ubisoft', 'Electronic Arts', 'Rockstar Games', 'Bethesda'], 2, 1),
  ('eglence', 'Marvel evreninde demir zırhıyla tanınan kahraman kimdir?', array['Captain America', 'Thor', 'Iron Man', 'Hulk'], 2, 1),
  ('eglence', 'Star Wars evreninde ''Güç''ün karanlık tarafını temsil eden ana karakterlerden biri kimdir?', array['Luke Skywalker', 'Yoda', 'Darth Vader', 'Obi-Wan Kenobi'], 2, 1),
  ('eglence', 'Cyberpunk 2077 oyununun geçtiği kurgusal megakentin adı nedir?', array['Los Santos', 'Liberty City', 'Night City', 'Neo Tokyo'], 2, 2),
  ('eglence', 'Türk sinemasında ''Hababam Sınıfı'' serisinin yaratıcısı ünlü yazar kimdir?', array['Aziz Nesin', 'Rıfat Ilgaz', 'Orhan Kemal', 'Yaşar Kemal'], 1, 1),
  ('genel', 'UNESCO Dünya Mirası listesinde yer alan Göbeklitepe hangi ilimizdedir?', array['Gaziantep', 'Şanlıurfa', 'Adıyaman', 'Diyarbakır'], 1, 1),
  ('genel', 'Dünyanın yedi harikasından biri olan Keops Piramidi hangi ülkededir?', array['Yunanistan', 'Mısır', 'Irak', 'İran'], 1, 1),
  ('genel', 'Nobel Ödülleri hangi ülkede verilmektedir?', array['İsviçre', 'İsveç ve Norveç', 'Almanya', 'İngiltere'], 1, 2),
  ('genel', 'Dünyanın en kalabalık ülkesi hangisidir?', array['Çin', 'Hindistan', 'ABD', 'Endonezya'], 1, 2),
  ('genel', 'Eyfel Kulesi hangi ülkenin başkentindedir?', array['İtalya', 'Fransa', 'İspanya', 'Almanya'], 1, 1),
  ('genel', 'Para birimi ''Yen'' olan ülke hangisidir?', array['Çin', 'Güney Kore', 'Japonya', 'Tayland'], 2, 1),
  ('genel', 'Dünya Sağlık Örgütü''nün (WHO) merkezi hangi şehirde yer alır?', array['New York', 'Cenevre', 'Viyana', 'Brüksel'], 1, 3),
  ('genel', 'Kilometre kareye düşen insan sayısını ifade eden kavram nedir?', array['Nüfus artış hızı', 'Nüfus yoğunluğu', 'Demografik yapı', 'Net göç hızı'], 1, 2),
  ('genel', 'Uluslararası Saat Dilimi''nin başlangıç mercii olan Greenwich hangi ülkededir?', array['Fransa', 'İngiltere', 'ABD', 'Almanya'], 1, 1),
  ('genel', 'İnternetin temelini oluşturan ARPANET projesi hangi ülkenin savunma bakanlığı tarafından başlatılmıştır?', array['Rusya', 'İngiltere', 'ABD', 'Fransa'], 2, 3),
  ('kocaeli', 'İzmit''te bulunan ve Osmanlı padişahlarının İzmit''teki av köşkü olarak kullanılan yapı hangisidir?', array['Kasr-ı Hümayun (İzmit Sarayı)', 'Saat Kulesi', 'İmaret Camii', 'Sırrı Paşa Mükellef Mebusu'], 0, 3),
  ('kocaeli', 'Kocaeli''nin Karamürsel ilçesi ile üne kavuşan meşhur meyvesi hangisidir?', array['Karamürsel Sepet Elması', 'Hereke İnciri', 'Kandıra Karpuzu', 'Eşme Ayvası'], 0, 2),
  ('kocaeli', 'Kocaeli''nin Kandıra ilçesinde Karadeniz''e kıyısı olan ve kumlu plajlarıyla bilinen ünlü koy hangisidir?', array['Kerpe', 'Eskihisar', 'Darıca', 'Değirmendere'], 0, 1),
  ('kocaeli', 'Kocaeli''nin Darıca ilçesinde yer alan popüler hayvanat bahçesinin adı nedir?', array['Faruk Yalçın Hayvanat Bahçesi', 'Darica Botanik Parkı', 'Kocaeli Hayvanat Bahçesi', 'Marmara Doğa Parkı'], 0, 2),
  ('kocaeli', 'Kocaeli''nin İzmit ilçesinde bulunan tarihi saat kulesi hangi padişahın tahta çıkışının 25. yıl dönümü için inşa edilmiştir?', array['II. Abdülhamid', 'Abdülaziz', 'V. Mehmed Reşad', 'II. Mahmud'], 0, 3),
  ('kocaeli', 'Kocaeli''nin plaka kodundan hemen sonra gelen 42 hangi ile aittir?', array['Konya', 'Sakarya', 'Bursa', 'Balıkesir'], 0, 1),
  ('kocaeli', 'İzmit Körfezi''nin güney kıyısında yer alan ve donanma üssü ile bilinen Kocaeli ilçesi hangisidir?', array['Gölcük', 'Karamürsel', 'Körfez', 'Derince'], 0, 1),
  ('kocaeli', 'Kocaeli''nin Kartepe ilçesinde winter sporları dışında yaz aylarında popüler olan yayla hangisidir?', array['Kuzuyayla', 'Kartepe Yaylası', 'Aytepe', 'Soğuksu Yaylası'], 0, 2),
  ('tarih', 'Mustafa Kemal Atatürk''ün Samsun''a çıkış tarihi tam olarak nedir?', array['19 Mayıs 1919', '23 Nisan 1920', '29 Ekim 1923', '30 Ağustos 1922'], 0, 1),
  ('tarih', 'I. TBMM hangi yıl açılmıştır?', array['1919', '1920', '1922', '1923'], 1, 1),
  ('tarih', 'Sakarya Meydan Muharebesi kaç gün sürmüştür?', array['10 gün 10 gece', '22 gün 22 gece', '30 gün 30 gece', '40 gün 40 gece'], 1, 3),
  ('tarih', 'Amasya Genelgesi''nin yayımlandığı yıl ve ay hangisidir?', array['Mayıs 1919', 'Haziran 1919', 'Temmuz 1919', 'Ağustos 1919'], 1, 2),
  ('tarih', 'Sivas Kongresi kaç gün sürmüştür?', array['4 gün', '7 gün', '15 gün', '30 gün'], 1, 3),
  ('tarih', 'Osmanlı Devleti''nin ilk başkenti neresidir?', array['Bursa', 'Edirne', 'Söğüt', 'İstanbul'], 2, 1),
  ('tarih', 'Trablusgarp Savaşı hangi devletle yapılmıştır?', array['İtalya', 'İngiltere', 'Fransa', 'Rusya'], 0, 2),
  ('tarih', 'Cumhuriyet tarihinin ilk başbakanı kimdir?', array['Fevzi Çakmak', 'İsmet İnönü', 'Rauf Orbay', 'Ali Fethi Okyar'], 1, 2),
  ('tarih', 'Lozan Barış Antlaşması hangi yıl imzalanmıştır?', array['1920', '1922', '1923', '1924'], 2, 1),
  ('cografya', 'Türkiye''nin en büyük tuz gölü olan Tuz Gölü hangi coğrafi bölgededir?', array['İç Anadolu Bölgesi', 'Doğu Anadolu Bölgesi', 'Akdeniz Bölgesi', 'Marmara Bölgesi'], 0, 1),
  ('cografya', 'Türkiye''nin en uzun akarsuyu hangisidir?', array['Fırat', 'Dicle', 'Kızılırmak', 'Sakarya'], 2, 2),
  ('cografya', 'Van Gölü''nün ortasında yer alan ve tarihi kilisesiyle bilinen adanın adı nedir?', array['Akdamar Adası', 'Gümüş Adası', 'Bozcaada', 'Cunda Adası'], 0, 2),
  ('cografya', 'Ege Bölgesi''nde kıyıdan içeriye doğru uzanan dağların genel adı nedir?', array['Kıvrım dağları', 'Kırıklı dağlar', 'Volkanik dağlar', 'Kıyıya paralel dağlar'], 1, 3),
  ('cografya', 'Akdeniz ikliminin temel bitki örtüsü nedir?', array['Bozkır', 'Maki', 'Tayga ormanları', 'Tundra'], 1, 1),
  ('cografya', 'Türkiye''nin komşuları arasında en uzun karasınırına sahip olan ülke hangisidir?', array['İran', 'Irak', 'Bulgaristan', 'Suriye'], 3, 2),
  ('cografya', 'Karadeniz''in en çok yağış alan bölümü hangisidir?', array['Batı Karadeniz', 'Orta Karadeniz', 'Doğu Karadeniz', 'Yıldız Dağları Bölümü'], 2, 1),
  ('cografya', 'Türkiye''nin yüzölçümü bakımından en büyük ili hangisidir?', array['Ankara', 'Sivas', 'Konya', 'Erzurum'], 2, 1),
  ('cografya', 'Munzur Vadisi Milli Parkı hangi ilimizdedir?', array['Erzincan', 'Tunceli', 'Bingöl', 'Elazığ'], 1, 2),
  ('cografya', 'Pamukkale travertenleri hangi ilimizde yer almaktadır?', array['Muğla', 'Aydın', 'Denizli', 'İzmir'], 2, 1),
  ('bilim', 'DNA''nın çift sarmal modelini 1953 yılında açıklayan bilim insanları kimlerdir?', array['Albert Einstein', 'James Watson ve Francis Crick', 'Marie Curie', 'Gregor Mendel'], 1, 2),
  ('bilim', 'Periyodik tablonun oluşturulmasında büyük katkı sağlayan Rus kimyager kimdir?', array['Antoine Lavoisier', 'Dmitri Mendeleyev', 'John Dalton', 'Robert Boyle'], 1, 2),
  ('bilim', 'Kuduz aşısını bulan ünlü Fransız mikrobiyolog kimdir?', array['Alexander Fleming', 'Louis Pasteur', 'Robert Koch', 'Edward Jenner'], 1, 1),
  ('bilim', 'Güneş sistemindeki en sıcak gezegen hangisidir?', array['Merkür', 'Venüs', 'Mars', 'Jüpiter'], 1, 3),
  ('bilim', 'İnsan vücudunda oksijen taşıyan kırmızı kan hücrelerine ne ad verilir?', array['Lökosit', 'Eritrosit', 'Trombosit', 'Plazma'], 1, 2),
  ('bilim', 'Elektrik akımının birimi nedir?', array['Volt', 'Watt', 'Amper', 'Ohm'], 2, 1),
  ('bilim', 'Hangi vitamin güneşi gördüğümüzde vücudumuzda sentezlenir?', array['A Vitamini', 'B Vitamini', 'C Vitamini', 'D Vitamini'], 3, 1),
  ('bilim', 'Karasal ekosistemlerde azot döngüsünde temel rol oynayan canlılar hangileridir?', array['Virüsler', 'Bakteriler ve arkeler', 'Mantarlar', 'Algler'], 1, 3),
  ('bilim', 'Evrenin genişlediğini gözlemleriyle kanıtlayan ve adını uzay teleskobuna veren astronom kimdir?', array['Galileo Galilei', 'Johannes Kepler', 'Edwin Hubble', 'Carl Sagan'], 2, 2),
  ('bilim', 'Suyun donma noktası Celsius ölçeğinde kaç derecedir?', array['-10 derece', '0 derece', '4 derece', '100 derece'], 1, 1),
  ('spor', 'FIFA Dünya Kupası''nı en çok kazanan milli futbol takımı hangisidir?', array['Almanya', 'İtalya', 'Brezilya', 'Arjantin'], 2, 1),
  ('spor', 'Basketbolu icat eden kişi kimdir?', array['Michael Jordan', 'James Naismith', 'Wilt Chamberlain', 'Kobe Bryant'], 1, 2),
  ('spor', 'Modern Olimpiyat bayrağındaki beş halka hangi kıtaları simgeler?', array['Okyanusya', 'Afrika, Amerika, Asya, Avrupa, Okyanusya', 'Avrupa', 'Asya'], 1, 3),
  ('spor', 'Tenis turnuvalarından Wimbledon hangi ülkede düzenlenmektedir?', array['Fransa', 'ABD', 'İngiltere', 'Avustralya'], 2, 1),
  ('spor', 'Formula 1 yarışlarında yarışın bittiğini ve kazananın geçtiğini belirten bayrak hangi renktedir?', array['Kırmızı bayrak', 'Sarı bayrak', 'Damalı siyah-beyaz bayrak', 'Mavi bayrak'], 2, 1),
  ('spor', 'Türkiye''nin ilk olimpiyat madalyasını kazandığı spor dalı hangisidir?', array['Halter', 'Güreş', 'Ağırlık', 'Boks'], 1, 2),
  ('spor', 'Voleybolda arka alandaki oyuncuların savunma yapmasını sağlayan özel forma giyen oyuncuya ne ad verilir?', array['Pasör', 'Smaçör', 'Libero', 'Blokör'], 2, 1),
  ('spor', 'Galatasaray hangi yıl UEFA Kupası''nı kazanmıştır?', array['1996', '2000', '2001', '2003'], 1, 2),
  ('spor', 'Maraton koşusu olimpiyatlara ilk kez hangi yıl dahil edilmiştir?', array['1896 Atina', '1900 Paris', '1924 Londra', '1936 Berlin'], 0, 3),
  ('spor', 'Buz hokeyi maçlarında bir takımda sahada aynı anda kaç oyuncu bulunur?', array['4 oyuncu', '5 oyuncu', '6 oyuncu', '7 oyuncu'], 2, 2),
  ('sanat', 'Pablo Picasso''nun mavi renk tonlarının ağırlıkta olduğu dönemi ne olarak adlandırılır?', array['Pembe Dönem', 'Mavi Dönem', 'Kübizm Dönemi', 'Klasik Dönem'], 1, 2),
  ('sanat', 'Türk edebiyatının ilk yerli romanı olan ''Taaşşuk-ı Talat ve Fitnat''ın yazarı kimdir?', array['Namık Kemal', 'Şemsettin Sami', 'Recaizade Mahmud Ekrem', 'Ahmet Mithat Efendi'], 1, 3),
  ('sanat', 'William Shakespeare''in ''Olmak ya da olmamak, bütün mesele bu'' repliği hangi oyununda geçer?', array['Macbeth', 'Hamlet', 'Othello', 'Kral Lear'], 1, 1),
  ('sanat', 'İtalyan Rönesans''ının dev heykeltıraşı ve ressamı olan, ''Davut'' heykelinin yaratıcısı kimdir?', array['Leonardo da Vinci', 'Donatello', 'Michelangelo', 'Raphael'], 2, 2),
  ('sanat', 'Nobel Edebiyat Ödülü''nü kazanan ilk Türk yazar kimdir?', array['Yaşar Kemal', 'Orhan Pamuk', 'Ahmet Hamdi Tanpınar', 'Nazım Hikmet'], 1, 1),
  ('sanat', 'Ressam Osman Hamdi Bey''in kurduğu ve günümüzdeki Mimar Sinan Güzel Sanatlar Üniversitesi''nin temelini oluşturan okulun adı nedir?', array['Darüşşafaka', 'Sanayi-i Nefise Mektebi', 'Mekteb-i Mülkiye', 'Darülfünun'], 1, 3),
  ('sanat', 'Çok sesli batı müziğinde ''Ay Işığı Sonatı'' ile tanınan besteci kimdir?', array['Johann Sebastian Bach', 'Ludwig van Beethoven', 'Frédéric Chopin', 'Wolfgang Amadeus Mozart'], 1, 2),
  ('sanat', 'Victor Hugo''nun ünlü romanı ''Sefiller''in baş kahramanı kimdir?', array['Quasimodo', 'Jean Valjean', 'Cosette', 'Javert'], 1, 1),
  ('sanat', 'Türk sinemasının ''Sultan'' lakaplı ünlü oyuncusu kimdir?', array['Hülya Koçyiğit', 'Filiz Akın', 'Türkan Şoray', 'Fatma Girik'], 2, 1),
  ('sanat', 'Mimar Sinan''ın ''ustalık eserim'' olarak nitelendirdiği cami hangisidir?', array['Süleymaniye Camii', 'Selimiye Camii', 'Şehzadebaşı Camii', 'Fatih Camii'], 1, 1),
  ('eglence', 'The Witcher serisinin ana karakteri olan ünlü cadının adı nedir?', array['Geralt of Rivia', 'Vesemir', 'Lambert', 'Eskel'], 0, 1),
  ('eglence', 'Cyberpunk evreninde geçen ve Johnny Silverhand karakterini canlandıran ünlü aktör kimdir?', array['Brad Pitt', 'Keanu Reeves', 'Tom Cruise', 'Christian Bale'], 1, 1),
  ('eglence', 'League of Legends oyununda Demacia''nın adalet simgesi olan şampiyon kimdir?', array['Garen', 'Darius', 'Ahri', 'Yasuo'], 0, 2),
  ('eglence', 'Yunan mitolojisinde denizler, depremler ve atlar tanrısı olan, elinde üçlü mızrak taşıyan tanrı kimdir?', array['Zeus', 'Hades', 'Poseidon', 'Ares'], 2, 1),
  ('eglence', 'Sinema tarihine damga vuran ''Baba'' film serisinin yönetmeni kimdir?', array['Martin Scorsese', 'Quentin Tarantino', 'Francis Ford Coppola', 'Christopher Nolan'], 2, 2),
  ('eglence', 'J.R.R. Tolkien''in Orta Dünya evreninde Mordor''un karanlık efendisi kimdir?', array['Saruman', 'Sauron', 'Morgoth', 'Witch-king'], 1, 1),
  ('eglence', 'Matrix filminde Neo''ya hap seçeneğini sunan karakter kimdir?', array['Trinity', 'Morpheus', 'Cypher', 'Oracle'], 1, 1),
  ('eglence', 'Harry Potter evreninde Slytherin binasının hayaleti kimdir?', array['Neredeyse Başsız Nick', 'Şişman Rahip', 'Kanlı Baron', 'Şeffaf Bilge'], 2, 3),
  ('eglence', 'Game of Thrones evreninde Ejderhaların Annesi olarak bilinen karakter kimdir?', array['Cersei Lannister', 'Sansa Stark', 'Daenerys Targaryen', 'Arya Stark'], 2, 1),
  ('genel', 'Birleşmiş Milletler''in merkezi hangi şehirde bulunmaktadır?', array['Cenevre', 'Viyana', 'New York', 'Paris'], 2, 1),
  ('genel', 'Nil Nehri hangi kıtadadır?', array['Atlas Okyanusu', 'Kızıldeniz', 'Afrika', 'Asya'], 2, 2),
  ('genel', 'Mona Lisa tablosu şu anda hangi müzede sergilenmektedir?', array['British Museum', 'Louvre Müzesi', 'Vatikan Müzeleri', 'Metropolitan Sanat Müzesi'], 1, 1),
  ('genel', 'Avrupa Birliği''nin yürütme organı olan kurumun adı nedir?', array['Avrupa Parlamentosu', 'Avrupa Komisyonu', 'Avrupa Konseyi', 'Adalet Divanı'], 1, 3),
  ('genel', 'Dünya üzerinde internet alan adlarında kullanılan ''.tr'' uzantısı hangi ülkeyi temsil eder?', array['Türkmenistan', 'Trinidad', 'Türkiye', 'Tunus'], 2, 1),
  ('genel', 'Yunanistan''ın başkenti neresidir?', array['Selanik', 'Atina', 'Patras', 'Larissa'], 1, 1),
  ('genel', 'Oscar ödüllerini veren resmi kurumun tam adı nedir?', array['Amerikan Film Enstitüsü', 'Sinema Sanatları ve Bilimleri Akademisi', 'Hollywood Film Birliği', 'Ulusal Sinema Konseyi'], 1, 3),
  ('genel', 'Dünya''nın uydusu olan Ay''a ayak basan ilk insan kimdir?', array['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], 2, 1),
  ('genel', 'Nobel Barış Ödülü hangi şehirde sahiplerine takdim edilir?', array['Stockholm', 'Oslo', 'Cenevre', 'Kopenhag'], 1, 3),
  ('genel', 'Türkiye''nin ilk yerli sondaj gemisinin adı nedir?', array['Yavuz', 'Kanuni', 'Fatih', 'Abdülhamid Han'], 2, 2)
on conflict do nothing;

-- Başlangıç sorularına zorluk derecesi (bir kez; moderatörün sonradan değiştirdiğine dokunulmaz)
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_quiz_difficulty_v1') then
    update public.quiz_questions set difficulty = 1 where question in (
      'Türkiye Cumhuriyeti hangi yıl ilan edildi?',
      'İstanbul hangi yıl fethedildi?',
      'Osmanlı Devleti''nin kurucusu kimdir?',
      'İstanbul''u fetheden padişah kimdir?',
      'Mustafa Kemal Samsun''a hangi tarihte çıktı?',
      'Çanakkale Savaşı hangi yıl başladı?',
      'Mustafa Kemal Atatürk hangi şehirde doğdu?',
      'Türkiye''nin en yüksek dağı hangisidir?',
      'Türkiye''nin en büyük gölü hangisidir?',
      'Japonya''nın başkenti neresidir?',
      'Türkiye kaç coğrafi bölgeye ayrılır?',
      'Pamukkale travertenleri hangi ilimizdedir?',
      'İtalya''nın başkenti neresidir?',
      'Mısır''ın başkenti neresidir?',
      'Almanya''nın başkenti neresidir?',
      'Eyfel Kulesi hangi şehirdedir?',
      'Su deniz seviyesinde kaç derecede kaynar?',
      'Suyun kimyasal formülü nedir?',
      '“Kızıl Gezegen” olarak bilinen gezegen hangisidir?',
      'Bitkilerin güneş ışığıyla kendi besinini üretmesine ne denir?',
      'Görelilik kuramı hangi bilim insanına aittir?',
      'Bir üçgenin iç açıları toplamı kaç derecedir?',
      'Dünya''nın tek doğal uydusu hangisidir?',
      'Pi sayısının yaklaşık değeri kaçtır?',
      'Futbolda bir takım sahaya kaç oyuncuyla çıkar?',
      'Basketbolda bir takımın sahadaki oyuncu sayısı kaçtır?',
      'Olimpiyat bayrağında kaç halka vardır?',
      'Futbolda “hat-trick” ne demektir?',
      'Satrançta oyunun başında her oyuncunun kaç piyonu vardır?',
      'FIFA Dünya Kupası kaç yılda bir düzenlenir?',
      'Basketbolda üç sayı çizgisinin dışından atılan basket kaç sayıdır?',
      'Kırkpınar''da hangi güreş türü yapılır?',
      'Bir futbol maçının normal süresi kaç dakikadır?',
      'Mona Lisa tablosunu kim yaptı?',
      'İstiklal Marşı''nın şairi kimdir?',
      '“Romeo ve Juliet” oyununun yazarı kimdir?',
      'Hangisi yaylı bir çalgıdır?',
      'Mevlana Celaleddin Rumi''nin türbesi hangi ilimizdedir?',
      'Gökkuşağında geleneksel olarak kaç renk sayılır?',
      'Bir düzinede kaç adet vardır?',
      'Türk lirasının simgesi hangisidir?',
      '“Çölün gemisi” olarak anılan hayvan hangisidir?',
      'Karada en hızlı koşan hayvan hangisidir?',
      'Dev pandanın anavatanı hangi ülkedir?',
      'Artık yılda şubat ayı kaç gündür?',
      'Romen rakamıyla “X” kaçtır?',
      'Suşi hangi ülkenin mutfağına aittir?',
      'Belirgin halkalarıyla en çok bilinen gezegen hangisidir?',
      'Arılar çiçek nektarından ne üretir?',
      'Bir asırda kaç yıl vardır?',
      'Harry Potter serisinin yazarı kimdir?',
      'Hababam Sınıfı filmlerinde “İnek Şaban” karakterini kim canlandırdı?',
      '“Pop''un Kralı” lakabıyla bilinen sanatçı kimdir?',
      'Karagöz ile Hacivat ne tür bir sanattır?',
      'Pinokyo yalan söyleyince neyi uzar?',
      '“Rocky Balboa” hangi spor dalıyla ilgili bir film karakteridir?',
      'Keloğlan hangi tür eserlerin kahramanıdır?',
      'Kocaeli''nin il merkezi olan ilçe hangisidir?',
      'Kocaeli''de bulunan kayak merkezi hangisidir?',
      'Kocaeli hangi coğrafi bölgededir?',
      'Kocaeli''nin plaka kodu kaçtır?',
      'İzmit Körfezi hangi denizin bir koludur?'
    );
    update public.quiz_questions set difficulty = 3 where question in (
      'Türk kadınlarına milletvekili seçme ve seçilme hakkı hangi yıl verildi?',
      'Soyadı Kanunu hangi yıl kabul edildi?',
      'Sevr Antlaşması hangi yıl imzalandı?',
      'Kanuni Sultan Süleyman''ın kuşattığı ancak alamadığı Avrupa şehri hangisidir?',
      'Türkiye NATO''ya hangi yıl üye oldu?',
      'Lale Devri hangi padişahın döneminde yaşandı?',
      'Tanzimat Fermanı hangi yıl ilan edildi?',
      'Avustralya''nın başkenti neresidir?',
      'Kanada''nın başkenti neresidir?',
      'Nil Nehri hangi denize dökülür?',
      'Dünyanın en büyük adası hangisidir?',
      'Periyodik tabloda “Fe” hangi elementin simgesidir?',
      'Penisilini kim keşfetti?',
      'Atmosferde en çok bulunan gaz hangisidir?',
      'Elektrik akımının birimi nedir?',
      'İlk modern Olimpiyat Oyunları (1896) hangi şehirde yapıldı?',
      'Mimar Sinan''ın “ustalık eserim” dediği cami hangisidir?',
      '“Kaplumbağa Terbiyecisi” tablosunun ressamı kimdir?',
      '“Saatleri Ayarlama Enstitüsü” romanının yazarı kimdir?',
      'Beethoven''ın “Neşeye Övgü” bölümüyle bilinen senfonisi hangisidir?',
      'Bir yılda kaç ay 31 gün çeker?',
      'Nasreddin Hoca''nın türbesi hangi ilimizdedir?',
      'Mezarının Gebze''de olduğu kabul edilen Kartacalı komutan kimdir?',
      'Kocaeli adını hangi Osmanlı komutanından alır?'
    );
    insert into public.app_settings (key, value, description)
    values ('seed_quiz_difficulty_v1', 'true', 'Kurulum işareti: başlangıç sorularına zorluk derecesi verildi');
  end if;
end $$;

-- Bilgi Yarışması bir kez açılır (sonradan kapatırsan şemayı tekrar çalıştırmak onu yeniden açmaz)
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_quiz_enabled_v1') then
    update public.game_types set enabled = true where key = 'quiz';
    -- Eski oda usulü açık kalmış Bilgi Yarışması odaları kapatılır
    update public.game_rooms set status = 'cancelled', finished_at = now()
     where game_type = 'quiz' and status in ('lobby', 'playing');
    insert into public.app_settings (key, value, description)
    values ('seed_quiz_enabled_v1', 'true', 'Kurulum işareti: Bilgi Yarışması bir kez açıldı');
  end if;
end $$;

-- “Premium” adı “Abone” oldu: eski kurulumda kalmış ayar açıklamaları da güncellenir
update public.app_settings
   set description = 'Düzenleyenin katılımcılardan ayda en çok kazanabileceği puan (abone ile ücretsiz üye eşit olsun diye tek etkinliğin tavanı)'
 where key = 'pts_event_host_month_cap';
update public.app_settings
   set description = 'Ayda en çok kaç etkinlik açmaktan puan alınır (aboneler de dahil, herkes için aynı)'
 where key = 'pts_event_create_month_events';

-- ---------------------------------------------------------------------
-- Anlık bildirim (Realtime): yeni bildirim ve duyuru, uygulamaya açık bağlantı üzerinden hemen haber verilir.
-- Uygulama böylece birkaç saniyede bir sunucuya sormak zorunda kalmaz (sunucu yükü azalır).
-- Realtime yalnızca kişinin okuyabildiği satırları iletir: üye yalnızca KENDİ bildirimlerini ve etkin duyuruları görür.
-- Yazma izni yoktur; bildirim ve duyurular yine yalnızca sunucu fonksiyonlarıyla oluşur.
-- ---------------------------------------------------------------------
grant select on public.notifications, public.announcements to authenticated;
drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists announcements_active_select on public.announcements;
create policy announcements_active_select on public.announcements for select to authenticated
  using (is_active and public._is_active_user());
do $$ begin
  begin alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object or undefined_object then null; end;
  begin alter publication supabase_realtime add table public.announcements;
  exception when duplicate_object or undefined_object then null; end;
end $$;

-- Profil 4
grant execute on function public.submit_problem_report(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_list_problem_reports(text) to authenticated;
grant execute on function public.admin_close_problem_report(uuid) to authenticated;
grant execute on function public.my_privacy() to authenticated;
grant execute on function public.set_consent(text, boolean) to authenticated;
grant execute on function public.my_data_export() to authenticated;
grant execute on function public.my_invite() to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
grant execute on function public.invite_buy(text) to authenticated;
grant execute on function public.invite_use_cell_name(int, int, text) to authenticated;
grant execute on function public.admin_alias_codes() to authenticated;
grant execute on function public.dm_open_by_name(text) to authenticated;
grant execute on function public.cell_feed_summary(int, int) to authenticated;
grant execute on function public.game_seek_list(int, int) to authenticated;
grant execute on function public.game_seek_games() to authenticated;
grant execute on function public.game_seek_join(int, int, int, int, text) to authenticated;
grant execute on function public.game_seek_leave() to authenticated;
grant execute on function public.game_seek_friend_request(uuid) to authenticated;
grant execute on function public.game_seek_block(uuid) to authenticated;
grant execute on function public.admin_set_alias_code(int) to authenticated;

-- Puan kuralları (yeni düzen): yan yana oyun uzaktanın 5 katı (uzaktan %20); uzaktan oyunda sınır geniş; Bilgi
-- Yarışması günde 15 puan, aylık sınır pratikte yok; oda hakkı abonede 12; Oyun Geceleri etkinlik oyunu ×1,5.
-- Ayarlar bir kez çevrilir (rules_v5 işareti); sonra moderatör web panelden değiştirebilir.
insert into public.app_settings (key, value, description) values
  ('pts_event_game_night_pct', '150', 'Oyun Geceleri etkinlik oyununun puan çarpanı (yüzde; 150 = ×1,5)'),
  ('pts_event_game_pct', '125', 'Sosyal Buluşmalar ve Müzik & Eğlence etkinlik oyununun puan çarpanı (yüzde; 125 = ×1,25)')
on conflict (key) do update set description = excluded.description;
do $$
begin
  -- Bas-konuş hakkı her tartışmada 10 sn (bir kez çevrilir)
  if not exists (select 1 from public.app_settings where key = 'voice_10s_v1') then
    update public.app_settings set value = '10000' where key = 'sk_voice_round_ms';
    insert into public.app_settings (key, value, description)
    values ('voice_10s_v1', 'true', 'İç işaret: bas-konuş hakkı 10 sn yapıldı (silme)') on conflict (key) do nothing;
  end if;
  if not exists (select 1 from public.app_settings where key = 'pts_rules_v5') then
    update public.app_settings set value = '20' where key = 'pts_remote_pct';
    update public.app_settings set value = '10' where key = 'pts_remote_daily_cap';
    update public.app_settings set value = '100' where key = 'pts_remote_month_cap';
    update public.app_settings set value = '15' where key = 'pts_quiz_daily_points';
    update public.app_settings set value = '450' where key = 'pts_quiz_month_points';
    update public.app_settings set value = '12' where key = 'premium_monthly_game_quota';
    update public.app_settings set value = '3' where key = 'free_monthly_game_quota';
    insert into public.app_settings (key, value, description)
    values ('pts_rules_v5', 'true', 'İç işaret: yeni puan kuralları uygulandı (silme)')
    on conflict (key) do nothing;
  end if;
end $$;
update public.app_settings set description = 'Uzaktan oyunun puanı, aynı sonucun yan yana oyundaki puanının yüzde kaçı? (10–80; 20 = yan yana 5 kat)'
 where key = 'pts_remote_pct';

-- YENİ PUAN DÜZENİ (v6): oyun hakkı yok, herkes istediği kadar oynar. Her oyunun aylık puan hedefi: uzaktan 250,
-- yan yana 1.750 (yan yana 7 kat puan, konum doğrulanır, en az 5 kişi). Mekân kodu: mekânda oynanan yan yana oyuna
-- +%25. Bilgi Yarışması: günlük oyun ve günlük puan sınırı yok, ayda 250 puan. Etkinlik puanları büyür (etkinlikler
-- oyunların gerisinde kalmasın). Ayarlar bir kez çevrilir; sonra moderatör web panelden değiştirebilir.
insert into public.app_settings (key, value, description) values
  ('pts_side_mult', '7', 'Yan yana oynanan oyunun puan çarpanı (uzaktan oyunun kaç katı)'),
  ('pts_remote_month_points', '250', 'Uzaktan oyunda her oyunun aylık puan sınırı (hedefi)'),
  ('pts_side_month_points', '1750', 'Yan yana oyunda her oyunun aylık puan sınırı (hedefi)'),
  ('pts_venue_bonus_pct', '125', 'Mekân kodu ile mekânda oynanan yan yana oyunun puanı (yüzde; 125 = +%25)'),
  ('pts_party_min_players', '5', 'Köpekbalığı Kafesi ve Vampir–Köylü puan için en az oyuncu'),
  ('sponsor_credit_valid_hours', '6', 'Mekân kodu kaç saat geçerli (bu sürede mekânda açılan yan yana oyuna bonus)')
on conflict (key) do update set description = excluded.description;
do $$
begin
  if not exists (select 1 from public.app_settings where key = 'pts_rules_v6') then
    update public.app_settings set value = '100000' where key = 'quiz_daily_games';
    update public.app_settings set value = '100000' where key = 'pts_quiz_daily_points';
    update public.app_settings set value = '250' where key = 'pts_quiz_month_points';
    update public.app_settings set value = '300' where key = 'pts_quiz_win_base';
    update public.app_settings set value = '100' where key = 'pts_event_attend';
    update public.app_settings set value = '120' where key = 'pts_event_attend_10';
    update public.app_settings set value = '140' where key = 'pts_event_attend_20';
    update public.app_settings set value = '170' where key = 'pts_event_attend_40';
    update public.app_settings set value = '30' where key = 'pts_event_attend_official_bonus';
    update public.app_settings set value = '50' where key = 'pts_event_create';
    update public.app_settings set value = '2' where key = 'pts_event_create_month_events';
    update public.app_settings set value = '25' where key = 'pts_event_host_per_attendee';
    update public.app_settings set value = '1000' where key = 'pts_event_host_month_cap';
    update public.app_settings set value = '15' where key = 'pts_event_rate';
    update public.app_settings set value = '12' where key = 'pts_event_rated_5';
    update public.app_settings set value = '6' where key = 'pts_event_rated_4';
    update public.app_settings set value = '300' where key = 'pts_event_rated_month_cap';
    insert into public.app_settings (key, value, description)
    values ('pts_rules_v6', 'true', 'İç işaret: yeni puan düzeni (oyun hakkı yok, aylık puan hedefleri) uygulandı (silme)')
    on conflict (key) do nothing;
  end if;
end $$;


-- Etkinlik kod girişi: başlangıçtan 30 dakika sonra kapanır (Konser & Festival'de 15 dakika). Bir kez çevrilir.
insert into public.app_settings (key, value, description) values
  ('event_checkin_minutes_after', '30', 'Etkinlik: kod girişi başlangıçtan en geç kaç dakika sonrasına kadar açık? (Konser & Festival hariç)')
on conflict (key) do update set description = excluded.description;
do $$
begin
  if not exists (select 1 from public.app_settings where key = 'event_checkin_v7') then
    update public.app_settings set value = '15' where key = 'concert_checkin_minutes_after';
    insert into public.app_settings (key, value, description)
    values ('event_checkin_v7', 'true', 'İç işaret: kod girişi 30 dk / konser 15 dk kuralı uygulandı (silme)')
    on conflict (key) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
