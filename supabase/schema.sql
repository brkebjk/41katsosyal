-- =====================================================================
-- 41.Kat veritabanı şeması (Supabase / PostgreSQL)
--
-- Nasıl çalıştırılır: Supabase panelinde SQL Editor > New query > bu dosyanın
-- tamamını yapıştır > Run. Hata alırsan hatayı bana ilet; dosya tekrar
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
                         'vv_dead', 'dm'));

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
create or replace function public._session_ok(p_active uuid)
returns boolean language sql stable set search_path = public as $$
  select p_active is null
      or nullif(auth.jwt() ->> 'session_id', '') is null
      or p_active::text = (auth.jwt() ->> 'session_id');
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
alter table public.profiles drop constraint if exists profiles_photo_status_check;
alter table public.profiles add constraint profiles_photo_status_check
  check (photo_status is null or photo_status in ('pending', 'approved', 'rejected'));

-- Kişinin herkese gösterilebilecek profil resmi (onaylı, doğrulanmış, banlı değil); yoksa boş.
-- Çağıran fonksiyon yalnızca gerçek adın gösterildiği durumda kullanır.
create or replace function public._photo_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select pr.photo_path from public.profiles pr
   where pr.id = p_user and pr.photo_status = 'approved' and pr.identity_verified_at is not null
     and pr.banned_at is null;
$$;

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
  if r.game_type = 'vampire_villager' and v_winner is null then return; end if;
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
           case when r.game_type = 'vampire_villager' and p.alive then 1 else 0 end as k2,
           case when r.game_type = 'vampire_villager' then p.outat end as k3
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
              else q.rnk = 1 and q.n >= 2 end
    from q;
end $$;

-- Bir oda "bitti" olunca: (1) odadaki oyuncuların o oyunu oynama sayısı artar (başarımlar için), (2) oyun puanı yazılır.
-- Çekilişte 1, diğer oyunlarda en az 2 üye (moderatör sayılmaz) katılmışsa sayılır. Oyundan ayrılan ya da atılan sayılmaz.
-- Kazananı belli olmayan Vampir–Köylü (oda sahibi erken bitirdi) oynanmış sayılmaz ve puan vermez.
-- Puan: _game_results (oyuncu sayısı ve sıra). Yan yana oyunda en az pts_game_min_players (4), Bilgi Yarışması'nda
-- pts_quiz_min_players (2) kişi gerekir. Günlük ve aylık üst sınırlar iki tür için ayrıdır (quiz_play, game_play).
create or replace function public.record_game_plays()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_players int;
  v_min int := case when new.game_type = 'raffle' then 1 else 2 end;
  v_title text;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_src text := case when new.game_type = 'quiz' then 'quiz_play' else 'game_play' end;
  v_min_pts int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_min_players', 2)
                        else public.setting_int('pts_game_min_players', 4) end;
  v_daily int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_daily_cap', 3)
                      else public.setting_int('pts_game_daily_cap', 5) end;
  v_month int := case when new.game_type = 'quiz' then public.setting_int('pts_quiz_month_cap', 10)
                      else public.setting_int('pts_game_month_cap', 12) end;
  v_rated boolean;
  v_pts numeric;
  v_ach jsonb;
  v_mult boolean;
  r record;
  g record;
begin
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

    -- Günlük ve aylık üst sınır: aynı arkadaşlarla sürekli oyun açıp puan toplamak sınırlıdır
    if v_rated
       and (select count(*) from public.point_events pe
             where pe.user_id = g.user_id and pe.source = v_src and pe.created_at >= v_today) < v_daily
       and (select count(*) from public.point_events pe
             where pe.user_id = g.user_id and pe.source = v_src and pe.created_at >= public._month_start()) < v_month then
      v_pts := g.points;
      -- Paket 26: Vampir başarım ödülü, Vampir–Köylü puanlarını kalıcı ×1,25 yapar (0,5'e yuvarlanır)
      v_mult := new.game_type = 'vampire_villager' and public._has_reward(g.user_id, 'vv_master');
      if v_mult then v_pts := round(g.points * 1.25 * 2) / 2.0; end if;
      -- Paket 27: etkinlik oyunu (oyunlu etkinlikte açılan oda) puanı 1,25 kat
      if new.event_id is not null and new.game_type not in ('raffle', 'quiz') then
        v_pts := round(v_pts * 1.25 * 2) / 2.0;
      end if;
      insert into public.point_events (user_id, amount, reason, source, room_id)
      values (g.user_id, v_pts,
              coalesce(v_title, new.game_type) || ': ' || g.best_rank || '. sıra, ' || g.players || ' oyuncu'
                || (case when new.game_type <> 'quiz' and g.players > 4 then ' (kalabalık çarpanı)' else '' end)
                || (case when v_mult then ' · Vampir ödülü ×1,25' else '' end)
                || (case when new.event_id is not null and new.game_type not in ('raffle', 'quiz')
                         then ' · Etkinlik oyunu ×1,25' else '' end),
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
                            and pe.source in ('game_play', 'quiz_play')), 0)::numeric;
  v_min := case when r.game_type = 'quiz' then public.setting_int('pts_quiz_min_players', 2)
                else public.setting_int('pts_game_min_players', 4) end;
  return query select g.best_rank, g.players, g.points, v_awarded,
    (case when v_awarded > 0 then 'ok' when g.players < v_min then 'too_few' else 'cap' end)::text;
end $$;

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

drop function if exists public.create_post(text);
drop function if exists public.create_post(text, text);
drop function if exists public.create_post(text, text, uuid);
drop function if exists public.create_post(text, text, uuid, int, int, int, int);
-- Gönderi yaz. p_reply_to verilirse "cevap"tır: cevaplanan gönderinin yazarı etiketlenir (o hafta rumuzu ne olursa
-- olsun). Metindeki "@Lakap#145" ya da "@#145" biçimindeki rumuzlar da bu haftaki sahiplerine etiket olur (en çok 5 kişi;
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
  -- Ağır küfürler ***** olarak kaydedilir
  v_body := left(public._mask_profanity(v_body), 500);
  -- Sponsor hesap gerçek adıyla yazar (rumuz yerine); bu bayrak yazıldığı anki durumu saklar
  insert into public.posts (alias, avatar_index, body, place_id, place_name, place_label, place_district, by_sponsor,
                            reply_to, cell_q, cell_r, thread_root, thread_no)
  values (case when v.role::text = 'sponsor' then v.full_name when v.role = 'admin' and not v.alias_no = any (public._reserved_alias_nos())
               then 'Kat Görevlisi' else v.alias end,
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
      select public._alias_lookup(t.g[1] || '#' || t.g[2])
        from regexp_matches(v_body, '@([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]{0,30})#([0-9]{1,5})', 'g') as t(g)
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
  values (p_post_id, case when v.role::text = 'sponsor' then v.full_name when v.role = 'admin'
                           and not v.alias_no = any (public._reserved_alias_nos()) then 'Kat Görevlisi'
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
                    'vv_dead', 'dm') then
    raise exception 'invalid_type';
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
create or replace function public.join_room(p_code text, p_room_id uuid default null, p_cell_q int default null, p_cell_r int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room public.game_rooms;
  v_max int;
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
  if public._game_needs_location(v_room.game_type) and not public._game_cell_given(p_cell_q, p_cell_r) then
    raise exception 'location_required';
  end if;
  -- Oda bir bölgede açıldıysa katılan kişi de o bölgenin yakınında (en çok game_join_max_cell_distance petek) görünmeli.
  -- Telefonun bildirdiği petek kaba bir kontroldür (tam konum değil); asıl koruma koddur: kodu yalnızca oda sahibi söyler.
  -- Çekilişe haritanın her yerinden katılınabilir (Paket 24); diğer yan yana oyunlarda yakınlık aranır
  if v_room.place_q is not null and v.role <> 'admin' and v_room.game_type <> 'raffle'
     and public._game_cell_given(p_cell_q, p_cell_r)
     and public.setting_int('game_join_max_cell_distance', 1) >= 0
     and public._hex_dist(p_cell_q, p_cell_r, v_room.place_q, v_room.place_r)
         > public.setting_int('game_join_max_cell_distance', 1) then
    raise exception 'room_too_far';
  end if;

  insert into public.room_players (room_id, user_id, display_name)
  values (v_room.id, v.id, v.full_name);

  -- Petek Kocaeli içindeyse kimse görünmeden haritadaki yoğunluğa sayılır (aynı odada bir kez)
  if public._game_cell_given(p_cell_q, p_cell_r)
     and exists (select 1 from public.game_types where key = v_room.game_type and presence_required)
     and public._map_cell_ok(p_cell_q, p_cell_r) then
    perform public._map_cleanup();
    insert into public.map_signals (user_id, q, r, source, room_id, day)
    values (v.id, p_cell_q, p_cell_r, 'game', v_room.id, public._map_day())
    on conflict do nothing;
  end if;
  return v_room.id;
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
                    where pr.photo_status = 'pending' and pr.banned_at is null) else 0 end
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
create or replace function public.create_room(p_game_type text, p_event_id uuid default null, p_mode text default null,
                                              p_cell_q int default null, p_cell_r int default null,
                                              p_place_q int default null, p_place_r int default null,
                                              p_place_note text default null)
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
    if p_event_id is null and exists (select 1 from public.game_types where key = p_game_type and uses_quota) then
      v_credit := public._free_sponsor_credit(v.id);
      if v_credit is null
         and (select count(*) from public.game_rooms gr
               where gr.host_id = v.id and (status <> 'cancelled' or started_at is not null)
                 and gr.created_at >= public._month_start() and gr.event_id is null
                 and exists (select 1 from public.game_types gt where gt.key = gr.game_type and gt.uses_quota)
                 and not exists (select 1 from public.sponsor_credits sc where sc.room_id = gr.id))
             >= v_limit then
        raise exception 'quota_exceeded';
      end if;
    end if;
  end if;

  -- Yan yana oynanan oyunu açarken de (oyuncu olarak girecekse) petek bildirilmek zorunda; konum verilmeden oda açılmaz.
  -- Yalnızca anlatıcı olan moderatör oyuncu sayılmaz, konum istenmez.
  if public._game_needs_location(p_game_type)
     and coalesce(v_mode, '') <> 'narrator'
     and not public._game_cell_given(p_cell_q, p_cell_r) then
    raise exception 'location_required';
  end if;

  -- Bölge ve adres tarifi: Kocaeli karasındaki bir petek + en az 3 karakterlik tarif. Oda sahibi o bölgeye yakın olmalı.
  v_needs_place := public.setting_bool('game_place_required')
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

  insert into public.game_rooms (game_type, event_id, host_id, config, place_q, place_r, place_note)
  values (p_game_type, p_event_id, v.id,
          case when v_mode is null then '{}'::jsonb else jsonb_build_object('mode', v_mode) end,
          case when v_needs_place then p_place_q end, case when v_needs_place then p_place_r end,
          case when v_needs_place then v_note end)
  returning * into v_room;
  if v_credit is not null then
    update public.sponsor_credits set room_id = v_room.id where id = v_credit;
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
  place_q int, place_r int, place_note text
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
         r.place_q, r.place_r, r.place_note
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

  if r.host_id = p_user_id then
    perform public._room_close(p_room_id, p_reason);
    return 'closed';
  end if;

  if r.status = 'lobby' then
    delete from public.room_players where room_id = p_room_id and user_id = p_user_id;
    if found then return 'removed'; end if;
    return null;
  end if;

  update public.room_players
     set is_alive = false, left_at = now(), left_reason = p_reason
   where room_id = p_room_id and user_id = p_user_id and left_at is null;
  if not found then return null; end if;
  if r.game_type = 'vampire_villager' then perform public._vv_after_leave(p_room_id, p_user_id); end if;
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
            where rp.room_id = p_room_id and rp.left_at is null and rp.last_seen_at < v_cut loop
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
    -- Sabah: masadakiler konuşur, süre bitince oylama kendiliğinden başlar
    if v_age >= coalesce((v_t->>'discuss')::int, 120) then perform public._vv_go_vote(p_room_id); end if;

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
  v_n int;
  v_min int;
  v_comp jsonb;
  v_v int;
  v_d int;
  v_t int;
  v_mode text;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'invalid_transition'; end if;

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
    if r.status = 'playing' then
      perform public._vv_auto_tick(p_room_id);
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
    'code', case when r.host_id = auth.uid() then (select c.code from public.room_codes c where c.room_id = r.id) end,
    'round', v_round,
    'winner', r.state->>'winner',
    'composition', coalesce(r.state->'composition', public._vv_composition(v_count)),
    'last_night', r.state->'last_night',
    'last_vote', r.state->'last_vote',
    'players', v_players,
    'host', jsonb_build_object(
      'id', r.host_id,
      'name', case when v_host_role = 'admin' then '41. Kat Sosyal' else v_host_name end,
      'is_moderator', (v_host_role = 'admin'),
      'is_me', (r.host_id = v.id)),
    'mode', v_mode,
    'close_reason', r.state->>'close_reason',
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
drop function if exists public.get_monthly_leaderboard(int);
drop function if exists public.get_monthly_leaderboard(int, int);
create or replace function public.get_monthly_leaderboard(p_limit int default 100, p_months_ago int default 0)
returns table (place bigint, full_name text, points numeric, level int, is_premium boolean, is_me boolean, title text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ago int := greatest(0, least(coalesce(p_months_ago, 0), 24));
  v_lim int := greatest(1, least(coalesce(p_limit, 100), 500));
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
           public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = pr.id))
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
         public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = t.uid))
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
  ('pts_game_daily_cap', '5', 'Günde en çok kaç yan yana oyundan (Vampir–Köylü) puan alınır'),
  ('event_raffle_max', '5', 'Bir etkinlikte düzenleyenin açabileceği en çok çekiliş sayısı'),
  ('pts_game_month_cap', '15', 'Ayda en çok kaç yan yana oyundan puan alınır'),
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

-- Harita açık mı, eşikler neler? (district_resets: ilçe adı ve haftalık sıfırlanma günü, 1 = Pazartesi)
create or replace function public.map_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean := public.is_admin();
begin
  if not public._is_active_user() then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'open', v_admin or public.setting_bool('map_public'),
    'is_public', public.setting_bool('map_public'),
    'is_moderator', v_admin,
    'min_people', greatest(public.setting_int('map_min_people', 5), 1),
    'delay_minutes', greatest(public.setting_int('map_delay_minutes', 60), 0),
    'window_days', 7,
    'presence_open', v_admin or public.setting_bool('map_presence_public'),
    'presence_minutes', greatest(5, least(public.setting_int('map_presence_minutes', 20), 120)),
    'district_resets', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'dow', d.reset_dow) order by d.district)
                                   from public.map_district_reset d), '[]'::jsonb)
  );
end $$;

-- Renkli petekler. Yalnızca "en az N farklı üye" olan petekler gelir (N = map_min_people), gerçek sayı hiç gelmez.
--  - her ilçede yalnızca o ilçenin son haftalık sıfırlanmasından sonraki ve "gecikme" süresinden eski kayıtlar sayılır,
--  - oyun kaydı, aynı odadan başka bir üye aynı ya da komşu petekten bildirmişse sayılır (sahte konuma karşı),
--  - Paket 25: ağırlıklı sayım. Her üye bir petekte en çok 1 sayılır: "Buradayım", yan yana oyun, etkinlik katılımı ve
--    yerli gönderi = 1; yalnızca Bilgi Yarışması oynamak = 0,5 (uzaktan oynanır, orada bulunmak kadar güçlü değil).
--  - seviye: 1 = en az N farklı üye (gizlilik eşiği), 2 = puan map_level2_score (12) ve üstü,
--    3 = puan map_level3_score (25) ve üstü,
--  - en yüksek seviyeye (3) ulaşan peteğin bitişik 6 peteğinin seviyesi 1 artar (en çok 3); yoğun bölge geniş görünür.
create or replace function public.map_density()
returns table (cell_q int, cell_r int, level smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_k int := greatest(public.setting_int('map_min_people', 5), 1);
  v_delay int := greatest(public.setting_int('map_delay_minutes', 60), 0);
begin
  if not public._is_active_user() then raise exception 'not_authenticated'; end if;
  if not (public.is_admin() or public.setting_bool('map_public')) then raise exception 'map_closed'; end if;
  return query
  with rs as (
    select lr.r as rr, lr.q0, lr.q1, public._district_reset_at(coalesce(d.reset_dow, 1)) as since
      from public.map_land_ranges lr
      left join public.map_district_reset d on d.district = lr.district
  ), s as (
    select m.q, m.r, m.user_id, m.room_id, m.source
      from public.map_signals m
      join rs on rs.rr = m.r and m.q between rs.q0 and rs.q1
     where m.created_at >= rs.since
       and m.created_at <= now() - make_interval(mins => v_delay)
  ), ok as (
    select s.q, s.r, s.user_id, (case when s.source = 'quiz' then 0.5 else 1.0 end) as w
      from s
     where s.source <> 'game'
        or exists (select 1 from s o
                    where o.room_id = s.room_id and o.user_id <> s.user_id
                      and public._hex_dist(o.q, o.r, s.q, s.r) <= 1)
  ), per_user as (
    -- Bir üyenin bir petekteki ağırlığı: sinyallerinin en güçlüsü (aynı kişi birden çok sayılmaz)
    select ok.q, ok.r, ok.user_id, max(ok.w) as w from ok group by ok.q, ok.r, ok.user_id
  ), agg as (
    select pu.q, pu.r,
           (case when sum(pu.w) >= greatest(v_k, public.setting_int('map_level3_score', 25)) then 3
                 when sum(pu.w) >= greatest(v_k, public.setting_int('map_level2_score', 12)) then 2 else 1 end) as lvl
      from per_user pu group by pu.q, pu.r
    having count(*) >= v_k and sum(pu.w) >= v_k * 0.5
  ), spread as (
    select agg.q + o.dq as q, agg.r + o.dr as r
      from agg
     cross join (values (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) as o(dq, dr)
     where agg.lvl = 3
  ), allc as (
    select agg.q, agg.r, agg.lvl from agg
    union all
    select sp.q, sp.r, least(3, coalesce((select a2.lvl from agg a2 where a2.q = sp.q and a2.r = sp.r), 0) + 1)
      from (select distinct q, r from spread) sp
     where public._map_cell_ok(sp.q, sp.r)
  )
  select allc.q, allc.r, max(allc.lvl)::smallint
    from allc group by allc.q, allc.r
   order by 1, 2;
end $$;

-- "Buradayım": üye, telefonun bulunduğu peteği haritaya bildirir (uygulama yalnızca gerçekten bulunduğu peteğe izin
-- verir; sunucuya ham konum gelmez). 10 dakikada en çok 1 bildirim. Mekân hesapları bildiremez.
create or replace function public.map_checkin(p_q int, p_r int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_last timestamptz;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if p_q is null or p_r is null or not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  perform 1 from public.profiles where id = v.id for update;
  select max(m.created_at) into v_last from public.map_signals m where m.user_id = v.id and m.source = 'checkin';
  if v_last is not null and v_last > now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'too_soon',
                              'wait_minutes', ceil(extract(epoch from (v_last + interval '10 minutes' - now())) / 60));
  end if;
  perform public._map_cleanup();
  insert into public.map_signals (user_id, q, r, source, day) values (v.id, p_q, p_r, 'checkin', public._map_day());
  return jsonb_build_object('ok', true);
end $$;

-- Petekte son X dakikada (map_presence_minutes, varsayılan 20) konum bildiren üye SAYISI. Kim olduğu gösterilmez.
-- Konum bildirimi, yan yana oyuna giriş ve etkinlik katılım doğrulaması sayılır.
create or replace function public.map_presence(p_q int, p_r int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_min int := greatest(5, least(public.setting_int('map_presence_minutes', 20), 120));
begin
  if not public._is_active_user() then raise exception 'not_authenticated'; end if;
  if not (public.is_admin() or public.setting_bool('map_presence_public')) then raise exception 'presence_closed'; end if;
  if p_q is null or p_r is null or not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  return jsonb_build_object(
    'count', (select count(distinct m.user_id)::int from public.map_signals m
               where m.q = p_q and m.r = p_r and m.source in ('checkin', 'game', 'event')
                 and m.created_at > now() - make_interval(mins => v_min)),
    'minutes', v_min,
    'me', exists (select 1 from public.map_signals m
                   where m.q = p_q and m.r = p_r and m.user_id = auth.uid()
                     and m.source in ('checkin', 'game', 'event')
                     and m.created_at > now() - make_interval(mins => v_min)));
end $$;

-- Moderatörün verdiği petek adları (adı verilmemiş peteklerin adını uygulama üretir)
drop function if exists public.list_cell_names();
create or replace function public.list_cell_names()
returns table (q int, r int, name text)
language sql stable security definer set search_path = public as $$
  select n.q, n.r, n.name from public.map_cell_names n where public._is_active_user() order by n.r, n.q;
$$;

-- Moderatör: peteğe ad ver (küçük harf, kelimeler tireyle: "adalar-sahili"). Boş ad = moderatör adı silinir,
-- petek uygulamanın ürettiği adına döner.
create or replace function public.admin_set_cell_name(p_q int, p_r int, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', '-', 'g')));
begin
  perform public._require_admin();
  if p_q is null or p_r is null or not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  if v_name = '' then
    delete from public.map_cell_names where q = p_q and r = p_r;
  else
    if char_length(v_name) not between 3 and 40
       or v_name !~ '^[a-zçğıöşüâîû0-9]+(-[a-zçğıöşüâîû0-9]+)*$' then
      raise exception 'invalid_cell_name';
    end if;
    if exists (select 1 from public.map_cell_names where name = v_name and not (q = p_q and r = p_r)) then
      raise exception 'cell_name_taken';
    end if;
    insert into public.map_cell_names (q, r, name, updated_by) values (p_q, p_r, v_name, auth.uid())
    on conflict (q, r) do update set name = excluded.name, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public._audit('rename_cell', null, jsonb_build_object('q', p_q, 'r', p_r, 'name', nullif(v_name, '')));
end $$;

drop function if exists public.set_map_consent(boolean);

-- Oyuna girerken telefonun bulunduğu petek. Oyuncu odada değilse ya da Kocaeli dışındaysa sessizce sayılmaz
-- (false döner, oyun etkilenmez). Aynı odada bir üye bir kez bildirebilir.
create or replace function public.map_report_game(p_room_id uuid, p_q int, p_r int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if p_room_id is null or p_q is null or p_r is null then return false; end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id) then return false; end if;
  if not public._map_cell_ok(p_q, p_r) then return false; end if;
  perform public._map_cleanup();
  insert into public.map_signals (user_id, q, r, source, room_id, day)
  values (v.id, p_q, p_r, 'game', p_room_id, public._map_day())
  on conflict do nothing;
  return found;
end $$;

-- Yer ara (gönderiye yer eklerken). Her sözcük yerin adında ya da ilçesinde geçmeli.
-- DİKKAT: Bu iki fonksiyon "stable" OLMAMALI. _require_user() yeni haftada rumuzu yenilerken kilit alır (FOR UPDATE);
-- Supabase "stable" fonksiyonları salt okunur işlemde çalıştırır ve "cannot execute SELECT FOR UPDATE in a
-- read-only transaction" hatası verir.
drop function if exists public.search_places(text, int);
create or replace function public.search_places(p_query text, p_limit int default 20)
returns table (id text, name text, cat_label text, district text, address text, lat double precision, lon double precision)
language plpgsql security definer set search_path = public as $$
declare
  v_q text := public._tr_fold(left(coalesce(p_query, ''), 80));
  v_tokens text[];
  v_first text;
begin
  perform public._require_user();
  if char_length(v_q) < 2 then return; end if;
  v_tokens := string_to_array(v_q, ' ');
  v_first := v_tokens[1];
  return query
  select p.id, p.name, p.cat_label, p.district, p.address, p.lat, p.lon
    from public.places p
   where not exists (
           select 1 from unnest(v_tokens) t
            where (p.search_text || ' ' || public._tr_fold(p.district))
                  not like '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by (p.search_text like replace(replace(replace(v_first, '\', '\\'), '%', '\%'), '_', '\_') || '%') desc,
            p.rank, p.confidence desc nulls last, p.name
   limit least(greatest(coalesce(p_limit, 20), 1), 30);
end $$;

-- Bulunduğun petek ve komşu peteklerdeki yerler (telefon uzaklığa göre kendisi sıralar; sunucu yalnızca petek numarasını bilir)
drop function if exists public.places_near_cell(int, int, int);
create or replace function public.places_near_cell(p_q int, p_r int, p_limit int default 150)
returns table (id text, name text, cat_label text, district text, address text, lat double precision, lon double precision)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_user();
  if p_q is null or p_r is null or not public._map_cell_ok(p_q, p_r) then return; end if;
  return query
  select p.id, p.name, p.cat_label, p.district, p.address, p.lat, p.lon
    from public.places p
   where p.q between p_q - 1 and p_q + 1 and p.r between p_r - 1 and p_r + 1
     and public._hex_dist(p.q, p.r, p_q, p_r) <= 1
   order by p.rank, p.confidence desc nulls last, p.name
   limit least(greatest(coalesce(p_limit, 150), 1), 300);
end $$;

-- ---------------------------------------------------------------------
-- 5f) Premium ayrıcalıkları (anlaşmalı işletmeler)
-- ---------------------------------------------------------------------

-- Ayrıcalık listesi. Premium üye (ve moderatör) her şeyi görür; premium olmayan üye yalnızca işletme adı ve başlığı
-- görür (açıklama ve "nasıl kullanılır" metni sunucudan hiç gönderilmez). Süresi dolan ya da gizlenen ayrıcalıklar
-- üyeye gelmez; moderatör hepsini görür.
drop function if exists public.list_perks();
create or replace function public.list_perks()
returns table (id uuid, business_name text, title text, description text, how_to text, district text,
               valid_until date, is_active boolean, sort_order int, locked boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select (p.role = 'admin') as is_admin,
           (p.premium_until is not null and p.premium_until > now()) as is_premium
      from public.profiles p
     where p.id = auth.uid() and p.banned_at is null
  )
  select k.id, k.business_name, k.title,
         case when me.is_admin or me.is_premium then k.description end,
         case when me.is_admin or me.is_premium then k.how_to end,
         k.district, k.valid_until, k.is_active, k.sort_order,
         not (me.is_admin or me.is_premium)
    from public.perks k, me
   where public._is_active_user()
     and (me.is_admin or (k.is_active and (k.valid_until is null or k.valid_until >= public._map_day())))
   order by k.sort_order, k.created_at desc
   limit 100;
$$;

-- Moderatör: ayrıcalık ekle (p_id boş) ya da değiştir
create or replace function public.admin_save_perk(
  p_id uuid, p_business_name text, p_title text, p_description text, p_how_to text,
  p_district text, p_valid_until date, p_is_active boolean, p_sort_order int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_biz text := btrim(coalesce(p_business_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_how text := btrim(coalesce(p_how_to, ''));
  v_dist text := nullif(btrim(coalesce(p_district, '')), '');
  v_sort int := coalesce(p_sort_order, 100);
  v_id uuid;
begin
  perform public._require_admin();
  if char_length(v_biz) not between 2 and 80 then raise exception 'invalid_business'; end if;
  if char_length(v_title) not between 3 and 120 then raise exception 'invalid_title'; end if;
  if char_length(v_desc) not between 5 and 400 then raise exception 'invalid_description'; end if;
  if char_length(v_how) > 400 then raise exception 'invalid_how_to'; end if;
  if v_dist is not null and char_length(v_dist) not between 2 and 40 then raise exception 'invalid_district'; end if;
  if p_valid_until is not null and p_valid_until < public._map_day() then raise exception 'invalid_valid_until'; end if;
  if v_sort not between 0 and 1000 then raise exception 'invalid_sort'; end if;
  if p_id is null then
    insert into public.perks (business_name, title, description, how_to, district, valid_until, is_active, sort_order, created_by)
    values (v_biz, v_title, v_desc, v_how, v_dist, p_valid_until, coalesce(p_is_active, true), v_sort, auth.uid())
    returning id into v_id;
  else
    update public.perks
       set business_name = v_biz, title = v_title, description = v_desc, how_to = v_how, district = v_dist,
           valid_until = p_valid_until, is_active = coalesce(p_is_active, true), sort_order = v_sort
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'perk_not_found'; end if;
  end if;
  perform public._audit('save_perk', null, jsonb_build_object('perk_id', v_id, 'business', v_biz, 'title', v_title));
  return v_id;
end $$;

create or replace function public.admin_delete_perk(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_biz text;
begin
  perform public._require_admin();
  delete from public.perks where id = p_id returning business_name into v_biz;
  if not found then raise exception 'perk_not_found'; end if;
  perform public._audit('delete_perk', null, jsonb_build_object('perk_id', p_id, 'business', v_biz));
end $$;

-- ---------------------------------------------------------------------
-- 5g) Sponsorlu mekânlar: mekân profili, puan/yorum, oyun hakkı kodları, moderatör işlemleri
--     Sponsor hesabın kuralları: gerçek adı hep görünür, oyun oynayamaz, sıralamada ve puanda yoktur,
--     sınırsız etkinlik açar. Oyun hakkı kodları yalnızca EK oda hakkı verir; puan sınırları (günlük/aylık oyun puanı,
--     etkinlik kuralları) hiçbir şekilde değişmez.
-- ---------------------------------------------------------------------

-- Mekân özeti: yıldız ortalaması, değerlendirme sayısı ve kod kullanım sayısı (gizlenen/yasaklı yazarın yorumu sayılmaz)
create or replace function public._venue_stats(p_venue uuid)
returns table (avg_stars numeric, review_count int, visit_count int)
language sql stable security definer set search_path = public as $$
  select (select round(avg(r.stars)::numeric, 1)
            from public.venue_reviews r join public.profiles p on p.id = r.user_id and p.banned_at is null
           where r.venue_id = p_venue and not r.is_hidden),
         (select count(*)::int
            from public.venue_reviews r join public.profiles p on p.id = r.user_id and p.banned_at is null
           where r.venue_id = p_venue and not r.is_hidden),
         (select count(*)::int from public.venue_visits x where x.venue_id = p_venue);
$$;

-- Mekân profili. Üye ve moderatör görür. my_visits = bu mekânın kodunu kaç kez kullandım,
-- can_review = puan/yorum verebilir miyim (üye olmalı; ayar açıksa mekânın kodunu en az 1 kez kullanmış olmalı)
create or replace function public.get_venue(p_venue_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles;
  p public.profiles;
  vn public.venues;
  s record;
  mine public.venue_reviews;
  v_visits int;
  v_need boolean := public.setting_bool('venue_rating_requires_visit');
begin
  select * into me from public.profiles where id = auth.uid() and banned_at is null;
  if not found then raise exception 'not_authenticated'; end if;
  select * into p from public.profiles where id = p_venue_id and role::text = 'sponsor' and banned_at is null;
  if not found then raise exception 'venue_not_found'; end if;
  select * into vn from public.venues where user_id = p_venue_id;
  if not found then raise exception 'venue_not_found'; end if;
  select * into s from public._venue_stats(p_venue_id);
  select count(*)::int into v_visits from public.venue_visits where venue_id = p_venue_id and user_id = me.id;
  select * into mine from public.venue_reviews where venue_id = p_venue_id and user_id = me.id;
  return jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'address', vn.address, 'phone', vn.phone, 'closing_hours', vn.closing_hours,
    'on_map', vn.cell_q is not null, 'cell_q', vn.cell_q, 'cell_r', vn.cell_r,
    'avg_stars', s.avg_stars, 'review_count', s.review_count, 'visit_count', s.visit_count,
    'my_visits', v_visits, 'is_mine', p.id = me.id, 'image_path', vn.image_path,
    'can_review', me.role = 'user' and (v_visits > 0 or not v_need),
    'needs_visit', me.role = 'user' and v_visits = 0 and v_need,
    'my_review', case when mine.id is not null then jsonb_build_object('stars', mine.stars, 'body', mine.body) end
  );
end $$;

-- Mekânın yorumları: en yeni önce, GERÇEK AD ile. Gizlenen yorumu yalnızca moderatör görür.
drop function if exists public.list_venue_reviews(uuid);
create or replace function public.list_venue_reviews(p_venue_id uuid)
returns table (id uuid, author_name text, stars int, body text, is_hidden boolean, created_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select r.id, pr.full_name, r.stars, r.body, r.is_hidden, r.created_at, (r.user_id = auth.uid())
    from public.venue_reviews r
    join public.profiles pr on pr.id = r.user_id
   where public._is_active_user()
     and r.venue_id = p_venue_id
     and exists (select 1 from public.profiles sp
                  where sp.id = p_venue_id and sp.role::text = 'sponsor' and sp.banned_at is null)
     and (public.is_admin()
          or (not r.is_hidden and pr.banned_at is null
              and not exists (select 1 from public.user_blocks b
                               where b.blocker_id = auth.uid() and b.blocked_id = r.user_id)))
   order by r.created_at desc
   limit 100;
$$;

-- Mekâna puan (1–5 yıldız) ve isteğe bağlı yorum ver ya da önceki değerlendirmeni değiştir.
-- Yalnızca üyeler verir (moderatör ve sponsor veremez). Ayar açıksa mekânın kodunu en az 1 kez kullanmış olmak gerekir.
-- Moderatörün gizlediği yorum, düzenlense bile gizli kalır.
create or replace function public.save_venue_review(p_venue_id uuid, p_stars int, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  v := public._require_writer(null);
  if v.role <> 'user' then raise exception 'forbidden'; end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'invalid_stars'; end if;
  if v_body is not null and char_length(v_body) > 300 then raise exception 'invalid_body'; end if;
  if not exists (select 1 from public.venues vn join public.profiles sp on sp.id = vn.user_id
                  where vn.user_id = p_venue_id and sp.role::text = 'sponsor' and sp.banned_at is null) then
    raise exception 'venue_not_found';
  end if;
  if public.setting_bool('venue_rating_requires_visit')
     and not exists (select 1 from public.venue_visits where venue_id = p_venue_id and user_id = v.id) then
    raise exception 'visit_required';
  end if;
  if (select count(*) from public.venue_reviews where user_id = v.id and updated_at > now() - interval '1 minute') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into public.venue_reviews (venue_id, user_id, stars, body)
  values (p_venue_id, v.id, p_stars, v_body)
  on conflict (venue_id, user_id)
  do update set stars = excluded.stars, body = excluded.body, updated_at = now();
end $$;

create or replace function public.delete_my_venue_review(p_venue_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.venue_reviews where venue_id = p_venue_id and user_id = v.id;
  if not found then raise exception 'review_not_found'; end if;
end $$;

-- Sponsor: üyeye vereceği tek kullanımlık oyun hakkı kodunu oluşturur. Ayda en çok mekânın kod kotası kadar
-- (moderatör belirler; boşsa sponsor_code_default_quota). Kod sponsor_code_valid_hours saat geçerlidir.
create or replace function public.create_sponsor_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  vn public.venues;
  v_limit int;
  v_used int;
  v_code text;
  v_exp timestamptz;
  v_try int := 0;
begin
  v := public._require_writer(null);
  if v.role::text <> 'sponsor' then raise exception 'forbidden'; end if;
  -- Mekân satırı kilitlenir: aynı anda iki istek kotayı aşmasın
  select * into vn from public.venues where user_id = v.id for update;
  if not found then raise exception 'venue_missing'; end if;
  v_limit := coalesce(vn.code_quota, public.setting_int('sponsor_code_default_quota', 30));
  select count(*)::int into v_used from public.sponsor_codes where venue_id = v.id and created_at >= public._month_start();
  if v_used >= v_limit then raise exception 'code_quota_exceeded'; end if;
  v_exp := now() + make_interval(hours => greatest(1, public.setting_int('sponsor_code_valid_hours', 24)));
  loop
    v_code := public._random_code(6);
    begin
      insert into public.sponsor_codes (venue_id, code, expires_at) values (v.id, v_code, v_exp);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'code_generation_failed'; end if;
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'expires_at', v_exp, 'quota_used', v_used + 1, 'quota_limit', v_limit);
end $$;

-- Sponsor: kendi paneli (mekân bilgisi, kod kotası, son 20 kod). Sponsor değilse boş (null) döner.
create or replace function public.my_sponsor_panel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  vn public.venues;
  s record;
  v_limit int;
  v_used int;
begin
  select * into p from public.profiles where id = auth.uid() and banned_at is null and role::text = 'sponsor';
  if not found then return null; end if;
  select * into vn from public.venues where user_id = p.id;
  if not found then return jsonb_build_object('name', p.full_name, 'venue', false); end if;
  select * into s from public._venue_stats(p.id);
  v_limit := coalesce(vn.code_quota, public.setting_int('sponsor_code_default_quota', 30));
  select count(*)::int into v_used from public.sponsor_codes c
   where c.venue_id = p.id and c.created_at >= public._month_start();
  return jsonb_build_object(
    'name', p.full_name, 'venue', true, 'address', vn.address, 'phone', vn.phone, 'closing_hours', vn.closing_hours,
    'on_map', vn.cell_q is not null, 'cell_q', vn.cell_q, 'cell_r', vn.cell_r, 'image_path', vn.image_path,
    'quota_limit', v_limit, 'quota_used', v_used,
    'valid_hours', greatest(1, public.setting_int('sponsor_code_valid_hours', 24)),
    'avg_stars', s.avg_stars, 'review_count', s.review_count, 'visit_count', s.visit_count,
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', c.code, 'created_at', c.created_at, 'expires_at', c.expires_at,
               'status', case when c.redeemed_at is not null then 'used'
                              when c.expires_at <= now() then 'expired' else 'active' end)
             order by c.created_at desc)
        from (select * from public.sponsor_codes where venue_id = p.id order by created_at desc limit 20) c
    ), '[]'::jsonb)
  );
end $$;

-- Üye: sponsorun verdiği kodu girer ve 1 EK oyun hakkı kazanır.
--   * Yanlış / kullanılmış / süresi geçmiş kod hata fırlatmaz, {ok:false, reason} döner ki deneme kaydı silinmesin;
--     10 dakikada 8 yanlıştan sonra 'too_many_attempts'.
--   * Kullanılmamış bir sponsor hakkın varken yeni kod alınamaz ('credit_pending'): hak biriktirilemez.
--   * Aynı mekânın kodu günde (İstanbul saati) en çok 1 kez kullanılır ('venue_daily_limit').
--   * Yalnızca üyeler kullanır (moderatör ve sponsor kullanamaz). Kullanım, mekânın ziyaret sayısını artırır.
-- Bu fonksiyon puan YAZMAZ; yalnızca oda açma hakkı verir.
create or replace function public.redeem_sponsor_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  c public.sponsor_codes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_found boolean;
  v_live boolean;
  v_name text;
begin
  v := public._require_user();
  if v.role <> 'user' then raise exception 'forbidden'; end if;
  -- Üyenin satırı kilitlenir: aynı anda iki kod kullanılarak hak biriktirilemez
  perform 1 from public.profiles where id = v.id for update;
  delete from public.sponsor_code_failures where failed_at < now() - interval '1 hour';
  if (select count(*) from public.sponsor_code_failures
       where user_id = v.id and failed_at > now() - interval '10 minutes') >= 8 then
    raise exception 'too_many_attempts';
  end if;
  select * into c from public.sponsor_codes where code = v_code for update;
  v_found := found;
  v_live := v_found and exists (select 1 from public.profiles sp
                                 where sp.id = c.venue_id and sp.role::text = 'sponsor' and sp.banned_at is null);
  if not v_found or not v_live or c.redeemed_at is not null or c.expires_at <= now() then
    insert into public.sponsor_code_failures (user_id) values (v.id);
    return jsonb_build_object('ok', false, 'reason',
      case when v_found and v_live and c.redeemed_at is not null then 'used'
           when v_found and v_live and c.expires_at <= now() then 'expired'
           else 'invalid' end);
  end if;
  if public._free_sponsor_credit(v.id) is not null then raise exception 'credit_pending'; end if;
  if exists (select 1 from public.venue_visits
              where venue_id = c.venue_id and user_id = v.id and day = public._map_day()) then
    raise exception 'venue_daily_limit';
  end if;
  update public.sponsor_codes set redeemed_by = v.id, redeemed_at = now() where id = c.id;
  insert into public.venue_visits (venue_id, user_id, code_id, day) values (c.venue_id, v.id, c.id, public._map_day());
  insert into public.sponsor_credits (user_id, venue_id, code_id) values (v.id, c.venue_id, c.id);
  select full_name into v_name from public.profiles where id = c.venue_id;
  return jsonb_build_object('ok', true, 'venue_id', c.venue_id, 'venue_name', v_name);
end $$;

-- Haritada işaretli mekânlar (petek seçince etkinliklerin altında listelenir; genel haritada işaretlenmez)
drop function if exists public.list_map_venues();
create or replace function public.list_map_venues()
returns table (user_id uuid, name text, address text, phone text, closing_hours text, cell_q int, cell_r int,
               avg_stars numeric, review_count int, visit_count int, image_path text)
language sql stable security definer set search_path = public as $$
  select vn.user_id, p.full_name, vn.address, vn.phone, vn.closing_hours, vn.cell_q, vn.cell_r,
         s.avg_stars, s.review_count, s.visit_count, vn.image_path
    from public.venues vn
    join public.profiles p on p.id = vn.user_id and p.role::text = 'sponsor' and p.banned_at is null
    cross join lateral public._venue_stats(vn.user_id) s
   where public._is_active_user() and vn.cell_q is not null
   order by p.full_name
   limit 300;
$$;

-- Moderatör: sponsor hesapların listesi (rolü veritabanından 'sponsor' yapılmış hesaplar), mekân bilgisi ve kotalarıyla
drop function if exists public.admin_list_sponsors();
create or replace function public.admin_list_sponsors()
returns table (user_id uuid, name text, is_banned boolean, has_venue boolean, address text, phone text,
               closing_hours text, cell_q int, cell_r int, code_quota int, quota_limit int, codes_month int,
               avg_stars numeric, review_count int, visit_count int, image_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, (p.banned_at is not null), (vn.user_id is not null), vn.address, vn.phone,
         vn.closing_hours, vn.cell_q, vn.cell_r, vn.code_quota,
         coalesce(vn.code_quota, public.setting_int('sponsor_code_default_quota', 30)),
         (select count(*)::int from public.sponsor_codes c where c.venue_id = p.id and c.created_at >= public._month_start()),
         s.avg_stars, s.review_count, s.visit_count, vn.image_path
    from public.profiles p
    left join public.venues vn on vn.user_id = p.id
    cross join lateral public._venue_stats(p.id) s
   where public.is_admin() and p.role::text = 'sponsor'
   order by p.full_name
   limit 200;
$$;

-- Moderatör: sponsor hesabın mekân bilgisini kaydet (ilk kez ya da güncelle). p_q/p_r verilirse mekân o peteğe
-- (haritaya) yerleşir; verilmezse mevcut yeri korunur. p_name verilirse hesabın (gerçek) adı da değişir.
-- p_code_quota boşsa varsayılan kota geçerli olur.
create or replace function public.admin_save_venue(
  p_user_id uuid, p_name text, p_address text, p_phone text, p_hours text, p_code_quota int,
  p_q int default null, p_r int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_addr text := btrim(coalesce(p_address, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_hours text := btrim(coalesce(p_hours, ''));
begin
  perform public._require_admin();
  if not exists (select 1 from public.profiles where id = p_user_id and role::text = 'sponsor') then
    raise exception 'not_a_sponsor';
  end if;
  if v_name is not null and char_length(v_name) not between 2 and 60 then raise exception 'invalid_name'; end if;
  if char_length(v_addr) not between 3 and 200 then raise exception 'invalid_address'; end if;
  if v_phone is not null and char_length(v_phone) not between 5 and 30 then raise exception 'invalid_phone'; end if;
  if char_length(v_hours) not between 2 and 60 then raise exception 'invalid_hours'; end if;
  if p_code_quota is not null and p_code_quota not between 0 and 1000 then raise exception 'invalid_quota'; end if;
  if (p_q is null) <> (p_r is null) then raise exception 'invalid_cell'; end if;
  if p_q is not null and not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  if v_name is not null then
    update public.profiles set full_name = v_name where id = p_user_id;
  end if;
  insert into public.venues (user_id, address, phone, closing_hours, code_quota, cell_q, cell_r)
  values (p_user_id, v_addr, v_phone, v_hours, p_code_quota, p_q, p_r)
  on conflict (user_id) do update
     set address = excluded.address, phone = excluded.phone, closing_hours = excluded.closing_hours,
         code_quota = excluded.code_quota,
         cell_q = coalesce(excluded.cell_q, public.venues.cell_q),
         cell_r = coalesce(excluded.cell_r, public.venues.cell_r);
  perform public._audit('save_venue', p_user_id,
    jsonb_build_object('address', v_addr, 'cell_q', p_q, 'cell_r', p_r, 'code_quota', p_code_quota));
end $$;

-- Moderatör: mekânı haritadan kaldır (profil, puan ve yorumlar kalır)
create or replace function public.admin_remove_venue_from_map(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.venues set cell_q = null, cell_r = null where user_id = p_user_id;
  if not found then raise exception 'venue_not_found'; end if;
  perform public._audit('remove_venue_from_map', p_user_id, '{}'::jsonb);
end $$;

-- Moderatör: mekânın profil resmini ayarla ya da kaldır (p_path boş). Dosya önce Storage'daki "venue-images" kutusuna
-- venues/<mekân kimliği>/<dosya> yoluna yüklenir (en çok 2 MB, jpg/png/webp; kutu kuralları bunu zorlar).
create or replace function public.admin_set_venue_image(p_user_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  perform public._require_admin();
  if not exists (select 1 from public.venues where user_id = p_user_id) then raise exception 'venue_missing'; end if;
  if v_path is not null then
    if v_path !~ ('^venues/' || p_user_id::text || '/[A-Za-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$') then
      raise exception 'invalid_image';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'venue-images' and o.name = v_path) then
      raise exception 'invalid_image';
    end if;
  end if;
  update public.venues set image_path = v_path where user_id = p_user_id;
  perform public._audit('venue_image', p_user_id, jsonb_build_object('path', v_path));
end $$;

-- ---------------------------------------------------------------------
-- 5h) Hesap: kayıt kontrolü, tek oturum, kurtarma kelimeleri, bildirim kutusu, duyurular
-- ---------------------------------------------------------------------

-- Kurtarma kelimesi listesi (512 kelime; Türkçe karakterler sadeleştirilince de hepsi birbirinden farklıdır)
create or replace function public._recovery_words()
returns text[] language sql immutable as $$
  select array['elma','armut','kiraz','erik','incir','ayva','limon','portakal','mandalina','muz','kavun','karpuz','nar','üzüm','dut','çilek','vişne','kayısı','şeftali','ceviz','fındık','badem','fıstık','zeytin','domates','biber','patates','soğan','sarımsak','havuç','ıspanak','marul','lahana','kabak','pırasa','bezelye','fasulye','nohut','mercimek','pirinç','bulgur','ekmek','simit','poğaça','börek','pide','lahmacun','köfte','kebap','pilav','çorba','yoğurt','ayran','peynir','tereyağ','bal','reçel','şeker','tuz','çay','kahve','süt','buz','kar','yağmur','dolu','sis','bulut','rüzgar','fırtına','güneş','yıldız','gezegen','gökyüzü','deniz','okyanus','göl','nehir','dere','şelale','kaynak','pınar','dağ','tepe','ova','vadi','yayla','orman','ağaç','çınar','meşe','kavak','söğüt','çam','ladin','akasya','lale','gül','papatya','menekşe','sümbül','nergis','karanfil','zambak','orkide','yaprak','dal','kök','tohum','çiçek','fidan','çimen','yosun','taş','kaya','kum','toprak','çamur','kil','mermer','granit','elmas','yakut','zümrüt','inci','altın','gümüş','bakır','demir','çelik','kalay','kurşun','kağıt','kalem','defter','kitap','dergi','gazete','mektup','zarf','pul','harita','pusula','saat','takvim','masa','sandalye','koltuk','kanepe','yatak','yastık','yorgan','halı','kilim','perde','lamba','ayna','dolap','raf','kapı','pencere','duvar','tavan','zemin','merdiven','balkon','bahçe','avlu','çatı','baca','bina','köşk','saray','kale','kule','köprü','yol','sokak','cadde','meydan','pazar','çarşı','dükkan','fırın','okul','sınıf','müze','sergi','tiyatro','sinema','konser','şarkı','türkü','melodi','nota','davul','zurna','bağlama','keman','gitar','piyano','flüt','trompet','resim','boya','fırça','tuval','heykel','çömlek','vazo','tabak','çatal','kaşık','bıçak','tencere','tava','kazan','sürahi','bardak','fincan','kupa','şişe','kavanoz','sepet','çanta','valiz','cüzdan','anahtar','kilit','zincir','halat','iğne','düğme','fermuar','kumaş','ipek','yün','pamuk','keten','deri','şapka','bere','atkı','eldiven','çorap','ayakkabı','çizme','terlik','gömlek','kazak','ceket','palto','yelek','etek','elbise','kemer','yüzük','kolye','küpe','bilezik','taç','kalkan','kılıç','yay','mızrak','gemi','kayık','sandal','yelken','çapa','dümen','liman','fener','ada','sahil','koy','körfez','burun','kıyı','dalga','köpük','martı','kartal','şahin','doğan','atmaca','baykuş','serçe','güvercin','kumru','bülbül','kanarya','papağan','leylek','turna','kuğu','ördek','kaz','tavuk','horoz','hindi','aslan','kaplan','pars','vaşak','kurt','tilki','ayı','geyik','ceylan','tavşan','sincap','kirpi','kaplumbağa','kertenkele','yılan','kurbağa','balık','yunus','balina','ahtapot','yengeç','midye','istiridye','karides','denizatı','ıstakoz','eşek','katır','deve','inek','boğa','koyun','keçi','kuzu','oğlak','buzağı','köpek','kedi','fare','hamster','arı','karınca','kelebek','böcek','uğur','kuş','yuva','kafes','ağıl','ahır','tarla','bağ','bostan','çiftlik','değirmen','kuyu','çeşme','havuz','kanal','tünel','mağara','kuyruk','kanat','tüy','gaga','pençe','boynuz','toynak','yele','saç','göz','kulak','ağız','diş','dil','ayak','parmak','kol','bacak','omuz','diz','yürek','beyin','ses','nefes','adım','yolcu','gezgin','kaşif','denizci','pilot','kaptan','çoban','çiftçi','fırıncı','aşçı','terzi','marangoz','demirci','ressam','şair','yazar','ozan','müzisyen','dansçı','oyuncu','hakem','öğretmen','doktor','hemşire','mühendis','mimar','avukat','hakim','polis','itfaiye','asker','bekçi','kral','kraliçe','prens','prenses','şövalye','büyücü','dev','cüce','peri','ejder','anka','hazine','sandık','mücevher','kristal','mıknatıs','roket','uydu','teleskop','mikroskop','pil','kablo','motor','tekerlek','bisiklet','araba','otobüs','tren','tramvay','metro','vapur','uçak','balon','paraşüt','kızak','kayak','paten','top','file','raket','zar','satranç','dama','tavla','bilmece','bulmaca','oyun','yarış','rekor','madalya','zafer','cesaret','umut','sevgi','dostluk','barış','özgürlük','adalet','bilgi','akıl','zeka','hayal','rüya','masal','efsane','destan','şiir','hikaye','roman','öykü','macera','yolculuk','tatil','bayram','düğün','şenlik','festival','kutlama','hediye','sürpriz','şans','kader','zaman','sabah','öğle','akşam','gece','şafak','ilkbahar','yaz','sonbahar','kış','ocak']::text[];
$$;

-- Uygulama metinleri (kullanım koşulları, açık rıza, KVKK, iletişim). Giriş yapmadan da okunur.
-- Metinler app_settings tablosundan değiştirilir.
create or replace function public.app_text(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select s.value #>> '{}' from public.app_settings s
   where s.key = p_key and p_key in ('legal_terms', 'legal_consent', 'legal_kvkk', 'support_contact', 'legal_privacy',
                                     'faq', 'website_url');
$$;

-- Kayıt öncesi kontrol (giriş yapmadan çağrılır): kullanıcı adı uygun mu, bu cihazdan daha önce hesap açılmış mı?
-- Döner: 'ok' | 'invalid_username' | 'reserved_name' | 'username_taken' | 'device_required' | 'device_used'
-- Asıl kontrol yine kayıt anında (handle_new_user) yapılır; bu yalnızca anlaşılır uyarı göstermek içindir.
create or replace function public.check_signup(p_username text, p_device text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_device text := btrim(coalesce(p_device, ''));
begin
  if v_user !~ '^[a-z0-9_.]{3,20}$' then return 'invalid_username'; end if;
  if public._is_reserved_name(v_user) then return 'reserved_name'; end if;
  if exists (select 1 from public.profiles where username = v_user) then return 'username_taken'; end if;
  if char_length(v_device) not between 16 and 100 then return 'device_required'; end if;
  if public.setting_bool('signup_one_per_device')
     and exists (select 1 from public.device_accounts
                  where device_hash = encode(extensions.digest(v_device, 'sha256'), 'hex')) then
    return 'device_used';
  end if;
  return 'ok';
end $$;

-- Girişten hemen sonra çağrılır: bu oturum hesabın tek geçerli oturumu olur. Önceki telefondaki oturum,
-- bir sonraki isteğinde 'session_replaced' alır ve uygulama orada çıkış yapar.
create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare v_sid text := nullif(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_sid is null then return; end if;
  update public.profiles set active_session = v_sid::uuid where id = auth.uid() and banned_at is null;
end $$;

-- Hesap durumu: oturum geçerli mi, kurtarma kelimeleri kurulmuş mu, ad değiştirme hakkı kaldı mı?
-- session: 'ok' | 'replaced' (başka telefondan girildi) | 'banned' | 'none'
-- name_changes_left: boş = sınırsız (moderatör), 0 = hak yok
create or replace function public.my_account_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  v_has boolean;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('session', 'none'); end if;
  v_has := exists (select 1 from public.account_recovery r where r.user_id = p.id and r.confirmed);
  return jsonb_build_object(
    'session', case when p.banned_at is not null then 'banned'
                    when not public._session_ok(p.active_session) then 'replaced'
                    else 'ok' end,
    'username', p.username,
    'has_recovery', v_has,
    'needs_recovery', p.username is not null and not v_has,
    'game_invites', p.game_invites,
    'name_changes_left', case when p.role = 'admin' then null
                              when p.role = 'user' then greatest(0, 1 - p.name_changes)
                              else 0 end
  );
end $$;

-- Kurtarma kelimelerini üretir ve YALNIZCA BİR KEZ gösterir (sunucuda yalnızca özeti kalır).
-- İlk kurulumda şifre istenmez. Kelimeler daha önce kaydedildiyse (yenileme) mevcut şifre doğru girilmelidir;
-- böylece telefonu ele geçiren biri kelimeleri yenileyip hesabı kalıcı olarak alamaz.
drop function if exists public.create_recovery_phrase();
create or replace function public.create_recovery_phrase(p_password text default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  w text[] := public._recovery_words();
  n int;
  b bytea;
  v_out text[] := '{}';
  v_hash text;
  i int;
begin
  v := public._require_user();
  if v.username is null then raise exception 'no_username'; end if;
  perform 1 from public.profiles where id = v.id for update;
  if exists (select 1 from public.account_recovery r where r.user_id = v.id and r.confirmed) then
    delete from public.recovery_failures where failed_at < now() - interval '1 day';
    if (select count(*) from public.recovery_failures
         where username = 'pw:' || v.id::text and failed_at > now() - interval '1 hour') >= 5 then
      raise exception 'too_many_attempts';
    end if;
    select u.encrypted_password into v_hash from auth.users u where u.id = v.id;
    if p_password is null or v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
      insert into public.recovery_failures (username) values ('pw:' || v.id::text);
      raise exception 'password_wrong';
    end if;
  end if;
  n := array_length(w, 1);
  b := extensions.gen_random_bytes(24);
  for i in 0 .. 11 loop
    v_out := v_out || w[1 + ((get_byte(b, 2 * i) * 256 + get_byte(b, 2 * i + 1)) % n)];
  end loop;
  insert into public.account_recovery (user_id, phrase_hash, confirmed, created_at)
  values (v.id, extensions.crypt(public._tr_fold(array_to_string(v_out, ' ')), extensions.gen_salt('bf', 8)), false, now())
  on conflict (user_id) do update
     set phrase_hash = excluded.phrase_hash, confirmed = false, created_at = now();
  return v_out;
end $$;

-- Üye, kelimeleri kaydettiğini doğruladı (uygulama iki kelimeyi yazdırarak kontrol eder)
create or replace function public.confirm_recovery_phrase()
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  update public.account_recovery set confirmed = true where user_id = v.id;
  if not found then raise exception 'recovery_missing'; end if;
end $$;

-- Şifre sıfırlama (giriş yapmadan): kullanıcı adı + 12 kurtarma kelimesi + yeni şifre.
--   * Kullanıcı adı başına saatte 5, bağlantı adresi başına saatte 20 yanlış denemeden sonra 'too_many_attempts'.
--   * Kullanıcı adı yoksa da "kelimeler yanlış" denir (hangi adların var olduğu anlaşılmasın).
--   * Başarılı olunca bütün açık oturumlar kapanır; üye yeni şifresiyle girer.
-- Döner: {ok: true} ya da {ok: false, reason: 'wrong' | 'format' | 'banned'}
create or replace function public.recover_account(p_username text, p_phrase text, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_phrase text := btrim(regexp_replace(public._tr_fold(coalesce(p_phrase, '')), '[^a-z]+', ' ', 'g'));
  v_ip text;
  v_id uuid;
  v_banned timestamptz;
  v_hash text;
begin
  if char_length(coalesce(p_new_password, '')) not between 8 and 72
     or p_new_password !~ '[A-Za-zÇĞİÖŞÜçğıöşü]' or p_new_password !~ '[0-9]' then
    raise exception 'weak_password';
  end if;
  if v_user !~ '^[a-z0-9_.]{3,20}$'
     or coalesce(array_length(string_to_array(v_phrase, ' '), 1), 0) <> 12 then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  begin
    v_ip := left(btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), 64);
  exception when others then v_ip := null;
  end;

  delete from public.recovery_failures where failed_at < now() - interval '1 day';
  if (select count(*) from public.recovery_failures
       where username = v_user and failed_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and (select count(*) from public.recovery_failures
                                where ip = v_ip and failed_at > now() - interval '1 hour') >= 20) then
    raise exception 'too_many_attempts';
  end if;

  select p.id, p.banned_at, r.phrase_hash into v_id, v_banned, v_hash
    from public.profiles p join public.account_recovery r on r.user_id = p.id
   where p.username = v_user;
  if v_id is null or extensions.crypt(v_phrase, v_hash) <> v_hash then
    insert into public.recovery_failures (username, ip) values (v_user, v_ip);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  if v_banned is not null then return jsonb_build_object('ok', false, 'reason', 'banned'); end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_id;
  -- Açık oturumlar kapanır (şifreyi bilmeyen biri hesabı kullanıyorsa dışarıda kalır)
  begin
    delete from auth.sessions where user_id = v_id;
  exception when others then null;
  end;
  begin
    delete from auth.refresh_tokens where user_id = v_id::text;
  exception when others then null;
  end;
  update public.profiles set active_session = null where id = v_id;
  delete from public.recovery_failures where username = v_user;
  return jsonb_build_object('ok', true);
end $$;

-- Bildirim kutusu: kişisel bildirimler ve son 30 günün duyuruları, en yeni önce (en çok 100)
drop function if exists public.list_my_notifications();
create or replace function public.list_my_notifications()
returns table (id uuid, source text, kind text, title text, body text, data jsonb, created_at timestamptz, is_read boolean)
language sql stable security definer set search_path = public as $$
  select x.id, x.source, x.kind, x.title, x.body, x.data, x.created_at, x.is_read
    from (
      select n.id, 'personal'::text as source, n.kind, n.title, n.body, n.data, n.created_at,
             (n.read_at is not null) as is_read
        from public.notifications n
       where n.user_id = auth.uid()
      union all
      select a.id, 'announcement'::text, 'announcement'::text, a.title, a.body,
             jsonb_build_object('akind', a.kind, 'route', case a.kind when 'special_event' then '/events'
                                                                     when 'treasure' then '/hazine'
                                                                     when 'raffle' then '/games' end),
             a.created_at,
             exists (select 1 from public.announcement_reads r where r.user_id = auth.uid() and r.announcement_id = a.id)
        from public.announcements a
       where a.is_active and a.created_at > now() - interval '30 days'
         and (a.kind in ('general', 'raffle') or public._notif_on(auth.uid(), 'special_events'))
    ) x
   where public._is_active_user()
   order by x.created_at desc
   limit 100;
$$;

-- Bildirim kutusu açılınca hepsi okundu sayılır
create or replace function public.mark_notifications_read()
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  update public.notifications set read_at = now() where user_id = v.id and read_at is null;
  insert into public.announcement_reads (user_id, announcement_id)
  select v.id, a.id from public.announcements a
   where a.is_active and a.created_at > now() - interval '30 days'
  on conflict do nothing;
end $$;

-- Kendi kişisel bildirimini sil (duyurular silinmez, 30 gün sonra kendiliğinden düşer)
create or replace function public.delete_my_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.notifications where id = p_id and user_id = v.id;
end $$;

-- Moderatör: bir üyeye özel mesaj (üyenin bildirim kutusuna düşer)
create or replace function public.admin_send_message(p_user_id uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_thread uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public._require_admin();
  if char_length(v_title) not between 3 and 120 then raise exception 'invalid_title'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user_not_found'; end if;
  -- 90 gündür hareketsiz yazışmalar silinir (gereğinden uzun saklanmaz)
  delete from public.mod_threads where last_at < now() - interval '90 days';
  -- Her mesaj bir yazışma açar: üye cevap yazabilir, moderatör görüşmeyi bitirince yazışma silinir
  insert into public.mod_threads (user_id, title, user_unread, admin_unread)
  values (p_user_id, v_title, true, false)
  returning id into v_thread;
  insert into public.mod_thread_messages (thread_id, from_admin, sender_id, body)
  values (v_thread, true, auth.uid(), v_body);
  perform public._notify(p_user_id, 'admin_message', v_title, v_body, jsonb_build_object('thread_id', v_thread));
  perform public._audit('send_message', p_user_id, jsonb_build_object('title', v_title, 'thread_id', v_thread));
end $$;

-- Moderatör: herkese duyuru
create or replace function public.admin_create_announcement(p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  perform public._require_admin();
  if char_length(v_title) not between 3 and 120 then raise exception 'invalid_title'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;
  insert into public.announcements (title, body, created_by) values (v_title, v_body, auth.uid())
  returning id into v_id;
  perform public._audit('announce', null, jsonb_build_object('announcement_id', v_id, 'title', v_title));
  return v_id;
end $$;

drop function if exists public.admin_list_announcements();
create or replace function public.admin_list_announcements()
returns table (id uuid, title text, body text, is_active boolean, created_at timestamptz, read_count int)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select a.id, a.title, a.body, a.is_active, a.created_at,
         (select count(*)::int from public.announcement_reads r where r.announcement_id = a.id)
    from public.announcements a
   order by a.created_at desc
   limit 50;
end $$;

create or replace function public.admin_set_announcement_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.announcements set is_active = coalesce(p_active, false) where id = p_id;
  if not found then raise exception 'announcement_not_found'; end if;
  perform public._audit(case when coalesce(p_active, false) then 'announce_show' else 'announce_hide' end, null,
    jsonb_build_object('announcement_id', p_id));
end $$;

-- ---------------------------------------------------------------------
-- 5i) Oyun davetleri, etkinlik ekipleri ve geçen haftanın sıralaması
-- ---------------------------------------------------------------------

-- Oyun davetlerini al / alma (Oyunlar sekmesindeki mandal)
create or replace function public.set_game_invites(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  update public.profiles set game_invites = coalesce(p_on, false) where id = v.id;
end $$;

-- Davet edilebilecek kişiler (yalnızca oda sahibi, oda bekleme salonundayken):
--   friends: davet almayı açmış arkadaşlar (gerçek adlarıyla; zaten arkadaşsınız)
--   nearby: davet almayı açmış, arkadaş olmayan ve son saatlerde odanın bölgesinde görülen üye SAYISI (kim oldukları gösterilmez)
create or replace function public._room_invite_pool(p_room public.game_rooms, p_host uuid)
returns table (user_id uuid, is_friend boolean)
language sql stable security definer set search_path = public as $$
  with fr as (
    select case when f.requester_id = p_host then f.addressee_id else f.requester_id end as uid
      from public.friendships f
     where f.status = 'accepted' and (f.requester_id = p_host or f.addressee_id = p_host)
  ), near as (
    select distinct m.user_id as uid
      from public.map_signals m
     where p_room.place_q is not null and m.source <> 'quiz'
       and m.created_at > now() - make_interval(hours => greatest(1, least(public.setting_int('game_invite_hours', 3), 24)))
       and public._hex_dist(m.q, m.r, p_room.place_q, p_room.place_r)
           <= greatest(0, least(public.setting_int('game_invite_radius', 2), 5))
  ), cand as (
    select fr.uid, true as is_friend from fr
    union
    select near.uid, false from near where near.uid not in (select uid from fr)
  )
  select c.uid, c.is_friend
    from cand c
    join public.profiles p on p.id = c.uid
   where p.game_invites and p.banned_at is null and p.role = 'user' and c.uid <> p_host
     and not exists (select 1 from public.room_players rp where rp.room_id = p_room.id and rp.user_id = c.uid)
     and not exists (select 1 from public.room_invites ri where ri.room_id = p_room.id and ri.user_id = c.uid)
     and not exists (select 1 from public.user_blocks b
                      where (b.blocker_id = c.uid and b.blocked_id = p_host)
                         or (b.blocker_id = p_host and b.blocked_id = c.uid));
$$;

create or replace function public._room_for_invite(p_room_id uuid)
returns public.game_rooms language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_writer(null);
  select * into r from public.game_rooms where id = p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if r.host_id <> v.id then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'room_closed'; end if;
  if r.game_type = 'raffle' then raise exception 'forbidden'; end if;
  return r;
end $$;

create or replace function public.room_invite_targets(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.game_rooms;
begin
  r := public._room_for_invite(p_room_id);
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name)
                           from public._room_invite_pool(r, auth.uid()) x join public.profiles p on p.id = x.user_id
                          where x.is_friend), '[]'::jsonb),
    'nearby', (select count(*)::int from public._room_invite_pool(r, auth.uid()) x where not x.is_friend),
    'sent', (select count(*)::int from public.room_invites ri where ri.room_id = r.id));
end $$;

-- Davet gönder: seçilen arkadaşlara ve (p_nearby ise) yakındaki davet almayı açmış üyelere (en çok 25).
-- Odaya en çok 40 davet; aynı kişiye ikinci davet gitmez. Davette oyun, bölge, adres tarifi, oyuncu sayısı ve
-- gönderenin GERÇEK ADI bulunur (açık odalar listesinde zaten oda sahibi olarak görünen ad). Rumuz bilerek
-- gösterilmez: rumuz ile gerçek ad yan yana çıkarsa kişinin anonim gönderileri eşleştirilebilirdi.
-- Oda kodu davette YOKTUR: kodu oda sahibi yerinde söyler.
create or replace function public.send_room_invites(p_room_id uuid, p_user_ids uuid[], p_nearby boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  h public.profiles;
  v_title text;
  v_players int;
  v_left int;
  v_sent int := 0;
  x record;
begin
  r := public._room_for_invite(p_room_id);
  select * into h from public.profiles where id = auth.uid();
  perform 1 from public.game_rooms where id = r.id for update;
  v_left := 40 - (select count(*)::int from public.room_invites where room_id = r.id);
  if v_left <= 0 then raise exception 'invite_limit'; end if;
  select title into v_title from public.game_types where key = r.game_type;
  select count(*)::int into v_players from public.room_players where room_id = r.id and left_at is null;
  for x in
    select * from (
      select pool.user_id, pool.is_friend
        from public._room_invite_pool(r, h.id) pool
       where (pool.is_friend and pool.user_id = any (coalesce(p_user_ids, '{}'::uuid[])))
          or (not pool.is_friend and coalesce(p_nearby, false))
       order by pool.is_friend desc, random()
    ) y
    limit least(v_left, 25 + coalesce(array_length(p_user_ids, 1), 0))
  loop
    insert into public.room_invites (room_id, user_id, invited_by) values (r.id, x.user_id, h.id)
    on conflict do nothing;
    if not found then continue; end if;
    perform public._notify(x.user_id, 'game_invite', 'Oyun daveti: ' || coalesce(v_title, r.game_type),
      h.full_name || (case when x.is_friend then ' (arkadaşın)' else '' end) || ' seni yan yana oyuna çağırıyor.'
        || coalesce(' Adres tarifi: ' || r.place_note || '.', '') || ' Odada ' || v_players || ' oyuncu var.'
        || ' Oda kodunu oda sahibi yerinde söyler.',
      jsonb_build_object('route', '/acik-odalar', 'game', r.game_type, 'room_id', r.id,
                         'q', r.place_q, 'r', r.place_r, 'place_note', r.place_note, 'players', v_players,
                         'sender_name', h.full_name, 'is_friend', x.is_friend));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- ---------------------------------------------------------------------
-- Paket 33: oyun davetini kabul etme ve oda sahibiyle kısa yazışma (gerçek adla)
-- ---------------------------------------------------------------------

-- Daveti kabul et: oda sahibine haber gider; oda sahibi bu kişiye adres tarifi için en çok 3 mesaj gönderebilir.
-- Kabul eden kişinin gerçek adı oda sahibine görünür (uygulama kabul etmeden önce söyler).
create or replace function public.accept_room_invite(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  ri public.room_invites;
  r public.game_rooms;
begin
  v := public._require_writer(null);
  select * into ri from public.room_invites where room_id = p_room_id and user_id = v.id for update;
  if not found then raise exception 'invite_not_found'; end if;
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.status not in ('lobby', 'playing') or ri.closed_at is not null then raise exception 'room_chat_closed'; end if;
  if ri.accepted_at is not null then return ri.id; end if;
  update public.room_invites set accepted_at = now() where room_id = p_room_id and user_id = v.id;
  perform public._notify(r.host_id, 'room_msg', 'Davetini kabul etti: ' || v.full_name,
    v.full_name || ' oyun davetini kabul etti. Odanın yerini tarif etmek için ona en çok 3 mesaj gönderebilirsin.',
    jsonb_build_object('invite_id', ri.id, 'room_id', r.id, 'role', 'host', 'accepted', true));
  return ri.id;
end $$;

-- Yazışmanın tarafı mıyım? 'host' (oda sahibi) / 'guest' (daveti kabul eden) / null
create or replace function public._room_invite_role(ri public.room_invites, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p_user = ri.user_id then 'guest'
              when p_user = (select g.host_id from public.game_rooms g where g.id = ri.room_id) then 'host' end;
$$;

-- Mesaj gönder: oda sahibi daveti kabul eden kişiye en çok 3, kabul eden kişi oda sahibine en çok 5 mesaj.
-- Mesaj karşı tarafa bildirim olarak gider (özel mesajlarda listelenmez). Bağlantı (link) yasaktır.
create or replace function public.room_invite_message(p_invite uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  ri public.room_invites;
  r public.game_rooms;
  v_role text;
  v_body text := btrim(coalesce(p_body, ''));
  v_to uuid;
  v_max int;
begin
  v := public._require_writer(null);
  select * into ri from public.room_invites where id = p_invite for update;
  if not found then raise exception 'invite_not_found'; end if;
  v_role := public._room_invite_role(ri, v.id);
  if v_role is null then raise exception 'forbidden'; end if;
  if ri.accepted_at is null then raise exception 'invite_not_accepted'; end if;
  select * into r from public.game_rooms where id = ri.room_id;
  if not found or r.status not in ('lobby', 'playing') or ri.closed_at is not null then raise exception 'room_chat_closed'; end if;
  if char_length(v_body) not between 1 and 200 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  v_max := case when v_role = 'host' then 3 else 5 end;
  if (select count(*) from public.room_invite_msgs m where m.invite_id = ri.id and m.sender_id = v.id) >= v_max then
    raise exception 'room_msg_limit';
  end if;
  insert into public.room_invite_msgs (invite_id, sender_id, body) values (ri.id, v.id, v_body);
  v_to := case when v_role = 'host' then ri.user_id else r.host_id end;
  perform public._notify(v_to, 'room_msg',
    case when v_role = 'host' then 'Oda sahibinden mesaj · ' else 'Davetlinden mesaj · ' end || v.full_name,
    v_body,
    jsonb_build_object('invite_id', ri.id, 'room_id', r.id, 'role', case when v_role = 'host' then 'guest' else 'host' end));
end $$;

-- Yazışma penceresi: karşı tarafın adı, mesajlar ve kalan hak
create or replace function public.room_invite_thread(p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ri public.room_invites;
  r public.game_rooms;
  v_role text;
  v_other uuid;
  v_max int;
begin
  if not public._is_active_user() then raise exception 'forbidden'; end if;
  select * into ri from public.room_invites where id = p_invite;
  if not found then raise exception 'invite_not_found'; end if;
  v_role := public._room_invite_role(ri, auth.uid());
  if v_role is null then raise exception 'forbidden'; end if;
  -- Kabul edilmemiş davette oda sahibi davetlinin adını göremez (yakındaki üyeler kabul etmeden tanınmasın)
  if v_role = 'host' and ri.accepted_at is null then raise exception 'invite_not_accepted'; end if;
  select * into r from public.game_rooms where id = ri.room_id;
  v_other := case when v_role = 'host' then ri.user_id else r.host_id end;
  v_max := case when v_role = 'host' then 3 else 5 end;
  return jsonb_build_object(
    'role', v_role,
    'other_name', (select p.full_name from public.profiles p where p.id = v_other),
    'game', (select gt.title from public.game_types gt where gt.key = r.game_type),
    'place_note', r.place_note,
    'open', r.status in ('lobby', 'playing') and ri.accepted_at is not null and ri.closed_at is null,
    'joined', ri.closed_at is not null and exists (select 1 from public.room_players rp
                                                   where rp.room_id = ri.room_id and rp.user_id = ri.user_id),
    'left', greatest(0, v_max - (select count(*)::int from public.room_invite_msgs m
                                  where m.invite_id = ri.id and m.sender_id = auth.uid())),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'mine', m.sender_id = auth.uid(),
                                                               'created_at', m.created_at) order by m.created_at)
                            from public.room_invite_msgs m where m.invite_id = ri.id), '[]'::jsonb));
end $$;

-- Daveti kabul ettim mi? (bildirimde "Kabul et" düğmesi için)
create or replace function public.my_room_invite(p_room_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('invite_id', ri.id, 'accepted', ri.accepted_at is not null,
                            'open', ri.closed_at is null and exists (select 1 from public.game_rooms g where g.id = ri.room_id
                                              and g.status in ('lobby', 'playing')),
                            'joined', exists (select 1 from public.room_players rp
                                               where rp.room_id = ri.room_id and rp.user_id = ri.user_id))
    from public.room_invites ri
   where ri.room_id = p_room_id and ri.user_id = auth.uid() and public._is_active_user();
$$;

-- Oda sahibinin oyun ekranındaki "Oyuncu davet et" penceresi: daveti kabul edenler ve kalan mesaj hakkı
create or replace function public.room_accepted_invites(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_active_user() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.game_rooms g where g.id = p_room_id and g.host_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'invite_id', ri.id,
             'name', p.full_name,
             'closed', ri.closed_at is not null,
             'joined', exists (select 1 from public.room_players rp where rp.room_id = ri.room_id and rp.user_id = ri.user_id),
             'left', greatest(0, 3 - (select count(*)::int from public.room_invite_msgs m
                                       where m.invite_id = ri.id and m.sender_id = auth.uid())),
             'replies', (select count(*)::int from public.room_invite_msgs m
                          where m.invite_id = ri.id and m.sender_id = ri.user_id))
           order by ri.accepted_at)
      from public.room_invites ri join public.profiles p on p.id = ri.user_id
     where ri.room_id = p_room_id and ri.accepted_at is not null), '[]'::jsonb);
end $$;

-- Davetli odaya girince: o davetin yazışması kapanır, mesajlar ve iki taraftaki davet/yazışma bildirimleri silinir
create or replace function public._room_invite_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare ri public.room_invites;
begin
  update public.room_invites set closed_at = now()
   where room_id = new.room_id and user_id = new.user_id and closed_at is null
  returning * into ri;
  if not found then return null; end if;
  delete from public.room_invite_msgs where invite_id = ri.id;
  delete from public.notifications n
   where n.kind in ('room_msg', 'game_invite') and n.data->>'room_id' = ri.room_id::text
     and (n.user_id = ri.user_id or n.data->>'invite_id' = ri.id::text);
  return null;
end $$;
drop trigger if exists on_room_invite_joined on public.room_players;
create trigger on_room_invite_joined
  after insert on public.room_players
  for each row execute function public._room_invite_joined();

-- Oda kapanınca (bitti / iptal): bütün davetlerin yazışması kapanır; davet ve oda yazışması bildirimleri ile mesajlar
-- silinir. Oda kapatıldıysa (iptal) odaya girmemiş davetlilere "Oda kapatıldı" bildirimi bırakılır.
create or replace function public._room_closed_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_users uuid[] := '{}'::uuid[];
  v_u uuid;
begin
  select title into v_title from public.game_types where key = new.game_type;
  if new.status = 'cancelled' then
    select coalesce(array_agg(distinct u), '{}'::uuid[]) into v_users from (
      select n.user_id as u from public.notifications n
       where n.kind = 'game_invite' and n.data->>'room_id' = new.id::text
      union
      select ri.user_id from public.room_invites ri
       where ri.room_id = new.id and ri.accepted_at is not null and ri.closed_at is null
    ) z where u <> new.host_id;
  end if;
  update public.room_invites set closed_at = coalesce(closed_at, now()) where room_id = new.id;
  delete from public.notifications n
   where n.kind in ('room_msg', 'game_invite') and n.data->>'room_id' = new.id::text;
  delete from public.room_invite_msgs m
   using public.room_invites ri where ri.id = m.invite_id and ri.room_id = new.id;
  foreach v_u in array v_users loop
    perform public._notify(v_u, 'system', 'Oda kapatıldı: ' || coalesce(v_title, new.game_type),
      'Oyun odası kapandı. Bu oyun daveti artık geçerli değil; yazışma da kapandı.',
      jsonb_build_object('room_closed', new.id));
  end loop;
  return null;
end $$;
drop trigger if exists on_room_closed_cleanup on public.game_rooms;
create trigger on_room_closed_cleanup
  after update of status on public.game_rooms
  for each row
  when (new.status in ('finished', 'cancelled') and old.status is distinct from new.status)
  execute function public._room_closed_cleanup();

-- ---- Etkinlik ekipleri ----------------------------------------------

-- Ekip değişiklikleri (ekip arama, davet, kabul, ayrılma) yalnızca etkinlik başlamadan yapılır
create or replace function public._team_event(p_event uuid)
returns public.events language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event and not is_cancelled;
  if not found then raise exception 'event_not_found'; end if;
  if now() >= e.starts_at then raise exception 'event_started'; end if;
  return e;
end $$;

-- Ekip arıyorum / aramıyorum (kayıtlı üye)
create or replace function public.set_team_seeking(p_event_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_writer(null);
  perform public._team_event(p_event_id);
  update public.event_registrations set seeking_team = coalesce(p_on, false)
   where event_id = p_event_id and user_id = v.id;
  if not found then raise exception 'not_registered'; end if;
end $$;

-- Ekip arayanlar (gerçek adlarıyla): yalnızca o etkinlikte kendisi de ekip arayan ya da bir ekipte olan kayıtlı üyeye
drop function if exists public.list_team_seekers(uuid);
create or replace function public.list_team_seekers(p_event_id uuid)
returns table (user_id uuid, full_name text, in_my_team boolean, team_size int, invited_by_me boolean, invited_me boolean,
               seeking boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_team uuid;
begin
  if not public._is_active_user() then return; end if;
  select m.team_id into v_team from public.event_team_members m where m.event_id = p_event_id and m.user_id = auth.uid();
  if not exists (select 1 from public.event_registrations er
                  where er.event_id = p_event_id and er.user_id = auth.uid() and (er.seeking_team or v_team is not null)) then
    raise exception 'not_seeking';
  end if;
  return query
  select er.user_id, p.full_name,
         (v_team is not null and m.team_id = v_team),
         coalesce((select count(*)::int from public.event_team_members m3 where m3.team_id = m.team_id), 0),
         exists (select 1 from public.event_team_invites i where i.event_id = p_event_id and i.from_user = auth.uid()
                    and i.to_user = er.user_id and i.status = 'pending'),
         exists (select 1 from public.event_team_invites i where i.event_id = p_event_id and i.to_user = auth.uid()
                    and i.from_user = er.user_id and i.status = 'pending'),
         er.seeking_team
    from public.event_registrations er
    join public.profiles p on p.id = er.user_id and p.banned_at is null
    left join public.event_team_members m on m.event_id = er.event_id and m.user_id = er.user_id
   where er.event_id = p_event_id and er.user_id <> auth.uid()
     and (er.seeking_team or (v_team is not null and m.team_id = v_team))
     and not exists (select 1 from public.user_blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = er.user_id)
                         or (b.blocker_id = er.user_id and b.blocked_id = auth.uid()))
   order by 3 desc, p.full_name
   limit 200;
end $$;

-- Ekip daveti gönder (gerçek adınla). Karşı taraf ekip arıyor olmalı ve bir ekipte olmamalı.
create or replace function public.send_team_invite(p_event_id uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
  v_team uuid;
  v_size int;
  v_id uuid;
begin
  v := public._require_writer(null);
  e := public._team_event(p_event_id);
  if p_to is null or p_to = v.id then raise exception 'invalid_target'; end if;
  if not exists (select 1 from public.event_registrations where event_id = e.id and user_id = v.id) then
    raise exception 'not_registered';
  end if;
  if not exists (select 1 from public.event_registrations er join public.profiles p on p.id = er.user_id
                  where er.event_id = e.id and er.user_id = p_to and er.seeking_team and p.banned_at is null) then
    raise exception 'target_not_seeking';
  end if;
  if exists (select 1 from public.event_team_members where event_id = e.id and user_id = p_to) then
    raise exception 'target_in_team';
  end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id = v.id and b.blocked_id = p_to)
                                                  or (b.blocker_id = p_to and b.blocked_id = v.id)) then
    raise exception 'invalid_target';
  end if;
  select team_id into v_team from public.event_team_members where event_id = e.id and user_id = v.id;
  if v_team is not null then
    select count(*)::int into v_size from public.event_team_members where team_id = v_team;
    if v_size >= public.setting_int('team_max_size', 8) then raise exception 'team_full'; end if;
  end if;
  if (select count(*) from public.event_team_invites where from_user = v.id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into public.event_team_invites (event_id, from_user, to_user) values (e.id, v.id, p_to)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then raise exception 'already_invited'; end if;
  perform public._notify(p_to, 'team_invite', 'Ekip daveti',
    v.full_name || ' seni “' || left(e.title, 60) || '” etkinliğinde ekibine çağırıyor. Kabul edersen iletişim bilgin yalnızca ona gönderilir.',
    jsonb_build_object('invite_id', v_id, 'event_id', e.id, 'route', '/events', 'from_name', v.full_name,
                       'event_title', e.title, 'status', 'pending'));
end $$;

-- Ekipten bir kişiyi çıkarır (iç kullanım): bekleyen davetleri iptal olur, ekipte tek kişi kalırsa ekip dağılır
create or replace function public._team_remove_member(p_event uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  perform pg_advisory_xact_lock(hashtext('team:' || p_event::text));
  update public.event_team_invites set status = 'cancelled', responded_at = now()
   where event_id = p_event and status = 'pending' and (from_user = p_user or to_user = p_user);
  update public.event_registrations set seeking_team = false where event_id = p_event and user_id = p_user;
  delete from public.event_team_members where event_id = p_event and user_id = p_user returning team_id into v_team;
  if v_team is not null and (select count(*) from public.event_team_members where team_id = v_team) < 2 then
    delete from public.event_teams where id = v_team;
  end if;
end $$;

-- Ekip davetine yanıt. Kabulde iletişim bilgisi (3–200 karakter) zorunludur; yalnızca daveti gönderene bildirim olarak gider.
create or replace function public.respond_team_invite(p_invite_id uuid, p_accept boolean, p_contact text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  i public.event_team_invites;
  e public.events;
  v_contact text := btrim(coalesce(p_contact, ''));
  v_team uuid;
  v_size int;
begin
  v := public._require_writer(null);
  select * into i from public.event_team_invites where id = p_invite_id and to_user = v.id for update;
  if not found or i.status <> 'pending' then raise exception 'invite_not_found'; end if;
  if not coalesce(p_accept, false) then
    update public.event_team_invites set status = 'declined', responded_at = now() where id = i.id;
    update public.notifications set data = data || '{"status":"declined"}'::jsonb
     where user_id = v.id and kind = 'team_invite' and data ->> 'invite_id' = i.id::text;
    return;
  end if;
  e := public._team_event(i.event_id);
  if char_length(v_contact) not between 3 and 200 then raise exception 'invalid_contact'; end if;
  perform pg_advisory_xact_lock(hashtext('team:' || e.id::text));
  if not exists (select 1 from public.event_registrations where event_id = e.id and user_id = v.id) then
    raise exception 'not_registered';
  end if;
  if not exists (select 1 from public.event_registrations er join public.profiles p on p.id = er.user_id
                  where er.event_id = e.id and er.user_id = i.from_user and p.banned_at is null) then
    update public.event_team_invites set status = 'cancelled', responded_at = now() where id = i.id;
    raise exception 'invite_not_found';
  end if;
  if exists (select 1 from public.event_team_members where event_id = e.id and user_id = v.id) then
    raise exception 'already_in_team';
  end if;
  select team_id into v_team from public.event_team_members where event_id = e.id and user_id = i.from_user;
  if v_team is null then
    insert into public.event_teams (event_id) values (e.id) returning id into v_team;
    insert into public.event_team_members (event_id, user_id, team_id) values (e.id, i.from_user, v_team);
  end if;
  select count(*)::int into v_size from public.event_team_members where team_id = v_team;
  if v_size >= public.setting_int('team_max_size', 8) then raise exception 'team_full'; end if;
  insert into public.event_team_members (event_id, user_id, team_id) values (e.id, v.id, v_team);
  update public.event_team_invites set status = 'accepted', contact = v_contact, responded_at = now() where id = i.id;
  update public.notifications set data = data || '{"status":"accepted"}'::jsonb
   where user_id = v.id and kind = 'team_invite' and data ->> 'invite_id' = i.id::text;
  perform public._notify(i.from_user, 'system', 'Ekip davetin kabul edildi',
    v.full_name || ' “' || left(e.title, 60) || '” etkinliğinde ekibine katıldı. İletişim bilgisi: ' || v_contact,
    jsonb_build_object('route', '/events', 'event_id', e.id));
end $$;

-- Ekipten ayrıl (etkinlik başlamadan)
create or replace function public.leave_event_team(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  perform public._team_event(p_event_id);
  if not exists (select 1 from public.event_team_members where event_id = p_event_id and user_id = v.id) then
    raise exception 'not_in_team';
  end if;
  perform public._team_remove_member(p_event_id, v.id);
end $$;

-- Ekip bonusu: ekipten kodla katılımı doğrulananların sayısına göre (2: x1,25 · 4: x1,5 · 8: x2) her üyenin katılım
-- puanına ek. Yalnızca katılım puanı yazılmış (attend_points > 0) üyeler alır; günlük/kategori kuralları aynen geçerli.
-- Her doğrulamada yeniden hesaplanır, eksik kalan fark yazılır (çifte yazma yok). Etkinlik iptal edilirse geri alınır.
create or replace function public._award_team_bonus(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  r record;
  v_mult numeric;
  v_target int;
  v_given int;
begin
  select title into v_title from public.events where id = p_event and not is_cancelled;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('team_bonus:' || p_event::text));
  for r in
    select m.user_id, er.attend_points,
           (select count(*)::int from public.event_team_members m2
              join public.event_registrations er2 on er2.event_id = m2.event_id and er2.user_id = m2.user_id
             where m2.team_id = m.team_id and er2.checked_in_at is not null) as n
      from public.event_team_members m
      join public.event_registrations er on er.event_id = m.event_id and er.user_id = m.user_id
     where m.event_id = p_event and er.checked_in_at is not null and er.attend_points > 0
  loop
    v_mult := case when r.n >= 8 then 2.0 when r.n >= 4 then 1.5 when r.n >= 2 then 1.25 else 1.0 end;
    v_target := round(r.attend_points * (v_mult - 1))::int;
    select coalesce(sum(pe.amount), 0)::int into v_given
      from public.point_events pe where pe.user_id = r.user_id and pe.event_id = p_event and pe.source = 'event_team';
    if v_target > v_given then
      perform public._award_points(r.user_id, v_target - v_given, 'event_team',
        'Ekip bonusu (' || r.n || ' kişi, x' || replace(trim(to_char(v_mult, 'FM0.00')), '.', ',') || '): ' || left(v_title, 40),
        p_event);
    end if;
  end loop;
end $$;

-- Geçen haftanın (pazartesi–pazar, Türkiye saati) kesinleşmiş sıralaması. p_game boşsa genel puan, doluysa o oyunun puanı.
drop function if exists public.get_last_week_leaderboard(text, int);
create or replace function public.get_last_week_leaderboard(p_game text default null, p_limit int default 10)
returns table (place bigint, full_name text, score numeric, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_we timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_ws timestamptz := (date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '7 days') at time zone 'Europe/Istanbul';
  v_lim int := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if not public._is_active_user() then return; end if;
  if p_game is not null and (p_game = 'raffle' or not exists (select 1 from public.game_types where key = p_game)) then
    return;
  end if;
  return query
  with m as (
    select x.user_id, sum(x.amt) as pts
      from (
        select pe.user_id, pe.amount as amt from public.point_events pe
         where p_game is null and pe.created_at >= v_ws and pe.created_at < v_we
        union all
        select gl.user_id, gl.points from public.game_play_log gl
         where p_game is not null and gl.game_type = p_game and gl.created_at >= v_ws and gl.created_at < v_we
      ) x
     group by x.user_id
    having sum(x.amt) > 0
  ), t as (
    select dense_rank() over (order by m.pts desc) as place, pr.full_name as fname, m.pts, (pr.id = auth.uid()) as me
      from m join public.profiles pr on pr.id = m.user_id
     where pr.banned_at is null and pr.role = 'user'
  )
  select t.place, t.fname, t.pts, t.me from t where t.place <= v_lim or t.me order by t.place, t.fname;
end $$;

-- ---------------------------------------------------------------------
-- 5j) Etkinlik lideri başvurusu
-- ---------------------------------------------------------------------

-- Başvur: ad soyad, telefon (yalnızca rakam ve +), düzenlediği etkinlik türleri, ortalama kitle. Aynı anda tek bekleyen
-- başvuru; reddedilen 7 gün sonra yeniden başvurabilir. Lider olan, mekân hesabı ve moderatör başvuramaz.
create or replace function public.apply_event_leader(p_full_name text, p_phone text, p_categories text[], p_audience text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_cats text[];
  v_id uuid;
begin
  v := public._require_writer(null);
  if v.role <> 'user' then raise exception 'forbidden'; end if;
  if v.event_leader then raise exception 'already_leader'; end if;
  if char_length(v_name) not between 2 and 60 then raise exception 'invalid_name'; end if;
  if v_phone !~ '^[0-9+]{10,16}$' then raise exception 'invalid_phone'; end if;
  select coalesce(array_agg(distinct c), '{}') into v_cats
    from unnest(coalesce(p_categories, '{}'::text[])) c
   where c in ('konser_festival', 'oyun_gecesi', 'araba_motor', 'sosyal', 'muzik', 'spor', 'kultur', 'atolye', 'yemek', 'diger');
  if cardinality(v_cats) = 0 then raise exception 'invalid_categories'; end if;
  if p_audience is null or p_audience not in ('1-10', '10-30', '30-100', '100+') then raise exception 'invalid_audience'; end if;
  if exists (select 1 from public.event_leader_applications where user_id = v.id and status = 'pending') then
    raise exception 'application_pending';
  end if;
  if exists (select 1 from public.event_leader_applications
              where user_id = v.id and status = 'rejected' and resolved_at > now() - interval '7 days') then
    raise exception 'recently_rejected';
  end if;
  insert into public.event_leader_applications (user_id, full_name, phone, categories, audience)
  values (v.id, v_name, v_phone, v_cats, p_audience)
  returning id into v_id;
  return v_id;
end $$;

-- Moderatör: başvurular (varsayılan bekleyenler; 'closed' = sonuçlananlar). Telefon yalnızca burada görünür.
drop function if exists public.admin_list_leader_applications(text);
create or replace function public.admin_list_leader_applications(p_status text default 'pending')
returns table (id uuid, user_id uuid, full_name text, profile_name text, phone text, categories text[], audience text,
               status text, admin_note text, created_at timestamptz, is_leader boolean, is_premium boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select a.id, a.user_id, a.full_name, p.full_name, a.phone, a.categories, a.audience, a.status, a.admin_note,
         a.created_at, p.event_leader, (p.premium_until is not null and p.premium_until > now())
    from public.event_leader_applications a
    join public.profiles p on p.id = a.user_id
   where (p_status = 'pending' and a.status = 'pending') or (p_status <> 'pending' and a.status <> 'pending')
   order by a.created_at desc
   limit 100;
end $$;

-- Moderatör: başvuruyu onayla (üye Etkinlik Lideri olur) ya da reddet. Üyeye bildirim gider.
create or replace function public.admin_resolve_leader_application(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.event_leader_applications;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  perform public._require_admin();
  select * into a from public.event_leader_applications where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if a.status <> 'pending' then raise exception 'request_closed'; end if;
  update public.event_leader_applications
     set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
         admin_note = v_note, resolved_by = auth.uid(), resolved_at = now()
   where id = a.id;
  if coalesce(p_approve, false) then
    update public.profiles set event_leader = true where id = a.user_id;
    perform public._notify(a.user_id, 'system', 'Etkinlik lideri başvurun onaylandı',
      'Artık ayda ' || public.setting_int('leader_monthly_event_quota', 8) || ' etkinlik açabilirsin.'
        || coalesce(' Not: ' || v_note, ''), jsonb_build_object('route', '/events'));
  else
    perform public._notify(a.user_id, 'system', 'Etkinlik lideri başvurun sonuçlandı',
      'Başvurun şu an onaylanmadı. 7 gün sonra yeniden başvurabilirsin.' || coalesce(' Not: ' || v_note, ''), '{}'::jsonb);
  end if;
  perform public._audit(case when coalesce(p_approve, false) then 'leader_approved' else 'leader_rejected' end,
    a.user_id, jsonb_build_object('application_id', a.id));
end $$;

-- Moderatör: üyenin liderliğini kaldır
create or replace function public.admin_set_event_leader(p_user_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.profiles set event_leader = coalesce(p_on, false) where id = p_user_id and role = 'user';
  if not found then raise exception 'user_not_found'; end if;
  perform public._audit(case when coalesce(p_on, false) then 'leader_set' else 'leader_removed' end, p_user_id, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5k) Etkinlik görseli ve moderatör onayları, oyunlarda şu an oynayan sayısı
-- ---------------------------------------------------------------------

-- Etkinliğe görsel bağla (p_path boşsa kaldır). Dosya önce Storage'daki "event-images" kutusuna
-- <üye kimliği>/<etkinlik kimliği>/<dosya> yoluna yüklenir (en çok 2 MB, jpg/png/webp; kutu kuralları zorlar).
-- Üyenin görseli moderatör onaylayana kadar yalnızca kendisine görünür; moderatörünki hemen yayına girer.
create or replace function public.set_event_image(p_event_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  v := public._require_writer(null);
  select * into e from public.events where id = p_event_id and not is_cancelled for update;
  if not found then raise exception 'event_not_found'; end if;
  if e.created_by is distinct from v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if now() > public._event_end(e.starts_at, e.category) then raise exception 'event_ended'; end if;
  -- Görsel bir kez eklenir; kaldırılamaz ve değiştirilemez (moderatör reddederse yenisi eklenebilir)
  if v.role <> 'admin' and (v_path is null or (e.image_path is not null and e.image_status is distinct from 'rejected')) then
    raise exception 'image_locked';
  end if;
  if v_path is not null then
    if v_path !~ ('^' || v.id::text || '/' || e.id::text || '/[A-Za-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$') then
      raise exception 'invalid_image';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'event-images' and o.name = v_path) then
      raise exception 'invalid_image';
    end if;
  end if;
  update public.events
     set image_path = v_path,
         image_status = case when v_path is null then null when v.role = 'admin' then 'approved' else 'pending' end
   where id = e.id;
end $$;

-- Storage kuralı için: üyenin "event-images" kutusundaki dosya sayısı (kötüye kullanıma karşı sınır)
-- Storage kuralı: etkinlik başına tek görsel. Yol <üye kimliği>/<etkinlik kimliği>/<dosya> olmalı, etkinlik bu üyenin
-- (ya da moderatörün) olmalı ve o etkinliğin klasöründe başka dosya bulunmamalı (yenisi için eskisi önce silinir).
-- Not: eski sürümdeki _my_event_image_count() silinmez (eski Storage kuralı ona bağlı olabilir); kural aşağıda yenilenir.
create or replace function public._event_image_slot_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(p_name))[1] = auth.uid()::text
     and cardinality(storage.foldername(p_name)) = 2
     and exists (select 1 from public.events e
                  where e.id::text = (storage.foldername(p_name))[2] and not e.is_cancelled
                    and (e.created_by = auth.uid() or public.is_admin()))
     and (public.is_admin() or exists (select 1 from public.events e
                  where e.id::text = (storage.foldername(p_name))[2]
                    and (e.image_path is null or e.image_status = 'rejected')))
     and (select count(*) from storage.objects o
           where o.bucket_id = 'event-images'
             and (storage.foldername(o.name))[1] = auth.uid()::text
             and (storage.foldername(o.name))[2] = (storage.foldername(p_name))[2]) < 3;
$$;

-- Moderatör: onay bekleyen Konser & Festival etkinlikleri ve etkinlik görselleri
drop function if exists public.admin_list_event_approvals();
create or replace function public.admin_list_event_approvals()
returns table (id uuid, title text, description text, location text, starts_at timestamptz, category text,
               host_name text, approval text, image_path text, image_status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select e.id, e.title, e.description, e.location, e.starts_at, e.category, coalesce(h.full_name, 'Silinmiş hesap'),
         e.approval, e.image_path, e.image_status, e.created_at
    from public.events e
    left join public.profiles h on h.id = e.created_by
   where not e.is_cancelled
     and public._event_end(e.starts_at, e.category) > now()
     and (e.approval = 'pending' or e.image_status = 'pending')
   order by e.created_at
   limit 100;
end $$;

-- Moderatör: etkinliği (p_target 'event') ya da görselini (p_target 'image') onayla / reddet. Düzenleyene bildirim gider.
-- Reddedilen etkinlik kapanır ve düzenleyenin aylık hakkından düşmez.
create or replace function public.admin_review_event(p_event_id uuid, p_target text, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  v_ok boolean := coalesce(p_approve, false);
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  perform public._require_admin();
  select * into e from public.events where id = p_event_id for update;
  if not found or e.is_cancelled then raise exception 'request_not_found'; end if;
  if p_target = 'event' then
    if e.approval <> 'pending' then raise exception 'request_closed'; end if;
    if v_ok then
      update public.events set approval = 'approved', approval_note = v_note where id = e.id;
      perform public._award_event_create(e.id);
    else
      update public.events set approval = 'rejected', approval_note = v_note, is_cancelled = true where id = e.id;
      delete from public.event_registrations where event_id = e.id;
    end if;
    if e.created_by is not null then
      perform public._notify(e.created_by, 'system',
        case when v_ok then 'Etkinliğin onaylandı' else 'Etkinliğin onaylanmadı' end,
        '“' || left(e.title, 60) || '”' ||
          case when v_ok then ' artık herkese görünüyor.' else ' yayına alınmadı; aylık hakkından düşmedi.' end
          || coalesce(' Not: ' || v_note, ''),
        case when v_ok then jsonb_build_object('route', '/events') else '{}'::jsonb end);
    end if;
    perform public._audit(case when v_ok then 'event_approved' else 'event_rejected' end, e.created_by,
      jsonb_build_object('event_id', e.id, 'title', e.title));
  elsif p_target = 'image' then
    if e.image_status is distinct from 'pending' then raise exception 'request_closed'; end if;
    update public.events
       set image_status = case when v_ok then 'approved' else 'rejected' end,
           image_path = case when v_ok then image_path end
     where id = e.id;
    if e.created_by is not null then
      perform public._notify(e.created_by, 'system',
        case when v_ok then 'Etkinlik görselin onaylandı' else 'Etkinlik görselin onaylanmadı' end,
        '“' || left(e.title, 60) || '”' || case when v_ok then ' görseliyle görünüyor.' else ' için başka bir görsel yükleyebilirsin.' end
          || coalesce(' Not: ' || v_note, ''),
        jsonb_build_object('route', '/events'));
    end if;
    perform public._audit(case when v_ok then 'event_image_approved' else 'event_image_rejected' end, e.created_by,
      jsonb_build_object('event_id', e.id));
  else
    raise exception 'invalid_type';
  end if;
end $$;

-- Her oyunda şu an odada olan (bekleme salonu + oynayan) kişi sayısı. Kim olduğu gösterilmez.
drop function if exists public.game_player_counts();
create or replace function public.game_player_counts()
returns table (game_type text, players int)
language sql stable security definer set search_path = public as $$
  select x.game_type, count(distinct x.uid)::int
    from (
      select r.game_type, rp.user_id as uid
        from public.game_rooms r
        join public.game_types gt on gt.key = r.game_type
        join public.room_players rp on rp.room_id = r.id and rp.left_at is null
       where r.status in ('lobby', 'playing')
         and r.created_at > now() - interval '12 hours'
         and (not gt.presence_required or r.host_seen_at > public._presence_cutoff())
      union all
      -- Bilgi Yarışması: maçtakiler ve rakip arayanlar
      select 'quiz', mp.user_id
        from public.quiz_matches m join public.quiz_match_players mp on mp.match_id = m.id and mp.left_at is null
       where m.status = 'playing' and mp.last_seen_at > now() - interval '30 seconds'
      union all
      select 'quiz', q.user_id from public.quiz_queue q where q.last_seen_at > now() - interval '12 seconds'
      union all
      select 'quiz', sr.user_id from public.quiz_solo_runs sr
       where sr.status = 'playing' and sr.last_seen_at > now() - interval '30 seconds'
      union all
      -- Bilgi Yarışması ekranında olanlar
      select 'quiz', qp.user_id from public.quiz_presence qp where qp.seen_at > now() - interval '45 seconds'
    ) x
   where public._is_active_user()
   group by x.game_type;
$$;

-- ---------------------------------------------------------------------
-- 5l) Hazine Avı
-- ---------------------------------------------------------------------

-- Kodu karşılaştırmak için sadeleştirme: Türkçe harfler sadeleşir, harf dışı her şey tek boşluk olur
create or replace function public._treasure_key(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(public._tr_fold(coalesce(p, '')), '[^a-z]+', ' ', 'g'));
$$;

-- 3 rastgele kelime (kurtarma kelimeleri listesinden, güvenli rastgele sayı ile)
create or replace function public._treasure_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  w text[] := public._recovery_words();
  n int := cardinality(w);
  b bytea := extensions.gen_random_bytes(6);
begin
  return w[1 + ((get_byte(b, 0) * 256 + get_byte(b, 1)) % n)] || ' ' ||
         w[1 + ((get_byte(b, 2) * 256 + get_byte(b, 3)) % n)] || ' ' ||
         w[1 + ((get_byte(b, 4) * 256 + get_byte(b, 5)) % n)];
end $$;

create or replace function public._treasure_points(p_difficulty text)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, case p_difficulty
    when 'kolay' then public.setting_int('treasure_pts_kolay', 25)
    when 'orta' then public.setting_int('treasure_pts_orta', 60)
    when 'zor' then public.setting_int('treasure_pts_zor', 120)
    when 'imkansiz' then public.setting_int('treasure_pts_imkansiz', 500)
    else 0 end);
$$;

-- Haritadaki etkin hazineler (kod hiç gelmez): petek, zorluk, ipucu, son gün ve puanı
drop function if exists public.list_treasures();
create or replace function public.list_treasures()
returns table (id uuid, cell_q int, cell_r int, difficulty text, hint text, expires_at timestamptz, points int,
               image_paths text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.cell_q, t.cell_r, t.difficulty, t.hint, t.expires_at, public._treasure_points(t.difficulty),
         t.image_paths
    from public.treasures t
   where public._is_active_user()
     and t.found_at is null and t.removed_at is null and t.expires_at > now()
   order by case t.difficulty when 'imkansiz' then 0 when 'zor' then 1 when 'orta' then 2 else 3 end, t.created_at;
$$;

-- Benim hazine durumum: bu ay bulduklarım, aylık sınır ve zorluk başına puanlar
create or replace function public.my_treasure_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'found_this_month', (select count(*)::int from public.treasures t
                          where t.found_by = auth.uid() and t.found_at >= public._month_start()),
    'monthly_limit', greatest(1, public.setting_int('treasure_monthly_limit', 3)),
    'found_total', (select count(*)::int from public.treasures t where t.found_by = auth.uid()),
    'lifetime', public._has_reward(auth.uid(), 'treasure_master'),
    'points', jsonb_build_object('kolay', public._treasure_points('kolay'), 'orta', public._treasure_points('orta'),
                                 'zor', public._treasure_points('zor'), 'imkansiz', public._treasure_points('imkansiz'))
  )
  where public._is_active_user();
$$;

-- Hazine kodunu gir. p_my_q/r: telefonun bir kez aldığı konumun peteği (hazinenin peteğine en çok 1 petek).
-- Yanlış kod da uzaklık da aynı cevabı alır (kodun doğru olduğu sızmasın) ve deneme sayılır:
-- saatte 6, günde 20 yanlış denemeden sonra yeni deneme reddedilir. Ayda en çok treasure_monthly_limit (3) hazine.
create or replace function public.redeem_treasure(p_code text, p_my_q int, p_my_r int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.treasures;
  v_key text := public._treasure_key(p_code);
  v_pts int;
  a record;
begin
  v := public._require_user();
  if v.role <> 'user' then raise exception 'forbidden'; end if;
  if p_my_q is null or p_my_r is null then raise exception 'location_required'; end if;
  delete from public.treasure_failures where failed_at < now() - interval '1 day';
  if (select count(*) from public.treasure_failures where user_id = v.id and failed_at > now() - interval '1 hour') >= 6
     or (select count(*) from public.treasure_failures where user_id = v.id) >= 20 then
    raise exception 'too_many_attempts';
  end if;
  perform pg_advisory_xact_lock(hashtext('treasure:' || v.id::text));
  if (select count(*) from public.treasures where found_by = v.id and found_at >= public._month_start())
     >= greatest(1, public.setting_int('treasure_monthly_limit', 3)) then
    raise exception 'treasure_monthly_limit';
  end if;
  select * into t from public.treasures
   where code_key = v_key and found_at is null and removed_at is null and expires_at > now()
   for update;
  if not found or public._hex_dist(t.cell_q, t.cell_r, p_my_q, p_my_r) > greatest(0, public.setting_int('treasure_find_distance', 1)) then
    insert into public.treasure_failures (user_id) values (v.id);
    return jsonb_build_object('ok', false);
  end if;
  v_pts := public._treasure_points(t.difficulty);
  update public.treasures set found_by = v.id, found_at = now(), admin_seen = false where id = t.id;
  perform public._award_points(v.id, v_pts, 'treasure', 'Hazine buldun (' ||
    case t.difficulty when 'kolay' then 'kolay' when 'orta' then 'orta' when 'zor' then 'zor' else 'imkânsız' end || ')');
  insert into public.game_play_log (user_id, game_type, points, won) values (v.id, 'treasure_hunt', v_pts, true);
  insert into public.user_game_stats (user_id, game_type, plays, wins)
  values (v.id, 'treasure_hunt', 1, 1)
  on conflict (user_id, game_type)
  do update set plays = public.user_game_stats.plays + 1, wins = public.user_game_stats.wins + 1, updated_at = now();
  -- Moderatörlere bildirim
  for a in select id from public.profiles where role = 'admin' and banned_at is null loop
    perform public._notify(a.id, 'system', 'Hazine bulundu',
      'Bir üye ' || case t.difficulty when 'imkansiz' then 'imkânsız' else t.difficulty end
        || ' hazineyi buldu (kod: ' || t.code || '). Ayrıntı Moderatör paneli > Hazineler’de.',
      jsonb_build_object('q', t.cell_q, 'r', t.cell_r));
  end loop;
  return jsonb_build_object('ok', true, 'points', v_pts, 'difficulty', t.difficulty, 'q', t.cell_q, 'r', t.cell_r);
end $$;

-- Moderatör: peteğe hazine gizle. Kod sunucuda üretilir ve yalnızca cevapta (ve moderatör listesinde) görünür.
-- Bir petekte aynı anda tek etkin hazine; ayda en çok treasure_month_max (300) hazine.
drop function if exists public.admin_create_treasure(int, int, text, text, timestamptz);
create or replace function public.admin_create_treasure(p_q int, p_r int, p_difficulty text, p_hint text, p_expires_at timestamptz)
returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hint text := btrim(regexp_replace(coalesce(p_hint, ''), '\s+', ' ', 'g'));
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  perform public._require_admin();
  if not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  if p_difficulty is null or p_difficulty not in ('kolay', 'orta', 'zor', 'imkansiz') then raise exception 'invalid_difficulty'; end if;
  if char_length(v_hint) not between 3 and 300 then raise exception 'invalid_hint'; end if;
  if p_expires_at is null or p_expires_at < now() + interval '1 hour' or p_expires_at > now() + interval '120 days' then
    raise exception 'invalid_expiry';
  end if;
  if exists (select 1 from public.treasures t where t.cell_q = p_q and t.cell_r = p_r
               and t.found_at is null and t.removed_at is null and t.expires_at > now()) then
    raise exception 'treasure_exists';
  end if;
  if (select count(*) from public.treasures t where t.created_at >= public._month_start())
     >= greatest(1, public.setting_int('treasure_month_max', 300)) then
    raise exception 'treasure_month_max';
  end if;
  loop
    v_try := v_try + 1;
    v_code := public._treasure_code();
    exit when not exists (select 1 from public.treasures t
                           where t.code_key = public._treasure_key(v_code) and t.found_at is null and t.removed_at is null);
    if v_try > 20 then raise exception 'code_failed'; end if;
  end loop;
  insert into public.treasures (cell_q, cell_r, code, code_key, hint, difficulty, expires_at, created_by)
  values (p_q, p_r, v_code, public._treasure_key(v_code), v_hint, p_difficulty, p_expires_at, auth.uid())
  returning treasures.id into v_id;
  perform public._audit('treasure_create', null, jsonb_build_object('treasure_id', v_id, 'q', p_q, 'r', p_r,
    'difficulty', p_difficulty));
  insert into public.announcements (title, body, created_by, kind)
  values ('Haritaya yeni hazine gizlendi!',
          'Haritaya ' || case p_difficulty when 'imkansiz' then 'imkânsız' else p_difficulty end
            || ' bir hazine eklendi. Oyunlar > Hazine Avı’ndan ipucuna bak, ilk bulan sen ol!', auth.uid(),
          'treasure');
  return query select v_id, v_code;
end $$;

-- Moderatör: hazineyi kaldır
create or replace function public.admin_remove_treasure(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.treasures set removed_at = now() where id = p_id and found_at is null and removed_at is null;
  if not found then raise exception 'request_not_found'; end if;
  perform public._audit('treasure_remove', null, jsonb_build_object('treasure_id', p_id));
end $$;

-- Moderatör: hazineler ('active' = etkin, 'found' = bulunanlar, 'all' = süresi geçen/kaldırılan dahil son 200)
drop function if exists public.admin_list_treasures(text);
create or replace function public.admin_list_treasures(p_status text default 'active')
returns table (id uuid, cell_q int, cell_r int, code text, hint text, difficulty text, expires_at timestamptz,
               created_at timestamptz, found_at timestamptz, finder_name text, removed_at timestamptz, admin_seen boolean,
               image_paths text[])
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select t.id, t.cell_q, t.cell_r, t.code, t.hint, t.difficulty, t.expires_at, t.created_at, t.found_at,
         f.full_name, t.removed_at, t.admin_seen, t.image_paths
    from public.treasures t
    left join public.profiles f on f.id = t.found_by
   where case coalesce(p_status, 'active')
           when 'active' then t.found_at is null and t.removed_at is null and t.expires_at > now()
           when 'found' then t.found_at is not null
           else true end
   order by coalesce(t.found_at, t.created_at) desc
   limit 200;
end $$;

-- Moderatör: bulunan hazineleri görüldü say (bildirim rozeti söner)
create or replace function public.admin_mark_treasures_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.treasures set admin_seen = true where not admin_seen;
end $$;

-- Moderatör: hazinenin ipucu fotoğrafları (en çok 3). Dosyalar önce "treasure-images" kutusuna
-- treasures/<hazine kimliği>/<dosya> yoluna yüklenir (en çok 2 MB, jpg/png/webp).
create or replace function public.admin_set_treasure_images(p_id uuid, p_paths text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paths text[] := coalesce(p_paths, '{}');
  x text;
begin
  perform public._require_admin();
  if cardinality(v_paths) > 3 then raise exception 'too_many_images'; end if;
  foreach x in array v_paths loop
    if x !~ ('^treasures/' || p_id::text || '/[A-Za-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'treasure-images' and o.name = x) then
      raise exception 'invalid_image';
    end if;
  end loop;
  update public.treasures set image_paths = v_paths where id = p_id and removed_at is null;
  if not found then raise exception 'request_not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 5n) Etkinlik puanlama
--     Puan veren: her puanlamada pts_event_rate (2), ayda en çok pts_event_rate_month (10) puanlama için.
--     Düzenleyen: 5 yıldızda pts_event_rated_5 (4), 4 yıldızda pts_event_rated_4 (2), daha azında 0; ayda en çok
--     pts_event_rated_month_cap (80). Konser & Festival ve moderatör/mekân etkinliklerinde düzenleyen puan almaz.
--     Puan veren için konum gerekmez; yıldız sayısı puan verenin kazancını değiştirmez (dürüst puanlama için).
-- ---------------------------------------------------------------------
create or replace function public.rate_event(p_event_id uuid, p_stars int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
  h public.profiles;
  v_mine int := 0;
  v_host int := 0;
  v_room int;
begin
  v := public._require_user();
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'invalid_stars'; end if;
  select * into e from public.events where id = p_event_id and not is_cancelled;
  if not found then raise exception 'event_not_found'; end if;
  if not exists (select 1 from public.event_registrations
                  where event_id = e.id and user_id = v.id and checked_in_at is not null) then
    raise exception 'not_verified';
  end if;
  if now() < coalesce(e.closed_at, public._event_end(e.starts_at, e.category)) then raise exception 'event_not_ended'; end if;
  if now() > coalesce(e.closed_at, public._event_end(e.starts_at, e.category)) + interval '7 days' then
    raise exception 'rating_closed';
  end if;
  insert into public.event_ratings (event_id, user_id, stars) values (e.id, v.id, p_stars)
  on conflict do nothing;
  if not found then raise exception 'already_rated'; end if;
  -- Puan veren
  perform pg_advisory_xact_lock(hashtext('event_rate:' || v.id::text));
  if (select count(*) from public.point_events pe
       where pe.user_id = v.id and pe.source = 'event_rate' and pe.created_at >= public._month_start())
     < greatest(0, public.setting_int('pts_event_rate_month', 10)) then
    v_mine := public.setting_int('pts_event_rate', 2);
    perform public._award_points(v.id, v_mine, 'event_rate', 'Etkinliği puanladın: ' || left(e.title, 40), e.id);
  end if;
  -- Düzenleyen (konser hariç, yalnızca üye)
  if e.category <> 'konser_festival' and e.created_by is not null and e.created_by <> v.id then
    select * into h from public.profiles where id = e.created_by;
    if found and h.role = 'user' then
      v_host := case p_stars when 5 then public.setting_int('pts_event_rated_5', 4)
                             when 4 then public.setting_int('pts_event_rated_4', 2) else 0 end;
      if v_host > 0 then
        perform pg_advisory_xact_lock(hashtext('event_rated:' || h.id::text));
        v_room := greatest(0, public.setting_int('pts_event_rated_month_cap', 80)
          - coalesce((select sum(pe.amount)::int from public.point_events pe
                       where pe.user_id = h.id and pe.source = 'event_rated' and pe.created_at >= public._month_start()), 0));
        v_host := least(v_host, v_room);
        if v_host > 0 then
          perform public._award_points(h.id, v_host, 'event_rated', 'Etkinliğin puanlandı: ' || left(e.title, 40), e.id);
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'points', v_mine);
end $$;

-- Katıldığım etkinlikler (son 30 gün, bitenler dahil): doğrulama, bitti mi, puanım ve puanlayabilir miyim
drop function if exists public.my_attended_events();
create or replace function public.my_attended_events()
returns table (id uuid, title text, starts_at timestamptz, category text, host_name text, checked_in boolean,
               ended boolean, my_stars int, can_rate boolean, avg_stars numeric, rating_count int)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.category,
         case when e.created_by is null or hp.role = 'admin' then '41. Kat Sosyal' else hp.full_name end,
         (r.checked_in_at is not null),
         now() >= coalesce(e.closed_at, public._event_end(e.starts_at, e.category)),
         (select er.stars from public.event_ratings er where er.event_id = e.id and er.user_id = auth.uid()),
         (r.checked_in_at is not null
          and now() >= coalesce(e.closed_at, public._event_end(e.starts_at, e.category))
          and now() <= coalesce(e.closed_at, public._event_end(e.starts_at, e.category)) + interval '7 days'
          and not exists (select 1 from public.event_ratings er where er.event_id = e.id and er.user_id = auth.uid())),
         (select round(avg(er.stars)::numeric, 1) from public.event_ratings er where er.event_id = e.id),
         (select count(*)::int from public.event_ratings er where er.event_id = e.id)
    from public.event_registrations r
    join public.events e on e.id = r.event_id and not e.is_cancelled
    left join public.profiles hp on hp.id = e.created_by
   where r.user_id = auth.uid() and public._is_active_user()
     and e.starts_at > now() - interval '30 days'
   order by e.starts_at desc
   limit 60;
$$;

-- ---------------------------------------------------------------------
-- 5o) Etkinlik: düzenleyenin kapatması, paylaşım bekleme süresi, moderatör etiketi ve 41. Kat Özel seçimi
-- ---------------------------------------------------------------------

-- Düzenleyen etkinliğini kapatır: başlangıçtan host_close_minutes_after (45) dakika sonra, en az pts_event_min_attendees (4)
-- kişi kodla doğrulandıysa ve düzenleyen etkinliğin peteğinde (en çok 1 petek) ise. Puanlar kesinleşir.
create or replace function public.host_close_event(p_event_id uuid, p_my_q int, p_my_r int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
begin
  v := public._require_user();
  select * into e from public.events where id = p_event_id and not is_cancelled for update;
  if not found then raise exception 'event_not_found'; end if;
  if e.created_by is distinct from v.id then raise exception 'forbidden'; end if;
  if e.closed_at is not null then raise exception 'event_closed'; end if;
  if now() < e.starts_at + make_interval(mins => greatest(0, public.setting_int('host_close_minutes_after', 45))) then
    raise exception 'close_too_early';
  end if;
  if (select count(*) from public.event_registrations where event_id = e.id and checked_in_at is not null)
     < greatest(1, public.setting_int('pts_event_min_attendees', 4)) then
    raise exception 'close_not_enough';
  end if;
  if p_my_q is null or p_my_r is null then raise exception 'location_required'; end if;
  if e.cell_q is not null and public._hex_dist(p_my_q, p_my_r, e.cell_q, e.cell_r) > 1 then raise exception 'too_far'; end if;
  update public.events set closed_at = now() where id = e.id;
  perform public._release_event_points(e.id);
end $$;

-- Etkinliği akışta yeniden paylaşmak için kalan saniye (0 = şimdi paylaşılabilir)
create or replace function public.event_share_wait(p_event_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(ceil(extract(epoch from (max(p.created_at) + interval '5 minutes' - now())))::int, 0))
    from public.posts p
   where p.event_id = p_event_id and public._is_active_user();
$$;

-- Moderatör: etkinliğe etiket ('tanitim_isbirligi' = Tanıtım & İşbirliği) ya da boş
create or replace function public.admin_set_event_tag(p_event_id uuid, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_tag is not null and p_tag not in ('tanitim_isbirligi') then raise exception 'invalid_tag'; end if;
  update public.events set tag = p_tag where id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
end $$;

-- Moderatör: kendi etkinliğini 41. Kat Özel olarak mı (true) yoksa normal (Konser & Festival) olarak mı yayınlar.
-- 41. Kat Özel seçilirse herkese duyuru gider.
create or replace function public.admin_set_event_official(p_event_id uuid, p_official boolean)
returns void language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  perform public._require_admin();
  update public.events set as_official = coalesce(p_official, true)
   where id = p_event_id and created_by = auth.uid()
  returning * into e;
  if not found then raise exception 'event_not_found'; end if;
  -- Aynı etkinlik için ikinci kez duyuru gitmez (seçim tekrarlanırsa)
  if e.as_official and not exists (
       select 1 from public.announcements a
        where a.kind = 'special_event' and a.created_at > now() - interval '30 days'
          and a.body = left('“' || e.title || '” Etkinlikler sekmesinde. Kaçırma!', 1000)) then
    insert into public.announcements (title, body, created_by, kind)
    values ('Yeni 41. Kat Özel etkinlik', left('“' || e.title || '” Etkinlikler sekmesinde. Kaçırma!', 1000), auth.uid(),
            'special_event');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5p) Bildirim tercihleri, üstten bildirim, etkinlik hatırlatıcısı, Kat Görevlisi yazışmaları
-- ---------------------------------------------------------------------

-- Bildirim tercihlerim (satırım yoksa hepsi açık)
create or replace function public.get_notification_prefs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  return jsonb_build_object(
    'game_invite', public._notif_on(v.id, 'game_invite'),
    'special_events', public._notif_on(v.id, 'special_events'),
    'friend_request', public._notif_on(v.id, 'friend_request'),
    'mention', public._notif_on(v.id, 'mention'),
    'event_reminder', public._notif_on(v.id, 'event_reminder'));
end $$;

-- Bildirim tercihlerini kaydeder. Yalnızca bilinen anahtarlar ve true/false kabul edilir; verilmeyenler aynı kalır.
create or replace function public.set_notification_prefs(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  k text;
begin
  v := public._require_user();
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then raise exception 'invalid_prefs'; end if;
  for k in select jsonb_object_keys(p_prefs) loop
    if k not in ('game_invite', 'special_events', 'friend_request', 'mention', 'event_reminder')
       or jsonb_typeof(p_prefs -> k) <> 'boolean' then
      raise exception 'invalid_prefs';
    end if;
  end loop;
  insert into public.notification_prefs (user_id) values (v.id) on conflict (user_id) do nothing;
  update public.notification_prefs np set
    game_invite = coalesce((p_prefs ->> 'game_invite')::boolean, np.game_invite),
    special_events = coalesce((p_prefs ->> 'special_events')::boolean, np.special_events),
    friend_request = coalesce((p_prefs ->> 'friend_request')::boolean, np.friend_request),
    mention = coalesce((p_prefs ->> 'mention')::boolean, np.mention),
    event_reminder = coalesce((p_prefs ->> 'event_reminder')::boolean, np.event_reminder),
    updated_at = now()
   where np.user_id = v.id;
  return public.get_notification_prefs();
end $$;

-- Üstten kayan bildirim için: verilen andan sonra gelen, okunmamış bildirim ve duyurular (en eski önce, en çok 5).
-- En fazla son 1 güne bakılır. Kendi gönderdiğim duyuru bana gösterilmez.
create or replace function public.my_new_notifications(p_since timestamptz)
returns table (id uuid, source text, kind text, title text, body text, data jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.source, x.kind, x.title, x.body, x.data, x.created_at
    from (
      select n.id, 'personal'::text as source, n.kind, n.title, n.body, n.data, n.created_at
        from public.notifications n
       where n.user_id = auth.uid() and n.read_at is null
         and n.created_at > greatest(coalesce(p_since, now()), now() - interval '1 day')
      union all
      select a.id, 'announcement'::text, 'announcement'::text, a.title, a.body,
             jsonb_build_object('akind', a.kind, 'route', case a.kind when 'special_event' then '/events'
                                                                     when 'treasure' then '/hazine'
                                                                     when 'raffle' then '/games' end),
             a.created_at
        from public.announcements a
       where a.is_active
         and a.created_at > greatest(coalesce(p_since, now()), now() - interval '1 day')
         and a.created_by is distinct from auth.uid()
         and (a.kind in ('general', 'raffle') or public._notif_on(auth.uid(), 'special_events'))
         and not exists (select 1 from public.announcement_reads r
                          where r.user_id = auth.uid() and r.announcement_id = a.id)
    ) x
   where public._is_active_user()
   order by x.created_at asc
   limit 5;
$$;

-- Etkinlik hatırlatıcısı için: önümüzdeki 7 günde başlayacak, ön kayıt yaptığım ya da düzenlediğim etkinlikler.
-- Hatırlatma tercihi kapalıysa boş döner (telefon kurulu hatırlatmaları siler).
create or replace function public.my_event_reminders()
returns table (id uuid, title text, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at
    from public.events e
   where public._is_active_user()
     and public._notif_on(auth.uid(), 'event_reminder')
     and not e.is_cancelled and e.closed_at is null
     and e.starts_at > now() and e.starts_at < now() + interval '7 days'
     and (e.created_by = auth.uid()
          or exists (select 1 from public.event_registrations er
                      where er.event_id = e.id and er.user_id = auth.uid()))
   order by e.starts_at
   limit 30;
$$;

-- Yazışmayı açar: üye yalnızca kendi yazışmasını, moderatör hepsini görür. Gönderen moderatörün kimliği dönmez.
create or replace function public.get_mod_thread(p_thread_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.mod_threads;
  u public.profiles;
  v_admin boolean;
begin
  v := public._require_user();
  select * into t from public.mod_threads where id = p_thread_id;
  if not found then raise exception 'thread_not_found'; end if;
  v_admin := v.role = 'admin' and t.user_id <> v.id;
  if t.user_id <> v.id and not v_admin then raise exception 'thread_not_found'; end if;
  if v_admin then
    update public.mod_threads set admin_unread = false where id = t.id and admin_unread;
    select * into u from public.profiles where id = t.user_id;
  else
    update public.mod_threads set user_unread = false where id = t.id and user_unread;
    update public.notifications set read_at = now()
     where user_id = v.id and kind = 'admin_message' and read_at is null and data ->> 'thread_id' = t.id::text;
  end if;
  return jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'created_at', t.created_at,
    'as_admin', v_admin,
    'member_name', case when v_admin then u.full_name end,
    'member_alias', case when v_admin then u.alias end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_admin', m.from_admin, 'body', m.body,
                                                             'created_at', m.created_at) order by m.created_at)
                            from public.mod_thread_messages m where m.thread_id = t.id), '[]'::jsonb));
end $$;

-- Yazışmaya cevap. Üye: Kat Görevlisi cevap vermeden üst üste en çok 3 mesaj, 5 saniyede 1 mesaj.
-- Moderatör cevabı üyeye bildirim olarak gider. Bir yazışmada en çok 200 mesaj olur.
create or replace function public.reply_mod_thread(p_thread_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.mod_threads;
  v_admin boolean;
  v_body text := btrim(coalesce(p_body, ''));
  v_tail int;
begin
  v := public._require_user();
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;
  select * into t from public.mod_threads where id = p_thread_id for update;
  if not found then raise exception 'thread_not_found'; end if;
  v_admin := v.role = 'admin' and t.user_id <> v.id;
  if t.user_id <> v.id and not v_admin then raise exception 'thread_not_found'; end if;
  if (select count(*) from public.mod_thread_messages m where m.thread_id = t.id) >= 200 then
    raise exception 'thread_full';
  end if;
  if not v_admin then
    select count(*) into v_tail
      from (select m.from_admin from public.mod_thread_messages m
             where m.thread_id = t.id order by m.created_at desc limit 3) z
     where not z.from_admin;
    if v_tail >= 3 then raise exception 'wait_for_reply'; end if;
    if exists (select 1 from public.mod_thread_messages m
                where m.thread_id = t.id and not m.from_admin and m.created_at > now() - interval '5 seconds') then
      raise exception 'rate_limited';
    end if;
  end if;
  insert into public.mod_thread_messages (thread_id, from_admin, sender_id, body)
  values (t.id, v_admin, v.id, v_body);
  if v_admin then
    update public.mod_threads set last_at = now(), user_unread = true, admin_unread = false where id = t.id;
    -- Aynı yazışmanın okunmamış eski bildirimi yerine tek bir yenisi kalır
    delete from public.notifications
     where user_id = t.user_id and kind = 'admin_message' and read_at is null and data ->> 'thread_id' = t.id::text;
    perform public._notify(t.user_id, 'admin_message', 'Kat Görevlisi yanıt verdi: ' || left(t.title, 80),
      left(v_body, 140) || case when char_length(v_body) > 140 then '…' else '' end,
      jsonb_build_object('thread_id', t.id));
    perform public._audit('thread_reply', t.user_id, jsonb_build_object('thread_id', t.id));
  else
    update public.mod_threads set last_at = now(), admin_unread = true, user_unread = false where id = t.id;
  end if;
end $$;

-- Üye: Kat Görevlisi ile yazışmalarım
create or replace function public.list_my_mod_threads()
returns table (id uuid, title text, last_at timestamptz, unread boolean, last_body text, last_from_admin boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v public.profiles;
begin
  v := public._require_user();
  return query
    select t.id, t.title, t.last_at, t.user_unread, lm.body, lm.from_admin
      from public.mod_threads t
      left join lateral (select m.body, m.from_admin from public.mod_thread_messages m
                          where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
     where t.user_id = v.id
     order by t.last_at desc
     limit 50;
end $$;

-- Moderatör: tüm yazışmalar (cevap bekleyenler önce)
create or replace function public.admin_list_mod_threads()
returns table (id uuid, user_id uuid, member_name text, member_alias text, title text, last_at timestamptz,
               unread boolean, last_body text, last_from_admin boolean, message_count int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_user();
  perform public._require_admin();
  return query
    select t.id, t.user_id, p.full_name, p.alias, t.title, t.last_at, t.admin_unread, lm.body, lm.from_admin,
           (select count(*)::int from public.mod_thread_messages c where c.thread_id = t.id)
      from public.mod_threads t
      join public.profiles p on p.id = t.user_id
      left join lateral (select m.body, m.from_admin from public.mod_thread_messages m
                          where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
     order by t.admin_unread desc, t.last_at desc
     limit 100;
end $$;

-- Moderatör: görüşmeyi bitirir. Yazışma ve ona ait bildirimler tamamen silinir; üyeye kısa bir bilgi gider.
create or replace function public.admin_end_mod_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.mod_threads;
begin
  perform public._require_user();
  perform public._require_admin();
  delete from public.mod_threads where id = p_thread_id returning * into t;
  if not found then raise exception 'thread_not_found'; end if;
  delete from public.notifications
   where user_id = t.user_id and kind = 'admin_message' and data ->> 'thread_id' = t.id::text;
  perform public._notify(t.user_id, 'system', 'Görüşme sonlandırıldı',
    left('Kat Görevlisi “' || t.title || '” görüşmesini sonlandırdı. Yazışma silindi.', 1000), '{}'::jsonb);
  perform public._audit('thread_end', t.user_id, jsonb_build_object('title', t.title));
end $$;

-- ---------------------------------------------------------------------
-- 5q) Bilgi Yarışması: eşleşme, maç akışı, cevap, sohbet, puan
-- ---------------------------------------------------------------------
-- Maç akışı (sunucu saatine göre): giriş (intro) → soru → cevaplar (reveal) → … → bitti.
-- Telefonlar yaklaşık saniyede bir quiz_state çağırır; aşamalar bu çağrılarda ilerletilir (ayrı bir zamanlayıcı yok).
-- Puan (platform puanı, çok az): yalnızca düelloyu KAZANAN 1 puan alır (pts_quiz_win). Günde pts_quiz_daily_cap,
-- ayda pts_quiz_month_cap galibiyetten; aynı rakipten günde pts_quiz_same_opponent_daily kez. Antrenman puan vermez.
-- Bilgi Yarışması petek sıralamasına (petek liderleri) sayılmaz: maçların haritada yeri yoktur.

create or replace function public._quiz_n() returns int language sql stable set search_path = public as $$
  select least(15, greatest(3, public.setting_int('quiz_questions_per_match', 7)));
$$;
create or replace function public._quiz_qsec() returns int language sql stable set search_path = public as $$
  select least(30, greatest(6, public.setting_int('quiz_question_seconds', 12)));
$$;

-- Yeni maç için sorular: önce oyuncuların son 7 günde görmediği sorular, yetmezse diğerleri (rastgele)
create or replace function public._quiz_pick(p_users uuid[], p_n int)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(x.id), '{}') into v_ids
    from (select q.id from public.quiz_questions q
           where q.is_active
             and not exists (select 1 from public.quiz_seen s
                              where s.question_id = q.id and s.user_id = any (p_users)
                                and s.seen_at > now() - interval '7 days')
           order by random() limit p_n) x;
  if coalesce(array_length(v_ids, 1), 0) < p_n then
    v_ids := v_ids || coalesce((select array_agg(y.id)
                                  from (select q.id from public.quiz_questions q
                                         where q.is_active and not (q.id = any (v_ids))
                                         order by random() limit p_n - coalesce(array_length(v_ids, 1), 0)) y), '{}');
  end if;
  return v_ids;
end $$;

-- Yeni maç (düello: iki oyuncu, antrenman: bir oyuncu). Oyuncuların bulunduğu petek verildiyse yoğunluğa sayılır.
create or replace function public._quiz_new_match(p_mode text, p_users uuid[], p_cells jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_n int := public._quiz_n();
  v_ids uuid[];
  v_orders jsonb;
  v_id uuid;
  i int;
  c jsonb;
begin
  v_ids := public._quiz_pick(p_users, v_n);
  if coalesce(array_length(v_ids, 1), 0) < v_n then raise exception 'quiz_no_questions'; end if;
  -- Her soru için ayrı karıştırma (iç sorgu dıştaki satıra bağlı; yoksa hepsi aynı sırayı alırdı)
  select jsonb_agg((select jsonb_agg(x order by random()) from generate_series(0, 3) x where g.n > 0) order by g.n)
    into v_orders
    from generate_series(1, v_n) as g(n);
  insert into public.quiz_matches (mode, question_ids, orders, phase, phase_started_at, phase_ends_at)
  values (p_mode, v_ids, v_orders, 'intro', now(),
          now() + make_interval(secs => least(10, greatest(2, public.setting_int('quiz_intro_seconds', 4)))))
  returning id into v_id;
  for i in 1 .. array_length(p_users, 1) loop
    -- Uzaktan maç her oyuncudan 1 can harcar (eşleşmeden hemen önce can ve günlük sınır denetlendi)
    if p_mode = 'duel' then perform public._quiz_use_life(p_users[i]); end if;
    insert into public.quiz_match_players (match_id, user_id, slot, alias, avatar_index)
    select v_id, p.id, i, p.alias, p.avatar_index from public.profiles p where p.id = p_users[i];
    insert into public.quiz_seen (user_id, question_id, seen_at)
    select p_users[i], unnest(v_ids), now()
    on conflict (user_id, question_id) do update set seen_at = excluded.seen_at;
    -- Oyundayken bulunduğu petek haritadaki yoğunluğa sayılır (kimse görünmez; maç başına bir kez)
    c := p_cells -> (i - 1);
    if c is not null and jsonb_typeof(c -> 'q') = 'number' and jsonb_typeof(c -> 'r') = 'number'
       and public._map_cell_ok((c ->> 'q')::int, (c ->> 'r')::int) then
      perform public._map_cleanup();
      insert into public.map_signals (user_id, q, r, source, room_id, day)
      values (p_users[i], (c ->> 'q')::int, (c ->> 'r')::int, 'quiz', v_id, public._map_day())
      on conflict do nothing;
    end if;
  end loop;
  return v_id;
end $$;

-- Maçı bitirir: istatistik (oynama/galibiyet), platform puanı ve oyuncuya gösterilecek not.
-- p_reason: 'completed' (sorular bitti) ya da 'forfeit' (biri çıktı / bağlantısı koptu)
create or replace function public._quiz_finish(p_match_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  p record;
  v_alive int;
  v_winner uuid;
  v_done int;
  v_early boolean;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_opp uuid;
  v_note text;
  v_award numeric;
  v_n int;
  v_s1 int;
  v_s2 int;
begin
  select * into m from public.quiz_matches where id = p_match_id for update;
  if not found or m.status <> 'playing' then return; end if;

  if m.mode = 'solo' then
    select * into p from public.quiz_match_players where match_id = m.id limit 1;
    if p_reason <> 'completed' then
      update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = p_reason,
             finished_at = now(), phase_ends_at = now() where id = m.id;
      return;
    end if;
    update public.quiz_matches set status = 'finished', phase = 'finished', end_reason = p_reason,
           finished_at = now(), phase_ends_at = now() where id = m.id;
    update public.quiz_match_players set note = 'solo' where match_id = m.id;
    insert into public.quiz_best (user_id, best_score, solo_plays) values (p.user_id, p.score, 1)
    on conflict (user_id) do update set best_score = greatest(public.quiz_best.best_score, excluded.best_score),
                                        solo_plays = public.quiz_best.solo_plays + 1, updated_at = now();
    return;
  end if;

  -- Rakip ararken vazgeçen kişi tam o anda eşleşmişse: maç hiç sayılmaz (kimse kaybetmez)
  if p_reason = 'cancelled' then
    update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'cancelled',
           finished_at = now(), phase_ends_at = now() where id = m.id;
    update public.quiz_match_players set note = 'cancelled' where match_id = m.id;
    -- Maç hiç başlamadı: canlar geri verilir
    perform public._quiz_refund_life(x.user_id) from public.quiz_match_players x where x.match_id = m.id;
    return;
  end if;
  select count(*)::int into v_alive from public.quiz_match_players where match_id = m.id and left_at is null;
  if p_reason = 'forfeit' then
    if v_alive = 0 then
      update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'abandoned',
             finished_at = now(), phase_ends_at = now() where id = m.id;
      update public.quiz_match_players set note = 'abandoned' where match_id = m.id;
      return;
    end if;
    select user_id into v_winner from public.quiz_match_players where match_id = m.id and left_at is null limit 1;
  else
    select score into v_s1 from public.quiz_match_players where match_id = m.id and slot = 1;
    select score into v_s2 from public.quiz_match_players where match_id = m.id and slot = 2;
    v_winner := case when v_s1 > v_s2 then (select user_id from public.quiz_match_players where match_id = m.id and slot = 1)
                     when v_s2 > v_s1 then (select user_id from public.quiz_match_players where match_id = m.id and slot = 2)
                     else null end;
  end if;
  -- Kaç soru oynandı (cevapları açıklanmış sorular)
  v_done := m.q_index + case when m.phase in ('reveal', 'finished') then 1 else 0 end;
  -- Erken bırakma: 3 sorudan önce biri çıktıysa kazanan için oyun sayılmaz (iki hesapla galibiyet toplanmasın)
  v_early := p_reason = 'forfeit' and v_done < 3;

  update public.quiz_matches
     set status = 'finished', phase = 'finished', winner = v_winner, end_reason = p_reason,
         finished_at = now(), phase_ends_at = now()
   where id = m.id;

  for p in select mp.*, pr.role::text as prole from public.quiz_match_players mp
             join public.profiles pr on pr.id = mp.user_id where mp.match_id = m.id loop
    v_award := 0;
    select user_id into v_opp from public.quiz_match_players where match_id = m.id and user_id <> p.user_id limit 1;
    if p.user_id = v_winner and v_early then
      v_note := 'early_forfeit';
    else
      -- Oynanan maç (çıkan oyuncu da “kaybetti” olarak sayılır)
      if p.prole = 'user' then
        insert into public.user_game_stats (user_id, game_type, plays, wins)
        values (p.user_id, 'quiz', 1, case when p.user_id = v_winner then 1 else 0 end)
        on conflict (user_id, game_type)
        do update set plays = public.user_game_stats.plays + 1,
                      wins = public.user_game_stats.wins + (case when p.user_id = v_winner then 1 else 0 end),
                      updated_at = now();
      end if;
      if p.user_id = v_winner then
        if p.prole <> 'user' then
          v_note := 'win_nopoints';
        elsif p.correct_count < least(3, v_done) then
          v_note := 'few_correct';
        elsif (select count(*) from public.quiz_match_players me
                 join public.quiz_matches mm on mm.id = me.match_id
                 join public.quiz_match_players op on op.match_id = me.match_id and op.user_id = v_opp
                where me.user_id = p.user_id and me.awarded > 0 and mm.finished_at >= v_today)
              >= greatest(0, public.setting_int('pts_quiz_same_opponent_daily', 1)) then
          v_note := 'same_opponent';
        else
          -- Kazanan: 1 × oyuncu çarpanı (2 kişi = 1.25); günlük/aylık Bilgi Yarışması tavanı _quiz_award'da
          select count(*)::int into v_n from public.quiz_match_players where match_id = m.id;
          select x.o_awarded, x.o_note into v_award, v_note
            from public._quiz_award(p.user_id, public.setting_int('pts_quiz_win_base', 100) / 100.0 * public._quiz_mult(v_n),
                                    'Bilgi Yarışması: ' || v_n || ' kişilik maçı kazandın') x;
        end if;
      elsif v_winner is null then
        v_note := 'draw';
      elsif p.left_at is not null then
        v_note := 'left';
      else
        v_note := 'loss';
      end if;
    end if;
    update public.quiz_match_players set awarded = v_award, note = v_note
     where match_id = m.id and user_id = p.user_id;
  end loop;
end $$;

-- Aşamaları ilerletir (maç satırı kilitliyken çağrılır). Düelloda bağlantısı kopan (quiz_stale_seconds) oyuncu çıkmış sayılır.
create or replace function public._quiz_advance(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_need int;
  v_ans int;
  v_qid uuid;
  v_qsec int := public._quiz_qsec();
  v_rev int := least(8, greatest(2, public.setting_int('quiz_reveal_seconds', 3)));
  v_stale int := greatest(10, public.setting_int('quiz_stale_seconds', 25));
  i int;
begin
  for i in 1 .. 5 loop
    select * into m from public.quiz_matches where id = p_match_id;
    exit when not found or m.status <> 'playing';
    if m.mode = 'duel' then
      update public.quiz_match_players set left_at = now()
       where match_id = m.id and left_at is null and last_seen_at < now() - make_interval(secs => v_stale);
      if found then
        perform public._quiz_finish(m.id, 'forfeit');
        exit;
      end if;
    end if;
    if m.phase = 'intro' then
      exit when now() < m.phase_ends_at;
      update public.quiz_matches
         set phase = 'question', q_index = 0, phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => v_qsec)
       where id = m.id;
    elsif m.phase = 'question' then
      select count(*)::int into v_need from public.quiz_match_players where match_id = m.id and left_at is null;
      select count(*)::int into v_ans from public.quiz_answers a
        join public.quiz_match_players mp on mp.match_id = a.match_id and mp.user_id = a.user_id and mp.left_at is null
       where a.match_id = m.id and a.q_index = m.q_index;
      exit when now() < m.phase_ends_at and v_ans < v_need;
      -- Cevaplamayanlar: süre doldu (0 puan)
      insert into public.quiz_answers (match_id, user_id, q_index, choice, is_correct, ms, points)
      select m.id, mp.user_id, m.q_index, -1, false, v_qsec * 1000, 0
        from public.quiz_match_players mp where mp.match_id = m.id and mp.left_at is null
      on conflict do nothing;
      v_qid := m.question_ids[m.q_index + 1];
      update public.quiz_questions
         set times_shown = times_shown + (select count(*) from public.quiz_answers a
                                           where a.match_id = m.id and a.q_index = m.q_index),
             times_correct = times_correct + (select count(*) from public.quiz_answers a
                                               where a.match_id = m.id and a.q_index = m.q_index and a.is_correct)
       where id = v_qid;
      update public.quiz_matches
         set phase = 'reveal', phase_started_at = now(), phase_ends_at = now() + make_interval(secs => v_rev)
       where id = m.id;
    elsif m.phase = 'reveal' then
      exit when now() < m.phase_ends_at;
      if m.q_index >= array_length(m.question_ids, 1) - 1 then
        perform public._quiz_finish(m.id, 'completed');
        exit;
      end if;
      update public.quiz_matches
         set phase = 'question', q_index = m.q_index + 1, phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => v_qsec)
       where id = m.id;
    else
      exit;
    end if;
  end loop;
end $$;

-- Temizlik: iki oyuncusu da kopmuş düellolar ve terk edilmiş antrenmanlar kapanır; eski kayıtlar silinir.
create or replace function public._quiz_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare x record;
begin
  delete from public.quiz_queue where last_seen_at < now() - interval '12 seconds';
  for x in
    select m.id from public.quiz_matches m
     where m.status = 'playing' and m.mode <> 'arena'
       and not exists (select 1 from public.quiz_match_players mp
                        where mp.match_id = m.id and mp.left_at is null
                          and mp.last_seen_at > now() - case when m.mode = 'solo' then interval '2 minutes'
                                                             else interval '60 seconds' end)
     limit 20
  loop
    update public.quiz_match_players set left_at = coalesce(left_at, now()) where match_id = x.id;
    perform public._quiz_finish(x.id, 'forfeit');
  end loop;
  -- Uzaktan (arena): herkesi kopmuş ya da aşaması çoktan bitmiş maçlar ilerletilir (kopanlar çıkar, maç/oda kapanır)
  for x in select m.id from public.quiz_matches m
            where m.status = 'playing' and m.mode = 'arena'
              and (m.phase_ends_at < now() - interval '20 seconds'
                   or not exists (select 1 from public.quiz_match_players mp
                                   where mp.match_id = m.id and mp.left_at is null
                                     and mp.last_seen_at > now() - interval '40 seconds'))
            limit 20 for update skip locked loop
    perform public._arena_advance(x.id);
  end loop;
  delete from public.quiz_trades where created_at < now() - interval '2 days';
  delete from public.quiz_presence where seen_at < now() - interval '1 day';
  update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = coalesce(finished_at, now())
   where status = 'playing' and last_seen_at < now() - interval '5 minutes';
  delete from public.quiz_side_games where created_at < now() - interval '7 days';
  delete from public.quiz_chat where created_at < now() - interval '14 days';
  delete from public.vv_whispers where created_at < now() - interval '14 days';
  delete from public.vv_dead_chat where created_at < now() - interval '14 days';
  delete from public.quiz_matches where created_at < now() - interval '30 days' and status <> 'playing';
  delete from public.quiz_seen where seen_at < now() - interval '30 days';
  -- Uygulaması kapanmış Solo Maratonlar: süresi dolan soru “yanlış” sayılır (puan kuralı aynı)
  for x in select s.id from public.quiz_solo_runs s
            where s.status = 'playing' and s.phase_ends_at < now() - interval '30 seconds'
            limit 20 for update skip locked loop
    perform public._quiz_solo_tick(x.id);
  end loop;
  delete from public.quiz_solo_runs where created_at < now() - interval '60 days' and status <> 'playing';
end $$;

-- Benim devam eden maçım (varsa)
create or replace function public._quiz_my_live(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.id from public.quiz_matches m
    join public.quiz_match_players mp on mp.match_id = m.id and mp.user_id = p_user and mp.left_at is null
   where m.status = 'playing' and m.mode in ('duel', 'arena')
   order by m.created_at desc limit 1;
$$;

-- “Şu an oyunda”: Bilgi Yarışması ekranında olanlar (son 45 sn) + arayanlar + maçta / maratonda olanlar
create or replace function public._quiz_online_count()
returns int language sql stable security definer set search_path = public as $$
  select count(distinct u)::int from (
    select p.user_id as u from public.quiz_presence p where p.seen_at > now() - interval '45 seconds'
    union all
    select q.user_id from public.quiz_queue q where q.last_seen_at > now() - interval '12 seconds'
    union all
    select mp.user_id from public.quiz_match_players mp join public.quiz_matches m on m.id = mp.match_id
     where m.status = 'playing' and mp.left_at is null and mp.last_seen_at > now() - interval '45 seconds'
    union all
    select s.user_id from public.quiz_solo_runs s
     where s.status = 'playing' and s.last_seen_at > now() - interval '45 seconds') x;
$$;

-- Bilgi Yarışması ekranındayım (telefon ekran açıkken 20 sn'de bir çağırır). Döner: şu an oyunda olan sayısı.
create or replace function public.quiz_ping()
returns int language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  insert into public.quiz_presence (user_id, seen_at) values (v.id, now())
  on conflict (user_id) do update set seen_at = now()
  where public.quiz_presence.seen_at < now() - interval '5 seconds';
  return public._quiz_online_count();
end $$;

-- Bilgi Yarışması ana ekranı: istatistiklerim, bugünkü puan durumum, çevrimiçi sayısı, devam eden maçım
create or replace function public.quiz_lobby()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_live uuid;
  g record;
  v_wt int;
  v_wp int;
begin
  v := public._require_user();
  perform public._quiz_sweep();
  insert into public.quiz_presence (user_id, seen_at) values (v.id, now())
  on conflict (user_id) do update set seen_at = now();
  v_live := public._quiz_my_live(v.id);
  select * into g from public._quiz_lives_get(v.id);
  select r.correct, r.place into v_wt, v_wp
    from public._quiz_solo_week_rank(public._quiz_week_start(0), public._quiz_week_start(1)) r where r.user_id = v.id;
  return jsonb_build_object(
    'live_match', v_live,
    'live_solo', public._quiz_my_solo(v.id),
    'live_side', public._quiz_my_side(v.id),
    'side_today', (select count(*)::int from public.quiz_side_games where user_id = v.id and created_at >= public._quiz_today()),
    'side_daily', greatest(1, public.setting_int('quiz_side_daily', 10)),
    'server_now', now(),
    'lives', g.o_lives,
    'max_lives', public._quiz_max_lives(v.id),
    'champion', exists (select 1 from public._quiz_solo_champions(public._quiz_week_start(-1), public._quiz_week_start(0)) c
                         where c.user_id = v.id),
    'champions', coalesce((select jsonb_agg(jsonb_build_object('place', c.place, 'alias', c.alias, 'avatar', c.avatar,
                                                               'correct', c.correct) order by c.place)
                             from public._quiz_solo_champions(public._quiz_week_start(-1), public._quiz_week_start(0)) c), '[]'::jsonb),
    'champion_lives', least(30, greatest(1, public.setting_int('quiz_champion_lives', 10))),
    'next_life_at', g.o_next,
    'life_minutes', least(1440, greatest(1, public.setting_int('quiz_life_minutes', 30))),
    'games_today', public._quiz_games_today(v.id),
    'daily_games', greatest(1, public.setting_int('quiz_daily_games', 25)),
    'plays', coalesce((select plays from public.user_game_stats where user_id = v.id and game_type = 'quiz'), 0),
    'wins', coalesce((select wins from public.user_game_stats where user_id = v.id and game_type = 'quiz'), 0),
    'week_total', coalesce(v_wt, 0),
    'week_place', v_wp,
    'best_ever', coalesce((select max(correct_count) from public.quiz_solo_runs where user_id = v.id and status = 'finished'), 0),
    'points_today', (select coalesce(sum(amount), 0) from public.point_events
                      where user_id = v.id and source = 'quiz_play' and created_at >= public._quiz_today()),
    'points_month', (select coalesce(sum(amount), 0) from public.point_events
                      where user_id = v.id and source = 'quiz_play' and created_at >= public._month_start()),
    'daily_points', round(public.setting_int('pts_quiz_daily_points', 10) * public._quiz_level_mult(v.id), 2),
    'month_points', round(public.setting_int('pts_quiz_month_points', 125) * public._quiz_level_mult(v.id), 2),
    'duel_points', round(public.setting_int('pts_quiz_win_base', 100) / 100.0 * public._quiz_mult(2) * public._quiz_level_mult(v.id), 2),
    'arena_points', (select jsonb_agg(round(public.setting_int('pts_quiz_win_base', 100) / 100.0 * public._quiz_mult(n)
                                            * public._quiz_level_mult(v.id), 2) order by n)
                       from generate_series(2, 5) n),
    'private_group_daily', round(public.setting_int('pts_quiz_private_group_daily', 5) * public._quiz_level_mult(v.id), 2),
    'points_mult', public._quiz_level_mult(v.id),
    'unlimited_lives', public._quiz_unlimited_lives(v.id),
    'arena_ready_seconds', least(90, greatest(10, public.setting_int('quiz_arena_ready_seconds', 30))),
    'online', public._quiz_online_count(),
    'questions', (select count(*)::int from public.quiz_questions where is_active),
    'per_match', public._quiz_n(),
    'question_seconds', public._quiz_qsec(),
    'stale_seconds', greatest(10, public.setting_int('quiz_stale_seconds', 25)));
end $$;

-- Rastgele eşleşme (Uzaktan, 2–5 kişi): önce açık bir bekleme odasına (phase 'ready', 5'ten az kişi) katılınır; yoksa
-- kuyrukta bekleyen en az 1 kişiyle yeni bekleme odası kurulur (en çok 5). Odada “Hazırım” denince maç başlar.
-- Telefon beklerken 2 saniyede bir tekrar çağırır (bu, “hâlâ bekliyorum” işaretidir). Birbirini engelleyenler aynı odaya düşmez.
create or replace function public.quiz_find_match(p_cell_q int default null, p_cell_r int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_live uuid;
  v_me public.quiz_queue;
  w public.quiz_queue;
  r record;
  v_group uuid[];
  v_cells jsonb;
  v_n int;
  v_id uuid;
  v_slot int;
  v_color text;
  v_limit int := greatest(1, public.setting_int('quiz_daily_games', 25));
  v_min_wait int := least(30, greatest(0, public.setting_int('quiz_search_min_seconds', 10)));
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if not exists (select 1 from public.game_types where key = 'quiz' and enabled) then raise exception 'game_not_available'; end if;
  -- Eşleştirme tek sırayla yapılır: iki kişi aynı anda aynı oyuncuyu alamaz
  perform pg_advisory_xact_lock(hashtext('quiz_queue'));
  perform public._quiz_sweep();
  v_live := public._quiz_my_live(v.id);
  if v_live is not null then
    delete from public.quiz_queue where user_id = v.id;
    return jsonb_build_object('status', 'matched', 'match_id', v_live);
  end if;
  if public._quiz_my_solo(v.id) is not null then raise exception 'already_in_match'; end if;
  -- Can ve günlük oyun sınırı: kuyruğa girmeden denetlenir (can, maç başlayınca harcanır)
  if public._quiz_games_today(v.id) >= v_limit then
    delete from public.quiz_queue where user_id = v.id;
    raise exception 'quiz_daily_limit';
  end if;
  if (select o_lives from public._quiz_lives_get(v.id)) < 1 then
    delete from public.quiz_queue where user_id = v.id;
    raise exception 'no_lives';
  end if;

  -- Paket 22: herkes en az quiz_search_min_seconds (10) sn aranır; bu süre dolmadan kimseyle eşleşmez
  insert into public.quiz_queue (user_id, cell_q, cell_r) values (v.id, p_cell_q, p_cell_r)
  on conflict (user_id) do update set last_seen_at = now(),
    cell_q = coalesce(excluded.cell_q, public.quiz_queue.cell_q),
    cell_r = coalesce(excluded.cell_r, public.quiz_queue.cell_r)
  returning * into v_me;
  if now() < v_me.joined_at + make_interval(secs => v_min_wait) then
    return jsonb_build_object('status', 'waiting', 'waited', extract(epoch from now() - v_me.joined_at)::int,
      'waiting', (select count(*)::int from public.quiz_queue where last_seen_at > now() - interval '12 seconds'),
      'starts_in', null,
      'search_left', ceil(extract(epoch from v_me.joined_at + make_interval(secs => v_min_wait) - now()))::int);
  end if;

  -- 1) Açık bir bekleme odasına katıl
  for r in select m.id from public.quiz_matches m
            where m.status = 'playing' and m.mode = 'arena' and m.phase = 'ready' and not m.is_private
              and (select count(*) from public.quiz_match_players x where x.match_id = m.id) < 5
              and not exists (select 1 from public.quiz_match_players mp join public.user_blocks b
                                on (b.blocker_id = v.id and b.blocked_id = mp.user_id)
                                or (b.blocker_id = mp.user_id and b.blocked_id = v.id)
                               where mp.match_id = m.id)
            order by m.created_at
            for update of m loop
    select min(sl) into v_slot from generate_series(1, 5) sl
     where not exists (select 1 from public.quiz_match_players where match_id = r.id and slot = sl);
    select c into v_color from unnest(public._arena_colors()) with ordinality as t(c, o)
     where not exists (select 1 from public.quiz_match_players where match_id = r.id and color = c)
     order by o limit 1;
    insert into public.quiz_match_players (match_id, user_id, slot, alias, avatar_index, color, cell_q, cell_r)
    values (r.id, v.id, v_slot, v.alias, v.avatar_index, v_color, p_cell_q, p_cell_r);
    -- Yeni gelen de hazır olabilsin diye bekleme biraz uzar
    update public.quiz_matches set phase_ends_at = greatest(phase_ends_at, now() + interval '12 seconds') where id = r.id;
    delete from public.quiz_queue where user_id = v.id;
    perform public._arena_advance(r.id);
    return jsonb_build_object('status', 'matched', 'match_id', r.id);
  end loop;

  -- 2) Kuyrukta en az 10 sn bekleyenlerle yeni bekleme odası
  v_group := array[v.id];
  v_cells := jsonb_build_array(jsonb_build_object('q', v_me.cell_q, 'r', v_me.cell_r));
  for w in select q.* from public.quiz_queue q
            where q.user_id <> v.id and q.last_seen_at > now() - interval '12 seconds'
              and q.joined_at <= now() - make_interval(secs => v_min_wait)
              and public._quiz_my_live(q.user_id) is null
              and public._quiz_my_solo(q.user_id) is null
              and (select o_lives from public._quiz_lives_get(q.user_id)) >= 1
              and public._quiz_games_today(q.user_id) < v_limit
              and exists (select 1 from public.profiles p where p.id = q.user_id and p.banned_at is null)
            order by q.joined_at loop
    exit when array_length(v_group, 1) >= 5;
    continue when exists (select 1 from public.user_blocks b
                           where (b.blocker_id = w.user_id and b.blocked_id = any (v_group))
                              or (b.blocked_id = w.user_id and b.blocker_id = any (v_group)));
    v_group := v_group || w.user_id;
    v_cells := v_cells || jsonb_build_array(jsonb_build_object('q', w.cell_q, 'r', w.cell_r));
  end loop;
  v_n := array_length(v_group, 1);
  if v_n >= 2 then
    delete from public.quiz_queue where user_id = any (v_group);
    v_id := public._arena_new_match(v_group, v_cells);
    perform public._arena_advance(v_id);
    return jsonb_build_object('status', 'matched', 'match_id', v_id);
  end if;
  return jsonb_build_object('status', 'waiting', 'waited', extract(epoch from now() - v_me.joined_at)::int,
    'waiting', (select count(*)::int from public.quiz_queue where last_seen_at > now() - interval '12 seconds'),
    'starts_in', null);
end $$;

create or replace function public.quiz_cancel_search()
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_live uuid;
  v_mode text;
  v_phase text;
begin
  v := public._require_user();
  perform pg_advisory_xact_lock(hashtext('quiz_queue'));
  delete from public.quiz_queue where user_id = v.id;
  -- Bekleme odasındaysa ya da maç henüz başlamadıysa (giriş geri sayımı): maç onun için sayılmaz, canı geri verilir
  select m.id, m.mode, m.phase into v_live, v_mode, v_phase from public.quiz_matches m
    join public.quiz_match_players mp on mp.match_id = m.id and mp.user_id = v.id and mp.left_at is null
   where m.status = 'playing' and m.mode in ('duel', 'arena') and m.phase in ('ready', 'intro') and not m.is_private
   order by m.created_at desc limit 1;
  if v_live is not null then
    perform 1 from public.quiz_matches where id = v_live for update;
    if v_mode = 'duel' then
      perform public._quiz_finish(v_live, 'cancelled');
    elsif v_phase = 'ready' then
      delete from public.quiz_match_players where match_id = v_live and user_id = v.id;
      perform public._arena_advance(v_live);
    else
      perform public._arena_drop_intro(v_live, v.id);
    end if;
  end if;
end $$;


-- Maçın anlık durumu (telefon saniyede bir çağırır; bu aynı zamanda “oyundayım” işaretidir).
-- Soru süresince: rakibin seçimi ve doğru şık GİZLİ; skorlar bu sorunun puanı eklenmeden gösterilir.
create or replace function public.quiz_state(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  op public.quiz_match_players;
  q public.quiz_questions;
  v_ord jsonb;
  v_opts jsonb;
  v_reveal boolean;
  v_my public.quiz_answers;
  v_oa public.quiz_answers;
  v_cur_my int := 0;
  v_cur_op int := 0;
  v_best int;
  v_correct_display int;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
  if me.left_at is null and m.status = 'playing' then
    update public.quiz_match_players set last_seen_at = now()
     where match_id = m.id and user_id = v.id and last_seen_at < now() - interval '1 second';
  end if;
  perform public._quiz_advance(m.id);
  select * into m from public.quiz_matches where id = p_match_id;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  select * into op from public.quiz_match_players where match_id = m.id and user_id <> v.id;

  v_reveal := m.phase = 'reveal';
  if m.phase in ('question', 'reveal') then
    select * into q from public.quiz_questions where id = m.question_ids[m.q_index + 1];
    v_ord := m.orders -> m.q_index;
    select jsonb_agg(q.options[(v_ord ->> k)::int + 1] order by k) into v_opts from generate_series(0, 3) k;
    select * into v_my from public.quiz_answers where match_id = m.id and user_id = v.id and q_index = m.q_index;
    if op.user_id is not null then
      select * into v_oa from public.quiz_answers where match_id = m.id and user_id = op.user_id and q_index = m.q_index;
    end if;
    if m.phase = 'question' then
      v_cur_my := coalesce(v_my.points, 0);
      v_cur_op := coalesce(v_oa.points, 0);
    end if;
    if v_reveal then
      select k into v_correct_display from generate_series(0, 3) k where (v_ord ->> k)::int = q.correct;
    end if;
  end if;
  if m.mode = 'solo' then
    select best_score into v_best from public.quiz_best where user_id = v.id;
  end if;

  return jsonb_build_object(
    'id', m.id,
    'mode', m.mode,
    'status', m.status,
    'phase', m.phase,
    'q_index', m.q_index,
    'total', array_length(m.question_ids, 1),
    'server_now', now(),
    'phase_started_at', m.phase_started_at,
    'phase_ends_at', m.phase_ends_at,
    'question_seconds', public._quiz_qsec(),
    'end_reason', m.end_reason,
    'me', jsonb_build_object('alias', me.alias, 'avatar', me.avatar_index, 'score', me.score - v_cur_my,
                             'correct', me.correct_count, 'left', me.left_at is not null,
                             'awarded', me.awarded, 'note', me.note,
                             'outcome', case when m.status <> 'finished' then null
                                             when m.mode = 'solo' then 'solo'
                                             when m.winner = v.id then 'win'
                                             when m.winner is null then 'draw'
                                             else 'loss' end),
    'opp', case when op.user_id is null then null
                else jsonb_build_object('alias', op.alias, 'avatar', op.avatar_index, 'score', op.score - v_cur_op,
                                        'correct', op.correct_count, 'left', op.left_at is not null,
                                        'answered', v_oa.user_id is not null) end,
    'question', case when q.id is null then null
                     else jsonb_build_object('category', q.category, 'text', q.question, 'options', v_opts,
                                             'double', m.q_index = array_length(m.question_ids, 1) - 1) end,
    'my_answer', case when v_my.user_id is null then null
                      else jsonb_build_object('choice', v_my.choice,
                                              'correct', case when v_reveal then v_my.is_correct end,
                                              'points', case when v_reveal then v_my.points end) end,
    'reveal', case when not v_reveal then null
                   else jsonb_build_object('correct', v_correct_display,
                                           'opp_choice', v_oa.choice,
                                           'opp_correct', v_oa.is_correct,
                                           'opp_points', v_oa.points) end,
    'best_score', v_best,
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'mine', c.user_id = v.id, 'alias', c.alias,
                                                          'body', c.body, 'at', c.created_at) order by c.created_at)
                        from (select * from public.quiz_chat where match_id = m.id
                               order by created_at desc limit 30) c), '[]'::jsonb));
end $$;

-- Cevap: yalnızca soru süresi içinde ve bir kez. Puan sunucuda hesaplanır: doğruysa 100 + hız bonusu (en çok 100);
-- son soru iki kat. Telefonun gönderdiği zaman kullanılmaz.
create or replace function public.quiz_answer(p_match_id uuid, p_q_index int, p_choice int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  q public.quiz_questions;
  v_qsec int := public._quiz_qsec();
  v_ms int;
  v_orig int;
  v_ok boolean;
  v_pts int := 0;
begin
  v := public._require_user();
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into m from public.quiz_matches where id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if not exists (select 1 from public.quiz_match_players
                  where match_id = m.id and user_id = v.id and left_at is null) then
    raise exception 'match_not_found';
  end if;
  update public.quiz_match_players set last_seen_at = now()
   where match_id = m.id and user_id = v.id and last_seen_at < now() - interval '1 second';
  -- Süre bitmiş olabilir: önce aşama ilerletilir (geç cevap reddedilir)
  if now() > m.phase_ends_at + interval '400 milliseconds' then perform public._quiz_advance(m.id); end if;
  select * into m from public.quiz_matches where id = p_match_id;
  if m.status <> 'playing' or m.phase <> 'question' or m.q_index <> p_q_index
     or now() > m.phase_ends_at + interval '400 milliseconds' then
    raise exception 'answer_closed';
  end if;
  if exists (select 1 from public.quiz_answers where match_id = m.id and user_id = v.id and q_index = m.q_index) then
    raise exception 'already_answered';
  end if;
  select * into q from public.quiz_questions where id = m.question_ids[m.q_index + 1];
  v_orig := (m.orders -> m.q_index ->> p_choice)::int;
  v_ok := v_orig = q.correct;
  v_ms := least(v_qsec * 1000, greatest(0, (extract(epoch from now() - m.phase_started_at) * 1000)::int));
  -- İnsanüstü hız: soru gelmeden / okunmadan basılan cevap kabul edilmez (rastgele hızlı basma hilesi)
  if v_ms < 500 then raise exception 'too_fast'; end if;
  if v_ok then
    v_pts := (100 + round(100 * greatest(0, 1 - v_ms::numeric / (v_qsec * 1000))))::int
             * case when m.q_index = array_length(m.question_ids, 1) - 1 then 2 else 1 end;
  end if;
  insert into public.quiz_answers (match_id, user_id, q_index, choice, is_correct, ms, points)
  values (m.id, v.id, m.q_index, p_choice, v_ok, v_ms, v_pts);
  update public.quiz_match_players
     set score = score + v_pts, correct_count = correct_count + case when v_ok then 1 else 0 end
   where match_id = m.id and user_id = v.id;
  -- Herkes cevapladıysa beklemeden cevaplar gösterilir
  perform public._quiz_advance(m.id);
  return jsonb_build_object('ok', true);
end $$;

-- Maçtan çık: düelloda çıkan KAYBEDER (rakip kazanır); antrenman kayıtsız kapanır.
create or replace function public.quiz_leave(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match_id for update;
  if not found or m.status <> 'playing' then return; end if;
  update public.quiz_match_players set left_at = now()
   where match_id = m.id and user_id = v.id and left_at is null;
  if not found then return; end if;
  perform public._quiz_finish(m.id, 'forfeit');
end $$;

-- Maç sohbeti: yalnızca maçtaki oyuncular, rumuzla. Kısa mesaj (80 karakter), 1,5 saniyede bir, maç başına en çok 40.
-- Susturulmuş üye yazamaz. Maç bittikten sonra 2 dakika daha yazılabilir (“iyi oyundu”).
create or replace function public.quiz_chat_send(p_match_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_body) not between 1 and 80 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  select * into m from public.quiz_matches where id = p_match_id;
  if not found or m.mode not in ('duel', 'arena') then raise exception 'match_not_found'; end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'playing' and coalesce(m.finished_at, now()) < now() - interval '2 minutes' then
    raise exception 'chat_closed';
  end if;
  if exists (select 1 from public.quiz_chat where match_id = m.id and user_id = v.id
              and created_at > now() - interval '1500 milliseconds') then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.quiz_chat where match_id = m.id and user_id = v.id) >= 40 then
    raise exception 'chat_limit';
  end if;
  insert into public.quiz_chat (match_id, user_id, alias, body) values (m.id, v.id, me.alias, v_body);
end $$;

-- Rakibi engelle: bir daha eşleşmezsiniz (akışta da engellenmiş olur)
create or replace function public.quiz_block_opponent(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  op public.quiz_match_players;
begin
  v := public._require_user();
  if not exists (select 1 from public.quiz_match_players where match_id = p_match_id and user_id = v.id) then
    raise exception 'match_not_found';
  end if;
  select * into op from public.quiz_match_players where match_id = p_match_id and user_id <> v.id;
  if not found then raise exception 'match_not_found'; end if;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, op.user_id, op.alias)
  on conflict (blocker_id, blocked_id) do nothing;
end $$;

-- Moderatör: soru listesi (arama, kategori), istatistikle birlikte
drop function if exists public.admin_list_quiz_questions(text, text, int, int);
create or replace function public.admin_list_quiz_questions(p_search text default null, p_category text default null,
                                                            p_limit int default 50, p_offset int default 0)
returns table (id uuid, category text, question text, options text[], correct smallint, is_active boolean,
               times_shown int, times_correct int, created_at timestamptz, difficulty smallint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_user();
  perform public._require_admin();
  return query
    select q.id, q.category, q.question, q.options, q.correct, q.is_active, q.times_shown, q.times_correct, q.created_at,
           q.difficulty
      from public.quiz_questions q
     where (p_category is null or q.category = p_category)
       and (coalesce(btrim(p_search), '') = '' or q.question ilike '%' || btrim(p_search) || '%')
     order by q.created_at desc, q.id
     limit least(100, greatest(1, coalesce(p_limit, 50))) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- Moderatör: soru ekle / düzenle (p_id boşsa yeni). Şıklar 1–80 karakter, birbirinden farklı.
drop function if exists public.admin_save_quiz_question(uuid, text, text, text[], int);
create or replace function public.admin_save_quiz_question(p_id uuid, p_category text, p_question text,
                                                           p_options text[], p_correct int, p_difficulty int default 2)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_q text := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  v_opts text[];
  v_id uuid;
begin
  perform public._require_user();
  perform public._require_admin();
  if p_category not in ('genel', 'tarih', 'cografya', 'bilim', 'spor', 'sanat', 'eglence', 'kocaeli') then
    raise exception 'invalid_category';
  end if;
  if char_length(v_q) not between 8 and 220 then raise exception 'invalid_question'; end if;
  if p_options is null or array_length(p_options, 1) <> 4 then raise exception 'invalid_options'; end if;
  select array_agg(btrim(o) order by i) into v_opts from unnest(p_options) with ordinality as t(o, i);
  if exists (select 1 from unnest(v_opts) o where char_length(coalesce(o, '')) not between 1 and 80) then
    raise exception 'invalid_options';
  end if;
  if (select count(distinct lower(o)) from unnest(v_opts) o) <> 4 then raise exception 'duplicate_options'; end if;
  if p_correct is null or p_correct not between 0 and 3 then raise exception 'invalid_correct'; end if;
  if p_difficulty is null or p_difficulty not between 1 and 3 then raise exception 'invalid_difficulty'; end if;
  if exists (select 1 from public.quiz_questions where lower(btrim(question)) = lower(v_q)
              and id is distinct from p_id) then
    raise exception 'duplicate_question';
  end if;
  if p_id is null then
    insert into public.quiz_questions (category, question, options, correct, difficulty, created_by)
    values (p_category, v_q, v_opts, p_correct, p_difficulty, auth.uid())
    returning id into v_id;
  else
    update public.quiz_questions
       set category = p_category, question = v_q, options = v_opts, correct = p_correct, difficulty = p_difficulty,
           updated_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'question_not_found'; end if;
  end if;
  perform public._audit('quiz_question_save', null, jsonb_build_object('question_id', v_id));
  return v_id;
end $$;

create or replace function public.admin_set_quiz_question_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_user();
  perform public._require_admin();
  update public.quiz_questions set is_active = coalesce(p_active, true), updated_at = now() where id = p_id;
  if not found then raise exception 'question_not_found'; end if;
  perform public._audit('quiz_question_active', null, jsonb_build_object('question_id', p_id, 'active', p_active));
end $$;

-- ---------------------------------------------------------------------
-- 5r) Bilgi Yarışması: can, günlük oyun sınırı, puan (ondalıklı, tavanlı), Solo Maraton
-- ---------------------------------------------------------------------
-- Puan kuralları (genel puana yazılır, kaynak: quiz_play):
--   Solo Maraton: 5 doğru = 1, 8 doğru = 1.2, 12 doğru = 1.5 puan (ulaşılan en yüksek basamak).
--   Uzaktan: yalnızca kazanan alır = 1 × oyuncu çarpanı (2 kişi 1.25, 3 kişi 1.5, 4 kişi 1.75, 5 kişi 2).
--   Bilgi Yarışması'ndan günde en çok pts_quiz_daily_points (5), ayda en çok pts_quiz_month_points (60) puan.
--   Tavan dolarken kalan kadar yazılır (ör. 0.5).

create or replace function public._quiz_today()
returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$$;

-- Oyuncu sayısına göre kazanma çarpanı: 2 → 1.25, 3 → 1.5, 4 → 1.75, 5 → 2
create or replace function public._quiz_mult(p_players int)
returns numeric language sql immutable as $$
  select 1 + 0.25 * least(4, greatest(1, coalesce(p_players, 2)) - 1);
$$;

-- Bugün başlatılan oyun sayısı (Solo + Uzaktan; başlamadan kapanan odalar ve iptal edilen maçlar sayılmaz)
create or replace function public._quiz_games_today(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.quiz_solo_runs s
            where s.user_id = p_user and s.created_at >= public._quiz_today())
        + (select count(*) from public.quiz_match_players mp
             join public.quiz_matches m on m.id = mp.match_id
            where mp.user_id = p_user
              and ((m.mode = 'duel' and m.created_at >= public._quiz_today())
                   or (m.mode = 'arena' and m.started_at >= public._quiz_today()))
              and coalesce(m.end_reason, '') <> 'cancelled'))::int;
$$;

-- Hafta / ay başı (İstanbul saatiyle). p_offset: -1 = geçen hafta / ay
create or replace function public._quiz_week_start(p_offset int default 0)
returns timestamptz language sql stable as $$
  select (date_trunc('week', now() at time zone 'Europe/Istanbul') + make_interval(weeks => p_offset)) at time zone 'Europe/Istanbul';
$$;
create or replace function public._quiz_month_start(p_offset int default 0)
returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'Europe/Istanbul') + make_interval(months => p_offset)) at time zone 'Europe/Istanbul';
$$;

-- Solo Maraton haftalık sıralaması: haftadaki bütün koşuların doğru sayıları toplanır. Yalnızca puan getiren koşular
-- (en az quiz_solo_rank_min_correct = 5 doğru) sayılır. Eşitlikte toplam süresi kısa olan öne geçer.
create or replace function public._quiz_solo_week_rank(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, place int, alias text, avatar int, correct int, total_ms int, runs int)
language sql stable security definer set search_path = public as $$
  with t as (
    select s.user_id, sum(s.correct_count)::int as correct, sum(s.total_ms)::bigint as ms, count(*)::int as runs
      from public.quiz_solo_runs s
     where s.status = 'finished' and s.finished_at >= p_from and s.finished_at < p_to
       and s.correct_count >= greatest(1, public.setting_int('quiz_solo_rank_min_correct', 5))
     group by s.user_id
  )
  select t.user_id, (rank() over (order by t.correct desc, t.ms asc))::int, p.alias, p.avatar_index, t.correct,
         least(t.ms, 2000000000)::int, t.runs
    from t join public.profiles p on p.id = t.user_id and p.banned_at is null and p.role = 'user';
$$;

-- Bir haftanın Solo ilk 3'ü (eşitlikte aynı sıra). Ödül: sonraki hafta en çok 10 can.
create or replace function public._quiz_solo_champions(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, place int, alias text, avatar int, correct int, total_ms int)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.place, r.alias, r.avatar, r.correct, r.total_ms
    from public._quiz_solo_week_rank(p_from, p_to) r where r.place <= 3 order by r.place;
$$;

-- Bu hafta en çok kaç can: geçen haftanın Solo ilk 3'ü quiz_champion_lives (10), diğerleri quiz_max_lives (5)
create or replace function public._quiz_max_lives(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public._quiz_solo_champions(public._quiz_week_start(-1), public._quiz_week_start(0)) c
                            where c.user_id = p_user)
              then least(30, greatest(1, public.setting_int('quiz_champion_lives', 10)))
              -- Paket 26: Bilgi Yarışması başarım ödülü → en çok can kalıcı 6
              when public._has_reward(p_user, 'quiz_master')
              then greatest(6, least(20, greatest(1, public.setting_int('quiz_max_lives', 5))))
              else least(20, greatest(1, public.setting_int('quiz_max_lives', 5))) end;
$$;

-- Online (Uzaktan) sıralaması: dönemde Uzaktan'dan kazanılan genel puan; eşitlikte puan getiren galibiyet sayısı,
-- sonra o puana daha erken ulaşan
create or replace function public._quiz_online_rank(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, place int, points numeric, wins int, reached timestamptz)
language sql stable security definer set search_path = public as $$
  with w as (
    select mp.user_id, sum(mp.awarded) as pts, count(*)::int as wins, max(m.finished_at) as reached
      from public.quiz_match_players mp
      join public.quiz_matches m on m.id = mp.match_id
      join public.profiles p on p.id = mp.user_id and p.banned_at is null and p.role = 'user'
     where m.mode = 'arena' and m.status = 'finished' and m.winner = mp.user_id and mp.awarded > 0
       and m.finished_at >= p_from and m.finished_at < p_to
     group by mp.user_id
  )
  select w.user_id, (rank() over (order by w.pts desc, w.wins desc, w.reached asc))::int, w.pts, w.wins, w.reached from w;
$$;

-- Seviye 5 ödülü: Bilgi Yarışması'nda sınırsız can (günlük oyun sınırı yine geçerlidir)
create or replace function public._quiz_unlimited_lives(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public._level_perk(p_user) = 'unlimited_lives', false);
$$;

-- Seviye 4 ödülü: Bilgi Yarışması puan çarpanı (puan ve günlük/aylık/özel oda puan sınırları birlikte çarpılır)
create or replace function public._quiz_level_mult(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when public._level_perk(p_user) = 'quiz_mult'
              then greatest(100, least(300, public.setting_int('level_quiz_mult_pct', 120))) / 100.0
              else 1 end;
$$;

-- Can durumu (yazmadan hesaplar): o_lives şu anki can, o_next bir sonraki canın dolacağı an (can doluysa boş)
create or replace function public._quiz_lives_get(p_user uuid, out o_lives int, out o_next timestamptz, out o_anchor timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_max int := public._quiz_max_lives(p_user);
  v_min int := least(1440, greatest(1, public.setting_int('quiz_life_minutes', 30)));
  r public.quiz_lives;
  k int;
begin
  -- Sınırsız can: can hep dolu görünür, hiç azalmaz
  if public._quiz_unlimited_lives(p_user) then
    o_lives := v_max; o_next := null; o_anchor := now();
    return;
  end if;
  select * into r from public.quiz_lives where user_id = p_user;
  if not found or r.lives >= v_max then
    o_lives := v_max; o_next := null; o_anchor := now();
    return;
  end if;
  k := greatest(0, floor(extract(epoch from now() - r.anchor) / (v_min * 60))::int);
  o_lives := least(v_max, greatest(0, r.lives) + k);
  if o_lives >= v_max then
    o_next := null; o_anchor := now();
  else
    o_anchor := r.anchor + make_interval(mins => v_min * k);
    o_next := o_anchor + make_interval(mins => v_min);
  end if;
end $$;

-- 1 can harcar. Can yoksa 'no_lives', bugünkü oyun sınırı dolduysa 'quiz_daily_limit'.
create or replace function public._quiz_use_life(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_max int := public._quiz_max_lives(p_user);
  g record;
begin
  insert into public.quiz_lives (user_id, lives, anchor) values (p_user, v_max, now()) on conflict (user_id) do nothing;
  perform 1 from public.quiz_lives where user_id = p_user for update;
  if public._quiz_games_today(p_user) >= greatest(1, public.setting_int('quiz_daily_games', 25)) then
    raise exception 'quiz_daily_limit';
  end if;
  -- Sınırsız can (Seviye 5): can harcanmaz
  if public._quiz_unlimited_lives(p_user) then return; end if;
  select * into g from public._quiz_lives_get(p_user);
  if g.o_lives < 1 then raise exception 'no_lives'; end if;
  update public.quiz_lives
     set lives = g.o_lives - 1,
         anchor = case when g.o_lives >= v_max then now() else g.o_anchor end
   where user_id = p_user;
end $$;

-- Kullanıcının elinde olmayan bir nedenle başlamadan kapanan maçta can geri verilir
create or replace function public._quiz_refund_life(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_max int := public._quiz_max_lives(p_user);
begin
  update public.quiz_lives set lives = least(v_max, lives + 1) where user_id = p_user;
end $$;

-- Bilgi Yarışması puanı yazar (günlük/aylık tavanla). o_note: ok, cap_partial, cap, win_nopoints
create or replace function public._quiz_award(p_user uuid, p_amount numeric, p_reason text,
                                              out o_awarded numeric, out o_note text)
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_day numeric;
  v_month numeric;
  v_left numeric;
  v_mult numeric;
  v_amount numeric;
begin
  o_awarded := 0;
  o_note := 'ok';
  select role::text into v_role from public.profiles where id = p_user and banned_at is null;
  if v_role is distinct from 'user' then o_note := 'win_nopoints'; return; end if;
  if p_amount is null or p_amount <= 0 then o_note := 'none'; return; end if;
  perform pg_advisory_xact_lock(hashtext('quiz_award:' || p_user::text));
  -- Seviye 4 ödülü: puan ve günlük/aylık sınır birlikte çarpılır (diğerlerinde 1)
  v_mult := public._quiz_level_mult(p_user);
  v_amount := round(p_amount * v_mult, 2);
  select coalesce(sum(amount), 0) into v_day from public.point_events
   where user_id = p_user and source = 'quiz_play' and created_at >= public._quiz_today();
  select coalesce(sum(amount), 0) into v_month from public.point_events
   where user_id = p_user and source = 'quiz_play' and created_at >= public._month_start();
  v_left := least(public.setting_int('pts_quiz_daily_points', 10) * v_mult - v_day,
                  public.setting_int('pts_quiz_month_points', 125) * v_mult - v_month);
  if v_left <= 0 then o_note := 'cap'; return; end if;
  o_awarded := round(least(v_amount, v_left), 2);
  if o_awarded < v_amount then o_note := 'cap_partial'; end if;
  insert into public.point_events (user_id, amount, reason, source) values (p_user, o_awarded, p_reason, 'quiz_play');
  insert into public.game_play_log (user_id, game_type, points, won) values (p_user, 'quiz', o_awarded, true);
end $$;

-- Solo Maraton: soru süresi (ilk soru 20 sn, her soruda 1 sn azalır, en az 9 sn)
create or replace function public._quiz_solo_secs(p_index int)
returns int language sql immutable as $$
  select greatest(9, 20 - greatest(0, p_index));
$$;

-- Solo Maraton soruları: 4 kolay, 4 orta, 4 zor. Önce oyuncunun son 7 günde görmedikleri; yetmezse aynı zorlukta
-- diğerleri; o da yetmezse herhangi bir zorluk.
create or replace function public._quiz_solo_pick(p_user uuid)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare
  v_ids uuid[] := '{}';
  v_part uuid[];
  d int;
begin
  for d in 1 .. 3 loop
    select coalesce(array_agg(x.id), '{}') into v_part
      from (select q.id from public.quiz_questions q
             where q.is_active and q.difficulty = d and not (q.id = any (v_ids))
             order by (exists (select 1 from public.quiz_seen s where s.question_id = q.id and s.user_id = p_user
                                 and s.seen_at > now() - interval '7 days')), random()
             limit 4) x;
    if coalesce(array_length(v_part, 1), 0) < 4 then
      v_part := v_part || coalesce((select array_agg(y.id) from (
                  select q.id from public.quiz_questions q
                   where q.is_active and not (q.id = any (v_ids || v_part))
                   order by abs(q.difficulty - d), random()
                   limit 4 - coalesce(array_length(v_part, 1), 0)) y), '{}');
    end if;
    v_ids := v_ids || v_part;
  end loop;
  return v_ids;
end $$;

-- Rastgele sandık içeriği (Solo'da joker nadirdir): %50 boş, %40 tek joker, %9 iki joker, %1 üç joker
create or replace function public._quiz_solo_chest()
returns jsonb language plpgsql volatile as $$
declare
  r numeric := random();
  k text[] := array['freeze', 'double', 'fifty'];
  pick text[];
  c jsonb := '{"freeze": 0, "double": 0, "fifty": 0}'::jsonb;
  x text;
begin
  select array_agg(t order by random()) into pick from unnest(k) t;
  if r < 0.50 then
    return c;
  elsif r < 0.90 then
    pick := pick[1:1];
  elsif r < 0.99 then
    pick := pick[1:2];
  else
    pick := pick[1:3];
  end if;
  foreach x in array pick loop
    c := jsonb_set(c, array[x], to_jsonb(1));
  end loop;
  return c;
end $$;

-- Solo Maratonu bitirir: ulaşılan basamağa göre puan, istatistik (oynama; 5+ doğru = galibiyet)
create or replace function public._quiz_solo_finish(p_run_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.quiz_solo_runs;
  v_amt numeric := 0;
  v_aw numeric := 0;
  v_note text;
  v_role text;
begin
  select * into r from public.quiz_solo_runs where id = p_run_id for update;
  if not found or r.status <> 'playing' then return; end if;
  if r.correct_count >= 12 then v_amt := public.setting_int('pts_quiz_solo_12', 150) / 100.0;
  elsif r.correct_count >= 8 then v_amt := public.setting_int('pts_quiz_solo_8', 120) / 100.0;
  elsif r.correct_count >= 5 then v_amt := public.setting_int('pts_quiz_solo_5', 100) / 100.0;
  end if;
  select role::text into v_role from public.profiles where id = r.user_id;
  if v_amt > 0 then
    select x.o_awarded, x.o_note into v_aw, v_note
      from public._quiz_award(r.user_id, v_amt, 'Bilgi Yarışması Solo: ' || r.correct_count || ' doğru') x;
  else
    v_note := 'below_5';
  end if;
  if v_role = 'user' then
    insert into public.user_game_stats (user_id, game_type, plays, wins)
    values (r.user_id, 'quiz', 1, case when r.correct_count >= 5 then 1 else 0 end)
    on conflict (user_id, game_type)
    do update set plays = public.user_game_stats.plays + 1,
                  wins = public.user_game_stats.wins + (case when r.correct_count >= 5 then 1 else 0 end),
                  updated_at = now();
  end if;
  update public.quiz_solo_runs
     set status = 'finished', phase = 'finished', finished_at = now(), phase_ends_at = now(),
         awarded = coalesce(v_aw, 0), note = coalesce(v_note, p_reason)
   where id = r.id;
end $$;

-- Aşamaları ilerletir (satır kilitliyken): sandık süresi dolduysa ilk sandık açılır; soru süresi dolduysa maraton biter;
-- cevap gösterimi bittiyse sonraki soru (12. sorudan sonra bitiş).
create or replace function public._quiz_solo_tick(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.quiz_solo_runs;
  i int;
begin
  for i in 1 .. 3 loop
    select * into r from public.quiz_solo_runs where id = p_run_id;
    exit when not found or r.status <> 'playing';
    if r.phase = 'chest' then
      exit when now() < r.phase_ends_at;
      update public.quiz_solo_runs
         set chest_pick = 0, jokers = r.chests -> 0, phase = 'question', q_index = 0, q_state = '{}'::jsonb,
             phase_started_at = now() + interval '7 seconds',
             phase_ends_at = now() + interval '7 seconds' + make_interval(secs => public._quiz_solo_secs(0))
       where id = r.id;
    elsif r.phase = 'question' then
      exit when now() <= r.phase_ends_at + interval '400 milliseconds';
      update public.quiz_solo_runs
         set last = jsonb_build_object('q', r.q_index, 'choice', -1, 'correct', false,
                     'correct_choice', (select k from generate_series(0, 3) k
                                         where ((r.orders -> r.q_index) ->> k)::int
                                               = (select q.correct from public.quiz_questions q
                                                   where q.id = r.question_ids[r.q_index + 1])))
       where id = r.id;
      perform public._quiz_solo_finish(r.id, 'timeout');
      exit;
    elsif r.phase = 'reveal' then
      exit when now() < r.phase_ends_at;
      if r.q_index >= array_length(r.question_ids, 1) - 1 then
        perform public._quiz_solo_finish(r.id, 'completed');
        exit;
      end if;
      update public.quiz_solo_runs
         set phase = 'question', q_index = r.q_index + 1, q_state = '{}'::jsonb, phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => public._quiz_solo_secs(r.q_index + 1))
       where id = r.id;
    else
      exit;
    end if;
  end loop;
end $$;

create or replace function public._quiz_my_solo(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from public.quiz_solo_runs s
   where s.user_id = p_user and s.status = 'playing'
   order by s.created_at desc limit 1;
$$;

-- Solo Maraton başlat: 1 can harcar. Devam eden maratonun varsa ona dönülür.
create or replace function public.quiz_start_solo(p_cell_q int default null, p_cell_r int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_live uuid;
  v_ids uuid[];
  v_orders jsonb;
  v_id uuid;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if not exists (select 1 from public.game_types where key = 'quiz' and enabled) then raise exception 'game_not_available'; end if;
  perform pg_advisory_xact_lock(hashtext('quiz_user:' || v.id::text));
  v_live := public._quiz_my_solo(v.id);
  if v_live is not null then return v_live; end if;
  if public._quiz_my_live(v.id) is not null then raise exception 'already_in_match'; end if;
  delete from public.quiz_queue where user_id = v.id;
  perform public._quiz_use_life(v.id);
  v_ids := public._quiz_solo_pick(v.id);
  if coalesce(array_length(v_ids, 1), 0) < 12 then raise exception 'quiz_no_questions'; end if;
  select jsonb_agg((select jsonb_agg(x order by random()) from generate_series(0, 3) x where g.n > 0) order by g.n)
    into v_orders from generate_series(1, 12) as g(n);
  insert into public.quiz_solo_runs (user_id, alias, avatar_index, question_ids, orders, chests, phase,
                                     phase_started_at, phase_ends_at)
  values (v.id, v.alias, v.avatar_index, v_ids, v_orders,
          jsonb_build_array(public._quiz_solo_chest(), public._quiz_solo_chest(), public._quiz_solo_chest()),
          'chest', now(), now() + interval '45 seconds')
  returning id into v_id;
  insert into public.quiz_seen (user_id, question_id, seen_at)
  select v.id, unnest(v_ids), now()
  on conflict (user_id, question_id) do update set seen_at = excluded.seen_at;
  -- Oyundayken bulunduğu petek yoğunluğa sayılır (konum izni varsa telefon gönderir; kimse görünmez)
  if p_cell_q is not null and p_cell_r is not null and public._map_cell_ok(p_cell_q, p_cell_r) then
    perform public._map_cleanup();
    insert into public.map_signals (user_id, q, r, source, room_id, day)
    values (v.id, p_cell_q, p_cell_r, 'quiz', v_id, public._map_day())
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Sandık seç (0, 1, 2): içindeki jokerler senin olur, maraton başlar. Diğer sandıkların içeriği de gösterilir.
create or replace function public.quiz_solo_pick_chest(p_run_id uuid, p_index int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.quiz_solo_runs;
begin
  v := public._require_user();
  if p_index is null or p_index not between 0 and 2 then raise exception 'invalid_choice'; end if;
  select * into r from public.quiz_solo_runs where id = p_run_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  if r.status <> 'playing' or r.phase <> 'chest' then raise exception 'answer_closed'; end if;
  update public.quiz_solo_runs
     set chest_pick = p_index, jokers = r.chests -> p_index, phase = 'question', q_index = 0, q_state = '{}'::jsonb,
         -- Sandıktan çıkan jokerler 7 sn gösterilir (ne işe yaradıkları okunur); ilk soru (ve süresi) ondan sonra başlar
         phase_started_at = now() + interval '7 seconds',
         phase_ends_at = now() + interval '7 seconds' + make_interval(secs => public._quiz_solo_secs(0)),
         last_seen_at = now()
   where id = r.id;
end $$;

-- Maratonun anlık durumu (telefon saniyede bir çağırır). Doğru şık yalnızca cevaptan sonra (ya da süre bitince) gelir.
create or replace function public.quiz_solo_state(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.quiz_solo_runs;
  q public.quiz_questions;
  v_ord jsonb;
  v_opts jsonb;
begin
  v := public._require_user();
  select * into r from public.quiz_solo_runs where id = p_run_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_solo_tick(r.id);
  update public.quiz_solo_runs set last_seen_at = now()
   where id = r.id and status = 'playing' and last_seen_at < now() - interval '2 seconds';
  select * into r from public.quiz_solo_runs where id = p_run_id;
  -- Soru, başlama anından önce (sandık açılışı) telefona gönderilmez
  if r.phase = 'reveal' or (r.phase = 'question' and now() >= r.phase_started_at) then
    select * into q from public.quiz_questions where id = r.question_ids[r.q_index + 1];
    v_ord := r.orders -> r.q_index;
    select jsonb_agg(q.options[(v_ord ->> k)::int + 1] order by k) into v_opts from generate_series(0, 3) k;
  end if;
  return jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'phase', r.phase,
    'q_index', r.q_index,
    'total', array_length(r.question_ids, 1),
    'server_now', now(),
    'phase_started_at', r.phase_started_at,
    'phase_ends_at', r.phase_ends_at,
    'question_seconds', public._quiz_solo_secs(r.q_index),
    'alias', r.alias,
    'avatar', r.avatar_index,
    'chests', case when r.chest_pick is null then null else r.chests end,
    'chest_pick', r.chest_pick,
    'jokers', r.jokers,
    'q_state', r.q_state - 'correct',
    'question', case when q.id is null then null
                     else jsonb_build_object('category', q.category, 'text', q.question, 'options', v_opts,
                                             'difficulty', q.difficulty) end,
    'last', case when r.phase in ('reveal', 'finished') then r.last end,
    'correct_count', r.correct_count,
    'total_ms', r.total_ms,
    'awarded', r.awarded,
    'note', r.note,
    'milestones', jsonb_build_array(
       jsonb_build_object('at', 5, 'points', public.setting_int('pts_quiz_solo_5', 100) / 100.0),
       jsonb_build_object('at', 8, 'points', public.setting_int('pts_quiz_solo_8', 120) / 100.0),
       jsonb_build_object('at', 12, 'points', public.setting_int('pts_quiz_solo_12', 150) / 100.0)),
    -- Bitince: en iyi koşum (tüm zamanlar), bu haftaki toplam doğrum ve sıram
    'best_ever', case when r.status = 'finished'
                      then (select max(x.correct_count) from public.quiz_solo_runs x
                             where x.user_id = v.id and x.status = 'finished') end,
    'week', case when r.status = 'finished'
                 then (select jsonb_build_object('total', w.correct, 'place', w.place, 'runs', w.runs)
                         from public._quiz_solo_week_rank(public._quiz_week_start(0), public._quiz_week_start(1)) w
                        where w.user_id = v.id) end,
    'week_top', case when r.status = 'finished'
                     then coalesce((select jsonb_agg(jsonb_build_object('place', w.place, 'alias', w.alias, 'avatar', w.avatar,
                                                                        'correct', w.correct, 'is_me', w.user_id = v.id)
                                                     order by w.place, w.alias)
                                      from public._quiz_solo_week_rank(public._quiz_week_start(0), public._quiz_week_start(1)) w
                                     where w.place <= 5), '[]'::jsonb) end);
end $$;

-- Cevap: süre içinde, gizlenmemiş bir şık. Doğruysa sonraki soruya geçilir; yanlışsa (çift cevap jokeri yoksa) maraton biter.
create or replace function public.quiz_solo_answer(p_run_id uuid, p_q_index int, p_choice int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.quiz_solo_runs;
  q public.quiz_questions;
  v_ord jsonb;
  v_ms int;
  v_ok boolean;
  v_cd int;
begin
  v := public._require_user();
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into r from public.quiz_solo_runs where id = p_run_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_solo_tick(r.id);
  select * into r from public.quiz_solo_runs where id = p_run_id;
  if r.status <> 'playing' or r.phase <> 'question' or r.q_index <> p_q_index
     or now() > r.phase_ends_at + interval '400 milliseconds' then
    raise exception 'answer_closed';
  end if;
  if coalesce(r.q_state -> 'hidden', '[]'::jsonb) @> to_jsonb(p_choice)
     or coalesce(r.q_state -> 'wrong', '[]'::jsonb) @> to_jsonb(p_choice) then
    raise exception 'invalid_choice';
  end if;
  v_ms := greatest(0, (extract(epoch from now() - r.phase_started_at) * 1000)::int);
  if v_ms < 500 then raise exception 'too_fast'; end if;
  select * into q from public.quiz_questions where id = r.question_ids[r.q_index + 1];
  v_ord := r.orders -> r.q_index;
  v_ok := (v_ord ->> p_choice)::int = q.correct;
  select k into v_cd from generate_series(0, 3) k where (v_ord ->> k)::int = q.correct;
  update public.quiz_questions set times_shown = times_shown + 1, times_correct = times_correct + (case when v_ok then 1 else 0 end)
   where id = q.id and not coalesce((r.q_state ->> 'counted')::boolean, false);
  if v_ok then
    update public.quiz_solo_runs
       set correct_count = correct_count + 1, total_ms = total_ms + least(v_ms, public._quiz_solo_secs(r.q_index) * 1000 + 15000),
           phase = 'reveal', phase_started_at = now(), phase_ends_at = now() + interval '1600 milliseconds',
           last = jsonb_build_object('q', r.q_index, 'choice', p_choice, 'correct', true, 'correct_choice', v_cd),
           last_seen_at = now()
     where id = r.id;
    return jsonb_build_object('correct', true, 'correct_choice', v_cd);
  end if;
  -- Çift cevap jokeri açıksa: bir hak daha (yanlış şık işaretlenir, soru devam eder)
  if coalesce((r.q_state ->> 'double')::boolean, false) then
    update public.quiz_solo_runs
       set q_state = jsonb_set(jsonb_set(r.q_state, '{double}', 'false'::jsonb), '{wrong}',
                               coalesce(r.q_state -> 'wrong', '[]'::jsonb) || to_jsonb(p_choice))
                     || '{"counted": true}'::jsonb,
           last_seen_at = now()
     where id = r.id;
    return jsonb_build_object('correct', false, 'retry', true);
  end if;
  update public.quiz_solo_runs
     set last = jsonb_build_object('q', r.q_index, 'choice', p_choice, 'correct', false, 'correct_choice', v_cd)
   where id = r.id;
  perform public._quiz_solo_finish(r.id, 'wrong');
  return jsonb_build_object('correct', false, 'correct_choice', v_cd);
end $$;

-- Joker kullan (soru sırasında, her türden soru başına bir kez):
--   fifty  → iki yanlış şık gizlenir;  double → bu soruda yanlışta bir hak daha;  freeze → süreye 15 sn eklenir
create or replace function public.quiz_solo_joker(p_run_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.quiz_solo_runs;
  q public.quiz_questions;
  v_ord jsonb;
  v_hide jsonb;
  v_left int;
begin
  v := public._require_user();
  if p_kind not in ('fifty', 'double', 'freeze') then raise exception 'invalid_joker'; end if;
  select * into r from public.quiz_solo_runs where id = p_run_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_solo_tick(r.id);
  select * into r from public.quiz_solo_runs where id = p_run_id;
  if r.status <> 'playing' or r.phase <> 'question' or now() > r.phase_ends_at or now() < r.phase_started_at then
    raise exception 'answer_closed';
  end if;
  v_left := coalesce((r.jokers ->> p_kind)::int, 0);
  if v_left < 1 then raise exception 'no_joker'; end if;
  if coalesce(r.q_state -> 'used', '[]'::jsonb) @> to_jsonb(p_kind) then raise exception 'joker_used'; end if;
  if p_kind = 'fifty' then
    select * into q from public.quiz_questions where id = r.question_ids[r.q_index + 1];
    v_ord := r.orders -> r.q_index;
    -- Doğru olmayan ve henüz elenmemiş şıklardan rastgele ikisi
    select coalesce(jsonb_agg(z.k), '[]'::jsonb) into v_hide from (
      select k from generate_series(0, 3) k
       where (v_ord ->> k)::int <> q.correct
         and not (coalesce(r.q_state -> 'wrong', '[]'::jsonb) @> to_jsonb(k))
       order by random() limit 2) z;
    update public.quiz_solo_runs
       set q_state = jsonb_set(r.q_state, '{hidden}', v_hide)
     where id = r.id;
  elsif p_kind = 'double' then
    update public.quiz_solo_runs set q_state = jsonb_set(r.q_state, '{double}', 'true'::jsonb) where id = r.id;
  else
    update public.quiz_solo_runs
       set q_state = jsonb_set(r.q_state, '{frozen}', 'true'::jsonb),
           phase_ends_at = phase_ends_at + make_interval(secs => least(30, greatest(5, public.setting_int('quiz_freeze_seconds', 15))))
     where id = r.id;
  end if;
  select * into r from public.quiz_solo_runs where id = p_run_id;
  update public.quiz_solo_runs
     set jokers = jsonb_set(r.jokers, array[p_kind], to_jsonb(v_left - 1)),
         q_state = jsonb_set(r.q_state, '{used}', coalesce(r.q_state -> 'used', '[]'::jsonb) || to_jsonb(p_kind)),
         last_seen_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- Maratonu bırak: o ana kadar ulaştığın basamağın puanı yazılır (yanlış cevapla bitmekle aynı)
create or replace function public.quiz_solo_leave(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.quiz_solo_runs;
begin
  v := public._require_user();
  select * into r from public.quiz_solo_runs where id = p_run_id and user_id = v.id for update;
  if not found or r.status <> 'playing' then return; end if;
  perform public._quiz_solo_finish(r.id, 'left');
end $$;

-- Solo Maraton haftalık sıralaması (pazartesiden beri): haftanın toplam doğru sayısı (yalnızca 5+ doğrulu koşular).
-- Yalnızca rumuz ve avatar görünür.
drop function if exists public.quiz_solo_leaderboard(int);
create or replace function public.quiz_solo_leaderboard(p_limit int default 20)
returns table (place int, alias text, avatar int, correct int, total_ms int, runs int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select x.place, x.alias, x.avatar, x.correct, x.total_ms, x.runs, x.user_id = auth.uid()
    from public._quiz_solo_week_rank(public._quiz_week_start(0), public._quiz_week_start(1)) x
   where public._is_active_user()
     and (x.place <= least(50, greatest(1, coalesce(p_limit, 20))) or x.user_id = auth.uid())
   order by x.place, x.alias;
$$;

-- ---------------------------------------------------------------------
-- 5s) Bilgi Yarışması Uzaktan (2–5 kişi): eşleşme ve özel oda, kategori oylaması, kaos barı, gizli sandıklar,
--     joker kartları, kapalı zarf takası, ani ölüm
-- ---------------------------------------------------------------------
-- Akış (sunucu saatiyle; telefonlar ~0,9 sn'de bir quiz_arena_state çağırır, aşamalar bu çağrılarda ilerler):
--   (özel oda: lobby) → intro → [vote → soru → cevaplar → soru → cevaplar → kaos] × 5 raunt (son rauntta kaos yok)
--   → en yüksek skorda eşitlik varsa ani ölüm (en hızlı doğru kazanır) → bitti
-- Soru puanı: doğru = 100 + kalan tam saniye × 10; yanlış ya da boş = 0 (puan düşmez).
-- Kartlar (sandıktan): thief (Hırsız), roulette (Rus Ruleti), shield (Kalkan), freeze (Süre Dondurma: rakipler −3 sn),
--   fifty (50/50, nadir). (Paket 22: Bomba ve kapalı zarf takası kaldırıldı; eski bombalar maç sonunda temizlenir.)
-- Genel puan yalnızca kazanana: 1 × oyuncu çarpanı; günlük/aylık Bilgi Yarışması tavanı (_quiz_award).
--   Rastgele eşleşmede aynı rakiplerle sınırsız (yalnızca günlük/aylık tavan).
--   Özel odada aynı kişilerden biriyle oynanan maçlardan günde en çok pts_quiz_private_group_daily (5) puan.

create or replace function public._arena_rounds() returns int language sql stable set search_path = public as $$
  select least(8, greatest(2, public.setting_int('quiz_arena_rounds', 5)));
$$;
create or replace function public._arena_qsec() returns int language sql stable set search_path = public as $$
  select least(30, greatest(6, public.setting_int('quiz_arena_question_seconds', 10)));
$$;
create or replace function public._arena_colors() returns text[] language sql immutable as $$
  select array['purple', 'blue', 'orange', 'green', 'pink', 'yellow'];
$$;

-- Maç olayı ekler (son 40 olay tutulur)
create or replace function public._arena_event(p_match uuid, p_kind text, p_a int, p_t int default null,
                                               p_v int default null, p_c text default null, p_c2 text default null,
                                               p_private boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.quiz_matches
     set ev_seq = ev_seq + 1,
         events = (case when jsonb_array_length(events) >= 40 then events - 0 else events end)
                  || jsonb_build_array(jsonb_build_object('n', ev_seq + 1, 'at', now(), 'k', p_kind, 'a', p_a, 't', p_t,
                                                          'v', p_v, 'c', p_c, 'c2', p_c2, 'p', p_private,
                                                          'q', q_index, 'r', round))
   where id = p_match;
end $$;

-- Ele kart ekler (el doluysa eklenmez, false döner)
create or replace function public._arena_add_card(p_match uuid, p_user uuid, p_kind text, p_fuse int default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.quiz_match_players
     set card_seq = card_seq + 1,
         cards = cards || jsonb_build_array(jsonb_build_object('id', card_seq + 1, 'k', p_kind, 'fuse', p_fuse))
   where match_id = p_match and user_id = p_user
     and jsonb_array_length(cards) < least(6, greatest(1, public.setting_int('quiz_arena_hand', 4)));
  return found;
end $$;

-- Elden kart çıkarır
create or replace function public._arena_without(p_cards jsonb, p_id int)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(c order by o), '[]'::jsonb)
    from jsonb_array_elements(p_cards) with ordinality as t(c, o)
   where (c ->> 'id')::int is distinct from p_id;
$$;

-- Maça soru ekler (kategori boşsa herhangi). Önce oyuncuların son 7 günde görmediği, raunda uygun zorlukta sorular.
-- Dönen değer: eklenen ilk sorunun sırası (q_index).
create or replace function public._arena_pick(p_match uuid, p_category text, p_n int)
returns int language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_users uuid[];
  v_target int;
  v_new uuid[];
  v_more uuid[];
  v_ord jsonb;
begin
  select * into m from public.quiz_matches where id = p_match;
  select coalesce(array_agg(user_id), '{}') into v_users from public.quiz_match_players where match_id = p_match;
  v_target := case when m.round <= 1 then 1 when m.round <= 3 then 2 else 3 end;
  select coalesce(array_agg(x.id), '{}') into v_new from (
    select q.id from public.quiz_questions q
     where q.is_active and (p_category is null or q.category = p_category) and not (q.id = any (m.question_ids))
     order by (exists (select 1 from public.quiz_seen s where s.question_id = q.id and s.user_id = any (v_users)
                         and s.seen_at > now() - interval '7 days')),
              abs(q.difficulty - v_target), random()
     limit p_n) x;
  if coalesce(array_length(v_new, 1), 0) < p_n then
    select coalesce(array_agg(y.id), '{}') into v_more from (
      select q.id from public.quiz_questions q
       where q.is_active and not (q.id = any (m.question_ids || v_new))
       order by (exists (select 1 from public.quiz_seen s where s.question_id = q.id and s.user_id = any (v_users)
                           and s.seen_at > now() - interval '7 days')), random()
       limit p_n - coalesce(array_length(v_new, 1), 0)) y;
    v_new := v_new || v_more;
  end if;
  if coalesce(array_length(v_new, 1), 0) < p_n then raise exception 'quiz_no_questions'; end if;
  -- Her soru için ayrı şık karıştırma (iç sorgu dıştaki satıra bağlı)
  select jsonb_agg((select jsonb_agg(x order by random()) from generate_series(0, 3) x where g.n > 0) order by g.n)
    into v_ord from generate_series(1, p_n) as g(n);
  update public.quiz_matches set question_ids = question_ids || v_new, orders = orders || v_ord where id = p_match;
  insert into public.quiz_seen (user_id, question_id, seen_at)
  select u, qid, now() from unnest(v_users) u cross join unnest(v_new) qid
  on conflict (user_id, question_id) do update set seen_at = excluded.seen_at;
  return coalesce(array_length(m.question_ids, 1), 0);
end $$;

-- Yeni raunt: 3 rastgele kategori oylamaya sunulur (en az 2 sorusu kalan kategoriler)
create or replace function public._arena_start_round(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_opts text[];
  v_q int;
begin
  select * into m from public.quiz_matches where id = p_match;
  update public.quiz_match_players set prev_round_pts = round_pts, round_pts = 0, vote = null where match_id = p_match;
  select array_agg(z.c) into v_opts from (
    select q.category as c from public.quiz_questions q
     where q.is_active and not (q.id = any (m.question_ids))
     group by q.category having count(*) >= 2 order by random() limit 3) z;
  update public.quiz_matches set round = round + 1, vote_options = v_opts, round_category = null where id = p_match;
  if coalesce(array_length(v_opts, 1), 0) = 0 then
    v_q := public._arena_pick(p_match, null, 2);
    update public.quiz_matches
       set phase = 'question', q_index = v_q, phase_started_at = now(),
           phase_ends_at = now() + make_interval(secs => public._arena_qsec())
     where id = p_match;
  else
    update public.quiz_matches
       set phase = 'vote', phase_started_at = now(),
           phase_ends_at = now() + make_interval(secs => least(20, greatest(4, public.setting_int('quiz_arena_vote_seconds', 10))))
     where id = p_match;
  end if;
end $$;

-- Oylama sonucu: en çok oy alan kategori (eşitlikte kura; kimse oy vermediyse kura). Rauntun 2 sorusu seçilir.
create or replace function public._arena_resolve_vote(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_cat text;
  v_q int;
begin
  select * into m from public.quiz_matches where id = p_match;
  select z.vote into v_cat from (
    select vote, count(*) as n from public.quiz_match_players
     where match_id = p_match and left_at is null and vote = any (m.vote_options)
     group by vote order by n desc, random() limit 1) z;
  if v_cat is null then
    v_cat := m.vote_options[1 + floor(random() * array_length(m.vote_options, 1))::int];
  end if;
  update public.quiz_matches set round_category = v_cat where id = p_match;
  v_q := public._arena_pick(p_match, v_cat, 2);
  update public.quiz_matches
     set phase = 'question', q_index = v_q, phase_started_at = now(),
         phase_ends_at = now() + make_interval(secs => public._arena_qsec())
   where id = p_match;
  perform public._arena_event(p_match, 'category', null, null, null, v_cat);
end $$;

-- Soru sonu: cevaplamayanlara “boş”; Rus Ruleti, kaos barı, Hırsız uygulanır. Skor 0'ın altına inmez.
create or replace function public._arena_resolve_question(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  p public.quiz_match_players;
  t public.quiz_match_players;
  a public.quiz_answers;
  v_fx jsonb;
  v_pts int;
  v_loss int;
  v_bar int;
  v_base int;
  v_amt int;
  v_tgt int;
  v_qsec int := public._arena_qsec();
begin
  select * into m from public.quiz_matches where id = p_match;
  insert into public.quiz_answers (match_id, user_id, q_index, choice, is_correct, ms, points)
  select m.id, mp.user_id, m.q_index, -1, false, v_qsec * 1000, 0
    from public.quiz_match_players mp where mp.match_id = m.id and mp.left_at is null
  on conflict do nothing;

  for p in select * from public.quiz_match_players where match_id = m.id order by slot loop
    select * into a from public.quiz_answers where match_id = m.id and user_id = p.user_id and q_index = m.q_index;
    continue when not found;
    v_fx := case when (p.qfx ->> 'q')::int = m.q_index then p.qfx else '{}'::jsonb end;
    v_pts := a.points;
    v_loss := 0;
    if coalesce((v_fx ->> 'roulette')::boolean, false) then
      if a.is_correct then
        v_pts := a.points * 2;
        perform public._arena_event(m.id, 'roulette_win', p.slot, null, v_pts);
      else
        -- Yanlış ya da boş: bu rauntta kazandığının 2 katı silinir (en az 200)
        v_loss := least(p.score, 2 * greatest(p.round_pts, 100));
        perform public._arena_event(m.id, 'roulette_lose', p.slot, null, v_loss);
      end if;
    end if;
    v_bar := case when a.is_correct
                  then 25 + floor(25 * greatest(0, 1 - a.ms::numeric / (v_qsec * 1000)))::int else 0 end;
    update public.quiz_match_players
       set score = greatest(0, score + v_pts - v_loss), round_pts = round_pts + v_pts,
           correct_count = correct_count + (case when a.is_correct then 1 else 0 end),
           bar = least(100, bar + v_bar)
     where match_id = m.id and user_id = p.user_id;
    update public.quiz_answers set points = v_pts where match_id = m.id and user_id = p.user_id and q_index = m.q_index;
  end loop;

  -- Hırsız: hedefin bu sorudaki puanının (yoksa önceki rauntta kazandığının) %25–50'si çalınır. Kalkan engeller.
  for p in select * from public.quiz_match_players
            where match_id = m.id and left_at is null and (qfx ->> 'q')::int = m.q_index and qfx ? 'thief'
            order by slot loop
    v_tgt := (p.qfx ->> 'thief')::int;
    select * into t from public.quiz_match_players where match_id = m.id and slot = v_tgt;
    continue when not found or t.user_id = p.user_id;
    if t.shield_round = m.round then
      perform public._arena_event(m.id, 'thief_blocked', p.slot, v_tgt);
      continue;
    end if;
    select points into v_base from public.quiz_answers where match_id = m.id and user_id = t.user_id and q_index = m.q_index;
    if coalesce(v_base, 0) <= 0 then v_base := t.prev_round_pts; end if;
    v_amt := least(t.score, floor(coalesce(v_base, 0) * (0.25 + random() * 0.25))::int);
    if v_amt > 0 then
      update public.quiz_match_players set score = score - v_amt where match_id = m.id and user_id = t.user_id;
      update public.quiz_match_players set score = score + v_amt where match_id = m.id and user_id = p.user_id;
    end if;
    perform public._arena_event(m.id, 'thief', p.slot, v_tgt, v_amt);
  end loop;

  update public.quiz_questions
     set times_shown = times_shown + (select count(*) from public.quiz_answers a2 where a2.match_id = m.id and a2.q_index = m.q_index),
         times_correct = times_correct + (select count(*) from public.quiz_answers a2
                                           where a2.match_id = m.id and a2.q_index = m.q_index and a2.is_correct)
   where id = m.question_ids[m.q_index + 1];
end $$;

-- Sandık içeriği (her açılışta sunucuda rastgele). Paket 22: Bomba kaldırıldı, yalnızca jokerler (ve boş) çıkar:
-- güçlü joker %35 (Rus Ruleti 14, Kalkan 14, 50/50 7), sabotaj %40 (Hırsız 21, Süre Dondurma 19), boş %25
create or replace function public._arena_chest_roll()
returns text language plpgsql volatile as $$
declare r numeric := random() * 100;
begin
  return case when r < 14 then 'roulette' when r < 28 then 'shield' when r < 35 then 'fifty'
              when r < 56 then 'thief' when r < 75 then 'freeze' else 'empty' end;
end $$;

-- Sandık aç: sonuç ele eklenir (el doluysa kart kaybolur). Sonuç yalnızca açana görünür.
create or replace function public._arena_open(p_match uuid, p_user uuid, p_idx int)
returns text language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_out text;
  v_ok boolean := true;
  v_res text;
  v_slot int;
begin
  select * into m from public.quiz_matches where id = p_match;
  v_out := public._arena_chest_roll();
  if v_out <> 'empty' then
    v_ok := public._arena_add_card(p_match, p_user, v_out, case when v_out = 'bomb' then m.chaos_no + 1 end);
  end if;
  v_res := v_out || case when v_ok then '' else ':lost' end;
  update public.quiz_match_players set chest_state = 'picked', chest_result = v_res, chest_pick = p_idx
   where match_id = p_match and user_id = p_user
  returning slot into v_slot;
  perform public._arena_event(p_match, 'chest', v_slot, null, p_idx, v_out, null, true);
  return v_res;
end $$;

-- Bombalar patlar (fitili p_upto'ya kadar olanlar): her bomba skorun quiz_bomb_percent (%20) kadarını siler
create or replace function public._arena_explode(p_match uuid, p_upto int)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.quiz_match_players;
  v_n int;
  v_loss int;
  v_pct int := least(60, greatest(5, public.setting_int('quiz_bomb_percent', 20)));
begin
  for p in select * from public.quiz_match_players where match_id = p_match and left_at is null order by slot loop
    select count(*)::int into v_n from jsonb_array_elements(p.cards) c
     where c ->> 'k' = 'bomb' and coalesce((c ->> 'fuse')::int, 0) <= p_upto;
    continue when v_n = 0;
    v_loss := floor(p.score * least(0.9, v_n * v_pct / 100.0))::int;
    update public.quiz_match_players
       set score = score - v_loss,
           cards = (select coalesce(jsonb_agg(c order by o), '[]'::jsonb)
                      from jsonb_array_elements(p.cards) with ordinality as t(c, o)
                     where not (c ->> 'k' = 'bomb' and coalesce((c ->> 'fuse')::int, 0) <= p_upto))
     where match_id = p_match and user_id = p.user_id;
    perform public._arena_event(p_match, 'bomb', p.slot, null, v_loss);
  end loop;
end $$;

-- Kaos aşaması: barı dolanlar (≥100) sandık hakkı kazanır (bar 100 azalır). Paket 22: kart takası kalktı; sandık
-- hakkı kimsede yoksa kaos atlanır. Hakkı olanların hepsi sandığını açınca kaos erken biter.
create or replace function public._arena_begin_chaos(p_match uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.quiz_match_players
     set chest_state = case when bar >= 100 then 'eligible' end,
         chest_result = null, chest_pick = null,
         bar = case when bar >= 100 then bar - 100 else bar end
   where match_id = p_match and left_at is null;
  if not exists (select 1 from public.quiz_match_players
                  where match_id = p_match and left_at is null and chest_state = 'eligible') then
    return false;
  end if;
  update public.quiz_matches
     set phase = 'chaos', chaos_no = chaos_no + 1, phase_started_at = now(),
         phase_ends_at = now() + make_interval(secs => least(40, greatest(6, public.setting_int('quiz_arena_chaos_seconds', 20))))
   where id = p_match;
  return true;
end $$;

-- Kaos sonu: seçmeyenlerin sandığı rastgele açılır, bekleyen takaslar düşer, fitili dolan bombalar patlar
create or replace function public._arena_resolve_chaos(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  x record;
begin
  select * into m from public.quiz_matches where id = p_match;
  for x in select user_id from public.quiz_match_players
            where match_id = p_match and left_at is null and chest_state = 'eligible' loop
    perform public._arena_open(p_match, x.user_id, floor(random() * 4)::int);
  end loop;
  update public.quiz_trades set status = 'expired'
   where match_id = p_match and chaos_no = m.chaos_no and status = 'pending';
  perform public._arena_explode(p_match, m.chaos_no);
  update public.quiz_match_players set chest_state = null where match_id = p_match;
end $$;

-- Ani ölüm sorusu (berabere kalanlar cevaplar; en hızlı doğru kazanır)
create or replace function public._arena_sudden_next(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_q int;
begin
  v_q := public._arena_pick(p_match, null, 1);
  update public.quiz_matches
     set phase = 'sudden', q_index = v_q, sudden_tries = sudden_tries + 1, winner = null,
         phase_started_at = now(), phase_ends_at = now() + make_interval(secs => public._arena_qsec())
   where id = p_match;
  perform public._arena_event(p_match, 'sudden', null);
end $$;

-- Maç sonu: kalan bombalar patlar; en yüksek skorda eşitlik varsa ani ölüm, yoksa bitiş
create or replace function public._arena_end_game(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_top int;
  v_tied int[];
begin
  perform public._arena_explode(p_match, 1000000);
  select max(score) into v_top from public.quiz_match_players where match_id = p_match and left_at is null;
  select array_agg(slot order by slot) into v_tied from public.quiz_match_players
   where match_id = p_match and left_at is null and score = v_top;
  if coalesce(array_length(v_tied, 1), 0) >= 2 then
    update public.quiz_matches set sudden_slots = v_tied where id = p_match;
    begin
      perform public._arena_sudden_next(p_match);
    exception when others then
      perform public._arena_finish(p_match, 'completed', null);
    end;
  else
    perform public._arena_finish(p_match, 'completed',
      (select user_id from public.quiz_match_players where match_id = p_match and slot = v_tied[1]));
  end if;
end $$;

-- Maçı bitirir: sıralama, istatistik ve (yalnızca kazanana) genel puan
create or replace function public._arena_finish(p_match uuid, p_reason text, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  p record;
  v_rounds int := public._arena_rounds();
  v_today timestamptz := public._quiz_today();
  v_alive int;
  v_done int;
  v_early boolean;
  v_neff int;
  v_place int := 0;
  v_award numeric;
  v_note text;
  v_amt numeric;
  v_full numeric;
  v_sum numeric;
  v_left numeric;
  v_players int;
begin
  select * into m from public.quiz_matches where id = p_match for update;
  if not found or m.status <> 'playing' then return; end if;
  select count(*)::int into v_alive from public.quiz_match_players where match_id = m.id and left_at is null;
  if v_alive = 0 then
    update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'abandoned',
           finished_at = now(), phase_ends_at = now() where id = m.id;
    update public.quiz_match_players set note = 'abandoned' where match_id = m.id;
    return;
  end if;
  select count(distinct q_index)::int into v_done from public.quiz_answers where match_id = m.id and q_index < v_rounds * 2;
  -- Erken bırakma: 3 sorudan önce rakipler çıktıysa maç sayılmaz (iki hesapla galibiyet toplanmasın)
  v_early := p_reason = 'forfeit' and v_done < 3;
  select count(*)::int into v_players from public.quiz_match_players where match_id = m.id;
  -- Çarpan, maçın en az %60'ında oyunda kalan oyunculara göre (erken çıkanlar çarpanı büyütmez)
  select count(*)::int into v_neff from public.quiz_match_players
   where match_id = m.id and (left_at is null or coalesce(left_q, 0) >= (v_rounds * 2 * 6) / 10);
  update public.quiz_matches
     set status = 'finished', phase = 'finished', winner = p_winner, end_reason = p_reason,
         finished_at = now(), phase_ends_at = now()
   where id = m.id;

  for p in select mp.*, pr.role::text as prole from public.quiz_match_players mp
             join public.profiles pr on pr.id = mp.user_id
            where mp.match_id = m.id
            order by (mp.user_id = p_winner) desc nulls last, (mp.left_at is null) desc, mp.score desc,
                     mp.left_at desc nulls first, mp.slot loop
    v_place := v_place + 1;
    v_award := 0;
    v_note := null;
    if p.prole = 'user' and not v_early then
      insert into public.user_game_stats (user_id, game_type, plays, wins)
      values (p.user_id, 'quiz', 1, case when p.user_id = p_winner then 1 else 0 end)
      on conflict (user_id, game_type)
      do update set plays = public.user_game_stats.plays + 1,
                    wins = public.user_game_stats.wins + (case when p.user_id = p_winner then 1 else 0 end),
                    updated_at = now();
    end if;
    if p_winner is not null and p.user_id = p_winner then
      if v_early then
        v_note := 'early_forfeit';
      elsif p.prole <> 'user' then
        v_note := 'win_nopoints';
      elsif p.correct_count < least(greatest(1, public.setting_int('quiz_arena_min_correct', 4)), v_done) then
        v_note := 'few_correct';
      else
        v_full := public.setting_int('pts_quiz_win_base', 100) / 100.0 * public._quiz_mult(greatest(2, v_neff));
        v_amt := v_full;
        if m.is_private then
          select coalesce(sum(me.awarded), 0) into v_sum from public.quiz_match_players me
            join public.quiz_matches mm on mm.id = me.match_id
           where me.user_id = p.user_id and me.awarded > 0 and mm.id <> m.id and mm.is_private
             and mm.finished_at >= v_today
             and exists (select 1 from public.quiz_match_players op
                          where op.match_id = mm.id and op.user_id <> p.user_id
                            and op.user_id in (select x.user_id from public.quiz_match_players x
                                                where x.match_id = m.id and x.user_id <> p.user_id));
          -- Sınır seviye çarpanıyla büyür; kalan, çarpılmadan önceki puan cinsinden hesaplanır (_quiz_award çarpar)
          v_left := (public.setting_int('pts_quiz_private_group_daily', 5) * public._quiz_level_mult(p.user_id) - v_sum)
                    / public._quiz_level_mult(p.user_id);
          if v_left <= 0 then
            v_note := 'group_cap';
            v_amt := 0;
          else
            v_amt := least(v_amt, v_left);
          end if;
        end if;
        if v_amt > 0 then
          select x.o_awarded, x.o_note into v_award, v_note
            from public._quiz_award(p.user_id, v_amt,
                   'Bilgi Yarışması: ' || v_players || ' kişilik maçı kazandın' || case when m.is_private then ' (özel oda)' else '' end) x;
          if v_note = 'ok' and v_amt < v_full then v_note := 'group_partial'; end if;
        end if;
      end if;
    elsif p_winner is null then
      v_note := 'draw';
    elsif p.left_at is not null then
      v_note := 'left';
    else
      v_note := 'loss';
    end if;
    update public.quiz_match_players set awarded = coalesce(v_award, 0), note = v_note, place = v_place
     where match_id = m.id and user_id = p.user_id;
  end loop;
end $$;

-- Aşamaları ilerletir (maç satırı kilitliyken). Kopan oyuncu (quiz_stale_seconds) maçtan çıkmış sayılır.
create or replace function public._arena_advance(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.quiz_matches;
  v_stale int := greatest(10, public.setting_int('quiz_stale_seconds', 25));
  v_rev int := least(12, greatest(3, public.setting_int('quiz_arena_reveal_seconds', 6)));
  v_alive int;
  v_need int;
  v_ready int;
  v_ans int;
  v_win uuid;
  x record;
  i int;
begin
  for i in 1 .. 8 loop
    select * into m from public.quiz_matches where id = p_match;
    exit when not found or m.status <> 'playing' or m.mode <> 'arena';

    if m.phase = 'ready' then
      -- Bekleme odası: kopanlar çıkar; 5 kişi ya da yeterince “Hazır” varsa herkesle başlar
      delete from public.quiz_match_players where match_id = m.id and last_seen_at < now() - interval '15 seconds';
      select count(*)::int, count(*) filter (where ready)::int into v_alive, v_ready
        from public.quiz_match_players where match_id = m.id;
      if v_alive >= 2 and (v_alive >= 5 or v_ready >= public._arena_ready_need(v_alive)) then
        if public._arena_begin(m.id) then continue; end if;
        perform public._arena_requeue(m.id);
        exit;
      end if;
      if now() >= m.phase_ends_at then
        -- Süre doldu: hazır demeyenler çıkarılır; en az 2 hazır kalırsa başlar, yoksa oda dağılır
        delete from public.quiz_match_players where match_id = m.id and not ready;
        if (select count(*) from public.quiz_match_players where match_id = m.id) >= 2 and public._arena_begin(m.id) then
          continue;
        end if;
        perform public._arena_requeue(m.id);
        exit;
      end if;
      if v_alive < 2 then perform public._arena_requeue(m.id); end if;
      exit;
    end if;

    if m.phase = 'lobby' then
      -- Kurucu koparsa, ayrılırsa ya da oda 30 dakikada başlamazsa oda kapanır; kopan diğer üyeler odadan çıkarılır
      if m.created_at < now() - interval '30 minutes'
         or not exists (select 1 from public.quiz_match_players where match_id = m.id and user_id = m.host_id
                          and last_seen_at > now() - interval '20 seconds') then
        update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'closed',
               finished_at = now(), phase_ends_at = now() where id = m.id;
        update public.quiz_match_players set note = 'closed' where match_id = m.id;
      else
        delete from public.quiz_match_players
         where match_id = m.id and user_id <> m.host_id and last_seen_at < now() - interval '20 seconds';
      end if;
      exit;
    end if;

    for x in update public.quiz_match_players set left_at = now(), left_q = m.q_index
              where match_id = m.id and left_at is null and last_seen_at < now() - make_interval(secs => v_stale)
              returning slot loop
      perform public._arena_event(m.id, 'left', x.slot);
    end loop;
    select count(*)::int into v_alive from public.quiz_match_players where match_id = m.id and left_at is null;
    if v_alive < 2 then
      perform public._arena_finish(m.id, 'forfeit',
        (select user_id from public.quiz_match_players where match_id = m.id and left_at is null limit 1));
      exit;
    end if;

    if m.phase = 'intro' then
      exit when now() < m.phase_ends_at;
      perform public._arena_start_round(m.id);
    elsif m.phase = 'vote' then
      select count(*)::int into v_ans from public.quiz_match_players
       where match_id = m.id and left_at is null and vote is not null;
      exit when now() < m.phase_ends_at and v_ans < v_alive;
      perform public._arena_resolve_vote(m.id);
    elsif m.phase = 'question' then
      select count(*)::int into v_ans from public.quiz_answers a
        join public.quiz_match_players mp on mp.match_id = a.match_id and mp.user_id = a.user_id and mp.left_at is null
       where a.match_id = m.id and a.q_index = m.q_index;
      exit when now() < m.phase_ends_at and v_ans < v_alive;
      perform public._arena_resolve_question(m.id);
      update public.quiz_matches
         set phase = 'reveal', phase_started_at = now(), phase_ends_at = now() + make_interval(secs => v_rev)
       where id = m.id;
    elsif m.phase = 'reveal' then
      exit when now() < m.phase_ends_at;
      if m.q_index % 2 = 0 then
        update public.quiz_matches
           set phase = 'question', q_index = q_index + 1, phase_started_at = now(),
               phase_ends_at = now() + make_interval(secs => public._arena_qsec())
         where id = m.id;
      elsif m.round >= public._arena_rounds() then
        perform public._arena_end_game(m.id);
      elsif not public._arena_begin_chaos(m.id) then
        perform public._arena_start_round(m.id);
      end if;
    elsif m.phase = 'chaos' then
      -- Herkes sandığını açtıysa (1,5 sn sonuç görünsün diye) beklemeden geçilir
      exit when now() < m.phase_ends_at
            and (exists (select 1 from public.quiz_match_players cp
                          where cp.match_id = m.id and cp.left_at is null and cp.chest_state = 'eligible')
                 or now() < m.phase_started_at + interval '4 seconds');
      perform public._arena_resolve_chaos(m.id);
      perform public._arena_start_round(m.id);
    elsif m.phase = 'sudden' then
      select count(*)::int into v_need from public.quiz_match_players
       where match_id = m.id and left_at is null and slot = any (m.sudden_slots);
      if v_need <= 1 then
        -- Berabere kalanlardan yalnızca biri oyunda kaldıysa o kazanır
        select user_id into v_win from public.quiz_match_players
         where match_id = m.id and left_at is null
         order by (slot = any (m.sudden_slots)) desc, score desc limit 1;
        perform public._arena_finish(m.id, 'completed', v_win);
        exit;
      end if;
      select count(*)::int into v_ans from public.quiz_answers a
        join public.quiz_match_players mp on mp.match_id = a.match_id and mp.user_id = a.user_id
       where a.match_id = m.id and a.q_index = m.q_index and mp.left_at is null and mp.slot = any (m.sudden_slots);
      exit when now() < m.phase_ends_at and v_ans < v_need;
      select a.user_id into v_win from public.quiz_answers a
        join public.quiz_match_players mp on mp.match_id = a.match_id and mp.user_id = a.user_id
       where a.match_id = m.id and a.q_index = m.q_index and a.is_correct
         and mp.left_at is null and mp.slot = any (m.sudden_slots)
       order by a.ms, a.created_at limit 1;
      insert into public.quiz_answers (match_id, user_id, q_index, choice, is_correct, ms, points)
      select m.id, mp.user_id, m.q_index, -1, false, public._arena_qsec() * 1000, 0
        from public.quiz_match_players mp
       where mp.match_id = m.id and mp.left_at is null and mp.slot = any (m.sudden_slots)
      on conflict do nothing;
      update public.quiz_matches
         set phase = 'sudden_reveal', winner = v_win, phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => v_rev)
       where id = m.id;
    elsif m.phase = 'sudden_reveal' then
      exit when now() < m.phase_ends_at;
      if m.winner is not null or m.sudden_tries >= 3 then
        perform public._arena_finish(m.id, 'completed', m.winner);
      else
        begin
          perform public._arena_sudden_next(m.id);
        exception when others then
          perform public._arena_finish(m.id, 'completed', null);
        end;
      end if;
    else
      exit;
    end if;
  end loop;
end $$;

-- Rastgele eşleşme bekleme odası (phase 'ready'): can henüz harcanmaz. Oyuncular “Hazırım” der. 5 kişi olunca hemen,
-- yoksa yeterince kişi hazır olunca (2 kişide 2, 3 kişide 2, 4 kişide 3) odadaki HERKESLE maç başlar. Süre dolduğunda
-- hazır demeyenler odadan çıkarılır; 2 kişi kalmazsa oda dağılır ve kalanlar yeniden aranır.
create or replace function public._arena_ready_need(p_n int)
returns int language sql immutable as $$
  select case when p_n <= 3 then 2 when p_n = 4 then 3 else 1 end;
$$;
create or replace function public._arena_ready_secs()
returns int language sql stable set search_path = public as $$
  select least(90, greatest(10, public.setting_int('quiz_arena_ready_seconds', 30)));
$$;

create or replace function public._arena_new_match(p_users uuid[], p_cells jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  i int;
  c jsonb;
begin
  insert into public.quiz_matches (mode, question_ids, orders, phase, phase_started_at, phase_ends_at, is_private)
  values ('arena', '{}', '[]'::jsonb, 'ready', now(), now() + make_interval(secs => public._arena_ready_secs()), false)
  returning id into v_id;
  for i in 1 .. array_length(p_users, 1) loop
    c := p_cells -> (i - 1);
    insert into public.quiz_match_players (match_id, user_id, slot, alias, avatar_index, color, cell_q, cell_r)
    select v_id, p.id, i, p.alias, p.avatar_index, (public._arena_colors())[i],
           case when jsonb_typeof(c -> 'q') = 'number' then (c ->> 'q')::int end,
           case when jsonb_typeof(c -> 'r') = 'number' then (c ->> 'r')::int end
      from public.profiles p where p.id = p_users[i];
  end loop;
  return v_id;
end $$;

-- Maçı başlatır (bekleme odası ya da özel oda): herkesten 1 can, oyuncuların peteği yoğunluğa yazılır, giriş geri sayımı.
-- Canı / günlük hakkı kalmayan oyuncu çıkarılır. 2 kişiden az kalırsa harcanan canlar geri verilir ve false döner.
create or replace function public._arena_begin(p_match uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  x record;
begin
  for x in select user_id from public.quiz_match_players where match_id = p_match order by slot loop
    begin
      perform public._quiz_use_life(x.user_id);
    exception when others then
      delete from public.quiz_match_players where match_id = p_match and user_id = x.user_id;
    end;
  end loop;
  if (select count(*) from public.quiz_match_players where match_id = p_match) < 2 then
    perform public._quiz_refund_life(mp.user_id) from public.quiz_match_players mp where mp.match_id = p_match;
    return false;
  end if;
  perform public._map_cleanup();
  insert into public.map_signals (user_id, q, r, source, room_id, day)
  select mp.user_id, mp.cell_q, mp.cell_r, 'quiz', p_match, public._map_day()
    from public.quiz_match_players mp
   where mp.match_id = p_match and mp.cell_q is not null and mp.cell_r is not null
     and public._map_cell_ok(mp.cell_q, mp.cell_r)
  on conflict do nothing;
  update public.quiz_match_players set last_seen_at = now() where match_id = p_match;
  update public.quiz_matches
     set phase = 'intro', started_at = now(), phase_started_at = now(),
         phase_ends_at = now() + make_interval(secs => least(15, greatest(3, public.setting_int('quiz_arena_intro_seconds', 8))))
   where id = p_match;
  return true;
end $$;

-- Bekleme odası dağılır: kalanlar yeniden rakip arar (telefon “requeue” notunu görünce aramayı kendisi başlatır)
create or replace function public._arena_requeue(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'requeue',
         finished_at = now(), phase_ends_at = now() where id = p_match;
  update public.quiz_match_players set note = 'requeue' where match_id = p_match;
end $$;

-- Maç başlamadan (giriş geri sayımında) vazgeçen: maçtan çıkarılır, canı geri verilir. 2 kişiden az kalırsa maç sayılmaz.
create or replace function public._arena_drop_intro(p_match uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.quiz_match_players where match_id = p_match and user_id = p_user;
  if not found then return; end if;
  delete from public.map_signals where user_id = p_user and room_id = p_match;
  perform public._quiz_refund_life(p_user);
  if (select count(*) from public.quiz_match_players where match_id = p_match) < 2 then
    perform public._quiz_refund_life(x.user_id) from public.quiz_match_players x where x.match_id = p_match;
    update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'cancelled',
           finished_at = now(), phase_ends_at = now() where id = p_match;
    update public.quiz_match_players set note = 'cancelled' where match_id = p_match;
  end if;
end $$;

-- Özel oda kur: 5 haneli kod (karışan harfler yok). Oda 30 dakika içinde başlatılmazsa kapanır.
drop function if exists public.quiz_arena_create_room(text);
create or replace function public.quiz_arena_create_room(p_color text default null, p_cell_q int default null,
                                                         p_cell_r int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_code text;
  v_id uuid;
  i int;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if not exists (select 1 from public.game_types where key = 'quiz' and enabled) then raise exception 'game_not_available'; end if;
  perform pg_advisory_xact_lock(hashtext('quiz_user:' || v.id::text));
  if public._quiz_my_live(v.id) is not null or public._quiz_my_solo(v.id) is not null then
    raise exception 'already_in_match';
  end if;
  if public._quiz_games_today(v.id) >= greatest(1, public.setting_int('quiz_daily_games', 25)) then
    raise exception 'quiz_daily_limit';
  end if;
  if (select o_lives from public._quiz_lives_get(v.id)) < 1 then raise exception 'no_lives'; end if;
  if (select count(*) from public.quiz_matches where host_id = v.id and created_at >= public._quiz_today()) >= 30 then
    raise exception 'room_limit';
  end if;
  delete from public.quiz_queue where user_id = v.id;
  for i in 1 .. 30 loop
    select string_agg(substr('ABCDEFGHJKMNPRSTUVWXYZ23456789', 1 + floor(random() * 30)::int, 1), '')
      into v_code from generate_series(1, 5);
    exit when not exists (select 1 from public.quiz_matches where room_code = v_code and status = 'playing');
    v_code := null;
  end loop;
  if v_code is null then raise exception 'try_again'; end if;
  insert into public.quiz_matches (mode, question_ids, orders, phase, phase_started_at, phase_ends_at, is_private,
                                   room_code, host_id)
  values ('arena', '{}', '[]'::jsonb, 'lobby', now(), now() + interval '30 minutes', true, v_code, v.id)
  returning id into v_id;
  insert into public.quiz_match_players (match_id, user_id, slot, alias, avatar_index, color, cell_q, cell_r)
  values (v_id, v.id, 1, v.alias, v.avatar_index,
          case when p_color = any (public._arena_colors()) then p_color else 'purple' end, p_cell_q, p_cell_r);
  return jsonb_build_object('match_id', v_id, 'code', v_code);
end $$;

-- Kodla özel odaya katıl (en çok 5 kişi). Engellediğin ya da seni engelleyen biri odadaysa katılamazsın.
-- Yanlış kod: 10 dakika içinde 5 yanlışta 5 dakika engel. (Yanlış deneme sayılabilsin diye hata, istisna yerine
-- {"error": ...} olarak döner; diğer hatalar istisnadır.)
drop function if exists public.quiz_arena_join_room(text, text);
create or replace function public.quiz_arena_join_room(p_code text, p_color text default null, p_cell_q int default null,
                                                       p_cell_r int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  a public.quiz_code_attempts;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_slot int;
  v_color text;
  v_fails int;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('quiz_user:' || v.id::text));
  select * into a from public.quiz_code_attempts where user_id = v.id;
  if found and a.blocked_until is not null and a.blocked_until > now() then
    return jsonb_build_object('error', 'code_blocked',
                              'wait', greatest(1, ceil(extract(epoch from a.blocked_until - now()) / 60))::int);
  end if;
  if v_code ~ '^[A-Z0-9]{5}$' then
    select * into m from public.quiz_matches
     where room_code = v_code and status = 'playing' and is_private and mode = 'arena' for update;
  end if;
  if m.id is null then
    insert into public.quiz_code_attempts (user_id, fails, window_start) values (v.id, 1, now())
    on conflict (user_id) do update
      set fails = case when public.quiz_code_attempts.window_start < now() - interval '10 minutes' then 1
                       else public.quiz_code_attempts.fails + 1 end,
          window_start = case when public.quiz_code_attempts.window_start < now() - interval '10 minutes' then now()
                              else public.quiz_code_attempts.window_start end
    returning fails into v_fails;
    if v_fails >= 5 then
      update public.quiz_code_attempts set blocked_until = now() + interval '5 minutes', fails = 0, window_start = now()
       where user_id = v.id;
      return jsonb_build_object('error', 'code_blocked', 'wait', 5);
    end if;
    return jsonb_build_object('error', 'room_not_found', 'left', 5 - v_fails);
  end if;
  delete from public.quiz_code_attempts where user_id = v.id;
  if exists (select 1 from public.quiz_match_players where match_id = m.id and user_id = v.id) then
    return jsonb_build_object('match_id', m.id);
  end if;
  if public._quiz_my_live(v.id) is not null or public._quiz_my_solo(v.id) is not null then
    raise exception 'already_in_match';
  end if;
  if m.phase <> 'lobby' then raise exception 'room_started'; end if;
  if v.id = any (m.kicked) then raise exception 'room_kicked'; end if;
  if (select count(*) from public.quiz_match_players where match_id = m.id) >= 5 then raise exception 'room_full'; end if;
  if exists (select 1 from public.quiz_match_players mp join public.user_blocks b
               on (b.blocker_id = v.id and b.blocked_id = mp.user_id) or (b.blocker_id = mp.user_id and b.blocked_id = v.id)
              where mp.match_id = m.id) then
    raise exception 'room_blocked';
  end if;
  if public._quiz_games_today(v.id) >= greatest(1, public.setting_int('quiz_daily_games', 25)) then
    raise exception 'quiz_daily_limit';
  end if;
  if (select o_lives from public._quiz_lives_get(v.id)) < 1 then raise exception 'no_lives'; end if;
  select min(s) into v_slot from generate_series(1, 5) s
   where not exists (select 1 from public.quiz_match_players where match_id = m.id and slot = s);
  select c into v_color from unnest(public._arena_colors()) with ordinality as t(c, o)
   where not exists (select 1 from public.quiz_match_players where match_id = m.id and color = c)
   order by (c = p_color) desc, o limit 1;
  delete from public.quiz_queue where user_id = v.id;
  insert into public.quiz_match_players (match_id, user_id, slot, alias, avatar_index, color, cell_q, cell_r)
  values (m.id, v.id, v_slot, v.alias, v.avatar_index, v_color, p_cell_q, p_cell_r);
  return jsonb_build_object('match_id', m.id);
end $$;

-- Renk seç (oda beklerken ya da giriş geri sayımında); her renk bir kişide
create or replace function public.quiz_arena_set_color(p_match uuid, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
begin
  v := public._require_user();
  if not (p_color = any (public._arena_colors())) then raise exception 'invalid_color'; end if;
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found or m.status <> 'playing' or m.phase not in ('ready', 'lobby', 'intro') then raise exception 'match_not_found'; end if;
  if exists (select 1 from public.quiz_match_players where match_id = m.id and color = p_color and user_id <> v.id) then
    raise exception 'color_taken';
  end if;
  update public.quiz_match_players set color = p_color where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
end $$;

-- Kurucu: odadan birini çıkar (bu odaya tekrar giremez)
create or replace function public.quiz_arena_kick(p_match uuid, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  v_uid uuid;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found or m.status <> 'playing' or m.phase <> 'lobby' or m.host_id is distinct from v.id then
    raise exception 'not_host';
  end if;
  delete from public.quiz_match_players where match_id = m.id and slot = p_slot and user_id <> v.id
  returning user_id into v_uid;
  if v_uid is null then raise exception 'invalid_target'; end if;
  update public.quiz_matches set kicked = kicked || v_uid where id = m.id;
end $$;

-- Kurucu: maçı başlat (en az 2 kişi). Herkesten 1 can harcanır; canı ya da günlük hakkı bitmiş üye odadan çıkarılır.
create or replace function public.quiz_arena_start(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  v_before int;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found or m.status <> 'playing' or m.phase <> 'lobby' or m.host_id is distinct from v.id then
    raise exception 'not_host';
  end if;
  update public.quiz_match_players set last_seen_at = now() where match_id = m.id and user_id = v.id;
  perform public._arena_advance(m.id);  -- kopan üyeler çıkarılır
  select * into m from public.quiz_matches where id = p_match;
  if m.status <> 'playing' or m.phase <> 'lobby' then raise exception 'room_closed'; end if;
  select count(*)::int into v_before from public.quiz_match_players where match_id = m.id;
  if v_before < 2 then raise exception 'not_enough_players'; end if;
  if (select o_lives from public._quiz_lives_get(v.id)) < 1 then raise exception 'no_lives'; end if;
  if public._quiz_games_today(v.id) >= greatest(1, public.setting_int('quiz_daily_games', 25)) then
    raise exception 'quiz_daily_limit';
  end if;
  if not public._arena_begin(m.id) then
    raise exception 'players_no_lives';
  end if;
end $$;

-- Bekleme odasında “Hazırım”
create or replace function public.quiz_arena_ready(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found or m.status <> 'playing' or m.phase <> 'ready' then raise exception 'ready_closed'; end if;
  update public.quiz_match_players set ready = true, last_seen_at = now() where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
end $$;

-- Maçın anlık durumu (telefon ~0,9 sn'de bir çağırır; bu aynı zamanda “oyundayım” işaretidir).
-- Soru süresince doğru şık ve başkalarının seçimi GİZLİ. Başkalarının kartlarının yalnızca sayısı görünür.
create or replace function public.quiz_arena_state(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  q public.quiz_questions;
  v_my public.quiz_answers;
  v_ord jsonb;
  v_opts jsonb;
  v_reveal boolean;
  v_fx jsonb := '{}'::jsonb;
  v_correct int;
  v_players jsonb;
  v_answers jsonb;
  v_events jsonb;
  v_votes jsonb;
  v_in jsonb;
  v_out jsonb;
  v_deadline timestamptz;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
  if me.left_at is null and m.status = 'playing' then
    update public.quiz_match_players set last_seen_at = now()
     where match_id = m.id and user_id = v.id and last_seen_at < now() - interval '1 second';
  end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = p_match;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  if not found then raise exception 'match_not_found'; end if;
  if (me.qfx ->> 'q')::int = m.q_index then v_fx := me.qfx; end if;
  v_reveal := m.phase in ('reveal', 'sudden_reveal');
  if m.phase in ('question', 'reveal', 'sudden', 'sudden_reveal') then
    select * into q from public.quiz_questions where id = m.question_ids[m.q_index + 1];
    v_ord := m.orders -> m.q_index;
    select jsonb_agg(q.options[(v_ord ->> k)::int + 1] order by k) into v_opts from generate_series(0, 3) k;
    select * into v_my from public.quiz_answers where match_id = m.id and user_id = v.id and q_index = m.q_index;
    if v_reveal then
      select k into v_correct from generate_series(0, 3) k where (v_ord ->> k)::int = q.correct;
      select coalesce(jsonb_agg(jsonb_build_object('slot', mp.slot, 'choice', a.choice, 'correct', a.is_correct,
                                                   'points', a.points, 'ms', a.ms) order by mp.slot), '[]'::jsonb)
        into v_answers
        from public.quiz_answers a
        join public.quiz_match_players mp on mp.match_id = a.match_id and mp.user_id = a.user_id
       where a.match_id = m.id and a.q_index = m.q_index;
    end if;
  end if;
  v_deadline := case when m.phase = 'question'
                     then m.phase_ends_at - make_interval(secs => coalesce((v_fx ->> 'cut')::int, 0))
                     else m.phase_ends_at end;
  select jsonb_agg(jsonb_build_object(
           'slot', p.slot, 'alias', p.alias, 'avatar', p.avatar_index, 'color', p.color, 'score', p.score,
           'correct', p.correct_count, 'bar', p.bar, 'cards', jsonb_array_length(p.cards),
           'left', p.left_at is not null, 'shield', m.round > 0 and p.shield_round = m.round,
           'voted', p.vote is not null,
           'answered', m.phase in ('question', 'sudden')
                       and exists (select 1 from public.quiz_answers a
                                    where a.match_id = m.id and a.user_id = p.user_id and a.q_index = m.q_index),
           'is_me', p.user_id = v.id, 'is_host', p.user_id = m.host_id, 'place', p.place, 'ready', p.ready,
           'sudden', m.sudden_slots is not null and p.slot = any (m.sudden_slots),
           'chest', p.chest_state) order by p.slot)
    into v_players
    from public.quiz_match_players p where p.match_id = m.id;
  if m.phase = 'vote' then
    select coalesce(jsonb_object_agg(z.vote, z.n), '{}'::jsonb) into v_votes
      from (select vote, count(*) as n from public.quiz_match_players
             where match_id = m.id and left_at is null and vote is not null group by vote) z;
  end if;
  if m.phase = 'chaos' then
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'from', f.slot) order by t.created_at), '[]'::jsonb)
      into v_in
      from public.quiz_trades t
      join public.quiz_match_players f on f.match_id = t.match_id and f.user_id = t.from_user
     where t.match_id = m.id and t.chaos_no = m.chaos_no and t.to_user = v.id and t.status = 'pending';
    select jsonb_build_object('id', t.id, 'to', tt.slot, 'status', t.status, 'card', t.card_id) into v_out
      from public.quiz_trades t
      join public.quiz_match_players tt on tt.match_id = t.match_id and tt.user_id = t.to_user
     where t.match_id = m.id and t.chaos_no = m.chaos_no and t.from_user = v.id;
  end if;
  -- Gizli olayların kart adları yalnızca olayın iki tarafına gösterilir
  select coalesce(jsonb_agg(case when coalesce((z.e ->> 'p')::boolean, false)
                                      and me.slot is distinct from (z.e ->> 'a')::int
                                      and me.slot is distinct from (z.e ->> 't')::int
                                 then z.e - 'c' - 'c2' else z.e end order by z.o), '[]'::jsonb)
    into v_events
    from (select e, o from jsonb_array_elements(m.events) with ordinality as t(e, o) order by o desc limit 12) z;

  return jsonb_build_object(
    'id', m.id,
    'status', m.status,
    'phase', m.phase,
    'is_private', m.is_private,
    'code', case when m.is_private and m.status = 'playing' then m.room_code end,
    'ready_need', case when m.phase = 'ready'
                       then public._arena_ready_need((select count(*)::int from public.quiz_match_players where match_id = m.id)) end,
    'round', m.round,
    'rounds', public._arena_rounds(),
    'q_index', m.q_index,
    'server_now', now(),
    'phase_started_at', m.phase_started_at,
    'phase_ends_at', m.phase_ends_at,
    'question_seconds', public._arena_qsec(),
    'end_reason', m.end_reason,
    'my_slot', me.slot,
    'me', jsonb_build_object(
      'cards', me.cards, 'left', me.left_at is not null, 'vote', me.vote,
      'chest', me.chest_state, 'chest_result', me.chest_result, 'chest_pick', me.chest_pick,
      'hidden', coalesce(v_fx -> 'hidden', '[]'::jsonb),
      'roulette', coalesce((v_fx ->> 'roulette')::boolean, false),
      'cut', coalesce((v_fx ->> 'cut')::int, 0),
      'used', coalesce(v_fx -> 'used', '[]'::jsonb),
      'thief', (v_fx ->> 'thief')::int,
      'deadline', v_deadline,
      'answer', case when v_my.user_id is null then null
                     else jsonb_build_object('choice', v_my.choice,
                                             'correct', case when v_reveal then v_my.is_correct end,
                                             'points', case when v_reveal then v_my.points end) end,
      'awarded', me.awarded, 'note', me.note, 'place', me.place,
      'outcome', case when m.status <> 'finished' then null
                      when m.winner = v.id then 'win'
                      when m.winner is null then 'draw'
                      else 'loss' end),
    'players', v_players,
    'vote', case when m.phase = 'vote' then jsonb_build_object('options', to_jsonb(m.vote_options), 'counts', v_votes) end,
    'category', m.round_category,
    'question', case when q.id is null then null
                     else jsonb_build_object('category', q.category, 'text', q.question, 'options', v_opts,
                                             'difficulty', q.difficulty) end,
    'reveal', case when v_reveal then jsonb_build_object(
                     'correct', v_correct, 'answers', v_answers,
                     'winner_slot', (select slot from public.quiz_match_players where match_id = m.id and user_id = m.winner)) end,
    'trades', case when m.phase = 'chaos' then jsonb_build_object('incoming', v_in, 'outgoing', v_out) end,
    'events', v_events,
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'mine', c.user_id = v.id, 'alias', c.alias,
                                                          'body', c.body, 'at', c.created_at) order by c.created_at)
                        from (select * from public.quiz_chat where match_id = m.id
                               order by created_at desc limit 30) c), '[]'::jsonb));
end $$;

-- Kategori oyu (oylama sırasında, sunulan 3 kategoriden biri)
create or replace function public.quiz_arena_vote(p_match uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = p_match;
  if m.status <> 'playing' or m.phase <> 'vote' or now() > m.phase_ends_at then raise exception 'vote_closed'; end if;
  if not (p_category = any (m.vote_options)) then raise exception 'invalid_category'; end if;
  update public.quiz_match_players set vote = p_category, last_seen_at = now()
   where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
end $$;

-- Cevap: yalnızca süre içinde ve bir kez. Süre Dondurma'ya uğrayanın süresi kısalır. Puan sunucuda hesaplanır.
create or replace function public.quiz_arena_answer(p_match uuid, p_q_index int, p_choice int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  q public.quiz_questions;
  v_fx jsonb := '{}'::jsonb;
  v_deadline timestamptz;
  v_ms int;
  v_ok boolean;
  v_pts int := 0;
  v_left int;
begin
  v := public._require_user();
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  update public.quiz_match_players set last_seen_at = now()
   where match_id = m.id and user_id = v.id and last_seen_at < now() - interval '1 second';
  if now() > m.phase_ends_at + interval '400 milliseconds' then
    perform public._arena_advance(m.id);
    select * into m from public.quiz_matches where id = p_match;
  end if;
  if m.status <> 'playing' or m.phase not in ('question', 'sudden') or m.q_index <> p_q_index then
    raise exception 'answer_closed';
  end if;
  if m.phase = 'sudden' and not (me.slot = any (m.sudden_slots)) then raise exception 'not_in_sudden'; end if;
  if (me.qfx ->> 'q')::int = m.q_index then v_fx := me.qfx; end if;
  v_deadline := m.phase_ends_at - make_interval(secs => case when m.phase = 'question'
                                                             then coalesce((v_fx ->> 'cut')::int, 0) else 0 end);
  if now() > v_deadline + interval '400 milliseconds' then raise exception 'answer_closed'; end if;
  if coalesce(v_fx -> 'hidden', '[]'::jsonb) @> to_jsonb(p_choice) then raise exception 'invalid_choice'; end if;
  if exists (select 1 from public.quiz_answers where match_id = m.id and user_id = v.id and q_index = m.q_index) then
    raise exception 'already_answered';
  end if;
  v_ms := greatest(0, (extract(epoch from now() - m.phase_started_at) * 1000)::int);
  if v_ms < 500 then raise exception 'too_fast'; end if;
  select * into q from public.quiz_questions where id = m.question_ids[m.q_index + 1];
  v_ok := (m.orders -> m.q_index ->> p_choice)::int = q.correct;
  if v_ok and m.phase = 'question' then
    v_left := greatest(0, (extract(epoch from v_deadline - now()) * 1000)::int);
    v_pts := 100 + (v_left / 1000) * 10;
  end if;
  insert into public.quiz_answers (match_id, user_id, q_index, choice, is_correct, ms, points)
  values (m.id, v.id, m.q_index, p_choice, v_ok, least(v_ms, public._arena_qsec() * 1000), v_pts);
  perform public._arena_advance(m.id);
  return jsonb_build_object('ok', true);
end $$;

-- Kart kullan (soru sırasında; her türden soru başına bir kez):
--   fifty: 2 yanlış şık gizlenir (cevaptan önce) · roulette: doğruysa 2 kat, yanlışsa rauntun puanının 2 katı silinir
--   shield: bu raunt Hırsız ve Süre Dondurma işlemez · freeze: henüz cevaplamayan rakiplerin süresi 3 sn kısalır
--   thief: seçilen rakibin puanından çalar (cevaplar açılınca)
create or replace function public.quiz_arena_use_card(p_match uuid, p_card int, p_target int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  q public.quiz_questions;
  x public.quiz_match_players;
  v_kind text;
  v_fx jsonb;
  v_ord jsonb;
  v_hide jsonb;
  v_n int := 0;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = p_match;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'playing' or m.phase <> 'question' or now() < m.phase_started_at + interval '500 milliseconds' then
    raise exception 'card_closed';
  end if;
  select c ->> 'k' into v_kind from jsonb_array_elements(me.cards) c where (c ->> 'id')::int = p_card;
  if v_kind is null then raise exception 'no_joker'; end if;
  if v_kind = 'bomb' then raise exception 'bomb_no_use'; end if;
  v_fx := case when (me.qfx ->> 'q')::int = m.q_index then me.qfx else jsonb_build_object('q', m.q_index) end;
  if now() > m.phase_ends_at - make_interval(secs => coalesce((v_fx ->> 'cut')::int, 0)) then
    raise exception 'answer_closed';
  end if;
  if coalesce(v_fx -> 'used', '[]'::jsonb) @> to_jsonb(v_kind) then raise exception 'joker_used'; end if;
  if v_kind in ('roulette', 'fifty')
     and exists (select 1 from public.quiz_answers where match_id = m.id and user_id = v.id and q_index = m.q_index) then
    raise exception 'already_answered';
  end if;

  if v_kind = 'fifty' then
    select * into q from public.quiz_questions where id = m.question_ids[m.q_index + 1];
    v_ord := m.orders -> m.q_index;
    select coalesce(jsonb_agg(z.k), '[]'::jsonb) into v_hide
      from (select k from generate_series(0, 3) k where (v_ord ->> k)::int <> q.correct order by random() limit 2) z;
    v_fx := jsonb_set(v_fx, '{hidden}', v_hide);
  elsif v_kind = 'roulette' then
    v_fx := jsonb_set(v_fx, '{roulette}', 'true'::jsonb);
    perform public._arena_event(m.id, 'roulette_on', me.slot);
  elsif v_kind = 'shield' then
    if me.shield_round = m.round then raise exception 'joker_used'; end if;
    update public.quiz_match_players set shield_round = m.round where match_id = m.id and user_id = v.id;
    perform public._arena_event(m.id, 'shield', me.slot);
  elsif v_kind = 'freeze' then
    if now() > m.phase_ends_at - interval '4 seconds' then raise exception 'too_late'; end if;
    for x in select * from public.quiz_match_players p
              where p.match_id = m.id and p.left_at is null and p.user_id <> v.id
                and not exists (select 1 from public.quiz_answers a
                                 where a.match_id = m.id and a.user_id = p.user_id and a.q_index = m.q_index) loop
      continue when x.shield_round = m.round;
      update public.quiz_match_players
         set qfx = case when (qfx ->> 'q')::int = m.q_index
                        then jsonb_set(qfx, '{cut}', to_jsonb(least(6, coalesce((qfx ->> 'cut')::int, 0) + 3)))
                        else jsonb_build_object('q', m.q_index, 'cut', 3) end
       where match_id = m.id and user_id = x.user_id;
      v_n := v_n + 1;
    end loop;
    perform public._arena_event(m.id, 'freeze', me.slot, null, v_n);
  elsif v_kind = 'thief' then
    if not exists (select 1 from public.quiz_match_players
                    where match_id = m.id and slot = p_target and left_at is null and user_id <> v.id) then
      raise exception 'invalid_target';
    end if;
    v_fx := jsonb_set(v_fx, '{thief}', to_jsonb(p_target));
  else
    raise exception 'invalid_joker';
  end if;
  v_fx := jsonb_set(v_fx, '{used}', coalesce(v_fx -> 'used', '[]'::jsonb) || to_jsonb(v_kind));
  update public.quiz_match_players set qfx = v_fx, cards = public._arena_without(cards, p_card), last_seen_at = now()
   where match_id = m.id and user_id = v.id;
  return jsonb_build_object('ok', true, 'kind', v_kind, 'hit', v_n);
end $$;

-- Kaos: 4 gizli sandıktan birini aç (yalnızca barı dolanlar). Ne çıktığını yalnızca sen görürsün.
create or replace function public.quiz_arena_open_chest(p_match uuid, p_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  v_res text;
begin
  v := public._require_user();
  if p_index is null or p_index not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = p_match;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'playing' or m.phase <> 'chaos' or now() > m.phase_ends_at then raise exception 'chaos_closed'; end if;
  if me.chest_state is distinct from 'eligible' then raise exception 'no_chest'; end if;
  v_res := public._arena_open(m.id, v.id, p_index);
  return jsonb_build_object('kind', split_part(v_res, ':', 1), 'lost', v_res like '%:lost');
end $$;

-- Kaos: kapalı zarf teklif et (kaos başına bir teklif). Kart, teklif kabul edilene kadar elinde kalır.
-- Paket 22: kapalı zarf takası kaldırıldı (eski sürüm uygulamalar çağırırsa reddedilir)
create or replace function public.quiz_arena_trade_offer(p_match uuid, p_card int, p_target int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
  t public.quiz_match_players;
begin
  v := public._require_user();
  raise exception 'trade_disabled';
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = p_match;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'playing' or m.phase <> 'chaos' or now() > m.phase_ends_at - interval '1 second' then
    raise exception 'chaos_closed';
  end if;
  if not exists (select 1 from jsonb_array_elements(me.cards) c where (c ->> 'id')::int = p_card) then
    raise exception 'no_joker';
  end if;
  select * into t from public.quiz_match_players where match_id = m.id and slot = p_target and left_at is null;
  if not found or t.user_id = v.id then raise exception 'invalid_target'; end if;
  if exists (select 1 from public.quiz_trades where match_id = m.id and chaos_no = m.chaos_no and from_user = v.id) then
    raise exception 'trade_used';
  end if;
  insert into public.quiz_trades (match_id, chaos_no, from_user, to_user, card_id)
  values (m.id, m.chaos_no, v.id, t.user_id, p_card);
  perform public._arena_event(m.id, 'trade_offer', me.slot, t.slot);
end $$;

-- Kaos: gelen kapalı zarfı kabul et ya da reddet. Kabul edersen zarftaki kart senin olur, elinden rastgele bir kart
-- teklif edene geçer (elin boşsa yalnızca alırsın). Kartların ne olduğunu yalnızca siz ikiniz görürsünüz.
create or replace function public.quiz_arena_trade_respond(p_trade uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  tr public.quiz_trades;
  m public.quiz_matches;
  me public.quiz_match_players;
  fr public.quiz_match_players;
  v_card jsonb;
  v_give jsonb;
begin
  v := public._require_user();
  raise exception 'trade_disabled';
  select * into tr from public.quiz_trades where id = p_trade and to_user = v.id;
  if not found then raise exception 'trade_not_found'; end if;
  select * into m from public.quiz_matches where id = tr.match_id and mode = 'arena' for update;
  if not found then raise exception 'trade_not_found'; end if;
  perform public._arena_advance(m.id);
  select * into m from public.quiz_matches where id = tr.match_id;
  select * into tr from public.quiz_trades where id = p_trade for update;
  if tr.status <> 'pending' or m.status <> 'playing' or m.phase <> 'chaos' or m.chaos_no <> tr.chaos_no
     or now() > m.phase_ends_at then
    raise exception 'trade_closed';
  end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  select * into fr from public.quiz_match_players where match_id = m.id and user_id = tr.from_user and left_at is null;
  if not found then
    update public.quiz_trades set status = 'expired' where id = tr.id;
    raise exception 'trade_closed';
  end if;
  if not coalesce(p_accept, false) then
    update public.quiz_trades set status = 'declined' where id = tr.id;
    perform public._arena_event(m.id, 'trade_declined', fr.slot, me.slot);
    return jsonb_build_object('accepted', false);
  end if;
  select c into v_card from jsonb_array_elements(fr.cards) c where (c ->> 'id')::int = tr.card_id;
  if v_card is null then
    update public.quiz_trades set status = 'expired' where id = tr.id;
    raise exception 'trade_closed';
  end if;
  select c into v_give from jsonb_array_elements(me.cards) c order by random() limit 1;
  update public.quiz_match_players set cards = public._arena_without(cards, tr.card_id)
   where match_id = m.id and user_id = fr.user_id;
  if v_give is not null then
    update public.quiz_match_players set cards = public._arena_without(cards, (v_give ->> 'id')::int)
     where match_id = m.id and user_id = me.user_id;
  end if;
  update public.quiz_match_players
     set card_seq = card_seq + 1,
         cards = cards || jsonb_build_array(jsonb_build_object('id', card_seq + 1, 'k', v_card ->> 'k', 'fuse', v_card -> 'fuse'))
   where match_id = m.id and user_id = me.user_id;
  if v_give is not null then
    update public.quiz_match_players
       set card_seq = card_seq + 1,
           cards = cards || jsonb_build_array(jsonb_build_object('id', card_seq + 1, 'k', v_give ->> 'k', 'fuse', v_give -> 'fuse'))
     where match_id = m.id and user_id = fr.user_id;
  end if;
  update public.quiz_trades set status = 'accepted' where id = tr.id;
  perform public._arena_event(m.id, 'trade', fr.slot, me.slot, null, v_card ->> 'k', v_give ->> 'k', true);
  return jsonb_build_object('accepted', true, 'got', v_card ->> 'k', 'gave', v_give ->> 'k');
end $$;

-- Maçtan / odadan çık. Oda beklerken: üye çıkar, kurucu çıkarsa oda kapanır. Giriş geri sayımında: maç sayılmaz,
-- can geri verilir. Maç başladıktan sonra: çıkan KAYBEDER; 2'den az kişi kalırsa maç biter.
create or replace function public.quiz_arena_leave(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  m public.quiz_matches;
  me public.quiz_match_players;
begin
  v := public._require_user();
  select * into m from public.quiz_matches where id = p_match and mode = 'arena' for update;
  if not found or m.status <> 'playing' then return; end if;
  select * into me from public.quiz_match_players where match_id = m.id and user_id = v.id;
  if not found or me.left_at is not null then return; end if;
  if m.phase = 'ready' then
    -- Bekleme odasından çıkmak serbest (can harcanmadı)
    delete from public.quiz_match_players where match_id = m.id and user_id = v.id;
    perform public._arena_advance(m.id);
    return;
  end if;
  if m.phase = 'lobby' then
    if m.host_id = v.id then
      update public.quiz_matches set status = 'abandoned', phase = 'finished', end_reason = 'closed',
             finished_at = now(), phase_ends_at = now() where id = m.id;
      update public.quiz_match_players set note = 'closed' where match_id = m.id;
    else
      delete from public.quiz_match_players where match_id = m.id and user_id = v.id;
    end if;
    return;
  end if;
  if m.phase = 'intro' then
    perform public._arena_drop_intro(m.id, v.id);
    return;
  end if;
  update public.quiz_match_players set left_at = now(), left_q = m.q_index where match_id = m.id and user_id = v.id;
  perform public._arena_event(m.id, 'left', me.slot);
  perform public._arena_advance(m.id);
end $$;

-- Online (Uzaktan) sıralaması: bu ay (p_offset 0) ya da geçen ay (-1). İlk p_limit kişi ve ben. Yalnızca rumuz görünür.
create or replace function public.quiz_online_leaderboard(p_offset int default 0, p_limit int default 20)
returns table (place int, alias text, avatar int, points numeric, wins int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select o.place, p.alias, p.avatar_index, o.points, o.wins, o.user_id = auth.uid()
    from public._quiz_online_rank(public._quiz_month_start(least(0, greatest(-1, coalesce(p_offset, 0)))),
                                  public._quiz_month_start(least(0, greatest(-1, coalesce(p_offset, 0))) + 1)) o
    join public.profiles p on p.id = o.user_id
   where public._is_active_user()
     and (o.place <= least(50, greatest(1, coalesce(p_limit, 20))) or o.user_id = auth.uid())
   order by o.place, p.alias;
$$;

-- Moderatör: bir ayın Online ilk 3'ü (ödül için). p_offset -1 = geçen ay (varsayılan), 0 = bu ay (henüz bitmedi).
create or replace function public.admin_quiz_online_winners(p_offset int default -1)
returns table (month date, place int, user_id uuid, alias text, full_name text, points numeric, wins int,
               granted boolean, granted_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_from timestamptz := public._quiz_month_start(least(0, greatest(-12, coalesce(p_offset, -1))));
  v_to timestamptz := public._quiz_month_start(least(0, greatest(-12, coalesce(p_offset, -1))) + 1);
begin
  perform public._require_user();
  perform public._require_admin();
  return query
    select (v_from at time zone 'Europe/Istanbul')::date, o.place, o.user_id, p.alias, p.full_name, o.points, o.wins,
           r.user_id is not null, r.granted_at
      from public._quiz_online_rank(v_from, v_to) o
      join public.profiles p on p.id = o.user_id
      left join public.quiz_online_rewards r
        on r.month = (v_from at time zone 'Europe/Istanbul')::date and r.user_id = o.user_id
     where o.place <= 3
     order by o.place, p.alias;
end $$;

-- Moderatör: Online ilk 3'ten birine 1 aylık abonelik ödülü (yalnızca BİTMİŞ bir ay için, kişi başı bir kez)
create or replace function public.admin_quiz_grant_online_reward(p_user uuid, p_offset int default -1)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_off int := least(-1, greatest(-12, coalesce(p_offset, -1)));
  v_from timestamptz := public._quiz_month_start(v_off);
  v_to timestamptz := public._quiz_month_start(v_off + 1);
  v_month date := (v_from at time zone 'Europe/Istanbul')::date;
  o record;
  v_until timestamptz;
begin
  perform public._require_user();
  perform public._require_admin();
  perform pg_advisory_xact_lock(hashtext('quiz_online_reward:' || v_month::text));
  select * into o from public._quiz_online_rank(v_from, v_to) x where x.user_id = p_user and x.place <= 3;
  if not found then raise exception 'not_a_winner'; end if;
  if exists (select 1 from public.quiz_online_rewards where month = v_month and user_id = p_user) then
    raise exception 'already_granted';
  end if;
  update public.profiles
     set premium_until = greatest(coalesce(premium_until, now()), now()) + interval '1 month',
         premium_source = 'moderator'
   where id = p_user
   returning premium_until into v_until;
  if not found then raise exception 'user_not_found'; end if;
  insert into public.quiz_online_rewards (month, user_id, place, points, granted_by)
  values (v_month, p_user, o.place, o.points, auth.uid());
  perform public._audit('quiz_online_reward', p_user, jsonb_build_object('month', v_month, 'place', o.place));
  perform public._notify(p_user, 'system', 'Çoklu sıralama ödülü!',
    'Bilgi Yarışması Çoklu (Uzaktan) sıralamasında ' || to_char(v_from at time zone 'Europe/Istanbul', 'MM.YYYY') || ' ayını '
      || o.place || '. bitirdin. 1 aylık abonelik hesabına tanımlandı. Bitiş: '
      || to_char(v_until at time zone 'Europe/Istanbul', 'DD.MM.YYYY') || '.', '{}'::jsonb);
  return v_until;
end $$;

-- Maçtaki bir oyuncuyu engelle: bir daha eşleşmezsiniz (akışta da engellenmiş olur)
create or replace function public.quiz_block_player(p_match uuid, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  op public.quiz_match_players;
begin
  v := public._require_user();
  if not exists (select 1 from public.quiz_match_players where match_id = p_match and user_id = v.id) then
    raise exception 'match_not_found';
  end if;
  select * into op from public.quiz_match_players where match_id = p_match and slot = p_slot and user_id <> v.id;
  if not found then raise exception 'match_not_found'; end if;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, op.user_id, op.alias)
  on conflict (blocker_id, blocked_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 5t) Bilgi Yarışması Yan Yana: tek telefonda 2 kişi (ekran ikiye bölünür). Can harcamaz, puan vermez.
-- ---------------------------------------------------------------------
-- Sorular ve doğru cevap yine sunucuda tutulur (soru bankası telefona toplu gönderilmez). Doğru şık yalnızca iki oyuncu
-- da cevaplayınca ya da süre bitince gösterilir. Günde en çok quiz_side_daily (10) oyun. 3 raunt × 3 soru; her raunt
-- başında kategori seçilir. Şıkların yeri iki oyuncuda farklıdır (karşıdakinin parmağına bakıp kopya çekilemez).

create or replace function public._quiz_side_secs() returns int language sql stable set search_path = public as $$
  select least(30, greatest(8, public.setting_int('quiz_side_question_seconds', 15)));
$$;

create or replace function public._quiz_my_side(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select g.id from public.quiz_side_games g
   where g.user_id = p_user and g.status = 'playing' and g.last_seen_at > now() - interval '2 minutes'
   order by g.created_at desc limit 1;
$$;

-- Toplam soru: 3 raunt × 3 soru
create or replace function public._quiz_side_total() returns int language sql immutable set search_path = public as $$
  select 9;
$$;

-- Yeni raunt: 3 rastgele kategori seçime sunulur (en az 3 sorusu kalan). Kategori yoksa karışık sorularla devam.
create or replace function public._quiz_side_round(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.quiz_side_games;
  v_opts text[];
begin
  select * into g from public.quiz_side_games where id = p_id;
  select array_agg(z.c) into v_opts from (
    select q.category as c from public.quiz_questions q
     where q.is_active and not (q.id = any (g.question_ids))
     group by q.category having count(*) >= 3 order by random() limit 3) z;
  update public.quiz_side_games
     set round = round + 1, vote_options = v_opts, votes = '{}'::jsonb, round_category = null where id = p_id;
  if coalesce(array_length(v_opts, 1), 0) = 0 then
    perform public._quiz_side_resolve_vote(p_id);
  else
    update public.quiz_side_games
       set phase = 'vote', phase_started_at = now(),
           phase_ends_at = now() + make_interval(secs => least(20, greatest(5, public.setting_int('quiz_side_vote_seconds', 10))))
     where id = p_id;
  end if;
end $$;

-- Kategori: iki oyuncu aynısını seçtiyse o, farklıysa ikisinden biri kurayla, tek kişi seçtiyse onunki, kimse
-- seçmediyse kura. Rauntun 3 sorusu (kolaydan zora; önce son 7 günde görülmeyenler) çekilir, şıklar her oyuncuya ayrı karışır.
create or replace function public._quiz_side_resolve_vote(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.quiz_side_games;
  v_cat text;
  v1 text;
  v2 text;
  v_new uuid[] := '{}';
  v_one uuid;
  d int;
  v_ord jsonb;
  v_ord2 jsonb;
  v_start int;
begin
  select * into g from public.quiz_side_games where id = p_id;
  v1 := case when g.votes ->> '1' = any (g.vote_options) then g.votes ->> '1' end;
  v2 := case when g.votes ->> '2' = any (g.vote_options) then g.votes ->> '2' end;
  if v1 is not null and v2 is not null then
    v_cat := case when random() < 0.5 then v1 else v2 end;
  else
    v_cat := coalesce(v1, v2);
  end if;
  if v_cat is null and coalesce(array_length(g.vote_options, 1), 0) > 0 then
    v_cat := g.vote_options[1 + floor(random() * array_length(g.vote_options, 1))::int];
  end if;
  for d in 1 .. 3 loop
    v_one := null;
    select q.id into v_one from public.quiz_questions q
     where q.is_active and not (q.id = any (g.question_ids || v_new))
     order by (v_cat is not null and q.category <> v_cat),
              (exists (select 1 from public.quiz_seen s where s.question_id = q.id and s.user_id = g.user_id
                         and s.seen_at > now() - interval '7 days')),
              abs(q.difficulty - d), random()
     limit 1;
    if v_one is null then
      -- Soru kalmadı: oyunu bitir
      update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = now(),
             phase_ends_at = now() where id = p_id;
      return;
    end if;
    v_new := v_new || v_one;
  end loop;
  select jsonb_agg((select jsonb_agg(x order by random()) from generate_series(0, 3) x where s.n > 0) order by s.n)
    into v_ord from generate_series(1, 3) as s(n);
  select jsonb_agg((select jsonb_agg(x order by random()) from generate_series(0, 3) x where s.n > 0) order by s.n)
    into v_ord2 from generate_series(1, 3) as s(n);
  v_start := coalesce(array_length(g.question_ids, 1), 0);
  update public.quiz_side_games
     set question_ids = question_ids || v_new, orders = orders || v_ord, orders2 = orders2 || v_ord2,
         round_category = v_cat, phase = 'question', q_index = v_start, phase_started_at = now(),
         phase_ends_at = now() + make_interval(secs => public._quiz_side_secs())
   where id = p_id;
  insert into public.quiz_seen (user_id, question_id, seen_at)
  select g.user_id, unnest(v_new), now()
  on conflict (user_id, question_id) do update set seen_at = excluded.seen_at;
end $$;

-- Aşamaları ilerletir (satır kilitliyken). 3 raunt × 3 soru: her rauntun başında iki oyuncu da 3 kategoriden birini seçer.
create or replace function public._quiz_side_tick(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.quiz_side_games;
  i int;
  v_q public.quiz_questions;
  v_correct int;
  v_correct2 int;
  v_a jsonb;
  p text;
begin
  for i in 1 .. 5 loop
    select * into g from public.quiz_side_games where id = p_id;
    exit when not found or g.status <> 'playing';
    if g.phase = 'intro' then
      exit when now() < g.phase_ends_at;
      perform public._quiz_side_round(g.id);
    elsif g.phase = 'vote' then
      exit when now() < g.phase_ends_at and not (g.votes ? '1' and g.votes ? '2');
      perform public._quiz_side_resolve_vote(g.id);
    elsif g.phase = 'question' then
      v_a := coalesce(g.answers -> g.q_index::text, '{}'::jsonb);
      exit when now() < g.phase_ends_at and not (v_a ? '1' and v_a ? '2');
      -- Cevaplamayan: süre doldu (0 puan)
      foreach p in array array['1', '2'] loop
        if not v_a ? p then
          v_a := v_a || jsonb_build_object(p, jsonb_build_object('c', -1, 'ok', false, 'pts', 0, 'ms', public._quiz_side_secs() * 1000));
        end if;
      end loop;
      select * into v_q from public.quiz_questions where id = g.question_ids[g.q_index + 1];
      -- Her oyuncunun şık sırası farklı: doğru şıkkın yeri de oyuncuya göre
      select k into v_correct from generate_series(0, 3) k where (g.orders -> g.q_index ->> k)::int = v_q.correct;
      select k into v_correct2 from generate_series(0, 3) k where (g.orders2 -> g.q_index ->> k)::int = v_q.correct;
      update public.quiz_side_games
         set answers = jsonb_set(answers, array[g.q_index::text],
                                 v_a || jsonb_build_object('correct', v_correct, 'correct2', v_correct2)),
             score1 = score1 + coalesce((v_a -> '1' ->> 'pts')::int, 0),
             score2 = score2 + coalesce((v_a -> '2' ->> 'pts')::int, 0),
             correct1 = correct1 + case when coalesce((v_a -> '1' ->> 'ok')::boolean, false) then 1 else 0 end,
             correct2 = correct2 + case when coalesce((v_a -> '2' ->> 'ok')::boolean, false) then 1 else 0 end,
             phase = 'reveal', phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => least(8, greatest(2, public.setting_int('quiz_side_reveal_seconds', 4))))
       where id = g.id;
    elsif g.phase = 'reveal' then
      exit when now() < g.phase_ends_at;
      if g.q_index >= public._quiz_side_total() - 1 then
        update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = now(),
               phase_ends_at = now() where id = g.id;
        exit;
      end if;
      if (g.q_index + 1) % 3 = 0 then
        perform public._quiz_side_round(g.id);
      else
        update public.quiz_side_games
           set phase = 'question', q_index = q_index + 1, phase_started_at = now(),
               phase_ends_at = now() + make_interval(secs => public._quiz_side_secs())
         where id = g.id;
      end if;
    else
      exit;
    end if;
  end loop;
end $$;

-- Yan Yana başlat (iki oyuncunun adı yalnızca bu ekranda görünür). Devam eden oyun varsa o kapanır.
-- Sorular rauntun kategorisi seçilince çekilir.
create or replace function public.quiz_side_start(p_name1 text default null, p_name2 text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_id uuid;
  v_n1 text := left(btrim(regexp_replace(coalesce(p_name1, ''), '\s+', ' ', 'g')), 14);
  v_n2 text := left(btrim(regexp_replace(coalesce(p_name2, ''), '\s+', ' ', 'g')), 14);
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if not exists (select 1 from public.game_types where key = 'quiz' and enabled) then raise exception 'game_not_available'; end if;
  perform pg_advisory_xact_lock(hashtext('quiz_user:' || v.id::text));
  if public._quiz_my_live(v.id) is not null or public._quiz_my_solo(v.id) is not null then
    raise exception 'already_in_match';
  end if;
  update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = now()
   where user_id = v.id and status = 'playing';
  if (select count(*) from public.quiz_side_games where user_id = v.id and created_at >= public._quiz_today())
     >= greatest(1, public.setting_int('quiz_side_daily', 10)) then
    raise exception 'side_daily_limit';
  end if;
  if (select count(*) from public.quiz_questions where is_active) < public._quiz_side_total() then
    raise exception 'quiz_no_questions';
  end if;
  insert into public.quiz_side_games (user_id, name1, name2, question_ids, orders, orders2, phase, phase_started_at, phase_ends_at)
  values (v.id, coalesce(nullif(v_n1, ''), '1. Oyuncu'), coalesce(nullif(v_n2, ''), '2. Oyuncu'), '{}', '[]'::jsonb,
          '[]'::jsonb, 'intro', now(), now() + interval '4 seconds')
  returning id into v_id;
  return v_id;
end $$;

-- Yan Yana durumu (telefon ~0,7 sn'de bir çağırır). Doğru şık yalnızca açıklama aşamasında gelir.
-- Şıklar her oyuncuya ayrı sırada gelir: options (alttaki oyuncu), options2 (üstteki oyuncu).
create or replace function public.quiz_side_state(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  g public.quiz_side_games;
  q public.quiz_questions;
  v_opts jsonb;
  v_opts2 jsonb;
  v_a jsonb;
begin
  v := public._require_user();
  select * into g from public.quiz_side_games where id = p_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_side_tick(g.id);
  update public.quiz_side_games set last_seen_at = now()
   where id = g.id and status = 'playing' and last_seen_at < now() - interval '2 seconds';
  select * into g from public.quiz_side_games where id = p_id;
  v_a := coalesce(g.answers -> g.q_index::text, '{}'::jsonb);
  if g.phase = 'reveal' or (g.phase = 'question' and now() >= g.phase_started_at) then
    select * into q from public.quiz_questions where id = g.question_ids[g.q_index + 1];
    select jsonb_agg(q.options[(g.orders -> g.q_index ->> k)::int + 1] order by k) into v_opts from generate_series(0, 3) k;
    select jsonb_agg(q.options[(g.orders2 -> g.q_index ->> k)::int + 1] order by k) into v_opts2 from generate_series(0, 3) k;
  end if;
  return jsonb_build_object(
    'id', g.id, 'status', g.status, 'phase', g.phase, 'q_index', g.q_index,
    'total', public._quiz_side_total(),
    'round', g.round, 'rounds', public._quiz_side_total() / 3,
    'server_now', now(), 'phase_started_at', g.phase_started_at, 'phase_ends_at', g.phase_ends_at,
    'question_seconds', public._quiz_side_secs(),
    'name1', g.name1, 'name2', g.name2,
    'score1', g.score1, 'score2', g.score2, 'correct1', g.correct1, 'correct2', g.correct2,
    'vote_options', case when g.phase = 'vote' then to_jsonb(g.vote_options) end,
    -- Oylamada yalnızca kimin seçtiği (seçim gizli); kategori raunt boyunca görünür
    'voted', jsonb_build_object('1', g.votes ? '1', '2', g.votes ? '2'),
    'round_category', g.round_category,
    'question', case when q.id is null then null
                     else jsonb_build_object('category', q.category, 'text', q.question, 'options', v_opts,
                                             'options2', v_opts2, 'difficulty', q.difficulty) end,
    -- Soru sırasında yalnızca kimin cevapladığı (seçim gizli); açıklamada seçimler, doğru şık ve puanlar
    'answered', jsonb_build_object('1', v_a ? '1', '2', v_a ? '2'),
    'reveal', case when g.phase = 'reveal' then v_a end);
end $$;

-- Kategori seçimi (p_player: 1 = alttaki, 2 = üstteki oyuncu). Bir kez seçilir, değiştirilemez.
create or replace function public.quiz_side_vote(p_id uuid, p_player int, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  g public.quiz_side_games;
begin
  v := public._require_user();
  if p_player not in (1, 2) then raise exception 'invalid_choice'; end if;
  select * into g from public.quiz_side_games where id = p_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_side_tick(g.id);
  select * into g from public.quiz_side_games where id = p_id;
  if g.status <> 'playing' or g.phase <> 'vote' or now() > g.phase_ends_at + interval '400 milliseconds' then
    raise exception 'answer_closed';
  end if;
  if not (p_category = any (g.vote_options)) then raise exception 'invalid_choice'; end if;
  if g.votes ? p_player::text then raise exception 'already_answered'; end if;
  update public.quiz_side_games
     set votes = votes || jsonb_build_object(p_player::text, p_category), last_seen_at = now()
   where id = g.id;
  perform public._quiz_side_tick(g.id);
end $$;

-- Cevap (p_player: 1 = alttaki, 2 = üstteki oyuncu; p_choice o oyuncunun kendi şık sırasına göre).
-- Doğru = 100 + kalan tam saniye × 10.
create or replace function public.quiz_side_answer(p_id uuid, p_q_index int, p_player int, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  g public.quiz_side_games;
  q public.quiz_questions;
  v_ms int;
  v_ok boolean;
  v_pts int := 0;
  v_key text;
begin
  v := public._require_user();
  if p_player not in (1, 2) or p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into g from public.quiz_side_games where id = p_id and user_id = v.id for update;
  if not found then raise exception 'match_not_found'; end if;
  perform public._quiz_side_tick(g.id);
  select * into g from public.quiz_side_games where id = p_id;
  if g.status <> 'playing' or g.phase <> 'question' or g.q_index <> p_q_index
     or now() > g.phase_ends_at + interval '400 milliseconds' or now() < g.phase_started_at then
    raise exception 'answer_closed';
  end if;
  v_key := p_player::text;
  if coalesce(g.answers -> g.q_index::text, '{}'::jsonb) ? v_key then raise exception 'already_answered'; end if;
  v_ms := greatest(0, (extract(epoch from now() - g.phase_started_at) * 1000)::int);
  if v_ms < 400 then raise exception 'too_fast'; end if;
  select * into q from public.quiz_questions where id = g.question_ids[g.q_index + 1];
  v_ok := (case when p_player = 1 then g.orders else g.orders2 end -> g.q_index ->> p_choice)::int = q.correct;
  if v_ok then
    v_pts := 100 + (greatest(0, (extract(epoch from g.phase_ends_at - now()) * 1000)::int) / 1000) * 10;
  end if;
  update public.quiz_side_games
     set answers = jsonb_set(answers, array[g.q_index::text],
                             coalesce(answers -> g.q_index::text, '{}'::jsonb)
                             || jsonb_build_object(v_key, jsonb_build_object('c', p_choice, 'ok', v_ok, 'pts', v_pts, 'ms', v_ms))),
         last_seen_at = now()
   where id = g.id;
  perform public._quiz_side_tick(g.id);
end $$;

create or replace function public.quiz_side_leave(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  update public.quiz_side_games set status = 'finished', phase = 'finished', finished_at = now(), phase_ends_at = now()
   where id = p_id and user_id = v.id and status = 'playing';
end $$;

-- ---------------------------------------------------------------------
-- 5m) Konser kodu, petek liderleri ve petek adı adayları
-- ---------------------------------------------------------------------

-- Konser & Festival: katıl diyen üye kodu kendisi görür (başlamadan 5 dakika önceden başlangıçtan 45 dakika sonrasına
-- kadar). Puan için yine kod + konum (etkinliğin peteğine en çok 1 petek) doğrulaması gerekir.
create or replace function public.get_concert_code(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  e public.events;
begin
  v := public._require_user();
  select * into e from public.events where id = p_event_id and not is_cancelled;
  if not found or e.approval <> 'approved' or e.category <> 'konser_festival' then raise exception 'event_not_found'; end if;
  if not exists (select 1 from public.event_registrations where event_id = e.id and user_id = v.id) then
    raise exception 'not_registered';
  end if;
  if now() < e.starts_at - make_interval(mins => public.setting_int('event_checkin_open_minutes_before', 5)) then
    raise exception 'checkin_not_open';
  end if;
  if now() > public._event_checkin_end(e.starts_at, e.category) then raise exception 'checkin_closed'; end if;
  return (select c.code from public.event_codes c where c.event_id = e.id);
end $$;

-- Petek liderleri (bu ay + geçen ay): en çok etkinlik düzenleyen ve en çok oyun oynayan ilk 3 (gerçek ad ve ünvan).
-- Gizlilik için: oyuncu en az 2 oyunla, düzenleyen en az 1 onaylı etkinlikle listeye girer; moderatör ve mekân hesabı yok.
drop function if exists public.cell_leaders(int, int);
create or replace function public.cell_leaders(p_q int, p_r int)
returns table (kind text, place int, full_name text, title text, cnt int)
language sql stable security definer set search_path = public as $$
  with b as (
    select (date_trunc('month', now() at time zone 'Europe/Istanbul') - interval '1 month') at time zone 'Europe/Istanbul' as s
  ), h as (
    select 'host'::text as kind, e.created_by as uid, count(*)::int as c
      from public.events e, b
     where e.cell_q = p_q and e.cell_r = p_r and e.created_by is not null and not e.is_cancelled
       and e.approval = 'approved' and e.created_at >= b.s
     group by e.created_by
  ), g as (
    select 'player'::text as kind, gl.user_id as uid, count(*)::int as c
      from public.game_play_log gl
      join public.game_rooms r on r.id = gl.room_id, b
     where r.place_q = p_q and r.place_r = p_r and gl.created_at >= b.s
     group by gl.user_id
    having count(*) >= 2
  ), a as (
    select x.kind, x.uid, x.c, row_number() over (partition by x.kind order by x.c desc, x.uid) as rn
      from (select * from h union all select * from g) x
      join public.profiles p on p.id = x.uid and p.role = 'user' and p.banned_at is null
  ), ct as materialized (select * from public._champion_titles())
  select a.kind, a.rn::int, p.full_name,
         public._title_join((select array_agg(c.label order by c.sort_order) from ct c where c.user_id = a.uid)),
         a.c
    from a join public.profiles p on p.id = a.uid
   where public._is_active_user() and a.rn <= 3
   order by a.kind, a.rn;
$$;

-- Petek adı adaylarını hesaplar (en çok saatte bir): bitmiş son iki ayın ikisinde de aynı üye o petekte tek başına
-- en çok oyun oynayan (her ay en az 3 oyun) ya da en çok etkinlik düzenleyen (her ay en az 2 etkinlik) ise aday olur.
-- Yeni adaylar için moderatörlere bildirim gider.
create or replace function public.admin_refresh_cell_candidates()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cur timestamp := date_trunc('month', now() at time zone 'Europe/Istanbul');
  v_m1 timestamptz := (v_cur - interval '1 month') at time zone 'Europe/Istanbul';
  v_m2 timestamptz := (v_cur - interval '2 months') at time zone 'Europe/Istanbul';
  v_end timestamptz := v_cur at time zone 'Europe/Istanbul';
  v_new int := 0;
  c record;
  a record;
begin
  perform public._require_admin();
  insert into public.cell_candidate_runs (id) values (1) on conflict (id) do nothing;
  perform 1 from public.cell_candidate_runs where id = 1 for update;
  if (select ran_at from public.cell_candidate_runs where id = 1) > now() - interval '1 hour' then
    return 0;
  end if;
  update public.cell_candidate_runs set ran_at = now() where id = 1;
  for c in
    with raw as (
      select e.cell_q as q, e.cell_r as r, e.created_by as uid, 'host'::text as kind,
             case when e.created_at >= v_m1 then 1 else 2 end as mk
        from public.events e
       where e.cell_q is not null and e.created_by is not null and not e.is_cancelled and e.approval = 'approved'
         and e.created_at >= v_m2 and e.created_at < v_end
      union all
      select r.place_q, r.place_r, gl.user_id, 'player', case when gl.created_at >= v_m1 then 1 else 2 end
        from public.game_play_log gl join public.game_rooms r on r.id = gl.room_id
       where r.place_q is not null and gl.created_at >= v_m2 and gl.created_at < v_end
    ), cnt as (
      select q, r, uid, kind, mk, count(*)::int as n from raw group by q, r, uid, kind, mk
    ), rk as (
      select cnt.*, row_number() over (partition by q, r, kind, mk order by n desc) as rn,
             lead(n) over (partition by q, r, kind, mk order by n desc) as next_n
        from cnt
    ), top as (
      select * from rk
       where rn = 1 and (next_n is null or next_n < n)
         and n >= case when kind = 'host' then 2 else 3 end
    )
    select t1.q, t1.r, t1.uid, t1.kind, t1.n as n1, t2.n as n2
      from top t1 join top t2 on t2.q = t1.q and t2.r = t1.r and t2.kind = t1.kind and t2.uid = t1.uid
      join public.profiles p on p.id = t1.uid and p.role = 'user' and p.banned_at is null
     where t1.mk = 1 and t2.mk = 2
  loop
    insert into public.cell_name_candidates (cell_q, cell_r, user_id, kind, month_start, count_last, count_prev)
    values (c.q, c.r, c.uid, c.kind, (v_cur - interval '1 month')::date, c.n1, c.n2)
    on conflict do nothing;
    if found then v_new := v_new + 1; end if;
  end loop;
  if v_new > 0 then
    for a in select id from public.profiles where role = 'admin' and banned_at is null loop
      perform public._notify(a.id, 'system', 'Petek adı adayı',
        v_new || ' yeni petek adı adayı var. Moderatör paneli > Petek adları’ndan kişiyle iletişime geçebilirsin.', '{}'::jsonb);
    end loop;
  end if;
  return v_new;
end $$;

-- Moderatör: petek adı adayları (yeniden eskiye)
drop function if exists public.admin_list_cell_candidates();
create or replace function public.admin_list_cell_candidates()
returns table (id uuid, cell_q int, cell_r int, user_id uuid, full_name text, kind text, month_start date,
               count_last int, count_prev int, admin_seen boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select c.id, c.cell_q, c.cell_r, c.user_id, p.full_name, c.kind, c.month_start, c.count_last, c.count_prev,
         c.admin_seen, c.created_at
    from public.cell_name_candidates c join public.profiles p on p.id = c.user_id
   order by c.created_at desc
   limit 100;
end $$;

create or replace function public.admin_mark_cell_candidates_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.cell_name_candidates set admin_seen = true where not admin_seen;
end $$;

-- ---------------------------------------------------------------------
-- 6) Moderatör fonksiyonları (her biri moderatör kontrolü yapar)
-- ---------------------------------------------------------------------

create or replace function public.admin_get_post_author(p_post_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  perform public._require_admin();
  select pr.* into v
    from public.post_authors pa join public.profiles pr on pr.id = pa.author_id
   where pa.post_id = p_post_id;
  if not found then raise exception 'post_not_found'; end if;
  perform public._audit('reveal_post_author', v.id, jsonb_build_object('post_id', p_post_id));
  return v;
end $$;

create or replace function public.admin_get_comment_author(p_comment_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  perform public._require_admin();
  select pr.* into v
    from public.comment_authors ca join public.profiles pr on pr.id = ca.author_id
   where ca.comment_id = p_comment_id;
  if not found then raise exception 'comment_not_found'; end if;
  perform public._audit('reveal_comment_author', v.id, jsonb_build_object('comment_id', p_comment_id));
  return v;
end $$;

create or replace function public.admin_mute_user(p_user_id uuid, p_minutes int, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_minutes is null or p_minutes < 1 or p_minutes > 525600 then raise exception 'invalid_minutes'; end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'cannot_target_admin';
  end if;
  update public.profiles
     set muted_until = now() + make_interval(mins => p_minutes)
   where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  perform public._audit('mute', p_user_id, jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
  perform public._notify(p_user_id, 'system', 'Hesabın geçici olarak susturuldu',
    'Bitiş: ' || to_char((now() + make_interval(mins => p_minutes)) at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
      || coalesce('. Neden: ' || nullif(btrim(p_reason), ''), '') || '.', '{}'::jsonb);
end $$;

create or replace function public.admin_unmute_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.profiles set muted_until = null where id = p_user_id;
  perform public._audit('unmute', p_user_id, '{}'::jsonb);
end $$;

create or replace function public.admin_ban_user(p_user_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'cannot_target_admin';
  end if;
  update public.profiles set banned_at = now(), ban_reason = nullif(btrim(p_reason), '')
   where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  perform public._audit('ban', p_user_id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_unban_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.profiles set banned_at = null, ban_reason = null where id = p_user_id;
  perform public._audit('unban', p_user_id, '{}'::jsonb);
end $$;

create or replace function public.admin_set_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_type = 'post' then
    update public.posts set is_hidden = p_hidden where id = p_id;
  elsif p_type = 'comment' then
    update public.comments set is_hidden = p_hidden where id = p_id;
  elsif p_type = 'event_comment' then
    update public.event_comments set is_hidden = p_hidden where id = p_id;
  elsif p_type = 'venue_review' then
    update public.venue_reviews set is_hidden = p_hidden where id = p_id;
  else
    raise exception 'invalid_type';
  end if;
  if not found then raise exception 'target_not_found'; end if;
  perform public._audit(case when p_hidden then 'hide_content' else 'unhide_content' end, null,
    jsonb_build_object('type', p_type, 'id', p_id));
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_status not in ('resolved', 'dismissed') then raise exception 'invalid_status'; end if;
  update public.reports
     set status = p_status, handled_by = auth.uid(), handled_at = now()
   where id = p_report_id and status = 'open';
  if not found then
    if exists (select 1 from public.reports where id = p_report_id) then return; end if;
    raise exception 'report_not_found';
  end if;
  -- Şikayet edene sonuç bildirimi
  perform public._notify((select reporter_id from public.reports where id = p_report_id), 'system',
    case when p_status = 'resolved' then 'Şikayetin sonuçlandı' else 'Şikayetin incelendi' end,
    case when p_status = 'resolved'
         then 'Bildirdiğin içerik incelendi ve gerekli işlem yapıldı. Teşekkürler!'
         else 'Bildirdiğin içerik incelendi; kurallara aykırı bir durum bulunmadı. Teşekkürler!' end,
    '{}'::jsonb);
  perform public._audit('resolve_report', null, jsonb_build_object('report_id', p_report_id, 'status', p_status));
end $$;

create or replace function public.admin_grant_premium(p_user_id uuid, p_package public.package_type)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  perform public._require_admin();
  update public.profiles
     set premium_until = greatest(coalesce(premium_until, now()), now()) + public.package_interval(p_package),
         premium_source = 'moderator'
   where id = p_user_id
   returning premium_until into v_until;
  if not found then raise exception 'user_not_found'; end if;
  perform public._audit('grant_premium', p_user_id, jsonb_build_object('package', p_package));
  perform public._notify(p_user_id, 'system', 'Abonelik hediye edildi',
    'Moderatör sana abonelik tanımladı. Bitiş: '
      || to_char(v_until at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || '.', '{}'::jsonb);
  return v_until;
end $$;

create or replace function public.admin_revoke_premium(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.profiles set premium_until = null, premium_source = null where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  perform public._audit('revoke_premium', p_user_id, '{}'::jsonb);
end $$;

-- Mağaza satın alımı: yalnızca sunucu tarafı (Edge Function, service_role) çağırır. Kullanıcı çağıramaz.
-- p_until = mağazanın bildirdiği abonelik bitiş zamanı; boş ya da geçmişse aktif abonelik yok demektir.
-- Moderatörün verdiği süre daha uzunsa o korunur; mağazadan gelen premium abonelik bitince sona erer.
create or replace function public.service_set_store_premium(p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  select * into v from public.profiles where id = p_user for update;
  if not found then raise exception 'user_not_found'; end if;

  if p_until is null or p_until <= now() then
    if v.premium_source = 'store' and v.premium_until is not null and v.premium_until > now() then
      update public.profiles set premium_until = now() where id = p_user;
    end if;
    return;
  end if;

  if v.premium_source is distinct from 'store' and v.premium_until is not null and v.premium_until > p_until then
    return;
  end if;
  update public.profiles set premium_until = p_until, premium_source = 'store' where id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- Paket 27: etkinlik çekilişi (düzenleyen için) ve özel mesajlar
-- ---------------------------------------------------------------------

-- Düzenleyenin çekiliş açabileceği etkinlikler: en az pts_event_min_attendees (4) doğrulanmış katılımcı, etkinlik
-- bitmemiş. room_id: açık (ya da en son) çekiliş odası; done: yapılan/açılan çekiliş sayısı (en çok event_raffle_max, 5).
-- Hiç çekiliş açılmadıysa (done = 0) Oyunlar sekmesindeki çekiliş kutusunda kırmızı nokta çıkar.
drop function if exists public.my_event_raffles();
create or replace function public.my_event_raffles()
returns table (event_id uuid, title text, starts_at timestamptz, verified int, room_id uuid, room_status text,
               done int, max_raffles int)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at,
         (select count(*)::int from public.event_registrations er where er.event_id = e.id and er.checked_in_at is not null),
         gr.id, gr.status,
         (select count(*)::int from public.game_rooms g
           where g.event_id = e.id and g.game_type = 'raffle' and g.status <> 'cancelled'),
         greatest(1, public.setting_int('event_raffle_max', 5))
    from public.events e
    left join lateral (select g.id, g.status from public.game_rooms g
                        where g.event_id = e.id and g.game_type = 'raffle' and g.status <> 'cancelled'
                        order by (g.status in ('lobby', 'playing')) desc, g.created_at desc limit 1) gr on true
   where public._is_active_user()
     and e.created_by = auth.uid()
     and not e.is_cancelled and e.closed_at is null
     and public._event_end(e.starts_at, e.category) > now()
     and (select count(*) from public.event_registrations er where er.event_id = e.id and er.checked_in_at is not null)
         >= greatest(1, public.setting_int('pts_event_min_attendees', 4))
   order by e.starts_at desc
   limit 20;
$$;

-- İki kişi kabul edilmiş arkadaş mı?
create or replace function public._friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships f
                  where f.status = 'accepted'
                    and ((f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a)));
$$;

-- Engel var mı (iki yönden biri)?
create or replace function public._blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks ub
                  where (ub.blocker_id = p_a and ub.blocked_id = p_b) or (ub.blocker_id = p_b and ub.blocked_id = p_a));
$$;

-- Yazışma açık mı? Bu haftanınsa ya da iki kişi arkadaşsa açık; değilse kapanmış ve arşivdedir.
create or replace function public._dm_open(t public.dm_threads)
returns boolean language sql stable security definer set search_path = public as $$
  select t.week = public.current_alias_week() or public._friends(t.user_a, t.user_b);
$$;

-- Yazışma başlat ya da var olanı aç. Kişi rumuz profilinden (gönderi / yorum) ya da arkadaş listesinden (arkadaşlık)
-- seçilir; karşı tarafın kimliği hiçbir zaman istemciye gelmez. Yeni yazışmayı yalnızca abone başlatabilir.
drop function if exists public.dm_open(uuid, uuid, uuid);
create or replace function public.dm_open(p_post uuid default null, p_comment uuid default null,
                                          p_friendship uuid default null, p_alias text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  o public.profiles;
  v_other uuid;
  v_week date := public.current_alias_week();
  t public.dm_threads;
begin
  v := public._require_writer(null);
  if v.role::text <> 'user' then raise exception 'dm_not_allowed'; end if;
  if p_post is not null then
    select pa.author_id into v_other
      from public.posts p join public.post_authors pa on pa.post_id = p.id
     where p.id = p_post and not p.is_hidden and public._post_live(p.created_at, p.event_id);
  elsif p_comment is not null then
    select ca.author_id into v_other
      from public.comments c join public.comment_authors ca on ca.comment_id = c.id
      join public.posts p on p.id = c.post_id
     where c.id = p_comment and not c.is_hidden and public._post_live(p.created_at, p.event_id);
  elsif p_friendship is not null then
    select case when f.requester_id = v.id then f.addressee_id else f.requester_id end into v_other
      from public.friendships f
     where f.id = p_friendship and f.status = 'accepted' and (f.requester_id = v.id or f.addressee_id = v.id);
  elsif p_alias is not null and char_length(btrim(p_alias)) between 2 and 60 then
    -- Paket 30: @rumuz etiketinden ya da rumuz profilinden (yalnızca bu haftaki rumuz; "#145" de olur)
    v_other := public._alias_lookup(p_alias);
  end if;
  if v_other is null then raise exception 'dm_target_not_found'; end if;
  if v_other = v.id then raise exception 'dm_self'; end if;
  select * into o from public.profiles where id = v_other;
  if not found or o.banned_at is not null or o.role::text <> 'user' then raise exception 'dm_not_allowed'; end if;
  if public._blocked_between(v.id, v_other) then raise exception 'dm_blocked'; end if;

  -- Açık bir yazışma varsa o döner (cevap vermek abonelik gerektirmez)
  select * into t from public.dm_threads d
   where least(d.user_a, d.user_b) = least(v.id, v_other) and greatest(d.user_a, d.user_b) = greatest(v.id, v_other)
     and public._dm_open(d)
   order by d.last_at desc limit 1;
  if found then return t.id; end if;

  if not (v.premium_until is not null and v.premium_until > now()) then raise exception 'dm_subscribers_only'; end if;
  perform pg_advisory_xact_lock(hashtext('dm_open:' || v.id::text));
  if (select count(*) from public.dm_threads d where d.user_a = v.id and d.created_at > now() - interval '1 day') >= 20 then
    raise exception 'dm_rate_limited';
  end if;
  perform public._rotate_alias_if_needed(v_other);
  select * into o from public.profiles where id = v_other;
  insert into public.dm_threads (user_a, user_b, alias_a, alias_b, avatar_a, avatar_b, week, read_a)
  values (v.id, v_other, v.alias, o.alias, v.avatar_index, o.avatar_index, v_week, now())
  on conflict do nothing
  returning * into t;
  if t.id is null then
    -- Aynı hafta için (karşı tarafın başlattığı) yazışma zaten var
    select * into t from public.dm_threads d
     where least(d.user_a, d.user_b) = least(v.id, v_other) and greatest(d.user_a, d.user_b) = greatest(v.id, v_other)
       and d.week = v_week;
  end if;
  return t.id;
end $$;

-- Yazışmalarım: açık olanlar (en az bir mesajı olan ya da benim başlattığım), son mesaja göre
drop function if exists public.dm_list();
create or replace function public.dm_list()
returns table (id uuid, other_name text, other_avatar int, is_friend boolean, last_body text, last_at timestamptz,
               last_mine boolean, unread int, i_started boolean, other_photo text)
language sql stable security definer set search_path = public as $$
  select d.id,
         case when public._friends(d.user_a, d.user_b)
              then (select pr.full_name from public.profiles pr
                     where pr.id = case when d.user_a = auth.uid() then d.user_b else d.user_a end)
              else case when d.user_a = auth.uid() then d.alias_b else d.alias_a end end,
         case when d.user_a = auth.uid() then d.avatar_b else d.avatar_a end,
         public._friends(d.user_a, d.user_b),
         lm.body, coalesce(lm.created_at, d.created_at), (lm.sender_id = auth.uid()),
         (select count(*)::int from public.dm_messages m
           where m.thread_id = d.id and m.sender_id <> auth.uid()
             and m.created_at > coalesce(case when d.user_a = auth.uid() then d.read_a else d.read_b end, '-infinity')),
         (d.user_a = auth.uid()),
         -- Profil resmi yalnızca arkadaşta (gerçek adı görünen)
         case when public._friends(d.user_a, d.user_b)
              then public._photo_of(case when d.user_a = auth.uid() then d.user_b else d.user_a end) end
    from public.dm_threads d
    left join lateral (select m.body, m.created_at, m.sender_id from public.dm_messages m
                        where m.thread_id = d.id order by m.created_at desc limit 1) lm on true
   where public._is_active_user()
     and (d.user_a = auth.uid() or d.user_b = auth.uid())
     and public._dm_open(d)
     and (lm.created_at is not null or d.user_a = auth.uid())
     and not public._blocked_between(d.user_a, d.user_b)
   order by coalesce(lm.created_at, d.created_at) desc
   limit 100;
$$;

-- Okunmamış mesaj sayısı (akıştaki mesaj düğmesinin rozeti)
create or replace function public.dm_unread_count()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(x.unread), 0)::int from public.dm_list() x;
$$;

-- Yazışmayı aç: başlık bilgisi ve son 200 mesaj; okundu sayılır
create or replace function public.dm_view(p_thread uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.dm_threads;
  v_friend boolean;
  v_other uuid;
  v_streak int;
  v_other_wrote boolean;
begin
  v := public._require_user();
  select * into t from public.dm_threads where id = p_thread and (user_a = v.id or user_b = v.id);
  if not found or not public._dm_open(t) then raise exception 'dm_closed'; end if;
  v_other := case when t.user_a = v.id then t.user_b else t.user_a end;
  v_friend := public._friends(t.user_a, t.user_b);
  if t.user_a = v.id then update public.dm_threads set read_a = now() where id = t.id;
  else update public.dm_threads set read_b = now() where id = t.id; end if;
  -- Karşı taraf cevap vermeden art arda yazdığım mesaj sayısı
  select count(*)::int into v_streak from public.dm_messages m
   where m.thread_id = t.id and m.sender_id = v.id
     and m.created_at > coalesce((select max(m2.created_at) from public.dm_messages m2
                                   where m2.thread_id = t.id and m2.sender_id = v_other), '-infinity');
  v_other_wrote := exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.sender_id = v_other);
  return jsonb_build_object(
    'id', t.id,
    'other_name', case when v_friend then (select pr.full_name from public.profiles pr where pr.id = v_other)
                       else case when t.user_a = v.id then t.alias_b else t.alias_a end end,
    'other_avatar', case when t.user_a = v.id then t.avatar_b else t.avatar_a end,
    'other_photo', case when v_friend then public._photo_of(v_other) end,
    'my_alias', case when t.user_a = v.id then t.alias_a else t.alias_b end,
    'is_friend', v_friend,
    'blocked', public._blocked_between(t.user_a, t.user_b),
    'i_started', t.user_a = v.id,
    'streak', v_streak,
    'can_send', not public._blocked_between(t.user_a, t.user_b) and v_streak < 3 and (t.user_a = v.id or v_other_wrote),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'mine', x.sender_id = v.id,
                                                               'created_at', x.created_at) order by x.created_at)
                            from (select * from public.dm_messages m where m.thread_id = t.id
                                   order by m.created_at desc limit 200) x), '[]'::jsonb));
end $$;

-- Mesaj gönder
create or replace function public.dm_send(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.dm_threads;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[[:space:]]+$', ''));
  v_other uuid;
  v_other_read timestamptz;
  v_id uuid;
begin
  v := public._require_writer(null);
  select * into t from public.dm_threads where id = p_thread and (user_a = v.id or user_b = v.id) for update;
  if not found or not public._dm_open(t) then raise exception 'dm_closed'; end if;
  v_other := case when t.user_a = v.id then t.user_b else t.user_a end;
  if public._blocked_between(v.id, v_other) then raise exception 'dm_blocked'; end if;
  if exists (select 1 from public.profiles pr where pr.id = v_other and pr.banned_at is not null) then
    raise exception 'dm_not_allowed';
  end if;
  if char_length(v_body) not between 1 and 500 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  -- Başlatmayan taraf yalnızca cevap verebilir
  if t.user_b = v.id and not exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.sender_id = v_other) then
    raise exception 'dm_reply_only';
  end if;
  -- Karşı taraf cevap verene kadar en çok 3 mesaj
  if (select count(*) from public.dm_messages m
       where m.thread_id = t.id and m.sender_id = v.id
         and m.created_at > coalesce((select max(m2.created_at) from public.dm_messages m2
                                       where m2.thread_id = t.id and m2.sender_id = v_other), '-infinity')) >= 3 then
    raise exception 'dm_wait_reply';
  end if;
  if (select count(*) from public.dm_messages m where m.sender_id = v.id and m.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'rate_limited';
  end if;
  insert into public.dm_messages (thread_id, sender_id, body) values (t.id, v.id, v_body) returning id into v_id;
  v_other_read := case when t.user_a = v.id then t.read_b else t.read_a end;
  update public.dm_threads
     set last_at = now(),
         read_a = case when user_a = v.id then now() else read_a end,
         read_b = case when user_b = v.id then now() else read_b end
   where id = t.id;
  -- Bildirim: karşı tarafın okunmamış mesajı yoksa bir kez (her mesajda değil)
  if v_other_read is null or v_other_read >= t.last_at
     or not exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.id <> v_id) then
    perform public._notify(v_other, 'dm', 'Yeni özel mesaj',
      (case when public._friends(t.user_a, t.user_b) then v.full_name
            else case when t.user_a = v.id then t.alias_a else t.alias_b end end) || ' sana mesaj gönderdi.',
      jsonb_build_object('route', '/akis', 'dm', t.id));
  end if;
  -- Arşiv temizliği (ara sıra): süresi dolan kapanmış yazışmalar silinir
  if random() < 0.02 then
    delete from public.dm_threads
     where last_at < now() - make_interval(days => greatest(30, public.setting_int('feed_archive_days', 365)));
  end if;
  return v_id;
end $$;

-- Yazışmadaki kişiyi engelle: yazışma kapanır, arkadaşlık (varsa) biter
create or replace function public.dm_block(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.dm_threads;
  v_other uuid;
begin
  v := public._require_user();
  select * into t from public.dm_threads where id = p_thread and (user_a = v.id or user_b = v.id);
  if not found then raise exception 'dm_closed'; end if;
  v_other := case when t.user_a = v.id then t.user_b else t.user_a end;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, v_other, case when t.user_a = v.id then t.alias_b else t.alias_a end)
  on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friendships
   where (requester_id = v.id and addressee_id = v_other) or (requester_id = v_other and addressee_id = v.id);
end $$;

-- Paket 26: başarım ödüllerini kontrol eder ve son basamağa ulaşana bir kez verir.
-- Sayaçlar yalnızca sunucuda artar (user_game_stats, user_vv_stats, treasures); üyeler bu tablolara yazamaz.
create or replace function public._check_rewards(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  st public.user_vv_stats;
  v_n int;
  a record;
begin
  select * into v from public.profiles where id = p_user;
  if not found or v.role::text <> 'user' or v.banned_at is not null then return; end if;

  -- Vampir–Köylü: 5 görevin hepsi
  if not public._has_reward(p_user, 'vv_master') then
    select * into st from public.user_vv_stats where user_id = p_user;
    if st.user_id is not null
       and coalesce((select gs.plays from public.user_game_stats gs
                      where gs.user_id = p_user and gs.game_type = 'vampire_villager'), 0) >= 100
       and st.nights >= 100 and st.protects >= 50 and st.hanged >= 25 and st.finds >= 200 then
      insert into public.user_rewards (user_id, reward) values (p_user, 'vv_master') on conflict do nothing;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        perform public._notify(p_user, 'system', 'Vampir–Köylü başarımları tamam!',
          'Bütün görevleri bitirdin. Ödülün: Vampir balonu (Balonlarım’dan seçebilirsin) ve Vampir–Köylü oyunlarından '
            || 'aldığın puanlar artık kalıcı olarak 1,25 kat.', '{}'::jsonb);
      end if;
    end if;
  end if;

  -- Bilgi Yarışması: 10.000 oyun
  if not public._has_reward(p_user, 'quiz_master')
     and coalesce((select gs.plays from public.user_game_stats gs
                    where gs.user_id = p_user and gs.game_type = 'quiz'), 0) >= 10000 then
    insert into public.user_rewards (user_id, reward) values (p_user, 'quiz_master') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform public._notify(p_user, 'system', 'Bilgi Yarışması başarımları tamam!',
        '10.000 oyuna ulaştın. Ödülün: Bilgi Yarışması balonu ve en çok can artık kalıcı olarak 6.', '{}'::jsonb);
    end if;
  end if;

  -- Hazine Avı: 100 hazine → ömür boyu abonelik
  if not public._has_reward(p_user, 'treasure_master')
     and (select count(*) from public.treasures t where t.found_by = p_user) >= 100 then
    insert into public.user_rewards (user_id, reward) values (p_user, 'treasure_master') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.profiles
         set premium_until = greatest(coalesce(premium_until, now()), timestamptz '2100-01-01 00:00:00+03'),
             premium_source = 'achievement'
       where id = p_user;
      perform public._notify(p_user, 'system', 'Hazine Efsanesi!',
        '100 hazine buldun. Ödülün: ömür boyu abonelik hesabına tanımlandı. Mağazadan devam eden bir aboneliğin varsa '
          || 'yenilemesini mağazadan kapatabilirsin.', '{}'::jsonb);
      for a in select id from public.profiles where role = 'admin' and banned_at is null loop
        perform public._notify(a.id, 'system', 'Ömür boyu abonelik kazanıldı',
          v.full_name || ' (' || v.alias || ') 100 hazine buldu ve Hazine Avı başarım ödülü olarak ömür boyu abonelik '
            || 'kazandı. Abonelik otomatik tanımlandı.', jsonb_build_object('user_id', p_user));
      end loop;
    end if;
  end if;
end $$;

create or replace function public._rewards_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'user_game_stats' and new.game_type not in ('vampire_villager', 'quiz', 'treasure_hunt') then
    return null;
  end if;
  perform public._check_rewards(new.user_id);
  return null;
end $$;

drop trigger if exists user_game_stats_rewards on public.user_game_stats;
create trigger user_game_stats_rewards after insert or update on public.user_game_stats
  for each row execute function public._rewards_trigger();
drop trigger if exists user_vv_stats_rewards on public.user_vv_stats;
create trigger user_vv_stats_rewards after insert or update on public.user_vv_stats
  for each row execute function public._rewards_trigger();

-- Başarımlar ekranı: oyun sayıları, Vampir görev sayaçları, bulunan hazine ve kazanılan ödüller (yalnızca kendin)
create or replace function public.my_achievement_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plays', coalesce((select jsonb_object_agg(gs.game_type, gs.plays) from public.user_game_stats gs
                        where gs.user_id = auth.uid()), '{}'::jsonb),
    'vv', coalesce((select jsonb_build_object('nights', x.nights, 'protects', x.protects, 'finds', x.finds, 'hanged', x.hanged)
                      from public.user_vv_stats x where x.user_id = auth.uid()), '{}'::jsonb),
    'treasures', (select count(*)::int from public.treasures t where t.found_by = auth.uid()),
    'rewards', coalesce((select jsonb_agg(w.reward order by w.granted_at) from public.user_rewards w
                          where w.user_id = auth.uid()), '[]'::jsonb))
  where public._is_active_user();
$$;

-- Oyun sayacım (başarımlar bundan hesaplanır)
create or replace function public.my_game_stats()
returns table (game_type text, plays int)
language sql stable security definer set search_path = public as $$
  select s.game_type, s.plays from public.user_game_stats s
   where s.user_id = auth.uid() and public._is_active_user();
$$;

create or replace function public.admin_award_points(p_user_id uuid, p_amount int, p_reason text, p_room_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.profiles where id = p_user_id and role::text = 'sponsor') then
    raise exception 'sponsor_not_allowed'; -- sponsor hesaplar puan almaz
  end if;
  insert into public.point_events (user_id, amount, reason, room_id, created_by)
  values (p_user_id, p_amount, coalesce(nullif(btrim(p_reason), ''), 'Admin puanı'), p_room_id, auth.uid());
  perform public._audit('award_points', p_user_id,
    jsonb_build_object('amount', p_amount, 'reason', coalesce(nullif(btrim(p_reason), ''), 'Admin puanı')));
end $$;

-- Çekiliş: odadaki oyuncular arasından rastgele bir kazanan seçer ve oda durumuna yazar
-- Paket 27: etkinlik çekilişini etkinliği açan kişi (odanın sahibi) de yapar; diğer çekilişleri yalnızca moderatör.
create or replace function public.admin_draw_raffle(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room public.game_rooms;
  v_winner public.room_players;
begin
  v := public._require_user();
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if not (v.role = 'admin' or (v_room.event_id is not null and v_room.host_id = v.id)) then
    raise exception 'forbidden';
  end if;
  if v_room.game_type <> 'raffle' then raise exception 'not_a_raffle'; end if;
  if v_room.status = 'finished' then raise exception 'already_drawn'; end if;
  if v_room.status <> 'lobby' then raise exception 'room_closed'; end if;

  select rp.* into v_winner
    from public.room_players rp
    join public.profiles pr on pr.id = rp.user_id
   where rp.room_id = p_room_id
     and rp.user_id <> v_room.host_id
     and pr.role = 'user'
   order by random()
   limit 1;
  if not found then raise exception 'no_players'; end if;

  update public.game_rooms
     set state = state || jsonb_build_object(
           'winner_user_id', v_winner.user_id,
           'winner_name', v_winner.display_name,
           'drawn_at', now()),
         status = 'finished',
         finished_at = now()
   where id = p_room_id;

  if v.role = 'admin' then
    perform public._audit('draw_raffle', v_winner.user_id, jsonb_build_object('room_id', p_room_id));
  end if;
  perform public._notify(v_winner.user_id, 'system', 'Çekilişi kazandın!',
    'Tebrikler! Katıldığın çekilişte kazanan sen oldun. Ödülün için çekilişi yapanla konuş.',
    jsonb_build_object('room_id', p_room_id));
  return jsonb_build_object('winner_user_id', v_winner.user_id, 'winner_name', v_winner.display_name);
end $$;

-- ---------------------------------------------------------------------
-- 7) Başlangıç verileri (sonradan moderatör tarafından değiştirilebilir)
-- ---------------------------------------------------------------------

insert into public.levels (level, name, min_points, reward_package, perk) values
  (1, 'Yeni Komşu', 0, null, null),
  (2, 'Mahalle Dostu', 250, null, 'game_plus1'),
  (3, 'Sokak Kâşifi', 1200, null, 'event_plus1'),
  (4, 'Meydan Müdavimi', 3500, null, 'quiz_mult'),
  (5, 'Şehrin Yıldızı', 8000, null, 'unlimited_lives')
on conflict (level) do nothing;
-- Seviye eşikleri yükseldi (5. seviye ciddi emek istesin). Yalnızca eski varsayılan değerler değişir; moderatörün
-- sonradan verdiği eşiğe dokunulmaz. Yeni değerlerin hiçbiri eski değerlerle çakışmaz (tekil kural bozulmaz).
update public.levels l set min_points = x.new_min
  from (values (2, 100, 250), (3, 300, 1200), (4, 700, 3500), (5, 1500, 8000)) as x(lvl, old_min, new_min)
 where l.level = x.lvl and l.min_points = x.old_min;
-- Seviye ödülleri (boşsa doldurulur; moderatörün değiştirdiğine dokunulmaz)
update public.levels l set perk = x.perk
  from (values (2, 'game_plus1'), (3, 'event_plus1'), (4, 'quiz_mult'), (5, 'unlimited_lives')) as x(lvl, perk)
 where l.level = x.lvl and l.perk is null;
-- Seviye adları şehir ve sosyallik temalı oldu (eski "Kat Görevlisi" adı moderatörün görünen adıyla karışıyordu).
-- Yalnızca eski varsayılan adlar değişir; moderatörün sonradan verdiği bir ad varsa ona dokunulmaz.
update public.levels l set name = x.new_name
  from (values (1, 'Yeni Kat', 'Yeni Komşu'), (2, 'Kat Sakini', 'Mahalle Dostu'), (3, 'Kat Görevlisi', 'Sokak Kâşifi'),
               (4, 'Çatı Katı', 'Meydan Müdavimi'), (5, '41. Kat', 'Şehrin Yıldızı')) as x(lvl, old_name, new_name)
 where l.level = x.lvl and l.name = x.old_name;
-- Puanla premium kazanılmaz: eski sürümden kalan seviye ödülleri kaldırılır
update public.levels set reward_package = null where reward_package is not null;

insert into public.app_settings (key, value, description) values
  ('post_requires_premium', 'false', 'Akışta yeni gönderi yazmak için abonelik gerekli mi? (Paket 31: herkes yazabilir; abone ayrıcalığı özel mesaj başlatmak)'),
  ('games_require_premium', 'false', 'Oyun odalarına katılmak için abonelik gerekli mi? (varsayılan: hayır, herkes katılır)'),
  ('event_fee_waived_for_premium', 'true', 'Aboneler moderatörün (41. Kat Sosyal) ücretli etkinliklerinden muaf mı?'),
  ('free_monthly_event_quota', '1', 'Ücretsiz üyenin ayda açabileceği etkinlik sayısı (moderatör sınırsız)'),
  ('free_monthly_game_quota', '3', 'Ücretsiz üyenin ayda başlatabileceği oyun sayısı, çekiliş hariç (moderatör sınırsız)'),
  ('premium_monthly_event_quota', '4', 'Abonenin ayda açabileceği etkinlik sayısı (moderatör sınırsız)'),
  ('level_quiz_mult_pct', '120', 'Seviye ödülü (quiz_mult): Bilgi Yarışması puanı ve puan sınırları çarpanı, yüzde (120 = 1.2 kat)'),
  ('premium_monthly_game_quota', '10', 'Abonenin ayda başlatabileceği oyun sayısı, çekiliş hariç (moderatör sınırsız)'),
  ('room_presence_grace_seconds', '45', 'Oyun ekranından uzaklaşan (uygulamayı kapatan, arka plana alan, bağlantısı kopan) oyuncu kaç saniye sonra oyundan atılır? Oda sahibi ayrılırsa oda kapanır.'),
  ('vv_auto_reveal_seconds', '40', 'Vampir–Köylü Otomatik Oyun: roller gösterilirken en çok kaç saniye beklenir (herkes "gördüm" derse daha önce biter)'),
  ('vv_auto_night_seconds', '45', 'Vampir–Köylü Otomatik Oyun: gece süresi (saniye)'),
  ('vv_auto_discuss_seconds', '120', 'Vampir–Köylü Otomatik Oyun: sabah konuşma süresi (saniye); sonra oylama başlar'),
  ('vv_auto_vote_seconds', '60', 'Vampir–Köylü Otomatik Oyun: oylama süresi (saniye)'),
  ('vv_auto_result_seconds', '12', 'Vampir–Köylü Otomatik Oyun: oylama sonucunun ekranda kalma süresi (saniye)'),
  ('vv_force_end_seconds', '60', 'Vampir–Köylü: üye oda sahibi geceyi ya da oylamayı bu kadar saniye dolmadan erken bitiremez (moderatör her zaman bitirebilir)'),
  ('feed_archive_days', '365', 'Akış arşivi: haftalık sıfırlamadan sonra eski gönderiler kaç gün saklanır (resmi talepler için; en az 30)'),
  ('feed_thread_max', '5', 'Zincir gönderi: bir zincirde en çok kaç parça olur (ilk gönderi dahil)'),
  ('vv_whisper_limit', '3', 'Vampir–Köylü: bir oyuncunun bir oyunda gönderebileceği fısıltı sayısı (cevap da hak yer; 0 = kapalı)'),
  ('premium_events_can_charge', 'true', 'Üye (ücretsiz ya da abone) açtığı etkinlik için ücret belirleyebilir mi? (ücret uygulamada tahsil edilmez, sadece bilgidir)'),
  ('game_place_required', 'true', 'Yan yana oynanan bir oyun açılırken haritadan bölge (petek) seçmek ve adres tarifi yazmak zorunlu mu? Bilgi Yarışması ve çekiliş hariç.'),
  ('game_join_max_cell_distance', '1', 'Yan yana oyunda odaya girenin bölgesi odanın bölgesinden en çok kaç petek uzakta olabilir? (0 = aynı petek, -1 = kontrol kapalı). Telefonun bildirdiği kaba bölge kontrol edilir.'),
  ('game_location_required', 'true', 'Yan yana oynanan bir oyunu açarken ya da oyuna girerken telefonun bulunduğu bölge (bir kez) alınmak zorunda mı? Bilgi Yarışması ve çekiliş hariç. Konum sürekli izlenmez.'),
  ('rank_weekly_refresh', 'true', 'Sıralama tabloları haftada bir (pazartesi 00:00, ay başında da) güncellensin mi? Kapalıysa tablolar anında güncellenir. Puanlar her durumda anında hesaba yazılır.'),
  ('titles_enabled', 'true', 'Oyun şampiyonu ünvanları açık mı? Her oyunun geçen ayki 1.''si, içinde bulunulan ay boyunca "<Oyun> Şampiyonu" ünvanını taşır.'),
  ('title_min_plays', '5', 'Ünvan için bir oyunda o ay puan getiren en az kaç oyun oynamış olmak gerekir?'),
  ('title_source_months_ago', '1', 'Ünvanlar kaç ay önceki sıralamadan verilir? 1 = geçen ayın 1.''si (normal). 0 yalnızca DENEME içindir: ünvanlar bu ayın şimdiki sıralamasına göre görünür.'),
  ('venue_rating_requires_visit', 'true', 'Mekâna puan/yorum vermek için o mekânın kodunu en az 1 kez kullanmış olmak gerekir mi?'),
  ('sponsor_code_valid_hours', '24', 'Sponsorun oluşturduğu oyun hakkı kodu kaç saat geçerli?'),
  ('sponsor_code_default_quota', '30', 'Sponsor hesabın ayda oluşturabileceği oyun hakkı kodu sayısı (moderatör her mekân için ayrıca değiştirebilir)'),
  ('sponsor_credit_valid_days', '30', 'Sponsor kodundan kazanılan ek oyun hakkı kullanılmazsa kaç gün sonra sona erer? (Kullanılmamış hak varken yeni kod alınamaz.)')
on conflict (key) do update set description = excluded.description;

-- Üyelik düzeni (bir kez uygulanır): ücretsiz üye ayda 1 etkinlik / 3 oyun, premium ayda 4 etkinlik / 10 oyun,
-- oyunlara herkes katılır. Sonradan değiştirdiğin değerleri şemayı tekrar çalıştırmak ezmez.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_membership_v2') then
    update public.app_settings set value = '4' where key = 'premium_monthly_event_quota';
    update public.app_settings set value = '10' where key = 'premium_monthly_game_quota';
    update public.app_settings set value = '1' where key = 'free_monthly_event_quota';
    update public.app_settings set value = '3' where key = 'free_monthly_game_quota';
    update public.app_settings set value = 'false' where key = 'games_require_premium';
    insert into public.app_settings (key, value, description)
    values ('seed_membership_v2', 'true', 'Teknik not: üyelik kotaları ilk kez bu düzene getirildi, silme');
  end if;
end $$;

insert into public.game_types (key, title, description, min_players, max_players, enabled, sort_order) values
  ('vampire_villager', 'Vampir–Köylü', 'Gizli roller, gece ve gündüz turları', 5, 30, false, 1),
  ('find_killer', 'Katili Bul', 'İpuçları ve rollerle gizem çözme', 5, 30, false, 2),
  ('quiz', 'Bilgi Yarışması', 'Herkes telefonundan cevaplar', 2, 100, false, 3),
  ('taboo', 'Tabu', 'Yasaklı kelimelerle anlat', 4, 30, false, 4),
  ('charades', 'Sessiz Sinema', 'Konuşmadan anlat, takımın bilsin', 4, 30, false, 5),
  ('raffle', 'Çekiliş', 'Etkinlikte moderatör tarafından yapılır', 1, 500, false, 6)
on conflict (key) do nothing;

-- Çekiliş yan yana oynanmaz ve hak harcamaz. Bilgi Yarışması uzaktan oynanır: yan yana kuralları yok, oyun hakkından yemez.
update public.game_types set presence_required = false, uses_quota = false where key = 'raffle';
update public.game_types set remote = true, uses_quota = false, presence_required = false,
       description = 'Uzaktan oynanır: herkes kendi telefonundan cevaplar'
 where key = 'quiz';

-- Çekiliş ekranı hazır olduğu için çekiliş ilk kurulumda (bir kez) açılır.
-- Sonradan kapatırsan şemayı tekrar çalıştırmak onu yeniden açmaz.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_raffle_enabled') then
    update public.game_types set enabled = true where key = 'raffle';
    insert into public.app_settings (key, value, description)
    values ('seed_raffle_enabled', 'true', 'Teknik not: çekiliş ilk kurulumda bir kez açıldı, silme');
  end if;
end $$;

-- Vampir–Köylü ekranı hazır olduğu için oyun ilk kurulumda (bir kez) açılır.
-- Sonradan kapatırsan şemayı tekrar çalıştırmak onu yeniden açmaz.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_vampire_enabled') then
    update public.game_types set enabled = true where key = 'vampire_villager';
    insert into public.app_settings (key, value, description)
    values ('seed_vampire_enabled', 'true', 'Teknik not: Vampir–Köylü ilk kurulumda bir kez açıldı, silme');
  end if;
end $$;

-- Eski sürümde kurulmuş satırların açıklaması da güncellensin
update public.game_types set description = 'Etkinlikte moderatör tarafından yapılır'
 where key = 'raffle' and description like '%admin%';

-- Harita ayarları (moderatör değiştirebilir; şemayı tekrar çalıştırmak değerleri ezmez)
insert into public.app_settings (key, value, description) values
  ('map_public', 'false', 'Harita herkese açık mı? Kapalıyken yalnızca moderatörler görür. KVKK metinleri hazır olmadan ve yeterli üye olmadan açma.'),
  ('map_min_people', '5', 'Bir petek en az kaç FARKLI üye olunca renklenir? (gizlilik eşiği; deneme dışında 5’in altına indirme)'),
  ('map_delay_minutes', '20', 'Yer ve oyun konumu haritaya en az kaç dakika sonra yansır?'),
  ('map_window_days', '7', 'Artık kullanılmıyor: yoğunluk her ilçede haftada bir, map_district_reset tablosundaki günde sıfırlanır.'),
  ('map_presence_public', 'true', 'Petekteki "son dakikalarda burada bildirim yapan kişi sayısı" üyelere açık mı? (moderatör her zaman görür)'),
  ('map_level2_score', '12', 'Harita yoğunluğu: 2. seviye (Çok hareketli) için ağırlıklı puan (Buradayım/oyun/etkinlik/gönderi 1, Bilgi Yarışması 0,5)'),
  ('map_level3_score', '25', 'Harita yoğunluğu: 3. seviye (En hareketli) için ağırlıklı puan'),
  ('map_presence_minutes', '20', 'Petek kişi sayısı son kaç dakikadaki konum bildirimlerine bakar? (5–120)')
on conflict (key) do update set description = excluded.description;

-- Puan dengesi v3 (bir kez uygulanır): etkinlikler oyunlardan daha çok puan getirir (etkinlik daha seyrek yapılır).
-- Katılım 30 (41. Kat Özel 40), etkinlik açma 15, gelen her katılımcı için düzenleyene 10 (ayda en çok 250).
-- Oyun puanları aynı kalır (1. sıra en çok 12). Harita 20 dakika gecikmeli güncellenir.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_points_v3') then
    update public.app_settings set value = '30' where key = 'pts_event_attend';
    update public.app_settings set value = '40' where key = 'pts_event_attend_official';
    update public.app_settings set value = '15' where key = 'pts_event_create';
    update public.app_settings set value = '10' where key = 'pts_event_host_per_attendee';
    update public.app_settings set value = '250' where key = 'pts_event_host_month_cap';
    update public.app_settings set value = '20' where key = 'map_delay_minutes';
    insert into public.app_settings (key, value, description)
    values ('seed_points_v3', 'true', 'Teknik not: puan dengesi v3 ve 20 dk harita gecikmesi bir kez uygulandı, silme');
  end if;
end $$;

-- Puan dengesi v4 (Paket 21, bir kez uygulanır): kalabalık oyun ve kalabalık etkinlik daha çok puan getirir.
-- Oyun: 1. sıra en çok 24 (kalabalık çarpanı), ayda 15 oyun. Katılım: 4–9 kişi 30 · 10–19 35 · 20–39 40 · 40+ 50,
-- 41. Kat Özel her basamakta +10. Bilgi Yarışması ve düzenleyen puanı değişmez.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_points_v4') then
    update public.app_settings set value = '24' where key = 'pts_game_top_cap';
    update public.app_settings set value = '15' where key = 'pts_game_month_cap';
    update public.app_settings set value = '30' where key = 'pts_event_attend';
    insert into public.app_settings (key, value, description)
    values ('seed_points_v4', 'true', 'Teknik not: puan dengesi v4 (kalabalık çarpanı) bir kez uygulandı, silme');
  end if;
end $$;

-- Paket 24 (bir kez): Bilgi Yarışması günlük oyun limiti 25; aynı kişinin etkinliğinden katılım puanı 2 günde bir
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_p24') then
    update public.app_settings set value = '25' where key = 'quiz_daily_games';
    update public.app_settings set value = '2' where key = 'pts_event_attend_host_days';
    insert into public.app_settings (key, value, description)
    values ('seed_p24', 'true', 'Teknik not: Paket 24 ayarları (günlük 25 oyun, 2 gün kuralı) bir kez uygulandı, silme');
  end if;
end $$;

-- Paket 31 (bir kez): akışta herkes gönderi yazabilir (abone ayrıcalığı artık özel mesaj başlatmak)
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_p31') then
    update public.app_settings set value = 'false' where key = 'post_requires_premium';
    insert into public.app_settings (key, value, description)
    values ('seed_p31', 'true', 'Teknik not: Paket 31 ayarı (akışta herkes yazar) bir kez uygulandı, silme');
  end if;
end $$;

-- Paket 28 (bir kez): Vampir–Köylü'den günde en çok 5 oyundan puan
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_p28') then
    update public.app_settings set value = '5' where key = 'pts_game_daily_cap';
    insert into public.app_settings (key, value, description)
    values ('seed_p28', 'true', 'Teknik not: Paket 28 ayarı (günde 5 Vampir–Köylü oyunundan puan) bir kez uygulandı, silme');
  end if;
end $$;
insert into public.app_settings (key, value, description) values
  ('leader_monthly_event_quota', '8', 'Etkinlik Lideri onaylanan üyenin ayda açabileceği etkinlik sayısı (abone ya da ücretsiz hakkından büyükse geçerli)')
on conflict (key) do update set description = excluded.description;

-- Harita yoğunluğu ve "Burada kim var" üyelere açılır (bir kez uygulanır; sonra değeri değiştirebilirsin)
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_map_open_v1') then
    update public.app_settings set value = 'true' where key in ('map_public', 'map_presence_public');
    insert into public.app_settings (key, value, description)
    values ('seed_map_open_v1', 'true', 'Teknik not: harita üyelere bir kez açıldı, silme');
  end if;
end $$;

-- Moderatörün eski gönderi ve yorumları "Kat Görevlisi" adıyla görünür (rumuz yerine)
update public.posts p set alias = 'Kat Görevlisi'
  from public.post_authors a join public.profiles pr on pr.id = a.author_id
 where a.post_id = p.id and pr.role = 'admin' and not p.by_event and p.alias <> 'Kat Görevlisi';
update public.comments c set alias = 'Kat Görevlisi'
  from public.comment_authors a join public.profiles pr on pr.id = a.author_id
 where a.comment_id = c.id and pr.role = 'admin' and c.alias <> 'Kat Görevlisi';

-- Katılım kodu girişi etkinlik başlamadan 5 dakika önce açılır (bir kez uygulanır; sonra değeri değiştirebilirsin)
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'seed_checkin_5min') then
    update public.app_settings set value = '5' where key = 'event_checkin_open_minutes_before';
    insert into public.app_settings (key, value, description)
    values ('seed_checkin_5min', 'true', 'Teknik not: kod girişi 5 dakikaya bir kez çekildi, silme');
  end if;
end $$;
insert into public.app_settings (key, value, description) values
  ('game_invite_radius', '2', 'Oyun daveti: oda sahibi, odanın peteğine en çok kaç petek uzaklıkta son saatlerde görülen (davet almayı açmış) üyelere davet gönderebilir?'),
  ('game_invite_hours', '3', 'Oyun daveti: "yakındaki" sayılmak için üyenin son kaç saatte o bölgede konum bildirmiş olması gerekir?'),
  ('team_max_size', '8', 'Etkinlik ekibi en çok kaç kişi olabilir?'),
  ('event_share_minutes_before', '60', 'Etkinlik akışta, başlamasına en çok kaç dakika kala paylaşılabilir? (yalnızca bu son süre içinde)'),
  ('event_daily_join_limit', '2', 'Bir üye aynı gün en çok kaç etkinliğe katılabilir? (aynı kategoriden her gün en çok 1)'),
  ('cell_feed_max_distance', '1', 'Petek akışını okumak ve yazmak için peteğe en çok kaç petek uzaklıkta olunmalı?'),
  ('treasure_pts_kolay', '25', 'Hazine Avı: kolay hazinenin puanı'),
  ('treasure_pts_orta', '60', 'Hazine Avı: orta hazinenin puanı'),
  ('treasure_pts_zor', '120', 'Hazine Avı: zor hazinenin puanı'),
  ('treasure_pts_imkansiz', '500', 'Hazine Avı: imkânsız hazinenin puanı'),
  ('treasure_monthly_limit', '3', 'Hazine Avı: bir üye ayda en çok kaç hazine bulabilir?'),
  ('treasure_month_max', '300', 'Hazine Avı: ayda en çok kaç hazine kodu gizlenebilir?'),
  ('treasure_find_distance', '1', 'Hazine Avı: kodu girerken hazinenin peteğine en çok kaç petek uzaklıkta olunmalı?'),
  ('concert_duration_hours', '2', 'Konser & Festival etkinliği başlangıçtan kaç saat sonra listeden kalkar?'),
  ('pts_event_rate', '2', 'Etkinlik puanlama: puan veren kaç puan kazanır?'),
  ('host_close_minutes_after', '45', 'Düzenleyen etkinliğini başlangıçtan en erken kaç dakika sonra kapatabilir?'),
  ('pts_event_rate_month', '10', 'Etkinlik puanlama: puan veren ayda en çok kaç puanlamadan puan kazanır?'),
  ('pts_event_rated_5', '4', 'Etkinlik puanlama: 5 yıldız alan düzenleyen kaç puan kazanır? (konser hariç)'),
  ('pts_event_rated_4', '2', 'Etkinlik puanlama: 4 yıldız alan düzenleyen kaç puan kazanır? (konser hariç)'),
  ('pts_event_rated_month_cap', '80', 'Etkinlik puanlama: düzenleyen puanlamalardan ayda en çok kaç puan kazanır?'),
  ('concert_checkin_minutes_after', '45', 'Konser & Festival: kod girişi başlangıçtan en geç kaç dakika sonrasına kadar açık?')
on conflict (key) do update set description = excluded.description;

-- Uygulama metinleri (Profil > Uygulama ve kayıt ekranında açılır). Değerleri Table Editor > app_settings'ten
-- düzenle: metin tırnak içinde yazılır, örn. "Bize destek@ornek.com adresinden ulaşabilirsin." Şemayı tekrar
-- çalıştırmak yazdığın metni ezmez.
insert into public.app_settings (key, value, description) values
  ('legal_terms', '"Kullanıcı sözleşmesi metni henüz eklenmedi."', 'Kullanıcı sözleşmesi metni (Profil > Uygulama)'),
  ('legal_consent', '"Açık rıza metni henüz eklenmedi."', 'Açık rıza metni (Profil > Uygulama)'),
  ('legal_kvkk', '"KVKK aydınlatma metni henüz eklenmedi."', 'KVKK aydınlatma metni (Profil > Uygulama)'),
  ('signup_one_per_device', 'true', 'Her telefondan yalnızca 1 hesap açılabilsin mi? (Deneme için geçici olarak false yapılabilir; yayında true olmalı.)'),
  ('support_contact', '"İletişim bilgisi henüz eklenmedi."', 'Bize ulaşın: e-posta, telefon ya da sosyal medya adresi. Şifresini ve kurtarma kelimelerini kaybeden ya da yasaklanan üyeler buradan ulaşır.')
on conflict (key) do update set description = excluded.description;

-- Hukuki metinlerin ilk taslağı (avukat incelemesinden geçecek). Köşeli parantezli [ALANLAR] doldurulmalı.
-- Yalnızca metin hâlâ "henüz eklenmedi" durumundaysa yazılır; sonradan düzenlediğin metne dokunulmaz.
-- Biçim: "## " ile başlayan satır bölüm başlığı, "• " ile başlayan satır madde olarak görünür.
update public.app_settings set value = to_jsonb($legal$41. Kat Sosyal olarak kişisel verilerine önem veriyoruz. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca hangi verilerini neden ve nasıl işlediğimizi, kimlerle paylaştığımızı ve haklarını anlatır.

## 1. Veri sorumlusu
• Unvan: [VERİ SORUMLUSUNUN ADI / UNVANI]
• Adres: [ADRES]
• İletişim: [E-POSTA ADRESİ]

## 2. Hangi verilerini işliyoruz?
• Kimlik ve hesap bilgileri: gerçek adın, kullanıcı adın (yalnızca giriş için; hiçbir üyeye gösterilmez), şifren ve kurtarma kelimelerin (ikisi de yalnızca geri çevrilemeyen şifreli özet olarak saklanır).
• Rumuz ve avatar: sistemin her hafta sana rastgele verdiği takma ad ve avatar.
• Cihaz bilgisi: telefonunun kimliğinin geri çevrilemeyen özeti (Android'de telefonun kalıcı cihaz kimliğinden üretilir). Telefon kimliğinin kendisi saklanmaz.
• Yaklaşık konum: tam konumun sunucularımıza hiç gönderilmez ve kaydedilmez. Telefonun, konumunu yalnızca yaklaşık 500 metrelik bir bölge numarasına ("petek") çevirir ve sadece bu numara gönderilir. Bu yalnızca sen bir işlem yaptığında olur: gönderiye yer eklerken, petek akışını açarken, "Buradayım" derken, yan yana oyun açarken ya da bir oyuna girerken, etkinlik katılımını doğrularken, hazine kodu girerken. Konumun sürekli takip edilmez, uygulama arka plandayken konumuna bakılmaz.
• Paylaştığın içerikler: akış gönderileri, yorumlar, tepkiler, özel mesajlar, oyun içi sohbet ve fısıltılar, etkinlik yorumları, mekân değerlendirmeleri, Kat Görevlisi ile yazışmaların.
• Etkinlik bilgileri: kayıt olduğun, katılımını doğruladığın ve puanladığın etkinlikler; ekip kurarken kendi isteğinle paylaştığın iletişim bilgisi; Etkinlik Lideri başvurusundaki ad ve telefon numarası.
• Oyun ve puan bilgileri: oynadığın oyunlar, sonuçlar, puan hareketleri, sıralama ve başarımlar.
• Abonelik bilgisi: aboneliğinin var olup olmadığı ve bitiş tarihi. Ödeme ve kart bilgilerin bize hiç gelmez; ödemeyi App Store ya da Google Play alır.
• Güvenlik kayıtları: şifre sıfırlama denemelerinde bağlantı (IP) adresi, yanlış kod denemeleri, şikayetler, moderatör işlemleri ve oturum bilgisi.
• Tercihler: bildirim tercihlerin ve uygulama içi bildirimlerin.

## 3. Anonimlik nasıl korunur?
Akışta yalnızca rumuzunla görünürsün. Gönderilerinin ve yorumlarının gerçek sahibi ayrı ve kilitli bir kayıtta tutulur; üyeler bu kaydı göremez. Moderatör bu bilgiye yalnızca şikayet incelemesi ya da yasal bir zorunluluk olduğunda erişebilir ve her erişim kayıt altına alınır. Gerçek adın; sıralamada, etkinliklerde (düzenleyen ya da yorum yazan olarak), arkadaşlarına ve oyun odalarında görünür.

## 4. Verilerini hangi amaçlarla işliyoruz?
• Üyeliğini oluşturmak, hesabına güvenle girmeni ve şifreni kurtarabilmeni sağlamak,
• Akış, etkinlik, oyun, harita, arkadaşlık ve mesajlaşma özelliklerini sunmak,
• Puanları, sıralamaları ve başarımları hesaplamak; hileyi (çoklu hesap, sahte katılım gibi) önlemek,
• Her telefondan yalnızca bir hesap açılmasını sağlamak ve yasaklanan hesapların yeniden açılmasını engellemek,
• Haritada bölgelerin ne kadar hareketli olduğunu, kimseyi göstermeden ve en az 5 farklı üye olmadan renklendirmeden göstermek,
• Şikayetleri incelemek, topluluk kurallarını uygulamak ve kötüye kullanımı önlemek,
• Aboneliğini doğrulamak ve abonelik ayrıcalıklarını sunmak,
• Yasal yükümlülüklerimizi yerine getirmek ve yetkili makamların taleplerini karşılamak.

## 5. Hukuki sebepler
Verilerin KVKK'nın 5. maddesindeki şu sebeplere dayanarak işlenir: üyelik sözleşmesinin kurulması ve yerine getirilmesi, hukuki yükümlülüklerimizin yerine getirilmesi, bir hakkın tesisi, kullanılması veya korunması, temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaatlerimiz (güvenlik, hile ve kötüye kullanımın önlenmesi) ve gerektiğinde açık rızan (bkz. Açık Rıza Metni).

## 6. Verilerin kimlerle paylaşılır?
• Altyapı hizmet sağlayıcılarımız: verilerin, uygulamanın sunucu ve veritabanı hizmetini aldığımız Supabase altyapısında saklanır ([SUNUCU BÖLGESİ / ÜLKE]).
• Abonelik hizmeti: abonelik durumunu doğrulamak için RevenueCat ve uygulama mağazaları (Apple App Store, Google Play) ile yalnızca üye numaran ve abonelik bilgisi paylaşılır.
• Yetkili kurum ve kuruluşlar: yalnızca kanunen zorunlu olduğunda ve talep edilen ölçüde.
Verilerin hiçbir zaman reklam amacıyla satılmaz ya da kiralanmaz.

## 7. Yurt dışına aktarım
Hizmet sağlayıcılarımızın sunucuları yurt dışında bulunabileceği için verilerin KVKK'nın 9. maddesine uygun şekilde yurt dışına aktarılabilir. [AVUKAT DEĞERLENDİRMESİ: aktarımın dayanağı (standart sözleşme / açık rıza) burada belirtilmelidir.]

## 8. Ne kadar süre saklıyoruz?
• Akış her Pazartesi sıfırlanır; eski gönderiler üyelere görünmez, yasal talepler için arşivde 365 gün tutulup silinir.
• Arkadaş olmayanlarla özel mesajlar haftalık kapanır, arşivde 365 gün tutulup silinir.
• Harita yoğunluk kayıtları (petek numarası) en çok 30 gün tutulur.
• Bilgi Yarışması sohbetleri, Vampir–Köylü fısıltıları ve elenenler sohbeti 14 gün tutulur.
• Bildirimler 60 gün tutulur. Kat Görevlisi yazışmaları görüşme bitince, 90 gün hareketsiz kalırsa kendiliğinden silinir.
• Şifre sıfırlamadaki bağlantı adresi kayıtları 1 gün içinde silinir.
• Hesabını sildiğinde profilin, gönderilerin ve yorumların kalıcı olarak silinir. Telefon kimliğinin özeti, aynı telefondan yasak kaçırmak için yeniden hesap açılmasını önlemek amacıyla saklanmaya devam eder. Kanunen saklamamız gereken kayıtlar yasal süre boyunca tutulur.

## 9. Hakların (KVKK madde 11)
Bize başvurarak şunları isteyebilirsin:
• Kişisel verilerinin işlenip işlenmediğini öğrenmek ve işlenmişse bilgi talep etmek,
• İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek,
• Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilmek,
• Eksik veya yanlış işlenmişse düzeltilmesini istemek,
• Silinmesini veya yok edilmesini istemek ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini istemek,
• Otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etmek,
• Kanuna aykırı işlenmesi sebebiyle zarara uğrarsan zararın giderilmesini talep etmek.

## 10. Başvuru
Başvurunu [E-POSTA ADRESİ] adresine ya da [ADRES] adresine yazılı olarak iletebilirsin. Başvurunu en geç 30 gün içinde ücretsiz olarak sonuçlandırırız.

Son güncelleme: [TARİH]$legal$::text)
 where key = 'legal_kvkk' and value = '"KVKK aydınlatma metni henüz eklenmedi."'::jsonb;
update public.app_settings set value = to_jsonb($legal$41. Kat Sosyal'e hoş geldin! Bu sözleşme, uygulamayı kullanırken senin ve bizim hak ve sorumluluklarımızı anlatır. Hesap oluşturarak bu sözleşmeyi kabul etmiş olursun.

## 1. Taraflar
Bu sözleşme, [VERİ SORUMLUSUNUN ADI / UNVANI] ("41. Kat Sosyal", "biz") ile uygulamaya üye olan kişi ("üye", "sen") arasındadır.

## 2. Üyelik
• Üye olmak için 18 yaşını doldurmuş olmalısın. [AVUKAT DEĞERLENDİRMESİ: yaş sınırı]
• Gerçek adını doğru yazmalısın. Gerçek adını yalnızca bir kez değiştirebilirsin; "41. Kat", "Moderatör" ve "Yönetici" içeren adlar kullanılamaz.
• Her telefondan yalnızca bir hesap açılabilir ve bir kişi yalnızca bir hesap kullanabilir.
• Hesabına aynı anda tek telefondan girilebilir; başka bir telefondan girildiğinde önceki oturum kapanır.

## 3. Hesap güvenliği
• Şifren ve 12 kurtarma kelimen yalnızca sende kalmalıdır; kimseyle paylaşma.
• E-posta adresi tutmadığımız için şifreni ve kurtarma kelimelerini birlikte kaybedersen hesabına erişimi geri getiremeyebiliriz.
• Hesabında gerçekleşen işlemlerden sen sorumlusun.

## 4. Rumuz ve anonimlik
Akışta yalnızca sistemin her hafta verdiği rumuzla görünürsün. Anonimlik sana kuralları çiğneme hakkı vermez: şikayet incelemesi ya da yasal zorunluluk durumunda moderatör içeriğin sahibini görebilir.

## 5. Topluluk kuralları
Şunlar kesinlikle yasaktır:
• Hakaret, taciz, tehdit, nefret söylemi ve ayrımcılık,
• Başkasının kişisel bilgilerini (adres, telefon, fotoğraf gibi) izinsiz paylaşmak,
• Müstehcen, şiddet içeren ya da yasa dışı içerik paylaşmak,
• Akışta ve sohbetlerde bağlantı (link), reklam ve spam paylaşmak,
• Başka bir kişiyi, moderatörü ya da 41. Kat Sosyal'i taklit etmek,
• Uygulamanın güvenliğini aşmaya çalışmak, otomatik araç kullanmak.

## 6. Puanlar, sıralama ve hile
• Puanların, seviyelerin ve başarımların parasal bir değeri yoktur; satılamaz, devredilemez, paraya çevrilemez.
• Birden fazla hesap kullanmak, sahte konum kullanmak, katılım ya da oyun kodlarını orada olmayan kişilerle paylaşmak, aynı kişilerle anlaşarak yapay puan toplamak hiledir.
• Hile tespit edilirse ilgili puanlar geri alınabilir, hesap sıralamadan çıkarılabilir, susturulabilir ya da kalıcı olarak yasaklanabilir.
• Puan kuralları ve sınırları uygulama içinde açıklanır ve zaman zaman değişebilir.

## 7. Etkinlikler ve buluşmalar
• Üyelerin açtığı etkinliklerin düzenleyeni o etkinliğin içeriğinden, güvenliğinden ve doğruluğundan sorumludur. 41. Kat Sosyal bu etkinliklerin düzenleyeni değildir.
• Etkinlik ücretleri uygulama üzerinden tahsil edilmez; ödeme etkinlik yerinde, düzenleyenle aranızda yapılır.
• Yaş sınırı olan etkinliklere katılırken yaşını doğru beyan etmekten sen sorumlusun.
• Tanımadığın kişilerle buluşurken kalabalık ve herkese açık yerleri tercih et, kişisel güvenliğine dikkat et.
• Etkinliği kuralları çiğneyerek kullanan (sahte etkinlik, kod satışı gibi) üyenin etkinlikleri kaldırılabilir ve puanları geri alınabilir.

## 8. Oyunlar
Yan yana oynanan oyunlarda oyun ekranından ayrılan, uygulamayı kapatan ya da bağlantısı kopan oyuncu oyundan çıkarılır. Oyun içi sohbet ve fısıltılarda da topluluk kuralları geçerlidir.

## 9. Mekânlar ve sponsorlar
Anlaşmalı mekânların sunduğu ayrıcalıklar ve kodlar mekânın sorumluluğundadır. Mekân değerlendirmelerinin dürüst ve kendi deneyimine dayalı olması gerekir.

## 10. Abonelik
• Abonelik, App Store ya da Google Play üzerinden satın alınır; ödeme, otomatik yenileme, iptal ve iade işlemleri ilgili mağazanın kurallarına tabidir.
• Aboneliğini mağaza hesabındaki abonelik ayarlarından istediğin zaman iptal edebilirsin; iptal, mevcut dönemin sonunda geçerli olur.
• Abonelik puan, seviye ya da sıralamada avantaj sağlamaz.

## 11. Hediye programı
Sıralamaya bağlı hediye programı yürütülürse, kuralları uygulama içinde ayrıca duyurulur.

## 12. Moderasyon ve yaptırımlar
Kurallara aykırı içerikler gizlenebilir ya da silinebilir; üyeye uyarı verilebilir, geçici olarak susturulabilir ya da hesabı kalıcı olarak yasaklanabilir. Yasaklanan bir hesabın telefonundan yeni hesap açılamaz. Yaptırıma itiraz için bize ulaşabilirsin.

## 13. Fikri haklar
Uygulamanın adı, logosu, tasarımı ve yazılımı 41. Kat Sosyal'e aittir. Paylaştığın içeriklerin sorumluluğu sana aittir; bu içerikleri uygulamada göstermemiz için bize ücretsiz ve sınırlı bir kullanım izni vermiş olursun.

## 14. Sorumluluğun sınırı
Uygulamayı kesintisiz ve hatasız sunmak için çalışırız ancak bunu garanti edemeyiz. Üyelerin paylaştığı içeriklerden, üyeler arasındaki buluşma ve anlaşmalardan, kanunun izin verdiği ölçüde sorumlu değiliz.

## 15. Hesabın silinmesi
Hesabını Profil bölümünden istediğin zaman silebilirsin. Silme işlemi kalıcıdır; gönderilerin, yorumların ve puanların geri getirilemez.

## 16. Değişiklikler
Bu sözleşmeyi güncelleyebiliriz. Önemli değişiklikleri uygulama içinde duyururuz; değişiklikten sonra uygulamayı kullanmaya devam etmen, yeni metni kabul ettiğin anlamına gelir.

## 17. Uygulanacak hukuk
Bu sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda [KOCAELİ] mahkemeleri ve icra daireleri yetkilidir; tüketici olarak kanuni haklarını kullanma hakkın saklıdır.

## 18. İletişim
[E-POSTA ADRESİ]

Son güncelleme: [TARİH]$legal$::text)
 where key = 'legal_terms' and value = '"Kullanıcı sözleşmesi metni henüz eklenmedi."'::jsonb;
update public.app_settings set value = to_jsonb($legal$Bu metin, KVKK Aydınlatma Metni'nde anlatılan işlemlerden açık rızana dayananları açıklar. Rıza vermek tamamen isteğe bağlıdır; rıza vermezsen yalnızca ilgili özellikleri kullanamazsın, üyeliğin devam eder.

## 1. Yaklaşık konumun işlenmesi
Aşağıdaki özellikleri kullandığında, telefonunun bulunduğu yaklaşık 500 metrelik bölgenin ("petek") numarasının işlenmesine izin veriyorum:
• Gönderiye yer eklemek ve petek akışını kullanmak,
• "Buradayım" ile bölgemi haritaya bildirmek,
• Yan yana oynanan bir oyun açmak ya da bir oyuna girmek,
• Etkinlik katılımımı doğrulamak,
• Hazine Avı'nda kod girmek.
Tam konumumun sunucuya gönderilmediğini, kaydedilmediğini ve konumumun sürekli takip edilmediğini biliyorum. Petek bilgisi haritadaki yoğunluk için en çok 30 gün, hiçbir üyeye kimliğim gösterilmeden kullanılır.

## 2. Verilerin yurt dışına aktarılması
Verilerimin, uygulamanın sunucu ve abonelik hizmetlerini sağlayan yurt dışındaki hizmet sağlayıcılara (Supabase, RevenueCat, Apple, Google) KVKK'nın 9. maddesine uygun olarak aktarılmasına izin veriyorum.

## 3. Bildirimler
Uygulama açıkken yeni bildirim ve oyun davetlerinin, katıldığım etkinliklerin hatırlatmalarının ise önceden kurularak telefonumda gösterilmesine izin veriyorum. Bildirim türlerini Profil > Hesabım > Bildirim ve konum bölümünden istediğim zaman kapatabilirim.

## Rızanı geri alma
Verdiğin rızayı istediğin zaman geri alabilirsin: konum iznini telefon ayarlarından kapatabilir, bildirimleri uygulama içinden kapatabilir ya da [E-POSTA ADRESİ] adresine yazabilirsin. Rızanı geri alman, geri almadan önceki işlemleri etkilemez.

Son güncelleme: [TARİH]$legal$::text)
 where key = 'legal_consent' and value = '"Açık rıza metni henüz eklenmedi."'::jsonb;

-- Kocaeli kara petekleri (petek boyutu 500 m, ızgara başlangıcı 29.0°D 40.8°K). Kıyıdaki mekânların petekleri de dahildir.
delete from public.map_land_ranges;
insert into public.map_land_ranges (r, q0, q1, district) values
  (-40, 69, 71, 0),
  (-40, 74, 74, 0),
  (-39, 68, 75, 0),
  (-39, 108, 109, 2),
  (-38, 68, 79, 0),
  (-38, 107, 111, 2),
  (-37, 67, 79, 0),
  (-37, 107, 112, 2),
  (-36, 66, 80, 0),
  (-36, 106, 113, 2),
  (-35, 65, 80, 0),
  (-35, 106, 114, 2),
  (-34, 65, 81, 0),
  (-34, 105, 115, 2),
  (-33, 65, 81, 0),
  (-33, 102, 103, 1),
  (-33, 104, 117, 2),
  (-32, 65, 81, 0),
  (-32, 95, 102, 1),
  (-32, 103, 117, 2),
  (-31, 64, 82, 0),
  (-31, 93, 101, 1),
  (-31, 102, 117, 2),
  (-30, 64, 81, 0),
  (-30, 91, 101, 1),
  (-30, 102, 115, 2),
  (-30, 116, 120, 3),
  (-29, 63, 81, 0),
  (-29, 88, 100, 1),
  (-29, 101, 114, 2),
  (-29, 115, 122, 3),
  (-28, 63, 82, 0),
  (-28, 84, 101, 1),
  (-28, 102, 113, 2),
  (-28, 114, 122, 3),
  (-27, 63, 82, 0),
  (-27, 83, 102, 1),
  (-27, 103, 113, 2),
  (-27, 114, 123, 3),
  (-26, 62, 81, 0),
  (-26, 82, 101, 1),
  (-26, 102, 112, 2),
  (-26, 113, 123, 3),
  (-25, 61, 80, 0),
  (-25, 81, 100, 1),
  (-25, 101, 112, 2),
  (-25, 113, 123, 3),
  (-24, 61, 79, 0),
  (-24, 80, 99, 1),
  (-24, 100, 111, 2),
  (-24, 112, 123, 3),
  (-23, 60, 78, 0),
  (-23, 79, 99, 1),
  (-23, 100, 108, 2),
  (-23, 109, 109, 3),
  (-23, 110, 111, 2),
  (-23, 112, 123, 3),
  (-22, 61, 78, 0),
  (-22, 79, 97, 1),
  (-22, 98, 108, 2),
  (-22, 109, 122, 3),
  (-21, 63, 79, 0),
  (-21, 80, 97, 1),
  (-21, 98, 108, 2),
  (-21, 109, 122, 3),
  (-20, 62, 78, 0),
  (-20, 79, 96, 1),
  (-20, 97, 109, 2),
  (-20, 110, 122, 3),
  (-19, 63, 79, 0),
  (-19, 80, 95, 1),
  (-19, 96, 107, 2),
  (-19, 108, 122, 3),
  (-18, 63, 76, 0),
  (-18, 77, 94, 1),
  (-18, 95, 107, 2),
  (-18, 108, 122, 3),
  (-17, 63, 75, 0),
  (-17, 76, 92, 1),
  (-17, 93, 106, 2),
  (-17, 107, 121, 3),
  (-16, 64, 74, 0),
  (-16, 75, 92, 1),
  (-16, 93, 105, 2),
  (-16, 106, 121, 3),
  (-15, 68, 75, 0),
  (-15, 76, 92, 1),
  (-15, 93, 105, 2),
  (-15, 106, 120, 3),
  (-14, 71, 73, 0),
  (-14, 74, 92, 1),
  (-14, 93, 105, 2),
  (-14, 106, 119, 3),
  (-13, 76, 90, 1),
  (-13, 91, 103, 2),
  (-13, 104, 119, 3),
  (-12, 79, 89, 1),
  (-12, 90, 91, 2),
  (-12, 95, 103, 2),
  (-12, 104, 128, 3),
  (-11, 82, 88, 1),
  (-11, 89, 90, 2),
  (-11, 97, 98, 11),
  (-11, 99, 103, 2),
  (-11, 104, 128, 3),
  (-10, 97, 98, 11),
  (-10, 99, 101, 2),
  (-10, 102, 127, 3),
  (-9, 96, 97, 11),
  (-9, 98, 101, 2),
  (-9, 102, 126, 3),
  (-8, 79, 81, 9),
  (-8, 82, 83, 8),
  (-8, 95, 97, 11),
  (-8, 98, 100, 2),
  (-8, 101, 125, 3),
  (-7, 41, 42, 4),
  (-7, 78, 81, 9),
  (-7, 82, 87, 8),
  (-7, 95, 96, 11),
  (-7, 97, 99, 2),
  (-7, 100, 124, 3),
  (-6, 38, 42, 4),
  (-6, 76, 80, 9),
  (-6, 81, 86, 8),
  (-6, 87, 96, 11),
  (-6, 97, 98, 2),
  (-6, 99, 100, 11),
  (-6, 101, 109, 3),
  (-6, 110, 110, 11),
  (-6, 111, 124, 3),
  (-5, 37, 42, 4),
  (-5, 43, 44, 6),
  (-5, 53, 54, 7),
  (-5, 58, 59, 7),
  (-5, 75, 80, 9),
  (-5, 81, 85, 8),
  (-5, 86, 102, 11),
  (-5, 103, 107, 3),
  (-5, 108, 111, 11),
  (-5, 112, 123, 3),
  (-4, 36, 42, 4),
  (-4, 43, 48, 6),
  (-4, 52, 60, 7),
  (-4, 70, 80, 9),
  (-4, 81, 85, 8),
  (-4, 86, 103, 11),
  (-4, 104, 106, 3),
  (-4, 107, 111, 11),
  (-4, 112, 115, 3),
  (-4, 116, 116, 11),
  (-4, 117, 123, 3),
  (-3, 36, 42, 4),
  (-3, 43, 50, 6),
  (-3, 51, 59, 7),
  (-3, 60, 78, 9),
  (-3, 79, 85, 8),
  (-3, 86, 113, 11),
  (-3, 114, 114, 3),
  (-3, 115, 117, 11),
  (-3, 118, 122, 3),
  (-2, 34, 40, 4),
  (-2, 41, 51, 6),
  (-2, 52, 58, 7),
  (-2, 59, 79, 9),
  (-2, 80, 84, 8),
  (-2, 85, 120, 11),
  (-1, 33, 38, 4),
  (-1, 39, 50, 6),
  (-1, 51, 58, 7),
  (-1, 59, 78, 9),
  (-1, 79, 83, 8),
  (-1, 84, 119, 11),
  (0, 34, 34, 6),
  (0, 35, 36, 4),
  (0, 37, 51, 6),
  (0, 52, 58, 7),
  (0, 59, 78, 9),
  (0, 79, 83, 8),
  (0, 84, 119, 11),
  (1, 33, 51, 6),
  (1, 52, 58, 7),
  (1, 59, 78, 9),
  (1, 79, 83, 8),
  (1, 84, 118, 11),
  (2, 32, 34, 6),
  (2, 35, 35, 5),
  (2, 36, 50, 6),
  (2, 51, 58, 7),
  (2, 59, 77, 9),
  (2, 78, 83, 8),
  (2, 84, 117, 11),
  (3, 33, 33, 6),
  (3, 34, 34, 5),
  (3, 35, 36, 6),
  (3, 37, 38, 5),
  (3, 39, 49, 6),
  (3, 50, 58, 7),
  (3, 59, 78, 9),
  (3, 79, 82, 8),
  (3, 83, 117, 11),
  (4, 34, 38, 5),
  (4, 39, 48, 6),
  (4, 49, 58, 7),
  (4, 59, 78, 9),
  (4, 79, 82, 8),
  (4, 83, 116, 11),
  (5, 33, 38, 5),
  (5, 39, 48, 6),
  (5, 49, 60, 7),
  (5, 61, 78, 9),
  (5, 79, 84, 8),
  (5, 85, 116, 11),
  (6, 33, 38, 5),
  (6, 39, 47, 6),
  (6, 48, 61, 7),
  (6, 62, 78, 9),
  (6, 79, 87, 8),
  (6, 88, 116, 11),
  (7, 32, 37, 5),
  (7, 38, 46, 6),
  (7, 47, 62, 7),
  (7, 63, 77, 9),
  (7, 78, 87, 8),
  (7, 88, 118, 11),
  (8, 31, 37, 5),
  (8, 38, 46, 6),
  (8, 47, 61, 7),
  (8, 62, 77, 9),
  (8, 78, 87, 8),
  (8, 88, 118, 11),
  (9, 31, 36, 5),
  (9, 37, 46, 6),
  (9, 47, 61, 7),
  (9, 62, 78, 9),
  (9, 79, 86, 8),
  (9, 87, 118, 11),
  (10, 31, 35, 5),
  (10, 36, 45, 6),
  (10, 46, 61, 7),
  (10, 62, 77, 9),
  (10, 78, 86, 8),
  (10, 87, 118, 11),
  (11, 32, 34, 5),
  (11, 35, 46, 6),
  (11, 47, 60, 7),
  (11, 61, 76, 9),
  (11, 77, 85, 8),
  (11, 86, 100, 11),
  (11, 101, 102, 10),
  (11, 103, 117, 11),
  (12, 34, 47, 6),
  (12, 48, 60, 7),
  (12, 61, 76, 9),
  (12, 77, 84, 8),
  (12, 85, 99, 11),
  (12, 100, 106, 10),
  (12, 107, 116, 11),
  (13, 34, 48, 6),
  (13, 49, 58, 7),
  (13, 59, 60, 6),
  (13, 61, 76, 9),
  (13, 77, 83, 8),
  (13, 84, 98, 11),
  (13, 99, 106, 10),
  (13, 107, 116, 11),
  (14, 34, 48, 6),
  (14, 49, 54, 7),
  (14, 55, 60, 6),
  (14, 61, 75, 9),
  (14, 76, 83, 8),
  (14, 84, 96, 11),
  (14, 97, 106, 10),
  (14, 107, 114, 11),
  (14, 117, 118, 10),
  (15, 36, 52, 6),
  (15, 53, 53, 7),
  (15, 54, 60, 6),
  (15, 61, 74, 9),
  (15, 75, 83, 8),
  (15, 84, 96, 11),
  (15, 97, 107, 10),
  (15, 108, 111, 11),
  (15, 112, 113, 10),
  (15, 116, 118, 10),
  (16, 36, 60, 6),
  (16, 61, 72, 9),
  (16, 73, 82, 8),
  (16, 83, 94, 11),
  (16, 95, 106, 10),
  (16, 107, 111, 11),
  (16, 112, 117, 10),
  (17, 35, 61, 6),
  (17, 62, 70, 9),
  (17, 71, 81, 8),
  (17, 82, 93, 11),
  (17, 94, 105, 10),
  (17, 106, 111, 11),
  (17, 112, 116, 10),
  (18, 34, 61, 6),
  (18, 62, 69, 9),
  (18, 70, 81, 8),
  (18, 82, 92, 11),
  (18, 93, 104, 10),
  (18, 105, 109, 11),
  (18, 110, 115, 10),
  (19, 34, 61, 6),
  (19, 62, 69, 9),
  (19, 70, 81, 8),
  (19, 82, 93, 11),
  (19, 94, 108, 10),
  (19, 109, 109, 11),
  (19, 110, 116, 10),
  (20, 33, 61, 6),
  (20, 62, 68, 9),
  (20, 69, 79, 8),
  (20, 80, 85, 11),
  (20, 86, 86, 10),
  (20, 87, 89, 11),
  (20, 90, 90, 10),
  (20, 91, 92, 11),
  (20, 93, 115, 10),
  (21, 33, 61, 6),
  (21, 62, 67, 9),
  (21, 68, 78, 8),
  (21, 79, 83, 11),
  (21, 84, 86, 10),
  (21, 87, 89, 11),
  (21, 90, 91, 10),
  (21, 92, 92, 11),
  (21, 93, 114, 10),
  (22, 33, 60, 6),
  (22, 61, 67, 9),
  (22, 68, 77, 8),
  (22, 78, 82, 11),
  (22, 83, 86, 10),
  (22, 87, 88, 11),
  (22, 89, 114, 10),
  (23, 35, 59, 6),
  (23, 60, 66, 9),
  (23, 67, 78, 8),
  (23, 79, 81, 11),
  (23, 82, 114, 10),
  (24, 35, 59, 6),
  (24, 60, 65, 9),
  (24, 66, 72, 8),
  (24, 73, 74, 10),
  (24, 75, 77, 8),
  (24, 78, 78, 10),
  (24, 79, 81, 11),
  (24, 82, 112, 10),
  (25, 35, 51, 6),
  (25, 54, 59, 6),
  (25, 60, 64, 9),
  (25, 65, 72, 8),
  (25, 73, 111, 10),
  (26, 35, 47, 6),
  (26, 54, 58, 6),
  (26, 59, 64, 9),
  (26, 65, 71, 8),
  (26, 72, 110, 10),
  (27, 35, 45, 6),
  (27, 54, 58, 6),
  (27, 59, 63, 9),
  (27, 64, 69, 8),
  (27, 70, 107, 10),
  (27, 109, 109, 10),
  (28, 35, 45, 6),
  (28, 54, 57, 6),
  (28, 58, 63, 9),
  (28, 64, 68, 8),
  (28, 69, 106, 10),
  (29, 35, 45, 6),
  (29, 54, 58, 6),
  (29, 59, 63, 9),
  (29, 64, 68, 8),
  (29, 69, 106, 10),
  (30, 34, 44, 6),
  (30, 55, 58, 6),
  (30, 59, 62, 9),
  (30, 63, 67, 8),
  (30, 68, 105, 10),
  (31, 33, 43, 6),
  (31, 54, 57, 6),
  (31, 58, 61, 9),
  (31, 62, 66, 8),
  (31, 67, 104, 10),
  (32, 33, 42, 6),
  (32, 53, 56, 6),
  (32, 57, 61, 9),
  (32, 62, 63, 8),
  (32, 65, 65, 8),
  (32, 66, 103, 10),
  (33, 32, 41, 6),
  (33, 52, 56, 6),
  (33, 57, 60, 9),
  (33, 66, 104, 10),
  (34, 32, 40, 6),
  (34, 52, 55, 6),
  (34, 56, 56, 9),
  (34, 67, 104, 10),
  (35, 32, 33, 6),
  (35, 35, 37, 6),
  (35, 54, 54, 6),
  (35, 67, 104, 10),
  (36, 32, 32, 6),
  (36, 68, 104, 10),
  (37, 68, 104, 10),
  (38, 67, 103, 10),
  (39, 67, 102, 10),
  (40, 67, 101, 10),
  (41, 66, 100, 10),
  (42, 66, 101, 10),
  (43, 66, 66, 10),
  (43, 72, 103, 10),
  (44, 68, 103, 10),
  (45, 67, 104, 10),
  (46, 66, 104, 10),
  (47, 65, 104, 10),
  (48, 65, 105, 10),
  (49, 65, 104, 10),
  (50, 64, 70, 10),
  (50, 72, 72, 10),
  (50, 75, 76, 10),
  (50, 80, 104, 10),
  (51, 88, 103, 10),
  (52, 89, 103, 10),
  (53, 89, 103, 10),
  (54, 92, 105, 10),
  (55, 91, 105, 10),
  (56, 92, 104, 10),
  (57, 91, 103, 10),
  (58, 93, 102, 10),
  (59, 93, 100, 10),
  (60, 93, 94, 10);

-- ---------------------------------------------------------------------
-- 8) Satır düzeyinde güvenlik (RLS): kim neyi görebilir
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.levels enable row level security;
alter table public.app_settings enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.game_types enable row level security;
alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_player_secrets enable row level security;
alter table public.room_actions enable row level security;
alter table public.point_events enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.posts enable row level security;
alter table public.post_authors enable row level security;
alter table public.comments enable row level security;
alter table public.comment_authors enable row level security;
alter table public.post_likes enable row level security;
alter table public.user_blocks enable row level security;
alter table public.friendships enable row level security;
alter table public.reports enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.places enable row level security;
alter table public.map_land_ranges enable row level security;
alter table public.map_signals enable row level security;
alter table public.perks enable row level security;

-- Mekân yorumları: yalnızca moderatör doğrudan okur (şikayet ekranı); üyeler list_venue_reviews() kullanır
drop policy if exists venue_reviews_select on public.venue_reviews;
create policy venue_reviews_select on public.venue_reviews for select to authenticated
  using (public.is_admin());

-- Profil: kişi sadece kendi satırını, moderatör hepsini görür. Kimse doğrudan değiştiremez.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Herkesin okuyabildiği, sadece admin'in değiştirebildiği tablolar
drop policy if exists levels_select on public.levels;
create policy levels_select on public.levels for select to authenticated using (true);
drop policy if exists levels_admin on public.levels;
create policy levels_admin on public.levels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists game_types_select on public.game_types;
create policy game_types_select on public.game_types for select to authenticated using (true);
drop policy if exists game_types_admin on public.game_types;
create policy game_types_admin on public.game_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Etkinlik tablosunu yalnızca moderatör doğrudan okur. Üyeler list_events() ve diğer fonksiyonları kullanır; böylece
-- onay bekleyen etkinlikler ve moderatör onayı bekleyen görsellerin dosya yolu kimseye sızmaz.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (public.is_admin());
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_registrations_select on public.event_registrations;
create policy event_registrations_select on public.event_registrations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists event_registrations_admin on public.event_registrations;
create policy event_registrations_admin on public.event_registrations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Oyun odaları: odadakiler, odayı açan kişi ve moderatör
drop policy if exists game_rooms_select on public.game_rooms;
create policy game_rooms_select on public.game_rooms for select to authenticated
  using (public.is_admin() or public.is_room_member(id) or host_id = auth.uid());

drop policy if exists room_players_select on public.room_players;
create policy room_players_select on public.room_players for select to authenticated
  using (public.is_admin() or public.is_room_member(room_id) or public.is_room_host(room_id));

drop policy if exists room_player_secrets_select on public.room_player_secrets;
create policy room_player_secrets_select on public.room_player_secrets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists room_actions_select on public.room_actions;
create policy room_actions_select on public.room_actions for select to authenticated
  using (public.is_admin());

drop policy if exists point_events_select on public.point_events;
create policy point_events_select on public.point_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Akış: gizlenmiş veya engellediğin kişinin içerikleri görünmez (admin hepsini görür)
drop policy if exists posts_select on public.posts;
-- Petek gönderileri doğrudan okunamaz; yalnızca list_feed (peteğe yakınlık kontrolüyle) döner
create policy posts_select on public.posts for select to authenticated
  using (public._is_active_user()
         and (public.is_admin() or (not is_hidden and cell_q is null and not public.post_blocked_by_me(id)
                                    and public._post_live(created_at, event_id))));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (public._is_active_user() and (public.is_admin() or (not is_hidden and not public.comment_blocked_by_me(id)
         and not exists (select 1 from public.posts p where p.id = post_id
                          and (p.cell_q is not null or not public._post_live(p.created_at, p.event_id))))));

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists admin_audit_log_select on public.admin_audit_log;
create policy admin_audit_log_select on public.admin_audit_log for select to authenticated
  using (public.is_admin());

-- Politikası olmayan tablolar (post_authors, comment_authors, user_blocks, friendships)
-- hiçbir kullanıcıya açık değildir; sadece yukarıdaki sunucu fonksiyonları kullanır.

-- ---------------------------------------------------------------------
-- 9) Yetkiler (giriş yapmamış kişi hiçbir şeye erişemez)
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- Profil 4: sorun bildirimi, açık rızalar, kişisel veri dosyası, davet sistemi
-- ---------------------------------------------------------------------

-- Harita yoğunluğu rızası kapalıysa üyenin harita sinyali (oyun, etkinlik, gönderi, petek bildirimi) hiç yazılmaz
create or replace function public._map_signal_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_consents c
              where c.user_id = new.user_id and c.key = 'map_density' and not c.granted) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists map_signals_consent on public.map_signals;
create trigger map_signals_consent before insert on public.map_signals
  for each row execute function public._map_signal_consent();

-- Sorun bildir. Günde en çok 5 bildirim. Moderatörlere bildirim gider.
create or replace function public.submit_problem_report(p_category text, p_message text, p_name text default null,
                                                        p_email text default null, p_phone text default null,
                                                        p_version text default null, p_platform text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_id uuid;
  v_msg text := btrim(coalesce(p_message, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_label text;
  a record;
begin
  v := public._require_user();
  if p_category is null or p_category not in ('bug', 'account', 'points', 'event', 'game', 'map', 'subscription',
                                               'abuse', 'suggestion', 'other') then
    raise exception 'invalid_category';
  end if;
  if char_length(v_msg) not between 10 and 2000 then raise exception 'invalid_body'; end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^\+?[0-9 ()-]{7,}$') then
    raise exception 'invalid_phone';
  end if;
  if (select count(*) from public.problem_reports where user_id = v.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into public.problem_reports (user_id, category, message, contact_name, contact_email, contact_phone,
                                      app_version, platform)
  values (v.id, p_category, v_msg, nullif(left(btrim(coalesce(p_name, '')), 80), ''), v_email, v_phone,
          nullif(left(btrim(coalesce(p_version, '')), 40), ''), nullif(left(btrim(coalesce(p_platform, '')), 20), ''))
  returning id into v_id;
  v_label := case p_category when 'bug' then 'Uygulama hatası' when 'account' then 'Hesap ve giriş'
                             when 'points' then 'Puan ve sıralama' when 'event' then 'Etkinlik'
                             when 'game' then 'Oyunlar' when 'map' then 'Harita ve konum'
                             when 'subscription' then 'Abonelik' when 'abuse' then 'Kötüye kullanım'
                             when 'suggestion' then 'Öneri' else 'Diğer' end;
  for a in select id from public.profiles where role = 'admin' and banned_at is null loop
    perform public._notify(a.id, 'system', 'Yeni sorun bildirimi: ' || v_label,
      left(v_msg, 200) || case when char_length(v_msg) > 200 then '…' else '' end,
      jsonb_build_object('problem_report_id', v_id));
  end loop;
  return v_id;
end $$;

-- Moderatör: sorun bildirimleri (açık / kapalı)
drop function if exists public.admin_list_problem_reports(text);
create or replace function public.admin_list_problem_reports(p_status text default 'open')
returns table (id uuid, category text, message text, contact_name text, contact_email text, contact_phone text,
               app_version text, platform text, status text, created_at timestamptz, user_id uuid,
               user_full_name text, user_alias text)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select r.id, r.category, r.message, r.contact_name, r.contact_email, r.contact_phone, r.app_version, r.platform,
           r.status, r.created_at, r.user_id, p.full_name, p.alias
      from public.problem_reports r
      left join public.profiles p on p.id = r.user_id
     where r.status = case when p_status = 'closed' then 'closed' else 'open' end
     order by r.created_at desc
     limit 200;
end $$;

create or replace function public.admin_close_problem_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.problem_reports set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_id and status = 'open';
  if not found then raise exception 'not_found'; end if;
  perform public._audit('close_problem_report', null, jsonb_build_object('report_id', p_id));
end $$;

-- Kişisel verilerim: kimlik, kayıt tarihi ve açık rızalar
-- Not: _require_user haftalık rumuzu yenileyebildiği için (yazma yapar) bu fonksiyonlar "stable" işaretlenmez;
-- stable olsaydı sunucu salt okunur işlemde çalıştırır ve "read-only transaction" hatası verirdi.
create or replace function public.my_privacy()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  return jsonb_build_object(
    'user_id', v.id,
    'created_at', v.created_at,
    'consents', jsonb_build_object(
      'marketing', coalesce((select c.granted from public.user_consents c where c.user_id = v.id and c.key = 'marketing'), true),
      'map_density', coalesce((select c.granted from public.user_consents c where c.user_id = v.id and c.key = 'map_density'), true)));
end $$;

create or replace function public.set_consent(p_key text, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  if p_key is null or p_key not in ('marketing', 'map_density') or p_granted is null then raise exception 'invalid_consent'; end if;
  insert into public.user_consents (user_id, key, granted, updated_at) values (v.id, p_key, p_granted, now())
  on conflict (user_id, key) do update set granted = excluded.granted, updated_at = now();
end $$;

-- Resmi veri dosyası (KVKK md. 11): üyenin kendisine ait kayıtları tek bir JSON olarak. Her listede en yeni 1000 kayıt.
-- Başka üyelerin kimliği (gerçek ad / kullanıcı adı) dosyaya yazılmaz; yalnızca arkadaşlarının o anki rumuzu yazılır.
create or replace function public.my_data_export()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  return jsonb_build_object(
    'format', '41kat-veri-dosyasi-v1',
    'olusturulma', now(),
    'hesap', jsonb_build_object(
      'kullanici_kimligi', v.id, 'gercek_ad', v.full_name, 'kullanici_adi', v.username, 'rumuz', v.alias,
      'avatar', v.avatar_index, 'rol', v.role, 'kayit_tarihi', v.created_at, 'toplam_puan', v.points,
      'seviye', public._user_level(v.id), 'abonelik_bitis', v.premium_until, 'abonelik_kaynagi', v.premium_source,
      'arkadas_kodu', v.friend_code, 'davet_kodu', v.invite_code, 'susturma_bitis', v.muted_until,
      'kimlik_dogrulama', v.identity_verified_at, 'profil_resmi', v.photo_status),
    'acik_rizalar', (public.my_privacy()) -> 'consents',
    'kabul_edilen_sozlesmeler', jsonb_build_array(
      jsonb_build_object('metin', 'Kullanıcı sözleşmesi', 'kabul', v.created_at),
      jsonb_build_object('metin', 'KVKK aydınlatma metni', 'kabul', v.created_at),
      jsonb_build_object('metin', 'Açık rıza metni', 'kabul', v.created_at)),
    'bildirim_tercihleri', (select to_jsonb(np) - 'user_id' from public.notification_prefs np where np.user_id = v.id),
    'gonderiler', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select p.id, p.body, p.created_at, p.like_count, p.comment_count, p.is_hidden
          from public.posts p join public.post_authors pa on pa.post_id = p.id
         where pa.author_id = v.id order by p.created_at desc limit 1000) x), '[]'::jsonb),
    'yorumlar', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select c.id, c.post_id, c.body, c.created_at, c.is_hidden
          from public.comments c join public.comment_authors ca on ca.comment_id = c.id
         where ca.author_id = v.id order by c.created_at desc limit 1000) x), '[]'::jsonb),
    'gonderdigim_ozel_mesajlar', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select m.thread_id, m.body, m.created_at from public.dm_messages m
         where m.sender_id = v.id order by m.created_at desc limit 1000) x), '[]'::jsonb),
    'actigim_etkinlikler', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select e.id, e.title, e.description, e.location, e.starts_at, e.capacity, e.is_cancelled, e.created_at
          from public.events e where e.created_by = v.id order by e.created_at desc limit 1000) x), '[]'::jsonb),
    'etkinlik_kayitlarim', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select r.event_id, e.title, e.starts_at, r.created_at, r.checked_in_at
          from public.event_registrations r join public.events e on e.id = r.event_id
         where r.user_id = v.id order by r.created_at desc limit 1000) x), '[]'::jsonb),
    'puan_gecmisi', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select pe.amount, pe.reason, pe.source, pe.created_at from public.point_events pe
         where pe.user_id = v.id order by pe.created_at desc limit 1000) x), '[]'::jsonb),
    'oyunlar', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select g.game_type, g.points, g.won, g.created_at from public.game_play_log g
         where g.user_id = v.id order by g.created_at desc limit 1000) x), '[]'::jsonb),
    'arkadasliklar', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select f.status, f.created_at, f.responded_at,
               case when f.requester_id = v.id then 'gonderdim' else 'aldim' end as yon,
               case when f.requester_id = v.id then f.addressee_alias else f.requester_alias end as karsi_taraf_rumuz
          from public.friendships f where f.requester_id = v.id or f.addressee_id = v.id
         order by f.created_at desc limit 1000) x), '[]'::jsonb),
    'davetler', jsonb_build_object(
      'davet_ettiklerim', (select count(*) from public.referrals where inviter_id = v.id),
      'odullenen', (select count(*) from public.referrals where inviter_id = v.id and rewarded_at is not null),
      'satin_alinan_ogeler', coalesce((select jsonb_agg(jsonb_build_object('oge', ip.item, 'bedel', ip.cost,
                                         'alinma', ip.created_at, 'kullanilma', ip.used_at))
                                         from public.invite_purchases ip where ip.user_id = v.id), '[]'::jsonb)),
    'sorun_bildirimlerim', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select r.category, r.message, r.contact_name, r.contact_email, r.contact_phone, r.status, r.created_at
          from public.problem_reports r where r.user_id = v.id order by r.created_at desc limit 1000) x), '[]'::jsonb),
    'bildirimler', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select n.kind, n.title, n.body, n.created_at, n.read_at from public.notifications n
         where n.user_id = v.id order by n.created_at desc limit 1000) x), '[]'::jsonb)
  );
end $$;

-- Moderatör rumuz kodları (#41, #1000): kim kullanıyor? Moderatör panelinde seçilir.
drop function if exists public.admin_alias_codes();
create or replace function public.admin_alias_codes()
returns table (code int, taken boolean, mine boolean, holder text)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select c, exists (select 1 from public.profiles p where p.alias_no = c),
           exists (select 1 from public.profiles p where p.alias_no = c and p.id = auth.uid()),
           (select p.full_name from public.profiles p where p.alias_no = c)
      from unnest(public._reserved_alias_nos()) as c
     order by c;
end $$;

-- Moderatör: ayrılmış rumuz kodunu seç (p_code boş = kodu bırak, yeniden rastgele rumuz al). Başka moderatörün
-- kullandığı kod seçilemez. Seçilen kod haftalık yenilemede değişmez; rumuz "Kat Görevlisi#41" olur.
create or replace function public.admin_set_alias_code(p_code int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_new record;
  v_alias text;
begin
  v := public._require_user();
  perform public._require_admin();
  perform pg_advisory_xact_lock(hashtext('alias_no'));
  if p_code is null then
    if v.alias_no = any (public._reserved_alias_nos()) then
      select * into v_new from public._new_identity(v.alias_no);
      update public.profiles set alias = v_new.o_alias, alias_no = v_new.o_no, alias_week = public.current_alias_week()
       where id = v.id returning alias into v_alias;
    else
      v_alias := v.alias;
    end if;
  else
    if p_code <> all (public._reserved_alias_nos()) then raise exception 'invalid_alias_code'; end if;
    if exists (select 1 from public.profiles p where p.alias_no = p_code and p.id <> v.id) then
      raise exception 'alias_code_taken';
    end if;
    update public.profiles set alias_no = p_code, alias = 'Kat Görevlisi#' || p_code,
                               alias_week = public.current_alias_week()
     where id = v.id returning alias into v_alias;
  end if;
  perform public._audit('alias_code', v.id, jsonb_build_object('code', p_code));
  return v_alias;
end $$;

-- Mesaj kutusundaki "+": alıcıyı adla bulup yazışmayı açar. "Lakap#145" / "#145" biçimi rumuzdur (herkes, bu
-- haftaki rumuz); diğer metinler yalnızca ARKADAŞLARIN gerçek adında aranır (büyük/küçük harf ve Türkçe harf
-- önemsiz). Eşleşme yoksa ya da aynı adlı birden çok arkadaş varsa yazışma açılmaz.
create or replace function public.dm_open_by_name(p_query text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  q text := btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  v_fid uuid;
  v_n int;
begin
  v := public._require_user();
  if char_length(q) not between 2 and 60 then raise exception 'dm_target_not_found'; end if;
  if q ~ '#[0-9]{1,5}$' then
    return public.dm_open(p_alias => q);
  end if;
  select count(*)::int, min(f.id::text)::uuid into v_n, v_fid
    from public.friendships f
    join public.profiles o on o.id = case when f.requester_id = v.id then f.addressee_id else f.requester_id end
   where f.status = 'accepted' and (f.requester_id = v.id or f.addressee_id = v.id)
     and o.banned_at is null and public._tr_fold(o.full_name) = public._tr_fold(q);
  if v_n = 0 then raise exception 'dm_target_not_found'; end if;
  if v_n > 1 then raise exception 'dm_name_ambiguous'; end if;
  return public.dm_open(p_friendship => v_fid);
end $$;

-- ---------------------------------------------------------------------
-- Hesap doğrulama (NVİ kimlik doğrulama servisi)
-- ---------------------------------------------------------------------
-- Akış: uygulama TC kimlik no, ad, soyad ve doğum yılını yalnızca Edge Function `verify-identity`'ye gönderir.
-- İşlev NVİ'ye (KPSPublic) bir kez sorar. TC kimlik numarası HİÇBİR YERE yazılmaz; yalnızca gizli bir anahtarla alınmış
-- geri çevrilemeyen özeti (HMAC) saklanır. Böylece aynı kişi ikinci bir hesabı doğrulayamaz. Doğrulanan hesabın gerçek
-- adı nüfustaki ad olur ve artık değiştirilemez. Aşağıdaki fonksiyonları yalnızca sunucu (service_role) çağırabilir.
create table if not exists public.identity_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tc_hash text not null unique check (char_length(tc_hash) = 64),
  verified_at timestamptz not null default now()
);
alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
-- Deneme kaydı: günde en çok 5 deneme (TC/ad tahmini yapılamasın). Deneme kaydında kimlik bilgisi yoktur.
create table if not exists public.identity_attempts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists identity_attempts_user_idx on public.identity_attempts (user_id, created_at desc);
alter table public.identity_attempts enable row level security;
revoke all on public.identity_attempts from anon, authenticated;

-- Doğrulama başlangıcı (NVİ'ye sormadan önce). Döner: 'ok', 'already' (zaten doğrulanmış), 'rate_limited',
-- 'used' (bu kimlik başka bir hesapta), 'not_allowed' (banlı / mekân hesabı).
create or replace function public.service_identity_start(p_user uuid, p_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  if p_hash is null or char_length(p_hash) <> 64 then raise exception 'invalid_hash'; end if;
  select * into v from public.profiles where id = p_user for update;
  if not found or v.banned_at is not null or v.role::text = 'sponsor' then return 'not_allowed'; end if;
  if v.identity_verified_at is not null then return 'already'; end if;
  if (select count(*) from public.identity_attempts
       where user_id = p_user and created_at > now() - interval '1 day') >= 5 then
    return 'rate_limited';
  end if;
  insert into public.identity_attempts (user_id) values (p_user);
  if exists (select 1 from public.identity_verifications where tc_hash = p_hash and user_id <> p_user) then
    return 'used';
  end if;
  return 'ok';
end $$;

-- NVİ "uyuşuyor" dediyse hesabı doğrular. p_full_name: nüfustaki ad soyad (Edge Function biçimlendirir).
-- Döner: 'ok', 'already', 'used'.
create or replace function public.service_identity_finish(p_user uuid, p_hash text, p_full_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_name text := left(btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), 60);
  v_n int;
begin
  if p_hash is null or char_length(p_hash) <> 64 then raise exception 'invalid_hash'; end if;
  if char_length(v_name) < 2 then raise exception 'invalid_name'; end if;
  select * into v from public.profiles where id = p_user for update;
  if not found or v.banned_at is not null or v.role::text = 'sponsor' then return 'not_allowed'; end if;
  if v.identity_verified_at is not null then return 'already'; end if;
  insert into public.identity_verifications (user_id, tc_hash) values (p_user, p_hash)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'used'; end if;
  update public.profiles set identity_verified_at = now(), full_name = v_name where id = p_user;
  perform public._notify(p_user, 'system', 'Hesabın doğrulandı',
    'Kimlik bilgilerin nüfus kaydıyla uyuştu. Akışta adının yanında sarı doğrulama tiki görünür.',
    jsonb_build_object('route', '/profile'));
  return 'ok';
end $$;

-- Profil resmi (yalnızca doğrulanmış hesap). Dosya önce Storage'daki "profile-photos" kutusuna <üye kimliği>/<dosya>
-- yoluna yüklenir (en çok 2 MB, jpg/png/webp; kutu kuralları zorlar). Moderatör onaylayınca arkadaşlara görünür.
-- p_path boş = resmi kaldır. Döner: önceki dosyanın yolu (uygulama eski dosyayı siler) ya da boş.
create or replace function public.set_profile_photo(p_path text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_old text;
begin
  v := public._require_writer(null);
  if v.role::text = 'sponsor' then raise exception 'forbidden'; end if;
  if v.identity_verified_at is null then raise exception 'not_identity_verified'; end if;
  select photo_path into v_old from public.profiles where id = v.id for update;
  if v_path is null then
    update public.profiles set photo_path = null, photo_status = null, photo_updated_at = now() where id = v.id;
    return v_old;
  end if;
  if v.photo_updated_at is not null and v.photo_updated_at > now() - interval '30 seconds' then
    raise exception 'rate_limited';
  end if;
  if v_path !~ ('^' || v.id::text || '/[A-Za-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$') then raise exception 'invalid_image'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = v_path) then
    raise exception 'invalid_image';
  end if;
  update public.profiles
     set photo_path = v_path, photo_updated_at = now(),
         photo_status = case when v.role = 'admin' then 'approved' else 'pending' end
   where id = v.id;
  return case when v_old is distinct from v_path then v_old end;
end $$;

-- Storage kuralı: yalnızca doğrulanmış, etkin üye kendi klasörüne yükler; klasörde en çok 3 dosya (eskiler silinir)
create or replace function public._profile_photo_slot_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(p_name))[1] = auth.uid()::text
     and cardinality(storage.foldername(p_name)) = 1
     and public._is_active_user()
     and exists (select 1 from public.profiles pr
                  where pr.id = auth.uid() and pr.identity_verified_at is not null and pr.role::text <> 'sponsor')
     and (select count(*) from storage.objects o
           where o.bucket_id = 'profile-photos' and (storage.foldername(o.name))[1] = auth.uid()::text) < 3;
$$;

-- Moderatör: onay bekleyen profil resimleri
drop function if exists public.admin_list_photo_approvals();
create or replace function public.admin_list_photo_approvals()
returns table (user_id uuid, full_name text, photo_path text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
    select pr.id, pr.full_name, pr.photo_path, pr.photo_updated_at
      from public.profiles pr
     where pr.photo_status = 'pending' and pr.photo_path is not null and pr.banned_at is null
     order by pr.photo_updated_at asc
     limit 100;
end $$;

-- Moderatör: profil resmini onayla / reddet. p_path: incelenen dosya (bu arada değiştiyse işlem yapılmaz). Üyeye bildirim gider.
create or replace function public.admin_review_photo(p_user uuid, p_path text, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok boolean := coalesce(p_approve, false);
begin
  perform public._require_admin();
  update public.profiles set photo_status = case when v_ok then 'approved' else 'rejected' end
   where id = p_user and photo_status = 'pending' and photo_path = p_path;
  if not found then raise exception 'request_not_found'; end if;
  perform public._audit(case when v_ok then 'photo_approve' else 'photo_reject' end, p_user, jsonb_build_object('path', p_path));
  perform public._notify(p_user, 'system',
    case when v_ok then 'Profil resmin onaylandı' else 'Profil resmin onaylanmadı' end,
    case when v_ok then 'Profil resmin artık arkadaşlarına, gerçek adının göründüğü yerlerde görünüyor.'
         else 'Profil resmin kurallara uymadığı için yayınlanmadı. Yüzünün net göründüğü başka bir resim ekleyebilirsin.' end,
    jsonb_build_object('route', '/profile'));
end $$;

-- ---------------------------------------------------------------------
-- Petek menüsü: petek akışı özeti ve "Oyun arayanlar"
-- ---------------------------------------------------------------------

-- Petek akışı özeti (petek menüsünde, akış düğmesinin solunda): yalnızca bu haftaki gönderi sayısı ve son gönderinin
-- zamanı. İçerik ve yazar hiç gelmez; bu yüzden peteğe yakın olmayan da görebilir.
create or replace function public.cell_feed_summary(p_q int, p_r int)
returns table (post_count int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select count(*)::int, max(p.created_at)
    from public.posts p
   where public._is_active_user()
     and p.cell_q = p_q and p.cell_r = p_r
     and p.thread_root is null and not p.is_hidden
     and public._post_live(p.created_at, p.event_id);
$$;

-- Oyun arayanlar: yan yana oynanan bir oyun için oyun arkadaşı arayan üyeler (petek başına liste). Kayıt için peteğin
-- içinde ya da hemen yanında olmak gerekir (telefonun bir kez aldığı konumun peteği; tam konum sunucuya gelmez).
-- Kayıt İstanbul saatiyle gece yarısına kadar geçerlidir. Her üyenin aynı anda tek kaydı olur (yenisi eskisinin yerine
-- geçer). Listede yalnızca bu haftaki rumuz görünür; gerçek ad hiç gelmez. Tablo doğrudan okunamaz.
create table if not exists public.game_seekers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,
  cell_q int not null,
  cell_r int not null,
  game_type text not null references public.game_types (key) on delete cascade,
  day date not null,
  created_at timestamptz not null default now()
);
create index if not exists game_seekers_cell_idx on public.game_seekers (cell_q, cell_r, day);
alter table public.game_seekers enable row level security;
revoke all on public.game_seekers from anon, authenticated;

drop function if exists public.game_seek_list(int, int);
create or replace function public.game_seek_list(p_q int, p_r int)
returns table (id uuid, alias text, avatar_index int, game_type text, game_title text, created_at timestamptz,
               is_mine boolean, is_friend boolean)
language sql stable security definer set search_path = public as $$
  select s.id, pr.alias, pr.avatar_index, s.game_type, gt.title, s.created_at, s.user_id = auth.uid(),
         public._is_friend(s.user_id)
    from public.game_seekers s
    join public.profiles pr on pr.id = s.user_id
    join public.game_types gt on gt.key = s.game_type
   where public._is_active_user()
     and s.cell_q = p_q and s.cell_r = p_r and s.day = public._map_day()
     and pr.banned_at is null and pr.role = 'user'
     and (s.user_id = auth.uid() or not public._blocked_between(auth.uid(), s.user_id))
   order by (s.user_id = auth.uid()) desc, s.created_at desc
   limit 100;
$$;

-- Oyun arayanlar listesinde seçilebilen oyunlar: açık olan ve yan yana oynanan oyunlar
create or replace function public.game_seek_games()
returns table (key text, title text)
language sql stable security definer set search_path = public as $$
  select gt.key, gt.title from public.game_types gt
   where public._is_active_user() and gt.enabled and gt.presence_required and not gt.remote
   order by gt.sort_order, gt.title;
$$;

-- Listeye adımı yazdır. p_q/p_r: listesi açılan petek; p_my_q/p_my_r: telefonun bulunduğu petek.
create or replace function public.game_seek_join(p_q int, p_r int, p_my_q int, p_my_r int, p_game_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_id uuid;
  v_last timestamptz;
begin
  v := public._require_writer(null);
  if v.role::text <> 'user' then raise exception 'seek_not_allowed'; end if;
  if not public._game_cell_given(p_my_q, p_my_r) then raise exception 'location_required'; end if;
  if not public._game_cell_given(p_q, p_r) or not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  if public._hex_dist(p_q, p_r, p_my_q, p_my_r) > greatest(0, public.setting_int('cell_feed_max_distance', 1)) then
    raise exception 'seek_too_far';
  end if;
  if not exists (select 1 from public.game_types
                  where key = p_game_type and enabled and presence_required and not remote) then
    raise exception 'invalid_game';
  end if;
  -- Art arda basışlar ve sürekli yer değiştirme: kayıt en çok 10 saniyede bir değişir
  select created_at into v_last from public.game_seekers where user_id = v.id for update;
  if v_last is not null and v_last > now() - interval '10 seconds' then raise exception 'rate_limited'; end if;
  -- Süresi geçmiş kayıtlar temizlenir
  delete from public.game_seekers where day < public._map_day();
  insert into public.game_seekers (user_id, cell_q, cell_r, game_type, day)
  values (v.id, p_q, p_r, p_game_type, public._map_day())
  on conflict (user_id) do update
     set id = gen_random_uuid(), cell_q = excluded.cell_q, cell_r = excluded.cell_r,
         game_type = excluded.game_type, day = excluded.day, created_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Listeden adımı sil
create or replace function public.game_seek_leave()
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  v := public._require_user();
  delete from public.game_seekers where user_id = v.id;
end $$;

-- Listedeki kişiye arkadaşlık isteği (kişinin kim olduğu isteği atana gösterilmez)
create or replace function public.game_seek_friend_request(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_alias text;
  v_avatar int;
begin
  perform public._require_user();
  select s.user_id, pr.alias, pr.avatar_index into v_target, v_alias, v_avatar
    from public.game_seekers s join public.profiles pr on pr.id = s.user_id
   where s.id = p_id and s.day = public._map_day();
  if not found then raise exception 'request_not_found'; end if;
  return public._send_friend_request(v_target, v_alias, v_avatar);
end $$;

-- Listedeki kişiyi engelle (gönderi yazarını engellemekle aynı)
create or replace function public.game_seek_block(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_target uuid;
  v_alias text;
begin
  v := public._require_user();
  select s.user_id, pr.alias into v_target, v_alias
    from public.game_seekers s join public.profiles pr on pr.id = s.user_id
   where s.id = p_id;
  if not found then raise exception 'request_not_found'; end if;
  if v_target = v.id then raise exception 'cannot_block_self'; end if;
  insert into public.user_blocks (blocker_id, blocked_id, blocked_alias)
  values (v.id, v_target, v_alias)
  on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friendships
   where (requester_id = v.id and addressee_id = v_target) or (requester_id = v_target and addressee_id = v.id);
end $$;

-- Davet puanı: ödüllenen davetler − harcanan
create or replace function public._invite_balance(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*)::int from public.referrals where inviter_id = p_user and rewarded_at is not null)
       - (select coalesce(sum(cost), 0)::int from public.invite_purchases where user_id = p_user);
$$;

create or replace function public._invite_cost(p_item text)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, case p_item when 'cell_name' then public.setting_int('invite_cost_cell_name', 2)
                                 when 'premium_month' then public.setting_int('invite_cost_premium', 3)
                                 when 'title' then public.setting_int('invite_cost_title', 1) end);
$$;

-- Davet edilen kişi puan kazandıkça: süre içinde eşiğe ulaştıysa davet edene 1 davet puanı (bir kez)
create or replace function public._invite_check_reward(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pts numeric;
  v_inviter uuid;
begin
  select points into v_pts from public.profiles where id = p_user and banned_at is null;
  if v_pts is null or v_pts < greatest(1, public.setting_int('invite_reward_points', 100)) then return; end if;
  update public.referrals set rewarded_at = now()
   where invitee_id = p_user and rewarded_at is null
     and created_at > now() - make_interval(days => greatest(1, public.setting_int('invite_reward_days', 30)))
  returning inviter_id into v_inviter;
  if v_inviter is not null then
    perform public._notify(v_inviter, 'system', 'Davet puanı kazandın!',
      'Davet ettiğin bir arkadaşın ' || public.setting_int('invite_reward_points', 100)
        || ' puana ulaştı. 1 davet puanı hesabına eklendi.', jsonb_build_object('invite', true));
  end if;
end $$;

-- Davet durumum: kod (yoksa üretilir), puanlar ve öğeler
create or replace function public.my_invite()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_code text;
  v_tries int := 0;
begin
  v := public._require_user();
  if v.role::text <> 'user' then raise exception 'forbidden'; end if;
  v_code := v.invite_code;
  while v_code is null loop
    v_tries := v_tries + 1;
    if v_tries > 10 then raise exception 'code_generation_failed'; end if;
    begin
      update public.profiles set invite_code = public._random_code(7) where id = v.id and invite_code is null;
      select invite_code into v_code from public.profiles where id = v.id;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  return jsonb_build_object(
    'code', v_code,
    'invited', (select count(*) from public.referrals where inviter_id = v.id),
    'earned', (select count(*) from public.referrals where inviter_id = v.id and rewarded_at is not null),
    'pending', (select count(*) from public.referrals where inviter_id = v.id and rewarded_at is null
                  and invitee_id is not null
                  and created_at > now() - make_interval(days => greatest(1, public.setting_int('invite_reward_days', 30)))),
    'balance', public._invite_balance(v.id),
    'reward_points', greatest(1, public.setting_int('invite_reward_points', 100)),
    'reward_days', greatest(1, public.setting_int('invite_reward_days', 30)),
    'can_redeem', v.created_at > now() - interval '7 days'
                  and not exists (select 1 from public.referrals where invitee_id = v.id),
    'download_url', coalesce((select s.value #>> '{}' from public.app_settings s where s.key = 'app_download_url'), ''),
    'items', (select jsonb_agg(jsonb_build_object(
                'item', i.item, 'cost', public._invite_cost(i.item),
                'owned', ip.user_id is not null, 'used', ip.used_at is not null, 'detail', ip.used_detail)
                order by i.ord)
                from (values ('cell_name', 1), ('premium_month', 2), ('title', 3)) as i(item, ord)
                left join public.invite_purchases ip on ip.user_id = v.id and ip.item = i.item));
end $$;

-- Kayıttan sonra davet kodu girme (yalnızca kayıttan sonraki 7 gün içinde ve bir kez)
create or replace function public.redeem_invite_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_inviter uuid;
begin
  v := public._require_user();
  if v.role::text <> 'user' then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('invite:' || v.id::text));
  if v.created_at <= now() - interval '7 days' then raise exception 'invite_too_late'; end if;
  if exists (select 1 from public.referrals where invitee_id = v.id) then raise exception 'invite_already_used'; end if;
  select p.id into v_inviter from public.profiles p
   where p.invite_code = upper(btrim(coalesce(p_code, ''))) and p.banned_at is null and p.id <> v.id;
  -- Karşılıklı davet olmaz: davet ettiğin kişi seni davet etmiş sayılamaz
  if v_inviter is null
     or exists (select 1 from public.referrals where inviter_id = v.id and invitee_id = v_inviter) then
    raise exception 'invite_not_found';
  end if;
  insert into public.referrals (inviter_id, invitee_id) values (v_inviter, v.id);
  perform public._invite_check_reward(v.id);
end $$;

-- Davet puanıyla öğe al (her öğe hesap başına bir kez)
create or replace function public.invite_buy(p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_cost int;
  v_until timestamptz;
begin
  v := public._require_user();
  if v.role::text <> 'user' then raise exception 'forbidden'; end if;
  if p_item is null or p_item not in ('cell_name', 'premium_month', 'title') then raise exception 'invalid_item'; end if;
  perform pg_advisory_xact_lock(hashtext('invite:' || v.id::text));
  if exists (select 1 from public.invite_purchases where user_id = v.id and item = p_item) then
    raise exception 'already_bought';
  end if;
  v_cost := public._invite_cost(p_item);
  if public._invite_balance(v.id) < v_cost then raise exception 'not_enough_invite_points'; end if;
  insert into public.invite_purchases (user_id, item, cost) values (v.id, p_item, v_cost);
  if p_item = 'premium_month' then
    update public.profiles
       set premium_until = greatest(coalesce(premium_until, now()), now()) + interval '1 month',
           premium_source = 'achievement'
     where id = v.id
     returning premium_until into v_until;
    perform public._notify(v.id, 'system', '1 aylık abonelik tanımlandı',
      'Davet puanınla aldığın 1 aylık abonelik hesabına eklendi. Bitiş: '
        || to_char(v_until at time zone 'Europe/Istanbul', 'DD.MM.YYYY'), '{}'::jsonb);
  end if;
end $$;

-- Petek adı verme hakkını kullan: daha önce ad verilmemiş (moderatör ya da başka üye) bir karaya ad verilir.
create or replace function public.invite_use_cell_name(p_q int, p_r int, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  pur public.invite_purchases;
  v_name text := lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', '-', 'g')));
begin
  v := public._require_user();
  perform pg_advisory_xact_lock(hashtext('invite:' || v.id::text));
  select * into pur from public.invite_purchases where user_id = v.id and item = 'cell_name' for update;
  if not found then raise exception 'item_not_owned'; end if;
  if pur.used_at is not null then raise exception 'item_used'; end if;
  if p_q is null or p_r is null or not public._map_cell_ok(p_q, p_r) then raise exception 'invalid_cell'; end if;
  if exists (select 1 from public.map_cell_names where q = p_q and r = p_r) then raise exception 'cell_already_named'; end if;
  if char_length(v_name) not between 3 and 40
     or v_name !~ '^[a-zçğıöşüâîû0-9]+(-[a-zçğıöşüâîû0-9]+)*$'
     or public._is_reserved_name(v_name)
     or public._has_contact_info(replace(v_name, '-', ' '))
     or public._mask_profanity(replace(v_name, '-', ' ')) <> replace(v_name, '-', ' ') then
    raise exception 'invalid_cell_name';
  end if;
  if exists (select 1 from public.map_cell_names where name = v_name) then raise exception 'cell_name_taken'; end if;
  insert into public.map_cell_names (q, r, name, updated_by) values (p_q, p_r, v_name, v.id);
  update public.invite_purchases
     set used_at = now(), used_detail = jsonb_build_object('q', p_q, 'r', p_r, 'name', v_name)
   where user_id = v.id and item = 'cell_name';
  return v_name;
end $$;

insert into public.app_settings (key, value, description) values
  ('invite_reward_points', '100', 'Davet: davet edilen kişinin, davet edene 1 davet puanı kazandırması için ulaşması gereken toplam puan'),
  ('invite_reward_days', '30', 'Davet: davet edilen kişinin bu puana ulaşması için gün sayısı (kod girildikten sonra)'),
  ('invite_cost_cell_name', '2', 'Davet mağazası: petek adı verme hakkı (davet puanı)'),
  ('invite_cost_premium', '3', 'Davet mağazası: 1 aylık abonelik (davet puanı)'),
  ('invite_cost_title', '1', 'Davet mağazası: Elçi unvanı (davet puanı)'),
  ('website_url', '""', 'Profil > Web sitesi düğmesinin açacağı adres (ör. https://ornek.com). Boşken "yakında" yazar.'),
  ('app_download_url', '""', 'Davet mesajında paylaşılacak uygulama indirme bağlantısı (mağaza sayfası). Boşken yalnızca kod paylaşılır.')
on conflict (key) do nothing;

-- Gizlilik politikası ve Sıkça Sorulan Sorular (Profil > Uygulama). "## " bölüm başlığı, "• " madde olarak görünür.
-- Yalnızca boşsa yazılır; moderatörün sonradan değiştirdiği metne dokunulmaz.
insert into public.app_settings (key, value, description) values
  ('legal_privacy', to_jsonb($privacy$## Gizlilik Politikası
Bu politika, 41. Kat Sosyal uygulamasını kullanırken hangi bilgilerinin işlendiğini, neden işlendiğini ve hangi haklara sahip olduğunu anlatır. Ayrıntılı yasal bilgi için KVKK aydınlatma metnine de bakabilirsin.

## 1. Veri sorumlusu
• Ad / unvan: [VERİ SORUMLUSUNUN ADI]
• Adres: [ADRES]
• E-posta: [E-POSTA ADRESİ]

## 2. Hangi bilgileri işliyoruz?
• Hesap bilgileri: gerçek adın, kullanıcı adın ve kayıt tarihin. Şifren ve kurtarma kelimelerin yalnızca özet (şifrelenmiş) olarak saklanır; kimse açık hâlini göremez.
• Telefon bilgisi: her telefondan yalnızca bir hesap açılabilmesi için telefon kimliğinin özeti; bildirim izni verdiysen bildirim adresi.
• Konum: yalnızca sen bir işlem yaparken (gönderiye yer eklemek, oyuna girmek, etkinlik kodu yazmak, petek bildirmek) bir kez alınır. Sunucuya enlem/boylam değil, yalnızca bulunduğun peteğin numarası gider. Konumun sürekli takip edilmez.
• İçerikler: gönderilerin, yorumların, özel mesajların, açtığın etkinlikler ve katılımların, oyun sonuçların.
• Puan, seviye, başarım ve sıralama kayıtların; arkadaşlıkların; davet ve sorun bildirimlerin.
• Abonelik: satın alma Apple / Google mağazası üzerinden yapılır; kart bilgin bize gelmez, yalnızca aboneliğinin bitiş tarihi bilinir.

## 3. Bu bilgileri neden kullanıyoruz?
• Hesabını açmak, girişini güvenli tutmak ve sahte hesapları önlemek için.
• Akış, etkinlik, oyun, harita ve puan sistemini çalıştırmak için.
• Kurallara aykırı içerik ve hileli puan kazanımını tespit etmek için.
• Sana bildirim göndermek için (bildirim türlerini Profil > Bildirim ve konum bölümünden seçebilirsin).
• Sorun bildirimlerine dönüş yapmak için.

## 4. Kimler görebilir?
• Akışta yalnızca haftalık rumuzun görünür. Gerçek adın arkadaşlarına, sıralamalarda ve etkinliklerde görünür.
• Moderatörler, kurallara uyulup uyulmadığını denetlemek için gerekli kayıtları görebilir.
• Hizmet aldığımız şirketler: veritabanı ve sunucu (Supabase), abonelik yönetimi (RevenueCat), mağaza ve bildirim altyapısı (Apple, Google). Bu şirketler bilgilerini yalnızca bize hizmet vermek için işler.
• Bilgilerin reklam amacıyla satılmaz ve paylaşılmaz.

## 5. Ne kadar süre saklıyoruz?
• Hesabın açık olduğu sürece saklanır.
• Hesabını sildiğinde kişisel bilgilerin silinir ya da kimseyle eşleştirilemeyecek biçimde anonim hâle getirilir. Yasaların saklamamızı zorunlu tuttuğu kayıtlar bu süre boyunca saklanır.
• Haritadaki anonim yoğunluk kayıtları 30 gün sonra kendiliğinden silinir.

## 6. Yurt dışına aktarım
Sunucularımız [SUNUCU BÖLGESİ] bölgesindedir. Bilgilerin bu nedenle yurt dışındaki sunucularda işlenebilir. Aktarım KVKK'ya uygun olarak yapılır.

## 7. Hakların
• Hangi bilgilerinin işlendiğini öğrenebilir, bir kopyasını isteyebilirsin: Profil > Kişisel Verilerim & Rapor > Resmi Veri Dosyasını İndir.
• Açık rızalarını istediğin an aynı ekrandan kapatıp açabilirsin.
• Yanlış bilgilerin düzeltilmesini, bilgilerinin silinmesini isteyebilirsin. Hesabını Profil > Hesabım > Hesabımı sil ile kendin silebilirsin.
• Diğer talepler için veri sorumlusuna e-posta ile başvurabilirsin.

## 8. Çocuklar
Uygulama 18 yaşından küçükler için tasarlanmamıştır.

## 9. Değişiklikler
Bu politikada değişiklik olursa uygulama içinden duyururuz. Güncel metin her zaman Profil > Uygulama > Gizlilik Politikası bölümündedir.

Son güncelleme: [TARİH]$privacy$::text), 'Gizlilik politikası (Profil > Uygulama)'),
  ('faq', to_jsonb($faq$## Rumuz nedir, neden her hafta değişiyor?
Akışta gerçek adın değil, her pazartesi yenilenen rastgele bir rumuz görünür. Böylece rahatça yazabilirsin. Rumuzunu Profil sekmesinde görebilirsin; başkaları senin kim olduğunu bilemez.

## Gerçek adımı kimler görür?
Yalnızca arkadaşların, sıralamalar ve katıldığın / açtığın etkinlikler. Akışta gerçek adın hiçbir zaman görünmez.

## Nasıl puan kazanırım?
Etkinliklere katılıp yerinde verilen kodu yazarak, etkinlik açarak, yan yana oyunlar ve Bilgi Yarışması oynayarak ve hazine bularak. Ayrıntılar Profil > Uygulama > Yarışma kuralları bölümünde.

## Seviyeler ne işe yarıyor?
Toplam puanın arttıkça seviye atlarsın. Seviye 2'de +1 oyun hakkı, Seviye 3'te +1 etkinlik hakkı, Seviye 4'te Bilgi Yarışması puanı ×1,2, Seviye 5'te Bilgi Yarışması'nda sınırsız can kazanırsın. Ödüller her ay yenilenir, kullanılmayan haklar sonraki aya geçmez.

## Etkinlik kodu nedir?
Etkinliği açan kişi, etkinlik yerinde katılımcılara bir kod söyler. Kodu uygulamaya yazınca katılımın doğrulanır. Puan, etkinlikte en az 4 kişinin katılımı doğrulanınca yazılır.

## Neden konumumu istiyor?
Yalnızca yan yana oynanan bir oyuna girerken, etkinlik kodu yazarken, gönderiye yer eklerken ya da petek bildirirken bir kez. Tam konumun sunucuya gönderilmez ve kaydedilmez; yalnızca bulunduğun peteğin numarası gider.

## Abonelik bana ne kazandırır?
Daha çok etkinlik ve oyun açma hakkı, özel mesaj başlatma ve 41. Kat Özel ücretli etkinliklere ücretsiz katılım. Abonelik puanını ya da hediye kazanma şansını artırmaz.

## Aboneliğimi nasıl iptal ederim?
Telefonundaki mağaza hesabının (App Store / Google Play) abonelikler bölümünden. Profil > Hesabı Yükselt ekranında "Abonelikleri aç" düğmesi seni oraya götürür.

## Arkadaşımı nasıl davet ederim?
Profil > Arkadaşlarını davet et ekranındaki kodunu paylaş. Arkadaşın kodla kayıt olur ve 30 gün içinde 100 puana ulaşırsa sana 1 davet puanı yazılır. Davet puanlarınla petek adı verme hakkı, 1 aylık abonelik ya da Elçi unvanı alabilirsin.

## Şifremi unuttum, ne yapmalıyım?
Giriş ekranındaki "Şifremi unuttum" ile kayıt olurken verilen 12 kurtarma kelimesini yazarak yeni şifre belirleyebilirsin. Kelimeleri kaybettiysen Profil > Uygulama > Bize ulaşın bölümünden bize yaz.

## Neden telefon başına bir hesap?
Sahte hesaplarla puan toplanmasını ve kuralların aşılmasını önlemek için. Telefonunu değiştirirsen eski hesabınla giriş yapabilirsin.

## Bir sorunu nasıl bildiririm?
Profil > Bir Sorun Bildir ile sorununu ve iletişim bilgilerini gönderebilirsin. Moderatörlerimiz inceleyip dönüş yapar.

## Hesabımı nasıl silerim?
Profil > Hesabım > Hesabımı sil. Silinen hesap geri getirilemez; puanların ve hakların da silinir.$faq$::text), 'Sıkça sorulan sorular (Profil > Uygulama)')
on conflict (key) do nothing;

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.levels, public.app_settings, public.game_types, public.events, public.event_registrations
  to authenticated;

-- Oda kodları hiç kimse tarafından doğrudan okunamaz (oda sahibi bile fonksiyonla görür)
revoke all on public.room_codes from anon, authenticated;
-- Etkinlik katılım kodları ve yanlış kod denemeleri de hiç kimse tarafından doğrudan okunamaz
revoke all on public.event_codes, public.event_code_failures from anon, authenticated;
-- Etkinlik yorumlarını yalnızca moderatör doğrudan okuyabilir (şikayet incelemesi için); üyeler fonksiyonla okur
drop policy if exists event_comments_admin_select on public.event_comments;
create policy event_comments_admin_select on public.event_comments for select to authenticated
  using (public.is_admin());
revoke all on public.room_join_failures from anon, authenticated;
revoke all on public.event_close_requests from anon, authenticated;

-- Harita tabloları hiç kimse tarafından doğrudan okunamaz: kimin nerede olduğu dışarı çıkmaz
revoke all on public.places, public.map_land_ranges, public.map_signals from anon, authenticated;

-- Sponsor tabloları doğrudan okunamaz: yalnızca 5g fonksiyonları kullanır (yorumlar için moderatör politikası ayrı)
revoke all on public.venues, public.sponsor_codes, public.sponsor_code_failures, public.sponsor_credits,
  public.venue_visits from anon, authenticated;

-- Ayrıcalıklar tablosu doğrudan okunamaz: ayrıntılar yalnızca list_perks() ile, premium kontrolünden sonra gelir
revoke all on public.perks from anon, authenticated;

-- Petek adları ve ilçe sıfırlama günleri doğrudan okunamaz: yalnızca fonksiyonlar kullanır
revoke all on public.map_cell_names, public.map_district_reset from anon, authenticated;
revoke all on public.room_invites, public.event_teams, public.event_team_members, public.event_team_invites
  from anon, authenticated;
revoke all on public.post_mentions, public.post_reactions from anon, authenticated;
revoke all on public.event_leader_applications from anon, authenticated;

-- Hesap güvenliği ve bildirim tabloları doğrudan okunamaz: yalnızca 5h fonksiyonları kullanır
revoke all on public.account_recovery, public.recovery_failures, public.device_accounts,
  public.notifications, public.announcements, public.announcement_reads from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS kurallarının içinde kullanılan yardımcılar
grant execute on function public.is_admin() to authenticated;
grant execute on function public._is_active_user() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_host(uuid) to authenticated;
grant execute on function public.post_blocked_by_me(uuid) to authenticated;
grant execute on function public.comment_blocked_by_me(uuid) to authenticated;

-- Kullanıcı fonksiyonları
grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
-- Hesap ve bildirim kutusu (5h). İlk üçü giriş yapmadan da çağrılır (kayıt kontrolü, şifre sıfırlama, metinler).
grant execute on function public.check_signup(text, text) to anon, authenticated;
grant execute on function public.recover_account(text, text, text) to anon, authenticated;
grant execute on function public.app_text(text) to anon, authenticated;
grant execute on function public.claim_session() to authenticated;
grant execute on function public.my_account_status() to authenticated;
grant execute on function public.create_recovery_phrase(text) to authenticated;
grant execute on function public.confirm_recovery_phrase() to authenticated;
grant execute on function public.list_my_notifications() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.delete_my_notification(uuid) to authenticated;
grant execute on function public.admin_send_message(uuid, text, text) to authenticated;
grant execute on function public.admin_create_announcement(text, text) to authenticated;
grant execute on function public.admin_list_announcements() to authenticated;
grant execute on function public.admin_set_announcement_active(uuid, boolean) to authenticated;
grant execute on function public.create_post(text, text, uuid, int, int, int, int, uuid) to authenticated;
grant execute on function public.alias_profile(uuid, uuid, text) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;
grant execute on function public.share_event_to_feed(uuid, text) to authenticated;
grant execute on function public.map_status() to authenticated;
grant execute on function public.map_density() to authenticated;
grant execute on function public.map_report_game(uuid, int, int) to authenticated;
grant execute on function public.search_places(text, int) to authenticated;
grant execute on function public.places_near_cell(int, int, int) to authenticated;
grant execute on function public.create_comment(uuid, text) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.block_author_of_post(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.unblock(uuid) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.cancel_event_registration(uuid) to authenticated;
grant execute on function public.join_room(text, uuid, int, int) to authenticated;
grant execute on function public.get_room_code(uuid) to authenticated;
grant execute on function public.leave_all_rooms() to authenticated;
grant execute on function public.room_heartbeat(uuid) to authenticated;
grant execute on function public.room_host(uuid) to authenticated;
grant execute on function public.my_hosted_rooms(text) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.send_friend_request_for_post(uuid) to authenticated;
grant execute on function public.send_friend_request_for_comment(uuid) to authenticated;
grant execute on function public.send_friend_request_by_code(text) to authenticated;
grant execute on function public.send_friend_request_for_event_comment(uuid) to authenticated;
grant execute on function public.my_friend_code() to authenticated;
grant execute on function public.respond_friend_request(uuid, text) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friendships() to authenticated;
grant execute on function public.my_friend_request_count() to authenticated;
grant execute on function public.get_leaderboard(int) to authenticated;
grant execute on function public.ensure_my_alias() to authenticated;
grant execute on function public.my_quota() to authenticated;
grant execute on function public.list_events() to authenticated;
grant execute on function public.create_event(text, text, text, timestamptz, int, numeric, text, int, int, int, boolean) to authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
grant execute on function public.request_event_close(uuid, text) to authenticated;
grant execute on function public.admin_list_close_requests(text) to authenticated;
grant execute on function public.admin_resolve_close_request(uuid, boolean, text) to authenticated;
grant execute on function public.my_notice_counts() to authenticated;
grant execute on function public.create_room(text, uuid, text, int, int, int, int, text) to authenticated;
grant execute on function public.set_room_status(uuid, text) to authenticated;
grant execute on function public.list_feed(timestamptz, int, boolean, text, boolean, int, int, int, int, boolean, uuid) to authenticated;
grant execute on function public.feed_districts() to authenticated;
grant execute on function public.list_open_rooms(text) to authenticated;
grant execute on function public.list_comments(uuid) to authenticated;
grant execute on function public.delete_my_post(uuid) to authenticated;
grant execute on function public.delete_my_comment(uuid) to authenticated;
grant execute on function public.block_author_of_comment(uuid) to authenticated;
grant execute on function public.get_monthly_leaderboard(int, int) to authenticated;
grant execute on function public.my_game_stats() to authenticated;
grant execute on function public.my_achievement_stats() to authenticated;
grant execute on function public.my_event_raffles() to authenticated;
grant execute on function public.dm_open(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.dm_list() to authenticated;
grant execute on function public.dm_unread_count() to authenticated;
grant execute on function public.dm_view(uuid) to authenticated;
grant execute on function public.dm_send(uuid, text) to authenticated;
grant execute on function public.dm_block(uuid) to authenticated;
-- Özel mesajları moderatör yalnızca ŞİKAYET EDİLMİŞSE okuyabilir (şikayet incelemesi); yazışmaların geri kalanı kapalıdır
revoke all on public.dm_threads, public.dm_messages from anon, authenticated;
grant select on public.dm_messages to authenticated;
drop policy if exists dm_messages_admin_reported on public.dm_messages;
create policy dm_messages_admin_reported on public.dm_messages for select to authenticated
  using (public.is_admin() and exists (select 1 from public.reports r where r.target_type = 'dm' and r.target_id = dm_messages.id));
grant execute on function public.vv_start(uuid) to authenticated;
grant execute on function public.vv_ready(uuid) to authenticated;
grant execute on function public.vv_begin_night(uuid) to authenticated;
grant execute on function public.vv_night_action(uuid, uuid) to authenticated;
grant execute on function public.vv_end_night(uuid) to authenticated;
grant execute on function public.vv_begin_vote(uuid) to authenticated;
grant execute on function public.vv_cast_vote(uuid, uuid) to authenticated;
grant execute on function public.vv_end_vote(uuid) to authenticated;
grant execute on function public.vv_view(uuid) to authenticated;
grant execute on function public.vv_whisper(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.vv_dead_say(uuid, text) to authenticated;
revoke all on public.vv_dead_chat from anon, authenticated;
grant select on public.vv_dead_chat to authenticated;
drop policy if exists vv_dead_chat_admin_select on public.vv_dead_chat;
create policy vv_dead_chat_admin_select on public.vv_dead_chat for select to authenticated using (public.is_admin());
-- Fısıltılar yalnızca vv_view ve vv_whisper ile; tabloyu yalnızca moderatör (şikayet incelemesi) doğrudan okur
revoke all on public.vv_whispers from anon, authenticated;
grant select on public.vv_whispers to authenticated;
drop policy if exists vv_whispers_admin_select on public.vv_whispers;
create policy vv_whispers_admin_select on public.vv_whispers for select to authenticated using (public.is_admin());

-- Moderatör fonksiyonları (içeride ayrıca moderatör kontrolü yapılır)
grant execute on function public.admin_get_post_author(uuid) to authenticated;
grant execute on function public.admin_get_comment_author(uuid) to authenticated;
grant execute on function public.admin_mute_user(uuid, int, text) to authenticated;
grant execute on function public.admin_unmute_user(uuid) to authenticated;
grant execute on function public.admin_ban_user(uuid, text) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_set_hidden(text, uuid, boolean) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.my_event_code(uuid) to authenticated;
grant execute on function public.regenerate_event_code(uuid) to authenticated;
grant execute on function public.verify_event_attendance(uuid, text, int, int) to authenticated;
grant execute on function public.toggle_event_like(uuid) to authenticated;
grant execute on function public.add_event_comment(uuid, text) to authenticated;
grant execute on function public.list_event_comments(uuid) to authenticated;
grant execute on function public.delete_my_event_comment(uuid) to authenticated;
grant execute on function public.my_bubble_skins() to authenticated;
grant execute on function public.set_bubble_skin(text) to authenticated;
grant execute on function public.get_game_leaderboard(text, int, int) to authenticated;
grant execute on function public.ranking_info() to authenticated;
grant execute on function public.my_titles() to authenticated;
grant execute on function public.get_game_champion(text) to authenticated;
grant execute on function public.my_game_result(uuid) to authenticated;
grant execute on function public.my_points_this_month() to authenticated;
grant execute on function public.admin_grant_premium(uuid, public.package_type) to authenticated;
grant execute on function public.list_perks() to authenticated;
grant execute on function public.admin_save_perk(uuid, text, text, text, text, text, date, boolean, int) to authenticated;
grant execute on function public.admin_delete_perk(uuid) to authenticated;
grant execute on function public.admin_revoke_premium(uuid) to authenticated;
grant execute on function public.get_venue(uuid) to authenticated;
grant execute on function public.list_venue_reviews(uuid) to authenticated;
grant execute on function public.save_venue_review(uuid, int, text) to authenticated;
grant execute on function public.delete_my_venue_review(uuid) to authenticated;
grant execute on function public.create_sponsor_code() to authenticated;
grant execute on function public.my_sponsor_panel() to authenticated;
grant execute on function public.redeem_sponsor_code(text) to authenticated;
grant execute on function public.list_map_venues() to authenticated;
grant execute on function public.admin_list_sponsors() to authenticated;
grant execute on function public.admin_save_venue(uuid, text, text, text, text, int, int, int) to authenticated;
grant execute on function public.admin_remove_venue_from_map(uuid) to authenticated;
grant execute on function public.admin_set_venue_image(uuid, text) to authenticated;
grant execute on function public.set_game_invites(boolean) to authenticated;
grant execute on function public.room_invite_targets(uuid) to authenticated;
grant execute on function public.send_room_invites(uuid, uuid[], boolean) to authenticated;
grant execute on function public.accept_room_invite(uuid) to authenticated;
grant execute on function public.room_invite_message(uuid, text) to authenticated;
grant execute on function public.room_invite_thread(uuid) to authenticated;
grant execute on function public.my_room_invite(uuid) to authenticated;
grant execute on function public.room_accepted_invites(uuid) to authenticated;
revoke all on public.room_invite_msgs from anon, authenticated;
grant execute on function public.set_team_seeking(uuid, boolean) to authenticated;
grant execute on function public.list_team_seekers(uuid) to authenticated;
grant execute on function public.send_team_invite(uuid, uuid) to authenticated;
grant execute on function public.respond_team_invite(uuid, boolean, text) to authenticated;
grant execute on function public.leave_event_team(uuid) to authenticated;
grant execute on function public.get_last_week_leaderboard(text, int) to authenticated;
grant execute on function public.apply_event_leader(text, text, text[], text) to authenticated;
grant execute on function public.admin_list_leader_applications(text) to authenticated;
grant execute on function public.admin_resolve_leader_application(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_event_leader(uuid, boolean) to authenticated;
grant execute on function public.set_event_image(uuid, text) to authenticated;
grant execute on function public.admin_list_event_approvals() to authenticated;
grant execute on function public.admin_review_event(uuid, text, boolean, text) to authenticated;
grant execute on function public.game_player_counts() to authenticated;
grant execute on function public.list_treasures() to authenticated;
grant execute on function public.my_treasure_status() to authenticated;
grant execute on function public.redeem_treasure(text, int, int) to authenticated;
grant execute on function public.admin_create_treasure(int, int, text, text, timestamptz) to authenticated;
grant execute on function public.admin_remove_treasure(uuid) to authenticated;
grant execute on function public.admin_list_treasures(text) to authenticated;
grant execute on function public.admin_mark_treasures_seen() to authenticated;
grant execute on function public._event_image_slot_ok(text) to authenticated;
revoke all on public.treasures, public.treasure_failures from anon, authenticated;
revoke all on public.cell_name_candidates, public.cell_candidate_runs from anon, authenticated;
grant execute on function public.admin_set_treasure_images(uuid, text[]) to authenticated;
grant execute on function public.get_concert_code(uuid) to authenticated;
grant execute on function public.rate_event(uuid, int) to authenticated;
grant execute on function public.host_close_event(uuid, int, int) to authenticated;
grant execute on function public.event_share_wait(uuid) to authenticated;
grant execute on function public.admin_set_event_tag(uuid, text) to authenticated;
grant execute on function public.admin_set_event_official(uuid, boolean) to authenticated;
grant execute on function public.get_notification_prefs() to authenticated;
grant execute on function public.set_notification_prefs(jsonb) to authenticated;
grant execute on function public.my_new_notifications(timestamptz) to authenticated;
grant execute on function public.my_event_reminders() to authenticated;
grant execute on function public.get_mod_thread(uuid) to authenticated;
grant execute on function public.reply_mod_thread(uuid, text) to authenticated;
grant execute on function public.list_my_mod_threads() to authenticated;
grant execute on function public.admin_list_mod_threads() to authenticated;
grant execute on function public.admin_end_mod_thread(uuid) to authenticated;
revoke all on public.notification_prefs, public.mod_threads, public.mod_thread_messages from anon, authenticated;
-- Bilgi Yarışması tabloları doğrudan okunamaz/yazılamaz; yalnızca 5q fonksiyonları. Sohbeti yalnızca moderatör okur.
revoke all on public.quiz_questions, public.quiz_queue, public.quiz_matches, public.quiz_match_players,
  public.quiz_answers, public.quiz_seen, public.quiz_best, public.quiz_chat from anon, authenticated;
grant select on public.quiz_chat to authenticated;
drop policy if exists quiz_chat_admin_select on public.quiz_chat;
create policy quiz_chat_admin_select on public.quiz_chat for select to authenticated using (public.is_admin());
grant execute on function public.quiz_lobby() to authenticated;
grant execute on function public.quiz_find_match(int, int) to authenticated;
grant execute on function public.quiz_cancel_search() to authenticated;
grant execute on function public.quiz_start_solo(int, int) to authenticated;
grant execute on function public.quiz_state(uuid) to authenticated;
grant execute on function public.quiz_answer(uuid, int, int) to authenticated;
grant execute on function public.quiz_leave(uuid) to authenticated;
grant execute on function public.quiz_chat_send(uuid, text) to authenticated;
grant execute on function public.quiz_block_opponent(uuid) to authenticated;
grant execute on function public.admin_list_quiz_questions(text, text, int, int) to authenticated;
grant execute on function public.admin_save_quiz_question(uuid, text, text, text[], int, int) to authenticated;
grant execute on function public.quiz_solo_pick_chest(uuid, int) to authenticated;
grant execute on function public.quiz_solo_state(uuid) to authenticated;
grant execute on function public.quiz_solo_answer(uuid, int, int) to authenticated;
grant execute on function public.quiz_solo_joker(uuid, text) to authenticated;
grant execute on function public.quiz_solo_leave(uuid) to authenticated;
grant execute on function public.quiz_solo_leaderboard(int) to authenticated;
revoke all on public.quiz_trades from anon, authenticated;
grant execute on function public.quiz_arena_create_room(text, int, int) to authenticated;
grant execute on function public.quiz_arena_join_room(text, text, int, int) to authenticated;
grant execute on function public.quiz_arena_ready(uuid) to authenticated;
grant execute on function public.quiz_ping() to authenticated;
grant execute on function public.quiz_side_start(text, text) to authenticated;
grant execute on function public.quiz_side_state(uuid) to authenticated;
grant execute on function public.quiz_side_answer(uuid, int, int, int) to authenticated;
grant execute on function public.quiz_side_vote(uuid, int, text) to authenticated;
grant execute on function public.quiz_side_leave(uuid) to authenticated;
revoke all on public.quiz_side_games from anon, authenticated;
revoke all on public.quiz_presence from anon, authenticated;
grant execute on function public.quiz_online_leaderboard(int, int) to authenticated;
grant execute on function public.admin_quiz_online_winners(int) to authenticated;
grant execute on function public.admin_quiz_grant_online_reward(uuid, int) to authenticated;
revoke all on public.quiz_code_attempts, public.quiz_online_rewards from anon, authenticated;
grant execute on function public.quiz_arena_set_color(uuid, text) to authenticated;
grant execute on function public.quiz_arena_kick(uuid, int) to authenticated;
grant execute on function public.quiz_arena_start(uuid) to authenticated;
grant execute on function public.quiz_arena_state(uuid) to authenticated;
grant execute on function public.quiz_arena_vote(uuid, text) to authenticated;
grant execute on function public.quiz_arena_answer(uuid, int, int) to authenticated;
grant execute on function public.quiz_arena_use_card(uuid, int, int) to authenticated;
grant execute on function public.quiz_arena_open_chest(uuid, int) to authenticated;
grant execute on function public.quiz_arena_trade_offer(uuid, int, int) to authenticated;
grant execute on function public.quiz_arena_trade_respond(uuid, boolean) to authenticated;
grant execute on function public.quiz_arena_leave(uuid) to authenticated;
grant execute on function public.quiz_block_player(uuid, int) to authenticated;
revoke all on public.quiz_lives, public.quiz_solo_runs from anon, authenticated;
grant execute on function public.admin_set_quiz_question_active(uuid, boolean) to authenticated;
grant execute on function public.my_attended_events() to authenticated;
revoke all on public.event_ratings from anon, authenticated;
grant execute on function public.cell_leaders(int, int) to authenticated;
grant execute on function public.admin_refresh_cell_candidates() to authenticated;
grant execute on function public.admin_list_cell_candidates() to authenticated;
grant execute on function public.admin_mark_cell_candidates_seen() to authenticated;
revoke all on function public._award_event_create(uuid) from public, anon, authenticated;
grant execute on function public.map_checkin(int, int) to authenticated;
grant execute on function public.map_presence(int, int) to authenticated;
grant execute on function public.list_cell_names() to authenticated;
grant execute on function public.admin_set_cell_name(int, int, text) to authenticated;
grant execute on function public.admin_award_points(uuid, int, text, uuid) to authenticated;
grant execute on function public.admin_draw_raffle(uuid) to authenticated;

-- Yalnızca sunucu tarafı (Edge Function) çağırır; uygulamadaki kullanıcılar çağıramaz
grant execute on function public.service_set_store_premium(uuid, timestamptz) to service_role;
grant execute on function public.service_identity_start(uuid, text) to service_role;
grant execute on function public.service_identity_finish(uuid, text, text) to service_role;
grant execute on function public.set_profile_photo(text) to authenticated;
grant execute on function public._profile_photo_slot_ok(text) to authenticated;
grant execute on function public.admin_list_photo_approvals() to authenticated;
grant execute on function public.admin_review_photo(uuid, text, boolean) to authenticated;

-- Profil resimleri (yalnızca doğrulanmış hesap): herkese açık okunan "profile-photos" kutusu; en çok 2 MB, jpg/png/webp.
-- Dosya adı tahmin edilemez; adres yalnızca gerçek adın göründüğü yerlerde (arkadaşlara) verilir.
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-photos', 'profile-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists profile_photos_owner_insert on storage.objects;
  create policy profile_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'profile-photos' and public._profile_photo_slot_ok(name));
  drop policy if exists profile_photos_owner_select on storage.objects;
  create policy profile_photos_owner_select on storage.objects for select to authenticated
    using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
  drop policy if exists profile_photos_owner_delete on storage.objects;
  create policy profile_photos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
exception when others then
  raise warning 'profile-photos kutusu kurulamadı: %. Supabase > Storage bölümünden elle kurulmalı.', sqlerrm;
end $$;

-- Mekân profil resimleri: herkese açık okunan "venue-images" kutusu; en çok 2 MB, yalnızca jpg/png/webp.
-- Dosya yükleme, değiştirme ve silme yalnızca moderatöre açıktır.
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('venue-images', 'venue-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists venue_images_admin_insert on storage.objects;
  create policy venue_images_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'venue-images' and public.is_admin());
  drop policy if exists venue_images_admin_update on storage.objects;
  create policy venue_images_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'venue-images' and public.is_admin()) with check (bucket_id = 'venue-images' and public.is_admin());
  drop policy if exists venue_images_admin_delete on storage.objects;
  create policy venue_images_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'venue-images' and public.is_admin());
exception when others then
  raise warning 'venue-images kutusu kurulamadı: %. Supabase > Storage bölümünden elle kurulmalı.', sqlerrm;
end $$;

-- Etkinlik görselleri: herkese açık okunan "event-images" kutusu; en çok 2 MB, yalnızca jpg/png/webp.
-- Üye yalnızca kendi etkinliğinin klasörüne (<üye kimliği>/<etkinlik>/...) yükler; etkinlik başına tek görsel
-- (moderatör reddederse en çok 2 kez daha denenebilir). Üye silemez. Görsel, set_event_image ile
-- etkinliğe bağlanır ve moderatör onaylayana kadar başkasına adresi verilmez.
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('event-images', 'event-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists event_images_owner_insert on storage.objects;
  create policy event_images_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'event-images' and public._is_active_user() and public._event_image_slot_ok(name));
  drop policy if exists event_images_owner_select on storage.objects;
  create policy event_images_owner_select on storage.objects for select to authenticated
    using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
  -- Görsel kaldırılamaz: yalnızca moderatör siler
  drop policy if exists event_images_owner_delete on storage.objects;
  create policy event_images_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'event-images' and public.is_admin());
exception when others then
  raise warning 'event-images kutusu kurulamadı: %. Supabase > Storage bölümünden elle kurulmalı.', sqlerrm;
end $$;

-- Hazine ipucu fotoğrafları: herkese açık okunan "treasure-images" kutusu; en çok 2 MB, jpg/png/webp. Yalnızca moderatör
-- yükler ve siler.
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('treasure-images', 'treasure-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists treasure_images_admin_insert on storage.objects;
  create policy treasure_images_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'treasure-images' and public.is_admin());
  drop policy if exists treasure_images_admin_delete on storage.objects;
  create policy treasure_images_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'treasure-images' and public.is_admin());
exception when others then
  raise warning 'treasure-images kutusu kurulamadı: %. Supabase > Storage bölümünden elle kurulmalı.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 10) Canlı güncelleme (Realtime): yeni gönderi ve oyun değişiklikleri anında düşer
-- ---------------------------------------------------------------------

do $$ begin
  begin alter publication supabase_realtime add table public.posts;
  exception when duplicate_object or undefined_object then null; end;
  begin alter publication supabase_realtime add table public.comments;
  exception when duplicate_object or undefined_object then null; end;
  begin alter publication supabase_realtime add table public.game_rooms;
  exception when duplicate_object or undefined_object then null; end;
  begin alter publication supabase_realtime add table public.room_players;
  exception when duplicate_object or undefined_object then null; end;
  begin alter publication supabase_realtime add table public.room_player_secrets;
  exception when duplicate_object or undefined_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 11) İLK MODERATÖR HESABI (bunu şimdi değil, uygulamada kayıt olduktan sonra çalıştır)
--     (Veritabanındaki iç adı 'admin'dir, uygulamada "Moderatör" olarak görünür.)
--
-- Önce uygulamadan normal kullanıcı olarak kayıt ol. Sonra SQL Editor'de aşağıdaki
-- satırı, e-posta adresini kendi adresinle değiştirerek tek başına çalıştır:
--
--   update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'SENIN-EPOSTAN@ornek.com');
-- ---------------------------------------------------------------------

-- API'nin yeni fonksiyonları hemen görmesi için şema önbelleğini yenile
-- ---------------------------------------------------------------------
-- Bilgi Yarışması: ayarlar, soru bankası, oyunun açılması
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('pts_quiz_win', '1', '(Kullanılmıyor) Eski düello puanı; yerine pts_quiz_win_base ve oyuncu çarpanı'),
  ('pts_quiz_win_base', '100', 'Bilgi Yarışması Uzaktan: kazananın taban puanı ×100 (100 = 1 puan). Oyuncu çarpanı: 2 kişi ×1.25, 3 ×1.5, 4 ×1.75, 5 ×2'),
  ('pts_quiz_solo_5', '100', 'Bilgi Yarışması Solo: 5 doğruya puan ×100 (100 = 1 puan)'),
  ('pts_quiz_solo_8', '120', 'Bilgi Yarışması Solo: 8 doğruya puan ×100 (120 = 1.2 puan)'),
  ('pts_quiz_solo_12', '150', 'Bilgi Yarışması Solo: 12 doğruya puan ×100 (150 = 1.5 puan)'),
  ('pts_quiz_daily_points', '10', 'Bilgi Yarışması: günde en çok kaç genel puan kazanılabilir'),
  ('pts_quiz_month_points', '125', 'Bilgi Yarışması: ayda en çok kaç genel puan kazanılabilir'),
  ('pts_quiz_private_group_daily', '5', 'Bilgi Yarışması özel oda: aynı kişilerden biriyle oynanan maçlardan günde en çok kaç puan'),
  ('quiz_arena_rounds', '5', 'Bilgi Yarışması Uzaktan: raunt sayısı (her rauntta 2 soru)'),
  ('quiz_arena_question_seconds', '10', 'Bilgi Yarışması Uzaktan: soru süresi (saniye). Doğru = 100 + kalan saniye × 10'),
  ('quiz_arena_vote_seconds', '10', 'Bilgi Yarışması Uzaktan: kategori oylaması süresi (saniye)'),
  ('quiz_arena_chaos_seconds', '20', 'Bilgi Yarışması Uzaktan: kaos aşaması (sandık ve takas) süresi (saniye)'),
  ('quiz_arena_reveal_seconds', '6', 'Bilgi Yarışması Uzaktan: cevapların ve sonuçların gösterildiği süre (saniye)'),
  ('quiz_arena_intro_seconds', '8', 'Bilgi Yarışması Uzaktan: maç başlamadan önceki geri sayım (saniye)'),
  ('quiz_arena_ready_seconds', '30', 'Bilgi Yarışması Uzaktan: rastgele eşleşme bekleme odasında “Hazırım” için süre (saniye)'),
  ('quiz_arena_wait_seconds', '20', '(Kullanılmıyor) Yerine quiz_arena_ready_seconds'),
  ('quiz_side_daily', '10', 'Bilgi Yarışması Yan Yana: günde en çok kaç oyun (can harcamaz, puan vermez)'),
  ('quiz_side_question_seconds', '15', 'Bilgi Yarışması Yan Yana: soru süresi (saniye)'),
  ('quiz_side_reveal_seconds', '4', 'Bilgi Yarışması Yan Yana: cevapların gösterildiği süre (saniye)'),
  ('quiz_search_min_seconds', '10', 'Bilgi Yarışması Uzaktan: rastgele eşleşmede herkesin en az kaç saniye rakip araması (sonra eşleşir)'),
  ('quiz_side_vote_seconds', '10', 'Bilgi Yarışması Yan Yana: raunt başında kategori seçme süresi (saniye)'),
  ('quiz_solo_rank_min_correct', '5', 'Bilgi Yarışması Solo: haftalık sıralamaya sayılması için koşunun en az doğru sayısı'),
  ('quiz_champion_lives', '10', 'Bilgi Yarışması: geçen haftanın Solo Maraton ilk 3''ünün bu hafta en çok canı'),
  ('quiz_arena_min_correct', '4', 'Bilgi Yarışması Uzaktan: kazananın puan alması için en az doğru sayısı'),
  ('quiz_arena_hand', '4', 'Bilgi Yarışması Uzaktan: elde en çok kaç kart tutulabilir'),
  ('quiz_bomb_percent', '20', 'Bilgi Yarışması Uzaktan: patlayan bombanın sildiği skor yüzdesi'),
  ('quiz_max_lives', '5', 'Bilgi Yarışması: en çok can (her Solo ve Uzaktan oyun 1 can harcar)'),
  ('quiz_life_minutes', '30', 'Bilgi Yarışması: kaç dakikada 1 can dolar'),
  ('quiz_daily_games', '25', 'Bilgi Yarışması: günde en çok kaç oyun (Solo + Uzaktan) oynanabilir'),
  ('quiz_freeze_seconds', '15', 'Bilgi Yarışması Solo: Süre Dondurma jokerinin süreye eklediği saniye'),
  ('pts_quiz_same_opponent_daily', '1', 'Bilgi Yarışması: aynı rakibi yenerek günde en çok kaç kez puan alınır'),
  ('quiz_questions_per_match', '7', 'Bilgi Yarışması: maç başına soru sayısı (son soru iki kat puan)'),
  ('quiz_question_seconds', '12', 'Bilgi Yarışması: her soru için süre (saniye)'),
  ('quiz_reveal_seconds', '3', 'Bilgi Yarışması: doğru cevabın gösterildiği süre (saniye)'),
  ('quiz_intro_seconds', '4', 'Bilgi Yarışması: maç başlamadan önceki geri sayım (saniye)'),
  ('quiz_stale_seconds', '25', 'Bilgi Yarışması: maçta bu kadar saniye sinyal gelmeyen oyuncu çıkmış sayılır ve kaybeder'),
  ('quiz_daily_match_limit', '40', '(Kullanılmıyor) Yerine quiz_daily_games'),
  ('quiz_solo_daily_limit', '15', '(Kullanılmıyor) Yerine quiz_daily_games')
on conflict (key) do update set description = excluded.description;
-- Paket 16: Bilgi Yarışması günlük/aylık puan tavanı 5/60 → 10/125 (moderatör değiştirdiyse dokunulmaz)
update public.app_settings set value = '10' where key = 'pts_quiz_daily_points' and value = '5';
update public.app_settings set value = '125' where key = 'pts_quiz_month_points' and value = '60';
-- Paket 17: Uzaktan açıklama ekranları daha uzun (moderatör değiştirdiyse dokunulmaz)
update public.app_settings set value = '10' where key = 'quiz_arena_vote_seconds' and value = '7';
update public.app_settings set value = '20' where key = 'quiz_arena_chaos_seconds' and value = '12';
update public.app_settings
   set description = '(Kullanılmıyor) Yerine pts_quiz_daily_points'
 where key = 'pts_quiz_daily_cap';
update public.app_settings
   set description = '(Kullanılmıyor) Yerine pts_quiz_month_points'
 where key = 'pts_quiz_month_cap';
update public.app_settings
   set description = '(Kullanılmıyor) Eski oda usulü Bilgi Yarışması için en yüksek puan'
 where key = 'pts_quiz_top_cap';
update public.app_settings
   set description = '(Kullanılmıyor) Eski oda usulü Bilgi Yarışması için en az oyuncu'
 where key = 'pts_quiz_min_players';
update public.game_types
   set description = 'Solo Maraton ya da haritanın her yerinden rakiplerle yarış', min_players = 1, max_players = 5
 where key = 'quiz';

-- Başlangıç soru bankası (161soru). Doğru şık kayıtta ilk sıradadır; maçta şıklar her seferinde karıştırılır.
-- Aynı soru zaten varsa (moderatör düzenlediyse de) dokunulmaz.
insert into public.quiz_questions (category, question, options, correct) values
  ('tarih', 'Türkiye Cumhuriyeti hangi yıl ilan edildi?', array['1923', '1920', '1922', '1919'], 0),
  ('tarih', 'İstanbul hangi yıl fethedildi?', array['1453', '1071', '1299', '1517'], 0),
  ('tarih', 'Malazgirt Meydan Muharebesi hangi yıl yapıldı?', array['1071', '1453', '1176', '1299'], 0),
  ('tarih', 'Türkiye Büyük Millet Meclisi hangi yıl açıldı?', array['1920', '1923', '1919', '1921'], 0),
  ('tarih', 'Osmanlı Devleti''nin kurucusu kimdir?', array['Osman Bey', 'Orhan Bey', 'Ertuğrul Gazi', 'I. Murad'], 0),
  ('tarih', 'İstanbul''u fetheden padişah kimdir?', array['Fatih Sultan Mehmed', 'Yavuz Sultan Selim', 'Kanuni Sultan Süleyman', 'II. Bayezid'], 0),
  ('tarih', 'Mustafa Kemal Samsun''a hangi tarihte çıktı?', array['19 Mayıs 1919', '23 Nisan 1920', '30 Ağustos 1922', '29 Ekim 1923'], 0),
  ('tarih', '30 Ağustos Zafer Bayramı hangi muharebenin kazanılmasını kutlar?', array['Başkomutanlık Meydan Muharebesi', 'Sakarya Meydan Muharebesi', 'I. İnönü Muharebesi', 'Çanakkale Savaşı'], 0),
  ('tarih', 'Çanakkale Savaşı hangi yıl başladı?', array['1915', '1918', '1912', '1920'], 0),
  ('tarih', 'Türk kadınlarına milletvekili seçme ve seçilme hakkı hangi yıl verildi?', array['1934', '1930', '1923', '1946'], 0),
  ('tarih', 'Harf Devrimi (Latin alfabesine geçiş) hangi yıl yapıldı?', array['1928', '1923', '1934', '1925'], 0),
  ('tarih', 'Soyadı Kanunu hangi yıl kabul edildi?', array['1934', '1928', '1926', '1938'], 0),
  ('tarih', 'İkinci Dünya Savaşı hangi yıl sona erdi?', array['1945', '1939', '1944', '1950'], 0),
  ('tarih', 'Birinci Dünya Savaşı hangi yıl başladı?', array['1914', '1918', '1912', '1939'], 0),
  ('tarih', 'Fransız İhtilali hangi yıl gerçekleşti?', array['1789', '1815', '1848', '1776'], 0),
  ('tarih', 'Kristof Kolomb Amerika kıtasına hangi yıl ulaştı?', array['1492', '1453', '1517', '1600'], 0),
  ('tarih', 'Berlin Duvarı hangi yıl yıkıldı?', array['1989', '1991', '1961', '1979'], 0),
  ('tarih', 'Lozan Barış Antlaşması hangi yıl imzalandı?', array['1923', '1920', '1919', '1922'], 0),
  ('tarih', 'Sevr Antlaşması hangi yıl imzalandı?', array['1920', '1923', '1918', '1919'], 0),
  ('tarih', 'Mustafa Kemal Atatürk hangi şehirde doğdu?', array['Selanik', 'İstanbul', 'Manastır', 'Bursa'], 0),
  ('tarih', 'Kanuni Sultan Süleyman''ın kuşattığı ancak alamadığı Avrupa şehri hangisidir?', array['Viyana', 'Belgrad', 'Budin', 'Rodos'], 0),
  ('tarih', 'Türkiye NATO''ya hangi yıl üye oldu?', array['1952', '1949', '1945', '1960'], 0),
  ('tarih', 'Lale Devri hangi padişahın döneminde yaşandı?', array['III. Ahmed', 'IV. Murad', 'II. Mahmud', 'I. Abdülhamid'], 0),
  ('tarih', 'Tanzimat Fermanı hangi yıl ilan edildi?', array['1839', '1856', '1876', '1908'], 0),
  ('tarih', 'Uzaya çıkan ilk insan kimdir?', array['Yuri Gagarin', 'Neil Armstrong', 'Valentina Tereşkova', 'Alan Shepard'], 0),
  ('cografya', 'Türkiye''nin en yüksek dağı hangisidir?', array['Ağrı Dağı', 'Erciyes Dağı', 'Süphan Dağı', 'Uludağ'], 0),
  ('cografya', 'Türkiye''nin en büyük gölü hangisidir?', array['Van Gölü', 'Tuz Gölü', 'Beyşehir Gölü', 'Eğirdir Gölü'], 0),
  ('cografya', 'Tamamı Türkiye topraklarında akan en uzun nehir hangisidir?', array['Kızılırmak', 'Sakarya', 'Yeşilırmak', 'Büyük Menderes'], 0),
  ('cografya', 'Dünyanın en büyük okyanusu hangisidir?', array['Büyük Okyanus (Pasifik)', 'Atlas Okyanusu', 'Hint Okyanusu', 'Kuzey Buz Denizi'], 0),
  ('cografya', 'Dünyanın en yüksek dağı hangisidir?', array['Everest', 'K2', 'Kilimanjaro', 'Mont Blanc'], 0),
  ('cografya', 'Dünyanın en büyük sıcak çölü hangisidir?', array['Sahra', 'Gobi', 'Kalahari', 'Atacama'], 0),
  ('cografya', 'Japonya''nın başkenti neresidir?', array['Tokyo', 'Kyoto', 'Osaka', 'Seul'], 0),
  ('cografya', 'Avustralya''nın başkenti neresidir?', array['Kanberra', 'Sidney', 'Melbourne', 'Perth'], 0),
  ('cografya', 'Kanada''nın başkenti neresidir?', array['Ottava', 'Toronto', 'Vancouver', 'Montreal'], 0),
  ('cografya', 'Brezilya''nın resmi dili hangisidir?', array['Portekizce', 'İspanyolca', 'Fransızca', 'İngilizce'], 0),
  ('cografya', 'Türkiye kaç coğrafi bölgeye ayrılır?', array['7', '6', '8', '5'], 0),
  ('cografya', 'Marmara Denizi''ni Ege Denizi''ne bağlayan boğaz hangisidir?', array['Çanakkale Boğazı', 'İstanbul Boğazı', 'Cebelitarık Boğazı', 'Hürmüz Boğazı'], 0),
  ('cografya', 'Nil Nehri hangi denize dökülür?', array['Akdeniz', 'Kızıldeniz', 'Atlas Okyanusu', 'Hint Okyanusu'], 0),
  ('cografya', 'Yüzölçümü bakımından dünyanın en büyük ülkesi hangisidir?', array['Rusya', 'Kanada', 'Çin', 'ABD'], 0),
  ('cografya', 'Göreme Milli Parkı hangi ilimizdedir?', array['Nevşehir', 'Kayseri', 'Niğde', 'Aksaray'], 0),
  ('cografya', 'Pamukkale travertenleri hangi ilimizdedir?', array['Denizli', 'Muğla', 'Aydın', 'Isparta'], 0),
  ('cografya', 'Sümela Manastırı hangi ilimizdedir?', array['Trabzon', 'Rize', 'Gümüşhane', 'Artvin'], 0),
  ('cografya', 'Efes Antik Kenti hangi ilimizdedir?', array['İzmir', 'Aydın', 'Manisa', 'Muğla'], 0),
  ('cografya', 'İtalya''nın başkenti neresidir?', array['Roma', 'Milano', 'Venedik', 'Napoli'], 0),
  ('cografya', 'Mısır''ın başkenti neresidir?', array['Kahire', 'İskenderiye', 'Luksor', 'Asuan'], 0),
  ('cografya', 'Hangisi bir ada ülkesidir?', array['İzlanda', 'İsviçre', 'Avusturya', 'Macaristan'], 0),
  ('cografya', 'Hangisinin Karadeniz''e kıyısı yoktur?', array['Yunanistan', 'Bulgaristan', 'Romanya', 'Gürcistan'], 0),
  ('cografya', 'Dünyanın en büyük adası hangisidir?', array['Grönland', 'Madagaskar', 'Borneo', 'Yeni Gine'], 0),
  ('cografya', 'Almanya''nın başkenti neresidir?', array['Berlin', 'Münih', 'Hamburg', 'Frankfurt'], 0),
  ('cografya', 'Eyfel Kulesi hangi şehirdedir?', array['Paris', 'Londra', 'Brüksel', 'Roma'], 0),
  ('bilim', 'Su deniz seviyesinde kaç derecede kaynar?', array['100 °C', '90 °C', '120 °C', '80 °C'], 0),
  ('bilim', 'Suyun kimyasal formülü nedir?', array['H2O', 'CO2', 'O2', 'NaCl'], 0),
  ('bilim', 'Güneş Sistemi''nin en büyük gezegeni hangisidir?', array['Jüpiter', 'Satürn', 'Neptün', 'Dünya'], 0),
  ('bilim', 'Güneş''e en yakın gezegen hangisidir?', array['Merkür', 'Venüs', 'Mars', 'Dünya'], 0),
  ('bilim', '“Kızıl Gezegen” olarak bilinen gezegen hangisidir?', array['Mars', 'Venüs', 'Jüpiter', 'Merkür'], 0),
  ('bilim', 'İnsan vücudunun en büyük organı hangisidir?', array['Deri', 'Karaciğer', 'Akciğer', 'Beyin'], 0),
  ('bilim', 'Yetişkin bir insanda yirmilik dişler dahil kaç diş bulunur?', array['32', '28', '30', '36'], 0),
  ('bilim', 'Işık boşlukta saniyede yaklaşık kaç kilometre yol alır?', array['300.000 km', '30.000 km', '3.000 km', '3.000.000 km'], 0),
  ('bilim', 'Periyodik tabloda “Fe” hangi elementin simgesidir?', array['Demir', 'Flor', 'Fosfor', 'Fermiyum'], 0),
  ('bilim', 'Periyodik tabloda “Au” hangi elementin simgesidir?', array['Altın', 'Gümüş', 'Alüminyum', 'Argon'], 0),
  ('bilim', 'Bitkilerin güneş ışığıyla kendi besinini üretmesine ne denir?', array['Fotosentez', 'Solunum', 'Terleme', 'Mayalanma'], 0),
  ('bilim', 'Kalıtsal bilgiyi taşıyan molekül hangisidir?', array['DNA', 'ATP', 'Glikoz', 'Hemoglobin'], 0),
  ('bilim', 'Penisilini kim keşfetti?', array['Alexander Fleming', 'Louis Pasteur', 'Marie Curie', 'Robert Koch'], 0),
  ('bilim', 'Evrensel çekim yasasını ortaya koyan bilim insanı kimdir?', array['Isaac Newton', 'Galileo Galilei', 'Albert Einstein', 'Nikola Tesla'], 0),
  ('bilim', 'Görelilik kuramı hangi bilim insanına aittir?', array['Albert Einstein', 'Isaac Newton', 'Stephen Hawking', 'Niels Bohr'], 0),
  ('bilim', 'Ses hangi ortamda yayılamaz?', array['Boşlukta', 'Suda', 'Havada', 'Demirde'], 0),
  ('bilim', 'Bir üçgenin iç açıları toplamı kaç derecedir?', array['180°', '360°', '90°', '270°'], 0),
  ('bilim', 'Hangisi asal sayıdır?', array['17', '21', '27', '33'], 0),
  ('bilim', 'Dünya''nın tek doğal uydusu hangisidir?', array['Ay', 'Phobos', 'Titan', 'Europa'], 0),
  ('bilim', 'Atmosferde en çok bulunan gaz hangisidir?', array['Azot', 'Oksijen', 'Karbondioksit', 'Argon'], 0),
  ('bilim', 'İnsan kalbinde kaç odacık vardır?', array['4', '2', '3', '6'], 0),
  ('bilim', 'Kanda oksijen taşıyan hücreler hangileridir?', array['Alyuvarlar', 'Akyuvarlar', 'Kan pulcukları', 'Plazma'], 0),
  ('bilim', 'Elektrik akımının birimi nedir?', array['Amper', 'Volt', 'Ohm', 'Watt'], 0),
  ('bilim', 'Pi sayısının yaklaşık değeri kaçtır?', array['3,14', '2,71', '1,61', '1,41'], 0),
  ('bilim', 'Ozon tabakası Dünya''yı en çok hangi ışınlardan korur?', array['Morötesi (UV) ışınlar', 'Kızılötesi ışınlar', 'Radyo dalgaları', 'Görünür ışık'], 0),
  ('spor', 'Futbolda bir takım sahaya kaç oyuncuyla çıkar?', array['11', '10', '9', '12'], 0),
  ('spor', 'Basketbolda bir takımın sahadaki oyuncu sayısı kaçtır?', array['5', '6', '7', '4'], 0),
  ('spor', 'Voleybolda bir takımın sahadaki oyuncu sayısı kaçtır?', array['6', '5', '7', '8'], 0),
  ('spor', 'Olimpiyat bayrağında kaç halka vardır?', array['5', '4', '6', '7'], 0),
  ('spor', 'İlk modern Olimpiyat Oyunları (1896) hangi şehirde yapıldı?', array['Atina', 'Paris', 'Londra', 'Roma'], 0),
  ('spor', 'Türkiye A Milli Futbol Takımı 2002 Dünya Kupası''nı kaçıncı bitirdi?', array['Üçüncü', 'Dördüncü', 'İkinci', 'Çeyrek finalde elendi'], 0),
  ('spor', 'Bir maraton koşusu kaç kilometredir?', array['42,195 km', '21,1 km', '50 km', '30 km'], 0),
  ('spor', 'Futbolda “hat-trick” ne demektir?', array['Bir oyuncunun bir maçta 3 gol atması', 'Bir oyuncunun 2 gol atması', 'Penaltı atışları', 'Kendi kalesine gol'], 0),
  ('spor', 'Formula 1''de yarışı bitiren pilotu hangi bayrak karşılar?', array['Damalı bayrak', 'Sarı bayrak', 'Kırmızı bayrak', 'Mavi bayrak'], 0),
  ('spor', 'Satrançta oyunun başında her oyuncunun kaç piyonu vardır?', array['8', '6', '10', '16'], 0),
  ('spor', 'Satrançta yalnızca çapraz hareket eden taş hangisidir?', array['Fil', 'Kale', 'At', 'Vezir'], 0),
  ('spor', 'Naim Süleymanoğlu hangi sporda olimpiyat şampiyonu oldu?', array['Halter', 'Güreş', 'Boks', 'Judo'], 0),
  ('spor', 'FIFA Dünya Kupası kaç yılda bir düzenlenir?', array['4', '2', '3', '5'], 0),
  ('spor', 'Basketbolda üç sayı çizgisinin dışından atılan basket kaç sayıdır?', array['3', '2', '4', '1'], 0),
  ('spor', 'Kırkpınar''da hangi güreş türü yapılır?', array['Yağlı güreş', 'Grekoromen güreş', 'Serbest güreş', 'Sumo'], 0),
  ('spor', 'Kırkpınar Yağlı Güreşleri hangi ilimizde yapılır?', array['Edirne', 'Tekirdağ', 'Kırklareli', 'Bursa'], 0),
  ('spor', 'Wimbledon tenis turnuvası hangi ülkede yapılır?', array['Birleşik Krallık', 'Fransa', 'ABD', 'Avustralya'], 0),
  ('spor', 'Tour de France hangi spor dalında yapılan bir yarıştır?', array['Bisiklet', 'Otomobil', 'Atletizm', 'Yelken'], 0),
  ('spor', 'Bir futbol maçının normal süresi kaç dakikadır?', array['90', '80', '100', '60'], 0),
  ('sanat', 'Mona Lisa tablosunu kim yaptı?', array['Leonardo da Vinci', 'Michelangelo', 'Rafael', 'Vincent van Gogh'], 0),
  ('sanat', '“Yıldızlı Gece” tablosu hangi ressama aittir?', array['Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Salvador Dalí'], 0),
  ('sanat', 'İstiklal Marşı''nın şairi kimdir?', array['Mehmet Akif Ersoy', 'Namık Kemal', 'Ziya Gökalp', 'Tevfik Fikret'], 0),
  ('sanat', '“Sefiller” romanının yazarı kimdir?', array['Victor Hugo', 'Honoré de Balzac', 'Alexandre Dumas', 'Lev Tolstoy'], 0),
  ('sanat', '“Suç ve Ceza” romanının yazarı kimdir?', array['Fyodor Dostoyevski', 'Lev Tolstoy', 'Anton Çehov', 'Nikolay Gogol'], 0),
  ('sanat', '“Savaş ve Barış” romanının yazarı kimdir?', array['Lev Tolstoy', 'Fyodor Dostoyevski', 'İvan Turgenyev', 'Aleksandr Puşkin'], 0),
  ('sanat', '“İnce Memed” romanının yazarı kimdir?', array['Yaşar Kemal', 'Orhan Kemal', 'Kemal Tahir', 'Sait Faik Abasıyanık'], 0),
  ('sanat', 'Nobel Edebiyat Ödülü''nü alan ilk Türk yazar kimdir?', array['Orhan Pamuk', 'Yaşar Kemal', 'Nazım Hikmet', 'Elif Şafak'], 0),
  ('sanat', '“Romeo ve Juliet” oyununun yazarı kimdir?', array['William Shakespeare', 'Charles Dickens', 'Oscar Wilde', 'Molière'], 0),
  ('sanat', '“Don Kişot” romanının yazarı kimdir?', array['Miguel de Cervantes', 'Dante Alighieri', 'Giovanni Boccaccio', 'Johann Wolfgang von Goethe'], 0),
  ('sanat', 'Mimar Sinan''ın “ustalık eserim” dediği cami hangisidir?', array['Selimiye Camii', 'Süleymaniye Camii', 'Şehzade Camii', 'Sultanahmet Camii'], 0),
  ('sanat', 'Selimiye Camii hangi ilimizdedir?', array['Edirne', 'İstanbul', 'Bursa', 'Konya'], 0),
  ('sanat', 'Yabancıların “Mavi Cami” dediği tarihi cami hangisidir?', array['Sultanahmet Camii', 'Süleymaniye Camii', 'Ayasofya', 'Fatih Camii'], 0),
  ('sanat', '“Kaplumbağa Terbiyecisi” tablosunun ressamı kimdir?', array['Osman Hamdi Bey', 'Şeker Ahmed Paşa', 'İbrahim Çallı', 'Abidin Dino'], 0),
  ('sanat', 'Hangisi yaylı bir çalgıdır?', array['Keman', 'Flüt', 'Trompet', 'Davul'], 0),
  ('sanat', 'Mevlana Celaleddin Rumi''nin türbesi hangi ilimizdedir?', array['Konya', 'Bursa', 'Kayseri', 'İstanbul'], 0),
  ('sanat', '“Simyacı” romanının yazarı kimdir?', array['Paulo Coelho', 'Gabriel García Márquez', 'Jorge Amado', 'Isabel Allende'], 0),
  ('sanat', '“Kürk Mantolu Madonna” kimin eseridir?', array['Sabahattin Ali', 'Ahmet Hamdi Tanpınar', 'Reşat Nuri Güntekin', 'Halide Edib Adıvar'], 0),
  ('sanat', '“Çalıkuşu” romanının yazarı kimdir?', array['Reşat Nuri Güntekin', 'Halide Edib Adıvar', 'Peyami Safa', 'Sabahattin Ali'], 0),
  ('sanat', '“Saatleri Ayarlama Enstitüsü” romanının yazarı kimdir?', array['Ahmet Hamdi Tanpınar', 'Oğuz Atay', 'Yusuf Atılgan', 'Orhan Pamuk'], 0),
  ('sanat', 'Beethoven''ın “Neşeye Övgü” bölümüyle bilinen senfonisi hangisidir?', array['9. Senfoni', '5. Senfoni', '3. Senfoni', '7. Senfoni'], 0),
  ('genel', 'Gökkuşağında geleneksel olarak kaç renk sayılır?', array['7', '6', '5', '8'], 0),
  ('genel', 'Satranç tahtasında kaç kare vardır?', array['64', '32', '81', '100'], 0),
  ('genel', 'Bir düzinede kaç adet vardır?', array['12', '10', '6', '20'], 0),
  ('genel', 'Türk lirasının simgesi hangisidir?', array['₺', '₤', '$', '€'], 0),
  ('genel', '“Çölün gemisi” olarak anılan hayvan hangisidir?', array['Deve', 'At', 'Fil', 'Eşek'], 0),
  ('genel', 'Karada en hızlı koşan hayvan hangisidir?', array['Çita', 'Aslan', 'Ceylan', 'At'], 0),
  ('genel', 'Dünyanın en büyük hayvanı hangisidir?', array['Mavi balina', 'Fil', 'Gergedan', 'Zürafa'], 0),
  ('genel', 'Dev pandanın anavatanı hangi ülkedir?', array['Çin', 'Japonya', 'Hindistan', 'Endonezya'], 0),
  ('genel', 'Bir yılda kaç ay 31 gün çeker?', array['7', '6', '5', '8'], 0),
  ('genel', 'Artık yılda şubat ayı kaç gündür?', array['29', '28', '30', '31'], 0),
  ('genel', 'Romen rakamıyla “X” kaçtır?', array['10', '5', '50', '100'], 0),
  ('genel', 'Romen rakamıyla “L” kaçtır?', array['50', '100', '500', '1000'], 0),
  ('genel', 'Türkiye''nin uluslararası telefon kodu hangisidir?', array['+90', '+44', '+49', '+30'], 0),
  ('genel', 'Origami hangi sanatın adıdır?', array['Kağıt katlama', 'Çiçek düzenleme', 'Çay seremonisi', 'Seramik'], 0),
  ('genel', 'Suşi hangi ülkenin mutfağına aittir?', array['Japonya', 'Çin', 'Kore', 'Tayland'], 0),
  ('genel', 'Belirgin halkalarıyla en çok bilinen gezegen hangisidir?', array['Satürn', 'Mars', 'Venüs', 'Merkür'], 0),
  ('genel', 'Arılar çiçek nektarından ne üretir?', array['Bal', 'Balmumu', 'Polen', 'Propolis'], 0),
  ('genel', 'Bir asırda kaç yıl vardır?', array['100', '10', '50', '1000'], 0),
  ('genel', 'Rubik küpünü icat eden kişi kimdir?', array['Ernő Rubik', 'Thomas Edison', 'Nikola Tesla', 'Alexander Graham Bell'], 0),
  ('genel', 'Telefonu icat ettiği kabul edilen kişi kimdir?', array['Alexander Graham Bell', 'Thomas Edison', 'Guglielmo Marconi', 'Samuel Morse'], 0),
  ('eglence', '“Yüzüklerin Efendisi” kitaplarının yazarı kimdir?', array['J. R. R. Tolkien', 'C. S. Lewis', 'J. K. Rowling', 'George R. R. Martin'], 0),
  ('eglence', 'Harry Potter serisinin yazarı kimdir?', array['J. K. Rowling', 'J. R. R. Tolkien', 'Stephen King', 'Roald Dahl'], 0),
  ('eglence', '“Titanik” (1997) filminin yönetmeni kimdir?', array['James Cameron', 'Steven Spielberg', 'Christopher Nolan', 'Ridley Scott'], 0),
  ('eglence', 'Hababam Sınıfı filmlerinde “İnek Şaban” karakterini kim canlandırdı?', array['Kemal Sunal', 'Şener Şen', 'Tarık Akan', 'Halit Akçatepe'], 0),
  ('eglence', '“Vizontele” filminin senaristi kimdir?', array['Yılmaz Erdoğan', 'Cem Yılmaz', 'Nuri Bilge Ceylan', 'Ferzan Özpetek'], 0),
  ('eglence', '“Bohemian Rhapsody” hangi grubun şarkısıdır?', array['Queen', 'The Beatles', 'Pink Floyd', 'The Rolling Stones'], 0),
  ('eglence', 'The Beatles grubu hangi şehirde kuruldu?', array['Liverpool', 'Londra', 'Manchester', 'Dublin'], 0),
  ('eglence', '“Pop''un Kralı” lakabıyla bilinen sanatçı kimdir?', array['Michael Jackson', 'Elvis Presley', 'Prince', 'Freddie Mercury'], 0),
  ('eglence', 'Nasreddin Hoca''nın türbesi hangi ilimizdedir?', array['Konya', 'Eskişehir', 'Kayseri', 'Ankara'], 0),
  ('eglence', 'Karagöz ile Hacivat ne tür bir sanattır?', array['Gölge oyunu', 'Kukla', 'Pandomim', 'Orta oyunu'], 0),
  ('eglence', 'Pinokyo yalan söyleyince neyi uzar?', array['Burnu', 'Kulakları', 'Saçları', 'Bacakları'], 0),
  ('eglence', '“Rocky Balboa” hangi spor dalıyla ilgili bir film karakteridir?', array['Boks', 'Güreş', 'Futbol', 'Atletizm'], 0),
  ('eglence', '“Sherlock Holmes” karakterini yaratan yazar kimdir?', array['Arthur Conan Doyle', 'Agatha Christie', 'Edgar Allan Poe', 'Charles Dickens'], 0),
  ('eglence', '“Hercule Poirot” karakterini yaratan yazar kimdir?', array['Agatha Christie', 'Arthur Conan Doyle', 'Georges Simenon', 'Raymond Chandler'], 0),
  ('eglence', 'Keloğlan hangi tür eserlerin kahramanıdır?', array['Türk masalları', 'Yunan mitolojisi', 'Destanlar', 'Fabllar'], 0),
  ('kocaeli', 'Kocaeli''nin il merkezi olan ilçe hangisidir?', array['İzmit', 'Gebze', 'Gölcük', 'Körfez'], 0),
  ('kocaeli', 'Kocaeli''de bulunan kayak merkezi hangisidir?', array['Kartepe', 'Uludağ', 'Palandöken', 'Erciyes'], 0),
  ('kocaeli', 'Kocaeli hangi coğrafi bölgededir?', array['Marmara', 'Karadeniz', 'İç Anadolu', 'Ege'], 0),
  ('kocaeli', 'Kocaeli''nin plaka kodu kaçtır?', array['41', '34', '16', '54'], 0),
  ('kocaeli', 'İzmit Körfezi hangi denizin bir koludur?', array['Marmara Denizi', 'Karadeniz', 'Ege Denizi', 'Akdeniz'], 0),
  ('kocaeli', '17 Ağustos 1999 depremi hangi ilçe merkezli olarak bilinir?', array['Gölcük', 'Düzce', 'Adapazarı', 'Yalova'], 0),
  ('kocaeli', 'Türkiye''nin ilk kağıt fabrikası SEKA hangi şehirde kuruldu?', array['İzmit', 'Bursa', 'Eskişehir', 'Karabük'], 0),
  ('kocaeli', 'Pişmaniyesiyle ünlü şehrimiz hangisidir?', array['İzmit', 'Gaziantep', 'Safranbolu', 'Afyonkarahisar'], 0),
  ('kocaeli', 'Mezarının Gebze''de olduğu kabul edilen Kartacalı komutan kimdir?', array['Hannibal', 'Hamilkar', 'Spartaküs', 'Jül Sezar'], 0),
  ('kocaeli', 'Kocaeli adını hangi Osmanlı komutanından alır?', array['Akçakoca', 'Orhan Gazi', 'Konur Alp', 'Turgut Alp'], 0),
  ('kocaeli', 'Türk donanmasının önemli üs ve tersanelerinden birinin bulunduğu Kocaeli ilçesi hangisidir?', array['Gölcük', 'Kandıra', 'Kartepe', 'Başiskele'], 0)
on conflict do nothing;

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

notify pgrst, 'reload schema';
