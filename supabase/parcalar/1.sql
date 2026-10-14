-- PARÇA 1 / 3 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

-- =====================================================================
-- 41.Kat veritabanı şeması (Supabase / PostgreSQL)
--
-- Nasıl çalıştırılır: dosya SQL Editor'ın sınırından büyük olduğu için supabase/parcalar/ klasöründeki
-- 1.sql, 2.sql, 3.sql ... dosyalarını SIRAYLA çalıştır (SQL Editor > New query > dosyanın tamamını yapıştır > Run).
-- Parçalar bu dosyadan `node tools/sema-parcala.mjs` ile üretilir. Hata alırsan hatayı bana ilet; dosya tekrar
-- çalıştırılabilir şekilde yazıldı (iki kez çalıştırmak zarar vermez).
--
-- Güvenlik mantığı özeti:
--  * Her tablo kilitli gelir (RLS). Kullanıcı yalnızca izin verilen satırları görür.
--  * Anonimlik: gönderilerde sadece rumuz saklanır. Yazarın gerçek kimliği ayrı bir
--    tabloda (post_authors) durur ve hiçbir kullanıcı o tabloyu okuyamaz. Admin bile
--    sadece kayıt altına alınan özel fonksiyonla (admin_get_post_author) görebilir.
--  * Puan, premium, ban gibi alanlar sadece sunucu fonksiyonlarıyla değişir.
--  * Hesap: e-posta yok; kullanıcı adı + şifre ile girilir, şifre 12 kurtarma kelimesiyle sıfırlanır. Her telefondan
--    1 hesap açılır; hesaba başka telefondan girilince önceki oturum kapanır.
--  * Rumuz ve avatar her hafta Pazar 00:00'da (İstanbul saati) otomatik yenilenir.
--    Eski gönderiler yazıldıkları haftanın rumuzuyla kalır. Kimse rumuzunu değiştiremez.
--  * Üyelik: herkes yorum yazar, beğenir, ayda 1 etkinlik açar ve 3 oyun başlatır.
--    Premium üye ayrıca gönderi yazar, ayda 4 etkinlik açar, 10 oyun başlatır ve
--    41. Kat Sosyal etkinliklerine ücretsiz katılır. Premium, mağazadan (uygulama içi
--    satın alma) gelir; moderatör de hediye olarak verebilir. Puanla premium kazanılmaz.
--    Kotalar "app_settings" tablosundan değiştirilir. Moderatörün kotası yoktur.
--  * Oyun odaları: oda kodunu yalnızca oda sahibi görür (başkaları yan yana oturan birinden öğrenir).
--    Yan yana oynanan oyunlarda (çekiliş hariç) kişi aynı anda tek oyunda olabilir; oyun ekranından
--    ayrılan, uygulamayı kapatan ya da bağlantısı kopan oyuncu oyundan atılır ve geri dönemez; oda
--    sahibi ayrılırsa oda kapanır. Vampir–Köylü "Otomatik Oyun" (süreler kendi akar) ya da
--    "Ben Yöneticiyim" şekillerinde açılır.
-- =====================================================================

-- Rastgele kod üretimi için gerekli eklenti (Supabase'de "extensions" şemasında durur)
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Tipler
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

-- Sponsor (mekân) hesabı: yalnızca moderatör veritabanından verir. Yeni değer, eklendiği işlemde kullanılamaz;
-- bu yüzden şemanın hiçbir yerinde 'sponsor' değeri doğrudan yazılmaz, hep role::text = 'sponsor' karşılaştırılır.
alter type public.user_role add value if not exists 'sponsor';

do $$ begin
  create type public.package_type as enum ('daily', 'monthly', 'quarterly', 'yearly');
exception when duplicate_object then null; end $$;

create or replace function public.package_interval(p public.package_type)
returns interval language sql immutable as $$
  select case p
    when 'daily' then interval '1 day'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly' then interval '1 year'
  end;
$$;

-- ---------------------------------------------------------------------
-- 1b) Eski sürümden kalanları temizle (yeni kurulumda hiçbir şey yapmaz)
--     Premium artık kodla değil, moderatör tarafından verilir; kod tabloları ve
--     fonksiyonları kaldırıldı. Oda açma ve durum değiştirme fonksiyonları
--     yeniden adlandırıldı (create_room, set_room_status).
-- ---------------------------------------------------------------------
drop function if exists public.redeem_code(text);
drop function if exists public.admin_generate_codes(public.package_type, int, text);
drop function if exists public.admin_create_room(text, uuid);
drop function if exists public.admin_set_room_status(uuid, text);
drop function if exists public.random_alias();
drop table if exists public.code_attempts;
drop table if exists public.premium_codes;

-- ---------------------------------------------------------------------
-- 2) Tablolar
-- ---------------------------------------------------------------------

-- Kullanıcı profilleri: gerçek ad (sıralamada görünür) + rastgele rumuz (akışta görünür)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 60),
  alias text not null unique,
  avatar_index int not null default 1 check (avatar_index between 1 and 12),
  role public.user_role not null default 'user',
  points numeric(12, 2) not null default 0 check (points >= 0),
  level_rewarded int not null default 1,
  premium_until timestamptz,
  muted_until timestamptz,
  banned_at timestamptz,
  ban_reason text,
  created_at timestamptz not null default now()
);

-- Premium'un kaynağı: 'store' (mağazadan satın alma) ya da 'moderator' (hediye). Boşsa eski kayıt = moderatör.
alter table public.profiles add column if not exists premium_source text;
alter table public.profiles drop constraint if exists profiles_premium_source_check;
alter table public.profiles add constraint profiles_premium_source_check
  check (premium_source is null or premium_source in ('store', 'moderator', 'achievement'));

-- Seviyeler: belirli puana ulaşan kişi seviye atlar (yalnızca unvan; puanla premium kazanılmaz)
create table if not exists public.levels (
  level int primary key,
  name text not null,
  min_points int not null unique check (min_points >= 0),
  reward_package public.package_type
);
-- Seviye ödülü. Her seviye YALNIZCA kendi ödülünü verir (birikmez). Ödül her ay yeniden geçerlidir: oyun / etkinlik
-- hakkı o ayın hakkına eklenir; kullanılmayan hak sonraki aya geçmez (aylık haklar ay başında zaten sıfırlanır).
--   game_plus1 → ayda +1 oyun hakkı · event_plus1 → ayda +1 etkinlik hakkı
--   quiz_mult → Bilgi Yarışması puanı ve puan sınırları × level_quiz_mult_pct/100 · unlimited_lives → Bilgi Yarışması'nda sınırsız can
alter table public.levels add column if not exists perk text;
alter table public.levels drop constraint if exists levels_perk_check;
alter table public.levels add constraint levels_perk_check
  check (perk is null or perk in ('game_plus1', 'event_plus1', 'quiz_mult', 'unlimited_lives'));

-- Admin'in uygulamadan değiştirebileceği kurallar (kod değiştirmeden)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text
);

-- Etkinlikler (sosyal buluşmalar)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null,
  location text not null,
  starts_at timestamptz not null,
  capacity int not null,
  fee_amount numeric(10, 2) not null default 0 check (fee_amount >= 0),
  is_cancelled boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Etkinlikte açıklama, yer, zaman ve kontenjan zorunludur. Eski sürümden kalan
-- boş alanlar doldurulur, sonra kurallar eklenir (tekrar çalıştırmak güvenlidir).
update public.events set description = left(btrim(description), 1000) where char_length(btrim(description)) > 1000;
update public.events set location = left(btrim(location), 120) where char_length(btrim(location)) > 120;
update public.events set description = 'Açıklama eklenmedi.' where description is null or char_length(btrim(description)) < 10;
update public.events set location = 'Belirtilmedi' where location is null or char_length(btrim(location)) < 3;
update public.events set capacity = 50 where capacity is null or capacity < 1 or capacity > 10000;
alter table public.events alter column description set not null;
alter table public.events alter column location set not null;
alter table public.events alter column capacity set not null;
alter table public.events drop constraint if exists events_required_fields;
alter table public.events add constraint events_required_fields check (
  char_length(btrim(description)) between 10 and 1000
  and char_length(btrim(location)) between 3 and 120
  and capacity between 1 and 10000
);

-- Etkinlik kategorisi (uygulamada kutular halinde listelenir). Eski etkinlikler "diger" olur.
alter table public.events add column if not exists category text not null default 'diger';
-- Paket 27: oyunlu etkinlik. Düzenleyen etkinlik başlayınca (en az 4 doğrulanmış katılımcıyla) etkinlik oyunu açabilir;
-- etkinlik oyunlarının puanı 1,25 kattır.
alter table public.events add column if not exists with_games boolean not null default false;
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check check (
  category in ('konser_festival', 'oyun_gecesi', 'araba_motor', 'sosyal', 'muzik', 'spor', 'kultur', 'atolye', 'yemek', 'diger')
);

-- Yaş sınırı (zorunlu): 0 = yaş sınırı yok, 16, 18 ya da 21. Eski etkinlikler "yaş sınırı yok" olur.
-- Not: uygulama doğum tarihi tutmaz; sınır bilgilendirme amaçlıdır, katılırken kişi yaşını beyan eder.
alter table public.events add column if not exists min_age int not null default 0;
alter table public.events drop constraint if exists events_min_age_check;
alter table public.events add constraint events_min_age_check check (min_age in (0, 16, 18, 21));

-- Etkinliğin haritadaki bölgesi (petek). Etkinlik açarken haritadan seçilir; yalnızca haritada "burada etkinlik var" diye
-- gösterilir. Yoğunluk haritasıyla ilgisi yoktur: buradan hiçbir yoğunluk kaydı (map_signals) üretilmez.
-- Eski etkinliklerde boş kalır (haritada görünmezler).
alter table public.events add column if not exists cell_q int;
alter table public.events add column if not exists cell_r int;
alter table public.events drop constraint if exists events_cell_pair;
alter table public.events add constraint events_cell_pair check ((cell_q is null) = (cell_r is null));

create table if not exists public.event_registrations (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  fee_waived boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Oyun türleri
create table if not exists public.game_types (
  key text primary key,
  title text not null,
  description text,
  min_players int not null default 3,
  max_players int not null default 30,
  enabled boolean not null default false,
  sort_order int not null default 0
);

-- Oyun odaları (moderatör ya da premium üye açar, oyuncular kodla katılır)
create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  game_type text not null references public.game_types (key),
  event_id uuid references public.events (id) on delete set null,
  host_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'lobby',
  config jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Oda durumları: lobby (bekleme), playing (oynanıyor), finished (bitti), cancelled (başlamadan iptal)
alter table public.game_rooms drop constraint if exists game_rooms_status_check;
alter table public.game_rooms add constraint game_rooms_status_check
  check (status in ('lobby', 'playing', 'finished', 'cancelled'));

-- Oda kodları. Oyuna yalnızca yan yana olanların girmesi için kodu SADECE oda sahibi görür; bu yüzden kod
-- oda satırında değil, ayrı bir tabloda durur. Bu tabloyu kimse doğrudan okuyamaz (okuma izni yok, kural
-- da yok); koda yalnızca sunucu fonksiyonları dokunur: katılma, oda açma ve "oda sahibine kodu göster".
create table if not exists public.room_codes (
  room_id uuid primary key references public.game_rooms (id) on delete cascade,
  code text not null unique
);
alter table public.room_codes enable row level security;

-- Yanlış kod denemeleri (kod tahmin edilmesin diye). Doğrudan okunamaz; yalnızca join_room kullanır.
create table if not exists public.room_join_failures (
  user_id uuid not null references public.profiles (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index if not exists room_join_failures_user_idx on public.room_join_failures (user_id, failed_at);
alter table public.room_join_failures enable row level security;

-- Eski kurulumlarda kod game_rooms içindeydi: ayrı tabloya taşınır, sonra eski sütun kaldırılır.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'game_rooms' and column_name = 'code') then
    insert into public.room_codes (room_id, code)
    select id, code from public.game_rooms where code is not null
    on conflict do nothing;
    alter table public.game_rooms drop column code;
  end if;
end $$;

-- Odadaki oyuncular (herkesin görebildiği bilgiler)
create table if not exists public.room_players (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  is_alive boolean not null default true,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Oyunda kalma kuralları için: oyun türü "yan yana oynanır" mı, kimin en son ne zaman ekranda olduğu,
-- oyundan ayrılan oyuncu. Çekiliş bunun dışındadır (moderatör odayı uzun süre açık tutar).
alter table public.game_types add column if not exists presence_required boolean not null default true;
update public.game_types set presence_required = false where key = 'raffle';
-- Uzaktan oynanan oyun (Bilgi Yarışması): yan yana oturmak gerekmez ve oyun hakkından (aylık kota) yemez.
-- Oda sahibi aynı anda tek açık uzaktan oda tutabilir. (Satırlar aşağıda, oyun türleri eklendikten sonra işaretlenir.)
alter table public.game_types add column if not exists remote boolean not null default false;
alter table public.game_types add column if not exists uses_quota boolean not null default true;
alter table public.game_rooms add column if not exists host_seen_at timestamptz not null default now();
-- Uzaktan oda (Vampir–Köylü): herkes kendi telefonundan, sesli sohbetle oynar. Konum, bölge ve yakınlık aranmaz.
-- Puanı yan yana oyunun yarısıdır ve ayrı (daha düşük) günlük/aylık sınırı vardır (kaynak: game_remote).
alter table public.game_rooms add column if not exists remote boolean not null default false;
-- Uzaktan odada oylamayla atılanlar: aynı odaya geri giremez. Doğrudan okunamaz (yalnızca sunucu fonksiyonları).
create table if not exists public.room_bans (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_bans enable row level security;

-- Yan yana oyunda oda sahibinin KESİN konumu (enlem, boylam, telefonun bildirdiği hata payı). Yalnızca oda katılıma
-- açıkken (bekleme salonu) tutulur: katılanın odaya en çok ~100 metre (en çok 150 m) yakın olduğu kontrol edilir.
-- Oyun başlayınca, oda kapanınca ya da iptal edilince satır SİLİNİR. Katılanın kesin konumu hiç saklanmaz (yalnızca
-- karşılaştırılır). Kimse doğrudan okuyamaz; yedeğe girmez.
create table if not exists public.room_host_locations (
  room_id uuid primary key references public.game_rooms (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  acc real check (acc is null or acc between 0 and 5000),
  created_at timestamptz not null default now()
);
alter table public.room_host_locations enable row level security;
-- Odanın haritadaki bölgesi (petek) ve adres tarifi. Yan yana oynanan oyunu açan kişi haritadan peteği seçer ve
-- "Adres Tarifi" yazar (ör. "Kent Meydanı Kafe, 2. kat"); açık odalar listesinde ve haritada petek sayfasında görünür.
-- Eski odalarda boştur. Kod GİZLİ kalır (bkz. room_codes); bu alanlar kodu açığa çıkarmaz.
alter table public.game_rooms add column if not exists place_q int;
alter table public.game_rooms add column if not exists place_r int;
alter table public.game_rooms add column if not exists place_note text;
alter table public.game_rooms drop constraint if exists game_rooms_place_pair;
alter table public.game_rooms add constraint game_rooms_place_pair check ((place_q is null) = (place_r is null));
alter table public.room_players add column if not exists last_seen_at timestamptz not null default now();
alter table public.room_players add column if not exists left_at timestamptz;
alter table public.room_players add column if not exists left_reason text;
-- Oyundan elenme zamanı (Vampir–Köylü'de "kaçıncı sırada bitirdi" için: daha geç elenen öne geçer)
alter table public.room_players add column if not exists out_at timestamptz;
create index if not exists game_rooms_live_idx on public.game_rooms (status) where status in ('lobby', 'playing');
create index if not exists room_players_active_idx on public.room_players (user_id) where left_at is null;

-- Oyuncuya özel gizli bilgiler (rol gibi). Sadece kendisi ve moderatör görür.
create table if not exists public.room_player_secrets (
  room_id uuid not null,
  user_id uuid not null,
  role text,
  data jsonb not null default '{}'::jsonb,
  primary key (room_id, user_id),
  foreign key (room_id, user_id) references public.room_players (room_id, user_id) on delete cascade
);

-- Oyun hareket kaydı (oylar, cevaplar). Oyunlar eklenirken kullanılacak.
create table if not exists public.room_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Puan hareketleri
create table if not exists public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  reason text not null,
  room_id uuid references public.game_rooms (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists point_events_user_idx on public.point_events (user_id, created_at desc);

-- Oyun başına kaç kez oynandığı (başarımlar bundan hesaplanır). Yalnızca sunucu yazar.
create table if not exists public.user_game_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_type text not null references public.game_types (key),
  plays int not null default 0 check (plays >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);

-- Oyunda kazanma sayısı (yalnızca kazananı belli olan oyunlarda artar; oyun sıralaması bundan hesaplanır)
alter table public.user_game_stats add column if not exists wins int not null default 0;
alter table public.user_game_stats drop constraint if exists user_game_stats_wins_check;
alter table public.user_game_stats add constraint user_game_stats_wins_check check (wins >= 0);
-- Oyuna özel sıralama puanı: bu oyunda bitirdiğin sıralara göre aldığın puanların toplamı (sınırsız, yalnızca görsel)
alter table public.user_game_stats add column if not exists result_points numeric(12, 2) not null default 0;

-- Puan hareketinin kaynağı (üst sınırlar ve geri alma bunlara bakar) ve ilgili etkinlik.
-- Kaynaklar: admin, event_create, event_attend, event_host, event_reversal, game_play (yan yana oyun), quiz_play (Bilgi Yarışması), game_win (eski kayıtlar)
alter table public.point_events add column if not exists source text not null default 'admin';
alter table public.point_events add column if not exists event_id uuid references public.events (id) on delete set null;
create index if not exists point_events_source_idx on public.point_events (user_id, source, created_at);

-- Konuşma balonu kostümleri: her oyunun en yüksek başarımına ulaşan, o oyunun balonunu kazanır.
-- Görünüm (renkler) uygulamadadır; burada yalnızca kim hangisini kazandı ve seçti tutulur.
create table if not exists public.bubble_skins (
  key text primary key,
  label text not null,
  game_type text,
  required_plays int not null default 0 check (required_plays >= 0),
  sort_order int not null default 0
);
alter table public.bubble_skins enable row level security;
-- Paket 26: bazı balonlar oyun sayısıyla değil, başarım ödülüyle açılır (user_rewards)
alter table public.bubble_skins add column if not exists required_reward text;
insert into public.bubble_skins (key, label, game_type, required_plays, sort_order, required_reward) values
  ('standard', 'Standart', null, 0, 0, null),
  ('vampire_villager', 'Vampir–Köylü balonu', 'vampire_villager', 100, 1, 'vv_master'),
  ('find_killer', 'Katili Bul balonu', 'find_killer', 50, 2, null),
  ('quiz', 'Bilgi Yarışması balonu', 'quiz', 10000, 3, 'quiz_master'),
  ('taboo', 'Tabu balonu', 'taboo', 50, 4, null),
  ('charades', 'Sessiz Sinema balonu', 'charades', 50, 5, null),
  ('raffle', 'Çekiliş balonu', 'raffle', 20, 6, null)
on conflict (key) do update
  set label = excluded.label, game_type = excluded.game_type,
      required_plays = excluded.required_plays, sort_order = excluded.sort_order,
      required_reward = excluded.required_reward;
alter table public.profiles add column if not exists bubble_skin text not null default 'standard'
  references public.bubble_skins (key);

-- Paket 26: başarım ödülleri. Ödül, başarımın SON basamağında bir kez verilir ve kalıcıdır.
--  vv_master       : Vampir–Köylü'nün 5 görevi (100 oyun, 100 gece hayatta kal, doktorken 50 kişiyi koru,
--                    25 kez asıl, dedektifken 200 kez vampir bul) → Vampir balonu + Vampir–Köylü puanlarında kalıcı ×1,25
--  quiz_master     : 10.000 Bilgi Yarışması oyunu → Bilgi Yarışması balonu + en çok can kalıcı 6
--  treasure_master : 100 hazine → ömür boyu abonelik (moderatörlere bildirilir)
-- Bu tablolara üyeler doğrudan yazamaz ve okuyamaz; yalnızca sunucu fonksiyonları kullanır.
create table if not exists public.user_rewards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward text not null check (reward in ('vv_master', 'quiz_master', 'treasure_master')),
  granted_at timestamptz not null default now(),
  primary key (user_id, reward)
);
alter table public.user_rewards enable row level security;

-- Vampir–Köylü görev sayaçları. Oyun içinde odadaki gizli kayda (room_player_secrets.data->'ach') yazılır, yalnızca
-- kazananı belli olan, bitmiş oyunlarda (oyundan ayrılmayanlar için) buraya eklenir.
create table if not exists public.user_vv_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nights int not null default 0 check (nights >= 0),
  protects int not null default 0 check (protects >= 0),
  finds int not null default 0 check (finds >= 0),
  hanged int not null default 0 check (hanged >= 0),
  updated_at timestamptz not null default now()
);
alter table public.user_vv_stats enable row level security;

create or replace function public._has_reward(p_user uuid, p_reward text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_rewards w where w.user_id = p_user and w.reward = p_reward);
$$;
-- Ödülle açılan balonu (eski kuralla) seçmiş ama ödülü olmayan üye standart balona döner
update public.profiles p set bubble_skin = 'standard'
 where p.bubble_skin in (select b.key from public.bubble_skins b where b.required_reward is not null)
   and not exists (select 1 from public.user_rewards w join public.bubble_skins b on b.required_reward = w.reward
                    where w.user_id = p.id and b.key = p.bubble_skin);

-- Etkinlik katılım doğrulaması: kod yalnızca etkinliği açan kişiye görünür (bu tablo doğrudan okunamaz).
alter table public.event_registrations add column if not exists host_rewarded boolean not null default false;
-- Katılım puanı yazıldı mı? Yeni kuralda puan, etkinlikte yeterli sayıda kişi doğrulanınca açılır (bekleyen katılımlar olur).
-- Sütun ilk eklendiğinde eski kurallarla zaten puanı yazılmış katılımlar "yazıldı" sayılır; bir daha ödüllendirilmez.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'event_registrations' and column_name = 'attend_rewarded') then
    alter table public.event_registrations add column attend_rewarded boolean not null default false;
    update public.event_registrations set attend_rewarded = true where checked_in_at is not null;
  end if;
end $$;
-- Katılım puanının sonucu: gerçekte yazılan puan ve (puan yazılmadıysa) nedeni. Günde her kategoriden tek etkinlik ve
-- aynı düzenleyenden ayda tek katılım kuralları bunlara bakar (iptal edilen etkinlikler sayılmaz).
--   attend_note: 'category_daily' (bugün bu kategoriden zaten puan aldın) ya da 'host_cooldown' (bu düzenleyenden yakın zamanda aldın)
alter table public.event_registrations add column if not exists attend_points int not null default 0;
alter table public.event_registrations add column if not exists attend_note text;
update public.event_registrations er
   set attend_points = coalesce((select sum(pe.amount) from public.point_events pe
                                  where pe.user_id = er.user_id and pe.event_id = er.event_id
                                    and pe.source = 'event_attend'), 0)::int
 where er.attend_rewarded and er.attend_points = 0 and er.checked_in_at is not null;

-- Etkinliği kapatma talebi: kodla doğrulanmış katılımcısı olan etkinliği düzenleyen kendisi kapatamaz (puanlar ve
-- katılımcıların emeği boşa gitmesin); açıklamasıyla moderatöre talep gönderir. Moderatör onaylarsa etkinlik kapanır ve
-- etkinlikten kazanılan puanlar geri alınır. Doğrudan okunamaz; yalnızca fonksiyonlar kullanır.
create table if not exists public.event_close_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
create unique index if not exists event_close_requests_pending_idx
  on public.event_close_requests (event_id) where status = 'pending';
create index if not exists event_close_requests_status_idx on public.event_close_requests (status, created_at);
alter table public.event_close_requests enable row level security;

create table if not exists public.event_codes (
  event_id uuid primary key references public.events (id) on delete cascade,
  code text not null
);
alter table public.event_codes enable row level security;
-- Yanlış kod denemeleri (kod tahmin edilmesin diye)
create table if not exists public.event_code_failures (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index if not exists event_code_failures_idx on public.event_code_failures (user_id, event_id, failed_at);
alter table public.event_code_failures enable row level security;

-- Etkinlik beğenisi ve yorumu. Yorumlar GERÇEK ADLA görünür (uygulama yazarken uyarır).
create table if not exists public.event_likes (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_likes enable row level security;
create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists event_comments_event_idx on public.event_comments (event_id, created_at);
alter table public.event_comments enable row level security;

-- Akış: gönderiler (yalnızca rumuz içerir)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  avatar_index int not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  like_count int not null default 0,
  comment_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);

-- Gönderiye eklenen yer (isteğe bağlı). Yerin adı gönderide kopya olarak durur; yer listesi aylık yenilense de
-- eski gönderilerin yeri bozulmaz.
alter table public.posts add column if not exists place_id text;
alter table public.posts add column if not exists place_name text;
alter table public.posts add column if not exists place_label text;
alter table public.posts add column if not exists place_district text;

-- Gönderinin gerçek sahibi: kimse doğrudan okuyamaz
create table if not exists public.post_authors (
  post_id uuid primary key references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade
);
create index if not exists post_authors_author_idx on public.post_authors (author_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  alias text not null,
  avatar_index int not null,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.comment_authors (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade
);
create index if not exists comment_authors_author_idx on public.comment_authors (author_id);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Engelleme: kimin kimi engellediği istemciye hiç gösterilmez, sadece rumuz listelenir
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  blocked_alias text not null,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

-- Arkadaşlık: istek (pending), kabul (accepted), reddedilen (declined).
-- Reddedilen satır, isteği atanın tekrar tekrar istek göndermesini engellemek için tutulur;
-- gönderen bunu "yanıt bekleniyor" olarak görür (reddedildiği ona söylenmez).
-- Rumuzlar istek anındaki halidir: alıcı isteği atanın rumuzunu, gönderen karşı tarafın rumuzunu görür.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  requester_alias text not null,
  requester_avatar int not null,
  addressee_alias text not null,
  addressee_avatar int not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- Bir çift arasında yönden bağımsız yalnızca tek satır olabilir
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

-- Arkadaş kodu: yüz yüze tanışılan biriyle eşleşmek için sözlü paylaşılan 6 harfli kod (ilk istendiğinde üretilir)
alter table public.profiles add column if not exists friend_code text;
create unique index if not exists profiles_friend_code_idx on public.profiles (friend_code) where friend_code is not null;

-- Şikayetler
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

-- Şikayet edilebilen içerik türleri: gönderi, yorum ve etkinlik yorumu
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'event_comment', 'venue_review', 'room', 'event', 'quiz_chat', 'vv_whisper',
                         'vv_dead', 'dm', 'sk_voice'));

-- Paket 27: özel mesajlar (DM). Yalnızca rumuzla yazışılır; iki kişi arkadaşsa gerçek ad görünür.
-- Yazışmayı yalnızca abone başlatabilir; diğer taraf (abone olmasa da) cevap verebilir. Karşı taraf cevap verene kadar
-- en çok 3 mesaj. Arkadaş olmayanların yazışması haftalıktır: Pazartesi 00:00'da (rumuzlar değişince) kapanır ve
-- üyelerden gizlenir; arşivde feed_archive_days (365) gün tutulur, sonra silinir. Tablolar doğrudan okunamaz/yazılamaz.
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade, -- başlatan
  user_b uuid not null references public.profiles (id) on delete cascade,
  alias_a text not null,
  alias_b text not null,
  avatar_a int not null default 1,
  avatar_b int not null default 1,
  week date not null,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  read_a timestamptz,
  read_b timestamptz,
  check (user_a <> user_b)
);
create unique index if not exists dm_threads_pair_week_idx
  on public.dm_threads (least(user_a, user_b), greatest(user_a, user_b), week);
create index if not exists dm_threads_a_idx on public.dm_threads (user_a, last_at desc);
create index if not exists dm_threads_b_idx on public.dm_threads (user_b, last_at desc);
alter table public.dm_threads enable row level security;

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at);
create index if not exists dm_messages_sender_idx on public.dm_messages (sender_id, created_at);
alter table public.dm_messages enable row level security;

-- Moderatör işlem günlüğü (kimlik görüntüleme, ban, susturma, premium verme...)
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_user uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2b) Harita: yerler, kara petekleri, onaylar, yoğunluk kayıtları
--     Hiçbiri doğrudan okunamaz; yalnızca aşağıdaki fonksiyonlar kullanır (bkz. bölüm 9).
-- ---------------------------------------------------------------------

-- Kocaeli yer listesi (Overture Maps, ayda bir yenilenir). Dosya: supabase/places_kocaeli.csv
create table if not exists public.places (
  id text primary key,
  name text not null,
  search_text text not null,
  cat text,
  cat_label text,
  district text,
  address text,
  lat double precision not null,
  lon double precision not null,
  q int not null,
  r int not null,
  rank smallint not null default 3,
  confidence real
);
create index if not exists places_cell_idx on public.places (q, r);

-- Haritadaki kara petekleri: her satır aynı sıradaki (r) q0..q1 arası peteklerdir
create table if not exists public.map_land_ranges (
  r int not null,
  q0 int not null,
  q1 int not null,
  district smallint,
  primary key (r, q0)
);

-- Eski sürümde "haritaya katkı onayı" tablosu vardı; artık ayrı onay istenmiyor (yer eklemek ve oyuna girmek
-- zaten üyenin bilerek yaptığı, her seferinde önceden bildirilen işlemlerdir). Tablo kaldırıldı.
drop table if exists public.map_consents;

-- Yoğunluk kayıtları: kimin, hangi PETEKTE (tam konum değil), hangi kaynaktan. En çok 30 gün tutulur.
create table if not exists public.map_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  q int not null,
  r int not null,
  source text not null check (source in ('post', 'game')),
  room_id uuid,
  day date not null,
  created_at timestamptz not null default now()
);
create index if not exists map_signals_created_idx on public.map_signals (created_at);
create index if not exists map_signals_user_idx on public.map_signals (user_id);
create unique index if not exists map_signals_post_daily_idx on public.map_signals (user_id, q, r, day) where source = 'post';
create unique index if not exists map_signals_game_once_idx on public.map_signals (room_id, user_id) where source = 'game';

-- Premium ayrıcalıkları: anlaşmalı işletmelerin premium üyelere özel avantajları. Moderatör ekler.
-- Doğrudan okunamaz; yalnızca list_perks() kullanılır (ayrıntılar premium olmayana hiç gönderilmez).
create table if not exists public.perks (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 5 and 400),
  how_to text not null default '' check (char_length(how_to) <= 400),
  district text check (district is null or char_length(district) between 2 and 40),
  valid_until date,
  is_active boolean not null default true,
  sort_order int not null default 100 check (sort_order between 0 and 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2c) Sponsorlu mekânlar
--     Sponsor hesabı: profiles.role = 'sponsor' (yalnızca moderatör veritabanından verir). Her sponsor hesabın bir
--     mekân kaydı vardır. Bu tablolar doğrudan okunamaz; yalnızca bölüm 5g fonksiyonları kullanır
--     (şikayet edilen yorumları moderatör doğrudan okuyabilir).
-- ---------------------------------------------------------------------

-- Mekân bilgisi. Haritadaki petek (cell_q/cell_r) boşsa mekân haritada görünmez ama profili açılır.
create table if not exists public.venues (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 3 and 200),
  phone text check (phone is null or char_length(btrim(phone)) between 5 and 30),
  closing_hours text not null check (char_length(btrim(closing_hours)) between 2 and 60),
  cell_q int,
  cell_r int,
  -- Ayda oluşturabileceği oyun hakkı kodu sayısı; boşsa sponsor_code_default_quota ayarı geçerli, 0 = kod üretemez
  code_quota int check (code_quota is null or code_quota between 0 and 1000),
  created_at timestamptz not null default now(),
  check ((cell_q is null) = (cell_r is null))
);
create index if not exists venues_cell_idx on public.venues (cell_q, cell_r) where cell_q is not null;
alter table public.venues enable row level security;

-- Sponsorun üyeye verdiği tek kullanımlık oyun hakkı kodları
create table if not exists public.sponsor_codes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (user_id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz
);
create index if not exists sponsor_codes_venue_idx on public.sponsor_codes (venue_id, created_at desc);
alter table public.sponsor_codes enable row level security;

-- Yanlış kod denemeleri (deneme-yanılma ile kod bulunmasın)
create table if not exists public.sponsor_code_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index if not exists sponsor_code_failures_idx on public.sponsor_code_failures (user_id, failed_at);
alter table public.sponsor_code_failures enable row level security;

-- Bir kodu kullanan üyenin kazandığı EK oyun hakkı. Üye bu hakla bir oda açınca room_id dolar. Kullanılmamış
-- (room_id boş) hak varken yeni kod alınamaz: hak biriktirilemez. Puana hiçbir etkisi yoktur; puan sınırları aynen geçerli.
create table if not exists public.sponsor_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  venue_id uuid not null references public.venues (user_id) on delete cascade,
  code_id uuid references public.sponsor_codes (id) on delete set null,
  room_id uuid references public.game_rooms (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sponsor_credits_user_idx on public.sponsor_credits (user_id, created_at);
create index if not exists sponsor_credits_room_idx on public.sponsor_credits (room_id) where room_id is not null;
alter table public.sponsor_credits enable row level security;

-- Üyenin bir mekânın kodunu kullandığı günler. Aynı üye aynı mekânın kodunu günde (İstanbul saati) en çok 1 kez kullanır.
create table if not exists public.venue_visits (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (user_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_id uuid references public.sponsor_codes (id) on delete set null,
  day date not null,
  created_at timestamptz not null default now(),
  unique (venue_id, user_id, day)
);
create index if not exists venue_visits_user_idx on public.venue_visits (user_id);
alter table public.venue_visits enable row level security;

-- Mekân puanı (1–5 yıldız) ve yorumu: üye başına mekân başına tek kayıt (değiştirilebilir). Yorum GERÇEK ADLA görünür.
create table if not exists public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (user_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  body text check (body is null or char_length(btrim(body)) between 1 and 300),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
create index if not exists venue_reviews_venue_idx on public.venue_reviews (venue_id, created_at desc);
alter table public.venue_reviews enable row level security;

-- Sponsor hesabın gönderi ve yorumları gerçek adla yazılır; bu bayrak yazıldığı andaki durumu saklar
-- (sonradan sponsor yapılan üyenin eski anonim gönderileri açığa çıkmasın)
alter table public.posts add column if not exists by_sponsor boolean not null default false;
alter table public.comments add column if not exists by_sponsor boolean not null default false;

-- ---------------------------------------------------------------------
-- 2d) Hesap: kullanıcı adıyla giriş, kurtarma kelimeleri, tek oturum, cihaz başına 1 hesap, bildirimler
--     Bu tabloların hiçbiri doğrudan okunamaz; yalnızca bölüm 5h fonksiyonları kullanır.
-- ---------------------------------------------------------------------

-- Kullanıcı adı: yalnızca giriş için kullanılır, hiçbir üyeye gösterilmez (rumuz ve gerçek addan ayrıdır).
-- Eski (e-postayla açılmış) hesaplarda boştur; onlar e-postayla girmeye devam eder.
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_idx on public.profiles (username) where username is not null;
-- Gerçek ad değişikliği sayısı (üye yalnızca 1 kez değiştirebilir)
alter table public.profiles add column if not exists name_changes int not null default 0;
-- Hesabın geçerli oturumu: başka bir telefondan giriş yapılınca bu değişir, eski telefonun oturumu geçersiz olur
alter table public.profiles add column if not exists active_session uuid;

-- Kurtarma kelimeleri: 12 kelimenin yalnızca özeti (bcrypt) tutulur; kelimelerin kendisi hiçbir yerde saklanmaz.
-- confirmed: üye kelimeleri kaydettiğini (iki kelimeyi yazarak) doğruladı mı?
create table if not exists public.account_recovery (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phrase_hash text not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.account_recovery enable row level security;

-- Yanlış kurtarma denemeleri (kullanıcı adı ve bağlantı adresi başına sınır için)
create table if not exists public.recovery_failures (
  id bigint generated always as identity primary key,
  username text not null,
  ip text,
  failed_at timestamptz not null default now()
);
create index if not exists recovery_failures_user_idx on public.recovery_failures (username, failed_at);
create index if not exists recovery_failures_ip_idx on public.recovery_failures (ip, failed_at);
alter table public.recovery_failures enable row level security;

-- Cihaz başına 1 hesap: cihaz kimliğinin yalnızca özeti (sha256) tutulur. Hesap silinse de satır kalır
-- (hesabı silip aynı telefondan yeniden açarak yasaktan kaçılamasın); cihazı moderatör serbest bırakır.
create table if not exists public.device_accounts (
  device_hash text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists device_accounts_user_idx on public.device_accounts (user_id);
alter table public.device_accounts enable row level security;

-- Kişiye özel bildirimler (moderatör mesajı, arkadaşlık isteği, sistem mesajı; sonraki sürümlerde oyun ve ekip davetleri)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('admin_message', 'friend_request', 'system', 'game_invite', 'team_invite', 'mention', 'dm', 'room_msg'));
-- Paket 33: oda kapanınca o odanın davet / yazışma bildirimleri hızlı silinsin
create index if not exists notifications_room_idx on public.notifications ((data->>'room_id'))
  where kind in ('room_msg', 'game_invite');
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

-- Genel duyurular (moderatör herkese gönderir) ve kimin okuduğu
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);
alter table public.announcements enable row level security;
create table if not exists public.announcement_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
alter table public.announcement_reads enable row level security;

-- ---------------------------------------------------------------------
-- 2e) Harita: petek adları, ilçe bazlı haftalık sıfırlama, konum bildirimi; mekân görseli
-- ---------------------------------------------------------------------

-- Moderatörün verdiği petek adları. Adı verilmemiş peteğin adı uygulamada kendiliğinden üretilir.
create table if not exists public.map_cell_names (
  q int not null,
  r int not null,
  name text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (q, r)
);
create unique index if not exists map_cell_names_name_idx on public.map_cell_names (name);
alter table public.map_cell_names enable row level security;

-- Yoğunluk her ilçede haftada bir, o ilçenin gününde (00:00, Türkiye saati) sıfırlanır.
-- reset_dow: 1 = Pazartesi … 7 = Pazar. ilçe sırası uygulamadaki harita dosyasıyla aynıdır.
create table if not exists public.map_district_reset (
  district smallint primary key,
  name text not null,
  reset_dow int not null check (reset_dow between 1 and 7)
);
alter table public.map_district_reset enable row level security;
insert into public.map_district_reset (district, name, reset_dow) values
  (0, 'Karamürsel', 6), (1, 'Gölcük', 5), (2, 'Başiskele', 4), (3, 'Kartepe', 2),
  (4, 'Darıca', 2), (5, 'Çayırova', 3), (6, 'Gebze', 7), (7, 'Dilovası', 5),
  (8, 'Derince', 3), (9, 'Körfez', 6), (10, 'Kandıra', 7), (11, 'İzmit', 1)
on conflict (district) do update set name = excluded.name;

-- Konum bildirimi ('checkin': üye haritada "Buradayım" der) ve etkinlik katılımı ('event') da yoğunluğa sayılır.
-- 'quiz': Bilgi Yarışması (Solo / Uzaktan) oynayanın peteği. Yalnızca yoğunluğa sayılır; “Burada kim var?” sayısına
-- ve oyun davetindeki “yakındakiler”e sayılmaz (oyuncu o petekte biriyle buluşmuyor, uzaktan oynuyor).
alter table public.map_signals add column if not exists event_id uuid;
alter table public.map_signals drop constraint if exists map_signals_source_check;
alter table public.map_signals add constraint map_signals_source_check
  check (source in ('post', 'game', 'checkin', 'event', 'quiz'));
create unique index if not exists map_signals_quiz_once_idx on public.map_signals (room_id, user_id) where source = 'quiz';
create unique index if not exists map_signals_event_once_idx on public.map_signals (event_id, user_id) where source = 'event';
create index if not exists map_signals_cell_idx on public.map_signals (q, r, created_at);

-- Mekân profil resmi (Storage'daki dosyanın yolu). Moderatör yükler; mekânın avatarı yerine her yerde görünür.
alter table public.venues add column if not exists image_path text;
alter table public.venues drop constraint if exists venues_image_path_check;
alter table public.venues add constraint venues_image_path_check
  check (image_path is null or char_length(image_path) <= 200);

-- ---------------------------------------------------------------------
-- 2f) Oyun davetleri ve etkinlik ekipleri
--     Hiçbiri doğrudan okunamaz; yalnızca bölüm 5i fonksiyonları kullanır.
-- ---------------------------------------------------------------------

-- Oyun davetlerini almak isteyen üye (Oyunlar sekmesindeki mandal; varsayılan kapalı)
alter table public.profiles add column if not exists game_invites boolean not null default false;

-- Bir odaya kimin davet edildiği (aynı kişiye aynı odadan ikinci davet gitmez)
create table if not exists public.room_invites (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_invites_by_idx on public.room_invites (invited_by, created_at);
alter table public.room_invites enable row level security;
-- Paket 33: daveti kabul etme ve oda sahibiyle kısa yazışma (adres tarifi için). Yazışma özel mesajlarda listelenmez;
-- mesajlar bildirim olarak gelir, oda kapanınca bildirimler ve mesajlar silinir. Tablolar doğrudan okunamaz/yazılamaz.
alter table public.room_invites add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists room_invites_id_idx on public.room_invites (id);
alter table public.room_invites add column if not exists accepted_at timestamptz;
-- Davetli odaya girince ya da oda kapanınca yazışma kapanır (bir daha mesaj atılamaz)
alter table public.room_invites add column if not exists closed_at timestamptz;
create table if not exists public.room_invite_msgs (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.room_invites (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists room_invite_msgs_invite_idx on public.room_invite_msgs (invite_id, created_at);
alter table public.room_invite_msgs enable row level security;

-- Etkinlikte "ekip arıyorum" (kayıtlı üye işaretler)
alter table public.event_registrations add column if not exists seeking_team boolean not null default false;

-- Etkinlik ekipleri: en çok 8 kişi. Ekipçe gelip kodu doğrulayanların katılım puanı artar (2 kişi x1,25, 4 kişi x1,5, 8 kişi x2).
create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.event_team_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.event_teams (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_team_members_team_idx on public.event_team_members (team_id);
create table if not exists public.event_team_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  contact text check (contact is null or char_length(contact) <= 200),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index if not exists event_team_invites_pending_idx
  on public.event_team_invites (event_id, from_user, to_user) where status = 'pending';
create index if not exists event_team_invites_to_idx on public.event_team_invites (to_user, status);
create index if not exists event_team_invites_from_idx on public.event_team_invites (from_user, created_at);
alter table public.event_teams enable row level security;
alter table public.event_team_members enable row level security;
alter table public.event_team_invites enable row level security;


-- ---------------------------------------------------------------------
-- 2g) Akış: cevaplar ve etiketler (@rumuz), tepkiler, etkinlik paylaşımı
--     post_mentions ve post_reactions doğrudan okunamaz; yalnızca fonksiyonlar kullanır.
-- ---------------------------------------------------------------------

-- Cevaplanan gönderi (cevapla ile yazılan gönderide dolu)
alter table public.posts add column if not exists reply_to uuid references public.posts (id) on delete set null;
-- Etkinlik paylaşımı: gönderi bir etkinliği tanıtır (düzenleyen gerçek adıyla paylaşır; etkinlik başına bir kez)
alter table public.posts add column if not exists event_id uuid references public.events (id) on delete cascade;
alter table public.posts add column if not exists by_event boolean not null default false;
create unique index if not exists posts_event_share_idx on public.posts (event_id) where event_id is not null;
-- Beğeni dışındaki tepkiler: gülme, artı (yeşil), eksi (kırmızı). Her üye bir gönderiye bunlardan en çok birini verir.
alter table public.posts add column if not exists laugh_count int not null default 0;
alter table public.posts add column if not exists plus_count int not null default 0;
alter table public.posts add column if not exists minus_count int not null default 0;

-- Gönderide etiketlenen (bahsedilen) üyeler: kim olduğu kimseye gösterilmez; yalnızca etiketlenen kişi kendi
-- ekranında "senden bahsedildi" görür ve "benden bahsedilenler" süzgecinde bulur.
create table if not exists public.post_mentions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);
create index if not exists post_mentions_user_idx on public.post_mentions (user_id, post_id);
alter table public.post_mentions enable row level security;

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('laugh', 'plus', 'minus')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_reactions enable row level security;

-- ---------------------------------------------------------------------
-- 2h) Etkinlik lideri başvuruları
--     Onaylanan üye "Etkinlik Lideri" olur ve ayda daha çok etkinlik açar (leader_monthly_event_quota).
--     Tablo doğrudan okunamaz; yalnızca bölüm 5j fonksiyonları kullanır. Hesap silinince başvuru da silinir.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists event_leader boolean not null default false;
create table if not exists public.event_leader_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 60),
  phone text not null check (phone ~ '^[0-9+]{10,16}$'),
  categories text[] not null default '{}',
  audience text not null check (audience in ('1-10', '10-30', '30-100', '100+')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
create unique index if not exists event_leader_applications_pending_idx
  on public.event_leader_applications (user_id) where status = 'pending';
create index if not exists event_leader_applications_status_idx on public.event_leader_applications (status, created_at);
alter table public.event_leader_applications enable row level security;

-- ---------------------------------------------------------------------
-- 2i) Etkinlik onayı ve görseli, petek akışı
--     approval: Konser & Festival etkinliği moderatör onayına kadar 'pending' (yalnızca açan ve moderatör görür).
--     image_status: üyenin yüklediği görsel moderatör onayına kadar 'pending' (başkasına gösterilmez).
--     posts.cell_q/r: petek akışına yazılan gönderi. Bu gönderiler genel akışta görünmez; yalnızca o peteğe en çok
--     1 petek uzaklıkta olanlar okur ve yazar.
-- ---------------------------------------------------------------------
alter table public.events add column if not exists approval text not null default 'approved';
alter table public.events drop constraint if exists events_approval_check;
alter table public.events add constraint events_approval_check check (approval in ('pending', 'approved', 'rejected'));
alter table public.events add column if not exists approval_note text;
alter table public.events add column if not exists image_path text;
alter table public.events add column if not exists image_status text;
alter table public.events drop constraint if exists events_image_status_check;
alter table public.events add constraint events_image_status_check
  check (image_status is null or image_status in ('pending', 'approved', 'rejected'));
create index if not exists events_pending_idx on public.events (created_at) where approval = 'pending' or image_status = 'pending';
alter table public.posts add column if not exists cell_q int;
alter table public.posts add column if not exists cell_r int;
alter table public.posts drop constraint if exists posts_cell_pair;
alter table public.posts add constraint posts_cell_pair check ((cell_q is null) = (cell_r is null));
create index if not exists posts_cell_idx on public.posts (cell_q, cell_r, created_at desc) where cell_q is not null;

-- Paket 23: haftalık akış. Her Pazartesi 00:00 (Türkiye saati) genel akış, petek akışları ve rumuz profilleri sıfırlanır.
-- Eski gönderiler SİLİNMEZ: üyeler göremez, arşivde feed_archive_days (365) gün tutulur (resmi talepler için; yalnızca
-- moderatör / veritabanı yöneticisi erişir), sonra kendiliğinden silinir. Yaklaşan etkinliğin paylaşımı etkinlik
-- geçene kadar görünür kalır.
create or replace function public._feed_week_start()
returns timestamptz language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$$;
create or replace function public._post_live(p_created timestamptz, p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_created >= public._feed_week_start()
      or (p_event is not null and exists (select 1 from public.events e
                                           where e.id = p_event and not e.is_cancelled
                                             and e.starts_at >= public._feed_week_start()));
$$;

-- Paket 23: zincir gönderi. Yazar kendi gönderisine en çok 4 devam ekleyebilir (toplam 5 parça). Devam parçaları
-- akışta ayrı görünmez; ilk gönderinin altında sırayla gösterilir. İlk gönderi silinirse parçaları da silinir.
alter table public.posts add column if not exists thread_root uuid references public.posts (id) on delete cascade;
alter table public.posts add column if not exists thread_no int not null default 0;
create index if not exists posts_thread_idx on public.posts (thread_root, thread_no) where thread_root is not null;

-- ---------------------------------------------------------------------
-- 2j) Hazine Avı
--     Moderatör haritada bir peteğe 3 kelimelik kod gizler (kâğıda yazıp yerine saklar). Kodu ilk bulan puanı alır;
--     kod tek kullanımlıktır. Tablo doğrudan okunamaz: kodlar yalnızca moderatör fonksiyonlarıyla görünür.
-- ---------------------------------------------------------------------
create table if not exists public.treasures (
  id uuid primary key default gen_random_uuid(),
  cell_q int not null,
  cell_r int not null,
  code text not null,
  code_key text not null,
  hint text not null check (char_length(btrim(hint)) between 3 and 300),
  difficulty text not null check (difficulty in ('kolay', 'orta', 'zor', 'imkansiz')),
  expires_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  found_by uuid references public.profiles (id) on delete set null,
  found_at timestamptz,
  removed_at timestamptz,
  -- Bulununca false olur; moderatör panelde görünce true (bildirim rozeti)
  admin_seen boolean not null default true
);
create unique index if not exists treasures_active_code_idx on public.treasures (code_key)
  where found_at is null and removed_at is null;
create index if not exists treasures_active_idx on public.treasures (cell_q, cell_r) where found_at is null and removed_at is null;
create index if not exists treasures_found_idx on public.treasures (found_by, found_at) where found_at is not null;
alter table public.treasures enable row level security;

create table if not exists public.treasure_failures (
  user_id uuid not null references public.profiles (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index if not exists treasure_failures_idx on public.treasure_failures (user_id, failed_at);
alter table public.treasure_failures enable row level security;

-- Düzenleyenin etkinliği erken kapatması (başlangıçtan 45 dk sonra, en az 4 kişi kodla doğrulanmışsa, etkinlik peteğinde)
alter table public.events add column if not exists closed_at timestamptz;
-- Moderatörün etkinliği "41. Kat Özel" olarak mı yayınladığı (Konser & Festival'de moderatör seçer)
alter table public.events add column if not exists as_official boolean not null default true;
-- Moderatör etiketi (işlevi yok, yalnızca görünür)
alter table public.events add column if not exists tag text;
alter table public.events drop constraint if exists events_tag_check;
alter table public.events add constraint events_tag_check check (tag is null or tag in ('tanitim_isbirligi'));

-- Etkinlik puanlama: kodla katılımı doğrulanmış üye, etkinlik bittikten sonra 7 gün içinde 1–5 yıldız verir (bir kez).
create table if not exists public.event_ratings (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_ratings enable row level security;

-- Hazinenin ipucu fotoğrafları (en çok 3; "treasure-images" kutusundaki yollar)
alter table public.treasures add column if not exists image_paths text[] not null default '{}';

-- Petek adı adayları: bir petekte 2 ay üst üste en çok oyun oynayan ya da etkinlik düzenleyen üye. Moderatöre bildirim
-- olarak düşer; moderatör kişiyle iletişime geçip peteğe adını verebilir. Yalnızca bölüm 5m fonksiyonları kullanır.
create table if not exists public.cell_name_candidates (
  id uuid primary key default gen_random_uuid(),
  cell_q int not null,
  cell_r int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('host', 'player')),
  month_start date not null,
  count_last int not null,
  count_prev int not null,
  admin_seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (cell_q, cell_r, user_id, kind, month_start)
);
alter table public.cell_name_candidates enable row level security;
create table if not exists public.cell_candidate_runs (
  id int primary key default 1 check (id = 1),
  ran_at timestamptz not null default '-infinity'
);
alter table public.cell_candidate_runs enable row level security;

-- Hazine Avı oyun türü: sıralama, şampiyon ünvanı ve başarımlar için. Oda açılmaz (enabled = false), hak harcamaz.
insert into public.game_types (key, title, description, min_players, max_players, enabled, sort_order)
values ('treasure_hunt', 'Hazine Avı', 'Şehirde gizlenen kodları bul', 1, 1, false, 7)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2k) Bildirim tercihleri ve Kat Görevlisi yazışmaları
-- ---------------------------------------------------------------------

-- Üyenin bildirim tercihleri. Satırı olmayan üyede hepsi açıktır. Doğrudan okunamaz/yazılamaz; yalnızca fonksiyonlar.
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  game_invite boolean not null default true,
  special_events boolean not null default true,
  friend_request boolean not null default true,
  mention boolean not null default true,
  event_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;

-- ---------------------------------------------------------------------
-- Profil 4: sorun bildirimi, açık rızalar, davet sistemi
-- ---------------------------------------------------------------------
-- Sorun bildirimleri (Profil > Bir Sorun Bildir). Tablo doğrudan okunamaz; yalnızca sunucu fonksiyonları kullanır.
create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  category text not null check (category in ('bug', 'account', 'points', 'event', 'game', 'map', 'subscription',
                                             'abuse', 'suggestion', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  contact_email text check (contact_email is null or char_length(contact_email) <= 120),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or char_length(platform) <= 20),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);
create index if not exists problem_reports_status_idx on public.problem_reports (status, created_at desc);
create index if not exists problem_reports_user_idx on public.problem_reports (user_id, created_at desc);
alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;

-- Açık rızalar (Profil > Kişisel Verilerim). Satır yoksa rıza kayıtta verilmiş sayılır (kayıtta açık rıza metni kabul
-- edilir); üye istediği an kapatıp açabilir. marketing: kampanya / özel etkinlik bildirimleri.
-- map_density: oyun, etkinlik, gönderi ve petek bildirimlerinde bulunduğu peteğin haritadaki anonim yoğunluğa sayılması.
create table if not exists public.user_consents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key in ('marketing', 'map_density')),
  granted boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

-- Davet sistemi. Her üyenin değiştirilemeyen bir davet kodu vardır (ilk istendiğinde üretilir).
-- Davet edilen kişi kodla kayıt olur (ya da kayıttan sonraki 7 gün içinde kodu girer); kod girildikten sonraki
-- invite_reward_days (30) gün içinde toplam puanı invite_reward_points'e (100) ulaşırsa davet edene 1 davet puanı yazılır.
-- Davet puanı = ödüllenen davet sayısı − harcanan; ayrı bir bakiye tutulmaz (çifte harcama olmaz).
alter table public.profiles add column if not exists invite_code text;
create unique index if not exists profiles_invite_code_idx on public.profiles (invite_code) where invite_code is not null;
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (invitee_id is null or invitee_id <> inviter_id)
);
create unique index if not exists referrals_invitee_idx on public.referrals (invitee_id) where invitee_id is not null;
create index if not exists referrals_inviter_idx on public.referrals (inviter_id);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- Davet puanıyla alınan öğeler: her biri hesap başına bir kez.
--   cell_name: bir peteğe ad verme hakkı (tek kullanımlık) · premium_month: 1 aylık abonelik · title: "Elçi" unvanı
create table if not exists public.invite_purchases (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (item in ('cell_name', 'premium_month', 'title')),
  cost int not null check (cost >= 0),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_detail jsonb,
  primary key (user_id, item)
);
alter table public.invite_purchases enable row level security;
revoke all on public.invite_purchases from anon, authenticated;

-- Duyuru türü: 'general' (moderatör duyurusu, herkese), 'special_event' (41. Kat Özel etkinlik), 'treasure' (yeni hazine).
-- Özel etkinlik ve hazine duyuruları, “Özel etkinlikler ve hazineler” tercihi kapalı üyede görünmez.
alter table public.announcements add column if not exists kind text not null default 'general';
alter table public.announcements drop constraint if exists announcements_kind_check;
alter table public.announcements add constraint announcements_kind_check
  check (kind in ('general', 'special_event', 'treasure', 'raffle'));
update public.announcements set kind = 'special_event'
 where kind = 'general' and title = 'Yeni 41. Kat Özel etkinlik';
update public.announcements set kind = 'treasure'
 where kind = 'general' and title = 'Haritaya yeni hazine gizlendi!';

-- Kat Görevlisi (moderatör) ile üye arasındaki yazışma. Moderatörün kimliği üyeye hiç gösterilmez.
-- Moderatör görüşmeyi bitirince yazışma tamamen silinir.
create table if not exists public.mod_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  user_unread boolean not null default true,
  admin_unread boolean not null default false
);
create index if not exists mod_threads_user_idx on public.mod_threads (user_id, last_at desc);
create index if not exists mod_threads_last_idx on public.mod_threads (last_at desc);
alter table public.mod_threads enable row level security;
create table if not exists public.mod_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.mod_threads (id) on delete cascade,
  from_admin boolean not null,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists mod_thread_messages_thread_idx on public.mod_thread_messages (thread_id, created_at);
alter table public.mod_thread_messages enable row level security;
revoke all on public.mod_threads, public.mod_thread_messages from anon, authenticated;

-- Bildirim tercihi açık mı? (satır yoksa açık)
create or replace function public._notif_on(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case p_key
                            when 'game_invite' then np.game_invite
                            when 'special_events' then np.special_events
                            when 'friend_request' then np.friend_request
                            when 'mention' then np.mention
                            when 'event_reminder' then np.event_reminder
                          end
                     from public.notification_prefs np where np.user_id = p_user), true)
     -- Kampanya / özel etkinlik bildirimleri için açık rıza da gerekir (Profil > Kişisel Verilerim)
     and (p_key <> 'special_events'
          or coalesce((select c.granted from public.user_consents c where c.user_id = p_user and c.key = 'marketing'), true));
$$;

-- ---------------------------------------------------------------------
-- 2l) Bilgi Yarışması: düello (iki kişi, haritanın her yerinden) ve antrenman (tek başına)
-- ---------------------------------------------------------------------
-- Güvenlik ilkeleri:
--   * Doğru cevap ve süre yalnızca sunucuda tutulur. Doğru şık, soru süresi bitmeden (ya da iki oyuncu da cevaplamadan)
--     telefona hiç gönderilmez. Şıklar her maçta karıştırılır (aynı soru her maçta farklı sırada).
--   * Cevap, puan ve maç sonucu yalnızca sunucu fonksiyonlarıyla yazılır; tablolar doğrudan okunamaz/yazılamaz.
--   * Düello sırasında çıkan ya da uzun süre uygulamadan ayrılan oyuncu kaybeder.
--   * Bilgi Yarışması oda (game_rooms) kullanmaz: oda fonksiyonlarındaki hiçbir yol bu maçlara dokunamaz.

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('genel', 'tarih', 'cografya', 'bilim', 'spor', 'sanat', 'eglence', 'kocaeli')),
  question text not null check (char_length(btrim(question)) between 8 and 220),
  options text[] not null check (array_length(options, 1) = 4),
  correct smallint not null check (correct between 0 and 3),
  is_active boolean not null default true,
  times_shown int not null default 0,
  times_correct int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists quiz_questions_text_idx on public.quiz_questions (lower(btrim(question)));
alter table public.quiz_questions enable row level security;

-- Rakip bekleyenler (en çok birkaç saniye kalır; telefon 2 saniyede bir “hâlâ bekliyorum” der)
create table if not exists public.quiz_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  cell_q int,
  cell_r int
);
alter table public.quiz_queue enable row level security;

create table if not exists public.quiz_matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('duel', 'solo')),
  status text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  phase text not null default 'intro' check (phase in ('intro', 'vote', 'question', 'reveal', 'finished')),
  q_index int not null default 0,
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz not null default now(),
  question_ids uuid[] not null,
  -- Her soru için şıkların gösterim sırası: orders[i][k] = k. sırada gösterilen şıkkın asıl numarası
  orders jsonb not null,
  winner uuid references public.profiles (id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists quiz_matches_live_idx on public.quiz_matches (status) where status = 'playing';
create index if not exists quiz_matches_created_idx on public.quiz_matches (created_at);
alter table public.quiz_matches enable row level security;

create table if not exists public.quiz_match_players (
  match_id uuid not null references public.quiz_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  alias text not null,
  avatar_index int not null default 1,
  score int not null default 0,
  correct_count int not null default 0,
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  awarded int not null default 0,
  note text,
  primary key (match_id, user_id),
  unique (match_id, slot)
);
create index if not exists quiz_match_players_user_idx on public.quiz_match_players (user_id);
alter table public.quiz_match_players enable row level security;

create table if not exists public.quiz_answers (
  match_id uuid not null references public.quiz_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  q_index int not null,
  choice smallint not null check (choice between -1 and 3), -- ekranda seçilen sıra; -1 = süre doldu
  is_correct boolean not null,
  ms int not null,
  points int not null default 0,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id, q_index)
);
alter table public.quiz_answers enable row level security;

-- Son günlerde görülen sorular: düelloda iki oyuncunun da yakın zamanda görmediği sorular seçilir
create table if not exists public.quiz_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists quiz_seen_seen_idx on public.quiz_seen (seen_at);
alter table public.quiz_seen enable row level security;

-- Maç sohbeti: yalnızca rumuz görünür. Şikayet incelemesi için yalnızca moderatör doğrudan okuyabilir. 14 gün tutulur.
create table if not exists public.quiz_chat (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.quiz_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  alias text not null,
  body text not null check (char_length(body) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists quiz_chat_match_idx on public.quiz_chat (match_id, created_at);
create index if not exists quiz_chat_created_idx on public.quiz_chat (created_at);
alter table public.quiz_chat enable row level security;

-- Antrenman: en iyi skor ve oynama sayısı (puan ve sıralama yok)
create table if not exists public.quiz_best (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  best_score int not null default 0,
  solo_plays int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.quiz_best enable row level security;

-- ---------------------------------------------------------------------
-- 2m) Bilgi Yarışması: can (hak) sistemi, soru zorluğu, Solo Maraton
-- ---------------------------------------------------------------------

-- Soru zorluğu: 1 kolay, 2 orta, 3 zor (Solo Maraton kolaydan zora gider)
alter table public.quiz_questions add column if not exists difficulty smallint not null default 2;
alter table public.quiz_questions drop constraint if exists quiz_questions_difficulty_check;
alter table public.quiz_questions add constraint quiz_questions_difficulty_check check (difficulty between 1 and 3);
create index if not exists quiz_questions_pick_idx on public.quiz_questions (is_active, difficulty);

-- Düelloda kazanılan puan artık ondalıklı olabilir (1.25 gibi)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quiz_match_players'
              and column_name = 'awarded' and data_type <> 'numeric') then
    alter table public.quiz_match_players alter column awarded type numeric(6, 2);
  end if;
end $$;

-- Can: her oyun (Solo ve Uzaktan) 1 can harcar. Can, quiz_life_minutes dakikada bir 1 dolar (en çok quiz_max_lives).
-- “anchor” = bir sonraki dolumun sayılmaya başladığı an. Can dolduğunda sayaç durur.
create table if not exists public.quiz_lives (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lives int not null,
  anchor timestamptz not null default now()
);
alter table public.quiz_lives enable row level security;

-- Solo Maraton: sandıktan joker, kolaydan zora 12 soru, süre giderek daralır, yanlış cevap ya da süre dolunca biter.
create table if not exists public.quiz_solo_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  alias text not null,
  avatar_index int not null default 1,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  phase text not null default 'chest' check (phase in ('chest', 'question', 'reveal', 'finished')),
  q_index int not null default 0,
  question_ids uuid[] not null,
  orders jsonb not null,
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz not null default now(),
  -- 3 sandığın içeriği: seçim yapılana kadar telefona gönderilmez
  chests jsonb not null,
  chest_pick smallint,
  -- Kalan jokerler: {"freeze":n,"double":n,"fifty":n}
  jokers jsonb not null default '{"freeze": 0, "double": 0, "fifty": 0}'::jsonb,
  -- Bu sorudaki joker durumu: {"hidden":[..],"double":true,"wrong":[..],"frozen":true,"used":[..]}
  q_state jsonb not null default '{}'::jsonb,
  correct_count int not null default 0,
  total_ms int not null default 0,
  last jsonb,
  awarded numeric(6, 2) not null default 0,
  note text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists quiz_solo_runs_user_idx on public.quiz_solo_runs (user_id, created_at desc);
create index if not exists quiz_solo_runs_live_idx on public.quiz_solo_runs (status) where status = 'playing';
create index if not exists quiz_solo_runs_finished_idx on public.quiz_solo_runs (finished_at) where status = 'finished';
alter table public.quiz_solo_runs enable row level security;

-- Eski (Paket 14) “antrenman” maçları kapatılır; antrenmanın yerini Solo Maraton aldı
update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'abandoned', finished_at = now()
 where mode = 'solo' and status = 'playing';

-- ---------------------------------------------------------------------
-- 2n) Bilgi Yarışması Uzaktan (2–5 kişi): özel oda, renk, kategori oylaması, kaos barı, sandık, joker kartları, takas
-- ---------------------------------------------------------------------
-- Düello yerini 2–5 kişilik “arena” maçına bıraktı (aynı tablolar; mode = 'arena'). Sohbet, şikayet ve can sistemi aynen
-- kullanılır. Kartlar, sandık içerikleri ve takas edilen kartlar yalnızca ilgili oyuncuya gösterilir.
alter table public.quiz_matches drop constraint if exists quiz_matches_mode_check;
alter table public.quiz_matches add constraint quiz_matches_mode_check check (mode in ('duel', 'solo', 'arena'));
alter table public.quiz_matches drop constraint if exists quiz_matches_phase_check;
alter table public.quiz_matches add constraint quiz_matches_phase_check
  check (phase in ('ready', 'lobby', 'intro', 'vote', 'question', 'reveal', 'chaos', 'sudden', 'sudden_reveal', 'finished'));
alter table public.quiz_matches add column if not exists is_private boolean not null default false;
alter table public.quiz_matches add column if not exists room_code text;
alter table public.quiz_matches add column if not exists host_id uuid references public.profiles (id) on delete set null;
alter table public.quiz_matches add column if not exists kicked uuid[] not null default '{}';
-- Maçın gerçekten başladığı an (özel odada “Başlat” anı). Günlük oyun sayısı buna göre sayılır.
alter table public.quiz_matches add column if not exists started_at timestamptz;
alter table public.quiz_matches add column if not exists round int not null default 0;
alter table public.quiz_matches add column if not exists vote_options text[];
alter table public.quiz_matches add column if not exists round_category text;
alter table public.quiz_matches add column if not exists chaos_no int not null default 0;
-- Ani ölüm: en yüksek skorda berabere kalanların sıra numaraları
alter table public.quiz_matches add column if not exists sudden_slots int[];
alter table public.quiz_matches add column if not exists sudden_tries int not null default 0;
-- Maç olayları (hırsız, kalkan, bomba, takas…): son 40 olay. Gizli olanların kart adı yalnızca ilgili iki kişiye gider.
alter table public.quiz_matches add column if not exists events jsonb not null default '[]'::jsonb;
alter table public.quiz_matches add column if not exists ev_seq int not null default 0;
create unique index if not exists quiz_matches_code_idx on public.quiz_matches (room_code)
  where room_code is not null and status = 'playing';
create index if not exists quiz_matches_host_idx on public.quiz_matches (host_id, created_at) where host_id is not null;

alter table public.quiz_match_players drop constraint if exists quiz_match_players_slot_check;
alter table public.quiz_match_players add constraint quiz_match_players_slot_check check (slot between 1 and 5);
alter table public.quiz_match_players add column if not exists color text;
-- Kaos barı (0–100): doğru ve hızlı cevap doldurur; dolunca kaos aşamasında sandık açılır
alter table public.quiz_match_players add column if not exists bar int not null default 0;
-- Eldeki kartlar: [{"id":1,"k":"thief","fuse":null}, …]  (k: thief, roulette, shield, freeze, fifty, bomb)
alter table public.quiz_match_players add column if not exists cards jsonb not null default '[]'::jsonb;
alter table public.quiz_match_players add column if not exists card_seq int not null default 0;
alter table public.quiz_match_players add column if not exists vote text;
alter table public.quiz_match_players add column if not exists round_pts int not null default 0;
alter table public.quiz_match_players add column if not exists prev_round_pts int not null default 0;
alter table public.quiz_match_players add column if not exists shield_round int not null default 0;
-- Bu sorudaki etkiler: {"q":3,"hidden":[..],"roulette":true,"cut":3,"used":["fifty"],"thief":2}
alter table public.quiz_match_players add column if not exists qfx jsonb not null default '{}'::jsonb;
alter table public.quiz_match_players add column if not exists chest_state text;
alter table public.quiz_match_players add column if not exists chest_result text;
alter table public.quiz_match_players add column if not exists chest_pick smallint;
alter table public.quiz_match_players add column if not exists left_q int;
alter table public.quiz_match_players add column if not exists place int;

-- Kapalı zarf takası (köpek balığı): kaos aşamasında bir oyuncuya kartını teklif edersin; o kabul ederse elinden
-- rastgele bir kart sana geçer. Teklif edilen kartın ne olduğunu yalnızca teklif eden bilir.
create table if not exists public.quiz_trades (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.quiz_matches (id) on delete cascade,
  chaos_no int not null,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  card_id int not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  unique (match_id, chaos_no, from_user)
);
create index if not exists quiz_trades_to_idx on public.quiz_trades (match_id, to_user);
alter table public.quiz_trades enable row level security;

-- Paket 17: rastgele eşleşmede “Hazırım” bekleme odası (phase 'ready'), oyuncunun peteği (maç başlayınca yoğunluğa
-- yazılır), oda kodu deneme sınırı ve Online sıralaması abonelik ödülleri
alter table public.quiz_match_players add column if not exists ready boolean not null default false;
alter table public.quiz_match_players add column if not exists cell_q int;
alter table public.quiz_match_players add column if not exists cell_r int;

-- Yanlış oda kodu: 10 dakika içinde 5 yanlış denemede 5 dakika engel (kod tahmin etme hilesine karşı)
create table if not exists public.quiz_code_attempts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  fails int not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
alter table public.quiz_code_attempts enable row level security;

-- Online (Uzaktan) aylık sıralaması: ilk 3'e moderatör onayıyla 1 aylık abonelik. Aynı ay için bir kez verilir.
create table if not exists public.quiz_online_rewards (
  month date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place int not null,
  points numeric(8, 2) not null default 0,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (month, user_id)
);
alter table public.quiz_online_rewards enable row level security;

-- Bilgi Yarışması ekranında olanlar (“şu an oyunda” sayısı için). Telefon ekran açıkken 20 sn'de bir bildirir.
create table if not exists public.quiz_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index if not exists quiz_presence_seen_idx on public.quiz_presence (seen_at);
alter table public.quiz_presence enable row level security;

-- Yan Yana (tek telefonda 2 kişi): can harcamaz, puan vermez. Cevaplar: {"<soru>": {"1": {...}, "2": {...}, "correct": n}}
create table if not exists public.quiz_side_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name1 text not null default '1. Oyuncu',
  name2 text not null default '2. Oyuncu',
  status text not null default 'playing' check (status in ('playing', 'finished')),
  phase text not null default 'intro' check (phase in ('intro', 'vote', 'question', 'reveal', 'finished')),
  q_index int not null default 0,
  question_ids uuid[] not null,
  orders jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  score1 int not null default 0,
  score2 int not null default 0,
  correct1 int not null default 0,
  correct2 int not null default 0,
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists quiz_side_games_user_idx on public.quiz_side_games (user_id, created_at desc);
alter table public.quiz_side_games enable row level security;
-- Paket 20: raunt başında kategori seçimi ('vote') ve üstteki oyuncu için ayrı şık sırası (orders2)
alter table public.quiz_side_games drop constraint if exists quiz_side_games_phase_check;
alter table public.quiz_side_games add constraint quiz_side_games_phase_check
  check (phase in ('intro', 'vote', 'question', 'reveal', 'finished'));
alter table public.quiz_side_games add column if not exists orders2 jsonb not null default '[]'::jsonb;
alter table public.quiz_side_games add column if not exists round int not null default 0;
alter table public.quiz_side_games add column if not exists vote_options text[];
alter table public.quiz_side_games add column if not exists votes jsonb not null default '{}'::jsonb;
alter table public.quiz_side_games add column if not exists round_category text;
-- Eski biçimde (tek şık sırası, 10 soru) süren oyunlar kapanır
update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = coalesce(finished_at, now())
 where status = 'playing' and jsonb_array_length(orders) <> jsonb_array_length(orders2);

-- Eski Bilgi Yarışması petek sinyalleri: 'game' yerine 'quiz' (yalnızca yoğunluk; “Burada kim var?”a sayılmaz)
update public.map_signals ms set source = 'quiz'
 where ms.source = 'game'
   and (exists (select 1 from public.quiz_matches qm where qm.id = ms.room_id)
        or exists (select 1 from public.quiz_solo_runs sr where sr.id = ms.room_id));

-- Eski düellolar kapatılır (yerini Uzaktan aldı)
update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'abandoned', finished_at = now()
 where mode = 'duel' and status = 'playing';

-- ---------------------------------------------------------------------
-- 3) Yardımcı fonksiyonlar (istemci doğrudan çağıramaz, "_" ile başlayanlar)
-- ---------------------------------------------------------------------

-- Bu istek, hesabın geçerli oturumundan mı geliyor? (Başka bir telefondan giriş yapılınca eski telefonun oturumu
-- geçersiz olur.) Hesapta henüz oturum kaydı yoksa ya da anahtarda oturum numarası yoksa geçerli sayılır.
-- Web yönetim paneli oturumları: moderatör web panele girince o oturum burada kayıtlı olur. Böylece web panel girişi,
-- moderatörün telefondaki oturumunu kapatmaz (uygulamada her hesap tek telefonda açık kalır kuralı web paneli saymaz).
create table if not exists public.admin_web_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists admin_web_sessions_user_idx on public.admin_web_sessions (user_id);
alter table public.admin_web_sessions enable row level security;
revoke all on public.admin_web_sessions from anon, authenticated;

create or replace function public._session_ok(p_active uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_active is null
      or nullif(auth.jwt() ->> 'session_id', '') is null
      or p_active::text = (auth.jwt() ->> 'session_id')
      or exists (select 1 from public.admin_web_sessions w
                  where w.session_id::text = (auth.jwt() ->> 'session_id') and w.user_id = auth.uid()
                    and w.expires_at > now());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and banned_at is null and public._session_ok(active_session)
  );
$$;

create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_players where room_id = p_room and user_id = auth.uid()
  );
$$;

create or replace function public.post_blocked_by_me(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.post_authors pa
    join public.user_blocks ub on ub.blocked_id = pa.author_id and ub.blocker_id = auth.uid()
    where pa.post_id = p_post
  );
$$;

create or replace function public.comment_blocked_by_me(p_comment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.comment_authors ca
    join public.user_blocks ub on ub.blocked_id = ca.author_id and ub.blocker_id = auth.uid()
    where ca.comment_id = p_comment
  );
$$;

-- Ben ve verilen kişi kabul edilmiş arkadaş mıyız? (yalnızca sunucu fonksiyonları kullanır)
create or replace function public._is_friend(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = auth.uid() and f.addressee_id = p_other)
         or (f.addressee_id = auth.uid() and f.requester_id = p_other))
  );
$$;

create or replace function public.setting_bool(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), false);
$$;

create or replace function public._random_code(p_len int)
returns text language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 0/O ve 1/I karışmasın
  v_bytes bytea := extensions.gen_random_bytes(p_len);
  v_out text := '';
  i int;
begin
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  return v_out;
end $$;

-- Sayısal ayar okuma (yoksa verilen varsayılan değer)
create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

-- Üyenin kullanılmamış sponsor oyun hakkı (varsa kimliği). Süresi dolan (sponsor_credit_valid_days) hak sayılmaz;
-- hakla açılan oda başlamadan iptal edilirse hak geri gelir (aylık hakta olduğu gibi).
create or replace function public._free_sponsor_credit(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id
    from public.sponsor_credits c
   where c.user_id = p_user
     and c.created_at > now() - make_interval(days => greatest(1, public.setting_int('sponsor_credit_valid_days', 30)))
     and (c.room_id is null
          or exists (select 1 from public.game_rooms gr
                      where gr.id = c.room_id and gr.status = 'cancelled' and gr.started_at is null))
   order by c.created_at
   limit 1;
$$;

-- İstanbul saatine göre bu haftanın Pazartesi günü. Paket 23: hafta Pazartesi 00:00'da başlar (rumuzlar, akış ve
-- rumuz profilleri aynı anda yenilenir). (Türkiye'de yaz saati uygulaması yok, saat dilimi sabittir.)
create or replace function public.current_alias_week()
returns date language sql stable as $$
  select date_trunc('week', now() at time zone 'Europe/Istanbul')::date;
$$;

-- İstanbul saatine göre bu ayın başı. Premium kotaları ayda bir sıfırlanır.
create or replace function public._month_start()
returns timestamptz language sql stable as $$
  select date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$$;

-- Etkinliğin kapanış anı: başlangıçtan itibaren event_duration_hours (varsayılan 3) saat sonra. Kapanan etkinlik listeden
-- kalkar; kayıt ve katılım kodu girişi biter. (Kodla doğrulanan katılımcısı olan etkinliği düzenleyen önce kapatamaz,
-- moderatöre talep gönderir: bkz. request_event_close.)
create or replace function public._event_close_at(p_starts timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select p_starts + make_interval(hours => greatest(1, public.setting_int('event_duration_hours', 3)));
$$;

-- Etkinliğin listeden kalkacağı an: Konser & Festival başlangıçtan concert_duration_hours (2) saat sonra, diğerleri 3 saat
create or replace function public._event_end(p_starts timestamptz, p_category text)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_category = 'konser_festival'
              then p_starts + make_interval(hours => greatest(1, public.setting_int('concert_duration_hours', 2)))
              else public._event_close_at(p_starts) end;
$$;

-- Kod girişinin son anı: Konser & Festival başlangıçtan concert_checkin_minutes_after (45) dakika sonra, diğerleri kapanışta
create or replace function public._event_checkin_end(p_starts timestamptz, p_category text)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_category = 'konser_festival'
              then p_starts + make_interval(mins => greatest(5, public.setting_int('concert_checkin_minutes_after', 45)))
              else public._event_close_at(p_starts) end;
$$;

-- ---------------------------------------------------------------------
-- Sıralama (haftada bir güncellenir) ve oyun şampiyonu ünvanları: altyapı
--   * Genel puan ve oyun sıralamaları HER AY başında sıfırlanır. Tablo ise haftada bir (pazartesi 00:00, İstanbul saati;
--     ay başında da) güncellenir: app_settings.rank_weekly_refresh. Puanlar anında hesaba yazılır, bekleyen yalnızca tablodur.
--     Güncelleme zamanlanmış iş istemez: tablo eskiyse ilk bakan kişinin isteğiyle (kilitle, tek seferde) yenilenir.
--   * Oyun sıralaması aylıktır: oyuncunun her oyunda aldığı oyun puanı game_play_log'a bir kayıt olarak yazılır.
--   * Ay bitince her oyunun 1.'si "<Oyun> Şampiyonu" ünvanını alır ve BİR AY boyunca (içinde bulunulan ay) taşır.
--     Ünvan ayrıca saklanmaz: geçen ayın sıralamasından her seferinde hesaplanır (verilmeyi bekleyen iş, çifte verme yok).
--     Ünvan yalnızca gerçek adın göründüğü yerlerde (sıralama, etkinlik, arkadaş, oda sahibi) gösterilir; akışta ASLA.
-- ---------------------------------------------------------------------
create table if not exists public.game_play_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_type text not null references public.game_types (key),
  room_id uuid references public.game_rooms (id) on delete set null,
  -- Bu oyundan hesaba YAZILAN puan (günlük/aylık sınır dolduysa ya da puan için yeterli kişi yoksa kayıt hiç eklenmez).
  points numeric(10, 2) not null default 0 check (points >= 0),
  won boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists game_play_log_game_idx on public.game_play_log (game_type, created_at);
create index if not exists game_play_log_user_idx on public.game_play_log (user_id, created_at);
alter table public.game_play_log enable row level security;

-- Haftalık güncellenen sıralamanın o anki görüntüsü (genel puan: kind = 'points', oyun: 'game:<anahtar>')
create table if not exists public.rank_snapshots (
  kind text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place int not null,
  score numeric(12, 2) not null,
  plays int not null default 0,
  wins int not null default 0,
  primary key (kind, user_id)
);
create index if not exists rank_snapshots_place_idx on public.rank_snapshots (kind, place);

-- Ondalıklı puan: Bilgi Yarışması 1.25, 1.5 gibi puanlar verdiği için genel puan artık 2 ondalıklıdır (ör. 309.25).
-- Eski kurulumlarda tam sayı olan sütunlar bir kez dönüştürülür (var olan puanlar aynen korunur).
do $$
declare x record;
begin
  for x in select * from (values ('profiles', 'points', 'numeric(12,2)'), ('point_events', 'amount', 'numeric(12,2)'),
                                 ('game_play_log', 'points', 'numeric(10,2)'), ('rank_snapshots', 'score', 'numeric(12,2)'),
                                 ('user_game_stats', 'result_points', 'numeric(12,2)'))
                       as t(tbl, col, typ) loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = x.tbl and column_name = x.col and data_type <> 'numeric') then
      execute format('alter table public.%I alter column %I type %s', x.tbl, x.col, x.typ);
    end if;
  end loop;
end $$;
alter table public.rank_snapshots enable row level security;
create table if not exists public.rank_snapshot_meta (
  kind text primary key,
  as_of timestamptz not null
);
alter table public.rank_snapshot_meta enable row level security;

-- Tablonun "şu ana kadar" kapsadığı an: bu haftanın pazartesi 00:00'ı (ay başı daha yakınsa ay başı)
create or replace function public._rank_boundary()
returns timestamptz language sql stable as $$
  select greatest(date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul',
                  date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul');
$$;

-- Bir sonraki güncelleme: gelecek pazartesi 00:00 (ay başı daha yakınsa ay başı)
create or replace function public._rank_next()
returns timestamptz language sql stable as $$
  select least((date_trunc('week', now() at time zone 'Europe/Istanbul') + interval '7 days') at time zone 'Europe/Istanbul',
               (date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month') at time zone 'Europe/Istanbul');
$$;

-- Tablo eskiyse yeniler. Puan tablosu güncelleme anına kadarki puanlarla (created_at < _rank_boundary),
-- oyun tablosu o aya ait oyun kayıtlarıyla hesaplanır. Aynı anda gelen istekler kilitle sıraya girer.
create or replace function public._ensure_rank_snapshot(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b timestamptz := public._rank_boundary();
  v_ms timestamptz := public._month_start();
  v_cur timestamptz;
begin
  select m.as_of into v_cur from public.rank_snapshot_meta m where m.kind = p_kind;
  if v_cur is not null and v_cur >= v_b then return; end if;
  perform pg_advisory_xact_lock(hashtext('rank_snapshot:' || p_kind));
  select m.as_of into v_cur from public.rank_snapshot_meta m where m.kind = p_kind;
  if v_cur is not null and v_cur >= v_b then return; end if;
  delete from public.rank_snapshots where kind = p_kind;
  if p_kind = 'points' then
    insert into public.rank_snapshots (kind, user_id, place, score)
    select 'points', t.user_id, dense_rank() over (order by t.pts desc)::int, t.pts
      from (
        select pe.user_id, sum(pe.amount) as pts
          from public.point_events pe
          join public.profiles p on p.id = pe.user_id
         where pe.created_at >= v_ms and pe.created_at < v_b and p.banned_at is null and p.role = 'user'
         group by pe.user_id
        having sum(pe.amount) > 0
      ) t;
  elsif p_kind like 'game:%' then
    insert into public.rank_snapshots (kind, user_id, place, score, plays, wins)
    select p_kind, t.user_id, dense_rank() over (order by t.score desc)::int, t.score, t.plays, t.wins
      from (
        select l.user_id, sum(l.points) as score, count(*)::int as plays,
               sum(case when l.won then 1 else 0 end)::int as wins
          from public.game_play_log l
          join public.profiles p on p.id = l.user_id
         where l.game_type = substr(p_kind, 6) and l.created_at >= v_ms and l.created_at < v_b
           and p.banned_at is null and p.role = 'user'
         group by l.user_id
      ) t;
  end if;
  insert into public.rank_snapshot_meta (kind, as_of) values (p_kind, v_b)
  on conflict (kind) do update set as_of = excluded.as_of;
end $$;

-- Oyun şampiyonları: ünvan ayı (varsayılan: geçen ay) sıralamasında oyunun 1.'si. Eşitlikte: daha çok kazanan, sonra puana
-- daha erken ulaşan (son oyunu daha erken olan). O ay o oyunda en az title_min_plays (5) oyun oynamış ve puanı olmalı.
-- Ünvan, içinde bulunulan ayın sonuna kadar geçerlidir. Yasaklı üye ve moderatör ünvan alamaz.
-- title_source_months_ago = 0 yapılırsa (deneme) ünvanlar BU ayın şimdiki sıralamasına göre görünür.
drop function if exists public._champion_titles();
create or replace function public._champion_titles()
returns table (user_id uuid, game_type text, label text, sort_order int, valid_until timestamptz, score numeric, plays int)
language sql stable security definer set search_path = public as $$
  with m as (
    select date_trunc('month', now() at time zone 'Europe/Istanbul')
           - make_interval(months => greatest(0, least(public.setting_int('title_source_months_ago', 1), 12))) as ls
  ), a as (
    select l.game_type, l.user_id, sum(l.points) as score, count(*)::int as plays,
           sum(case when l.won then 1 else 0 end)::int as wins, max(l.created_at) as last_at
      from public.game_play_log l, m
     where l.created_at >= (m.ls at time zone 'Europe/Istanbul')
       and l.created_at < ((m.ls + interval '1 month') at time zone 'Europe/Istanbul')
     group by l.game_type, l.user_id
  )
  (select distinct on (a.game_type)
         a.user_id, a.game_type, (gt.title || ' Şampiyonu')::text, gt.sort_order,
         ((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month') at time zone 'Europe/Istanbul'),
         a.score, a.plays
    from a
    join public.game_types gt on gt.key = a.game_type
    join public.profiles p on p.id = a.user_id and p.banned_at is null and p.role = 'user'
   where a.game_type <> 'raffle' and a.score > 0
     and a.plays >= greatest(1, public.setting_int('title_min_plays', 5))
     and public.setting_bool('titles_enabled')
   order by a.game_type, a.score desc, a.wins desc, a.last_at asc, a.user_id)
  union all
  -- Davet mağazasından alınan kalıcı "Elçi" unvanı (game_type 'invite'; oyun sıralamalarında görünmez)
  select ip.user_id, 'invite'::text, 'Elçi'::text, 1000, timestamptz '2100-01-01 00:00:00+03', 0::numeric, 0
    from public.invite_purchases ip
    join public.profiles p on p.id = ip.user_id and p.banned_at is null and p.role = 'user'
   where ip.item = 'title';
$$;

-- Birden çok ünvanı kısa metne çevirir: "Tabu Şampiyonu" ya da "Tabu Şampiyonu +1"
create or replace function public._title_join(p_labels text[])
returns text language sql immutable as $$
  select case when p_labels is null or cardinality(p_labels) = 0 then null
              when cardinality(p_labels) = 1 then p_labels[1]
              else p_labels[1] || ' +' || (cardinality(p_labels) - 1) end;
$$;

create or replace function public.is_room_host(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.game_rooms where id = p_room and host_id = auth.uid()
  );
$$;

-- Rumuzun hangi hafta verildiği (haftalık yenileme için)
alter table public.profiles add column if not exists alias_week date;
update public.profiles set alias_week = public.current_alias_week() where alias_week is null;
alter table public.profiles alter column alias_week set default public.current_alias_week();
alter table public.profiles alter column alias_week set not null;

-- Rumuz numarası: rumuz "Lakap#145" biçimindedir. Numara her hafta rumuzla birlikte yenilenir ve aynı anda iki
-- kişide olmaz (tekil). Önce 1–999 arası kullanılır; hepsi doluysa 1001'den devam edilir. #41 ve #1000 moderatörlere
-- ayrılmıştır (moderatör panelinden seçilir, üyelere hiç verilmez).
alter table public.profiles add column if not exists alias_no int;
create unique index if not exists profiles_alias_no_idx on public.profiles (alias_no) where alias_no is not null;

create or replace function public._reserved_alias_nos()
returns int[] language sql immutable as $$ select array[41, 1000]; $$;

-- Lakaplar: gerçek hayattaki gibi, kimseyi kırmayacak, komik olmayan takma adlar (tek kelime, harflerden oluşur)
create or replace function public._alias_words()
returns text[] language sql immutable as $$
  select array['Kaptan','Usta','Reis','Hoca','Gezgin','Kâşif','Yolcu','Bilge','Dost','Komşu','Yoldaş','Rehber',
               'Ozan','Şair','Ressam','Mimar','Pilot','Denizci','Dağcı','Kampçı','Koşucu','Yüzücü','Satranççı',
               'Okur','Yazar','Mucit','Şef','Gurme','Kahveci','Çaycı','Fotoğrafçı','Gitarist','Davulcu','Piyanist',
               'Dansçı','Sinemasever','Kitapsever','Bahçıvan','Balıkçı','Sörfçü','Kayakçı','Bisikletçi','Gözlemci',
               'Sanatçı','Tasarımcı','Gökbilimci','Mühendis','Gönüllü','Bilgin','Melodi','Ritim','Nota','Poyraz',
               'Lodos','Rüzgâr','Fırtına','Yakamoz','Şafak','Dolunay','Yıldız','Bulut','Deniz','Ufuk','Çınar',
               'Atlas','Pusula','Fener','Liman','Pınar','Vadi','Zirve','Kıyı','Meltem','Gökkuşağı','Tayfun','Işık',
               'Umut','Cesur','Neşe','Sahilci','İskeleci','Vapurcu','Gececi','Sabahçı','Maceracı','Hayalperest',
               'Düşünür'];
$$;

-- Yeni rastgele kimlik: lakap + boştaki bir numara ("Kaptan#145") ve rastgele avatar.
-- p_exclude: kişinin şu anki numarası (yeni hafta aynı numara gelmesin). Numara seçimi kilitle tek tek yapılır.
drop function if exists public._new_identity();
create or replace function public._new_identity(p_exclude int default null, out o_alias text, out o_avatar int,
                                                out o_no int)
language plpgsql volatile security definer set search_path = public as $$
declare
  w text[] := public._alias_words();
  v_cnt int;
begin
  perform pg_advisory_xact_lock(hashtext('alias_no'));
  o_avatar := 1 + floor(random() * 12)::int;
  select n into o_no from generate_series(1, 999) n
   where n <> all (public._reserved_alias_nos()) and n is distinct from p_exclude
     and not exists (select 1 from public.profiles p where p.alias_no = n)
   order by random() limit 1;
  if o_no is null then
    select count(*)::int into v_cnt from public.profiles;
    select n into o_no from generate_series(1001, 1001 + v_cnt + 1000) n
     where n <> all (public._reserved_alias_nos()) and n is distinct from p_exclude
       and not exists (select 1 from public.profiles p where p.alias_no = n)
     order by random() limit 1;
  end if;
  o_alias := w[1 + floor(random() * cardinality(w))::int] || '#' || o_no;
end $$;

-- Yeni haftaya geçildiyse kişinin rumuzunu, numarasını ve avatarını yeniler.
-- Cron gerekmez: kişi uygulamayı açtığında ya da bir işlem yaptığında kendiliğinden çalışır.
-- Eski gönderiler değişmez, yazıldıkları haftanın rumuzuyla kalır. Moderatörün seçtiği ayrılmış kod (#41, #1000) değişmez.
create or replace function public._rotate_alias_if_needed(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_week date := public.current_alias_week();
  v_new record;
  v_no int;
  v_admin boolean;
begin
  -- Aynı anda iki istek gelirse yalnızca biri yeniler. Moderatörlüğü kaldırılan kişi ayrılmış kodu hemen bırakır.
  select alias_no, role = 'admin' into v_no, v_admin from public.profiles
   where id = p_user
     and (alias_week < v_week or (alias_no = any (public._reserved_alias_nos()) and role <> 'admin'))
   for update;
  if not found then return; end if;
  if v_admin and v_no = any (public._reserved_alias_nos()) then
    update public.profiles set alias_week = v_week where id = p_user;
    return;
  end if;
  select * into v_new from public._new_identity(v_no);
  update public.profiles
     set alias = v_new.o_alias, avatar_index = v_new.o_avatar, alias_no = v_new.o_no, alias_week = v_week
   where id = p_user;
end $$;

-- Rumuzdan kişiyi bulur (etiket, rumuz profili, özel mesaj): "Kaptan#145", "kaptan#145", "@#145" ya da "#145".
-- Büyük/küçük harf ve Türkçe harf farkı gözetilmez; lakap yazıldıysa numaranın şu anki sahibininkiyle tutmalıdır.
-- Yalnızca BU HAFTAKİ rumuz sahibine götürür (geçen haftanın rumuzu başkasına ait olabilir).
create or replace function public._alias_lookup(p_text text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v text := regexp_replace(btrim(coalesce(p_text, '')), '^@', '');
  m text[];
  v_id uuid;
begin
  m := regexp_match(v, '^([^#[:space:]]{0,30})#([0-9]{1,5})$');
  if m is null then
    -- Eski biçimdeki rumuz (yeni biçime geçmeden önce yazılmış): tam eşleşme
    select p.id into v_id from public.profiles p where p.alias = v and p.alias_week = public.current_alias_week();
    return v_id;
  end if;
  select p.id into v_id from public.profiles p
   where p.alias_no = m[2]::int and p.alias_week = public.current_alias_week()
     and (m[1] = '' or public._tr_fold(split_part(p.alias, '#', 1)) = public._tr_fold(m[1]));
  return v_id;
end $$;

-- Hesap doğrulama (NVİ) ve profil resmi. Ayrıntı: "Hesap doğrulama" bölümü. Profil resmi yalnızca doğrulanmış hesaba
-- açıktır, moderatör onaylayınca görünür ve YALNIZCA gerçek adın göründüğü yerlerde (arkadaşlar) avatarın yerine geçer;
-- rumuzla görünülen hiçbir yerde gösterilmez (rumuzun kime ait olduğu anlaşılmasın).
alter table public.profiles add column if not exists identity_verified_at timestamptz;
alter table public.profiles add column if not exists photo_path text;
alter table public.profiles add column if not exists photo_status text;
alter table public.profiles add column if not exists photo_updated_at timestamptz;
-- Kontrol süresi: yüklenen resim bu anda kendiliğinden onaylanır (yüklemeden 10–30 dakika sonra, rastgele)
alter table public.profiles add column if not exists photo_auto_at timestamptz;
-- Son profil resmi değişikliği: resim haftada bir değiştirilebilir (moderatör reddederse sıfırlanır)
alter table public.profiles add column if not exists photo_changed_at timestamptz;
alter table public.profiles drop constraint if exists profiles_photo_status_check;
alter table public.profiles add constraint profiles_photo_status_check
  check (photo_status is null or photo_status in ('pending', 'approved', 'rejected'));

-- Profil resmi hakkı: abone (abonelik sürerken), hesabı doğrulanmış ya da moderatör
create or replace function public._photo_allowed(p public.profiles)
returns boolean language sql stable set search_path = public as $$
  select p.role::text = 'admin' or p.identity_verified_at is not null
      or (p.role::text <> 'sponsor' and p.premium_until is not null and p.premium_until > now());
$$;

-- Kişinin herkese gösterilebilecek profil resmi (onaylı, resim hakkı süren, banlı değil); yoksa boş.
-- Çağıran fonksiyon yalnızca gerçek adın gösterildiği durumda kullanır.
create or replace function public._photo_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select pr.photo_path from public.profiles pr
   where pr.id = p_user and public._photo_allowed(pr) and pr.banned_at is null
     and (pr.photo_status = 'approved' or (pr.photo_status = 'pending' and pr.photo_auto_at <= now()));
$$;

-- Kontrol süresi dolan resmi onaylar ve üyeye bildirir (üyenin her işleminde, _require_user içinden çağrılır).
-- Moderatör bu sürede reddederse resim yayınlanmaz.
create or replace function public._photo_auto_approve(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set photo_status = 'approved'
   where id = p_user and photo_status = 'pending' and photo_auto_at <= now();
  if found then
    perform public._notify(p_user, 'system', 'Profil resmin onaylandı',
      'Moderatör kontrolü tamamlandı. Profil resmin artık arkadaşlarına, gerçek adının göründüğü yerlerde görünüyor.',
      jsonb_build_object('route', '/profile'));
  end if;
end $$;

-- Giriş yapmış, banlı olmayan ve geçerli oturumdaki kullanıcı mı? (liste fonksiyonları ve okuma kuralları kullanır)
create or replace function public._is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and banned_at is null and public._session_ok(active_session));
$$;

-- Kişiye bildirim bırakır (bildirim kutusu). 60 günden eski bildirimler bu sırada silinir.
create or replace function public._notify(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  -- Üyenin kapattığı bildirim türleri hiç oluşturulmaz (istek/davet kendisi yine ilgili ekranda görünür)
  if p_kind in ('game_invite', 'friend_request', 'mention') and not public._notif_on(p_user, p_kind) then return; end if;
  delete from public.notifications where user_id = p_user and created_at < now() - interval '60 days';
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user, p_kind, left(btrim(p_title), 120), left(coalesce(p_body, ''), 1000), coalesce(p_data, '{}'::jsonb));
end $$;

-- Okunmamış bildirim sayısı (kişisel bildirimler + son 30 günün etkin duyuruları)
create or replace function public._unread_notification_count()
returns int language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null)
        + (select count(*) from public.announcements a
            where a.is_active and a.created_at > now() - interval '30 days'
              and (a.kind in ('general', 'raffle') or public._notif_on(auth.uid(), 'special_events'))
              and not exists (select 1 from public.announcement_reads r
                               where r.user_id = auth.uid() and r.announcement_id = a.id)))::int;
$$;

-- Üyenin seviyesi: TOPLAM puana göre (toplam puan sıfırlanmadığı için seviye düşmez)
create or replace function public._user_level(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select max(l.level) from public.levels l join public.profiles p on p.id = p_user
                    where l.min_points <= p.points), 1);
$$;

-- Üyenin şu anki seviyesinin ödülü (yalnızca normal üyeler; moderatör ve mekân hesaplarında boş)
create or replace function public._level_perk(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select l.perk from public.levels l
   where l.level = public._user_level(p_user)
     and exists (select 1 from public.profiles p where p.id = p_user and p.role = 'user' and p.banned_at is null);
$$;

-- Üyenin aylık etkinlik hakkı: ücretsiz / premium / etkinlik lideri (hangisi büyükse) + seviye ödülü (+1)
create or replace function public._event_quota(p public.profiles)
returns int language sql stable security definer set search_path = public as $$
  select greatest(
    case when p.premium_until is not null and p.premium_until > now()
         then public.setting_int('premium_monthly_event_quota', 4)
         else public.setting_int('free_monthly_event_quota', 1) end,
    case when p.event_leader then public.setting_int('leader_monthly_event_quota', 8) else 0 end)
    + case when public._level_perk(p.id) = 'event_plus1' then 1 else 0 end;
$$;

-- Üyenin aylık oyun (oda açma) hakkı: ücretsiz / premium + seviye ödülü (+1). Mekân kodu hakkı ayrıca sayılır.
create or replace function public._game_quota(p public.profiles)
returns int language sql stable security definer set search_path = public as $$
  select case when p.premium_until is not null and p.premium_until > now()
              then public.setting_int('premium_monthly_game_quota', 10)
              else public.setting_int('free_monthly_game_quota', 3) end
         + case when public._level_perk(p.id) = 'game_plus1' then 1 else 0 end;
$$;

create or replace function public._require_user()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Yeni haftaya geçildiyse rumuz ve avatar burada yenilenir
  perform public._rotate_alias_if_needed(auth.uid());
  -- Kontrol süresi dolan profil resmi onaylanır
  perform public._photo_auto_approve(auth.uid());
  select * into v from public.profiles where id = auth.uid();
  if not found then raise exception 'profile_missing'; end if;
  if not public._session_ok(v.active_session) then raise exception 'session_replaced'; end if;
  if v.banned_at is not null then raise exception 'banned'; end if;
  return v;
end $$;

-- Yazma yetkisi: banlı değil, susturulmamış ve (kural açıksa) premium olmalı. Admin muaf.
create or replace function public._require_writer(p_setting text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if p_setting is not null
     and v.role = 'user'
     and public.setting_bool(p_setting)
     and not (v.premium_until is not null and v.premium_until > now()) then
    raise exception 'premium_required';
  end if;
  return v;
end $$;

create or replace function public._require_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
end $$;

-- Ayrılmış adlar: üyeler kendilerine "41. Kat Sosyal" ya da "Moderatör" gibi resmi bir ad veremez
-- (etkinlik ve oda listelerinde düzenleyen adı olarak görünür; kullanıcıyı yanıltmasın).
create or replace function public._is_reserved_name(p_name text)
returns boolean language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9ğüşıöçâîû]', '', 'g') ~ '(41kat|moderat|yonetici|yönetici)';
$$;

create or replace function public._audit(p_action text, p_target uuid, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_log (admin_id, action, target_user, detail)
  values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- Petek (altıgen) ızgarası: iki petek arası adım sayısı
create or replace function public._hex_dist(q1 int, r1 int, q2 int, r2 int)
returns int language sql immutable as $$
  select (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) / 2;
$$;

-- Bu petek Kocaeli karasında mı?
create or replace function public._map_cell_ok(p_q int, p_r int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.map_land_ranges where r = p_r and p_q between q0 and q1);
$$;

-- Türkçe arama için sadeleştirme: ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u, büyük/küçük fark etmez
create or replace function public._tr_fold(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''), 'İIıÜüŞşÖöÇçĞğÂâÎîÛû', 'iiiuussoocc' || 'ggaaiiuu')), '\s+', ' ', 'g'));
$$;

-- İstanbul saatine göre bugün
create or replace function public._map_day()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- 30 günden eski yoğunluk kayıtları silinir (yazma sırasında kendiliğinden çalışır)
create or replace function public._map_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.map_signals where created_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------
-- 4) Otomatik işleyen tetikleyiciler
-- ---------------------------------------------------------------------

-- Yeni kayıt olan herkese profil, rastgele rumuz ve eşleşen avatar verilir
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_id record;
  v_username text;
  v_device text;
  v_hash text;
  v_invite text;
begin
  v_name := btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', ''), '\s+', ' ', 'g'));
  if char_length(v_name) not between 2 and 60 then raise exception 'invalid_name'; end if;
  if public._is_reserved_name(v_name) then raise exception 'reserved_name'; end if;

  -- Yeni hesaplar yalnızca uygulamadan açılır: kullanıcı adı ve cihaz kimliği zorunludur
  v_username := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if v_username !~ '^[a-z0-9_.]{3,20}$' then raise exception 'invalid_username'; end if;
  if public._is_reserved_name(v_username) then raise exception 'reserved_name'; end if;
  if exists (select 1 from public.profiles where username = v_username) then raise exception 'username_taken'; end if;
  v_device := btrim(coalesce(new.raw_user_meta_data ->> 'device_id', ''));
  if char_length(v_device) not between 16 and 100 then raise exception 'device_required'; end if;
  v_hash := encode(extensions.digest(v_device, 'sha256'), 'hex');
  if public.setting_bool('signup_one_per_device')
     and exists (select 1 from public.device_accounts where device_hash = v_hash) then
    raise exception 'device_used';
  end if;

  select * into v_id from public._new_identity();

  insert into public.profiles (id, full_name, alias, avatar_index, username, alias_no)
  values (new.id, v_name, v_id.o_alias, v_id.o_avatar, v_username, v_id.o_no);
  insert into public.device_accounts (device_hash, user_id) values (v_hash, new.id)
  on conflict (device_hash) do nothing;
  -- Davet kodu (isteğe bağlı): geçerliyse davet kaydı açılır; geçersizse kayıt yine olur, yalnızca davet sayılmaz
  v_invite := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if v_invite <> '' then
    insert into public.referrals (inviter_id, invitee_id)
    select p.id, new.id from public.profiles p
     where p.invite_code = v_invite and p.banned_at is null and p.id <> new.id
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Rumuz biçimi değişti ("Lakap#145"): numarası olmayan hesaplara bir kez yeni rumuz verilir (eski gönderiler
-- yazıldıkları rumuzla kalır).
do $$
declare r record; v_new record;
begin
  for r in select id from public.profiles where alias_no is null order by created_at loop
    select * into v_new from public._new_identity(null);
    update public.profiles set alias = v_new.o_alias, alias_no = v_new.o_no, alias_week = public.current_alias_week()
     where id = r.id;
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Puan eklenince toplam puan (seviye için) güncellenir. Puanla premium kazanılmaz.
create or replace function public.apply_point_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_points numeric;
begin
  update public.profiles
     set points = greatest(0, points + new.amount)
   where id = new.user_id
   returning points into v_points;

  update public.profiles
     set level_rewarded = greatest(level_rewarded,
           coalesce((select max(l.level) from public.levels l where l.min_points <= v_points), 1))
   where id = new.user_id;
  -- Davet ödülü: davet edilen kişi süresi içinde eşik puana ulaştıysa davet edene 1 davet puanı
  if new.amount > 0 then perform public._invite_check_reward(new.user_id); end if;
  return new;
end $$;

-- TEMEL İLKE (bütün yan yana ve uzaktan oyunlarda korunur): masadaki / odadaki oyuncu sayısı arttıkça puan çarpanı
-- yükselir ve yalnızca 1. değil, 2., 3. ve sonraki sıralar da puan kazanır (en az 1). Böylece oyuncular arkadaş
-- gruplarını uygulamaya davet etmeye teşvik edilir. Uzaktan oyun aynı formülün yarısını alır; yeni oyunlar da bu
-- formülü (_game_results / _game_top_points) kullanmalıdır.
-- Bir oyunun sonucu: oyuncu sayısına ve BİTİRDİĞİ SIRAYA göre puan.
--   puan = en az 1, en çok `üst sınır` (yan yana oyunda pts_game_top_cap = 12, Bilgi Yarışması'nda pts_quiz_top_cap = 3)
--   en iyi puan (1. sıra) = oyuncu sayısı kadar (üst sınıra kadar); sıra ilerledikçe doğrusal azalır:
--   puan = en az 1, en çok üst sınır;  round(en iyi puan × (n − ortalama sıra + 1) / n)
--   Eşit sıradakiler ortak sıranın ORTALAMASINI alır (3 kişi 1.-3. sıraysa üçü de 2. sıra gibi hesaplanır). Böylece küçük
--   takım kazanınca kişi başı daha çok puan alır ve dağıtılan toplam puan eşitliğe göre değişmez.
--   Vampir–Köylü sırası: kazanan takım üstte; takım içinde oyunda hayatta kalan, sonra daha geç elenen öne geçer.
--   Diğer oyunlar: room_players.score yüksek olan öne geçer (oyun yazılırken score doldurulur).
--   Moderatör ve oyundan ayrılanlar sayılmaz. Kazananı belli olmayan Vampir–Köylü (erken bitirilmiş) sonuçsuzdur.
-- 1. sıranın puanı (yan yana oyunlar): oyuncu sayısı × kalabalık çarpanı, 0,5'e yuvarlı, en çok p_cap
create or replace function public._game_top_points(p_n int, p_cap int)
returns numeric language sql immutable set search_path = public as $$
  select least(p_cap::numeric, round(p_n * (1 + 0.1 * greatest(0, p_n - 4)) * 2) / 2.0);
$$;

-- Paket 21: kalabalık çarpanı. 1. sıra = oyuncu sayısı × (1 + 0,1 × (oyuncu sayısı − 4)), en çok pts_game_top_cap (24);
-- 0,5'e yuvarlanır (4→4, 5→5,5, 6→7, 8→11, 10→16, 12→21,5, 13+→24). Diğer sıralar orantılı azalır, en az 1.
-- Bilgi Yarışması odaları eski formülle (tam sayı, üst sınır pts_quiz_top_cap) devam eder.
drop function if exists public._game_results(uuid);
create or replace function public._game_results(p_room_id uuid)
returns table (user_id uuid, best_rank int, avg_place numeric, players int, points numeric, won boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_cap int;
  v_winner text;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type = 'raffle' then return; end if;
  v_winner := r.state->>'winner';
  if r.game_type in ('vampire_villager', 'shark_cage') and v_winner is null then return; end if;
  -- Köpekbalığı Kafesi anlatıcılı oyun (etkinlik eğlencesi): kimse puan almaz
  if r.game_type = 'shark_cage' and (coalesce(r.config->>'mode', 'auto') = 'narrator'
                                      or coalesce((r.config->>'no_points')::boolean, false)) then return; end if;
  v_cap := case when r.game_type = 'quiz' then public.setting_int('pts_quiz_top_cap', 3)
                else public.setting_int('pts_game_top_cap', 12) end;
  return query
  with p as (
    select rp.user_id as uid, rp.is_alive as alive, rp.out_at as outat, coalesce(rp.score, 0) as sc,
           (coalesce(s.role, '') = 'vampire') as is_vamp
      from public.room_players rp
      join public.profiles pr on pr.id = rp.user_id
      left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and pr.role = 'user' and rp.left_at is null
  ), k as (
    select p.uid,
           case when r.game_type = 'vampire_villager'
                then (case when (v_winner = 'vampire') = p.is_vamp then 1 else 0 end)
                else p.sc end as k1,
           case when r.game_type in ('vampire_villager', 'shark_cage') and p.alive then 1 else 0 end as k2,
           case when r.game_type in ('vampire_villager', 'shark_cage') then p.outat end as k3
      from p
  ), q as (
    select k.uid, k.k1,
           rank() over (order by k.k1 desc, k.k2 desc, k.k3 desc nulls last)::int as rnk,
           (count(*) over (partition by k.k1, k.k2, k.k3))::int as tied,
           (count(*) over ())::int as n
      from k
  )
  select q.uid, q.rnk, (q.rnk + (q.tied - 1) / 2.0)::numeric, q.n,
         (case when r.game_type = 'quiz'
               then greatest(1, round(least(v_cap, q.n)::numeric * (q.n - (q.rnk + (q.tied - 1) / 2.0) + 1) / q.n))
               else greatest(1, round(public._game_top_points(q.n, v_cap) * (q.n - (q.rnk + (q.tied - 1) / 2.0) + 1)
                                      / q.n * 2) / 2.0)
          end)::numeric,
         case when r.game_type = 'vampire_villager' then (v_winner = 'vampire') = (select p2.is_vamp from p p2 where p2.uid = q.uid)
              when r.game_type = 'shark_cage' then q.k1 = 1
              else q.rnk = 1 and q.n >= 2 end
    from q;
end $$;

-- Bir oda "bitti" olunca: (1) odadaki oyuncuların o oyunu oynama sayısı artar (başarımlar için), (2) oyun puanı yazılır.
-- Çekilişte 1, diğer oyunlarda en az 2 üye (moderatör sayılmaz) katılmışsa sayılır. Oyundan ayrılan ya da atılan sayılmaz.
-- Kazananı belli olmayan Vampir–Köylü (oda sahibi erken bitirdi) oynanmış sayılmaz ve puan vermez.
-- Puan: _game_results (oyuncu sayısı ve sıra). Yan yana oyunda en az pts_game_min_players (4), Bilgi Yarışması'nda
-- pts_quiz_min_players (2) kişi gerekir. Günlük ve aylık üst sınırlar türlere göre ayrıdır (quiz_play, game_play,
-- game_remote). Uzaktan oyun yan yana oyunun yarısı kadar puan verir ve sınırları daha düşüktür: yalnızca uzaktan
-- oynayarak aylık sıralamada öne geçilemez (aylık ödül için ayrıca etkinlik katılımı ya da yan yana oyun şartı vardır).
create or replace function public.record_game_plays()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_players int;
  v_min int := case when new.game_type = 'raffle' then 1 else 2 end;
  v_title text;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_src text := case when new.game_type = 'quiz' then 'quiz_play'
                     when new.remote then 'game_remote' else 'game_play' end;
  v_min_pts int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_min_players', 2)
                        else public.setting_int('pts_game_min_players', 4) end;
  v_daily int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_daily_cap', 3)
                      when new.remote then public.setting_int('pts_remote_daily_cap', 2)
                      else public.setting_int('pts_game_daily_cap', 5) end;
  v_month int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_month_cap', 10)
                      when new.remote then public.setting_int('pts_remote_month_cap', 6)
                      else public.setting_int('pts_game_month_cap', 12) end;
  -- Uzaktan oyunun puanı yan yana oyunun bu yüzdesidir (varsayılan %50, en çok %80)
  v_remote_pct int := least(80, greatest(10, public.setting_int('pts_remote_pct', 50)));
  v_rated boolean;
  v_pts numeric;
  v_ach jsonb;
  v_mult boolean;
  r record;
  g record;
begin
  -- GEÇİCİ: deneme odası (bot eklenmiş) hiçbir puan, başarım ya da istatistik yazmaz
  if coalesce((new.config->>'test')::boolean, false) then return null; end if;
  select count(*)::int into v_players
    from public.room_players rp join public.profiles p on p.id = rp.user_id
   where rp.room_id = new.id and p.role = 'user' and rp.left_at is null;
  if v_players < v_min then return null; end if;
  select title into v_title from public.game_types where key = new.game_type;

  if new.game_type = 'raffle' then
    for r in
      select rp.user_id
        from public.room_players rp join public.profiles p on p.id = rp.user_id
       where rp.room_id = new.id and p.role = 'user' and rp.left_at is null
    loop
      insert into public.user_game_stats (user_id, game_type, plays, wins)
      values (r.user_id, new.game_type, 1, 0)
      on conflict (user_id, game_type)
      do update set plays = public.user_game_stats.plays + 1, updated_at = now();
    end loop;
    return null;
  end if;

  for g in select * from public._game_results(new.id) loop
    -- Puan yalnızca gerçek bir masa kadar kişiyle oynanan oyunlarda verilir (yan yana: en az 4, Bilgi Yarışması: en az 2)
    v_rated := g.players >= v_min_pts;
    insert into public.user_game_stats (user_id, game_type, plays, wins, result_points)
    values (g.user_id, new.game_type, 1, case when g.won then 1 else 0 end, case when v_rated then g.points else 0 end)
    on conflict (user_id, game_type)
    do update set plays = public.user_game_stats.plays + 1,
                  wins = public.user_game_stats.wins + (case when g.won then 1 else 0 end),
                  result_points = public.user_game_stats.result_points + (case when v_rated then g.points else 0 end),
                  updated_at = now();

    -- Paket 26: Vampir–Köylü görev sayaçları (yalnızca bitmiş, kazananı belli oyunlar; tek oyunda makul üst sınır)
    if new.game_type = 'vampire_villager' then
      select s.data->'ach' into v_ach from public.room_player_secrets s where s.room_id = new.id and s.user_id = g.user_id;
      if v_ach is not null then
        insert into public.user_vv_stats (user_id, nights, protects, finds, hanged)
        values (g.user_id,
                least(30, greatest(0, coalesce((v_ach->>'nights')::int, 0))),
                least(30, greatest(0, coalesce((v_ach->>'protects')::int, 0))),
                least(10, greatest(0, coalesce((v_ach->>'finds')::int, 0))),
                least(1, greatest(0, coalesce((v_ach->>'hanged')::int, 0))))
        on conflict (user_id)
        do update set nights = public.user_vv_stats.nights + excluded.nights,
                      protects = public.user_vv_stats.protects + excluded.protects,
                      finds = public.user_vv_stats.finds + excluded.finds,
                      hanged = public.user_vv_stats.hanged + excluded.hanged,
                      updated_at = now();
      end if;
    end if;

    -- Günlük ve aylık üst sınır: Bilgi Yarışması ve uzaktan oyunlarda vardır. Yan yana oyunlarda sınır YOKTUR
    -- (puan için en az pts_game_min_players (4) kişi gerekir; oda açmak aylık oyun hakkından düşer)
    if v_rated
       and (v_src = 'game_play' or
       (select count(*) from public.point_events pe
             where pe.user_id = g.user_id and pe.source = v_src and pe.created_at >= v_today) < v_daily
       and (select count(*) from public.point_events pe
             where pe.user_id = g.user_id and pe.source = v_src and pe.created_at >= public._month_start()) < v_month) then
      v_pts := g.points;
      -- Paket 26: Vampir başarım ödülü, Vampir–Köylü puanlarını kalıcı ×1,25 yapar (0,5'e yuvarlanır)
      v_mult := new.game_type = 'vampire_villager' and public._has_reward(g.user_id, 'vv_master');
      if v_mult then v_pts := round(g.points * 1.25 * 2) / 2.0; end if;
      -- Paket 27: etkinlik oyunu (oyunlu etkinlikte açılan oda) puanı 1,25 kat
      if new.event_id is not null and new.game_type not in ('raffle', 'quiz') then
        v_pts := round(v_pts * 1.25 * 2) / 2.0;
      end if;
      -- Uzaktan oyun: puan yan yana oyunun yarısı (0,5'e yuvarlanır, en az 0,5)
      if new.remote then
        v_pts := greatest(0.5, round(v_pts * v_remote_pct / 100.0 * 2) / 2.0);
      end if;
      insert into public.point_events (user_id, amount, reason, source, room_id)
      values (g.user_id, v_pts,
              coalesce(v_title, new.game_type) || ': ' || g.best_rank || '. sıra, ' || g.players || ' oyuncu'
                || (case when new.game_type <> 'quiz' and g.players > 4 then ' (kalabalık çarpanı)' else '' end)
                || (case when v_mult then ' · Vampir ödülü ×1,25' else '' end)
                || (case when new.event_id is not null and new.game_type not in ('raffle', 'quiz')
                         then ' · Etkinlik oyunu ×1,25' else '' end)
                || (case when new.remote then ' · Uzaktan (%' || v_remote_pct || ')' else '' end),
              v_src, new.id);
      -- Aylık oyun sıralaması ve şampiyon ünvanı, hesaba yazılan bu puanlardan hesaplanır (hak sınırları herkes için aynı)
      insert into public.game_play_log (user_id, game_type, room_id, points, won)
      values (g.user_id, new.game_type, new.id, v_pts, coalesce(g.won, false));
    end if;
  end loop;
  return null;
end $$;

-- Oyun bitince oyuncuya gösterilen sonuç: kaçıncı sırada bitirdi, kaç oyuncu vardı, oyunun puan değeri ve yazılan puan.
-- note: 'ok' puan yazıldı · 'cap' günlük/aylık sınır doldu · 'too_few' puan için oyuncu az · 'none' sonuç yok
drop function if exists public.my_game_result(uuid);
create or replace function public.my_game_result(p_room_id uuid)
returns table (best_rank int, players int, result_points numeric, awarded numeric, note text)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.game_rooms;
  g record;
  v_awarded numeric;
  v_min int;
begin
  if not public._is_active_user() then return; end if;
  select * into r from public.game_rooms where id = p_room_id and status = 'finished';
  if not found then return; end if;
  select x.* into g from public._game_results(p_room_id) x where x.user_id = auth.uid();
  if g.user_id is null then
    return query select null::int, null::int, 0::numeric, 0::numeric, 'none'::text;
    return;
  end if;
  v_awarded := coalesce((select sum(pe.amount) from public.point_events pe
                          where pe.room_id = p_room_id and pe.user_id = auth.uid()
                            and pe.source in ('game_play', 'quiz_play', 'game_remote')), 0)::numeric;
  v_min := case when r.game_type = 'quiz' then public.setting_int('pts_quiz_min_players', 2)
                else public.setting_int('pts_game_min_players', 4) end;
  -- Uzaktan oyunda oyunun puan değeri de yarıya iner (kullanıcıya gösterilen değer yazılanla tutarlı olsun)
  return query select g.best_rank, g.players,
    (case when r.remote
          then greatest(0.5, round(g.points * least(80, greatest(10, public.setting_int('pts_remote_pct', 50))) / 100.0 * 2) / 2.0)
          else g.points end)::numeric,
    v_awarded,
    (case when v_awarded > 0 then 'ok' when g.players < v_min then 'too_few' else 'cap' end)::text;
end $$;

-- Oda bekleme salonundan çıkınca (oyun başladı, bitti, iptal) oda sahibinin kesin konumu silinir
create or replace function public._room_drop_host_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.room_host_locations where room_id = new.id;
  return null;
end $$;
drop trigger if exists on_room_left_lobby on public.game_rooms;
create trigger on_room_left_lobby
  after update of status on public.game_rooms
  for each row
  when (new.status <> 'lobby' and old.status = 'lobby')
  execute function public._room_drop_host_location();

drop trigger if exists on_room_finished on public.game_rooms;
create trigger on_room_finished
  after update of status on public.game_rooms
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.record_game_plays();

drop trigger if exists on_point_event on public.point_events;
create trigger on_point_event
  after insert on public.point_events
  for each row execute function public.apply_point_event();

-- Beğeni ve yorum sayaçları
create or replace function public.bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;

drop trigger if exists on_post_like_change on public.post_likes;
create trigger on_post_like_change
  after insert or delete on public.post_likes
  for each row execute function public.bump_like_count();

create or replace function public.bump_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;

drop trigger if exists on_comment_change on public.comments;
create trigger on_comment_change
  after insert or delete on public.comments
  for each row execute function public.bump_comment_count();

-- ---------------------------------------------------------------------
-- 5) Kullanıcının çağırdığı fonksiyonlar
-- ---------------------------------------------------------------------

create or replace function public.update_my_profile(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  v := public._require_user();
  if char_length(v_name) not between 2 and 60 then raise exception 'invalid_name'; end if;
  -- Sponsor hesabın adı mekân adıdır; yalnızca moderatör değiştirir
  if v.role::text = 'sponsor' then raise exception 'sponsor_locked'; end if;
  -- Doğrulanmış hesabın adı nüfustaki addır; değiştirilemez
  if v.identity_verified_at is not null then raise exception 'name_locked_verified'; end if;
  if v.role <> 'admin' and public._is_reserved_name(v_name) then raise exception 'reserved_name'; end if;
  if v_name = v.full_name then return; end if;
  -- Üye gerçek adını yalnızca 1 kez değiştirebilir (aynı anda iki istek hakkı aşmasın diye satır kilitlenir)
  if v.role = 'user' then
    perform 1 from public.profiles where id = v.id and name_changes < 1 for update;
    if not found then raise exception 'name_change_used'; end if;
  end if;
  update public.profiles
     set full_name = v_name,
         name_changes = name_changes + (case when v.role = 'user' then 1 else 0 end)
   where id = v.id;
end $$;

-- Hesabı ve tüm içeriğini kalıcı olarak siler (mağaza ve KVKK gereği). Üye "onaylıyorum" yazarak onaylar.
-- Yasaklı hesap kendini silemez. Cihaz kaydı kalır: aynı telefondan yeni hesap açılamaz.
drop function if exists public.delete_my_account();
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if public._tr_fold(p_confirm) <> 'onayliyorum' then raise exception 'confirm_required'; end if;
  delete from public.posts where id in (select post_id from public.post_authors where author_id = v.id);
  delete from public.comments where id in (select comment_id from public.comment_authors where author_id = v.id);
  -- Hesabını silen üyenin açtığı etkinlikler iptal olur (moderatörün etkinlikleri kalır)
  if v.role <> 'admin' then
    update public.events set is_cancelled = true where created_by = v.id;
  end if;
  delete from auth.users where id = v.id;
end $$;

-- Paket 24: akışta ve sohbetlerde bağlantı (link) yasak. Açık adresler, "www", alan adları (boşluklu ya da "nokta" ile
-- gizlenmiş olanlar dahil), kısa bağlantılar ve e-posta adresleri reddedilir.
create or replace function public._has_link(p_text text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_text, '') ~* '(https?\s*:\s*/\s*/|www\s*[.,]|(^|[^a-z0-9])(t\.me|wa\.me|bit\.ly|tinyurl|discord\.gg)|[a-z0-9-]{2,}\s*(\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+nokta\s+|\s+dot\s+)\s*(com|net|org|info|biz|io|tr|ly|gg|app|xyz|site|online|link|shop|store|tv|club|dev|live|page|ru)([^a-z0-9]|$)|[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+\s*\.\s*[a-z]{2,})';
$$;

-- Akışta paylaşılamayan iletişim bilgisi: bağlantı / e-posta (yukarıdaki _has_link), e-posta servis adı, sosyal medya
-- hesabı ("insta: kullaniciadi") ve telefon numarası (en az 10 rakam; boşluk, tire, parantezle ayrılmış olabilir).
create or replace function public._has_contact_info(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  t text := coalesce(p_text, '');
  m text[];
begin
  if public._has_link(t) then return true; end if;
  if t ~* '(^|[^a-z])(gmail|hotmail|outlook|yahoo|icloud|yandex|protonmail)([^a-z]|$)' then return true; end if;
  if t ~* '(^|[^a-z])(instagram|insta|ig|snapchat|snap|telegram|tg|whatsapp|watsap|wp|tiktok|discord|twitter|facebook|fb)\s*(:|=|hesab[ıi]m?\s*:?)\s*@?[a-z0-9._]{3,}' then
    return true;
  end if;
  for m in select regexp_matches(t, '\+?[0-9][0-9 ()-]{8,}[0-9]', 'g') loop
    if char_length(regexp_replace(m[1], '[^0-9]', '', 'g')) >= 10 then return true; end if;
  end loop;
  return false;
end $$;

-- Akışta paylaşılamayan kodlar: şu an geçerli oyun odası, Bilgi Yarışması özel oda, arkadaş, etkinlik, mekân (sponsor)
-- ve hazine kodları. Yalnızca gerçekten geçerli bir kodla birebir eşleşince true döner; sıradan kelimeler etkilenmez.
-- Adaylar: 5–6 karakterlik harf/rakam kelimeleri ve harf harf ayrılarak yazılmışlar ("A B C 2 3", "A-B-C-2-3").
-- Kod tablolarını okuduğu için yetkili çalışır; kimse doğrudan çağıramaz (yalnızca gönderi / yorum yazarken).
-- Gönderi ve yorumda dakikalık yazma sınırından SONRA çağrılır: böylece kod tahmin etmek için kullanılamaz.
create or replace function public._has_shared_code(p_text text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t text := coalesce(p_text, '');
  w constant text := 'A-Za-z0-9çÇğĞıİöÖşŞüÜâÂîÎûÛ';
  v_tokens text[];
  v_key text;
begin
  select coalesce(array_agg(distinct x), '{}') into v_tokens from (
    select upper(m[1]) as x
      from regexp_matches(t, '(?<![' || w || '])([A-Za-z0-9]{5,6})(?![' || w || '])', 'g') m
    union all
    select upper(regexp_replace(m[1], '[^A-Za-z0-9]', '', 'g'))
      from regexp_matches(t, '(?<![' || w || '])((?:[A-Za-z0-9][ .\-_/*]{1,2}){4,5}[A-Za-z0-9])(?![' || w || '])', 'g') m
  ) s where char_length(x) between 5 and 6;
  if cardinality(v_tokens) > 0 and (
       exists (select 1 from public.room_codes rc join public.game_rooms r on r.id = rc.room_id
                where rc.code = any (v_tokens) and r.status in ('lobby', 'playing'))
    or exists (select 1 from public.quiz_matches q where q.room_code = any (v_tokens) and q.status = 'playing')
    or exists (select 1 from public.profiles p where p.friend_code = any (v_tokens))
    or exists (select 1 from public.event_codes ec join public.events e on e.id = ec.event_id
                where ec.code = any (v_tokens) and not e.is_cancelled and e.starts_at > now() - interval '2 days')
    or exists (select 1 from public.sponsor_codes sc
                where sc.code = any (v_tokens) and sc.redeemed_at is null and sc.expires_at > now())
  ) then
    return true;
  end if;
  -- Hazine kodu: 3 kelime, sırasıyla geçiyorsa (büyük/küçük harf ve Türkçe karakter farkı gözetilmez)
  v_key := ' ' || public._treasure_key(t) || ' ';
  if exists (select 1 from public.treasures tr
              where tr.found_at is null and tr.removed_at is null and tr.expires_at > now()
                and position(' ' || tr.code_key || ' ' in v_key) > 0) then
    return true;
  end if;
  return false;
end $$;

-- Küfür süzgeci için bir kelimeyi düzenli ifadeye çevirir: büyük/küçük harf, Türkçe/İngilizce harf (ş→s, ç→c, ğ→g,
-- ö→o, ü→u, ı↔i) ve sık kullanılan rakam/simge yerine geçmeleri (a→4/@, e→3, i→1/!, o→0, s→5/$) aynı sayılır.
-- Büyük yazılan Ş / Ç / Ğ "yalnızca Türkçe harf" demektir (ör. sıkış ≠ sikiş, sıktığım ≠ siktiğim).
create or replace function public._pf_rx(p_word text)
returns text language plpgsql immutable as $$
declare
  c text;
  v_out text := '';
begin
  foreach c in array regexp_split_to_array(p_word, '') loop
    v_out := v_out || case c
      when 'a' then '[aA4@âÂ]' when 'e' then '[eE3]' when 'i' then '[iİI1!]' when 'ı' then '[ıIiİ1]'
      when 'o' then '[oO0]' when 'ö' then '[öÖoO0]' when 'u' then '[uU]' when 'ü' then '[üÜuU]'
      when 's' then '[sS5$]' when 'ş' then '[şŞsS5$]' when 'c' then '[cC]' when 'ç' then '[çÇcC]'
      when 'g' then '[gG]' when 'ğ' then '[ğĞgG]'
      when 'Ş' then '[şŞ]' when 'Ç' then '[çÇ]' when 'Ğ' then '[ğĞ]'
      else '[' || c || upper(c) || ']' end;
  end loop;
  return v_out;
end $$;

-- Ağır küfür ve hakaretler ***** olarak yazılır (hafif olanlar, ör. amk, aq, mal, dokunulmaz). Kelimenin başı listedeki
-- köklerden biriyle başlıyorsa kelimenin tamamı gizlenir. Kökler, sıradan kelimelerle karışmayacak biçimde seçildi
-- (ör. "sıkıntı", "sıkıldım", "eksik", "sikke", "götür" etkilenmez).
create or replace function public._mask_profanity(p_text text)
returns text language plpgsql immutable set search_path = public as $$
declare
  w constant text := 'A-Za-z0-9çÇğĞıİöÖşŞüÜâÂîÎûÛ';
  v text := coalesce(p_text, '');
  s text;
begin
  foreach s in array array[
    'orospu', 'orosbu', 'oruspu', 'piÇ', 'pezeven', 'kahpe', 'yarra', 'yarak', 'dalyara', 'dalyarra',
    'siktir', 'hassiktir', 'hasiktir', 'siker', 'sikey', 'sikiyim', 'sikim', 'sikik', 'sikiŞ', 'siktiĞ',
    'sikicem', 'sikecem', 'sikeceğ', 'sikmek', 'amına', 'amını', 'amcı', 'götveren', 'götoş', 'götlek',
    'ibne', 'puşt', 'kaltak', 'fahişe', 'yavşak', 'gavat', 'kancık', 'şerefsiz', 'sürtük'
  ] loop
    v := regexp_replace(v, '(^|[^' || w || '])' || public._pf_rx(s) || '[' || w || ']*', '\1*****', 'g');
  end loop;
  return v;
end $$;

-- Etiket biçimleri: "@Lakap#145", "@#145" ya da kısaca "@145". Bir harf/rakamdan hemen sonra gelen @ etiket sayılmaz.
-- Grup 1: etiketin tamamı, grup 2: lakap (yazıldıysa), grup 3: numara
create or replace function public._mention_re()
returns text language sql immutable set search_path = public as $$
  select '(?<![A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû_#@])(@(?:([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]{0,30})#)?([0-9]{1,5}))(?![0-9])';
$$;

-- Gönderi metnindeki etiketleri bu haftaki sahibinin rumuzuyla yazar: "@145" ve "@#145" → "@Kaptan#145" (lakap küçük
-- harfle yazıldıysa da doğru haliyle). Sahibi bulunamayan etiket olduğu gibi kalır. Metin 500 karakteri aşacaksa
-- metin değiştirilmez (etiket yine çalışır).
create or replace function public._expand_mentions(p_body text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_out text := coalesce(p_body, '');
  t record;
  v_alias text;
  n int := 0;
begin
  for t in select distinct g[1] as tok, coalesce(g[2], '') as lakap, g[3] as num
             from regexp_matches(v_out, public._mention_re(), 'g') as m(g) loop
    n := n + 1;
    exit when n > 10;
    select p.alias into v_alias from public.profiles p where p.id = public._alias_lookup(t.lakap || '#' || t.num);
    -- Boşluklu (eski biçim) rumuz akışta etiket olarak tanınmaz: "@#145" biçimi korunur
    if v_alias is null or v_alias ~ '\s' or v_alias !~ ('#' || t.num || '$') then continue; end if;
    v_out := regexp_replace(v_out,
      '(?<![A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû_#@])' || t.tok || '(?![0-9])', '@' || v_alias, 'g');
  end loop;
  if char_length(v_out) > 500 then return p_body; end if;
  return v_out;
end $$;

drop function if exists public.create_post(text);
drop function if exists public.create_post(text, text);
drop function if exists public.create_post(text, text, uuid);
drop function if exists public.create_post(text, text, uuid, int, int, int, int);
-- Gönderi yaz. p_reply_to verilirse "cevap"tır: cevaplanan gönderinin yazarı etiketlenir (o hafta rumuzu ne olursa
-- olsun). Metindeki "@Lakap#145", "@#145" ya da "@145" biçimindeki rumuzlar da bu haftaki sahiplerine etiket olur (en çok 5 kişi;
-- büyük/küçük harf önemsiz). Etiket yalnızca rumuzla yapılır.
-- Etiketlenen kişinin kim olduğu yazara gösterilmez; yalnızca etiketlenen kişi kendi ekranında görür.
-- p_cell_q/r: petek akışına yazılır (genel akışta görünmez). p_my_q/r: telefonun bir kez aldığı konumun peteği;
-- yazılan peteğe en çok cell_feed_max_distance (1) petek uzaklıkta olmalı. Tam konum sunucuya gelmez.
-- p_thread_of: kendi gönderinin devamı (zincir). Devam, ilk gönderinin peteğine yazılır; petekteyse yine yakında olmak gerekir.
create or replace function public.create_post(p_body text, p_place_id text default null, p_reply_to uuid default null,
                                              p_cell_q int default null, p_cell_r int default null,
                                              p_my_q int default null, p_my_r int default null,
                                              p_thread_of uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_place public.places;
  v_reply_author uuid;
  v_reply_cell_q int;
  v_reply_cell_r int;
  v_root public.posts;
  v_no int := 0;
  m record;
begin
  v := public._require_writer('post_requires_premium');
  if char_length(v_body) not between 1 and 500 then raise exception 'invalid_body'; end if;
  if public._has_contact_info(v_body) then raise exception 'contact_not_allowed'; end if;
  if p_thread_of is not null then
    if p_reply_to is not null or p_place_id is not null then raise exception 'invalid_thread'; end if;
    select * into v_root from public.posts where id = p_thread_of for update;
    if not found or v_root.thread_root is not null or v_root.is_hidden or v_root.by_event or v_root.by_sponsor
       or not public._post_live(v_root.created_at, v_root.event_id)
       or not exists (select 1 from public.post_authors a where a.post_id = v_root.id and a.author_id = v.id) then
      raise exception 'post_not_found';
    end if;
    select count(*)::int into v_no from public.posts where thread_root = v_root.id;
    if v_no >= greatest(1, public.setting_int('feed_thread_max', 5)) - 1 then raise exception 'thread_full'; end if;
    v_no := v_no + 1;
    p_cell_q := v_root.cell_q;
    p_cell_r := v_root.cell_r;
  end if;
  if (p_cell_q is null) <> (p_cell_r is null) then raise exception 'invalid_cell'; end if;
  if p_cell_q is not null then
    if not public._map_cell_ok(p_cell_q, p_cell_r) then raise exception 'invalid_cell'; end if;
    if p_my_q is null or p_my_r is null
       or public._hex_dist(p_cell_q, p_cell_r, p_my_q, p_my_r) > greatest(0, public.setting_int('cell_feed_max_distance', 1)) then
      raise exception 'cell_too_far';
    end if;
    if p_place_id is not null then raise exception 'invalid_cell'; end if;
  end if;
  if p_place_id is not null then
    select * into v_place from public.places where id = p_place_id;
    if not found then raise exception 'place_not_found'; end if;
  end if;
  if p_reply_to is not null then
    select pa.author_id, rp.cell_q, rp.cell_r into v_reply_author, v_reply_cell_q, v_reply_cell_r
      from public.posts rp join public.post_authors pa on pa.post_id = rp.id
     where rp.id = p_reply_to and not rp.is_hidden and not public.post_blocked_by_me(rp.id)
       and rp.thread_root is null and public._post_live(rp.created_at, rp.event_id);
    if not found then raise exception 'post_not_found'; end if;
    -- Petek gönderisine cevap aynı petekte yazılır (genel akışa taşınmaz)
    if v_reply_cell_q is distinct from p_cell_q or v_reply_cell_r is distinct from p_cell_r then
      raise exception 'post_not_found';
    end if;
  end if;
  if (select count(*) from public.post_authors pa
        join public.posts p on p.id = pa.post_id
       where pa.author_id = v.id and p.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'rate_limited';
  end if;
  -- Kod paylaşımı (oda, arkadaş, etkinlik, mekân, hazine) yazma sınırından sonra bakılır (kod tahmini yapılamasın)
  if public._has_shared_code(v_body) then raise exception 'contact_not_allowed'; end if;
  -- Etiketler akışta rumuzla görünür: "@145" → "@Kaptan#145"
  v_body := public._expand_mentions(v_body);
  -- Ağır küfürler ***** olarak kaydedilir
  v_body := left(public._mask_profanity(v_body), 500);
  -- Sponsor hesap gerçek adıyla yazar (rumuz yerine); bu bayrak yazıldığı anki durumu saklar
  insert into public.posts (alias, avatar_index, body, place_id, place_name, place_label, place_district, by_sponsor,
                            reply_to, cell_q, cell_r, thread_root, thread_no)
  values (case when v.role::text = 'sponsor' then v.full_name when v.role = 'admin' then 'Moderatör' else v.alias end,
          v.avatar_index, v_body,
          v_place.id, v_place.name, v_place.cat_label, v_place.district, v.role::text = 'sponsor', p_reply_to,
          p_cell_q, p_cell_r, p_thread_of, v_no)
  returning id into v_id;
  -- Arşiv temizliği (ara sıra): feed_archive_days günden eski gönderiler silinir
  if random() < 0.02 then perform public._feed_purge(); end if;
  insert into public.post_authors (post_id, author_id) values (v_id, v.id);
  -- Etiketler: cevaplanan gönderinin yazarı + metindeki @rumuzlar (kendisi ve onu engelleyenler hariç, en çok 5)
  for m in
    select distinct x.uid from (
      select v_reply_author as uid where v_reply_author is not null
      union all
      select public._alias_lookup(coalesce(t.g[2], '') || '#' || t.g[3])
        from regexp_matches(v_body, public._mention_re(), 'g') as t(g)
    ) x
    join public.profiles u on u.id = x.uid and u.banned_at is null
   where x.uid <> v.id
     and p_cell_q is null -- petek gönderisinde etiket bildirimi yok (genel akışta görünmez)
     and not exists (select 1 from public.user_blocks b where b.blocker_id = x.uid and b.blocked_id = v.id)
   limit 5
  loop
    insert into public.post_mentions (post_id, user_id) values (v_id, m.uid) on conflict do nothing;
    -- Bahsetme bildirimi (tercih kapalıysa _notify oluşturmaz). Yazarın kimliği bildirime yazılmaz; saatte en çok 10.
    if (select count(*) from public.notifications n
         where n.user_id = m.uid and n.kind = 'mention' and n.created_at > now() - interval '1 hour') < 10 then
      perform public._notify(m.uid, 'mention', 'Akışta senden bahsedildi',
        left(v_body, 140) || case when char_length(v_body) > 140 then '…' else '' end,
        jsonb_build_object('route', '/akis', 'mentions', true));
    end if;
  end loop;
  -- Yer eklendiyse yerin PETEĞİ yoğunluğa sayılır (aynı üye, aynı petek, günde en çok 1 kez)
  if v_place.id is not null and public._map_cell_ok(v_place.q, v_place.r) then
    perform public._map_cleanup();
    insert into public.map_signals (user_id, q, r, source, day)
    values (v.id, v_place.q, v_place.r, 'post', public._map_day())
    on conflict do nothing;
  end if;
  return v_id;
end $$;

create or replace function public.create_comment(p_post_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  v := public._require_writer(null); -- yorum yazmak herkese açık (susturulmamış olmak yeter)
  if char_length(v_body) not between 1 and 300 then raise exception 'invalid_body'; end if;
  if public._has_contact_info(v_body) then raise exception 'contact_not_allowed'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and not is_hidden and thread_root is null
                  and public._post_live(created_at, event_id)) then
    raise exception 'post_not_found';
  end if;
  if (select count(*) from public.comment_authors ca
        join public.comments c on c.id = ca.comment_id
       where ca.author_id = v.id and c.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;
  if public._has_shared_code(v_body) then raise exception 'contact_not_allowed'; end if;
  v_body := left(public._mask_profanity(v_body), 300);
  insert into public.comments (post_id, alias, avatar_index, body, by_sponsor)
  values (p_post_id, case when v.role::text = 'sponsor' then v.full_name when v.role = 'admin' then 'Moderatör'
                          else v.alias end, v.avatar_index, v_body,
          v.role::text = 'sponsor') returning id into v_id;
  insert into public.comment_authors (comment_id, author_id) values (v_id, v.id);
  return v_id;
end $$;

-- Beğeniyi aç/kapat. true = beğenildi, false = beğeni geri alındı
create or replace function public.toggle_like(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if not exists (select 1 from public.posts where id = p_post_id and not is_hidden and thread_root is null
                  and public._post_live(created_at, event_id)) then
    raise exception 'post_not_found';
  end if;
  delete from public.post_likes where post_id = p_post_id and user_id = v.id;
  if found then return false; end if;
  insert into public.post_likes (post_id, user_id) values (p_post_id, v.id);
  return true;
end $$;

create or replace function public.block_author_of_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_author uuid;
  v_alias text;
begin
  v := public._require_user();
  select pa.author_id, p.alias into v_author, v_alias
    from public.post_authors pa join public.posts p on p.id = pa.post_id
   where pa.post_id = p_post_id;
  if not found then raise exception 'post_not_found'; end if;
  if v_author = v.id then raise exception 'cannot_block_self'; end if;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, v_author, v_alias)
  on conflict (blocker_id, blocked_id) do nothing;
  -- Engellediğim kişiyle arkadaşlık (ya da bekleyen istek) varsa biter
  delete from public.friendships
   where (requester_id = v.id and addressee_id = v_author) or (requester_id = v_author and addressee_id = v.id);
end $$;

drop function if exists public.my_blocks();
create or replace function public.my_blocks()
returns table (id uuid, blocked_alias text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ub.id, ub.blocked_alias, ub.created_at
    from public.user_blocks ub
   where ub.blocker_id = auth.uid()
   order by ub.created_at desc;
$$;

create or replace function public.unblock(p_block_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.user_blocks where id = p_block_id and blocker_id = auth.uid();
$$;

-- ---- Arkadaşlık ----------------------------------------------------

-- İstek gönderme çekirdeği. Döner: 'sent' (istek gitti) ya da 'accepted' (karşı taraf da bana istek atmıştı, arkadaş olundu).
-- Karşı tarafın beni engellediği ya da isteğimi reddettiği durumlar gönderene hissettirilmez ('sent' döner).
create or replace function public._send_friend_request(p_target uuid, p_alias text, p_avatar int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.profiles;
  f public.friendships;
begin
  v := public._require_writer(null);
  if p_target is null then raise exception 'request_not_found'; end if;
  if p_target = v.id then raise exception 'cannot_friend_self'; end if;
  select * into t from public.profiles where id = p_target and banned_at is null;
  if not found then raise exception 'request_not_found'; end if;
  if v.role::text = 'sponsor' or t.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;

  if exists (select 1 from public.user_blocks where blocker_id = t.id and blocked_id = v.id) then
    return 'sent';
  end if;
  if exists (select 1 from public.user_blocks where blocker_id = v.id and blocked_id = t.id) then
    raise exception 'blocked_by_you';
  end if;

  select * into f from public.friendships
   where (requester_id = v.id and addressee_id = t.id) or (requester_id = t.id and addressee_id = v.id);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requester_id = v.id then
      if f.status = 'pending' then raise exception 'already_requested'; end if;
      return 'sent'; -- reddedilmiş: gönderene bildirilmez
    end if;
    -- Karşı taraf bana istek atmıştı
    if f.status = 'pending' then
      update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
      perform public._notify(t.id, 'system', 'Yeni arkadaşın var',
        v.full_name || ' ile artık arkadaşsınız.', jsonb_build_object('route', '/arkadaslar'));
      return 'accepted';
    end if;
    -- Ben onun isteğini reddetmiştim, şimdi ben istiyorum: eski satır silinip yeni istek açılır
    delete from public.friendships where id = f.id;
  end if;

  if (select count(*) from public.friendships
       where requester_id = v.id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.friendships where requester_id = v.id and status <> 'accepted') >= 50 then
    raise exception 'too_many_requests';
  end if;

  insert into public.friendships (requester_id, addressee_id, requester_alias, requester_avatar, addressee_alias, addressee_avatar)
  values (v.id, t.id, v.alias, v.avatar_index, coalesce(nullif(btrim(p_alias), ''), t.alias), coalesce(p_avatar, t.avatar_index));
  -- Bildirim kutusuna düşer (yalnızca isteği atanın o haftaki rumuzu görünür, gerçek adı görünmez)
  perform public._notify(t.id, 'friend_request', 'Yeni arkadaşlık isteği',
    v.alias || ' sana arkadaşlık isteği gönderdi.', jsonb_build_object('route', '/arkadaslar'));
  return 'sent';
end $$;

-- Gönderinin yazarına arkadaşlık isteği (yazarın kim olduğu isteği atana gösterilmez)
create or replace function public.send_friend_request_for_post(p_post_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_alias text;
  v_avatar int;
begin
  perform public._require_writer(null);
  select pa.author_id, p.alias, p.avatar_index into v_author, v_alias, v_avatar
    from public.post_authors pa join public.posts p on p.id = pa.post_id
   where pa.post_id = p_post_id and (not p.is_hidden or public.is_admin());
  if not found then raise exception 'post_not_found'; end if;
  return public._send_friend_request(v_author, v_alias, v_avatar);
end $$;

create or replace function public.send_friend_request_for_comment(p_comment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_alias text;
  v_avatar int;
begin
  perform public._require_writer(null);
  select ca.author_id, c.alias, c.avatar_index into v_author, v_alias, v_avatar
    from public.comment_authors ca join public.comments c on c.id = ca.comment_id
   where ca.comment_id = p_comment_id and (not c.is_hidden or public.is_admin());
  if not found then raise exception 'comment_not_found'; end if;
  return public._send_friend_request(v_author, v_alias, v_avatar);
end $$;

-- Paket 28: etkinlik yorumu (gerçek adla yazılır) üzerinden arkadaşlık isteği. Moderatör ve mekân yorumlarında olmaz.
create or replace function public.send_friend_request_for_event_comment(p_comment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t public.profiles;
begin
  perform public._require_writer(null);
  select pr.* into t
    from public.event_comments c join public.profiles pr on pr.id = c.user_id
   where c.id = p_comment_id and (not c.is_hidden or public.is_admin())
     and exists (select 1 from public.events e where e.id = c.event_id and not e.is_cancelled);
  if not found then raise exception 'comment_not_found'; end if;
  if t.role::text <> 'user' then raise exception 'request_not_found'; end if;
  return public._send_friend_request(t.id, t.alias, t.avatar_index);
end $$;

-- Arkadaş koduyla istek
create or replace function public.send_friend_request_by_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_target uuid;
begin
  perform public._require_writer(null);
  if char_length(v_code) <> 6 then raise exception 'code_not_found'; end if;
  select id into v_target from public.profiles where friend_code = v_code and banned_at is null;
  if not found then raise exception 'code_not_found'; end if;
  return public._send_friend_request(v_target, null, null);
end $$;

-- Benim arkadaş kodum (ilk istendiğinde üretilir)
create or replace function public.my_friend_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_code text;
  v_tries int := 0;
begin
  v := public._require_user();
  select friend_code into v_code from public.profiles where id = v.id;
  if v_code is not null then return v_code; end if;
  loop
    v_code := public._random_code(6);
    begin
      update public.profiles set friend_code = v_code where id = v.id and friend_code is null;
      return (select friend_code from public.profiles where id = v.id);
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 10 then raise exception 'code_generation_failed'; end if;
    end;
  end loop;
end $$;

-- İsteğe yanıt (yalnızca isteğin gönderildiği kişi): 'accept', 'decline' ya da 'decline_block' (reddet ve engelle)
create or replace function public.respond_friend_request(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  f public.friendships;
begin
  v := public._require_user();
  if p_action not in ('accept', 'decline', 'decline_block') then raise exception 'invalid_action'; end if;
  select * into f from public.friendships where id = p_id and addressee_id = v.id and status = 'pending';
  if not found then raise exception 'request_not_found'; end if;
  if p_action = 'accept' then
    if not exists (select 1 from public.profiles where id = f.requester_id and banned_at is null) then
      delete from public.friendships where id = f.id;
      raise exception 'request_not_found';
    end if;
    update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
    perform public._notify(f.requester_id, 'system', 'Arkadaşlık isteğin kabul edildi',
      v.full_name || ' ile artık arkadaşsınız.', jsonb_build_object('route', '/arkadaslar'));
  elsif p_action = 'decline' then
    update public.friendships set status = 'declined', responded_at = now() where id = f.id;
  else
    insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
    values (v.id, f.requester_id, f.requester_alias)
    on conflict (blocker_id, blocked_id) do nothing;
    delete from public.friendships where id = f.id;
  end if;
end $$;

-- Gönderdiğim isteği geri çek
create or replace function public.cancel_friend_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.friendships where id = p_id and requester_id = v.id and status <> 'accepted';
  if not found then raise exception 'request_not_found'; end if;
end $$;

-- Arkadaşlıktan çık (iki taraftan biri yapabilir)
create or replace function public.remove_friend(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.friendships
   where id = p_id and status = 'accepted' and (requester_id = v.id or addressee_id = v.id);
  if not found then raise exception 'request_not_found'; end if;
end $$;

-- Arkadaşlarım, bana gelen istekler ve gönderdiklerim. kind: 'friend' | 'incoming' | 'outgoing'
-- Yalnızca arkadaşların gerçek adı (full_name) gelir; istekte yalnızca rumuz görünür.
drop function if exists public.my_friendships();
create or replace function public.my_friendships()
returns table (id uuid, kind text, full_name text, alias text, avatar_index int, created_at timestamptz, title text,
               photo_path text)
language sql stable security definer set search_path = public as $$
  with ct as materialized (select * from public._champion_titles())
  select f.id,
         case when f.status = 'accepted' then 'friend'
              when f.addressee_id = auth.uid() then 'incoming'
              else 'outgoing' end,
         case when f.status = 'accepted' then o.full_name else null end,
         case when f.status = 'accepted' then o.alias
              when f.addressee_id = auth.uid() then f.requester_alias
              else f.addressee_alias end,
         case when f.status = 'accepted' then o.avatar_index
              when f.addressee_id = auth.uid() then f.requester_avatar
              else f.addressee_avatar end,
         coalesce(f.responded_at, f.created_at),
         -- Ünvan yalnızca gerçek adı görünen arkadaşta gösterilir (istekte yalnızca rumuz var, ünvan yok)
         case when f.status = 'accepted'
              then public._title_join((select array_agg(t.label order by t.sort_order) from ct t where t.user_id = o.id))
              else null end,
         -- Profil resmi yalnızca arkadaşta (gerçek adı görünen)
         case when f.status = 'accepted' then public._photo_of(o.id) else null end
    from public.friendships f
    join public.profiles o on o.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
   where public._is_active_user()
     and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
     and o.banned_at is null
     and not (f.status = 'declined' and f.addressee_id = auth.uid())
   order by 2, 6 desc
   limit 500;
$$;

-- Bana gelen, yanıt bekleyen istek sayısı (rozet için)
create or replace function public.my_friend_request_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.friendships f
    join public.profiles o on o.id = f.requester_id
   where public._is_active_user()
     and f.addressee_id = auth.uid() and f.status = 'pending' and o.banned_at is null;
$$;

create or replace function public.report_content(p_type text, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v := public._require_user();
  if p_type not in ('post', 'comment', 'event_comment', 'venue_review', 'room', 'event', 'quiz_chat', 'vv_whisper',
                    'vv_dead', 'dm', 'sk_voice') then
    raise exception 'invalid_type';
  end if;
  -- Köpekbalığı Kafesi ses mesajı: yalnızca o mesajı dinleyebilen kişi (kendi mesajı hariç) bildirebilir.
  -- Bildirilen mesaj 10 dakikada silinmez; moderatör bakana kadar en çok 14 gün saklanır.
  if p_type = 'sk_voice' then
    if not exists (select 1 from public.sk_voice_clips c where c.id = p_id and c.user_id <> v.id
                    and public._sk_clip_visible(c, v.id)) then
      raise exception 'target_not_found';
    end if;
    update public.sk_voice_clips set reported_at = coalesce(reported_at, now()) where id = p_id;
  end if;
  -- Özel mesaj: yalnızca yazışmadaki diğer kişi, kendisine gelen mesajı bildirebilir
  if p_type = 'dm' and not exists (
       select 1 from public.dm_messages m join public.dm_threads d on d.id = m.thread_id
        where m.id = p_id and m.sender_id <> v.id and (d.user_a = v.id or d.user_b = v.id)) then
    raise exception 'target_not_found';
  end if;
  -- Elenenlerin sohbeti: aynı odadaki bir oyuncu, başkasının mesajını bildirebilir
  if p_type = 'vv_dead' and not exists (
       select 1 from public.vv_dead_chat d
         join public.room_players rp on rp.room_id = d.room_id and rp.user_id = v.id
        where d.id = p_id and d.user_id <> v.id) then
    raise exception 'target_not_found';
  end if;
  -- Vampir–Köylü fısıltısı: yalnızca fısıltıyı ALAN kişi bildirebilir (içeriği yalnızca o görür)
  if p_type = 'vv_whisper' and not exists (
       select 1 from public.vv_whispers w where w.id = p_id and w.to_user = v.id) then
    raise exception 'target_not_found';
  end if;
  -- Bilgi Yarışması sohbet mesajı: yalnızca o maçtaki rakip bildirebilir (kendi mesajını bildiremez)
  if p_type = 'quiz_chat' and not exists (
       select 1 from public.quiz_chat c
         join public.quiz_match_players mp on mp.match_id = c.match_id and mp.user_id = v.id
        where c.id = p_id and c.user_id <> v.id) then
    raise exception 'target_not_found';
  end if;
  -- Oda yalnızca içindeki ya da sahibi olan kişi, etkinlik ise herkes tarafından bildirilebilir
  if p_type = 'room' and not exists (
       select 1 from public.game_rooms r where r.id = p_id
          and (r.host_id = v.id or exists (select 1 from public.room_players rp where rp.room_id = r.id and rp.user_id = v.id))) then
    raise exception 'target_not_found';
  end if;
  if p_type = 'event' and not exists (select 1 from public.events where id = p_id) then
    raise exception 'target_not_found';
  end if;
  if char_length(v_reason) not between 3 and 300 then raise exception 'invalid_reason'; end if;
  if p_type = 'event_comment' and not exists (select 1 from public.event_comments where id = p_id) then
    raise exception 'target_not_found';
  end if;
  if p_type = 'venue_review' and not exists (select 1 from public.venue_reviews where id = p_id) then
    raise exception 'target_not_found';
  end if;
  if p_type = 'post' and not exists (select 1 from public.posts where id = p_id) then
    raise exception 'target_not_found';
  end if;
  if p_type = 'comment' and not exists (select 1 from public.comments where id = p_id) then
    raise exception 'target_not_found';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v.id, p_type, p_id, v_reason)
  on conflict (reporter_id, target_type, target_id) do nothing;
end $$;

-- Premium muafiyeti sadece ücretli ve moderatörün (41. Kat Sosyal) düzenlediği etkinliklerde geçerlidir.
-- Bir premium üyenin kendi açtığı ücretli etkinlikte fiyatı o belirler, muafiyet uygulanmaz.
create or replace function public._event_fee_waived(p_created_by uuid, p_fee numeric, p_premium_until timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_fee > 0
     and public.setting_bool('event_fee_waived_for_premium')
     and coalesce(p_premium_until > now(), false)
     and (p_created_by is null
          or exists (select 1 from public.profiles h where h.id = p_created_by and h.role = 'admin'));
$$;

create or replace function public.register_for_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_ev public.events;
  v_waived boolean;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  -- Etkinlik satırı kilitlenir: kontenjanın son yerine iki kişi aynı anda yazılamasın
  select * into v_ev from public.events where id = p_event_id and not is_cancelled for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_ev.approval <> 'approved' then raise exception 'event_not_found'; end if;
  if now() > public._event_end(v_ev.starts_at, v_ev.category) then raise exception 'event_ended'; end if;

  if not exists (select 1 from public.event_registrations where event_id = p_event_id and user_id = v.id) then
    if v_ev.created_by = v.id then raise exception 'own_event'; end if;
    -- Kontenjana düzenleyen de dahildir (+1)
    if (select count(*) from public.event_registrations where event_id = p_event_id)
       + (case when v_ev.created_by is not null then 1 else 0 end) >= v_ev.capacity then
      raise exception 'event_full';
    end if;
    -- Günde en çok event_daily_join_limit (2) etkinlik, aynı kategoriden 1 (etkinliğin günü, Türkiye saati).
    -- Aynı kişinin eşzamanlı iki kaydı sınırı aşmasın diye kişi başına kilit alınır.
    perform pg_advisory_xact_lock(hashtext('event_join:' || v.id::text));
    if (select count(*) from public.event_registrations er join public.events e2 on e2.id = er.event_id
         where er.user_id = v.id and not e2.is_cancelled
           and (e2.starts_at at time zone 'Europe/Istanbul')::date = (v_ev.starts_at at time zone 'Europe/Istanbul')::date)
       >= greatest(1, public.setting_int('event_daily_join_limit', 2)) then
      raise exception 'daily_event_limit';
    end if;
    if exists (select 1 from public.event_registrations er join public.events e2 on e2.id = er.event_id
                where er.user_id = v.id and not e2.is_cancelled and e2.category = v_ev.category
                  and (e2.starts_at at time zone 'Europe/Istanbul')::date
                      = (v_ev.starts_at at time zone 'Europe/Istanbul')::date) then
      raise exception 'daily_category_limit';
    end if;
  end if;

  v_waived := public._event_fee_waived(v_ev.created_by, v_ev.fee_amount, v.premium_until);

  insert into public.event_registrations (event_id, user_id, fee_waived)
  values (p_event_id, v.id, v_waived)
  on conflict (event_id, user_id) do nothing;

  select fee_waived into v_waived from public.event_registrations
   where event_id = p_event_id and user_id = v.id;
  return v_waived;
end $$;

-- Katılımı kodla doğrulanmış kişi kaydını geri çekemez (puanlar boşa dönmesin)
create or replace function public.cancel_event_registration(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.event_registrations
              where event_id = p_event_id and user_id = auth.uid() and checked_in_at is not null) then
    raise exception 'already_checked_in';
  end if;
  -- Ekipten de çıkılır; ekipte tek kişi kalırsa ekip dağılır. Bekleyen ekip davetleri iptal olur.
  perform public._team_remove_member(p_event_id, auth.uid());
  delete from public.event_registrations where event_id = p_event_id and user_id = auth.uid();
end $$;

-- Yan yana oynanan oyunlar (presence_required) için konum zorunlu mu? (Bilgi Yarışması ve çekiliş hariç)
create or replace function public._game_needs_location(p_game_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.setting_bool('game_location_required')
     and exists (select 1 from public.game_types where key = p_game_type and presence_required);
$$;

-- Geçerli bir enlem/boylam mı?
create or replace function public._latlng_ok(p_lat double precision, p_lng double precision)
returns boolean language sql immutable as $$
  select p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180
     and not (p_lat = 0 and p_lng = 0);
$$;

-- İki nokta arası kuş uçuşu uzaklık (metre)
create or replace function public._meters_between(a_lat double precision, a_lng double precision,
                                                  b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians(b_lat - a_lat) / 2), 2)
           + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))));
$$;

-- Telefonun bildirdiği petek numarası geçerli bir sayı çifti mi? Kocaeli dışındaki bir petek de "izin verildi" sayılır
-- (kişi Kocaeli dışında olabilir); yalnızca Kocaeli içindeki peteklerden haritaya yoğunluk kaydı üretilir.
create or replace function public._game_cell_given(p_q int, p_r int)
returns boolean language sql immutable as $$
  select p_q is not null and p_r is not null and abs(p_q) <= 100000 and abs(p_r) <= 100000;
$$;

-- Odaya KODLA girilir. Listeden bir odaya dokunulduğunda oda kimliği de (p_room_id) gönderilir: kod o odanın
-- kodu değilse içeri alınmaz. Yanlış kod hata fırlatmaz, boş (null) döner ki deneme kaydı silinmesin;
-- 10 dakikada 8 yanlış denemeden sonra yeni deneme 'too_many_attempts' ile reddedilir.
drop function if exists public.join_room(text);
drop function if exists public.join_room(text, uuid);
drop function if exists public.join_room(text, uuid, int, int);
create or replace function public.join_room(p_code text, p_room_id uuid default null, p_cell_q int default null, p_cell_r int default null,
                                            p_lat double precision default null, p_lng double precision default null,
                                            p_acc real default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room public.game_rooms;
  v_max int;
  h public.room_host_locations;
  v_dist double precision;
  v_allowed double precision;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  delete from public.room_join_failures where failed_at < now() - interval '1 hour';
  if (select count(*) from public.room_join_failures
       where user_id = v.id and failed_at > now() - interval '10 minutes') >= 8 then
    raise exception 'too_many_attempts';
  end if;
  perform public._sweep_live_rooms(); -- oyundan kopanlar önce temizlenir
  select r.* into v_room
    from public.game_rooms r join public.room_codes c on c.room_id = r.id
   where c.code = v_code and (p_room_id is null or r.id = p_room_id)
     for update of r;
  if not found then
    insert into public.room_join_failures (user_id) values (v.id);
    return null;
  end if;
  -- Bilgi Yarışması oda ile oynanmaz (eski açık kalmış oda olsa bile girilmez)
  if v_room.game_type = 'quiz' then raise exception 'game_not_available'; end if;

  -- Moderatör çekilişe oyuncu olarak girmez (kazanamaz). Vampir–Köylü'de başkasının odasına bakar; kendi odasını
  -- "Otomatik Oyun" ya da "Ben Yöneticiyim ve oynayacağım" diye açtıysa oyuncu olarak girer.
  if v.role = 'admin' and v_room.game_type in ('raffle', 'vampire_villager')
     and not (v_room.game_type = 'vampire_villager' and v_room.host_id = v.id
              and coalesce(v_room.config->>'mode', 'narrator') <> 'narrator') then
    return v_room.id;
  end if;

  -- Köpekbalığı Kafesi anlatıcısı oyuncu olarak girmez
  if v_room.game_type = 'shark_cage' and v_room.host_id = v.id and coalesce(v_room.config->>'mode', 'auto') = 'narrator' then
    return v_room.id;
  end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v.id and left_at is null) then
    return v_room.id; -- zaten odada
  end if;

  if v_room.status <> 'lobby' then raise exception 'room_closed'; end if;

  -- Paket 27: etkinlik oyununa ve etkinlik çekilişine yalnızca katılımını doğrulamış üyeler (ve oda sahibi) girer
  if v_room.event_id is not null and v.role <> 'admin' and v_room.host_id <> v.id
     and not exists (select 1 from public.event_registrations er
                      where er.event_id = v_room.event_id and er.user_id = v.id and er.checked_in_at is not null) then
    raise exception 'event_attendees_only';
  end if;

  -- Aynı anda yalnızca tek oyunda olunabilir (çekiliş hariç)
  if v.role <> 'admin'
     and exists (select 1 from public.game_types where key = v_room.game_type and presence_required)
     and public._user_live_room(v.id, v_room.id) is not null then
    raise exception 'already_in_game';
  end if;

  if v.role <> 'admin'
     and public.setting_bool('games_require_premium')
     and not (v.premium_until is not null and v.premium_until > now()) then
    raise exception 'premium_required';
  end if;

  select max_players into v_max from public.game_types where key = v_room.game_type;
  if (select count(*) from public.room_players where room_id = v_room.id) >= coalesce(v_max, 30) then
    raise exception 'room_full';
  end if;

  -- Yan yana oynanan oyuna girerken telefonun bulunduğu petek (bir kez) bildirilmek zorunda; bildirilmezse
  -- 'location_required' ile reddedilir ve uygulama konumu sorup tekrar dener. Ham konum sunucuya gelmez.
  if public._game_needs_location(v_room.game_type) and not v_room.remote
     and not public._game_cell_given(p_cell_q, p_cell_r) then
    raise exception 'location_required';
  end if;
  -- Yakınlık (yan yana oyun): oda sahibinin kesin konumu biliniyorsa katılan en çok game_join_max_meters (100) metre
  -- + iki telefonun bildirdiği konum hatası kadar uzakta olabilir; toplam en çok game_join_max_meters_cap (150) metre.
  -- Katılanın kesin konumu yalnızca bu karşılaştırmada kullanılır, hiçbir yere yazılmaz. Moderatör ve oda sahibi hariç.
  select * into h from public.room_host_locations where room_id = v_room.id;
  if found and not v_room.remote and v.role <> 'admin' and v_room.host_id <> v.id and v_room.game_type <> 'raffle' then
    if not public._latlng_ok(p_lat, p_lng) then raise exception 'location_required'; end if;
    v_dist := public._meters_between(h.lat, h.lng, p_lat, p_lng);
    v_allowed := least(greatest(10, public.setting_int('game_join_max_meters_cap', 150))::double precision,
                       greatest(10, public.setting_int('game_join_max_meters', 100))
                       + least(coalesce(h.acc, 0), 100) + least(coalesce(p_acc, 0), 100));
    if v_dist > v_allowed then raise exception 'room_too_far'; end if;
  end if;
  -- Oylamayla atılan kişi aynı odaya geri giremez
  if exists (select 1 from public.room_bans b where b.room_id = v_room.id and b.user_id = v.id) then
    raise exception 'kicked_from_room';
  end if;
  -- Oda bir bölgede açıldıysa katılan kişi de o bölgenin yakınında (en çok game_join_max_cell_distance petek) görünmeli.
  -- Telefonun bildirdiği petek kaba bir kontroldür (tam konum değil); asıl koruma koddur: kodu yalnızca oda sahibi söyler.
  -- Çekilişe haritanın her yerinden katılınabilir (Paket 24); diğer yan yana oyunlarda yakınlık aranır
  if h.room_id is null and v_room.place_q is not null and v.role <> 'admin' and v_room.game_type <> 'raffle' and not v_room.remote
     and public._game_cell_given(p_cell_q, p_cell_r)
     and public.setting_int('game_join_max_cell_distance', 1) >= 0
     and public._hex_dist(p_cell_q, p_cell_r, v_room.place_q, v_room.place_r)
         > public.setting_int('game_join_max_cell_distance', 1) then
    raise exception 'room_too_far';
  end if;

  -- Eşleştirme odasında herkes yabancıdır: gerçek ad yerine rumuz görünür
  insert into public.room_players (room_id, user_id, display_name)
  values (v_room.id, v.id, case when coalesce((v_room.config->>'match')::boolean, false) then v.alias else v.full_name end);

  -- Petek Kocaeli içindeyse kimse görünmeden haritadaki yoğunluğa sayılır (aynı odada bir kez)
  if public._game_cell_given(p_cell_q, p_cell_r) and not v_room.remote
     and exists (select 1 from public.game_types where key = v_room.game_type and presence_required)
     and public._map_cell_ok(p_cell_q, p_cell_r) then
    perform public._map_cleanup();
    insert into public.map_signals (user_id, q, r, source, room_id, day)
    values (v.id, p_cell_q, p_cell_r, 'game', v_room.id, public._map_day())
    on conflict do nothing;
  end if;
  return v_room.id;
end $$;

-- Uzaktan oda: açık odalar listesinden KODSUZ katılınır (oyuncular yan yana olmadığı için kod paylaşılamaz).
-- Yalnızca bekleme salonundaki uzaktan Vampir–Köylü odası; diğer bütün kurallar join_room'daki gibidir.
create or replace function public.join_remote_room(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  perform public._require_user();
  select c.code into v_code
    from public.game_rooms r join public.room_codes c on c.room_id = r.id
   where r.id = p_room_id and r.remote and r.status = 'lobby' and r.game_type in ('vampire_villager', 'shark_cage');
  if v_code is null then raise exception 'room_closed'; end if;
  return public.join_room(v_code, p_room_id, null, null);
end $$;

-- Odadan ayrıl. Yan yana oynanan oyunlarda: bekleme salonundaysan listeden çıkarsın, oyun başlamışsa
-- oyundan atılırsın (geri dönemezsin), oda sahibiysen oda kapanır. Çekilişte bekleme salonundan çıkarsın.
drop function if exists public.leave_room(uuid);
create or replace function public.leave_room(p_room_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
begin
  if auth.uid() is null then return null; end if;
  select * into r from public.game_rooms where id = p_room_id;
  if not found then return null; end if;
  if exists (select 1 from public.game_types where key = r.game_type and presence_required) then
    return public._room_remove_player(p_room_id, auth.uid(), 'quit');
  end if;
  delete from public.room_players
   where room_id = p_room_id and user_id = auth.uid() and r.status = 'lobby';
  return null;
end $$;

-- Sıralama: gerçek ad + puan. Kimlik numarası döndürülmez; "is_me" ile kendi satırın işaretlenir.
drop function if exists public.get_leaderboard(int);
create or replace function public.get_leaderboard(p_limit int default 100)
returns table (place bigint, full_name text, points numeric, level int, is_premium boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select t.place, t.full_name, t.points, t.level, t.is_premium, t.is_me
  from (
    select dense_rank() over (order by p.points desc) as place,
           p.full_name,
           p.points,
           coalesce((select max(l.level) from public.levels l where l.min_points <= p.points), 1) as level,
           (p.premium_until is not null and p.premium_until > now()) as is_premium,
           (p.id = auth.uid()) as is_me
      from public.profiles p
     where p.banned_at is null and p.role = 'user'
  ) t
  where public._is_active_user()
    and ((t.points > 0 and t.place <= greatest(1, least(coalesce(p_limit, 100), 500))) or t.is_me)
  order by t.place, t.full_name;
$$;

-- Uygulama açılışında çağrılır: yeni haftaya geçildiyse rumuzu yeniler
create or replace function public.ensure_my_alias()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public._rotate_alias_if_needed(auth.uid());
end $$;

-- Bu ayki kota durumum. Moderatörün kotası yoktur (limit null döner).
create or replace function public.my_quota()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_premium boolean;
  v_events_used int;
  v_games_used int;
  v_credit uuid;
  v_credit_until timestamptz;
begin
  v := public._require_user();
  v_premium := v.premium_until is not null and v.premium_until > now();
  select count(*)::int into v_events_used from public.events
   where created_by = v.id and created_at >= public._month_start();
  -- Sponsor koduyla kazanılan hakla açılan odalar aylık hakkı harcamaz
  select count(*)::int into v_games_used from public.game_rooms gr
   where gr.host_id = v.id and (gr.status <> 'cancelled' or gr.started_at is not null)
     and gr.created_at >= public._month_start()
     and exists (select 1 from public.game_types gt where gt.key = gr.game_type and gt.uses_quota)
     and not gr.remote -- uzaktan oda oyun hakkından düşmez (yalnızca yan yana oyun düşer)
     and not exists (select 1 from public.sponsor_credits sc where sc.room_id = gr.id);
  v_credit := public._free_sponsor_credit(v.id);
  select sc.created_at + make_interval(days => greatest(1, public.setting_int('sponsor_credit_valid_days', 30)))
    into v_credit_until from public.sponsor_credits sc where sc.id = v_credit;
  return jsonb_build_object(
    'is_moderator', v.role = 'admin',
    'is_sponsor', v.role::text = 'sponsor',
    'is_premium', v_premium,
    'events_limit', case when v.role <> 'user' then null else public._event_quota(v) end,
    'is_leader', v.event_leader,
    'leader_pending', exists (select 1 from public.event_leader_applications a
                               where a.user_id = v.id and a.status = 'pending'),
    'events_used', v_events_used,
    'games_limit', case when v.role <> 'user' then null else public._game_quota(v) end,
    'level_perk', public._level_perk(v.id),
    'games_used', v_games_used,
    'sponsor_credit', v_credit is not null,
    'sponsor_credit_until', v_credit_until
  );
end $$;

-- Etkinlik oluştur: moderatör sınırsız; üye ayda kota kadar (ücretsiz 1, premium 4).
-- Başlık, açıklama, yer, zaman ve kontenjan zorunludur. Ücret 0 ise etkinlik ücretsizdir.
-- Ücret uygulamada tahsil edilmez; sadece bilgi olarak gösterilir (ödeme gerçek hayatta yapılır).
-- İptal edilen etkinlik kotayı geri vermez.
-- Parametre listesi değiştiği için eski sürüm önce kaldırılır (veriye dokunmaz)
drop function if exists public.create_event(text, text, text, timestamptz, int, numeric);
drop function if exists public.create_event(text, text, text, timestamptz, int, numeric, text);
drop function if exists public.create_event(text, text, text, timestamptz, int, numeric, text, int);
drop function if exists public.create_event(text, text, text, timestamptz, int, numeric, text, int, int, int);

create or replace function public.create_event(
  p_title text, p_description text, p_location text, p_starts_at timestamptz,
  p_capacity int default null, p_fee_amount numeric default 0, p_category text default 'diger',
  p_min_age int default null, p_cell_q int default null, p_cell_r int default null,
  p_with_games boolean default false)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_loc text := btrim(coalesce(p_location, ''));
  v_fee numeric := coalesce(p_fee_amount, 0);
  v_ev public.events;
  v_premium boolean;
  v_limit int;
begin
  v := public._require_writer(null);
  v_premium := v.premium_until is not null and v.premium_until > now();
  v_limit := public._event_quota(v);
  if char_length(v_title) not between 3 and 120 then raise exception 'invalid_title'; end if;
  if char_length(v_desc) not between 10 and 1000 then raise exception 'invalid_description'; end if;
  if char_length(v_loc) not between 3 and 120 then raise exception 'invalid_location'; end if;
  if p_starts_at is null or p_starts_at <= now() or p_starts_at > now() + interval '1 year' then
    raise exception 'invalid_start';
  end if;
  -- Puan verebilmesi için etkinliğe en az pts_event_min_attendees (4) kişi gerekir; kontenjan bundan az olamaz
  if p_capacity is null or p_capacity not between greatest(1, public.setting_int('pts_event_min_attendees', 4)) and 10000 then
    raise exception 'invalid_capacity';
  end if;
  if v_fee < 0 or v_fee > 100000 then raise exception 'invalid_fee'; end if;
  if p_category is null or p_category not in
     ('konser_festival', 'oyun_gecesi', 'araba_motor', 'sosyal', 'muzik', 'spor', 'kultur', 'atolye', 'yemek', 'diger') then
    raise exception 'invalid_category';
  end if;
  if p_min_age is null or p_min_age not in (0, 16, 18, 21) then raise exception 'invalid_min_age'; end if;
  -- Mekân (sponsor) hesabının etkinliği her zaman kendi mekânının peteğinde açılır; gönderilen petek dikkate alınmaz
  if v.role::text = 'sponsor' then
    select vn.cell_q, vn.cell_r into p_cell_q, p_cell_r from public.venues vn where vn.user_id = v.id;
    if p_cell_q is null then raise exception 'venue_not_on_map'; end if;
  end if;
  -- Haritadan seçilen petek zorunlu ve Kocaeli karasında olmalı
  if p_cell_q is null or p_cell_r is null or not public._map_cell_ok(p_cell_q, p_cell_r) then
    raise exception 'invalid_cell';
  end if;

  -- Bir kişi aynı petekte günde (İstanbul saatiyle) en çok 1 etkinlik açar (moderatör hariç). İptal edilen etkinlik
  -- de sayılır (aç-iptal et-yeniden aç ile harita doldurulamasın); moderatörün reddettiği sayılmaz.
  if v.role <> 'admin' then
    perform 1 from public.profiles where id = v.id for update;
    if exists (select 1 from public.events e
                where e.created_by = v.id and e.cell_q = p_cell_q and e.cell_r = p_cell_r
                  and e.approval <> 'rejected'
                  and e.created_at >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')) then
      raise exception 'event_cell_daily_limit';
    end if;
  end if;

  if v.role = 'user' then
    -- Ücretli etkinlik: üyeye açık/kapalı bir ayar (moderatör ve sponsor için her zaman açık; ikisi de sınırsız etkinlik açar)
    if v_fee > 0 and not public.setting_bool('premium_events_can_charge') then
      raise exception 'fee_not_allowed';
    end if;
    -- Aynı anda iki istek kotayı aşmasın diye profil satırı kilitlenir
    perform 1 from public.profiles where id = v.id for update;
    -- Moderatörün reddettiği etkinlik hakkı yemez
    if (select count(*) from public.events
         where created_by = v.id and created_at >= public._month_start() and approval <> 'rejected')
       >= v_limit then
      raise exception 'quota_exceeded';
    end if;
  end if;

  -- Konser & Festival etkinliği moderatör onayından geçer (moderatörün açtığı hariç)
  insert into public.events (title, description, location, starts_at, capacity, fee_amount, category, min_age,
                             cell_q, cell_r, created_by, approval, with_games)
  values (v_title, v_desc, v_loc, p_starts_at, p_capacity, v_fee, p_category, p_min_age,
          p_cell_q, p_cell_r, v.id,
          case when p_category = 'konser_festival' and v.role <> 'admin' then 'pending' else 'approved' end,
          coalesce(p_with_games, false))
  returning * into v_ev;
  -- Katılım doğrulama kodu (yalnızca etkinliği açan görür)
  insert into public.event_codes (event_id, code) values (v_ev.id, public._random_code(6));
  -- Onay bekleyen etkinliğin açma puanı onaylanınca verilir
  if v_ev.approval = 'approved' then
    perform public._award_event_create(v_ev.id);
  end if;
  -- Moderatörün (Konser & Festival dışındaki) etkinliği 41. Kat Özel'dir: herkese duyuru gider
  if v.role = 'admin' and p_category <> 'konser_festival' then
    insert into public.announcements (title, body, created_by, kind)
    values ('Yeni 41. Kat Özel etkinlik', left('“' || v_title || '” Etkinlikler sekmesinde. Kaçırma!', 1000), v.id,
            'special_event');
  end if;
  return v_ev;
end $$;

-- Etkinlik açma puanı (moderatör sıralamada olmadığı için puan almaz). Etkinlik iptal edilirse geri alınır.
-- Ücretli etkinlik puan getirmez (ayar açılmadıkça); ayda yalnızca ilk N etkinlik açma puanı verir,
-- böylece premium (ayda 4 etkinlik) ile ücretsiz üye puanda eşit kalır ve iptal-yeniden-aç ile puan toplanamaz.
create or replace function public._award_event_create(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  h public.profiles;
begin
  select * into e from public.events where id = p_event_id;
  if not found or e.is_cancelled or e.created_by is null then return; end if;
  select * into h from public.profiles where id = e.created_by;
  if not found or h.role <> 'user' then return; end if;
  if exists (select 1 from public.point_events pe where pe.source = 'event_create' and pe.event_id = e.id) then return; end if;
  if (e.fee_amount <= 0 or public.setting_bool('pts_paid_events'))
     and (select count(*) from public.point_events pe
           where pe.user_id = h.id and pe.source = 'event_create' and pe.created_at >= public._month_start())
         < public.setting_int('pts_event_create_month_events', 1) then
    perform public._award_points(h.id, public.setting_int('pts_event_create', 10), 'event_create',
      'Etkinlik açtın: ' || left(e.title, 40), e.id);
  end if;
end $$;

-- Etkinliği kaldır (iptal et): açan kişi ya da moderatör. Kayıt silinmez, listeden kalkar.
-- Moderatör başkasının etkinliğini kaldırırsa denetim kaydına yazılır.
-- Puanlar geri alınır: moderatör iptal ederse etkinlikten kazanılan HERKESİN puanı, açan kişi iptal ederse
-- (etkinlik başlamadıysa) herkesin, başladıktan sonra yalnızca kendi puanı.
create or replace function public.cancel_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_ev public.events;
begin
  v := public._require_user();
  select * into v_ev from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_ev.created_by is distinct from v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if v_ev.is_cancelled then return; end if;
  -- Kodla doğrulanmış katılımcısı olan etkinliği düzenleyen kendisi kapatamaz: moderatöre talep gönderir
  if v.role <> 'admin'
     and (select count(*) from public.event_registrations er
           where er.event_id = p_event_id and er.checked_in_at is not null)
         >= greatest(1, public.setting_int('event_close_request_min_checkins', 1)) then
    raise exception 'close_request_required';
  end if;
  update public.events set is_cancelled = true where id = p_event_id;
  perform public._reverse_event_points(p_event_id, v.role = 'admin' or v_ev.starts_at > now(), v_ev.created_by);
  if v.role = 'admin' and v_ev.created_by is distinct from v.id then
    perform public._audit('cancel_event', v_ev.created_by,
      jsonb_build_object('event_id', p_event_id, 'title', v_ev.title));
  end if;
end $$;

-- Etkinliği kapatma talebi (düzenleyen → moderatör). Kodla doğrulanmış en az event_close_request_min_checkins katılımcısı
-- olan etkinlik doğrudan kapatılamaz (cancel_event 'close_request_required' verir); düzenleyen nedenini yazıp talep gönderir.
-- Aynı etkinlik için aynı anda tek bekleyen talep olur.
create or replace function public.request_event_close(p_event_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_ev public.events;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  v := public._require_writer(null);
  select * into v_ev from public.events where id = p_event_id for update;
  if not found or v_ev.is_cancelled then raise exception 'event_not_found'; end if;
  if v_ev.created_by is distinct from v.id then raise exception 'forbidden'; end if;
  if (select count(*) from public.event_registrations er
       where er.event_id = p_event_id and er.checked_in_at is not null)
     < greatest(1, public.setting_int('event_close_request_min_checkins', 1)) then
    raise exception 'close_request_not_needed'; -- kimse doğrulanmadıysa etkinlik doğrudan kaldırılır
  end if;
  if char_length(v_reason) not between 10 and 500 then raise exception 'invalid_reason'; end if;
  if exists (select 1 from public.event_close_requests where event_id = p_event_id and status = 'pending') then
    raise exception 'close_request_exists';
  end if;
  insert into public.event_close_requests (event_id, requested_by, reason)
  values (p_event_id, v.id, v_reason)
  returning id into v_id;
  return v_id;
end $$;

-- Moderatör: kapatma talepleri (varsayılan bekleyenler; 'closed' = sonuçlananlar)
drop function if exists public.admin_list_close_requests(text);
create or replace function public.admin_list_close_requests(p_status text default 'pending')
returns table (
  id uuid, event_id uuid, event_title text, starts_at timestamptz, host_name text,
  reason text, verified_count int, status text, admin_note text, created_at timestamptz, resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select cr.id, cr.event_id, e.title, e.starts_at, hp.full_name, cr.reason,
         (select count(*)::int from public.event_registrations er
           where er.event_id = e.id and er.checked_in_at is not null),
         cr.status, cr.admin_note, cr.created_at, cr.resolved_at
    from public.event_close_requests cr
    join public.events e on e.id = cr.event_id
    left join public.profiles hp on hp.id = cr.requested_by
   where (p_status = 'pending' and cr.status = 'pending')
      or (p_status <> 'pending' and cr.status <> 'pending')
   order by cr.created_at desc
   limit 100;
end $$;

-- Moderatör: talebi onayla (etkinlik kapanır, etkinlikten kazanılan HERKESİN puanı geri alınır) ya da reddet
create or replace function public.admin_resolve_close_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req public.event_close_requests;
  v_ev public.events;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public._require_admin();
  if v_note is not null and char_length(v_note) > 300 then v_note := left(v_note, 300); end if;
  select * into v_req from public.event_close_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'request_closed'; end if;
  select * into v_ev from public.events where id = v_req.event_id for update;
  if coalesce(p_approve, false) then
    if found and not v_ev.is_cancelled then
      update public.events set is_cancelled = true where id = v_ev.id;
      perform public._reverse_event_points(v_ev.id, true, v_ev.created_by);
    end if;
    update public.event_close_requests
       set status = 'approved', admin_note = v_note, resolved_by = auth.uid(), resolved_at = now()
     where id = p_id;
    perform public._audit('close_event_request_approved', v_req.requested_by,
      jsonb_build_object('event_id', v_req.event_id, 'request_id', p_id));
    perform public._notify(v_req.requested_by, 'system', 'Etkinlik kapatma talebin onaylandı',
      coalesce(v_ev.title, 'Etkinlik') || ' kapatıldı; etkinlikten kazanılan puanlar geri alındı.'
        || coalesce(' Not: ' || v_note, ''), '{}'::jsonb);
  else
    update public.event_close_requests
       set status = 'rejected', admin_note = v_note, resolved_by = auth.uid(), resolved_at = now()
     where id = p_id;
    perform public._audit('close_event_request_rejected', v_req.requested_by,
      jsonb_build_object('event_id', v_req.event_id, 'request_id', p_id));
    perform public._notify(v_req.requested_by, 'system', 'Etkinlik kapatma talebin reddedildi',
      coalesce(v_ev.title, 'Etkinlik') || ' açık kalıyor.' || coalesce(' Not: ' || v_note, ''), '{}'::jsonb);
  end if;
end $$;

-- Bildirim noktaları için küçük özet (sekmelerdeki kırmızı noktaları besler). Hiçbir içerik döndürmez, yalnızca sayılar:
--   friend_requests: bana gelen, yanıt bekleyen arkadaşlık isteği
--   checkin_events: kaydolduğum ve şu an kod girişi açık olan (henüz doğrulamadığım) etkinlik
--   mod_reports / mod_close_requests: moderatör için bekleyen şikayet ve etkinlik kapatma talebi (üyeler için hep 0)
create or replace function public.my_notice_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'friend_requests',
      (select count(*)::int from public.friendships f
         join public.profiles o on o.id = f.requester_id
        where f.addressee_id = auth.uid() and f.status = 'pending' and o.banned_at is null),
    'checkin_events',
      (select count(*)::int from public.event_registrations er
         join public.events e on e.id = er.event_id
        where er.user_id = auth.uid() and er.checked_in_at is null and not e.is_cancelled
          and e.created_by is distinct from auth.uid()
          and now() >= e.starts_at - make_interval(mins => public.setting_int('event_checkin_open_minutes_before', 60))
          and now() <= public._event_checkin_end(e.starts_at, e.category)),
    'mod_reports',
      case when public.is_admin()
           then (select count(*)::int from public.reports where status = 'open') else 0 end,
    'mod_close_requests',
      case when public.is_admin()
           then (select count(*)::int from public.event_close_requests where status = 'pending') else 0 end,
    'notifications', public._unread_notification_count(),
    'mod_leader_apps',
      case when public.is_admin()
           then (select count(*)::int from public.event_leader_applications where status = 'pending') else 0 end,
    'mod_cell_candidates',
      case when public.is_admin()
           then (select count(*)::int from public.cell_name_candidates where not admin_seen) else 0 end,
    'mod_treasures',
      case when public.is_admin()
           then (select count(*)::int from public.treasures where not admin_seen) else 0 end,
    'mod_messages',
      case when public.is_admin()
           then (select count(*)::int from public.mod_threads where admin_unread) else 0 end,
    'mod_approvals',
      case when public.is_admin()
           then (select count(*)::int from public.events e
                  where not e.is_cancelled and public._event_end(e.starts_at, e.category) > now()
                    and (e.approval = 'pending' or e.image_status = 'pending'))
                + (select count(*)::int from public.profiles pr
                    where pr.photo_status = 'pending' and pr.photo_auto_at > now() and pr.banned_at is null) else 0 end
  )
  where public._is_active_user();
$$;

-- Yaklaşan etkinlikler: kayıt sayısı, benim kaydım ve düzenleyen adıyla.
-- Moderatörün açtığı etkinliklerde düzenleyen "41. Kat Sosyal" olarak görünür.
-- Dönüş sütunları değiştiği için eski sürüm önce kaldırılır (veriye dokunmaz)
drop function if exists public.list_events();

-- Etkinlik listesi: önce moderatörün ("41. Kat Özel") etkinlikleri, sonra üyelerin; her grup tarihe göre.
-- is_official sunucuda hesaplanır, adı "41. Kat Sosyal" olan bir üye resmî görünemez.
create or replace function public.list_events()
returns table (
  id uuid, title text, description text, location text, starts_at timestamptz,
  capacity int, fee_amount numeric, host_name text, is_mine boolean,
  registered_count int, is_registered boolean, fee_waived boolean, is_official boolean, category text, min_age int,
  like_count int, comment_count int, liked_by_me boolean,
  checked_in boolean, checkin_open boolean, checked_in_count int, cell_q int, cell_r int, host_title text,
  closes_at timestamptz, my_points int, my_points_note text, close_request text, close_needs_request boolean,
  close_request_note text, host_sponsor_id uuid,
  team_seekers int, my_seeking boolean, my_team_size int,
  approval text, image_path text, image_status text, tag text, with_games boolean
)
language sql stable security definer set search_path = public as $$
  with ct as materialized (select * from public._champion_titles())
  select e.id, e.title, e.description, e.location, e.starts_at, e.capacity, e.fee_amount,
         case when e.created_by is null or hp.role = 'admin' then '41. Kat Sosyal' else hp.full_name end,
         (e.created_by is not distinct from auth.uid()),
         (select count(*)::int from public.event_registrations r where r.event_id = e.id),
         (me.user_id is not null),
         coalesce(me.fee_waived,
                  public._event_fee_waived(e.created_by, e.fee_amount, mp.premium_until)),
         (e.created_by is null or (hp.role = 'admin' and e.as_official)),
         e.category,
         e.min_age,
         (select count(*)::int from public.event_likes l where l.event_id = e.id),
         (select count(*)::int from public.event_comments c
           where c.event_id = e.id and (not c.is_hidden or public.is_admin())),
         exists (select 1 from public.event_likes l where l.event_id = e.id and l.user_id = auth.uid()),
         (me.checked_in_at is not null),
         -- Katılım kodu girişi: başlamadan 60 dk önce açılır, etkinlik kapanınca (başlangıçtan 3 saat sonra) biter
         (me.user_id is not null and me.checked_in_at is null
            and e.created_by is distinct from auth.uid()
            and now() >= e.starts_at - make_interval(mins => public.setting_int('event_checkin_open_minutes_before', 60))
            and now() <= public._event_checkin_end(e.starts_at, e.category)),
         -- Doğrulanan katılımcı sayısını yalnızca etkinliği açan kişi görür
         case when e.created_by is not distinct from auth.uid()
              then (select count(*)::int from public.event_registrations r
                     where r.event_id = e.id and r.checked_in_at is not null) end,
         e.cell_q, e.cell_r,
         -- Düzenleyenin gerçek adı zaten görünür; oyun şampiyonu ünvanı varsa yanında gösterilir
         public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = e.created_by)),
         public._event_end(e.starts_at, e.category),
         -- Doğrulanmış katılımımdan kazandığım puan ve (puan yazılmadıysa) nedeni; puan 4 kişi dolunca açıldığı için
         -- o ana kadar my_points = 0 ve not 'released' görünür (istemci "bekliyor" der)
         case when me.checked_in_at is not null then me.attend_points end,
         case when me.checked_in_at is not null then me.attend_note end,
         -- Düzenleyen için: son kapatma talebinin durumu ('pending' = moderatör bekliyor, 'rejected' = reddedildi) ve
         -- kendisi kapatamayıp talep mi göndermeli?
         case when e.created_by is not distinct from auth.uid() then
           (select cr.status from public.event_close_requests cr
             where cr.event_id = e.id order by cr.created_at desc limit 1)
         end,
         (e.created_by is not distinct from auth.uid()
          and (select count(*) from public.event_registrations r
                where r.event_id = e.id and r.checked_in_at is not null)
              >= greatest(1, public.setting_int('event_close_request_min_checkins', 1))),
         case when e.created_by is not distinct from auth.uid() then
           (select cr.admin_note from public.event_close_requests cr
             where cr.event_id = e.id and cr.status = 'rejected' order by cr.created_at desc limit 1)
         end,
         -- Etkinliği açan bir sponsor (mekân) hesapsa kimliği: adına dokununca mekân profili açılır
         case when hp.role::text = 'sponsor' then hp.id end,
         -- Ekip arayan kişi sayısı (herkese görünür), benim ekip aramam ve ekibimin büyüklüğü
         (select count(*)::int from public.event_registrations r where r.event_id = e.id and r.seeking_team),
         coalesce(me.seeking_team, false),
         coalesce((select count(*)::int from public.event_team_members m
                    where m.team_id = (select m2.team_id from public.event_team_members m2
                                        where m2.event_id = e.id and m2.user_id = auth.uid())), 0),
         e.approval,
         -- Görsel: onaylıysa herkes, onay bekliyorsa yalnızca açan ve moderatör görür
         case when e.image_status = 'approved'
                or (e.image_status = 'pending' and (e.created_by is not distinct from auth.uid() or public.is_admin()))
              then e.image_path end,
         case when e.created_by is not distinct from auth.uid() or public.is_admin() then e.image_status end,
         e.tag,
         e.with_games
    from public.events e
    left join public.profiles hp on hp.id = e.created_by
    left join public.event_registrations me on me.event_id = e.id and me.user_id = auth.uid()
    left join public.profiles mp on mp.id = auth.uid()
   where public._is_active_user()
     and not e.is_cancelled
     and (e.approval = 'approved' or e.created_by is not distinct from auth.uid() or public.is_admin())
     and e.closed_at is null
     and public._event_end(e.starts_at, e.category) > now()
   order by (e.created_by is null or (hp.role = 'admin' and e.as_official)) desc, e.starts_at asc
   limit 100;
$$;

-- Oyun odası aç: moderatör sınırsız; üye ayda kota kadar (ücretsiz 3, premium 10).
-- Çekiliş sadece moderatör içindir. Başlamadan iptal edilen oda kotayı geri verir.
-- Cevapta kod da vardır (odayı açan kişi zaten oda sahibidir); kod başkasına gösterilmez.
do $$ begin
  create type public.created_room as (
    id uuid, code text, game_type text, event_id uuid, host_id uuid, status text, created_at timestamptz
  );
exception when duplicate_object then null; end $$;
-- Vampir–Köylü için oyun şekli (p_mode): 'auto' = Otomatik Oyun (yönetici gerekmez, oyun kendi akar, odayı açan
-- kişi de oynar); 'host' = Ben Yöneticiyim (odayı açan kişi oyunu ilerletir ve oynar); 'narrator' = yalnızca
-- moderatör: anlatıcı olur, oynamaz, herkesin rolünü görür. Boş bırakılırsa üyede 'host', moderatörde 'narrator'.
-- Yan yana oynanan oyunda odanın BÖLGESİ (haritadan seçilen petek: p_place_q/r) ve ADRES TARİFİ (p_place_note) zorunludur.
-- p_cell_q/r ise telefonun bulunduğu petektir (konum izni); seçilen bölgenin yakınında olmak gerekir.
drop function if exists public.create_room(text, uuid);
drop function if exists public.create_room(text, uuid, text);
drop function if exists public.create_room(text, uuid, text, int, int);
drop function if exists public.create_room(text, uuid, text, int, int, int, int, text);
drop function if exists public.create_room(text, uuid, text, int, int, int, int, text, boolean);
-- p_remote: uzaktan oda (yalnızca Vampir–Köylü, etkinlik dışı): konum, bölge ve adres tarifi istenmez; oyuncular
-- sesli sohbetle oynar. Oyun hakkı yan yana odayla aynı şekilde harcanır.
create or replace function public.create_room(p_game_type text, p_event_id uuid default null, p_mode text default null,
                                              p_cell_q int default null, p_cell_r int default null,
                                              p_place_q int default null, p_place_r int default null,
                                              p_place_note text default null, p_remote boolean default false,
                                              p_lat double precision default null, p_lng double precision default null,
                                              p_acc real default null)
returns public.created_room language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room public.game_rooms;
  v_code text;
  v_try int := 0;
  v_limit int;
  v_mode text;
  v_needs_place boolean;
  v_note text := btrim(coalesce(p_place_note, ''));
  v_dist int := public.setting_int('game_join_max_cell_distance', 1);
  v_credit uuid;
  v_ev public.events;
  v_need int := greatest(1, public.setting_int('pts_event_min_attendees', 4));
  a record;
begin
  v := public._require_writer(null);
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  p_remote := coalesce(p_remote, false);
  if p_remote and (p_game_type not in ('vampire_villager', 'shark_cage') or p_event_id is not null) then
    raise exception 'remote_not_allowed';
  end if;
  -- Özel uzaktan oda yok: uzaktan oyun yalnızca eşleştirmeyle açılır (moderatör deneme için açabilir)
  if p_remote and v.role <> 'admin' then raise exception 'remote_match_only'; end if;
  perform public._sweep_live_rooms();
  -- Paket 27: etkinlik oyunu / etkinlik çekilişi. Yalnızca etkinliği açan kişi (ya da moderatör) açar; en az
  -- pts_event_min_attendees (4) doğrulanmış katılımcı gerekir. Oyun: etkinlik "oyunlu" olmalı, başlamış olmalı, en az 4
  -- kişilik bir yan yana oyun olmalı (Bilgi Yarışması olmaz) ve etkinlikte aynı anda tek açık oyun odası olur.
  -- Çekiliş: etkinlik başına bir kez. Etkinlik odası aylık oda hakkından yemez; oda yeri etkinliğin peteğidir.
  if p_event_id is not null then
    select * into v_ev from public.events where id = p_event_id for update;
    if not found or v_ev.is_cancelled then raise exception 'event_not_found'; end if;
    if v.role <> 'admin' and v_ev.created_by is distinct from v.id then raise exception 'forbidden'; end if;
    if v_ev.closed_at is not null or now() > public._event_end(v_ev.starts_at, v_ev.category) then
      raise exception 'event_over';
    end if;
    if (select count(*) from public.event_registrations er
         where er.event_id = p_event_id and er.checked_in_at is not null) < v_need then
      raise exception 'event_needs_verified';
    end if;
    if p_game_type = 'raffle' then
      -- Paket 28: etkinlik başına en çok 5 çekiliş; aynı anda tek açık çekiliş odası
      if exists (select 1 from public.game_rooms gr
                  where gr.event_id = p_event_id and gr.game_type = 'raffle' and gr.status in ('lobby', 'playing')) then
        raise exception 'event_raffle_open';
      end if;
      if (select count(*) from public.game_rooms gr
           where gr.event_id = p_event_id and gr.game_type = 'raffle' and gr.status <> 'cancelled')
         >= greatest(1, public.setting_int('event_raffle_max', 5)) then
        raise exception 'event_raffle_exists';
      end if;
    else
      if not v_ev.with_games then raise exception 'event_no_games'; end if;
      if now() < v_ev.starts_at then raise exception 'event_not_started'; end if;
      if not exists (select 1 from public.game_types gt
                      where gt.key = p_game_type and gt.min_players >= 4 and not gt.remote and gt.presence_required) then
        raise exception 'event_game_not_allowed';
      end if;
      if exists (select 1 from public.game_rooms gr
                  where gr.event_id = p_event_id and gr.game_type <> 'raffle' and gr.status in ('lobby', 'playing')) then
        raise exception 'event_game_exists';
      end if;
      -- Oda yeri: etkinliğin peteği (yoksa düzenleyenin seçtiği yer) ve etkinlik adı
      if v_ev.cell_q is not null then
        p_place_q := v_ev.cell_q;
        p_place_r := v_ev.cell_r;
      end if;
      v_note := left('Etkinlik: ' || v_ev.title, 120);
    end if;
  end if;
  if v.role <> 'admin'
     and exists (select 1 from public.game_types where key = p_game_type and presence_required)
     and public._user_live_room(v.id) is not null then
    raise exception 'already_in_game';
  end if;
  v_limit := public._game_quota(v);
  if not exists (select 1 from public.game_types where key = p_game_type and enabled) then
    raise exception 'game_not_available';
  end if;
  -- Bilgi Yarışması oda ile oynanmaz (quiz_find_match / quiz_start_solo); eski oda yolu kapalı
  if p_game_type = 'quiz' then raise exception 'game_not_available'; end if;
  if p_game_type = 'vampire_villager' then
    v_mode := coalesce(p_mode, case when v.role = 'admin' then 'narrator' else 'host' end);
    if v_mode not in ('auto', 'host', 'narrator') then raise exception 'invalid_mode'; end if;
    if v_mode = 'narrator' and v.role <> 'admin' then raise exception 'forbidden'; end if;
  end if;
  -- Köpekbalığı Kafesi: otomatik ya da "Ben Yöneticiyim". Anlatıcı yalnızca etkinlik oyununda ve yalnızca etkinlik sahibi
  if p_game_type = 'shark_cage' then
    v_mode := coalesce(p_mode, 'auto');
    if v_mode not in ('auto', 'host', 'narrator') then raise exception 'invalid_mode'; end if;
    if v_mode = 'narrator' and (p_event_id is null or v_ev.created_by is distinct from v.id) then
      raise exception 'narrator_event_only';
    end if;
  end if;

  if v.role <> 'admin' then
    if p_game_type = 'raffle' and p_event_id is null then raise exception 'forbidden'; end if;
    perform 1 from public.profiles where id = v.id for update;
    -- Uzaktan oyunda (Bilgi Yarışması) oda sahibi aynı anda tek açık oda tutar
    if exists (select 1 from public.game_types where key = p_game_type and remote)
       and exists (select 1 from public.game_rooms
                    where host_id = v.id and game_type = p_game_type and status in ('lobby', 'playing')) then
      raise exception 'already_hosting';
    end if;
    -- Oyun hakkı: çekiliş ve uzaktan oyun (Bilgi Yarışması) hakkı harcamaz.
    -- Önce varsa sponsor koduyla kazanılan EK hak harcanır (süresi dolabilir); yoksa aylık hak. Sponsor hakkıyla açılan
    -- oda aylık sayıma girmez. Puan sınırları (günlük/aylık oyun puanı) oda sayısına bakmaz, bu yüzden değişmez.
    -- Uzaktan oda oyun hakkından düşmez: yan yana oyun iki kat puan verdiği için değerlidir (abonelik hakkı artırır)
    if p_event_id is null and not p_remote and exists (select 1 from public.game_types where key = p_game_type and uses_quota) then
      v_credit := public._free_sponsor_credit(v.id);
      if v_credit is null
         and (select count(*) from public.game_rooms gr
               where gr.host_id = v.id and (status <> 'cancelled' or started_at is not null)
                 and gr.created_at >= public._month_start() and gr.event_id is null
                 and exists (select 1 from public.game_types gt where gt.key = gr.game_type and gt.uses_quota)
                 and not gr.remote
                 and not exists (select 1 from public.sponsor_credits sc where sc.room_id = gr.id))
             >= v_limit then
        raise exception 'quota_exceeded';
      end if;
    end if;
  end if;

  -- Yan yana oynanan oyunu açarken de (oyuncu olarak girecekse) petek bildirilmek zorunda; konum verilmeden oda açılmaz.
  -- Yalnızca anlatıcı olan moderatör oyuncu sayılmaz, konum istenmez.
  if public._game_needs_location(p_game_type) and not p_remote
     and coalesce(v_mode, '') <> 'narrator'
     and (not public._game_cell_given(p_cell_q, p_cell_r) or not public._latlng_ok(p_lat, p_lng)) then
    raise exception 'location_required';
  end if;

  -- Bölge ve adres tarifi: Kocaeli karasındaki bir petek + en az 3 karakterlik tarif. Oda sahibi o bölgeye yakın olmalı.
  v_needs_place := public.setting_bool('game_place_required') and not p_remote
                   and exists (select 1 from public.game_types where key = p_game_type and presence_required);
  if v_needs_place then
    if p_place_q is null or p_place_r is null or not public._map_cell_ok(p_place_q, p_place_r) then
      raise exception 'invalid_cell';
    end if;
    if char_length(v_note) not between 3 and 120 then raise exception 'invalid_place_note'; end if;
    if v_dist >= 0 and public._game_cell_given(p_cell_q, p_cell_r)
       and public._hex_dist(p_cell_q, p_cell_r, p_place_q, p_place_r) > v_dist then
      raise exception 'room_too_far';
    end if;
  end if;

  insert into public.game_rooms (game_type, event_id, host_id, config, place_q, place_r, place_note, remote)
  values (p_game_type, p_event_id, v.id,
          case when v_mode is null then '{}'::jsonb else jsonb_build_object('mode', v_mode) end,
          case when v_needs_place then p_place_q end, case when v_needs_place then p_place_r end,
          case when v_needs_place then v_note end, p_remote)
  returning * into v_room;
  if v_credit is not null then
    update public.sponsor_credits set room_id = v_room.id where id = v_credit;
  end if;
  -- Unutulmuş eski kayıtlar (12 saatten eski) her ihtimale karşı silinir
  delete from public.room_host_locations where created_at < now() - interval '12 hours';
  -- Yan yana oda: oda sahibinin kesin konumu, oda katılıma açıkken (yakınlık kontrolü için) geçici olarak tutulur
  if not p_remote and public._latlng_ok(p_lat, p_lng)
     and exists (select 1 from public.game_types where key = p_game_type and presence_required) then
    insert into public.room_host_locations (room_id, lat, lng, acc)
    values (v_room.id, p_lat, p_lng, case when p_acc between 0 and 5000 then p_acc end)
    on conflict (room_id) do update set lat = excluded.lat, lng = excluded.lng, acc = excluded.acc;
  end if;
  -- Kod rastgele üretilir; aynı kod başka odada varsa (çok nadir) yenisi denenir
  loop
    v_code := public._random_code(5);
    begin
      insert into public.room_codes (room_id, code) values (v_room.id, v_code);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'code_generation_failed'; end if;
    end;
  end loop;
  -- Paket 28: moderatör çekiliş odası açınca herkese duyuru (uygulama açıkken telefon bildirimi de çıkar).
  -- Kod duyuruda yoktur; kodu moderatör çekiliş yerinde söyler. Art arda oda açılırsa duyuru 30 dakikada en çok 1 kez.
  if p_game_type = 'raffle' and p_event_id is null and v.role = 'admin'
     and not exists (select 1 from public.announcements an
                      where an.kind = 'raffle' and an.created_at > now() - interval '30 minutes') then
    insert into public.announcements (title, body, created_by, kind)
    values ('41. Kat çekilişi başladı!',
            'Moderatör bir çekiliş odası açtı. Katılmak için oda kodunu çekiliş yerinde moderatörden al ve Oyunlar > Kodla katıl’a yaz.',
            v.id, 'raffle');
  end if;
  -- Paket 27: etkinlik odasının kodu yalnızca doğrulanmış katılımcılara bildirimle gider
  if p_event_id is not null then
    for a in
      select er.user_id from public.event_registrations er
        join public.profiles pr on pr.id = er.user_id and pr.banned_at is null
       where er.event_id = p_event_id and er.checked_in_at is not null and er.user_id <> v.id
    loop
      perform public._notify(a.user_id, 'system',
        case when p_game_type = 'raffle' then 'Etkinlik çekilişi açıldı' else 'Etkinlik oyunu açıldı' end,
        '“' || v_ev.title || '” etkinliğinde ' ||
          coalesce((select gt.title from public.game_types gt where gt.key = p_game_type), p_game_type) ||
          ' odası açıldı. Oda kodu: ' || v_code || ' · Kodu kopyalayıp Oyunlar > Kodla katıl’a yaz.',
        jsonb_build_object('code', v_code, 'room_id', v_room.id, 'event_id', p_event_id, 'game', p_game_type,
                           'route', '/acik-odalar'));
    end loop;
  end if;
  return row(v_room.id, v_code, v_room.game_type, v_room.event_id, v_room.host_id, v_room.status, v_room.created_at)::public.created_room;
end $$;

-- Oda kodunu yalnızca oda sahibine verir (başkasına boş döner).
create or replace function public.get_room_code(p_room_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select c.code
    from public.room_codes c
    join public.game_rooms r on r.id = c.room_id
   where c.room_id = p_room_id and r.host_id = auth.uid() and public._is_active_user();
$$;

-- Benim açtığım, henüz bitmemiş odalar (kodlarıyla). Çekiliş listesi bunu kullanır.
create or replace function public.my_hosted_rooms(p_game_type text default null)
returns table (id uuid, code text, game_type text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, c.code, r.game_type, r.status, r.created_at
    from public.game_rooms r
    join public.room_codes c on c.room_id = r.id
   where public._is_active_user()
     and r.host_id = auth.uid()
     and r.status in ('lobby', 'playing')
     and (p_game_type is null or r.game_type = p_game_type)
   order by r.created_at desc
   limit 10;
$$;

-- Oda durumunu değiştir: odayı açan kişi (sadece ileri yönde) ya da moderatör (serbest)
create or replace function public.set_room_status(p_room_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room public.game_rooms;
begin
  v := public._require_user();
  if p_status not in ('lobby', 'playing', 'finished', 'cancelled') then raise exception 'invalid_status'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  -- Eski (oda ile açılmış) Bilgi Yarışması odası “bitti” yapılarak puan alınamaz; yalnızca iptal edilebilir
  if v_room.game_type = 'quiz' and p_status <> 'cancelled' then raise exception 'invalid_transition'; end if;
  if v.role <> 'admin' then
    if v_room.host_id <> v.id then raise exception 'forbidden'; end if;
    if not ((v_room.status = 'lobby' and p_status in ('playing', 'cancelled'))
            or (v_room.status = 'playing' and p_status = 'finished')) then
      raise exception 'invalid_transition';
    end if;
  end if;
  update public.game_rooms
     set status = p_status,
         started_at = case when p_status = 'playing' then coalesce(started_at, now()) else started_at end,
         finished_at = case when p_status in ('finished', 'cancelled') then now() else finished_at end
   where id = p_room_id;
end $$;

-- ---------------------------------------------------------------------
-- 5b) Akış okuma, kendi içeriğini silme, bu ayın sıralaması
-- ---------------------------------------------------------------------

-- Akış listesi: en yeni önce. "liked" = ben beğendim mi, "is_mine" = benim gönderim mi.
-- Gizlenmiş ve engellediğim kişinin gönderileri gelmez (moderatör hepsini görür).
-- Sonraki sayfa için son gönderinin created_at değeri p_before olarak verilir.
-- Süzgeçler: p_mine = true yalnızca BENİM gönderilerim; p_district verilirse yalnızca o ilçeden yer etiketli gönderiler.
drop function if exists public.list_feed(timestamptz, int);
drop function if exists public.list_feed(timestamptz, int, boolean, text);
drop function if exists public.list_feed(timestamptz, int, boolean, text, boolean);
drop function if exists public.list_feed(timestamptz, int, boolean, text, boolean, int, int, int, int, boolean);
drop function if exists public.list_feed(timestamptz, int, boolean, text, boolean, int, int, int, int, boolean, uuid);
-- Süzgeçler: p_mine = yalnızca BENİM gönderilerim; p_district = o ilçeden yer etiketli gönderiler;
-- p_mentions = yalnızca BENDEN BAHSEDİLEN gönderiler. İptal edilen etkinliğin paylaşımı listede görünmez.
-- Petek akışı: p_cell_q/r verilirse yalnızca o peteğin gönderileri; p_near = true ise bulunduğum peteğe en çok
-- cell_feed_max_distance (1) uzaklıktaki peteklerin gönderileri. İkisinde de p_my_q/r (telefonun bir kez aldığı konumun
-- peteği) zorunludur ve uzaksa hiçbir şey dönmez. Petek gönderileri genel akışta görünmez (moderatör hariç).
create or replace function public.list_feed(p_before timestamptz default null, p_limit int default 20,
                                            p_mine boolean default false, p_district text default null,
                                            p_mentions boolean default false,
                                            p_cell_q int default null, p_cell_r int default null,
                                            p_my_q int default null, p_my_r int default null,
                                            p_near boolean default false, p_post uuid default null)
returns table (
  id uuid, alias text, avatar_index int, body text, like_count int, comment_count int,
  is_hidden boolean, created_at timestamptz, liked boolean, is_mine boolean, author_name text,
  place_id text, place_name text, place_label text, place_district text, author_skin text, sponsor_id uuid,
  author_image text, mentions_me boolean, is_reply boolean,
  laugh_count int, plus_count int, minus_count int, my_reaction text,
  event_id uuid, event_title text, event_starts_at timestamptz, event_location text, event_category text,
  event_official boolean, event_image text, cell_q int, cell_r int, place_q int, place_r int,
  thread jsonb, author_premium boolean, author_verified boolean, author_photo text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.alias, p.avatar_index, p.body, p.like_count, p.comment_count, p.is_hidden, p.created_at,
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.post_authors a where a.post_id = p.id and a.author_id = auth.uid()),
         -- Yazar benim arkadaşımsa gerçek adı da gelir (başkaları yine yalnızca rumuzu görür)
         (select pr.full_name from public.post_authors a join public.profiles pr on pr.id = a.author_id
           where a.post_id = p.id and public._is_friend(a.author_id) and not p.by_event),
         p.place_id, p.place_name, p.place_label, p.place_district,
         -- Yazarın seçtiği konuşma balonu (yalnızca görünüm; kim olduğu anlaşılmaz)
         (select pr.bubble_skin from public.post_authors a join public.profiles pr on pr.id = a.author_id
           where a.post_id = p.id),
         -- Sponsor (mekân) hesap yazdıysa kimliği: adına dokununca mekân profili açılır
         (select a.author_id from public.post_authors a where a.post_id = p.id and p.by_sponsor),
         -- Mekân hesabının profil resmi (varsa avatarın yerine görünür)
         (select vn.image_path from public.post_authors a join public.venues vn on vn.user_id = a.author_id
           where a.post_id = p.id and p.by_sponsor),
         exists (select 1 from public.post_mentions mm where mm.post_id = p.id and mm.user_id = auth.uid()),
         (p.reply_to is not null),
         p.laugh_count, p.plus_count, p.minus_count,
         (select r.kind from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()),
         e.id, e.title, e.starts_at, e.location, e.category,
         (e.id is not null and (e.created_by is null
                                or (e.as_official and exists (select 1 from public.profiles h
                                                              where h.id = e.created_by and h.role = 'admin')))),
         case when e.image_status = 'approved' then e.image_path end,
         p.cell_q, p.cell_r,
         (select pl.q from public.places pl where pl.id = p.place_id),
         (select pl.r from public.places pl where pl.id = p.place_id),
         -- Zincir: devam parçaları sırayla (gizlenen parça yalnızca moderatöre)
         (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'body', t.body, 'at', t.created_at,
                                                       'hidden', t.is_hidden) order by t.thread_no), '[]'::jsonb)
            from public.posts t where t.thread_root = p.id and (public.is_admin() or not t.is_hidden)),
         -- Yazar şu an abone mi (akışta saatin yanında küçük abone rozeti; kim olduğu anlaşılmaz)
         coalesce((select pr.premium_until is not null and pr.premium_until > now()
                     from public.post_authors a join public.profiles pr on pr.id = a.author_id
                    where a.post_id = p.id and pr.role = 'user' and not p.by_event and not p.by_sponsor), false),
         -- Yazarın hesabı NVİ ile doğrulanmış mı (akışta sarı tik; kim olduğu anlaşılmaz)
         coalesce((select pr.identity_verified_at is not null
                     from public.post_authors a join public.profiles pr on pr.id = a.author_id
                    where a.post_id = p.id and pr.role = 'user' and not p.by_event and not p.by_sponsor), false),
         -- Profil resmi yalnızca gerçek adı görünen (arkadaş) yazarda
         (select public._photo_of(a.author_id) from public.post_authors a
           where a.post_id = p.id and public._is_friend(a.author_id) and not p.by_event and not p.by_sponsor)
    from public.posts p
    left join public.events e on e.id = p.event_id
   where public._is_active_user()
     and p.thread_root is null
     -- Haftalık akış: bu haftanın gönderileri (yaklaşan etkinlik paylaşımları etkinlik geçene kadar kalır)
     and public._post_live(p.created_at, p.event_id)
     and case
           -- Tek gönderi (rumuz profilinden açılan): petek gönderisi de olsa gelir (içeriği profilde zaten görünür)
           when p_post is not null then p.id = p_post
           when p_cell_q is not null or coalesce(p_near, false) then
             p.cell_q is not null and p_my_q is not null and p_my_r is not null
             and (p_cell_q is null or (p.cell_q = p_cell_q and p.cell_r = p_cell_r))
             and public._hex_dist(p.cell_q, p.cell_r, p_my_q, p_my_r)
                 <= greatest(0, public.setting_int('cell_feed_max_distance', 1))
           else p.cell_q is null or public.is_admin()
               or (coalesce(p_mine, false)
                   and exists (select 1 from public.post_authors a where a.post_id = p.id and a.author_id = auth.uid()))
         end
     and (p_before is null or p.created_at < p_before)
     and (public.is_admin() or (not p.is_hidden and not public.post_blocked_by_me(p.id)))
     and (p.event_id is null or (e.id is not null and not e.is_cancelled) or public.is_admin())
     and (not coalesce(p_mine, false)
          or exists (select 1 from public.post_authors a where a.post_id = p.id and a.author_id = auth.uid()))
     and (p_district is null or p.place_district = p_district)
     and (not coalesce(p_mentions, false)
          or exists (select 1 from public.post_mentions mm where mm.post_id = p.id and mm.user_id = auth.uid()))
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Tepki ver / geri al: 'laugh' (güldüm), 'plus' (+), 'minus' (−). Aynı tepkiye tekrar basmak geri alır; başka bir
-- tepkiye basmak değiştirir. Döner: yeni tepki ya da boş.
create or replace function public.react_to_post(p_post_id uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_old text;
begin
  v := public._require_user();
  if p_kind not in ('laugh', 'plus', 'minus') then raise exception 'invalid_kind'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and not is_hidden and thread_root is null
                  and public._post_live(created_at, event_id)) then
    raise exception 'post_not_found';
  end if;
  select kind into v_old from public.post_reactions where post_id = p_post_id and user_id = v.id for update;
  if v_old = p_kind then
    delete from public.post_reactions where post_id = p_post_id and user_id = v.id;
    return null;
  end if;
  insert into public.post_reactions (post_id, user_id, kind) values (p_post_id, v.id, p_kind)
  on conflict (post_id, user_id) do update set kind = excluded.kind, created_at = now();
  return p_kind;
end $$;

-- Tepki sayaçları (gönderi satırında tutulur)
create or replace function public.bump_reaction_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.posts
       set laugh_count = greatest(0, laugh_count - (case when old.kind = 'laugh' then 1 else 0 end)),
           plus_count = greatest(0, plus_count - (case when old.kind = 'plus' then 1 else 0 end)),
           minus_count = greatest(0, minus_count - (case when old.kind = 'minus' then 1 else 0 end))
     where id = old.post_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.posts
       set laugh_count = laugh_count + (case when new.kind = 'laugh' then 1 else 0 end),
           plus_count = plus_count + (case when new.kind = 'plus' then 1 else 0 end),
           minus_count = minus_count + (case when new.kind = 'minus' then 1 else 0 end)
     where id = new.post_id;
  end if;
  return null;
end $$;
drop trigger if exists on_post_reaction_change on public.post_reactions;
create trigger on_post_reaction_change
  after insert or update or delete on public.post_reactions
  for each row execute function public.bump_reaction_count();

-- Etkinliği akışta paylaş: yalnızca etkinliği açan kişi (41. Kat Sosyal etkinliğinde moderatör), etkinlik başlamadan
-- önceki son event_share_minutes_before (60) dakikada ve etkinlik başına bir kez. Paylaşım GERÇEK ADLA görünür
-- (etkinlikte zaten düzenleyen olarak görünen ad); rumuz kullanılmaz ki rumuz ile gerçek ad eşleşmesin.
-- Premium gerekmez; susturulmuş üye paylaşamaz.
create or replace function public.share_event_to_feed(p_event_id uuid, p_body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
  v_body text := btrim(coalesce(p_body, ''));
  v_min int := greatest(5, least(public.setting_int('event_share_minutes_before', 60), 1440));
  v_id uuid;
begin
  v := public._require_writer(null);
  select * into e from public.events where id = p_event_id and not is_cancelled for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public._is_event_host(e.id, v.id) then raise exception 'forbidden'; end if;
  if e.approval <> 'approved' then raise exception 'event_pending'; end if;
  if now() >= e.starts_at then raise exception 'event_started'; end if;
  if now() < e.starts_at - make_interval(mins => v_min) then raise exception 'share_too_early'; end if;
  -- 5 dakikada bir paylaşılabilir; yeniden paylaşılınca eski paylaşım silinir
  if exists (select 1 from public.posts where event_id = e.id and created_at > now() - interval '5 minutes') then
    raise exception 'share_cooldown';
  end if;
  delete from public.posts where event_id = e.id;
  if v_body = '' then v_body := 'Etkinliğim birazdan başlıyor, gelmek isteyen Etkinlikler sekmesinden katılabilir.'; end if;
  if char_length(v_body) > 300 then raise exception 'invalid_body'; end if;
  insert into public.posts (alias, avatar_index, body, by_sponsor, by_event, event_id)
  values (case when v.role = 'admin' then '41. Kat Sosyal' else v.full_name end, 1, v_body,
          v.role::text = 'sponsor', true, e.id)
  returning id into v_id;
  insert into public.post_authors (post_id, author_id) values (v_id, v.id);
  return v_id;
end $$;

-- Akış süzgecindeki ilçe listesi: yer etiketli gönderisi olan ilçeler ve gönderi sayıları (görebildiğim gönderiler)
create or replace function public.feed_districts()
returns table (district text, post_count int)
language sql stable security definer set search_path = public as $$
  select p.place_district, count(*)::int
    from public.posts p
   where public._is_active_user()
     and p.place_district is not null and btrim(p.place_district) <> ''
     and p.cell_q is null and p.thread_root is null and public._post_live(p.created_at, p.event_id)
     and (public.is_admin() or (not p.is_hidden and not public.post_blocked_by_me(p.id)))
   group by p.place_district
   order by 2 desc, 1
   limit 40;
$$;

-- Bir gönderinin yorumları: eskiden yeniye
drop function if exists public.list_comments(uuid);
create or replace function public.list_comments(p_post_id uuid)
returns table (
  id uuid, post_id uuid, alias text, avatar_index int, body text,
  is_hidden boolean, created_at timestamptz, is_mine boolean, author_name text, author_skin text, sponsor_id uuid,
  author_image text, author_photo text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.post_id, c.alias, c.avatar_index, c.body, c.is_hidden, c.created_at,
         exists (select 1 from public.comment_authors a where a.comment_id = c.id and a.author_id = auth.uid()),
         (select pr.full_name from public.comment_authors a join public.profiles pr on pr.id = a.author_id
           where a.comment_id = c.id and public._is_friend(a.author_id)),
         (select pr.bubble_skin from public.comment_authors a join public.profiles pr on pr.id = a.author_id
           where a.comment_id = c.id),
         (select a.author_id from public.comment_authors a where a.comment_id = c.id and c.by_sponsor),
         (select vn.image_path from public.comment_authors a join public.venues vn on vn.user_id = a.author_id
           where a.comment_id = c.id and c.by_sponsor),
         -- Profil resmi yalnızca gerçek adı görünen (arkadaş) yazarda
         (select public._photo_of(a.author_id) from public.comment_authors a
           where a.comment_id = c.id and public._is_friend(a.author_id) and not c.by_sponsor)
    from public.comments c
   where public._is_active_user()
     and c.post_id = p_post_id
     and (public.is_admin() or (not c.is_hidden and not public.comment_blocked_by_me(c.id)))
     and (public.is_admin() or exists (select 1 from public.posts p where p.id = p_post_id and not p.is_hidden
                                          and public._post_live(p.created_at, p.event_id)))
   order by c.created_at asc
   limit 300;
$$;

-- Arşiv temizliği: feed_archive_days (365) günden eski gönderiler (yorumları, beğenileri, parçalarıyla) silinir.
-- Aynı anda tek temizlik çalışır; bir seferde en çok 500 gönderi.
create or replace function public._feed_purge()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('feed_purge')) then return; end if;
  delete from public.posts
   where id in (select p.id from public.posts p
                 where p.created_at < now() - make_interval(days => greatest(30, public.setting_int('feed_archive_days', 365)))
                   and (p.event_id is null or not exists (select 1 from public.events e
                                                          where e.id = p.event_id and not e.is_cancelled
                                                            and e.starts_at > now()))
                 order by p.created_at limit 500);
end $$;

-- Rumuz profili (Paket 23): bir gönderi ya da yorumun yazarının BU HAFTAKİ rumuz profili. Gerçek ad hiç gelmez.
-- Gösterilen: bu haftanın gönderileri (genel akış + petek akışı; petek gönderisinde hangi petek olduğu GİZLİ),
-- bu hafta kodla katıldığı etkinlik sayısı ve oynadığı oyun sayısı. Her Pazartesi rumuzla birlikte sıfırlanır.
-- Mekân hesabı, moderatör ve etkinlik paylaşımı için profil yoktur. Engellediğin/seni engelleyen kişinin profili açılmaz.
-- Paket 30: gönderideki @rumuz etiketine dokununca da açılır (p_alias: BU HAFTAKİ rumuz).
drop function if exists public.alias_profile(uuid, uuid);
create or replace function public.alias_profile(p_post uuid default null, p_comment uuid default null,
                                                p_alias text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_author uuid;
  pr public.profiles;
  v_week timestamptz := public._feed_week_start();
  v_admin boolean := public.is_admin();
  v_posts jsonb;
begin
  if not public._is_active_user() then raise exception 'forbidden'; end if;
  if p_post is not null then
    select a.author_id into v_author
      from public.posts p join public.post_authors a on a.post_id = p.id
     where p.id = p_post and not p.by_event and not p.by_sponsor
       and (v_admin or (not p.is_hidden and public._post_live(p.created_at, p.event_id)));
  elsif p_comment is not null then
    select a.author_id into v_author
      from public.comments c join public.comment_authors a on a.comment_id = c.id
      join public.posts p on p.id = c.post_id
     where c.id = p_comment and not c.by_sponsor
       and (v_admin or (not c.is_hidden and public._post_live(p.created_at, p.event_id)));
  elsif p_alias is not null and char_length(btrim(p_alias)) between 2 and 60 then
    -- Rumuz yalnızca bu haftaki sahibine götürür (geçen haftanın rumuzu başkasına ait olabilir)
    v_author := public._alias_lookup(p_alias);
  end if;
  if v_author is null then raise exception 'profile_not_found'; end if;
  select * into pr from public.profiles where id = v_author;
  if not found or pr.role <> 'user' or pr.banned_at is not null then raise exception 'profile_not_found'; end if;
  if not v_admin and exists (select 1 from public.user_blocks b
                              where (b.blocker_id = auth.uid() and b.blocked_id = v_author)
                                 or (b.blocker_id = v_author and b.blocked_id = auth.uid())) then
    raise exception 'profile_not_found';
  end if;

  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into v_posts from (
    select p.created_at, jsonb_build_object(
             'id', p.id, 'body', p.body, 'created_at', p.created_at,
             'like_count', p.like_count, 'comment_count', p.comment_count,
             'laugh_count', p.laugh_count, 'plus_count', p.plus_count, 'minus_count', p.minus_count,
             -- Petek gönderisi: yalnızca "petekte yazıldı" bilgisi; hangi petek olduğu gösterilmez
             'in_cell', (p.cell_q is not null),
             'place_name', case when p.cell_q is null then p.place_name end,
             'is_reply', (p.reply_to is not null),
             'thread', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'body', t.body, 'at', t.created_at)
                                                  order by t.thread_no), '[]'::jsonb)
                          from public.posts t where t.thread_root = p.id and (v_admin or not t.is_hidden))) as j
      from public.posts p join public.post_authors a on a.post_id = p.id
     where a.author_id = v_author and p.thread_root is null and not p.by_event and not p.by_sponsor
       and p.created_at >= v_week
       and (v_admin or not p.is_hidden)
     order by p.created_at desc
     limit 50) x;

  return jsonb_build_object(
    'alias', pr.alias,
    'avatar_index', pr.avatar_index,
    'is_me', (pr.id = auth.uid()),
    'week_start', v_week,
    'posts', v_posts,
    'post_count', (select count(*)::int from public.posts p join public.post_authors a on a.post_id = p.id
                    where a.author_id = v_author and p.thread_root is null and not p.by_event and not p.by_sponsor
                      and p.created_at >= v_week and (v_admin or not p.is_hidden)),
    -- Bu hafta akışta kendisinden kaç kez bahsedildi (etiketlendi)
    'mentions', (select count(*)::int from public.post_mentions mm join public.posts p on p.id = mm.post_id
                  where mm.user_id = v_author and p.created_at >= v_week and not p.is_hidden),
    'events', (select count(*)::int from public.event_registrations er join public.events e on e.id = er.event_id
                where er.user_id = v_author and er.checked_in_at >= v_week and not e.is_cancelled),
    'games', (select count(*)::int from public.room_players rp join public.game_rooms r on r.id = rp.room_id
               where rp.user_id = v_author and rp.left_at is null and r.status = 'finished' and r.game_type <> 'raffle'
                 and coalesce(r.started_at, r.created_at) >= v_week)
           + (select count(*)::int from public.quiz_match_players mp join public.quiz_matches m on m.id = mp.match_id
               where mp.user_id = v_author and m.status = 'finished' and m.created_at >= v_week)
           + (select count(*)::int from public.quiz_solo_runs s
               where s.user_id = v_author and s.status <> 'playing' and s.created_at >= v_week)
           + (select count(*)::int from public.quiz_side_games g
               where g.user_id = v_author and g.status = 'finished' and g.created_at >= v_week)
  );
end $$;

-- Kendi gönderini sil (yorumları ve beğenileri de gider)
create or replace function public.delete_my_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.posts
   where id = p_post_id
     and id in (select post_id from public.post_authors where author_id = v.id);
  if not found then raise exception 'post_not_found'; end if;
end $$;

-- Kendi yorumunu sil
create or replace function public.delete_my_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.comments
   where id = p_comment_id
     and id in (select comment_id from public.comment_authors where author_id = v.id);
  if not found then raise exception 'comment_not_found'; end if;
end $$;

-- Yorum yazarını engelle (gönderi yazarını engellemenin yorum karşılığı)
create or replace function public.block_author_of_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_author uuid;
  v_alias text;
begin
  v := public._require_user();
  select ca.author_id, c.alias into v_author, v_alias
    from public.comment_authors ca join public.comments c on c.id = ca.comment_id
   where ca.comment_id = p_comment_id;
  if not found then raise exception 'comment_not_found'; end if;
  if v_author = v.id then raise exception 'cannot_block_self'; end if;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, v_author, v_alias)
  on conflict (blocker_id, blocked_id) do nothing;
  -- Engellediğim kişiyle arkadaşlık (ya da bekleyen istek) varsa biter
  delete from public.friendships
   where (requester_id = v.id and addressee_id = v_author) or (requester_id = v_author and addressee_id = v.id);
end $$;

-- Katılıma açık odalar (bekleme salonundaki, son 12 saatte açılmış). Oda kodu burada ASLA yoktur:
-- kod yalnızca oda sahibine gösterilir, katılmak için yan yana oturduğun kişiden öğrenip yazarsın.
-- Önce moderatörün
-- ("41. Kat Özel") odaları, sonra üyelerin; her grup en yeniden eskiye.
-- Moderatörde düzenleyen adı "41. Kat Sosyal", premium üyede gerçek ad görünür (etkinliklerdeki gibi).
drop function if exists public.list_open_rooms();
drop function if exists public.list_open_rooms(text);
create or replace function public.list_open_rooms(p_game_type text default null)
returns table (
  id uuid, game_type text, game_title text, host_name text, is_official boolean,
  is_mine boolean, player_count int, joined boolean, event_title text, created_at timestamptz, host_title text,
  place_q int, place_r int, place_note text, remote boolean, is_test boolean
)
language plpgsql security definer set search_path = public as $$
begin
  perform public._sweep_live_rooms(); -- sahibi ayrılmış (terk edilmiş) odalar kapanır, listede kalmaz
  return query
  with ct as materialized (select * from public._champion_titles())
  select r.id, r.game_type, gt.title,
         case when h.role = 'admin' then '41. Kat Sosyal' else h.full_name end,
         (h.role = 'admin'),
         (r.host_id = auth.uid()),
         (select count(*)::int from public.room_players rp where rp.room_id = r.id and rp.left_at is null),
         exists (select 1 from public.room_players rp
                  where rp.room_id = r.id and rp.user_id = auth.uid() and rp.left_at is null),
         e.title,
         r.created_at,
         public._title_join((select array_agg(t.label order by t.sort_order) from ct t where t.user_id = r.host_id)),
         r.place_q, r.place_r, r.place_note, r.remote, coalesce((r.config->>'test')::boolean, false)
    from public.game_rooms r
    join public.game_types gt on gt.key = r.game_type
    join public.profiles h on h.id = r.host_id
    left join public.events e on e.id = r.event_id and not e.is_cancelled
   where public._is_active_user()
     and r.status = 'lobby'
     and r.created_at > now() - interval '12 hours'
     and (p_game_type is null or r.game_type = p_game_type)
     and (not gt.presence_required or r.host_seen_at > public._presence_cutoff())
   order by (h.role = 'admin') desc, r.created_at desc
   limit 50;
end $$;

-- ---------------------------------------------------------------------
-- 5b2) Oyunda kalma kuralları (yan yana oynanan oyunlar için; çekiliş hariç)
--   * Kişi aynı anda yalnızca tek oyunda olabilir.
--   * Oda sahibi ayrılırsa oda kapanır; oyuncu ayrılırsa bekleme salonunda listeden çıkar, oyun başlamışsa
--     oyundan atılır ve geri dönemez.
--   * "Ayrılmak": oyun ekranından menüye dönmek, uygulamayı kapatmak, arka plana almak ya da bağlantıyı
--     (room_presence_grace_seconds saniyeden uzun) kaybetmek. Oyun ekranı birkaç saniyede bir "buradayım"
--     işareti gönderir (vv_view / room_heartbeat); işareti kesilen kişi kendiliğinden temizlenir.
-- ---------------------------------------------------------------------

create or replace function public._presence_cutoff()
returns timestamptz language sql stable set search_path = public as $$
  select now() - make_interval(secs => greatest(10, public.setting_int('room_presence_grace_seconds', 45)));
$$;

-- "Buradayım" işaretini tazeler. Veritabanını yormamak için son işaretten 4 saniye geçmediyse yazmaz.
create or replace function public._room_touch(p_room_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.room_players set last_seen_at = now()
   where room_id = p_room_id and user_id = p_user_id and left_at is null
     and last_seen_at < now() - interval '4 seconds';
  update public.game_rooms set host_seen_at = now()
   where id = p_room_id and host_id = p_user_id and host_seen_at < now() - interval '4 seconds';
end $$;

-- Odayı kapatır (oda sahibi ayrıldı): oyun biter, oyuncular serbest kalır. Oyun başlamamışsa kota geri verilir.
create or replace function public._room_close(p_room_id uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set status = 'cancelled',
         finished_at = now(),
         state = state || jsonb_build_object('phase', 'cancelled', 'close_reason', p_reason, 'phase_started_at', now())
   where id = p_room_id and status in ('lobby', 'playing');
$$;

-- Bir kişiyi odadan çıkarır. Döner: 'closed' (oda sahibiydi, oda kapandı), 'removed' (bekleme salonundan çıktı),
-- 'eliminated' (oyundan atıldı), boş (yapılacak bir şey yoktu).
create or replace function public._room_remove_player(p_room_id uuid, p_user_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status not in ('lobby', 'playing') then return null; end if;
  if not exists (select 1 from public.game_types where key = r.game_type and presence_required) then return null; end if;

  -- Eşleştirme odasında (lobide de) ve başlamış her uzaktan oyunda sahibi ayrılınca oda kapanmaz,
  -- sahiplik sıradaki gerçek oyuncuya geçer (önce hayatta olanlar, sonra katılma sırası). Yalnızca botlar kaldıysa kapanır.
  -- Anlatıcı ayrılırsa oyun otomatik ilerler ama yine puansız kalır (no_points).
  -- (Paket: iki oyunda da; yeni el bekleme odasında da sahiplik devredilir, oda dağılmaz)
  if r.host_id = p_user_id and r.game_type in ('shark_cage', 'vampire_villager')
     and (coalesce((r.config->>'match')::boolean, false) or (r.remote and r.status = 'playing')
          or (r.config ? 'rematch_of' and r.status = 'lobby'))
     and exists (select 1 from public.room_players rp join public.profiles bp on bp.id = rp.user_id
                  where rp.room_id = p_room_id and rp.user_id <> p_user_id and rp.left_at is null and not bp.is_bot) then
    update public.game_rooms
       set host_id = (select rp.user_id from public.room_players rp join public.profiles bp on bp.id = rp.user_id
                       where rp.room_id = p_room_id and rp.user_id <> p_user_id and rp.left_at is null and not bp.is_bot
                       order by rp.is_alive desc, rp.joined_at limit 1),
           host_seen_at = now(),
           config = case when coalesce(config->>'mode', 'auto') = 'narrator'
                         then config || jsonb_build_object('mode', 'auto', 'no_points', true) else config end,
           state = case when state ? 'ready' then jsonb_set(state, '{ready}', (state->'ready') - p_user_id::text)
                        else state end
     where id = p_room_id;
    select * into r from public.game_rooms where id = p_room_id;
  end if;

  if r.host_id = p_user_id then
    perform public._room_close(p_room_id, p_reason);
    return 'closed';
  end if;

  if r.status = 'lobby' then
    delete from public.room_players where room_id = p_room_id and user_id = p_user_id;
    if found then
      if r.state ? 'ready' then
        update public.game_rooms set state = jsonb_set(state, '{ready}', (state->'ready') - p_user_id::text)
         where id = p_room_id;
      end if;
      return 'removed';
    end if;
    return null;
  end if;

  update public.room_players
     set is_alive = false, left_at = now(), left_reason = p_reason
   where room_id = p_room_id and user_id = p_user_id and left_at is null;
  if not found then return null; end if;
  if r.game_type = 'vampire_villager' then perform public._vv_after_leave(p_room_id, p_user_id); end if;
  if r.game_type = 'shark_cage' then perform public._sk_after_leave(p_room_id, p_user_id); end if;
  return 'eliminated';
end $$;

-- Bir odada işareti kesilenleri (ve sahibi kesildiyse odayı) temizler.
create or replace function public._room_sweep(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_cut timestamptz := public._presence_cutoff();
  u record;
begin
  select * into r from public.game_rooms where id = p_room_id and status in ('lobby', 'playing');
  if not found then return; end if;
  if not exists (select 1 from public.game_types where key = r.game_type and presence_required) then return; end if;
  if r.host_seen_at < v_cut then
    perform public._room_remove_player(p_room_id, r.host_id, 'timeout');
    return;
  end if;
  for u in select rp.user_id from public.room_players rp
            where rp.room_id = p_room_id and rp.left_at is null and rp.last_seen_at < v_cut
              and not exists (select 1 from public.profiles bp where bp.id = rp.user_id and bp.is_bot) loop
    perform public._room_remove_player(p_room_id, u.user_id, 'timeout');
  end loop;
end $$;

-- Bütün açık odalarda aynı temizlik (en fazla 20 oda). Oda listesi, katılma ve oda açma bunu çağırır;
-- böylece kimse oyunda değilken bile terk edilmiş odalar kısa sürede kapanır.
create or replace function public._sweep_live_rooms()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cut timestamptz := public._presence_cutoff();
  x record;
begin
  for x in
    select gr.id
      from public.game_rooms gr
      join public.game_types gt on gt.key = gr.game_type and gt.presence_required
     where gr.status in ('lobby', 'playing')
       and (gr.host_seen_at < v_cut
            or exists (select 1 from public.room_players rp
                        where rp.room_id = gr.id and rp.left_at is null and rp.last_seen_at < v_cut))
     order by gr.host_seen_at, gr.id
     limit 20
  loop
    perform public._room_sweep(x.id);
  end loop;
end $$;

-- Kişinin şu an içinde olduğu (oyuncu ya da oda sahibi) yan yana oyun odası; yoksa boş.
create or replace function public._user_live_room(p_user_id uuid, p_except uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select x.id
    from (
      select gr.id, gr.created_at
        from public.game_rooms gr
        join public.game_types gt on gt.key = gr.game_type and gt.presence_required
        join public.room_players rp on rp.room_id = gr.id and rp.user_id = p_user_id and rp.left_at is null
       where gr.status in ('lobby', 'playing') and gr.id is distinct from p_except
      union
      select gr.id, gr.created_at
        from public.game_rooms gr
        join public.game_types gt on gt.key = gr.game_type and gt.presence_required
       where gr.status in ('lobby', 'playing') and gr.host_id = p_user_id and gr.id is distinct from p_except
    ) x
   order by x.created_at desc
   limit 1;
$$;

-- Oyun ekranından menüye dönen ya da uygulamayı yeniden açan kişi bütün yan yana oyunlarından çıkar
-- (oda sahibiyse odası kapanır). Uygulama bunu menü açılınca ve uygulama başlayınca çağırır.
-- Döner: çıkarıldığı odaların listesi (kullanıcıya bilgi vermek için).
create or replace function public.leave_all_rooms()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  x record;
  v_res text;
  v_out jsonb := '[]'::jsonb;
begin
  v := public._require_user();
  for x in
    select gr.id, gt.title
      from public.game_rooms gr
      join public.game_types gt on gt.key = gr.game_type and gt.presence_required
     where gr.status in ('lobby', 'playing')
       and (gr.host_id = v.id
            or exists (select 1 from public.room_players rp
                        where rp.room_id = gr.id and rp.user_id = v.id and rp.left_at is null))
  loop
    v_res := public._room_remove_player(x.id, v.id, 'quit');
    if v_res is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('room_id', x.id, 'game', x.title, 'result', v_res));
    end if;
  end loop;
  return v_out;
end $$;

-- Genel "buradayım" işareti (kendi canlı akışı olmayan oyun ekranları için). Cevap: oda ve kişi durumu.
create or replace function public.room_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_left timestamptz;
  v_member boolean;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found then return jsonb_build_object('active', false, 'status', null, 'reason', 'room_not_found'); end if;
  perform public._room_sweep(p_room_id);
  select * into r from public.game_rooms where id = p_room_id;
  perform public._room_touch(p_room_id, v.id);
  select rp.left_at into v_left from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  v_member := found;
  return jsonb_build_object(
    'active', r.status in ('lobby', 'playing') and (r.host_id = v.id or (v_member and v_left is null)),
    'status', r.status,
    'is_host', (r.host_id = v.id),
    'left', (v_left is not null),
    'reason', r.state->>'close_reason');
end $$;

-- Odanın sahibi (katılımcı listesinde "Oda sahibi" olarak gösterilir). Moderatör odasında ad "41. Kat Sosyal".
create or replace function public.room_host(p_room_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', r.host_id,
           'name', case when h.role = 'admin' then '41. Kat Sosyal' else h.full_name end,
           'is_moderator', (h.role = 'admin'),
           'is_me', (r.host_id = auth.uid()))
    from public.game_rooms r
    join public.profiles h on h.id = r.host_id
   where r.id = p_room_id
     and public._is_active_user()
     and (r.host_id = auth.uid() or public.is_admin() or public.is_room_member(p_room_id));
$$;

-- ---------------------------------------------------------------------
-- 5c) Vampir–Köylü
--   Roller: Köylü, Vampir, Doktor, Dedektif. Uygulama hikâye anlatıcısıdır: geceleri vampirler birini
--   ısırır, doktor birini korur, dedektif birine bakar; sabah ne olduğu açıklanır, gündüz herkes oy verir.
--   Akış (state.phase): reveal -> night -> dawn -> vote -> vote_result -> night -> ... -> ended
--   Herkesin görebildiği bilgi game_rooms.state içindedir. Gizli bilgiler (rol, geceki seçim, dedektifin
--   sonuçları) yalnızca room_player_secrets.data içinde durur ve vv_view ile kişiye özel okunur.
--   Odayı açan kişi (ya da moderatör) oyunu ilerletir; moderatör odayı açtıysa oyuncu değil anlatıcıdır.
-- ---------------------------------------------------------------------

-- Rol dağılımı: oyuncu sayısına göre vampir, doktor ve dedektif sayısı
create or replace function public._vv_composition(p_players int)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'vampire', greatest(1, (p_players + 1) / 4),
    'doctor', (case when p_players >= 5 then 1 else 0 end),
    'detective', (case when p_players >= 7 then 1 else 0 end),
    'villager', greatest(0, p_players - greatest(1, (p_players + 1) / 4)
                            - (case when p_players >= 5 then 1 else 0 end)
                            - (case when p_players >= 7 then 1 else 0 end))
  );
$$;

-- Odanın oyun şekli: 'auto' | 'host' | 'narrator' (eski odalarda: moderatör açtıysa narrator, üye açtıysa host)
create or replace function public._vv_mode(r public.game_rooms)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(r.config->>'mode',
                  case when (select p.role from public.profiles p where p.id = r.host_id) = 'admin'
                       then 'narrator' else 'host' end);
$$;

-- Aşamanın başladığı an
create or replace function public._vv_phase_started(r public.game_rooms)
returns timestamptz language sql immutable set search_path = public as $$
  select coalesce((r.state->>'phase_started_at')::timestamptz, r.created_at);
$$;

-- Odayı kilitleyerek okur (aynı odada eş zamanlı işlemler sıraya girer)
create or replace function public._vv_room(p_room_id uuid)
returns public.game_rooms language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_left timestamptz;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type <> 'vampire_villager' then raise exception 'room_not_found'; end if;
  if r.status in ('lobby', 'playing') then
    -- Önce işareti kesilenler temizlenir (çağıran dahil), sonra çağıranın işareti tazelenir
    perform public._room_sweep(p_room_id);
    select * into r from public.game_rooms where id = p_room_id;
    perform public._room_touch(p_room_id, auth.uid());
    select rp.left_at into v_left from public.room_players rp where rp.room_id = p_room_id and rp.user_id = auth.uid();
    if v_left is not null then raise exception 'you_left'; end if;
    perform public._vv_bots_act(p_room_id); -- GEÇİCİ: deneme odasında botların hamleleri
    perform public._vv_auto_tick(p_room_id);
    select * into r from public.game_rooms where id = p_room_id;
  end if;
  return r;
end $$;

-- Otomatik Oyun: süresi dolan ya da herkesin işini bitirdiği aşamayı ilerletir. Kimse yönetmez; oyuna bakan
-- her telefon (vv_view) ve her oyuncu hamlesi bu kontrolü tetikler, ayrı bir zamanlayıcı gerekmez.
create or replace function public._vv_auto_tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_phase text;
  v_age numeric;
  v_t jsonb;
  v_round int;
  v_pending int;
  v_idle int;
  v_active boolean;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'playing' or public._vv_mode(r) <> 'auto' then return; end if;
  v_phase := r.state->>'phase';
  v_t := coalesce(r.state->'timers', '{}'::jsonb);
  v_round := coalesce((r.state->>'round')::int, 0);
  v_age := extract(epoch from now() - public._vv_phase_started(r));

  if v_phase = 'reveal' then
    -- Herkes rolünü gördüyse ya da süre dolduysa ilk gece başlar
    select count(*)::int into v_pending
      from public.room_players rp
      join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.left_at is null and not coalesce((s.data->>'ready')::boolean, false);
    if v_pending = 0 or v_age >= coalesce((v_t->>'reveal')::int, 40) then
      perform public._vv_go_night(p_room_id);
    end if;

  elsif v_phase = 'night' then
    -- Eylemi olanların hepsi seçtiyse gece biter; ama kimin eylemi olduğu süreden anlaşılmasın diye en az 12 sn sürer
    select count(*)::int into v_pending
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive and s.role in ('vampire', 'doctor', 'detective')
       and coalesce((s.data->'night'->>'round')::int, 0) <> v_round;
    if (v_pending = 0 and v_age >= 12) or v_age >= coalesce((v_t->>'night')::int, 45) then
      perform public._vv_resolve_night(p_room_id);
    end if;

  elsif v_phase = 'dawn' then
    -- Sabah: konuşulur, süre bitince oylama kendiliğinden başlar. Uzaktan odada da aynı süre geçerlidir: artık
    -- bas-konuş ses mesajlarıyla konuşulur (eski sırayla sesli sohbet kullanılmıyor).
    if v_age >= coalesce((v_t->>'discuss')::int, 120) then
      perform public._vv_go_vote(p_room_id);
    end if;

  elsif v_phase = 'vote' then
    select count(*)::int into v_pending
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive
       and coalesce((s.data->'vote'->>'round')::int, 0) <> v_round;
    if v_pending = 0 or v_age >= coalesce((v_t->>'vote')::int, 60) then
      perform public._vv_resolve_vote(p_room_id);
    end if;

  elsif v_phase = 'vote_result' then
    if v_age >= coalesce((v_t->>'result')::int, 12) then
      -- Üst üste iki tur kimse hiçbir şey yapmadıysa (herkes ekranı açık bırakıp gitmiş) oyun kapanır
      v_active := (jsonb_array_length(coalesce(r.state->'last_night'->'killed', '[]'::jsonb)) > 0)
               or ((r.state->'last_vote'->>'executed') is not null)
               or (jsonb_array_length(coalesce(r.state->'last_vote'->'tally', '[]'::jsonb)) > 0)
               or (coalesce((r.state->'last_vote'->>'skips')::int, 0) > 0);
      v_idle := case when v_active then 0 else coalesce((r.state->>'idle_rounds')::int, 0) + 1 end;
      if v_idle >= 2 then
        perform public._room_close(p_room_id, 'inactive');
      else
        update public.game_rooms set state = state || jsonb_build_object('idle_rounds', v_idle) where id = p_room_id;
        perform public._vv_go_night(p_room_id);
      end if;
    end if;
  end if;
end $$;

-- Oyun sürerken bir oyuncu ayrılınca (atılınca): rolü herkese açıklanır, kazanan var mı bakılır,
-- bekleniyorsa gece / oylama kalan oyuncularla ilerler.
create or replace function public._vv_after_leave(p_room_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_role text;
  v_winner text;
  v_round int;
  v_pending int;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if r.status <> 'playing' then return; end if;
  v_round := coalesce((r.state->>'round')::int, 0);

  select s.role into v_role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = p_user_id;
  if v_role is not null then
    update public.game_rooms
       set state = jsonb_set(state, '{reveals}',
             coalesce(state->'reveals', '{}'::jsonb) || jsonb_build_object(p_user_id::text, v_role))
     where id = p_room_id;
  end if;

  v_winner := public._vv_check_winner(p_room_id);
  if v_winner is not null then
    perform public._vv_finish(p_room_id, v_winner);
    return;
  end if;

  if r.state->>'phase' = 'night' then
    select count(*)::int into v_pending
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive and s.role in ('vampire', 'doctor', 'detective')
       and coalesce((s.data->'night'->>'round')::int, 0) <> v_round;
    if v_pending = 0 then perform public._vv_resolve_night(p_room_id); end if;
  elsif r.state->>'phase' = 'vote' then
    select count(*)::int into v_pending
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive
       and coalesce((s.data->'vote'->>'round')::int, 0) <> v_round;
    if v_pending = 0 then perform public._vv_resolve_vote(p_room_id); end if;
  elsif r.state->>'phase' = 'dawn' then
    perform public._vv_skip_check(p_room_id);
  end if;
end $$;

-- Kazanan var mı? Hiç vampir kalmadıysa köylüler, vampirler diğerlerine eşit ya da fazlaysa vampirler kazanır.
create or replace function public._vv_check_winner(p_room_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select (case when t.v = 0 then 'villager' when t.v >= t.o then 'vampire' else null end)
    from (
      select (count(*) filter (where s.role = 'vampire' and rp.is_alive))::int as v,
             (count(*) filter (where s.role <> 'vampire' and rp.is_alive))::int as o
        from public.room_players rp
        join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
       where rp.room_id = p_room_id
    ) t;
$$;

create or replace function public._vv_finish(p_room_id uuid, p_winner text)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = state || jsonb_build_object('phase', 'ended', 'winner', p_winner, 'phase_started_at', now()),
         status = 'finished',
         finished_at = now()
   where id = p_room_id;
$$;

-- Paket 26: oyun içi görev sayacı (odadaki gizli kayıtta). Oyun bitince record_game_plays user_vv_stats'a ekler.
create or replace function public._vv_ach_add(p_room uuid, p_user uuid, p_key text, p_n int default 1)
returns void language sql security definer set search_path = public as $$
  update public.room_player_secrets s
     set data = jsonb_set(coalesce(s.data, '{}'::jsonb), '{ach}',
                  coalesce(s.data->'ach', '{}'::jsonb)
                  || jsonb_build_object(p_key, coalesce((s.data->'ach'->>p_key)::int, 0) + p_n))
   where s.room_id = p_room and s.user_id = p_user;
$$;

-- Geceyi bitirir: vampirlerin hedefi (doktor korumadıysa) ölür, sabah olur.
create or replace function public._vv_resolve_night(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_round int;
  v_target uuid;
  v_protect uuid;
  v_doctor uuid;
  v_killed uuid;
  v_killed_name text;
  v_winner text;
begin
  select * into r from public.game_rooms where id = p_room_id;
  v_round := (r.state->>'round')::int;

  -- Vampirlerin hedefi: en çok oyu alan (eşitlikte rastgele)
  select t.target into v_target
    from (
      select (s.data->'night'->>'target')::uuid as target
        from public.room_player_secrets s
        join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
       where s.room_id = p_room_id and s.role = 'vampire' and rp.is_alive
         and (s.data->'night'->>'round')::int = v_round
         and (s.data->'night'->>'target') is not null
         and exists (select 1 from public.room_players tp
                      where tp.room_id = p_room_id and tp.user_id = (s.data->'night'->>'target')::uuid and tp.is_alive)
    ) t
   group by t.target
   order by count(*) desc, random()
   limit 1;

  -- Doktorun koruduğu kişi
  select (s.data->'night'->>'target')::uuid, s.user_id into v_protect, v_doctor
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
   where s.room_id = p_room_id and s.role = 'doctor' and rp.is_alive
     and (s.data->'night'->>'round')::int = v_round
   limit 1;

  -- Doktor ertesi gece aynı kişiyi koruyamaz
  update public.room_player_secrets s
     set data = s.data || jsonb_build_object('last_protect', v_protect)
   where s.room_id = p_room_id and s.role = 'doctor';

  if v_target is not null and v_target is distinct from v_protect then
    update public.room_players
       set is_alive = false, out_at = now()
     where room_id = p_room_id and user_id = v_target and is_alive
    returning display_name into v_killed_name;
    if found then v_killed := v_target; end if;
  end if;

  -- Paket 26 görev sayaçları: geceyi sağ atlatanlar +1 gece; doktor başka birini koruduysa +1 koruma
  update public.room_player_secrets s
     set data = jsonb_set(coalesce(s.data, '{}'::jsonb), '{ach}',
                  coalesce(s.data->'ach', '{}'::jsonb)
                  || jsonb_build_object('nights', coalesce((s.data->'ach'->>'nights')::int, 0) + 1))
   where s.room_id = p_room_id
     and exists (select 1 from public.room_players rp
                  where rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null);
  if v_protect is not null and v_doctor is not null and v_protect <> v_doctor then
    perform public._vv_ach_add(p_room_id, v_doctor, 'protects');
  end if;

  update public.game_rooms
     set state = state || jsonb_build_object(
           'phase', 'dawn',
           'phase_started_at', now(),
           'last_night', jsonb_build_object(
             'round', v_round,
             'killed', (case when v_killed is null then '[]'::jsonb
                             else jsonb_build_array(jsonb_build_object('id', v_killed, 'name', v_killed_name)) end)))
   where id = p_room_id;

  v_winner := public._vv_check_winner(p_room_id);
  if v_winner is not null then perform public._vv_finish(p_room_id, v_winner); end if;
end $$;

-- Oylamayı bitirir: en çok oyu alan tek kişi elenir ve rolü açıklanır. Eşitlikte kimse elenmez.
create or replace function public._vv_resolve_vote(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_round int;
  v_tally jsonb;
  v_top int;
  v_second int;
  v_skips int;
  v_absent int;
  v_exec uuid;
  v_exec_name text;
  v_exec_role text;
  v_winner text;
begin
  select * into r from public.game_rooms where id = p_room_id;
  v_round := (r.state->>'round')::int;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.target, 'name', x.name, 'votes', x.c)
                            order by x.c desc, x.name), '[]'::jsonb)
    into v_tally
    from (
      select (s.data->'vote'->>'target')::uuid as target, rp2.display_name as name, count(*) as c
        from public.room_player_secrets s
        join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive
        join public.room_players rp2 on rp2.room_id = s.room_id and rp2.user_id = (s.data->'vote'->>'target')::uuid
                                    and rp2.is_alive
       where s.room_id = p_room_id
         and (s.data->'vote'->>'round')::int = v_round
         and (s.data->'vote'->>'target') is not null
       group by 1, 2
    ) x;

  v_top := coalesce((v_tally->0->>'votes')::int, 0);
  v_second := coalesce((v_tally->1->>'votes')::int, 0);

  select (count(*) filter (where (s.data->'vote'->>'target') is null
                             and (s.data->'vote'->>'round')::int = v_round))::int,
         (count(*) filter (where coalesce((s.data->'vote'->>'round')::int, 0) <> v_round))::int
    into v_skips, v_absent
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive
   where s.room_id = p_room_id;

  if v_top > 0 and v_top > v_second then
    v_exec := (v_tally->0->>'id')::uuid;
    update public.room_players set is_alive = false, out_at = now()
     where room_id = p_room_id and user_id = v_exec
    returning display_name into v_exec_name;
    select s.role into v_exec_role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v_exec;
    perform public._vv_ach_add(p_room_id, v_exec, 'hanged'); -- Paket 26 görev sayacı
  end if;

  update public.game_rooms
     set state = (case when v_exec is null then state
                       else jsonb_set(state, '{reveals}',
                              coalesce(state->'reveals', '{}'::jsonb) || jsonb_build_object(v_exec::text, v_exec_role))
                  end)
                 || jsonb_build_object(
                      'phase', 'vote_result',
                      'phase_started_at', now(),
                      'last_vote', jsonb_build_object(
                        'round', v_round,
                        'executed', (case when v_exec is null then null
                                          else jsonb_build_object('id', v_exec, 'name', v_exec_name, 'role', v_exec_role) end),
                        'tally', v_tally,
                        'skips', v_skips,
                        'absent', v_absent,
                        'tie', (v_top > 0 and v_top = v_second)))
   where id = p_room_id;

  v_winner := public._vv_check_winner(p_room_id);
  if v_winner is not null then perform public._vv_finish(p_room_id, v_winner); end if;
end $$;

-- Oyunu başlatır: roller dağıtılır. Yalnızca odayı açan kişi ya da moderatör. En az game_types.min_players oyuncu gerekir.
create or replace function public.vv_start(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'invalid_transition'; end if;
  -- Eşleştirme odası "Hazırım" çoğunluğuyla kendiliğinden başlar
  if coalesce((r.config->>'match')::boolean, false) then raise exception 'match_room'; end if;
  perform public._vv_begin(p_room_id);
end $$;

-- Oyunu başlatır (yetki kontrolü çağıranda): roller dağıtılır, rol gösterimi başlar
create or replace function public._vv_begin(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_n int;
  v_min int;
  v_comp jsonb;
  v_v int;
  v_d int;
  v_t int;
  v_mode text;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'lobby' then raise exception 'invalid_transition'; end if;

  -- Anlatıcı modunda moderatör oyuncu sayılmaz; öteki modlarda (Otomatik / Ben Yöneticiyim ve oynuyorum) oynar
  v_mode := public._vv_mode(r);
  if v_mode = 'narrator' then
    delete from public.room_players rp using public.profiles p
     where rp.room_id = p_room_id and p.id = rp.user_id and p.role = 'admin';
  end if;

  select min_players into v_min from public.game_types where key = 'vampire_villager';
  select count(*)::int into v_n from public.room_players where room_id = p_room_id;
  if v_n < coalesce(v_min, 5) then raise exception 'not_enough_players'; end if;

  v_comp := public._vv_composition(v_n);
  v_v := (v_comp->>'vampire')::int;
  v_d := (v_comp->>'doctor')::int;
  v_t := (v_comp->>'detective')::int;

  delete from public.room_player_secrets where room_id = p_room_id;
  insert into public.room_player_secrets (room_id, user_id, role, data)
  select p_room_id, x.user_id,
         (case when x.rn <= v_v then 'vampire'
               when x.rn <= v_v + v_d then 'doctor'
               when x.rn <= v_v + v_d + v_t then 'detective'
               else 'villager' end),
         '{}'::jsonb
    from (select rp.user_id, row_number() over (order by random()) as rn
            from public.room_players rp where rp.room_id = p_room_id) x;

  update public.room_players set is_alive = true, score = 0, out_at = null where room_id = p_room_id;
  update public.game_rooms
     set status = 'playing',
         started_at = now(),
         state = jsonb_build_object('phase', 'reveal', 'round', 0, 'phase_started_at', now(),
                                    'composition', v_comp, 'reveals', '{}'::jsonb,
                                    -- Otomatik oyunun süreleri başlarken sabitlenir (sonradan ayar değişse de bu oyun bozulmaz)
                                    'timers', jsonb_build_object(
                                      'reveal', public.setting_int('vv_auto_reveal_seconds', 40),
                                      'night', public.setting_int('vv_auto_night_seconds', 45),
                                      'discuss', public.setting_int('vv_auto_discuss_seconds', 120),
                                      'vote', public.setting_int('vv_auto_vote_seconds', 60),
                                      'result', public.setting_int('vv_auto_result_seconds', 12)))
   where id = p_room_id;
end $$;

-- "Rolümü gördüm" işareti (anlatıcı kaç kişinin hazır olduğunu görür)
create or replace function public.vv_ready(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  update public.room_player_secrets set data = data || jsonb_build_object('ready', true)
   where room_id = p_room_id and user_id = v.id;
  if not found then raise exception 'not_in_room'; end if;
end $$;

-- Geceyi başlatır (iç kullanım): ilk gece rol gösteriminden, sonraki geceler oylama sonucundan sonra
create or replace function public._vv_go_night(p_room_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = (state - 'last_night' - 'last_vote')
                 || jsonb_build_object('phase', 'night',
                                       'round', coalesce((state->>'round')::int, 0) + 1,
                                       'phase_started_at', now())
   where id = p_room_id;
$$;

-- Sabahtan sonra oylamayı başlatır (iç kullanım)
create or replace function public._vv_go_vote(p_room_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = state || jsonb_build_object('phase', 'vote', 'phase_started_at', now())
   where id = p_room_id;
$$;

-- Geceyi başlatır. Otomatik oyunda kimse çağıramaz (oyun kendi ilerler).
create or replace function public.vv_begin_night(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if public._vv_mode(r) = 'auto' then raise exception 'auto_mode'; end if;
  if r.status <> 'playing' or r.state->>'phase' not in ('reveal', 'vote_result') then raise exception 'wrong_phase'; end if;
  perform public._vv_go_night(p_room_id);
end $$;

-- Gece eylemi: vampir ısıracağı kişiyi, doktor koruyacağı kişiyi, dedektif bakacağı kişiyi seçer.
-- Gece, eylemi olan herkes seçim yapınca kendiliğinden biter (ya da anlatıcı bitirir).
create or replace function public.vv_night_action(p_room_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  me public.room_player_secrets;
  v_alive boolean;
  v_round int;
  v_t_alive boolean;
  v_t_role text;
  v_t_name text;
  v_pending int;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'night' then raise exception 'wrong_phase'; end if;
  v_round := (r.state->>'round')::int;

  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;
  if not found then raise exception 'not_in_room'; end if;
  select rp.is_alive into v_alive from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  if not v_alive then raise exception 'you_are_dead'; end if;
  if me.role not in ('vampire', 'doctor', 'detective') then raise exception 'no_night_action'; end if;

  select rp.is_alive, s.role, rp.display_name into v_t_alive, v_t_role, v_t_name
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = p_target;
  if not found or not v_t_alive then raise exception 'invalid_target'; end if;
  if me.role = 'vampire' and v_t_role = 'vampire' then raise exception 'cannot_target_ally'; end if;
  if me.role = 'detective' and p_target = v.id then raise exception 'invalid_target'; end if;
  if me.role = 'doctor' and p_target::text = (me.data->>'last_protect') then raise exception 'same_protect'; end if;
  if me.role = 'detective' and coalesce((me.data->'night'->>'round')::int, 0) = v_round then
    raise exception 'already_acted';
  end if;

  update public.room_player_secrets s
     set data = s.data || jsonb_build_object('night', jsonb_build_object('round', v_round, 'target', p_target))
   where s.room_id = p_room_id and s.user_id = v.id;

  -- Dedektifin sonucu hemen kendisine yazılır (gece başına bir kez bakabilir)
  if me.role = 'detective' then
    -- Paket 26 görev sayacı: bir oyunda aynı vampir bir kez sayılır
    if v_t_role = 'vampire'
       and not exists (select 1 from jsonb_array_elements(coalesce(me.data->'investigations', '[]'::jsonb)) e
                        where e->>'id' = p_target::text) then
      perform public._vv_ach_add(p_room_id, v.id, 'finds');
    end if;
    update public.room_player_secrets s
       set data = jsonb_set(s.data, '{investigations}',
             coalesce(s.data->'investigations', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('round', v_round, 'id', p_target, 'name', v_t_name,
                                                      'is_vampire', (v_t_role = 'vampire'))))
     where s.room_id = p_room_id and s.user_id = v.id;
  end if;

  select count(*)::int into v_pending
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
   where s.room_id = p_room_id and rp.is_alive and s.role in ('vampire', 'doctor', 'detective')
     and coalesce((s.data->'night'->>'round')::int, 0) <> v_round;
  if v_pending = 0 then
    -- Otomatik oyunda gece en az 12 sn sürer (kimin eylemi olduğu süreden anlaşılmasın); kontrol onu yapar
    if public._vv_mode(r) = 'auto' then perform public._vv_auto_tick(p_room_id);
    else perform public._vv_resolve_night(p_room_id); end if;
  end if;
end $$;

-- Anlatıcı (oda sahibi / moderatör) geceyi, bekleyenleri sayarak erken bitirir
create or replace function public.vv_end_night(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if public._vv_mode(r) = 'auto' then raise exception 'auto_mode'; end if;
  if r.status <> 'playing' or r.state->>'phase' <> 'night' then raise exception 'wrong_phase'; end if;
  -- Beklemeden bitirme yalnızca her şeyi gören anlatıcıya serbesttir; oynayan herkes (oynayan moderatör dahil) bekler
  if not public._vv_is_omni(p_room_id, v.id)
     and now() < public._vv_phase_started(r) + make_interval(secs => public.setting_int('vv_force_end_seconds', 60)) then
    raise exception 'too_early';
  end if;
  perform public._vv_resolve_night(p_room_id);
end $$;

-- Sabahtan sonra oylamayı başlatır
create or replace function public.vv_begin_vote(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if public._vv_mode(r) = 'auto' then raise exception 'auto_mode'; end if;
  if r.status <> 'playing' or r.state->>'phase' <> 'dawn' then raise exception 'wrong_phase'; end if;
  perform public._vv_go_vote(p_room_id);
end $$;

-- Oy: sağ kalan herkes biri için oy verir (p_target boş = oy kullanmıyorum). Herkes oy verince oylama biter.
create or replace function public.vv_cast_vote(p_room_id uuid, p_target uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_alive boolean;
  v_round int;
  v_pending int;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'vote' then raise exception 'wrong_phase'; end if;
  v_round := (r.state->>'round')::int;

  select rp.is_alive into v_alive from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  if not found then raise exception 'not_in_room'; end if;
  if not v_alive then raise exception 'you_are_dead'; end if;

  if p_target is not null then
    if p_target = v.id then raise exception 'invalid_target'; end if;
    perform 1 from public.room_players where room_id = p_room_id and user_id = p_target and is_alive;
    if not found then raise exception 'invalid_target'; end if;
  end if;

  update public.room_player_secrets s
     set data = s.data || jsonb_build_object('vote', jsonb_build_object('round', v_round, 'target', p_target))
   where s.room_id = p_room_id and s.user_id = v.id;

  select count(*)::int into v_pending
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
   where s.room_id = p_room_id and rp.is_alive
     and coalesce((s.data->'vote'->>'round')::int, 0) <> v_round;
  if v_pending = 0 then perform public._vv_resolve_vote(p_room_id); end if;
end $$;

create or replace function public.vv_end_vote(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if public._vv_mode(r) = 'auto' then raise exception 'auto_mode'; end if;
  if r.status <> 'playing' or r.state->>'phase' <> 'vote' then raise exception 'wrong_phase'; end if;
  -- Beklemeden bitirme yalnızca her şeyi gören anlatıcıya serbesttir; oynayan herkes (oynayan moderatör dahil) bekler
  if not public._vv_is_omni(p_room_id, v.id)
     and now() < public._vv_phase_started(r) + make_interval(secs => public.setting_int('vv_force_end_seconds', 60)) then
    raise exception 'too_early';
  end if;
  perform public._vv_resolve_vote(p_room_id);
end $$;

-- Her şeyi gören tek kişi: oyuncu olarak katılmamış moderatör (anlatıcı ya da gözlemci).
-- ---------------------------------------------------------------------
-- 5c-2) Vampir–Köylü fısıltı (Paket 21)
--   Oyunda herkes gerçek adıyla görünür. Yaşayan her oyuncu bir oyunda en çok vv_whisper_limit (3) fısıltı gönderir;
--   gelen fısıltıya cevap vermek de cevaplayanın hakkından düşer. Masadaki herkes "X, Y'ye fısıldadı" diye görür ama
--   içeriği yalnızca gönderen ve alan görür (anlatıcı moderatör de görmez). Yalnızca yaşayanlar fısıldaşır: elenen
--   oyuncu rolünü/ölüm bilgisini fısıltıyla sızdıramaz. Şikayet edilen fısıltıyı yalnızca moderatör okur. 14 gün tutulur.
-- ---------------------------------------------------------------------
create table if not exists public.vv_whispers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  reply_to uuid references public.vv_whispers (id) on delete set null,
  round int not null default 0,
  phase text not null default '',
  body text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists vv_whispers_room_idx on public.vv_whispers (room_id, created_at);
create index if not exists vv_whispers_from_idx on public.vv_whispers (room_id, from_user);
create index if not exists vv_whispers_created_idx on public.vv_whispers (created_at);
alter table public.vv_whispers enable row level security;

-- Fısıltı gönder. p_reply_to doluysa bana gelen bir fısıltıya cevaptır ve alıcı onu gönderen kişidir.
create or replace function public.vv_whisper(p_room_id uuid, p_to uuid, p_body text, p_reply_to uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_to uuid := p_to;
  v_orig public.vv_whispers;
  v_id uuid;
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_body) not between 1 and 120 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  -- Oda kilitlenir: aynı kişinin eş zamanlı iki isteği hakkı aşamaz
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  -- Gece herkes uyur: fısıltı yalnızca gündüz (Paket 24)
  if coalesce(r.state->>'phase', '') = 'night' then raise exception 'night_quiet'; end if;
  if not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id) then
    raise exception 'not_in_room';
  end if;
  if not exists (select 1 from public.room_players rp
                  where rp.room_id = p_room_id and rp.user_id = v.id and rp.is_alive and rp.left_at is null) then
    raise exception 'you_are_dead';
  end if;
  if p_reply_to is not null then
    select * into v_orig from public.vv_whispers w where w.id = p_reply_to and w.room_id = p_room_id and w.to_user = v.id;
    if not found then raise exception 'invalid_target'; end if;
    v_to := v_orig.from_user;
  end if;
  if v_to is null or v_to = v.id or not exists (
       select 1 from public.room_players rp
        where rp.room_id = p_room_id and rp.user_id = v_to and rp.is_alive and rp.left_at is null) then
    raise exception 'invalid_target';
  end if;
  if (select count(*) from public.vv_whispers w where w.room_id = p_room_id and w.from_user = v.id)
     >= greatest(0, public.setting_int('vv_whisper_limit', 3)) then
    raise exception 'whisper_limit';
  end if;
  insert into public.vv_whispers (room_id, from_user, to_user, reply_to, round, phase, body)
  values (p_room_id, v.id, v_to, p_reply_to, coalesce((r.state->>'round')::int, 0),
          coalesce(r.state->>'phase', ''), v_body)
  returning id into v_id;
  return v_id;
end $$;

-- Paket 24: elenenlerin ortak sohbeti. Yalnızca oyundan ELENEN (yaşamayan, oyundan ayrılmamış) oyuncular yazar ve okur;
-- yaşayanlar göremez (oyunu etkilemesin). Kişi başı oyunda en çok 60 mesaj, 1,5 sn arayla, 120 karakter, bağlantı yok.
create table if not exists public.vv_dead_chat (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists vv_dead_chat_room_idx on public.vv_dead_chat (room_id, created_at);
create index if not exists vv_dead_chat_created_idx on public.vv_dead_chat (created_at);
alter table public.vv_dead_chat enable row level security;

create or replace function public.vv_dead_say(p_room_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_name text;
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_body) not between 1 and 120 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  select rp.display_name into v_name from public.room_players rp
   where rp.room_id = p_room_id and rp.user_id = v.id and not rp.is_alive and rp.left_at is null;
  if v_name is null then raise exception 'not_dead'; end if;
  if exists (select 1 from public.vv_dead_chat where room_id = p_room_id and user_id = v.id
              and created_at > now() - interval '1500 milliseconds') then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.vv_dead_chat where room_id = p_room_id and user_id = v.id) >= 60 then
    raise exception 'chat_limit';
  end if;
  insert into public.vv_dead_chat (room_id, user_id, name, body) values (p_room_id, v.id, v_name, v_body);
end $$;

-- vv_view içine eklenen fısıltı listesi: herkes kimin kime fısıldadığını görür; içerik yalnızca ilgili ikiliye
create or replace function public._vv_whispers_for(p_room_id uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id,
           'from', w.from_user,
           'from_name', fp.display_name,
           'to', w.to_user,
           'to_name', tp.display_name,
           'reply', (w.reply_to is not null),
           'round', w.round,
           'at', w.created_at,
           'body', case when w.from_user = p_user or w.to_user = p_user then w.body end
         ) order by w.created_at), '[]'::jsonb)
    from public.vv_whispers w
    join public.room_players fp on fp.room_id = w.room_id and fp.user_id = w.from_user
    join public.room_players tp on tp.room_id = w.room_id and tp.user_id = w.to_user
   where w.room_id = p_room_id;
$$;

create or replace function public._vv_is_omni(p_room_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
     and not exists (select 1 from public.room_players where room_id = p_room_id and user_id = p_user_id);
$$;

-- Odanın kişiye özel görünümü: herkes yalnızca görmesi gerekeni görür.
--   Roller: kendi rolün; vampirler birbirini; moderatör (anlatıcı) hepsini; elenen oyuncunun rolü yalnızca oylamayla
--   elendiyse ya da oyun bittiyse açıktır. Gece kimin ne seçtiği hiç gösterilmez (moderatör hariç).
create or replace function public.vv_view(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  me public.room_player_secrets;
  v_is_admin boolean;
  v_is_player boolean;
  v_alive boolean;
  v_phase text;
  v_round int;
  v_reveal_all boolean;
  v_players jsonb;
  v_me jsonb;
  v_pending jsonb := null;
  v_total int;
  v_done int;
  v_ready int;
  v_count int;
  v_min int;
  v_max int;
  v_left timestamptz;
  v_host_name text;
  v_host_role text;
  v_mode text;
  v_omni boolean;
  v_limit int;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type <> 'vampire_villager' then raise exception 'room_not_found'; end if;

  -- Bu çağrı aynı zamanda "buradayım" işaretidir: önce işareti kesilenler temizlenir, sonra bu kişinin işareti tazelenir
  if r.status in ('lobby', 'playing') then
    perform public._room_sweep(p_room_id);
    select * into r from public.game_rooms where id = p_room_id;
    perform public._room_touch(p_room_id, v.id);
    perform public._vv_bots_act(p_room_id); -- GEÇİCİ: deneme odasında botların hamleleri
    if r.status = 'playing' then
      perform public._vv_auto_tick(p_room_id);
      if r.remote then perform public._voice_kick_tick(p_room_id); end if;
      select * into r from public.game_rooms where id = p_room_id;
    elsif r.status = 'lobby' then
      perform public._room_lobby_tick(p_room_id);
      select * into r from public.game_rooms where id = p_room_id;
    end if;
  end if;

  v_is_admin := (v.role = 'admin');
  v_mode := public._vv_mode(r);
  select rp.is_alive, rp.left_at into v_alive, v_left from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  v_is_player := found;
  v_alive := coalesce(v_alive, false);
  -- Her şeyi gören tek kişi, oyuna oyuncu olarak katılmamış moderatördür (anlatıcı ya da gözlemci)
  v_omni := v_is_admin and not v_is_player;
  if not (v_is_admin or v_is_player or r.host_id = v.id) then raise exception 'forbidden'; end if;

  v_phase := (case when r.status = 'lobby' then 'lobby'
                   when r.status = 'cancelled' then 'cancelled'
                   when r.status = 'finished' then 'ended'
                   else coalesce(r.state->>'phase', 'reveal') end);
  v_round := coalesce((r.state->>'round')::int, 0);
  v_reveal_all := (v_omni or r.status = 'finished');
  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', rp.user_id,
           'name', rp.display_name,
           'is_alive', rp.is_alive,
           'is_host', (rp.user_id = r.host_id),
           'is_me', (rp.user_id = v.id),
           'avatar', (select pr.avatar_index from public.profiles pr where pr.id = rp.user_id),
           'left', (rp.left_at is not null),
           'role', (case when v_reveal_all or rp.user_id = v.id or (me.role = 'vampire' and s.role = 'vampire')
                         then s.role
                         else r.state->'reveals'->>(rp.user_id::text) end),
           'night_done', (case when v_omni then coalesce((s.data->'night'->>'round')::int, 0) = v_round else null end),
           'voted', (case when v_omni then coalesce((s.data->'vote'->>'round')::int, 0) = v_round else null end),
           'ready', (case when v_omni then coalesce((s.data->>'ready')::boolean, false) else null end)
         ) order by rp.joined_at), '[]'::jsonb)
    into v_players
    from public.room_players rp
    left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id;

  v_me := jsonb_build_object(
    'is_player', v_is_player,
    'left', (v_left is not null),
    'is_host', (r.host_id = v.id),
    'is_admin', v_is_admin,
    'is_omniscient', v_omni,
    'can_control', (v_mode <> 'auto' and (r.host_id = v.id or v_is_admin) and r.status in ('lobby', 'playing')),
    'is_alive', v_alive,
    'role', me.role,
    'ready', coalesce((me.data->>'ready')::boolean, false),
    'night_target', (case when (me.data->'night'->>'round')::int = v_round then me.data->'night'->>'target' else null end),
    'voted', coalesce((me.data->'vote'->>'round')::int = v_round, false),
    'vote_target', (case when (me.data->'vote'->>'round')::int = v_round then me.data->'vote'->>'target' else null end),
    'last_protect', me.data->>'last_protect',
    'investigations', coalesce(me.data->'investigations', '[]'::jsonb)
  );

  -- Vampirler birbirini ve birbirinin gece seçimini görür
  if me.role = 'vampire' then
    v_me := v_me || jsonb_build_object('allies', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', rp.user_id,
               'name', rp.display_name,
               'is_alive', rp.is_alive,
               'pick', (select x.display_name from public.room_players x
                         where x.room_id = p_room_id
                           and x.user_id = (s.data->'night'->>'target')::uuid
                           and (s.data->'night'->>'round')::int = v_round)
             ) order by rp.joined_at), '[]'::jsonb)
        from public.room_players rp
        join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
       where rp.room_id = p_room_id and s.role = 'vampire' and rp.user_id <> v.id));
  end if;

  if v_phase = 'night' then
    select count(*)::int,
           (count(*) filter (where coalesce((s.data->'night'->>'round')::int, 0) = v_round))::int
      into v_total, v_done
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive and s.role in ('vampire', 'doctor', 'detective');
    -- Geceki ilerleme (kaç eylem bekleniyor) kaç özel rol yaşadığını ele verir; yalnızca anlatıcı görür
    if v_omni then v_pending := jsonb_build_object('kind', 'night', 'total', v_total, 'done', v_done); end if;
  elsif v_phase = 'vote' then
    select count(*)::int,
           (count(*) filter (where coalesce((s.data->'vote'->>'round')::int, 0) = v_round))::int
      into v_total, v_done
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive;
    v_pending := jsonb_build_object('kind', 'vote', 'total', v_total, 'done', v_done);
  end if;

  select (count(*) filter (where coalesce((s.data->>'ready')::boolean, false)))::int
    into v_ready
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.left_at is null
   where s.room_id = p_room_id;
  select count(*)::int into v_count from public.room_players where room_id = p_room_id and left_at is null;
  select p.full_name, p.role into v_host_name, v_host_role from public.profiles p where p.id = r.host_id;
  select gt.min_players, gt.max_players into v_min, v_max from public.game_types gt where gt.key = 'vampire_villager';

  return jsonb_build_object(
    'phase', v_phase,
    'status', r.status,
    'code', case when r.host_id = auth.uid()
                   or ((coalesce((r.config->>'match')::boolean, false) or r.config ? 'rematch_of')
                       and v_is_player and r.status = 'lobby')
                 then (select c.code from public.room_codes c where c.room_id = r.id) end,
    'match', coalesce((r.config->>'match')::boolean, false),
    'lobby_ready', case when r.status = 'lobby' then coalesce(r.state->'ready', '[]'::jsonb) end,
    'rematch', r.config ? 'rematch_of',
    'rematch_left', case when r.status = 'lobby' and r.state ? 'rematch_until'
                         then greatest(0, ceil(extract(epoch from (r.state->>'rematch_until')::timestamptz - now()))::int) end,
    'next_room', case when r.status = 'finished' then r.state->>'next_room' end,
    'next_note', case when r.status = 'finished' then r.state->>'rematch' end,
    'round', v_round,
    'winner', r.state->>'winner',
    'composition', coalesce(r.state->'composition', public._vv_composition(v_count)),
    'last_night', r.state->'last_night',
    'last_vote', r.state->'last_vote',
    -- "Tartışmayı hızlı geç": sabah tartışmasında yaşayanların yarısından fazlası işaretlerse oylama hemen başlar
    'skip', case when v_phase = 'dawn' then public._skip_tally(p_room_id, v_round)
                   || jsonb_build_object('mine', coalesce((me.data->>'skip_round')::int, 0) = v_round) end,
    -- Asılma oyları açıktır: oylama ve sonucu sırasında herkes kimin kime oy verdiğini görür (to boş = pas)
    'votes', case when v_phase in ('vote', 'vote_result') then (
               select coalesce(jsonb_agg(jsonb_build_object('from', s.user_id, 'to', s.data->'vote'->>'target')
                                         order by rp.joined_at), '[]'::jsonb)
                 from public.room_player_secrets s
                 join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
                where s.room_id = p_room_id and (s.data->'vote'->>'round')::int = v_round)
             else '[]'::jsonb end,
    'players', v_players,
    'host', jsonb_build_object(
      'id', r.host_id,
      'name', case when v_host_role = 'admin' then '41. Kat Sosyal' else v_host_name end,
      'is_moderator', (v_host_role = 'admin'),
      'is_me', (r.host_id = v.id)),
    'mode', v_mode,
    'remote', r.remote,
    'test', coalesce((r.config->>'test')::boolean, false),
    'close_reason', r.state->>'close_reason',
    -- Uzaktan odada sabahın süresi konuşma sırasına bağlıdır (sesli sohbet panelinde sıra ve süre görünür)
    'phase_limit', (case when v_mode = 'auto' and r.status = 'playing'
                         then (r.state->'timers'->>(case v_phase when 'reveal' then 'reveal' when 'night' then 'night'
                                                     when 'dawn' then 'discuss' when 'vote' then 'vote'
                                                     when 'vote_result' then 'result' else 'none' end))::int
                         else null end),
    'phase_age', greatest(0, extract(epoch from now() - public._vv_phase_started(r))::int),
    'force_after', public.setting_int('vv_force_end_seconds', 60),
    'me', v_me,
    'pending', v_pending,
    'ready_count', coalesce(v_ready, 0),
    'min_players', coalesce(v_min, 5),
    'max_players', coalesce(v_max, 30),
    -- Fısıltılar: herkes kimin kime fısıldadığını görür, içerik yalnızca gönderen ve alana
    'whispers', case when r.status in ('playing', 'finished') then public._vv_whispers_for(p_room_id, v.id)
                     else '[]'::jsonb end,
    'whisper_limit', greatest(0, public.setting_int('vv_whisper_limit', 3)),
    -- Uzaktan oda: bas-konuş ses mesajları (künye; ses sk_voice_get ile) ve bu tartışmada kalan konuşma süresi
    'voice', case when r.remote and r.status = 'playing' then public._sk_clips_for(p_room_id, v.id) else '[]'::jsonb end,
    'voice_left_ms', greatest(0, public.setting_int('sk_voice_round_ms', 15000)
                       - case when (me.data->'voice'->>'round')::int = v_round
                               and me.data->'voice'->>'channel' = (case when v_phase = 'night' then 'shark' else 'all' end)
                              then coalesce((me.data->'voice'->>'ms')::int, 0) else 0 end),
    -- Elenenlerin sohbeti: yalnızca elenen oyuncuya (ve oyun bitince oynayanlara) gelir
    'dead_chat', case when (v_is_player and not v_alive and v_left is null) or r.status = 'finished'
                      then (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body,
                                                                         'at', d.created_at, 'mine', d.user_id = v.id)
                                                      order by d.created_at), '[]'::jsonb)
                              from (select * from public.vv_dead_chat where room_id = p_room_id
                                     order by created_at desc limit 80) d)
                      end,
    'whispers_left', greatest(0, public.setting_int('vv_whisper_limit', 3)
                               - (select count(*)::int from public.vv_whispers w
                                   where w.room_id = p_room_id and w.from_user = v.id))
  );
end $$;

-- ("Devam eden odalarım" kaldırıldı: yan yana oyunlarda ayrılan kişi geri dönemez.)
drop function if exists public.my_active_rooms();

-- Aylık sıralama (her ay sıfırdan başlar): yalnızca o ay kazanılan puanlar (İstanbul saatiyle).
-- p_months_ago: 0 = bu ay, 1 = geçen ay (ay sonunda ilk 3'e gerçek hayatta hediye verilir).
-- BU AY tablosu haftada bir güncellenir (rank_weekly_refresh = true iken): pazartesi 00:00'a (İstanbul) kadarki puanlar görünür,
-- ay başında tablo sıfırlanır. GEÇEN AY tablosu kesindir ve her zaman o ayın tüm puanlarını içerir.
-- "points" o ayki puandır, "level" ise toplam puana göre seviyedir. O ay puanı olmayan listede yoktur.
-- "title" üyenin geçerli oyun şampiyonu ünvanıdır (varsa); gerçek ad gösterilen her yerde yanında görünür.
-- Tabloyu yenileyebildiği için "volatile"dır (PostgREST'te salt okunur işlemde çalışmaz).
-- Aylık ödül şartı: o ay en az bir etkinlik katılımı ya da yan yana oyun puanı olmalı (yalnızca uzaktan oynayan ilk 3
-- hediyesini alamaz; hediye sıradaki şartı sağlayan üyeye geçer). Sıralamada "eligible" sütunu bunu gösterir.
create or replace function public._prize_eligible(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.point_events pe
                  where pe.user_id = p_user and pe.created_at >= p_from and pe.created_at < p_to
                    and pe.source in ('event_attend', 'game_play') and pe.amount > 0);
$$;

drop function if exists public.get_monthly_leaderboard(int);
drop function if exists public.get_monthly_leaderboard(int, int);
create or replace function public.get_monthly_leaderboard(p_limit int default 100, p_months_ago int default 0)
returns table (place bigint, full_name text, points numeric, level int, is_premium boolean, is_me boolean, title text,
               eligible boolean)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ago int := greatest(0, least(coalesce(p_months_ago, 0), 24));
  v_lim int := greatest(1, least(coalesce(p_limit, 100), 500));
  v_lstart timestamp := date_trunc('month', (now() at time zone 'Europe/Istanbul') - make_interval(months => v_ago));
  v_from timestamptz := v_lstart at time zone 'Europe/Istanbul';
  v_to timestamptz := (v_lstart + interval '1 month') at time zone 'Europe/Istanbul';
begin
  if not public._is_active_user() then return; end if;

  if v_ago = 0 and public.setting_bool('rank_weekly_refresh') then
    perform public._ensure_rank_snapshot('points');
    return query
    with ct as materialized (select * from public._champion_titles())
    select s.place::bigint, pr.full_name, s.score, 
           coalesce((select max(l.level) from public.levels l where l.min_points <= pr.points), 1),
           (pr.premium_until is not null and pr.premium_until > now()),
           (pr.id = auth.uid()),
           public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = pr.id)),
           public._prize_eligible(pr.id, v_from, v_to)
      from public.rank_snapshots s
      join public.profiles pr on pr.id = s.user_id
     where s.kind = 'points' and pr.banned_at is null and pr.role = 'user'
       and (s.place <= v_lim or pr.id = auth.uid())
     order by s.place, pr.full_name;
    return;
  end if;

  return query
  with ct as materialized (select * from public._champion_titles()),
  w as (
    select date_trunc('month', (now() at time zone 'Europe/Istanbul') - make_interval(months => v_ago)) as local_start
  ), b as (
    select w.local_start at time zone 'Europe/Istanbul' as s,
           (w.local_start + interval '1 month') at time zone 'Europe/Istanbul' as e
      from w
  ), m as (
    select pe.user_id, sum(pe.amount) as pts
      from public.point_events pe, b
     where pe.created_at >= b.s and pe.created_at < b.e
     group by pe.user_id
    having sum(pe.amount) > 0
  ), t as (
    select dense_rank() over (order by m.pts desc) as place, pr.id as uid, pr.full_name as fname, m.pts as pts,
           coalesce((select max(l.level) from public.levels l where l.min_points <= pr.points), 1) as lvl,
           (pr.premium_until is not null and pr.premium_until > now()) as prem,
           (pr.id = auth.uid()) as me
      from m
      join public.profiles pr on pr.id = m.user_id
     where pr.banned_at is null and pr.role = 'user'
  )
  select t.place, t.fname, t.pts, t.lvl, t.prem, t.me,
         public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = t.uid)),
         public._prize_eligible(t.uid, v_from, v_to)
    from t
   where t.place <= v_lim or t.me
   order by t.place, t.fname;
end $$;

-- ---------------------------------------------------------------------
-- 5e) Genel puan sistemi, konuşma balonları, etkinlik beğeni/yorum ve katılım doğrulaması
--     Puan kaynakları (hepsi sunucuda, hileye karşı üst sınırlı; sayılar app_settings'ten ayarlanır):
--       etkinlik açma (+10, iptal edilirse geri alınır), etkinliğe KODLA doğrulanmış katılım (+15, moderatör
--       etkinliğinde +25, ayda en çok 8 etkinlik), etkinliğine doğrulanan her katılımcı (+8, aynı kişi aynı
--       düzenleyene 30 günde bir kez, etkinlik başına en çok 25 kişi, düzenleyenin ayda en çok 300 puanı),
--       oyun puanı (oyuncu sayısı kadar, en çok 12; bitirdiğin sıraya göre; en az 4 kişi, günde 3 / ayda 12 oyun;
--       Bilgi Yarışması en çok 3, en az 2 kişi, günde 3 / ayda 10 oyun, oyun hakkından yemez).
--     Beğeni, yorum ve gönderi puan VERMEZ (kolay hile).
-- ---------------------------------------------------------------------

-- Puan ekle (yalnızca sunucu içinden; sıfır puan kaydedilmez)
create or replace function public._award_points(
  p_user uuid, p_amount int, p_source text, p_reason text, p_event uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount = 0 then return; end if;
  -- Sponsor (mekân) hesaplar puan almaz ve sıralamada yer almaz
  if exists (select 1 from public.profiles where id = p_user and role::text = 'sponsor') then return; end if;
  insert into public.point_events (user_id, amount, reason, source, event_id)
  values (p_user, p_amount, p_reason, p_source, p_event);
end $$;

-- Etkinlik iptal edilince o etkinlikten kazanılan puanlar geri alınır.
-- p_all = true: herkesin puanı, false: yalnızca düzenleyenin (etkinlik başladıktan sonra düzenleyen iptal ederse).
create or replace function public._reverse_event_points(p_event uuid, p_all boolean, p_host uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.point_events (user_id, amount, reason, source, event_id)
  select pe.user_id, -sum(pe.amount), 'Etkinlik iptal edildi: puanlar geri alındı', 'event_reversal', p_event
    from public.point_events pe
   where pe.event_id = p_event
     and pe.source in ('event_create', 'event_attend', 'event_host', 'event_team', 'event_rate', 'event_rated')
     and (p_all or pe.user_id = p_host)
   group by pe.user_id
  having sum(pe.amount) <> 0;
end $$;

-- Etkinliği açan (ya da moderatörün etkinliğinde herhangi bir moderatör) mi?
create or replace function public._is_event_host(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event
       and (e.created_by = p_user
            or (exists (select 1 from public.profiles u where u.id = p_user and u.role = 'admin')
                and (e.created_by is null
                     or exists (select 1 from public.profiles h where h.id = e.created_by and h.role = 'admin')))));
$$;

-- Katılım kodunu etkinliği açan kişi görür (başkası göremez)
create or replace function public.my_event_code(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if not exists (select 1 from public.events where id = p_event_id) then raise exception 'event_not_found'; end if;
  if not public._is_event_host(p_event_id, v.id) then raise exception 'forbidden'; end if;
  return (select c.code from public.event_codes c where c.event_id = p_event_id);
end $$;

-- Kod başkasına sızdıysa yenilenir (eski kod geçersiz olur; kod denemeleri sıfırlanır)
create or replace function public.regenerate_event_code(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_code text := public._random_code(6);
begin
  v := public._require_user();
  if not exists (select 1 from public.events where id = p_event_id and not is_cancelled) then
    raise exception 'event_not_found';
  end if;
  if not public._is_event_host(p_event_id, v.id) then raise exception 'forbidden'; end if;
  insert into public.event_codes (event_id, code) values (p_event_id, v_code)
  on conflict (event_id) do update set code = excluded.code;
  delete from public.event_code_failures where event_id = p_event_id;
  return v_code;
end $$;

-- Katılım puanı, etkinlikte doğrulanan kişi sayısına göre (kalabalık etkinlik daha çok puan getirir):
-- 4–9 kişi pts_event_attend (30) · 10–19 pts_event_attend_10 (35) · 20–39 pts_event_attend_20 (40) · 40+ pts_event_attend_40 (50).
-- 41. Kat Özel (moderatör) etkinliklerde her basamağa pts_event_attend_official_bonus (10) eklenir.
create or replace function public._event_attend_pts(p_count int, p_official boolean)
returns int language sql stable set search_path = public as $$
  select (case when p_count >= 40 then public.setting_int('pts_event_attend_40', 50)
               when p_count >= 20 then public.setting_int('pts_event_attend_20', 40)
               when p_count >= 10 then public.setting_int('pts_event_attend_10', 35)
               else public.setting_int('pts_event_attend', 30) end)
         + (case when p_official then public.setting_int('pts_event_attend_official_bonus', 10) else 0 end);
$$;

-- Bir etkinlikte kodla ve konumla doğrulanan katılımcı sayısı eşiğe (pts_event_min_attendees, varsayılan 4) ulaşınca,
-- bekleyen katılım puanları ve düzenleyen puanları açılır. Eşikten sonra gelenler anında alır. Etkinlik başına
-- kişi sınırı, aynı kişiden 30 günde bir kuralı ve düzenleyenin aylık tavanı korunur; katılana aylık sınır YOKTUR.
create or replace function public._release_event_points(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ev public.events;
  v_host public.profiles;
  v_has_host boolean;
  v_gives boolean;
  v_official boolean;
  v_pts int;
  v_hpts int;
  v_room int;
  v_skip text;
  v_cat_daily int := public.setting_int('pts_event_attend_category_daily', 1);
  v_host_days int := public.setting_int('pts_event_attend_host_days', 2);
  v_count int;
  v_tier int;
  r record;
begin
  select * into v_ev from public.events where id = p_event_id and not is_cancelled;
  if not found then return; end if;
  -- Aynı etkinlikte aynı anda iki doğrulama gelirse puan basamağı iki kez yazılmasın
  perform pg_advisory_xact_lock(hashtext('event_points:' || p_event_id::text));
  select count(*)::int into v_count from public.event_registrations
   where event_id = p_event_id and checked_in_at is not null;
  if v_count < greatest(1, public.setting_int('pts_event_min_attendees', 4)) then
    return;
  end if;
  v_gives := v_ev.fee_amount <= 0 or public.setting_bool('pts_paid_events');
  v_official := v_ev.created_by is null
                or exists (select 1 from public.profiles h where h.id = v_ev.created_by and h.role = 'admin');
  select * into v_host from public.profiles where id = v_ev.created_by;
  v_has_host := found;
  v_tier := public._event_attend_pts(v_count, v_official);

  -- Kalabalık basamağı yükseldiyse daha önce puan alanlara aradaki fark yazılır (herkes son kalabalığın puanını alır).
  -- Yalnızca bu etkinlikten katılım puanı almış olanlar (günlük/kategori kuralına takılanlar almaz).
  if v_gives then
    for r in
      select er.user_id, er.attend_points
        from public.event_registrations er join public.profiles pr on pr.id = er.user_id
       where er.event_id = p_event_id and er.attend_rewarded and er.attend_points > 0
         and er.attend_points < v_tier and pr.role = 'user'
         for update of er
    loop
      perform public._award_points(r.user_id, v_tier - r.attend_points, 'event_attend',
        'Kalabalık etkinlik (' || v_count || ' kişi): ' || left(v_ev.title, 40), p_event_id);
      update public.event_registrations set attend_points = v_tier
       where event_id = p_event_id and user_id = r.user_id;
    end loop;
  end if;

  for r in
    select er.user_id, er.checked_in_at, pr.role
      from public.event_registrations er join public.profiles pr on pr.id = er.user_id
     where er.event_id = p_event_id and er.checked_in_at is not null and not er.attend_rewarded
     order by er.checked_in_at, er.user_id
       for update of er
  loop
    update public.event_registrations set attend_rewarded = true
     where event_id = p_event_id and user_id = r.user_id;
    if not v_gives then continue; end if;

    -- Katılana puan (moderatör sıralamada olmadığı için almaz). İki kural puanı kısar, ikisi de sunucuda uygulanır:
    --   1) Günde (Türkiye saati) her kategoriden en çok pts_event_attend_category_daily etkinlikten puan alınır.
    --   2) Aynı üyenin düzenlediği etkinliklerden pts_event_attend_host_days günde bir puan alınır (41. Kat Özel hariç).
    -- Böylece aynı kalabalığın kendi aralarında art arda etkinlik açıp puan toplaması kapanır. Puan verilmeyen katılımda
    -- düzenleyen de o katılımdan puan almaz (yoksa düzenleyen için aynı hile sürerdi).
    v_skip := null;
    if r.role = 'user' then
      if v_cat_daily > 0
         and (select count(*) from public.event_registrations x
                join public.events xe on xe.id = x.event_id
               where x.user_id = r.user_id and x.event_id <> p_event_id and x.attend_points > 0
                 and not xe.is_cancelled and xe.category = v_ev.category
                 and (x.checked_in_at at time zone 'Europe/Istanbul')::date
                     = (r.checked_in_at at time zone 'Europe/Istanbul')::date) >= v_cat_daily then
        v_skip := 'category_daily';
      elsif not v_official and v_host_days > 0
         and exists (select 1 from public.event_registrations x
                       join public.events xe on xe.id = x.event_id
                      where x.user_id = r.user_id and x.event_id <> p_event_id and x.attend_points > 0
                        and not xe.is_cancelled and xe.created_by = v_ev.created_by
                        and x.checked_in_at between r.checked_in_at - make_interval(days => v_host_days)
                                                and r.checked_in_at + make_interval(days => v_host_days)) then
        v_skip := 'host_cooldown';
      end if;
    end if;

    if r.role = 'user' and v_skip is null then
      v_pts := v_tier;
      perform public._award_points(r.user_id, v_pts, 'event_attend',
        'Etkinliğe katıldın: ' || left(v_ev.title, 40), p_event_id);
      update public.event_registrations set attend_points = v_pts
       where event_id = p_event_id and user_id = r.user_id;
    elsif v_skip is not null then
      update public.event_registrations set attend_note = v_skip
       where event_id = p_event_id and user_id = r.user_id;
      continue; -- düzenleyen de bu katılımdan puan almaz
    end if;

    -- Düzenleyene puan: etkinlik başına kişi sınırı, aynı kişiden 30 günde bir, düzenleyenin aylık sınırı
    if v_has_host and v_host.role = 'user' and v_host.banned_at is null
       and (select count(*) from public.event_registrations x where x.event_id = p_event_id and x.host_rewarded)
           < public.setting_int('pts_event_host_attendee_cap', 25)
       and not exists (
         select 1 from public.event_registrations r2 join public.events e2 on e2.id = r2.event_id
          where r2.user_id = r.user_id and e2.created_by = v_host.id and r2.host_rewarded
            and r2.checked_in_at > now() - make_interval(days => public.setting_int('pts_pair_cooldown_days', 30))) then
      v_room := greatest(0, public.setting_int('pts_event_host_month_cap', 200)
                - coalesce((select sum(pe.amount) from public.point_events pe
                             where pe.user_id = v_host.id and pe.source = 'event_host'
                               and pe.created_at >= public._month_start()), 0)::int);
      v_hpts := least(public.setting_int('pts_event_host_per_attendee', 8), v_room);
      if v_hpts > 0 then
        perform public._award_points(v_host.id, v_hpts, 'event_host',
          'Etkinliğine katılım doğrulandı: ' || left(v_ev.title, 40), p_event_id);
        update public.event_registrations set host_rewarded = true
         where event_id = p_event_id and user_id = r.user_id;
      end if;
    end if;
  end loop;
end $$;

-- Katılımı koddan ve konumdan doğrula. Kayıtlı olmak, kodu bilmek, doğru zaman aralığında olmak ve etkinliğin
-- bulunduğu bölgede (en çok 1 petek uzakta) görünmek gerekir. Telefon yalnızca bulunduğu peteğin numarasını yollar.
-- Doğru kod ama konum yoksa 'location_required', etkinlik bölgesinden uzaksa 'too_far' hatası gelir (kayıt yapılmaz).
-- Yanlış kod hata fırlatmaz ({ok:false}) ki deneme kaydı silinmesin; 10 dakikada 8 yanlıştan sonra 'too_many_attempts'.
-- Puan: yeterli kişi doğrulanınca açılır (cevapta: verified = doğrulanan kişi, needed = gereken, points = senin puanın).
drop function if exists public.verify_event_attendance(uuid, text);
create or replace function public.verify_event_attendance(
  p_event_id uuid, p_code text, p_cell_q int default null, p_cell_r int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_ev public.events;
  v_reg public.event_registrations;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_real text;
  v_needed int := greatest(1, public.setting_int('pts_event_min_attendees', 4));
  v_verified int;
  v_pts int;
  v_note text;
begin
  v := public._require_user();
  select * into v_ev from public.events where id = p_event_id and not is_cancelled;
  if not found then raise exception 'event_not_found'; end if;
  if v_ev.created_by is not distinct from v.id then raise exception 'host_cannot_checkin'; end if;
  select * into v_reg from public.event_registrations
   where event_id = p_event_id and user_id = v.id for update;
  if not found then raise exception 'not_registered'; end if;
  if v_reg.checked_in_at is not null then
    select count(*)::int into v_verified from public.event_registrations
     where event_id = p_event_id and checked_in_at is not null;
    return jsonb_build_object('ok', true, 'already', true, 'points', 0, 'verified', v_verified,
                              'needed', v_needed, 'released', v_reg.attend_rewarded, 'note', v_reg.attend_note);
  end if;
  if now() < v_ev.starts_at - make_interval(mins => public.setting_int('event_checkin_open_minutes_before', 60)) then
    raise exception 'checkin_not_open';
  end if;
  if v_ev.closed_at is not null or now() > public._event_checkin_end(v_ev.starts_at, v_ev.category) then
    raise exception 'checkin_closed';
  end if;

  delete from public.event_code_failures where failed_at < now() - interval '1 day';
  if (select count(*) from public.event_code_failures f
       where f.user_id = v.id and f.event_id = p_event_id and f.failed_at > now() - interval '10 minutes') >= 8 then
    raise exception 'too_many_attempts';
  end if;
  select c.code into v_real from public.event_codes c where c.event_id = p_event_id;
  if v_real is null or length(v_code) <> length(v_real) or v_code <> v_real then
    insert into public.event_code_failures (user_id, event_id) values (v.id, p_event_id);
    return jsonb_build_object('ok', false, 'reason', 'wrong_code');
  end if;

  -- Konum doğrulaması: kod doğruysa telefonun bulunduğu petek istenir ve etkinliğin peteğine yakın olmalı
  if public.setting_bool('event_checkin_location_required') then
    if not public._game_cell_given(p_cell_q, p_cell_r) then raise exception 'location_required'; end if;
    if v_ev.cell_q is not null
       and public._hex_dist(p_cell_q, p_cell_r, v_ev.cell_q, v_ev.cell_r)
           > public.setting_int('event_checkin_max_cell_distance', 1) then
      raise exception 'too_far';
    end if;
  end if;

  -- Paket 24: bir üye aynı gün (Türkiye saati) aynı petekte yalnızca bir etkinliğe katılım doğrulayabilir
  if v_ev.cell_q is not null and exists (
       select 1 from public.event_registrations x join public.events xe on xe.id = x.event_id
        where x.user_id = v.id and x.event_id <> p_event_id and x.checked_in_at is not null
          and not xe.is_cancelled and xe.cell_q = v_ev.cell_q and xe.cell_r = v_ev.cell_r
          and (x.checked_in_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date) then
    raise exception 'same_cell_today';
  end if;

  update public.event_registrations set checked_in_at = now()
   where event_id = p_event_id and user_id = v.id;
  perform public._release_event_points(p_event_id);
  -- Ekipçe gelenlere ekip bonusu (katılım puanı yazıldıysa)
  perform public._award_team_bonus(p_event_id);
  -- Telefonun bildirdiği petek Kocaeli içindeyse haritaya sayılır (petekteki kişi sayısı ve yoğunluk; kim olduğu görünmez)
  if public._game_cell_given(p_cell_q, p_cell_r) and public._map_cell_ok(p_cell_q, p_cell_r) then
    perform public._map_cleanup();
    insert into public.map_signals (user_id, q, r, source, event_id, day)
    values (v.id, p_cell_q, p_cell_r, 'event', p_event_id, public._map_day())
    on conflict do nothing;
  end if;

  select count(*)::int into v_verified from public.event_registrations
   where event_id = p_event_id and checked_in_at is not null;
  -- Paket 27: doğrulanan sayısı eşiğe ulaşınca düzenleyene haber (etkinlik çekilişi; oyunluysa etkinlik oyunu)
  if v_verified = v_needed and v_ev.created_by is not null then
    perform public._notify(v_ev.created_by, 'system', 'Etkinlik çekilişini açabilirsin',
      '“' || v_ev.title || '” etkinliğinde ' || v_needed || ' kişi katılımını doğruladı. Oyunlar > Çekiliş’ten etkinlik '
        || 'çekilişini açabilirsin.'
        || case when v_ev.with_games then ' Etkinlik başlayınca Etkinlikler sekmesinden etkinlik oyunu da açabilirsin.'
                else '' end,
      jsonb_build_object('event_id', p_event_id, 'route', '/cekilis'));
  end if;
  -- Etkinlikte açık bir oyun ya da çekiliş odası varsa kodu yeni doğrulanan katılımcıya da gider
  declare
    rr record;
  begin
    for rr in
      select gr.id, gr.game_type, c.code from public.game_rooms gr join public.room_codes c on c.room_id = gr.id
       where gr.event_id = p_event_id and gr.status = 'lobby'
    loop
      perform public._notify(v.id, 'system',
        case when rr.game_type = 'raffle' then 'Etkinlik çekilişi açık' else 'Etkinlik oyunu açık' end,
        '“' || v_ev.title || '” etkinliğinde ' ||
          coalesce((select gt.title from public.game_types gt where gt.key = rr.game_type), rr.game_type) ||
          ' odası açık. Oda kodu: ' || rr.code || ' · Kodu kopyalayıp Oyunlar > Kodla katıl’a yaz.',
        jsonb_build_object('code', rr.code, 'room_id', rr.id, 'event_id', p_event_id, 'game', rr.game_type,
                           'route', '/acik-odalar'));
    end loop;
  end;
  select er.attend_points, er.attend_note into v_pts, v_note
    from public.event_registrations er where er.event_id = p_event_id and er.user_id = v.id;
  return jsonb_build_object('ok', true, 'already', false, 'points', coalesce(v_pts, 0), 'verified', v_verified,
                            'needed', v_needed, 'released', v_verified >= v_needed, 'note', v_note);
end $$;

-- Etkinlik beğenisi (aç/kapat)
create or replace function public.toggle_event_like(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if not exists (select 1 from public.events where id = p_event_id and not is_cancelled) then
    raise exception 'event_not_found';
  end if;
  delete from public.event_likes where event_id = p_event_id and user_id = v.id;
  if found then return false; end if;
  insert into public.event_likes (event_id, user_id) values (p_event_id, v.id);
  return true;
end $$;

-- Etkinlik yorumu: GERÇEK AD ile görünür (uygulama yazmadan önce uyarır). Moderatör "41. Kat Sosyal" görünür.
create or replace function public.add_event_comment(p_event_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  v := public._require_writer(null);
  if char_length(v_body) not between 1 and 300 then raise exception 'invalid_body'; end if;
  if not exists (select 1 from public.events where id = p_event_id and not is_cancelled) then
    raise exception 'event_not_found';
  end if;
  if (select count(*) from public.event_comments c
       where c.user_id = v.id and c.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into public.event_comments (event_id, user_id, body) values (p_event_id, v.id, v_body)
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.list_event_comments(uuid);
create or replace function public.list_event_comments(p_event_id uuid)
returns table (
  id uuid, event_id uuid, author_name text, is_official boolean, body text,
  is_hidden boolean, created_at timestamptz, is_mine boolean, author_title text, sponsor_id uuid
)
language sql stable security definer set search_path = public as $$
  with ct as materialized (select * from public._champion_titles())
  select c.id, c.event_id,
         case when pr.role = 'admin' then '41. Kat Sosyal' else pr.full_name end,
         (pr.role = 'admin'),
         c.body, c.is_hidden, c.created_at, (c.user_id = auth.uid()),
         public._title_join((select array_agg(t.label order by t.sort_order) from ct t where t.user_id = c.user_id)),
         case when pr.role::text = 'sponsor' then pr.id end
    from public.event_comments c
    join public.profiles pr on pr.id = c.user_id
   where public._is_active_user()
     and c.event_id = p_event_id
     and exists (select 1 from public.events e where e.id = p_event_id and not e.is_cancelled)
     and (public.is_admin()
          or (not c.is_hidden
              and not exists (select 1 from public.user_blocks b
                               where b.blocker_id = auth.uid() and b.blocked_id = c.user_id)))
   order by c.created_at asc
   limit 300;
$$;

create or replace function public.delete_my_event_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.event_comments where id = p_comment_id and user_id = v.id;
  if not found then raise exception 'comment_not_found'; end if;
end $$;

-- Konuşma balonları: hangileri açık, hangisi seçili
drop function if exists public.my_bubble_skins();
create or replace function public.my_bubble_skins()
returns table (key text, label text, game_type text, required_plays int, plays int, unlocked boolean, selected boolean)
language sql stable security definer set search_path = public as $$
  select b.key, b.label, b.game_type, b.required_plays,
         coalesce(s.plays, 0),
         (case when b.required_reward is not null then public._has_reward(p.id, b.required_reward)
               else (b.required_plays = 0 or coalesce(s.plays, 0) >= b.required_plays) end),
         (p.bubble_skin = b.key)
    from public.bubble_skins b
    join public.profiles p on p.id = auth.uid()
    left join public.user_game_stats s on s.user_id = p.id and s.game_type = b.game_type
   where public._is_active_user()
   order by b.sort_order;
$$;

-- Balon seç: yalnızca kazandığın (oyunun en yüksek başarımına ulaştığın) balon seçilebilir
create or replace function public.set_bubble_skin(p_skin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_skin public.bubble_skins;
begin
  v := public._require_user();
  select * into v_skin from public.bubble_skins where key = p_skin;
  if not found then raise exception 'skin_not_found'; end if;
  if v_skin.required_reward is not null then
    if not public._has_reward(v.id, v_skin.required_reward) then raise exception 'skin_locked'; end if;
  elsif v_skin.required_plays > 0
     and coalesce((select s.plays from public.user_game_stats s
                    where s.user_id = v.id and s.game_type = v_skin.game_type), 0) < v_skin.required_plays then
    raise exception 'skin_locked';
  end if;
  update public.profiles set bubble_skin = v_skin.key where id = v.id;
end $$;

-- Oyuna özel sıralama (yalnızca görsel; para ya da hediye ödülü yoktur, çekiliş yoktur). Her ay sıfırdan başlar.
-- Oyun puanı = o ay o oyundan hesaba yazılan puanların toplamı (oyuncu sayısı ve sıraya göre; hak sınırları geçerli).
-- p_months_ago: 0 = bu ay (haftada bir güncellenir), 1 = geçen ay (kesin; ayın 1.'si ertesi ay ünvan alır).
-- Tabloyu yenileyebildiği için "volatile"dır.
drop function if exists public.get_game_leaderboard(text, int);
drop function if exists public.get_game_leaderboard(text, int, int);
create or replace function public.get_game_leaderboard(p_game text, p_limit int default 50, p_months_ago int default 0)
returns table (place bigint, full_name text, plays int, wins int, score numeric, level int, is_premium boolean, is_me boolean, title text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ago int := greatest(0, least(coalesce(p_months_ago, 0), 24));
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public._is_active_user() then return; end if;
  -- Yalnızca gerçek oyunlar: rastgele bir ad gönderilip tabloya sahte kayıt açılamaz
  if p_game is null or p_game = 'raffle'
     or not exists (select 1 from public.game_types gt where gt.key = p_game) then
    return;
  end if;

  if v_ago = 0 and public.setting_bool('rank_weekly_refresh') then
    perform public._ensure_rank_snapshot('game:' || p_game);
    return query
    with ct as materialized (select * from public._champion_titles())
    select s.place::bigint, pr.full_name, s.plays, s.wins, s.score,
           coalesce((select max(l.level) from public.levels l where l.min_points <= pr.points), 1),
           (pr.premium_until is not null and pr.premium_until > now()),
           (pr.id = auth.uid()),
           public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = pr.id))
      from public.rank_snapshots s
      join public.profiles pr on pr.id = s.user_id
     where s.kind = 'game:' || p_game and pr.banned_at is null and pr.role = 'user'
       and (s.place <= v_lim or pr.id = auth.uid())
     order by s.place, pr.full_name;
    return;
  end if;

  return query
  with ct as materialized (select * from public._champion_titles()),
  w as (
    select date_trunc('month', (now() at time zone 'Europe/Istanbul') - make_interval(months => v_ago)) as local_start
  ), b as (
    select w.local_start at time zone 'Europe/Istanbul' as s,
           (w.local_start + interval '1 month') at time zone 'Europe/Istanbul' as e
      from w
  ), m as (
    select gl.user_id, sum(gl.points) as score, count(*)::int as plays,
           sum(case when gl.won then 1 else 0 end)::int as wins
      from public.game_play_log gl, b
     where gl.game_type = p_game and gl.created_at >= b.s and gl.created_at < b.e
     group by gl.user_id
  ), t as (
    select dense_rank() over (order by m.score desc) as place, pr.id as uid, pr.full_name as fname,
           m.plays, m.wins, m.score,
           coalesce((select max(l.level) from public.levels l where l.min_points <= pr.points), 1) as lvl,
           (pr.premium_until is not null and pr.premium_until > now()) as prem,
           (pr.id = auth.uid()) as me
      from m
      join public.profiles pr on pr.id = m.user_id
     where pr.banned_at is null and pr.role = 'user'
  )
  select t.place, t.fname, t.plays, t.wins, t.score, t.lvl, t.prem, t.me,
         public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = t.uid))
    from t
   where t.place <= v_lim or t.me
   order by t.place, t.fname;
end $$;

-- Sıralama ekranının üstündeki bilgi: tablo ne zaman güncellendi / ne zaman yenilenecek, ay ne zaman biter ve benim bu ayki puanım.
-- (Puanlar hesaba anında yazılır; yalnızca sıralama tablosu haftada bir güncellenir.)
drop function if exists public.ranking_info();
create or replace function public.ranking_info()
returns table (weekly boolean, as_of timestamptz, next_at timestamptz, month_start timestamptz, month_end timestamptz,
               my_points numeric, my_place int)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_w boolean := public.setting_bool('rank_weekly_refresh');
begin
  if not public._is_active_user() then return; end if;
  if v_w then perform public._ensure_rank_snapshot('points'); end if;
  return query
  select v_w,
         (case when v_w then public._rank_boundary() else now() end),
         (case when v_w then public._rank_next() else null::timestamptz end),
         public._month_start(),
         ((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month') at time zone 'Europe/Istanbul'),
         coalesce((select sum(pe.amount) from public.point_events pe
                    where pe.user_id = auth.uid() and pe.created_at >= public._month_start()), 0),
         (select s.place from public.rank_snapshots s where v_w and s.kind = 'points' and s.user_id = auth.uid());
end $$;

-- Benim geçerli ünvanlarım (profilde gösterilir)
drop function if exists public.my_titles();
create or replace function public.my_titles()
returns table (game_type text, label text, valid_until timestamptz, score numeric, plays int)
language sql stable security definer set search_path = public as $$
  select c.game_type, c.label, c.valid_until, c.score, c.plays
    from public._champion_titles() c
   where c.user_id = auth.uid() and public._is_active_user()
   order by c.sort_order;
$$;

-- Bir oyunun şu anki şampiyonu (oyun sıralaması ekranında gösterilir). Yoksa satır dönmez.
drop function if exists public.get_game_champion(text);
create or replace function public.get_game_champion(p_game text)
returns table (full_name text, label text, valid_until timestamptz, score numeric, plays int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select pr.full_name, c.label, c.valid_until, c.score, c.plays, (pr.id = auth.uid())
    from public._champion_titles() c
    join public.profiles pr on pr.id = c.user_id
   where c.game_type = p_game and public._is_active_user();
$$;

-- Bu ay hangi kaynaktan kaç puan kazandım? (ekranda "Puan geçmişim" için)
drop function if exists public.my_points_this_month();
create or replace function public.my_points_this_month()
returns table (source text, points numeric, entries int)
language sql stable security definer set search_path = public as $$
  select pe.source, sum(pe.amount), count(*)::int
    from public.point_events pe
   where pe.user_id = auth.uid() and public._is_active_user() and pe.created_at >= public._month_start()
   group by pe.source
   order by 2 desc;
$$;

-- Eski etkinliklerin katılım kodu yoksa üretilir (tekrar çalıştırmak güvenlidir)
insert into public.event_codes (event_id, code)
select e.id, public._random_code(6) from public.events e
 where not exists (select 1 from public.event_codes c where c.event_id = e.id);

-- Puan ayarları (moderatör SQL ile değiştirebilir; yoksa varsayılan kullanılır)
insert into public.app_settings (key, value, description) values
  ('pts_event_create', '15', 'Puan: etkinlik açana (etkinlik iptal edilirse geri alınır)'),
  ('pts_event_attend', '30', 'Puan: KODLA doğrulanmış katılım, 4–9 kişilik etkinlik (kalabalık etkinlik daha çok puan getirir)'),
  ('pts_event_attend_10', '35', 'Puan: doğrulanmış katılım, 10–19 kişilik etkinlik'),
  ('pts_event_attend_20', '40', 'Puan: doğrulanmış katılım, 20–39 kişilik etkinlik'),
  ('pts_event_attend_40', '50', 'Puan: doğrulanmış katılım, 40 ve üstü kişilik etkinlik'),
  ('pts_event_attend_official_bonus', '10', 'Puan: 41. Kat Sosyal (moderatör) etkinliklerinde her basamağa eklenen katılım puanı'),
  ('pts_event_min_attendees', '4', 'Bir etkinlikten puan açılması için kodla ve konumla doğrulanması gereken en az katılımcı sayısı (etkinlik kontenjanı da en az bu kadar olmalı)'),
  ('event_checkin_location_required', 'true', 'Etkinlik katılımı kodun yanında konumla da doğrulansın mı? (telefon yalnızca bulunduğu bölge numarasını yollar)'),
  ('event_checkin_max_cell_distance', '1', 'Katılımcının bölgesi etkinliğin bölgesinden en çok kaç petek uzakta olabilir? (0 = aynı petek)'),
  ('pts_event_host_per_attendee', '10', 'Puan: etkinliğine doğrulanan her katılımcı için düzenleyene'),
  ('pts_event_host_attendee_cap', '25', 'Bir etkinlikte düzenleyene puan getiren en çok katılımcı sayısı'),
  ('pts_event_host_month_cap', '250', 'Düzenleyenin katılımcılardan ayda en çok kazanabileceği puan (abone ile ücretsiz üye eşit olsun diye tek etkinliğin tavanı)'),
  ('pts_event_create_month_events', '1', 'Ayda en çok kaç etkinlik açmaktan puan alınır (aboneler de dahil, herkes için aynı)'),
  ('pts_paid_events', 'false', 'Ücretli etkinlikler puan getirir mi? (kapalıyken para ödemek hediye şansı vermez: mağaza kuralları için önerilen)'),
  ('pts_pair_cooldown_days', '30', 'Aynı kişi aynı düzenleyenin puanına kaç günde bir katkı verebilir'),
  ('pts_game_top_cap', '24', 'Yan yana oyunlarda 1. sıranın alacağı EN YÜKSEK puan. 1. sıra = oyuncu sayısı × (1 + 0,1 × (oyuncu − 4)) bu sınıra kadar; sıra ilerledikçe azalır, en az 1'),
  ('pts_game_min_players', '4', 'Yan yana oyunda puan için gereken en az oyuncu sayısı (moderatör hariç)'),
  ('pts_game_daily_cap', '5', 'KULLANILMIYOR: yan yana oyunlarda günlük puan sınırı yoktur'),
  ('event_raffle_max', '5', 'Bir etkinlikte düzenleyenin açabileceği en çok çekiliş sayısı'),
  ('pts_game_month_cap', '15', 'KULLANILMIYOR: yan yana oyunlarda aylık puan sınırı yoktur'),
  ('pts_quiz_top_cap', '3', 'Bilgi Yarışması: 1. sıranın alacağı en yüksek puan (uzaktan oynandığı için az)'),
  ('pts_quiz_min_players', '2', 'Bilgi Yarışması: başlamak ve puan almak için gereken en az oyuncu sayısı'),
  ('pts_quiz_daily_cap', '3', 'Günde en çok kaç Bilgi Yarışması oyunundan puan alınır'),
  ('pts_quiz_month_cap', '10', 'Ayda en çok kaç Bilgi Yarışması oyunundan puan alınır'),
  ('event_checkin_open_minutes_before', '60', 'Katılım kodu girişi etkinlikten kaç dakika önce açılır'),
  ('event_duration_hours', '3', 'Etkinlik başladıktan kaç saat sonra kapanır? Kapanan etkinlik listeden kalkar; kayıt ve katılım kodu girişi biter.'),
  ('event_close_request_min_checkins', '1', 'Kodla doğrulanmış kaç katılımcıdan sonra düzenleyen etkinliği kendisi kapatamaz, moderatöre talep gönderir?'),
  ('pts_event_attend_category_daily', '1', 'Bir üye aynı gün (Türkiye saati) aynı kategorideki en çok kaç etkinlikten katılım puanı alır? (0 = sınırsız)'),
  ('pts_event_attend_host_days', '2', 'Bir üye aynı üyenin düzenlediği etkinliklerden kaç günde bir katılım puanı alır? (0 = sınırsız; 41. Kat Özel etkinlikler hariç)'),
  ('contest_active', 'false', 'Aylık hediye programı açık mı? (Yarışma kuralları metni doldurulmadan AÇMA)'),
  ('contest_organizer', '""', 'Hediye programını düzenleyen kişi ya da şirketin adı (kurallar ekranında görünür)'),
  ('contest_contact', '""', 'Hediye programı için iletişim e-postası (kurallar ekranında görünür)'),
  ('contest_prizes', '""', 'Bu dönemin hediyeleri, 1. 2. 3. için kısa metin (kurallar ekranında görünür)'),
  ('contest_award_days', '15', 'Hediyeler dönem bittikten en geç kaç gün içinde duyurulur ve verilir')
on conflict (key) do nothing;

-- Eski sabit oyun puanı ayarları artık kullanılmaz (puan oyuncu sayısı ve sıraya göre hesaplanır)
delete from public.app_settings where key in ('pts_game_play', 'pts_game_win', 'pts_event_attend_month_events', 'event_checkin_open_hours_after',
                                             'pts_event_attend_official');
-- Ayar açıklamaları güncel kalsın (değerlere dokunmaz)
update public.app_settings set description = 'Yan yana oyunlarda 1. sıranın alacağı EN YÜKSEK puan. 1. sıra = oyuncu sayısı × (1 + 0,1 × (oyuncu − 4)) bu sınıra kadar; sıra ilerledikçe azalır, en az 1'
 where key = 'pts_game_top_cap';
update public.app_settings set description = 'Puan: KODLA doğrulanmış katılım, 4–9 kişilik etkinlik (kalabalık etkinlik daha çok puan getirir)'
 where key = 'pts_event_attend';

-- ---------------------------------------------------------------------
-- 5d) Harita ve yer seçme
--     Ham konum sunucuya HİÇ gelmez: telefon bulunduğu peteğin numarasını (q, r) hesaplar, yalnızca onu yollar.
-- ---------------------------------------------------------------------

-- İlçenin son sıfırlanma anı: o ilçenin haftalık gününün (reset_dow) en son 00:00'ı (Türkiye saati)
create or replace function public._district_reset_at(p_dow int)
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Europe/Istanbul')
          - make_interval(days => ((extract(isodow from now() at time zone 'Europe/Istanbul')::int
                                    - greatest(1, least(coalesce(p_dow, 1), 7)) + 7) % 7)))
         at time zone 'Europe/Istanbul';
$$;
