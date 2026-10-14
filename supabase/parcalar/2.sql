-- PARÇA 2 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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
-- claim_session: "Web paneli 2" bölümünde (girişin trafik kaydıyla birlikte)

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
    perform public._notify(t.user_id, 'admin_message', 'Moderatör yanıt verdi: ' || left(t.title, 80),
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
    left('Moderatör “' || t.title || '” görüşmesini sonlandırdı. Yazışma silindi.', 1000), '{}'::jsonb);
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
  perform public._sk_voice_cleanup();
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
-- Kimlik doğrulama açıkken (identity_verification_enabled) ödülü yalnızca hesabını doğrulamış üyeler alır: doğrulanmamışlar
-- atlanır, ödül sıradaki doğrulanmış üyeye geçer. Kapalıyken herkes ödül alır.
create or replace function public._quiz_solo_champions(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, place int, alias text, avatar int, correct int, total_ms int)
language sql stable security definer set search_path = public as $$
  select x.user_id, x.place, x.alias, x.avatar, x.correct, x.total_ms
    from (select r.user_id, (rank() over (order by r.correct desc, r.total_ms asc))::int as place, r.alias, r.avatar,
                 r.correct, r.total_ms
            from public._quiz_solo_week_rank(p_from, p_to) r
            join public.profiles p on p.id = r.user_id
             and (p.identity_verified_at is not null or not public.setting_bool('identity_verification_enabled'))) x
   where x.place <= 3 order by x.place;
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

-- Online ödül sırası: yalnızca hesabını doğrulamış üyeler arasında (doğrulanmamış üye sıralamada görünür ama ödül
-- alamaz; ödül sıradaki doğrulanmış üyeye geçer)
create or replace function public._quiz_online_prize_rank(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, place int, points numeric, wins int, reached timestamptz)
language sql stable security definer set search_path = public as $$
  select o.user_id, (rank() over (order by o.points desc, o.wins desc, o.reached asc))::int, o.points, o.wins, o.reached
    from public._quiz_online_rank(p_from, p_to) o
    join public.profiles p on p.id = o.user_id
     and (p.identity_verified_at is not null or not public.setting_bool('identity_verification_enabled'));
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

-- Moderatör: bir ayın Online ilk 3'ü (ödül için; yalnızca hesabını doğrulamış üyeler arasında).
-- p_offset -1 = geçen ay (varsayılan), 0 = bu ay (henüz bitmedi).
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
      from public._quiz_online_prize_rank(v_from, v_to) o
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
  select * into o from public._quiz_online_prize_rank(v_from, v_to) x where x.user_id = p_user and x.place <= 3;
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
  -- Ses mesajı şikâyeti: haklıysa konuşana, haksızsa şikâyet edene yaptırım
  perform public._voice_report_verdict(p_report_id, p_status = 'resolved');
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
  (2, 'Mahalle Dostu', 250, null, 'event_min2'),
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
  from (values (2, 'event_min2'), (3, 'event_plus1'), (4, 'quiz_mult'), (5, 'unlimited_lives')) as x(lvl, perk)
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

-- Moderatörün gönderi ve yorumları "Moderatör" adıyla görünür (rumuz yerine; eski "Kat Görevlisi" adı da değişir)
update public.posts p set alias = 'Moderatör'
  from public.post_authors a join public.profiles pr on pr.id = a.author_id
 where a.post_id = p.id and pr.role = 'admin' and not p.by_event and p.alias <> 'Moderatör';
update public.comments c set alias = 'Moderatör'
  from public.comment_authors a join public.profiles pr on pr.id = a.author_id
 where a.comment_id = c.id and pr.role = 'admin' and c.alias <> 'Moderatör';

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
  ('concert_checkin_minutes_after', '15', 'Konser & Festival: kod girişi başlangıçtan en geç kaç dakika sonrasına kadar açık?')
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
