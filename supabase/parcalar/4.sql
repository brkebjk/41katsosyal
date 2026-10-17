-- PARÇA 4 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

-- "Hazırım" / vazgeç: eşleştirme lobisinde ve yeni el bekleme odasında. Oda alt sınırı kadar kişi olmadan basılamaz
-- (yeni el geri sayımında basılabilir: süre dolunca yeterli hazır yoksa oda normal bekleme odası olur).
create or replace function public.room_lobby_ready(p_room_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_min int;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type not in ('vampire_villager', 'shark_cage') then raise exception 'room_not_found'; end if;
  if r.status <> 'lobby' or not (coalesce((r.config->>'match')::boolean, false) or r.config ? 'rematch_of') then
    raise exception 'wrong_phase';
  end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id and left_at is null) then
    raise exception 'not_in_room';
  end if;
  select coalesce(gt.min_players, 6) into v_min from public.game_types gt where gt.key = r.game_type;
  if coalesce(p_on, false) and not r.state ? 'rematch_until'
     and (select count(*) from public.room_players where room_id = p_room_id and left_at is null) < v_min then
    raise exception 'not_enough_players';
  end if;
  update public.game_rooms
     set state = jsonb_set(state, '{ready}',
           (coalesce(state->'ready', '[]'::jsonb) - v.id::text)
           || (case when coalesce(p_on, false) then jsonb_build_array(v.id::text) else '[]'::jsonb end))
   where id = p_room_id;
  perform public._room_lobby_tick(p_room_id);
end $$;

insert into public.app_settings (key, value, description) values
  ('rematch_seconds', '45', 'Oyun bitince açılan yeni el bekleme odasında "Hazırım" geri sayımı, saniye'),
  ('match_solo_room_seconds', '45', 'Uzaktan eşleşme: açık oda bulunamazsa kaç saniye sonra oda açılır (kişi orada tek başına bekleyebilir)')
on conflict (key) do nothing;

-- ---- Ses şikâyeti yaptırımları ------------------------------------------------------------------------------------
-- Moderatör ses mesajı şikâyetini "sonuçlandı" (haklı) ya da "reddedildi" (haksız) diye kapatır:
--   Haklı: konuşanın mikrofonu 7 gün kapanır; ikinci ve sonraki ihlallerde 30 gün.
--   Haksız: şikâyet edenin haksız şikâyet sayısı artar; her 3 haksız şikâyette 30 gün ses şikâyeti yapamaz ve 7 gün
--   mikrofon kullanamaz. (Sayılar ayarlardan değiştirilebilir.)
create or replace function public._voice_report_verdict(p_report_id uuid, p_just boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  rp public.reports;
  v_speaker uuid;
  v_n int;
begin
  select * into rp from public.reports where id = p_report_id;
  if not found or rp.target_type <> 'sk_voice' then return; end if;
  if p_just then
    select c.user_id into v_speaker from public.sk_voice_clips c where c.id = rp.target_id;
    if v_speaker is null then return; end if;
    update public.profiles
       set voice_strikes = voice_strikes + 1,
           mic_banned_until = greatest(coalesce(mic_banned_until, now()), now())
             + make_interval(days => case when voice_strikes >= 1 then public.setting_int('voice_ban_days_repeat', 30)
                                          else public.setting_int('voice_ban_days_first', 7) end)
     where id = v_speaker
     returning voice_strikes into v_n;
    perform public._notify(v_speaker, 'system', 'Mikrofonun kapatıldı',
      'Oyunda gönderdiğin bir ses mesajı kurallara aykırı bulundu. Bir süre bas-konuş kullanamazsın.', '{}'::jsonb);
  else
    update public.profiles set unjust_reports = unjust_reports + 1 where id = rp.reporter_id
     returning unjust_reports into v_n;
    if v_n % greatest(1, public.setting_int('unjust_report_limit', 3)) = 0 then
      update public.profiles
         set report_banned_until = now() + make_interval(days => public.setting_int('report_ban_days', 30)),
             mic_banned_until = greatest(coalesce(mic_banned_until, now()), now())
               + make_interval(days => public.setting_int('unjust_mic_ban_days', 7))
       where id = rp.reporter_id;
      perform public._notify(rp.reporter_id, 'system', 'Şikâyet hakkın kapatıldı',
        'Yaptığın ses şikâyetleri birkaç kez haksız bulundu. Bir süre ses şikâyeti yapamaz ve bas-konuş kullanamazsın.',
        '{}'::jsonb);
    end if;
  end if;
end $$;

insert into public.app_settings (key, value, description) values
  ('voice_ban_days_first', '7', 'Haklı bulunan ilk ses şikâyetinde konuşanın mikrofon yasağı (gün)'),
  ('voice_ban_days_repeat', '30', 'Haklı bulunan sonraki ses şikâyetlerinde mikrofon yasağı (gün)'),
  ('unjust_report_limit', '3', 'Kaç haksız ses şikâyetinde şikâyet edene yaptırım uygulanır'),
  ('report_ban_days', '30', 'Haksız şikâyet yaptırımı: ses şikâyeti yasağı (gün)'),
  ('unjust_mic_ban_days', '7', 'Haksız şikâyet yaptırımı: mikrofon yasağı (gün)'),
  ('kick_poll_seconds', '30', 'Oyuncu atma oylamasının süresi (sn)'),
  ('kick_poll_per_player', '2', 'Bir oyuncu bir odada en çok kaç atma oylaması başlatabilir')
on conflict (key) do nothing;

-- ---- Oyuncu atma oylaması (iki oyunda, yan yana ve uzaktan) ----------------------------------------------------------
-- Yalnızca bekleme odasında ve tartışmada (Köpekbalığı plajı, Vampir–Köylü sabahı) başlatılır. Aynı anda tek oylama
-- açık olur; kişi başı odada en çok 2 oylama. 30 sn içinde oy verebilecek oyuncuların (yaşayan, odada olan, atılmak
-- istenen hariç) yarısından fazlası "At" derse oyuncu atılır: oyundaysa elenmiş sayılır (rolü açıklanır, puan almaz),
-- bekleme odasındaysa çıkarılır; o odaya geri giremez. Moderatör ve (sahipliği devredilemeyen odada) oda sahibi atılamaz.
create table if not exists public.room_kick_polls (
  room_id uuid primary key references public.game_rooms (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  starter_id uuid not null references public.profiles (id) on delete cascade,
  phase_key text not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.room_kick_polls enable row level security;
create table if not exists public.room_kick_poll_log (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  starter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists room_kick_poll_log_idx on public.room_kick_poll_log (room_id, starter_id);
alter table public.room_kick_poll_log enable row level security;

-- Oylama açılabilecek an: bekleme odası ya da tartışma. Döner: anahtar (o tura özel) ya da boş
create or replace function public._kick_window(r public.game_rooms)
returns text language sql stable set search_path = public as $$
  select case when r.status = 'lobby' then 'lobby'
              when r.status = 'playing' and r.game_type = 'shark_cage' and r.state->>'phase' = 'day'
                then 'day:' || coalesce(r.state->>'round', '0')
              when r.status = 'playing' and r.game_type = 'vampire_villager' and r.state->>'phase' = 'dawn'
                then 'dawn:' || coalesce(r.state->>'round', '0') end;
$$;

-- Oy verebilecekler: odada olan (oyundaysa yaşayan) oyuncular, atılmak istenen hariç
create or replace function public._kick_voters(p_room_id uuid, p_target uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.room_players rp
    join public.game_rooms r on r.id = rp.room_id
   where rp.room_id = p_room_id and rp.left_at is null and rp.user_id <> p_target
     and (r.status = 'lobby' or rp.is_alive);
$$;

create or replace function public._kick_yes(p_room_id uuid, p_target uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.room_kick_votes k
    join public.room_players rp on rp.room_id = k.room_id and rp.user_id = k.voter_id and rp.left_at is null
    join public.game_rooms r on r.id = k.room_id
   where k.room_id = p_room_id and k.target_id = p_target and k.phase_key = p_key
     and (r.status = 'lobby' or rp.is_alive);
$$;

-- Açık oylamayı sonuçlandırır: çoğunluk olunca hemen, süre dolunca ya da tartışma bitince
create or replace function public._kick_tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  k public.room_kick_polls;
  v_yes int;
  v_need int;
begin
  select * into k from public.room_kick_polls where room_id = p_room_id;
  if not found then return; end if;
  select * into r from public.game_rooms where id = p_room_id for update;
  select * into k from public.room_kick_polls where room_id = p_room_id for update;
  if not found then return; end if;
  -- Test odasında moderatörün başlattığı oylamaya botlar "At" der (tek telefonla deneme)
  if coalesce((r.config->>'test')::boolean, false)
     and exists (select 1 from public.profiles p where p.id = k.starter_id and p.role = 'admin') then
    insert into public.room_kick_votes (room_id, target_id, voter_id, phase_key)
    select p_room_id, k.target_id, rp.user_id, k.phase_key
      from public.room_players rp join public.profiles p on p.id = rp.user_id and p.is_bot
     where rp.room_id = p_room_id and rp.left_at is null and rp.user_id <> k.target_id
    on conflict (room_id, target_id, voter_id) do update set phase_key = excluded.phase_key;
  end if;
  v_yes := public._kick_yes(p_room_id, k.target_id, k.phase_key);
  v_need := public._kick_voters(p_room_id, k.target_id) / 2 + 1;
  if public._kick_window(r) is distinct from k.phase_key
     or not exists (select 1 from public.room_players rp
                     where rp.room_id = p_room_id and rp.user_id = k.target_id and rp.left_at is null) then
    delete from public.room_kick_polls where room_id = p_room_id;
    delete from public.room_kick_votes where room_id = p_room_id and phase_key = k.phase_key;
    return;
  end if;
  if v_yes >= v_need then
    delete from public.room_kick_polls where room_id = p_room_id;
    delete from public.room_kick_votes where room_id = p_room_id and (target_id = k.target_id or voter_id = k.target_id);
    insert into public.room_bans (room_id, user_id) values (p_room_id, k.target_id) on conflict do nothing;
    perform public._room_remove_player(p_room_id, k.target_id, 'kicked');
    perform public._notify(k.target_id, 'system', 'Odadan çıkarıldın',
      'Odadaki oyuncuların çoğunluğu seni oyundan çıkarmak için oy verdi. Bu odaya yeniden giremezsin.', '{}'::jsonb);
    return;
  end if;
  if now() >= k.ends_at then
    delete from public.room_kick_polls where room_id = p_room_id;
    delete from public.room_kick_votes where room_id = p_room_id and target_id = k.target_id and phase_key = k.phase_key;
  end if;
end $$;

-- Atma oylaması başlat (başlatan "At" demiş sayılır)
create or replace function public.room_kick_start(p_room_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_key text;
begin
  v := public._require_writer(null);
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type not in ('shark_cage', 'vampire_villager') then raise exception 'room_not_found'; end if;
  perform public._kick_tick(p_room_id);
  v_key := public._kick_window(r);
  if v_key is null then raise exception 'kick_closed'; end if;
  if not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null
                   and (r.status = 'lobby' or rp.is_alive)) then
    raise exception 'forbidden';
  end if;
  if p_target = v.id
     or exists (select 1 from public.profiles p where p.id = p_target and p.role = 'admin')
     or not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = p_target and rp.left_at is null)
     or (p_target = r.host_id and not (r.remote or r.config ? 'rematch_of' or coalesce((r.config->>'match')::boolean, false))) then
    raise exception 'not_kickable';
  end if;
  if exists (select 1 from public.room_kick_polls where room_id = p_room_id) then raise exception 'kick_poll_open'; end if;
  if (select count(*) from public.room_kick_poll_log where room_id = p_room_id and starter_id = v.id)
     >= greatest(1, public.setting_int('kick_poll_per_player', 2)) then
    raise exception 'kick_poll_limit';
  end if;
  insert into public.room_kick_poll_log (room_id, starter_id) values (p_room_id, v.id);
  insert into public.room_kick_polls (room_id, target_id, starter_id, phase_key, ends_at)
  values (p_room_id, p_target, v.id, v_key,
          now() + make_interval(secs => greatest(10, public.setting_int('kick_poll_seconds', 30))));
  insert into public.room_kick_votes (room_id, target_id, voter_id, phase_key) values (p_room_id, p_target, v.id, v_key)
  on conflict (room_id, target_id, voter_id) do update set phase_key = excluded.phase_key, created_at = now();
  perform public._kick_tick(p_room_id);
end $$;

-- Açık oylamada "At" (true) / "Kalsın" (false)
create or replace function public.room_kick_vote(p_room_id uuid, p_yes boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  k public.room_kick_polls;
begin
  v := public._require_writer(null);
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into k from public.room_kick_polls where room_id = p_room_id;
  if not found then raise exception 'kick_closed'; end if;
  if v.id = k.target_id
     or not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null
                      and (r.status = 'lobby' or rp.is_alive)) then
    raise exception 'forbidden';
  end if;
  if coalesce(p_yes, false) then
    insert into public.room_kick_votes (room_id, target_id, voter_id, phase_key) values (p_room_id, k.target_id, v.id, k.phase_key)
    on conflict (room_id, target_id, voter_id) do update set phase_key = excluded.phase_key, created_at = now();
  else
    delete from public.room_kick_votes where room_id = p_room_id and target_id = k.target_id and voter_id = v.id;
  end if;
  perform public._kick_tick(p_room_id);
end $$;

-- Görünüm için: açık oylama { target, starter, yes, need, left (sn), mine } ve bu odada kalan başlatma hakkı
create or replace function public._kick_state(p_room_id uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'poll', (select jsonb_build_object(
                'target', k.target_id, 'starter', k.starter_id,
                'yes', public._kick_yes(p_room_id, k.target_id, k.phase_key),
                'need', public._kick_voters(p_room_id, k.target_id) / 2 + 1,
                'left', greatest(0, ceil(extract(epoch from k.ends_at - now()))::int),
                'mine', exists (select 1 from public.room_kick_votes kv
                                 where kv.room_id = p_room_id and kv.target_id = k.target_id and kv.voter_id = p_user
                                   and kv.phase_key = k.phase_key))
               from public.room_kick_polls k where k.room_id = p_room_id),
    'starts_left', greatest(0, public.setting_int('kick_poll_per_player', 2)
                      - (select count(*)::int from public.room_kick_poll_log l where l.room_id = p_room_id and l.starter_id = p_user)),
    'open', (select public._kick_window(r) is not null from public.game_rooms r where r.id = p_room_id));
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Klan sistemi kaldırıldı (PeopleHere): tabloları, fonksiyonları ve ayarları silinir. Kişisel puanlar etkilenmez.
-- ---------------------------------------------------------------------------------------------------------------------
drop function if exists public.crew_create(text);
drop function if exists public.crew_rename(text);
drop function if exists public.crew_invite(uuid);
drop function if exists public.crew_invite_respond(uuid, boolean);
drop function if exists public.crew_leave();
drop function if exists public.crew_kick(uuid);
drop function if exists public.crew_view();
drop function if exists public.crew_target_status(uuid, uuid);
drop function if exists public.crew_messages_list();
drop function if exists public.crew_say(text);
drop function if exists public.crew_inbox();
drop function if exists public.get_crew_leaderboard(int, int);
drop function if exists public._crew_award(uuid, uuid, numeric);
drop function if exists public._crew_unread(uuid);
drop function if exists public._crew_of(uuid);
drop function if exists public._crew_next_change(uuid);
drop function if exists public._crew_name(text);
drop function if exists public._crew_add(uuid, uuid);
drop function if exists public._crew_remove(uuid);
drop table if exists public.crew_points, public.crew_messages, public.crew_invites, public.crew_joins, public.crew_members,
  public.crews cascade;
delete from public.app_settings where key in ('crew_max_members', 'crew_change_days', 'crew_contrib_days');

-- ---------------------------------------------------------------------------------------------------------------------
-- PeopleHere şehir seçimi ve göç (bkz. bölüm 2f)
--   my_city: şehrim, göç listesi ve şehirler (göç zamanı geldiyse kaydı tamamlar)
--   set_my_city: girişten sonra ilk seçim (bir kez; moderatör her zaman). Üye yalnızca bulunduğu şehri seçer: uygulama
--     telefonun bir kez aldığı konumun petek numarasını gönderir (tam konum gelmez, saklanmaz), petek o şehrin olmalı
--   request_city_move: göç listesine yazılma. Kişi kutuya "Göçü onaylıyorum" yazar; aylık sıralama sıfırlandığında
--     (gelecek ay başı) yeni şehri geçerli olur. Bu ayın puanları eski şehrin sıralamasında kalır.
--   cancel_city_move: göç listesinden çıkma · admin_set_city: moderatör kendini ya da birini hemen taşır
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.my_city()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  if v.city_next is not null and v.city_next_at is not null and now() >= v.city_next_at then
    update public.profiles set city = city_next, city_next = null, city_next_at = null, city_set_at = now()
     where id = v.id
    returning * into v;
  end if;
  return jsonb_build_object(
    'city', v.city,
    'next', v.city_next,
    'next_at', v.city_next_at,
    'move_at', public._next_month_start(),
    'instant', v.role = 'admin',
    'waiting', v.city is null and v.waiting_since is not null,
    'cities', (select jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name) order by c.sort_order)
                 from public.cities c));
end $$;

drop function if exists public.set_my_city(text);
create or replace function public.set_my_city(p_city text, p_q int default null, p_r int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  if not exists (select 1 from public.cities where key = p_city) then raise exception 'invalid_city'; end if;
  if v.city is not null and v.role <> 'admin' then raise exception 'city_already_set'; end if;
  -- Bulunduğun şehir: peteği seçilen şehrin olmalı (haritaların dışındaysa uygulama en yakın şehrin peteğini gönderir)
  if v.role <> 'admin' and (p_q is null or p_r is null or public._cell_city(p_r) is distinct from p_city) then
    raise exception 'city_not_here';
  end if;
  update public.profiles set city = p_city, city_next = null, city_next_at = null, city_set_at = now(), waiting_since = null
   where id = v.id;
end $$;

-- Haritalarımızın dışından giren üye bekleyen üye olarak ayrılır (bir kez; konumu saklanmaz, yalnızca zaman)
create or replace function public.set_waiting_member()
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  if v.city is not null or v.role = 'admin' then return; end if;
  update public.profiles set waiting_since = coalesce(waiting_since, now()) where id = v.id;
end $$;

create or replace function public.request_city_move(p_city text, p_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_at timestamptz := public._next_month_start();
begin
  v := public._require_user();
  if not exists (select 1 from public.cities where key = p_city) then raise exception 'invalid_city'; end if;
  if v.city is null then raise exception 'city_not_set'; end if;
  if regexp_replace(public._tr_fold(coalesce(p_confirm, '')), '\s+', ' ', 'g') <> 'gocu onayliyorum' then
    raise exception 'move_not_confirmed';
  end if;
  if p_city = public._city_of(v.id) then raise exception 'same_city'; end if;
  -- Moderatör hemen taşınır
  if v.role = 'admin' then
    update public.profiles set city = p_city, city_next = null, city_next_at = null, city_set_at = now() where id = v.id;
    return jsonb_build_object('city', p_city, 'next', null, 'next_at', null);
  end if;
  update public.profiles set city_next = p_city, city_next_at = v_at where id = v.id;
  return jsonb_build_object('city', v.city, 'next', p_city, 'next_at', v_at);
end $$;

create or replace function public.cancel_city_move()
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  update public.profiles set city_next = null, city_next_at = null
   where id = v.id and city_next is not null and (city_next_at is null or now() < city_next_at);
end $$;

create or replace function public.admin_set_city(p_user uuid, p_city text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  perform public._require_admin();
  if not exists (select 1 from public.cities where key = p_city) then raise exception 'invalid_city'; end if;
  select public._city_of(id) into v_old from public.profiles where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  update public.profiles set city = p_city, city_next = null, city_next_at = null, city_set_at = now(), waiting_since = null
   where id = p_user;
  perform public._audit('set_city', p_user, jsonb_build_object('from', v_old, 'to', p_city));
end $$;

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
grant execute on function public.create_post(text, text, uuid, int, int, int, int, uuid, text) to authenticated;
grant execute on function public.alias_profile(uuid, uuid, text) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;
grant execute on function public.share_event_to_feed(uuid, text) to authenticated;
grant execute on function public.map_status() to authenticated;
grant execute on function public.map_density() to authenticated;
grant execute on function public.map_report_game(uuid, int, int) to authenticated;
grant execute on function public.search_places(text, int, text) to authenticated;
grant execute on function public.places_near_cell(int, int, int) to authenticated;
grant execute on function public.create_comment(uuid, text) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.block_author_of_post(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.unblock(uuid) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.cancel_event_registration(uuid) to authenticated;
grant execute on function public.join_room(text, uuid, int, int, double precision, double precision, real) to authenticated;
grant execute on function public.join_remote_room(uuid) to authenticated;
grant execute on function public.admin_add_test_bots(uuid, int) to authenticated;
grant execute on function public.voice_state(uuid) to authenticated;
grant execute on function public.voice_set(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.voice_yield(uuid) to authenticated;
grant execute on function public.voice_ping(uuid) to authenticated;
grant execute on function public.room_vote_kick(uuid, uuid) to authenticated;
grant execute on function public.sk_view(uuid) to authenticated;
grant execute on function public.sk_history(uuid) to authenticated;
grant execute on function public.room_friend_request(uuid, uuid) to authenticated;
grant execute on function public.room_take_seat(uuid, int) to authenticated;
grant execute on function public.vv_say(uuid, text, text) to authenticated;
grant execute on function public.vv_history(uuid) to authenticated;
grant execute on function public.sk_pick_role(uuid, text) to authenticated;
grant execute on function public.room_lobby_ready(uuid, boolean) to authenticated;
grant execute on function public.room_kick_start(uuid, uuid) to authenticated;
grant execute on function public.room_kick_vote(uuid, boolean) to authenticated;
grant execute on function public.sk_start(uuid) to authenticated;
grant execute on function public.sk_ready(uuid) to authenticated;
grant execute on function public.sk_night_action(uuid, text, uuid) to authenticated;
grant execute on function public.sk_spear(uuid, uuid) to authenticated;
grant execute on function public.sk_reveal_marshal(uuid) to authenticated;
grant execute on function public.sk_vote(uuid, uuid) to authenticated;
grant execute on function public.sk_next(uuid) to authenticated;
grant execute on function public.sk_say(uuid, text, text) to authenticated;
grant execute on function public.sk_voice_post(uuid, text, int) to authenticated;
grant execute on function public.sk_voice_get(uuid) to authenticated;
grant execute on function public.my_remote_caps() to authenticated;
grant execute on function public.my_game_goals() to authenticated;
grant execute on function public.my_city() to authenticated;
grant execute on function public.set_my_city(text, int, int) to authenticated;
grant execute on function public.set_waiting_member() to authenticated;
grant execute on function public.request_city_move(text, text) to authenticated;
grant execute on function public.cancel_city_move() to authenticated;
grant execute on function public.admin_set_city(uuid, text) to authenticated;
grant execute on function public.vv_skip_discussion(uuid, boolean) to authenticated;
grant execute on function public.sk_skip_discussion(uuid, boolean) to authenticated;
grant execute on function public.sk_match_join() to authenticated;
grant execute on function public.sk_match_poll() to authenticated;
grant execute on function public.sk_match_cancel() to authenticated;
grant execute on function public.sk_lobby_ready(uuid, boolean) to authenticated;
grant execute on function public.admin_queue_test_bots(int, text) to authenticated;
grant execute on function public.match_join(text) to authenticated;
grant execute on function public.admin_get_voice_clip(uuid) to authenticated;
grant execute on function public.get_room_code(uuid) to authenticated;
grant execute on function public.leave_all_rooms(boolean) to authenticated;
grant execute on function public.my_side_room() to authenticated;
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
grant execute on function public.list_events(text) to authenticated;
grant execute on function public.create_event(text, text, text, timestamptz, int, numeric, text, int, int, int, boolean) to authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
grant execute on function public.request_event_close(uuid, text) to authenticated;
grant execute on function public.admin_list_close_requests(text) to authenticated;
grant execute on function public.admin_resolve_close_request(uuid, boolean, text) to authenticated;
grant execute on function public.my_notice_counts() to authenticated;
grant execute on function public.create_room(text, uuid, text, int, int, int, int, text, boolean, double precision, double precision, real) to authenticated;
grant execute on function public.set_room_status(uuid, text) to authenticated;
grant execute on function public.list_feed(timestamptz, int, boolean, text, boolean, int, int, int, int, boolean, uuid, text) to authenticated;
grant execute on function public.feed_districts(text) to authenticated;
grant execute on function public.list_open_rooms(text, text) to authenticated;
grant execute on function public.list_comments(uuid) to authenticated;
grant execute on function public.delete_my_post(uuid) to authenticated;
grant execute on function public.delete_my_comment(uuid) to authenticated;
grant execute on function public.block_author_of_comment(uuid) to authenticated;
grant execute on function public.get_monthly_leaderboard(int, int, text) to authenticated;
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
grant execute on function public.get_game_leaderboard(text, int, int, text) to authenticated;
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
grant execute on function public.get_last_week_leaderboard(text, int, text) to authenticated;
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
grant execute on function public.service_identity_refund(uuid) to service_role;
grant execute on function public.service_voice_token(uuid, uuid) to service_role;
grant execute on function public.set_profile_photo(text) to authenticated;
grant execute on function public._profile_photo_slot_ok(text) to authenticated;
grant execute on function public.admin_list_photo_approvals() to authenticated;
grant execute on function public.admin_review_photo(uuid, text, boolean) to authenticated;
grant execute on function public.admin_revoke_identity(uuid, text) to authenticated;
grant execute on function public.admin_web_claim() to authenticated;
grant execute on function public.admin_web_release() to authenticated;
grant execute on function public.admin_retention_status() to authenticated;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.get_ui_texts() to anon, authenticated;
grant execute on function public.admin_set_ui_text(text, text) to authenticated;
grant execute on function public.admin_run_retention() to authenticated;
grant execute on function public.admin_traffic_search(text, timestamptz, timestamptz, int) to authenticated;

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
-- yan yana 1.750 (oyun başına puan ikisinde aynı, konum doğrulanır, en az 5 kişi). Mekân kodu: mekânda oynanan yan yana oyuna
-- +%25. Bilgi Yarışması: günlük oyun ve günlük puan sınırı yok, ayda 250 puan. Etkinlik puanları büyür (etkinlikler
-- oyunların gerisinde kalmasın). Ayarlar bir kez çevrilir; sonra moderatör web panelden değiştirebilir.
insert into public.app_settings (key, value, description) values
  ('pts_remote_month_points', '250', 'Uzaktan oyunda her oyunun aylık puan sınırı (hedefi)'),
  ('pts_side_month_points', '1750', 'Yan yana oyunda her oyunun aylık puan sınırı (hedefi)'),
  ('pts_venue_bonus_pct', '125', 'Mekân kodu ile mekânda oynanan yan yana oyunun puanı (yüzde; 125 = +%25)'),
  ('pts_party_min_players', '5', 'Köpekbalığı Kafesi ve Vampir–Köylü puan için en az oyuncu'),
  ('sponsor_credit_valid_hours', '6', 'Mekân kodu kaç saat geçerli (bu sürede mekânda açılan yan yana oyuna bonus)')
on conflict (key) do update set description = excluded.description;
-- PeopleHere: yan yana oyun artık çarpan almaz (oyun başına puan uzaktanla aynı; yalnızca aylık sınır yüksek)
delete from public.app_settings where key = 'pts_side_mult';
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
  ('event_checkin_minutes_after', '30', 'Etkinlik: kod girişi başlangıçtan en geç kaç dakika sonrasına kadar açık? (Konser & Festival hariç)'),
  ('friend_request_retry_minutes', '60', 'Arkadaşlık isteği: aynı kişiye en erken kaç dakika sonra yeniden istek gönderilebilir?')
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


-- Oyun hakkı kalktığı için Seviye 2 ödülü değişir: aylık etkinlik hakkı en az 2 (eski "+1 oyun hakkı" yerine)
update public.levels set perk = 'event_min2' where level = 2 and perk = 'game_plus1';

-- Eski adın kayıtlı verilerdeki izleri temizlenir ve üyelerin giriş adresi yeni alan adına (uye.peoplehere.app)
-- taşınır. Tek seferlik; bayrak yazıldıktan sonra bir daha çalışmaz. (Eski ad yalnızca bu taşıma için burada geçer.)
do $$
declare
  v_old constant text := chr(52) || chr(49) || '. Kat';
  v_old_dom constant text := '@uye.kat' || chr(52) || chr(49) || 'sosyal.app';
begin
  if exists (select 1 from public.app_settings where key = 'peoplehere_v1') then return; end if;
  update public.posts set alias = 'PeopleHere' where alias = v_old || ' Sosyal';
  update public.notifications
     set title = left(replace(replace(title, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'), 120),
         body = left(replace(replace(body, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'), 1000)
   where title like '%' || v_old || '%' or body like '%' || v_old || '%';
  update public.announcements
     set title = left(replace(replace(title, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'), 120),
         body = left(replace(replace(body, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'), 1000)
   where title like '%' || v_old || '%' or body like '%' || v_old || '%';
  -- Yazı düzeltmeleri: uygulamadaki yazı değiştiği için düzeltme de yeni yazıya taşınır
  insert into public.ui_text_overrides (source, text, updated_by, updated_at)
  select replace(replace(o.source, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'),
         replace(replace(o.text, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel'),
         o.updated_by, o.updated_at
    from public.ui_text_overrides o
   where o.source like '%' || v_old || '%'
  on conflict (source) do nothing;
  delete from public.ui_text_overrides where source like '%' || v_old || '%';
  update public.ui_text_overrides
     set text = replace(replace(text, v_old || ' Sosyal', 'PeopleHere'), v_old || ' Özel', 'PeopleHere Özel')
   where text like '%' || v_old || '%';
  -- Giriş adresi (kullanıcı adı@alan adı; bu adrese hiçbir şey gönderilmez)
  update auth.users set email = replace(email, v_old_dom, '@uye.peoplehere.app') where email like '%' || v_old_dom;
  begin
    update auth.identities
       set identity_data = jsonb_set(identity_data, '{email}',
                                     to_jsonb(replace(identity_data ->> 'email', v_old_dom, '@uye.peoplehere.app')))
     where identity_data ->> 'email' like '%' || v_old_dom;
  exception when others then null;
  end;
  insert into public.app_settings (key, value, description)
  values ('peoplehere_v1', 'true', 'Tek seferlik: eski adın izleri temizlendi, giriş adresleri taşındı (değiştirme)');
end $$;

-- =====================================================================================================================
-- Toparlanma paketi
--   1) Çökme kayıtları: uygulamada bir hata olunca yalnızca hatanın yeri yazılır (üye kimliği, konum, cihaz kimliği yok)
--   2) Uzaktan bildirim: bildirim kutusuna düşen bildirim, üye istediyse telefonuna da gider (içerik genel bir cümledir,
--      kimin ne yazdığı gitmez). Tercihler: telefona bildirim, mesajlar, ekip davetleri (diğerleri önceki tercihler)
--   3) Görünüm (yönetim panelinden): kampanya şeridi, özel gün teması, şehir açılış görseli, özellik aç/kapa
-- =====================================================================================================================

-- 1) Çökme kayıtları -------------------------------------------------------------------------------------------------
create table if not exists public.client_errors (
  fingerprint text primary key,
  message text not null,
  stack text not null default '',
  screen text not null default '',
  platform text not null default '',
  app_version text not null default '',
  fatal boolean not null default false,
  count int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select, delete on public.client_errors to authenticated;
drop policy if exists client_errors_admin_select on public.client_errors;
create policy client_errors_admin_select on public.client_errors for select to authenticated using (public.is_admin());
drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors for delete to authenticated using (public.is_admin());

-- Hata metninden kişisel olabilecek parçalar silinir (e-posta, uzun sayılar, uygulama adresi dışındaki adresler)
create or replace function public._scrub_error_text(p_text text, p_len int)
returns text language sql immutable set search_path = public as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<e-posta>', 'g'),
        '[0-9]{6,}', '<sayı>', 'g'),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<kimlik>', 'gi'),
    p_len);
$$;

create or replace function public.report_client_error(
  p_message text, p_stack text default '', p_screen text default '', p_platform text default '',
  p_version text default '', p_fatal boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_msg text := btrim(public._scrub_error_text(p_message, 300));
  v_stack text := public._scrub_error_text(p_stack, 2000);
  v_fp text;
begin
  if v_msg = '' then return; end if;
  v_fp := md5(v_msg || '|' || split_part(v_stack, E'\n', 1) || '|' || split_part(v_stack, E'\n', 2) || '|'
              || left(coalesce(p_platform, ''), 20));
  -- Kayıt sınırı: en çok 2000 farklı hata tutulur (aynı hata yalnızca sayılır); 30 günden eski kayıtlar silinir
  if random() < 0.05 then delete from public.client_errors where last_at < now() - interval '30 days'; end if;
  if not exists (select 1 from public.client_errors where fingerprint = v_fp)
     and (select count(*) from public.client_errors) >= 2000 then
    return;
  end if;
  insert into public.client_errors (fingerprint, message, stack, screen, platform, app_version, fatal)
  values (v_fp, v_msg, v_stack, left(public._scrub_error_text(p_screen, 120), 120), left(coalesce(p_platform, ''), 40),
          left(coalesce(p_version, ''), 40), coalesce(p_fatal, false))
  on conflict (fingerprint) do update
     set count = least(public.client_errors.count + 1, 1000000000), last_at = now(),
         screen = excluded.screen, app_version = excluded.app_version,
         fatal = public.client_errors.fatal or excluded.fatal;
end $$;
revoke execute on function public._scrub_error_text(text, int) from public, anon, authenticated;
revoke execute on function public.report_client_error(text, text, text, text, text, boolean) from public;
grant execute on function public.report_client_error(text, text, text, text, text, boolean) to anon, authenticated;

-- 2) Uzaktan bildirim -------------------------------------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise warning 'pg_net kurulamadı: %. Telefona bildirim gönderilemez (Supabase > Database > Extensions > pg_net).', sqlerrm;
end $$;

create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

alter table public.notification_prefs add column if not exists push boolean not null default true;
alter table public.notification_prefs add column if not exists dm boolean not null default true;
alter table public.notification_prefs add column if not exists team_invite boolean not null default true;

create or replace function public._notif_on(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case p_key
                            when 'game_invite' then np.game_invite
                            when 'special_events' then np.special_events
                            when 'friend_request' then np.friend_request
                            when 'mention' then np.mention
                            when 'event_reminder' then np.event_reminder
                            when 'push' then np.push
                            when 'dm' then np.dm
                            when 'team_invite' then np.team_invite
                          end
                     from public.notification_prefs np where np.user_id = p_user), true)
     -- Kampanya / özel etkinlik bildirimleri için açık rıza da gerekir (Profil > Kişisel Verilerim)
     and (p_key <> 'special_events'
          or coalesce((select c.granted from public.user_consents c where c.user_id = p_user and c.key = 'marketing'), true));
$$;

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
    'event_reminder', public._notif_on(v.id, 'event_reminder'),
    'push', public._notif_on(v.id, 'push'),
    'dm', public._notif_on(v.id, 'dm'),
    'team_invite', public._notif_on(v.id, 'team_invite'));
end $$;

create or replace function public.set_notification_prefs(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  k text;
begin
  v := public._require_user();
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then raise exception 'invalid_prefs'; end if;
  for k in select jsonb_object_keys(p_prefs) loop
    if k not in ('game_invite', 'special_events', 'friend_request', 'mention', 'event_reminder', 'push', 'dm',
                 'team_invite')
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
    push = coalesce((p_prefs ->> 'push')::boolean, np.push),
    dm = coalesce((p_prefs ->> 'dm')::boolean, np.dm),
    team_invite = coalesce((p_prefs ->> 'team_invite')::boolean, np.team_invite),
    updated_at = now()
   where np.user_id = v.id;
  return public.get_notification_prefs();
end $$;

-- Telefonun bildirim adresi (Expo): bir telefon tek üyeye bağlıdır; üye başına en çok 5 telefon
create or replace function public.register_push_token(p_token text, p_platform text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then raise exception 'invalid_token'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, v.id, left(coalesce(p_platform, ''), 20), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  delete from public.push_tokens
   where user_id = v.id
     and token not in (select t.token from public.push_tokens t where t.user_id = v.id order by t.updated_at desc limit 5);
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end $$;

-- Bildirim kutusuna yazılan her bildirim, üyenin tercihine göre telefonuna da gönderilir. Telefona giden yazı genel bir
-- cümledir (kişi adı ya da mesaj içeriği gitmez). Gönderilemezse bildirim kaydı etkilenmez.
create or replace function public._push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tokens text[];
  v_text text;
  v_msgs jsonb;
begin
  if to_regproc('net.http_post') is null then return null; end if;
  if not public._notif_on(new.user_id, 'push') then return null; end if;
  if (new.kind = 'dm' and not public._notif_on(new.user_id, 'dm'))
     or (new.kind = 'team_invite' and not public._notif_on(new.user_id, 'team_invite'))
     or (new.kind = 'room_msg' and not public._notif_on(new.user_id, 'game_invite')) then
    return null;
  end if;
  select array_agg(t.token) into v_tokens from public.push_tokens t where t.user_id = new.user_id;
  if v_tokens is null then return null; end if;
  v_text := case new.kind
              when 'friend_request' then 'Yeni bir arkadaşlık isteğin var'
              when 'game_invite' then 'Bir oyuna davet edildin'
              when 'team_invite' then 'Bir etkinlik ekibine davet edildin'
              when 'mention' then 'Akışta senden bahsedildi'
              when 'dm' then 'Yeni bir mesajın var'
              when 'room_msg' then 'Oyun odanda yeni bir mesaj var'
              when 'admin_message' then 'Moderatörden bir mesajın var'
              else 'Yeni bir bildirimin var' end;
  select jsonb_agg(jsonb_build_object('to', tok, 'title', 'PeopleHere', 'body', v_text, 'sound', 'default',
                                      'data', jsonb_build_object('url', '/?bell=' || new.id::text)))
    into v_msgs from unnest(v_tokens) tok;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', v_msgs,
          '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists push_on_notification on public.notifications;
create trigger push_on_notification after insert on public.notifications
  for each row execute function public._push_on_notification();

revoke execute on function public._push_on_notification() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- 3) Görünüm ----------------------------------------------------------------------------------------------------------
-- Özellik aç/kapa: kapalı özelliğe sunucu da izin vermez (moderatör deneyebilsin diye serbest). Ayar yoksa açıktır.
insert into public.app_settings (key, value, description) values
  ('feature_akis', 'true', 'Özellik: Akış (gönderi ve yorum yazma). false = kapalı'),
  ('feature_etkinlik_acma', 'true', 'Özellik: üyelerin etkinlik açması. false = kapalı'),
  ('feature_yan_yana', 'true', 'Özellik: yan yana oyunlar (etkinlik oyunları dahil). false = kapalı'),
  ('feature_uzaktan', 'true', 'Özellik: uzaktan oyunlar (Köpekbalığı, Vampir–Köylü eşleştirme). false = kapalı'),
  ('feature_bilgi_yarismasi', 'true', 'Özellik: Bilgi Yarışması. false = kapalı'),
  ('feature_mesajlar', 'true', 'Özellik: özel mesajlar. false = kapalı'),
  ('feature_hazine', 'true', 'Özellik: hazine avı. false = kapalı'),
  ('look_theme', '{}', 'Özel gün teması: {"name","primary","accent","highlight","from","to"}; boş = kapalı'),
  ('look_splash', '{}', 'Şehir açılış görselleri: {"kocaeli": "dosya yolu", ...} (app-look kutusu)')
on conflict (key) do nothing;

create or replace function public._feature_on(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'feature_' || p_key), true);
$$;

create or replace function public._require_feature(p_key text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public._feature_on(p_key) and not public.is_admin() then raise exception 'feature_off'; end if;
end $$;
revoke execute on function public._feature_on(text) from public, anon, authenticated;
revoke execute on function public._require_feature(text) from public, anon, authenticated;

-- Kampanya / duyuru şeridi: Harita ve Akış'ın üstünde ince şerit. Şehir boşsa bütün şehirlerde görünür.
create table if not exists public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 3 and 140),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$' or link ~ '^https://[^[:space:]]+$'),
  color text not null default 'primary' check (color in ('primary', 'accent', 'highlight', 'event', 'game', 'venue')),
  city text references public.cities (key),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_banners enable row level security;
revoke all on public.promo_banners from anon, authenticated;
grant select, insert, update, delete on public.promo_banners to authenticated;
drop policy if exists promo_banners_admin on public.promo_banners;
create policy promo_banners_admin on public.promo_banners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Açılış görselleri: herkese açık okunan "app-look" kutusu; yükleme ve silme yalnızca moderatöre açıktır
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('app-look', 'app-look', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
     set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists app_look_admin_insert on storage.objects;
  create policy app_look_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'app-look' and public.is_admin());
  drop policy if exists app_look_admin_update on storage.objects;
  create policy app_look_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'app-look' and public.is_admin()) with check (bucket_id = 'app-look' and public.is_admin());
  drop policy if exists app_look_admin_delete on storage.objects;
  create policy app_look_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'app-look' and public.is_admin());
exception when others then
  raise warning 'app-look kutusu kurulamadı: %. Supabase > Storage bölümünden elle kurulmalı.', sqlerrm;
end $$;

-- Uygulamanın açılışta okuduğu görünüm: özellikler, özel gün teması (tarih aralığındaysa), şehrin kampanya şeritleri
-- ve açılış görseli
create or replace function public.app_look(p_city text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_city text := coalesce(p_city, public._city_of(auth.uid()));
  v_theme jsonb := coalesce((select value from public.app_settings where key = 'look_theme'), '{}'::jsonb);
  v_splash jsonb := coalesce((select value from public.app_settings where key = 'look_splash'), '{}'::jsonb);
begin
  if auth.uid() is null then return '{}'::jsonb; end if;
  if jsonb_typeof(v_theme) <> 'object'
     or (v_theme ? 'from' and nullif(v_theme ->> 'from', '') is not null and now() < (v_theme ->> 'from')::timestamptz)
     or (v_theme ? 'to' and nullif(v_theme ->> 'to', '') is not null and now() > (v_theme ->> 'to')::timestamptz) then
    v_theme := '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'features', (select coalesce(jsonb_object_agg(substr(s.key, 9), coalesce((s.value #>> '{}')::boolean, true)), '{}'::jsonb)
                   from public.app_settings s where s.key like 'feature\_%'),
    'theme', v_theme,
    'splash', case when jsonb_typeof(v_splash) = 'object' and v_city is not null then v_splash -> v_city end,
    'banners', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'text', b.text, 'link', b.link, 'color', b.color)
                                          order by b.created_at desc), '[]'::jsonb)
                  from public.promo_banners b
                 where b.active and (b.city is null or b.city = v_city)
                   and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now())));
exception when others then
  -- Ayar bozuk yazıldıysa uygulama varsayılan görünümle açılır
  return jsonb_build_object('features', '{}'::jsonb, 'theme', '{}'::jsonb, 'banners', '[]'::jsonb);
end $$;
revoke execute on function public.app_look(text) from public, anon;
grant execute on function public.app_look(text) to authenticated;


-- ---------------------------------------------------------------------
-- Uygulama eğitimi ve hoş geldin ekranı: her hesapta bir kez (telefondan bağımsız). Yalnızca görüldüğü an saklanır.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists tour_done_at timestamptz;

create or replace function public.my_tour_done()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.tour_done_at is not null from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.mark_tour_done()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.profiles set tour_done_at = coalesce(tour_done_at, now()) where id = auth.uid();
end $$;
revoke execute on function public.my_tour_done() from public, anon;
revoke execute on function public.mark_tour_done() from public, anon;
grant execute on function public.my_tour_done() to authenticated;
grant execute on function public.mark_tour_done() to authenticated;


notify pgrst, 'reload schema';
