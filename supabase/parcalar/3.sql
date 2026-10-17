-- PARÇA 3 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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
               (4, 'Çatı Katı', 'Meydan Müdavimi'), (5, chr(52) || chr(49) || '. Kat', 'Şehrin Yıldızı')) as x(lvl, old_name, new_name)
 where l.level = x.lvl and l.name = x.old_name;
-- Puanla premium kazanılmaz: eski sürümden kalan seviye ödülleri kaldırılır
update public.levels set reward_package = null where reward_package is not null;

insert into public.app_settings (key, value, description) values
  ('post_requires_premium', 'false', 'Akışta yeni gönderi yazmak için abonelik gerekli mi? (Paket 31: herkes yazabilir; abone ayrıcalığı özel mesaj başlatmak)'),
  ('games_require_premium', 'false', 'Oyun odalarına katılmak için abonelik gerekli mi? (varsayılan: hayır, herkes katılır)'),
  ('event_fee_waived_for_premium', 'true', 'Aboneler moderatörün (PeopleHere) ücretli etkinliklerinden muaf mı?'),
  ('free_monthly_event_quota', '1', 'Ücretsiz üyenin ayda açabileceği etkinlik sayısı (moderatör sınırsız)'),
  ('free_monthly_game_quota', '3', 'Ücretsiz üyenin ayda başlatabileceği oyun sayısı, çekiliş hariç (moderatör sınırsız)'),
  ('premium_monthly_event_quota', '4', 'Abonenin ayda açabileceği etkinlik sayısı (moderatör sınırsız)'),
  ('level_quiz_mult_pct', '120', 'Seviye ödülü (quiz_mult): Bilgi Yarışması puanı ve puan sınırları çarpanı, yüzde (120 = 1.2 kat)'),
  ('premium_monthly_game_quota', '10', 'Abonenin ayda başlatabileceği oyun sayısı, çekiliş hariç (moderatör sınırsız)'),
  ('room_presence_grace_seconds', '45', 'Uzaktan oyun: oyun ekranından uzaklaşan (uygulamayı kapatan, arka plana alan, bağlantısı kopan) oyuncu kaç saniye sonra oyundan atılır?'),
  ('room_side_presence_grace_seconds', '300', 'Yan yana oyun: uygulamayı kapatan oyuncu kaç saniye içinde geri dönerse oyuna kaldığı yerden devam eder (sonra oyundan atılır; oda sahibiyse oda kapanır)'),
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
-- Katılım 30 (PeopleHere Özel 40), etkinlik açma 15, gelen her katılımcı için düzenleyene 10 (ayda en çok 250).
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
-- PeopleHere Özel her basamakta +10. Bilgi Yarışması ve düzenleyen puanı değişmez.
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
  ('event_overlap_minutes', '120', 'Saat çakışması: başlangıçları kaç dakikadan yakın olan iki etkinliğe aynı gün birden katılınamaz? (0 = kapalı)'),
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

-- Hukuki metinlerin ilk taslağı (avukat incelemesinden geçecek). Köşeli parantezli [ALANLAR] doldurulmalı.
-- Yalnızca metin hâlâ "henüz eklenmedi" durumundaysa yazılır; sonradan düzenlediğin metne dokunulmaz.
-- Biçim: "## " ile başlayan satır bölüm başlığı, "• " ile başlayan satır madde olarak görünür.
update public.app_settings set value = to_jsonb($legal$PeopleHere olarak kişisel verilerine önem veriyoruz. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca hangi verilerini neden ve nasıl işlediğimizi, kimlerle paylaştığımızı ve haklarını anlatır.

## 1. Veri sorumlusu
• Unvan: [VERİ SORUMLUSUNUN ADI / UNVANI]
• Adres: [ADRES]
• İletişim: [E-POSTA ADRESİ]

## 2. Hangi verilerini işliyoruz?
• Kimlik ve hesap bilgileri: gerçek adın, kullanıcı adın (yalnızca giriş için; hiçbir üyeye gösterilmez), şifren ve kurtarma kelimelerin (ikisi de yalnızca geri çevrilemeyen şifreli özet olarak saklanır).
• Rumuz ve avatar: sistemin her hafta sana rastgele verdiği takma ad ve avatar.
• Cihaz bilgisi: telefonunun kimliğinin geri çevrilemeyen özeti (Android'de telefonun kalıcı cihaz kimliğinden üretilir). Telefon kimliğinin kendisi saklanmaz.
• Yaklaşık konum: tam konumun sunucularımıza hiç gönderilmez ve kaydedilmez. Telefonun, konumunu yalnızca yaklaşık 500 metrelik bir bölge numarasına ("petek") çevirir ve sadece bu numara gönderilir. Bu yalnızca sen bir işlem yaptığında olur: gönderiye yer eklerken, petek akışını açarken, "Buradayım" derken, yan yana oyun açarken ya da bir oyuna girerken, etkinlik katılımını doğrularken, hazine kodu girerken. Konumun sürekli takip edilmez, uygulama arka plandayken konumuna bakılmaz.
• Paylaştığın içerikler: akış gönderileri, yorumlar, tepkiler, özel mesajlar, oyun içi sohbet ve fısıltılar, etkinlik yorumları, mekân değerlendirmeleri, Moderatör ile yazışmaların.
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
• Bildirimler 60 gün tutulur. Moderatör yazışmaları görüşme bitince, 90 gün hareketsiz kalırsa kendiliğinden silinir.
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
update public.app_settings set value = to_jsonb($legal$PeopleHere'e hoş geldin! Bu sözleşme, uygulamayı kullanırken senin ve bizim hak ve sorumluluklarımızı anlatır. Hesap oluşturarak bu sözleşmeyi kabul etmiş olursun.

## 1. Taraflar
Bu sözleşme, [VERİ SORUMLUSUNUN ADI / UNVANI] ("PeopleHere", "biz") ile uygulamaya üye olan kişi ("üye", "sen") arasındadır.

## 2. Üyelik
• Üye olmak için 18 yaşını doldurmuş olmalısın. [AVUKAT DEĞERLENDİRMESİ: yaş sınırı]
• Gerçek adını doğru yazmalısın. Gerçek adını yalnızca bir kez değiştirebilirsin; "PeopleHere", "Moderatör" ve "Yönetici" içeren adlar kullanılamaz.
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
• Başka bir kişiyi, moderatörü ya da PeopleHere'i taklit etmek,
• Uygulamanın güvenliğini aşmaya çalışmak, otomatik araç kullanmak.

## 6. Puanlar, sıralama ve hile
• Puanların, seviyelerin ve başarımların parasal bir değeri yoktur; satılamaz, devredilemez, paraya çevrilemez.
• Birden fazla hesap kullanmak, sahte konum kullanmak, katılım ya da oyun kodlarını orada olmayan kişilerle paylaşmak, aynı kişilerle anlaşarak yapay puan toplamak hiledir.
• Hile tespit edilirse ilgili puanlar geri alınabilir, hesap sıralamadan çıkarılabilir, susturulabilir ya da kalıcı olarak yasaklanabilir.
• Puan kuralları ve sınırları uygulama içinde açıklanır ve zaman zaman değişebilir.

## 7. Etkinlikler ve buluşmalar
• Üyelerin açtığı etkinliklerin düzenleyeni o etkinliğin içeriğinden, güvenliğinden ve doğruluğundan sorumludur. PeopleHere bu etkinliklerin düzenleyeni değildir.
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
Uygulamanın adı, logosu, tasarımı ve yazılımı PeopleHere'e aittir. Paylaştığın içeriklerin sorumluluğu sana aittir; bu içerikleri uygulamada göstermemiz için bize ücretsiz ve sınırlı bir kullanım izni vermiş olursun.

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

-- Kara petekleri: İstanbul, Kocaeli, İzmir (tools/harita_hazirla.py üretir; uygulamadaki src/lib/maps/*.json ile aynı).
-- Petek 500 m; her şehir kendi merkezine göre hesaplanır. Göller kara değildir; kıyıdaki mekânların petekleri dahildir.
delete from public.map_land_ranges;
insert into public.map_land_ranges (r, q0, q1, district) values
(-40,69,71,0),
(-40,74,74,0),
(-39,68,75,0),
(-39,108,109,2),
(-38,68,79,0),
(-38,107,111,2),
(-37,67,79,0),
(-37,107,112,2),
(-36,66,80,0),
(-36,106,113,2),
(-35,65,80,0),
(-35,106,114,2),
(-34,65,81,0),
(-34,105,115,2),
(-33,65,81,0),
(-33,102,103,1),
(-33,104,117,2),
(-32,65,81,0),
(-32,95,102,1),
(-32,103,117,2),
(-31,64,82,0),
(-31,93,101,1),
(-31,102,117,2),
(-30,64,81,0),
(-30,91,101,1),
(-30,102,115,2),
(-30,116,120,3),
(-29,63,81,0),
(-29,88,100,1),
(-29,101,114,2),
(-29,115,122,3),
(-28,63,82,0),
(-28,84,101,1),
(-28,102,113,2),
(-28,114,122,3),
(-27,63,82,0),
(-27,83,102,1),
(-27,103,113,2),
(-27,114,123,3),
(-26,62,81,0),
(-26,82,101,1),
(-26,102,112,2),
(-26,113,123,3),
(-25,61,80,0),
(-25,81,100,1),
(-25,101,112,2),
(-25,113,123,3),
(-24,61,79,0),
(-24,80,99,1),
(-24,100,111,2),
(-24,112,123,3),
(-23,60,78,0),
(-23,79,99,1),
(-23,100,108,2),
(-23,109,109,3),
(-23,110,111,2),
(-23,112,123,3),
(-22,61,78,0),
(-22,79,97,1),
(-22,98,108,2),
(-22,109,122,3),
(-21,63,79,0),
(-21,80,97,1),
(-21,98,108,2),
(-21,109,122,3),
(-20,62,78,0),
(-20,79,96,1),
(-20,97,109,2),
(-20,110,122,3),
(-19,63,79,0),
(-19,80,95,1),
(-19,96,107,2),
(-19,108,122,3),
(-18,63,76,0),
(-18,77,94,1),
(-18,95,107,2),
(-18,108,122,3),
(-17,62,75,0),
(-17,76,92,1),
(-17,93,106,2),
(-17,107,121,3),
(-16,64,74,0),
(-16,75,92,1),
(-16,93,105,2),
(-16,106,121,3),
(-15,68,75,0),
(-15,76,92,1),
(-15,93,105,2),
(-15,106,121,3),
(-14,71,73,0),
(-14,74,92,1),
(-14,93,105,2),
(-14,106,119,3),
(-13,76,90,1),
(-13,91,103,2),
(-13,104,118,3),
(-12,79,89,1),
(-12,90,91,2),
(-12,95,103,2),
(-12,104,120,3),
(-11,82,88,1),
(-11,89,90,2),
(-11,97,98,11),
(-11,99,103,2),
(-11,104,121,3),
(-11,125,125,3),
(-10,97,98,11),
(-10,99,101,2),
(-10,102,125,3),
(-9,96,97,11),
(-9,98,101,2),
(-9,102,126,3),
(-8,79,81,9),
(-8,82,83,8),
(-8,95,97,11),
(-8,98,100,2),
(-8,101,125,3),
(-7,41,42,4),
(-7,78,81,9),
(-7,82,87,8),
(-7,95,96,11),
(-7,97,99,2),
(-7,100,124,3),
(-6,38,42,4),
(-6,76,80,9),
(-6,81,86,8),
(-6,87,96,11),
(-6,97,98,2),
(-6,99,100,11),
(-6,101,109,3),
(-6,110,110,11),
(-6,111,124,3),
(-5,37,42,4),
(-5,43,44,6),
(-5,53,55,7),
(-5,58,59,7),
(-5,75,80,9),
(-5,81,85,8),
(-5,86,102,11),
(-5,103,107,3),
(-5,108,111,11),
(-5,112,123,3),
(-4,36,42,4),
(-4,43,48,6),
(-4,52,60,7),
(-4,70,80,9),
(-4,81,85,8),
(-4,86,103,11),
(-4,104,106,3),
(-4,107,111,11),
(-4,112,115,3),
(-4,116,116,11),
(-4,117,123,3),
(-3,36,42,4),
(-3,43,50,6),
(-3,51,59,7),
(-3,60,78,9),
(-3,79,85,8),
(-3,86,113,11),
(-3,114,114,3),
(-3,115,117,11),
(-3,118,122,3),
(-2,34,40,4),
(-2,41,51,6),
(-2,52,58,7),
(-2,59,79,9),
(-2,80,84,8),
(-2,85,120,11),
(-1,33,38,4),
(-1,39,50,6),
(-1,51,58,7),
(-1,59,78,9),
(-1,79,83,8),
(-1,84,119,11),
(0,34,34,6),
(0,35,36,4),
(0,37,51,6),
(0,52,58,7),
(0,59,78,9),
(0,79,83,8),
(0,84,119,11),
(1,33,51,6),
(1,52,58,7),
(1,59,78,9),
(1,79,83,8),
(1,84,118,11),
(2,32,34,6),
(2,35,35,5),
(2,36,50,6),
(2,51,58,7),
(2,59,77,9),
(2,78,83,8),
(2,84,117,11),
(3,33,33,6),
(3,34,34,5),
(3,35,36,6),
(3,37,38,5),
(3,39,49,6),
(3,50,58,7),
(3,59,78,9),
(3,79,82,8),
(3,83,117,11),
(4,32,32,6),
(4,33,38,5),
(4,39,48,6),
(4,49,58,7),
(4,59,78,9),
(4,79,82,8),
(4,83,117,11),
(5,33,38,5),
(5,39,48,6),
(5,49,60,7),
(5,61,78,9),
(5,79,84,8),
(5,85,116,11),
(6,33,38,5),
(6,39,47,6),
(6,48,61,7),
(6,62,78,9),
(6,79,87,8),
(6,88,116,11),
(7,32,37,5),
(7,38,46,6),
(7,47,62,7),
(7,63,77,9),
(7,78,87,8),
(7,88,118,11),
(8,31,37,5),
(8,38,46,6),
(8,47,61,7),
(8,62,77,9),
(8,78,87,8),
(8,88,118,11),
(9,31,36,5),
(9,37,46,6),
(9,47,61,7),
(9,62,78,9),
(9,79,86,8),
(9,87,118,11),
(10,31,35,5),
(10,36,45,6),
(10,46,61,7),
(10,62,77,9),
(10,78,86,8),
(10,87,118,11),
(11,31,34,5),
(11,35,46,6),
(11,47,60,7),
(11,61,76,9),
(11,77,85,8),
(11,86,100,11),
(11,101,102,10),
(11,103,117,11),
(12,33,33,5),
(12,34,47,6),
(12,48,60,7),
(12,61,76,9),
(12,77,84,8),
(12,85,99,11),
(12,100,106,10),
(12,107,116,11),
(13,34,48,6),
(13,49,58,7),
(13,59,60,6),
(13,61,76,9),
(13,77,83,8),
(13,84,98,11),
(13,99,106,10),
(13,107,116,11),
(14,34,48,6),
(14,49,54,7),
(14,55,60,6),
(14,61,75,9),
(14,76,83,8),
(14,84,96,11),
(14,97,106,10),
(14,107,114,11),
(14,117,118,10),
(15,36,52,6),
(15,53,53,7),
(15,54,60,6),
(15,61,74,9),
(15,75,83,8),
(15,84,96,11),
(15,97,107,10),
(15,108,111,11),
(15,112,113,10),
(15,116,118,10),
(16,36,60,6),
(16,61,72,9),
(16,73,82,8),
(16,83,94,11),
(16,95,106,10),
(16,107,111,11),
(16,112,117,10),
(17,35,61,6),
(17,62,70,9),
(17,71,81,8),
(17,82,93,11),
(17,94,105,10),
(17,106,111,11),
(17,112,116,10),
(18,34,61,6),
(18,62,69,9),
(18,70,81,8),
(18,82,92,11),
(18,93,104,10),
(18,105,109,11),
(18,110,115,10),
(19,33,61,6),
(19,62,69,9),
(19,70,81,8),
(19,82,93,11),
(19,94,108,10),
(19,109,109,11),
(19,110,116,10),
(20,33,61,6),
(20,62,68,9),
(20,69,79,8),
(20,80,85,11),
(20,86,86,10),
(20,87,89,11),
(20,90,90,10),
(20,91,92,11),
(20,93,115,10),
(21,33,61,6),
(21,62,67,9),
(21,68,78,8),
(21,79,83,11),
(21,84,86,10),
(21,87,89,11),
(21,90,91,10),
(21,92,92,11),
(21,93,114,10),
(22,33,60,6),
(22,61,67,9),
(22,68,77,8),
(22,78,82,11),
(22,83,86,10),
(22,87,88,11),
(22,89,114,10),
(23,35,59,6),
(23,60,66,9),
(23,67,78,8),
(23,79,81,11),
(23,82,114,10),
(24,35,59,6),
(24,60,65,9),
(24,66,72,8),
(24,73,74,10),
(24,75,77,8),
(24,78,78,10),
(24,79,81,11),
(24,82,112,10),
(25,35,51,6),
(25,54,59,6),
(25,60,64,9),
(25,65,72,8),
(25,73,111,10),
(26,35,47,6),
(26,54,58,6),
(26,59,64,9),
(26,65,71,8),
(26,72,110,10),
(27,35,45,6),
(27,54,58,6),
(27,59,63,9),
(27,64,69,8),
(27,70,107,10),
(27,109,109,10),
(28,35,45,6),
(28,54,57,6),
(28,58,63,9),
(28,64,68,8),
(28,69,106,10),
(29,35,45,6),
(29,54,58,6),
(29,59,63,9),
(29,64,68,8),
(29,69,106,10),
(30,34,44,6),
(30,55,58,6),
(30,59,62,9),
(30,63,67,8),
(30,68,105,10),
(31,33,43,6),
(31,54,57,6),
(31,58,61,9),
(31,62,66,8),
(31,67,104,10),
(32,33,42,6),
(32,53,56,6),
(32,57,61,9),
(32,62,63,8),
(32,65,65,8),
(32,66,103,10),
(33,32,41,6),
(33,52,56,6),
(33,57,60,9),
(33,66,104,10),
(34,32,40,6),
(34,52,55,6),
(34,56,56,9),
(34,67,104,10),
(35,32,33,6),
(35,35,37,6),
(35,54,54,6),
(35,67,104,10),
(36,32,32,6),
(36,68,104,10),
(37,68,104,10),
(38,67,103,10),
(39,67,102,10),
(40,67,101,10),
(41,66,100,10),
(42,66,101,10),
(43,66,66,10),
(43,72,103,10),
(44,68,103,10),
(45,67,104,10),
(46,66,104,10),
(47,65,104,10),
(48,65,105,10),
(49,65,104,10),
(50,64,70,10),
(50,72,72,10),
(50,75,76,10),
(50,80,104,10),
(51,88,103,10),
(52,89,103,10),
(53,89,103,10),
(54,92,105,10),
(55,91,105,10),
(56,92,104,10),
(57,91,103,10),
(58,93,102,10),
(59,93,100,10),
(60,93,94,10),
(942,54,54,47),
(943,54,62,47),
(944,54,63,47),
(945,54,63,47),
(946,53,63,47),
(947,37,38,12),
(947,52,62,47),
(948,37,38,12),
(948,40,40,12),
(948,52,52,47),
(948,54,61,47),
(949,36,39,12),
(949,51,53,39),
(949,54,61,47),
(950,35,38,12),
(950,50,53,39),
(950,54,61,47),
(951,24,24,12),
(951,32,34,12),
(951,36,38,12),
(951,47,54,39),
(951,55,61,47),
(952,21,21,12),
(952,30,34,12),
(952,36,37,12),
(952,45,54,39),
(952,55,62,47),
(953,29,30,12),
(953,32,33,12),
(953,43,44,35),
(953,45,54,39),
(953,55,63,47),
(954,29,29,12),
(954,32,32,12),
(954,40,44,35),
(954,45,54,39),
(954,55,63,47),
(955,38,45,35),
(955,46,54,39),
(955,55,62,47),
(956,27,27,12),
(956,36,45,35),
(956,46,53,39),
(956,54,65,47),
(957,26,27,12),
(957,35,35,38),
(957,36,45,35),
(957,46,53,39),
(957,54,65,47),
(958,26,26,12),
(958,34,36,38),
(958,37,44,35),
(958,45,53,39),
(958,54,65,47),
(959,32,40,38),
(959,41,44,35),
(959,45,53,39),
(959,54,63,47),
(960,31,39,38),
(960,40,44,35),
(960,45,52,39),
(960,53,63,47),
(961,30,39,38),
(961,40,43,35),
(961,44,46,43),
(961,47,53,39),
(961,54,62,47),
(962,29,39,38),
(962,40,43,35),
(962,44,48,43),
(962,49,55,39),
(962,56,61,47),
(963,28,39,38),
(963,40,42,35),
(963,43,48,43),
(963,49,55,39),
(963,56,62,47),
(963,64,64,39),
(964,0,2,18),
(964,25,27,34),
(964,28,38,38),
(964,39,42,40),
(964,43,48,43),
(964,49,56,39),
(964,57,62,47),
(964,63,63,39),
(965,-20,-14,23),
(965,-2,2,18),
(965,23,27,34),
(965,28,28,14),
(965,29,37,38),
(965,38,41,40),
(965,42,46,43),
(965,47,57,39),
(965,58,61,47),
(965,62,64,39),
(965,82,82,45),
(966,-22,-13,23),
(966,-11,-8,15),
(966,-4,2,18),
(966,5,5,18),
(966,20,26,34),
(966,27,28,14),
(966,29,37,38),
(966,38,40,40),
(966,41,45,43),
(966,46,56,39),
(966,57,61,47),
(966,62,63,39),
(966,79,83,45),
(967,-23,-13,23),
(967,-12,-8,15),
(967,-5,5,18),
(967,6,7,50),
(967,19,26,34),
(967,27,31,14),
(967,32,33,38),
(967,34,34,14),
(967,35,35,38),
(967,36,40,40),
(967,41,44,43),
(967,45,59,39),
(967,60,60,47),
(967,61,64,39),
(967,77,82,45),
(968,-23,-14,23),
(968,-13,-8,15),
(968,-7,-6,36),
(968,-5,5,18),
(968,6,7,50),
(968,18,25,34),
(968,26,35,14),
(968,36,40,40),
(968,41,43,43),
(968,44,64,39),
(968,75,82,45),
(969,-30,-29,25),
(969,-24,-15,23),
(969,-14,-10,15),
(969,-7,-4,36),
(969,-3,5,18),
(969,6,7,50),
(969,8,9,31),
(969,17,23,34),
(969,24,33,14),
(969,34,34,48),
(969,35,40,40),
(969,41,43,43),
(969,44,64,39),
(969,74,83,45),
(970,-32,-29,25),
(970,-24,-24,23),
(970,-23,-23,25),
(970,-22,-16,23),
(970,-15,-11,15),
(970,-8,-5,36),
(970,-4,-3,18),
(970,-2,2,17),
(970,3,4,18),
(970,5,7,50),
(970,8,12,31),
(970,16,16,49),
(970,17,21,34),
(970,22,22,49),
(970,23,25,14),
(970,26,27,48),
(970,28,28,14),
(970,29,33,48),
(970,34,39,40),
(970,40,42,43),
(970,43,64,39),
(970,74,83,45),
(971,-34,-29,25),
(971,-24,-23,25),
(971,-22,-16,23),
(971,-15,-15,29),
(971,-14,-12,15),
(971,-8,-4,36),
(971,-3,3,17),
(971,4,4,18),
(971,5,6,50),
(971,7,13,31),
(971,15,17,49),
(971,18,19,34),
(971,20,21,49),
(971,22,24,14),
(971,25,32,48),
(971,33,39,40),
(971,40,40,43),
(971,41,42,40),
(971,43,56,39),
(971,57,58,45),
(971,59,63,39),
(971,74,84,45),
(972,-36,-29,25),
(972,-25,-23,25),
(972,-22,-20,23),
(972,-19,-15,29),
(972,-14,-13,15),
(972,-9,-5,36),
(972,-4,2,17),
(972,3,4,33),
(972,5,6,50),
(972,7,13,31),
(972,15,17,49),
(972,18,18,34),
(972,19,22,49),
(972,23,32,48),
(972,33,42,40),
(972,43,55,39),
(972,56,59,45),
(972,60,61,39),
(972,72,83,45),
(973,-37,-23,25),
(973,-22,-22,23),
(973,-21,-16,29),
(973,-15,-12,15),
(973,-10,-6,36),
(973,-5,0,17),
(973,1,4,33),
(973,5,6,50),
(973,7,12,31),
(973,14,21,49),
(973,22,31,48),
(973,32,36,27),
(973,37,43,40),
(973,44,54,39),
(973,55,59,45),
(973,60,61,39),
(973,72,81,45),
(973,92,94,45),
(974,-39,-24,25),
(974,-23,-16,29),
(974,-15,-13,15),
(974,-11,-6,36),
(974,-5,-5,17),
(974,-4,-1,16),
(974,0,2,33),
(974,3,3,28),
(974,4,6,50),
(974,7,9,31),
(974,10,11,24),
(974,14,21,49),
(974,22,30,48),
(974,31,37,27),
(974,38,47,40),
(974,48,53,39),
(974,54,59,45),
(974,60,61,39),
(974,71,80,45),
(974,89,95,45),
(975,-83,-83,42),
(975,-41,-30,25),
(975,-27,-24,25),
(975,-23,-17,29),
(975,-16,-13,15),
(975,-11,-6,36),
(975,-5,0,16),
(975,1,1,33),
(975,2,2,28),
(975,3,3,20),
(975,4,4,50),
(975,5,6,30),
(975,7,8,31),
(975,9,12,24),
(975,14,20,49),
(975,21,29,48),
(975,30,38,27),
(975,39,47,40),
(975,48,49,39),
(975,50,59,45),
(975,60,61,39),
(975,69,82,45),
(975,85,96,45),
(976,-84,-81,42),
(976,-44,-31,25),
(976,-28,-25,25),
(976,-24,-18,29),
(976,-17,-14,15),
(976,-12,-7,36),
(976,-6,-1,16),
(976,0,1,28),
(976,2,4,20),
(976,5,6,30),
(976,7,7,31),
(976,8,11,24),
(976,12,12,21),
(976,15,20,49),
(976,21,25,48),
(976,26,38,27),
(976,39,46,40),
(976,47,48,39),
(976,49,61,45),
(976,63,82,45),
(976,84,96,45),
(977,-87,-80,42),
(977,-46,-31,25),
(977,-28,-25,25),
(977,-24,-19,29),
(977,-18,-15,15),
(977,-13,-8,36),
(977,-7,-3,16),
(977,-2,0,28),
(977,1,3,20),
(977,4,5,30),
(977,6,9,24),
(977,10,11,46),
(977,12,13,21),
(977,16,20,49),
(977,21,24,48),
(977,25,25,22),
(977,26,38,27),
(977,39,45,40),
(977,46,46,27),
(977,47,47,39),
(977,48,96,45),
(978,-88,-80,42),
(978,-51,-48,42),
(978,-47,-33,25),
(978,-29,-25,25),
(978,-24,-20,29),
(978,-19,-14,15),
(978,-13,-8,36),
(978,-7,-3,16),
(978,-2,-1,28),
(978,0,2,20),
(978,3,5,30),
(978,6,7,24),
(978,8,11,46),
(978,12,14,21),
(978,16,19,49),
(978,20,22,48),
(978,23,23,22),
(978,24,24,48),
(978,25,26,22),
(978,27,38,27),
(978,39,39,40),
(978,40,45,27),
(978,46,47,39),
(978,48,96,45),
(979,-88,-76,42),
(979,-57,-49,42),
(979,-48,-40,25),
(979,-39,-39,26),
(979,-38,-34,25),
(979,-30,-26,25),
(979,-25,-20,29),
(979,-19,-15,15),
(979,-14,-8,36),
(979,-7,-4,16),
(979,-3,-1,28),
(979,0,1,20),
(979,2,3,32),
(979,4,5,30),
(979,6,6,24),
(979,7,7,37),
(979,8,10,46),
(979,11,14,21),
(979,16,18,49),
(979,19,21,48),
(979,22,30,22),
(979,31,45,27),
(979,46,46,39),
(979,47,96,45),
(980,-89,-74,42),
(980,-62,-49,42),
(980,-48,-41,25),
(980,-40,-38,26),
(980,-37,-35,25),
(980,-31,-27,25),
(980,-26,-22,29),
(980,-21,-20,19),
(980,-19,-16,15),
(980,-15,-9,19),
(980,-8,-4,16),
(980,-3,-2,28),
(980,-1,0,20),
(980,1,3,32),
(980,4,4,30),
(980,5,5,24),
(980,6,7,37),
(980,8,11,46),
(980,12,13,21),
(980,16,18,49),
(980,19,19,48),
(980,20,29,22),
(980,30,46,27),
(980,47,96,45),
(981,-89,-67,42),
(981,-64,-50,42),
(981,-49,-44,25),
(981,-43,-37,26),
(981,-36,-35,25),
(981,-32,-28,25),
(981,-27,-24,29),
(981,-23,-20,19),
(981,-19,-17,15),
(981,-16,-7,19),
(981,-6,-3,28),
(981,-2,-2,20),
(981,-1,1,32),
(981,2,5,30),
(981,6,8,37),
(981,9,11,46),
(981,12,13,21),
(981,16,16,49),
(981,17,29,22),
(981,30,47,27),
(981,48,95,45),
(982,-90,-50,42),
(982,-49,-48,25),
(982,-47,-47,26),
(982,-46,-46,25),
(982,-45,-38,26),
(982,-37,-37,25),
(982,-33,-28,25),
(982,-27,-25,29),
(982,-24,-21,19),
(982,-20,-19,15),
(982,-18,-7,19),
(982,-6,-3,28),
(982,-2,0,32),
(982,1,5,30),
(982,6,7,37),
(982,8,8,46),
(982,9,9,37),
(982,10,10,46),
(982,11,13,21),
(982,16,28,22),
(982,29,47,27),
(982,48,95,45),
(983,-90,-51,42),
(983,-50,-39,26),
(983,-38,-38,25),
(983,-34,-28,25),
(983,-27,-26,29),
(983,-25,-22,19),
(983,-21,-20,15),
(983,-19,-7,19),
(983,-6,-4,28),
(983,-3,0,32),
(983,1,4,30),
(983,5,9,37),
(983,10,13,21),
(983,16,28,22),
(983,29,47,27),
(983,48,94,45),
(983,100,101,45),
(984,-91,-51,42),
(984,-50,-40,26),
(984,-39,-39,25),
(984,-35,-28,25),
(984,-27,-27,29),
(984,-26,-22,19),
(984,-21,-21,15),
(984,-20,-7,19),
(984,-6,-6,28),
(984,-5,-1,44),
(984,0,0,32),
(984,1,4,30),
(984,5,8,37),
(984,9,11,21),
(984,12,13,41),
(984,15,28,22),
(984,29,45,27),
(984,46,100,45),
(985,-91,-52,42),
(985,-51,-40,26),
(985,-39,-39,25),
(985,-36,-36,26),
(985,-35,-29,25),
(985,-28,-28,13),
(985,-27,-23,19),
(985,-22,-22,15),
(985,-21,-8,19),
(985,-7,-7,28),
(985,-6,-1,44),
(985,0,3,30),
(985,4,7,37),
(985,8,8,41),
(985,9,10,21),
(985,11,12,41),
(985,14,29,22),
(985,30,46,27),
(985,47,100,45),
(986,-92,-52,42),
(986,-51,-41,26),
(986,-40,-38,25),
(986,-37,-36,26),
(986,-35,-30,25),
(986,-29,-26,13),
(986,-25,-8,19),
(986,-7,-1,44),
(986,0,2,30),
(986,3,3,37),
(986,4,12,41),
(986,15,28,22),
(986,29,29,27),
(986,30,31,22),
(986,32,44,27),
(986,45,95,45),
(987,-92,-53,42),
(987,-52,-36,26),
(987,-35,-31,25),
(987,-30,-26,13),
(987,-25,-9,19),
(987,-8,-2,44),
(987,-1,2,30),
(987,3,12,41),
(987,15,30,22),
(987,31,43,27),
(987,44,95,45),
(988,-93,-54,42),
(988,-53,-37,26),
(988,-36,-36,13),
(988,-35,-33,25),
(988,-32,-26,13),
(988,-25,-23,19),
(988,-22,-21,13),
(988,-20,-9,19),
(988,-8,-3,44),
(988,-2,2,30),
(988,3,13,41),
(988,15,31,22),
(988,32,42,27),
(988,43,94,45),
(989,-93,-54,42),
(989,-53,-36,26),
(989,-35,-34,25),
(989,-33,-21,13),
(989,-20,-11,19),
(989,-10,-4,44),
(989,-3,1,30),
(989,2,12,41),
(989,15,32,22),
(989,33,39,27),
(989,40,40,22),
(989,41,94,45),
(990,-94,-55,42),
(990,-54,-37,26),
(990,-36,-21,13),
(990,-20,-12,19),
(990,-11,-5,44),
(990,-4,1,30),
(990,2,11,41),
(990,14,40,22),
(990,41,93,45),
(991,-94,-56,42),
(991,-55,-38,26),
(991,-37,-18,13),
(991,-17,-15,19),
(991,-14,-14,13),
(991,-13,-12,30),
(991,-11,-7,44),
(991,-6,1,30),
(991,2,10,41),
(991,12,39,22),
(991,40,93,45),
(992,-94,-56,42),
(992,-55,-38,26),
(992,-37,-18,13),
(992,-17,-16,19),
(992,-15,-14,13),
(992,-13,-12,30),
(992,-11,-9,44),
(992,-8,1,30),
(992,2,9,41),
(992,11,38,22),
(992,39,84,45),
(993,-95,-57,42),
(993,-56,-38,26),
(993,-37,-15,13),
(993,-14,-12,30),
(993,-11,-9,44),
(993,-8,1,30),
(993,2,8,41),
(993,11,36,22),
(993,37,81,45),
(994,-95,-57,42),
(994,-56,-38,26),
(994,-37,-15,13),
(994,-14,-2,30),
(994,-1,8,41),
(994,11,34,22),
(994,35,35,45),
(994,36,36,22),
(994,37,73,45),
(994,75,78,45),
(995,-93,-59,42),
(995,-58,-38,26),
(995,-37,-16,13),
(995,-15,-3,30),
(995,-2,8,41),
(995,10,34,22),
(995,35,67,45),
(996,-93,-59,42),
(996,-58,-38,26),
(996,-37,-16,13),
(996,-15,-3,30),
(996,-2,8,41),
(996,11,33,22),
(996,34,64,45),
(997,-93,-60,42),
(997,-59,-38,26),
(997,-37,-16,13),
(997,-15,-3,30),
(997,-2,8,41),
(997,11,32,22),
(997,33,54,45),
(997,60,62,45),
(998,-93,-60,42),
(998,-59,-39,26),
(998,-38,-17,13),
(998,-16,-4,30),
(998,-3,9,41),
(998,12,32,22),
(998,33,50,45),
(999,-94,-61,42),
(999,-60,-39,26),
(999,-38,-18,13),
(999,-17,-4,30),
(999,-3,9,41),
(999,12,31,22),
(999,32,47,45),
(1000,-95,-61,42),
(1000,-60,-40,26),
(1000,-39,-18,13),
(1000,-17,-6,30),
(1000,-5,9,41),
(1000,12,31,22),
(1000,32,43,45),
(1001,-96,-62,42),
(1001,-61,-41,26),
(1001,-40,-18,13),
(1001,-17,-6,30),
(1001,-5,10,41),
(1001,12,31,22),
(1001,32,40,45),
(1002,-97,-63,42),
(1002,-62,-42,26),
(1002,-41,-19,13),
(1002,-18,-6,30),
(1002,-5,10,41),
(1002,13,31,22),
(1002,32,33,45),
(1002,35,37,45),
(1003,-98,-64,42),
(1003,-63,-42,26),
(1003,-41,-21,13),
(1003,-20,-7,30),
(1003,-6,9,41),
(1003,13,30,22),
(1004,-99,-65,42),
(1004,-64,-43,26),
(1004,-42,-22,13),
(1004,-21,-9,30),
(1004,-8,9,41),
(1004,14,14,22),
(1004,19,25,22),
(1005,-99,-66,42),
(1005,-65,-44,26),
(1005,-43,-23,13),
(1005,-22,-9,30),
(1005,-8,8,41),
(1005,22,22,22),
(1006,-99,-69,42),
(1006,-68,-68,26),
(1006,-67,-67,42),
(1006,-66,-44,26),
(1006,-43,-24,13),
(1006,-23,-10,30),
(1006,-9,8,41),
(1007,-99,-70,42),
(1007,-69,-45,26),
(1007,-44,-25,13),
(1007,-24,-10,30),
(1007,-9,5,41),
(1008,-99,-71,42),
(1008,-70,-46,26),
(1008,-45,-26,13),
(1008,-25,-10,30),
(1008,-9,-6,41),
(1008,0,2,41),
(1009,-98,-72,42),
(1009,-71,-49,26),
(1009,-48,-48,13),
(1009,-47,-47,26),
(1009,-46,-27,13),
(1009,-26,-10,30),
(1009,-9,-9,41),
(1010,-97,-73,42),
(1010,-72,-49,26),
(1010,-48,-28,13),
(1010,-27,-12,30),
(1011,-96,-73,42),
(1011,-72,-50,26),
(1011,-49,-28,13),
(1011,-27,-15,30),
(1012,-96,-75,42),
(1012,-74,-50,26),
(1012,-49,-28,13),
(1012,-27,-20,30),
(1013,-96,-76,42),
(1013,-75,-50,26),
(1013,-49,-28,13),
(1013,-27,-22,30),
(1014,-96,-77,42),
(1014,-76,-50,26),
(1014,-49,-28,13),
(1014,-27,-25,30),
(1015,-96,-93,26),
(1015,-92,-78,42),
(1015,-77,-51,26),
(1015,-50,-29,13),
(1015,-28,-26,30),
(1016,-97,-93,26),
(1016,-92,-79,42),
(1016,-78,-51,26),
(1016,-50,-29,13),
(1017,-97,-93,26),
(1017,-92,-79,42),
(1017,-78,-52,26),
(1017,-51,-30,13),
(1018,-98,-93,26),
(1018,-92,-81,42),
(1018,-80,-52,26),
(1018,-51,-31,13),
(1019,-98,-94,26),
(1019,-93,-81,42),
(1019,-80,-52,26),
(1019,-51,-36,13),
(1020,-98,-95,26),
(1020,-94,-81,42),
(1020,-80,-52,26),
(1020,-51,-39,13),
(1021,-98,-95,26),
(1021,-94,-88,42),
(1021,-87,-87,26),
(1021,-86,-81,42),
(1021,-80,-53,26),
(1021,-52,-41,13),
(1022,-99,-95,26),
(1022,-94,-90,42),
(1022,-89,-83,26),
(1022,-82,-81,42),
(1022,-80,-53,26),
(1022,-52,-45,13),
(1022,-42,-42,13),
(1023,-99,-96,26),
(1023,-95,-92,42),
(1023,-91,-53,26),
(1023,-52,-48,13),
(1024,-100,-54,26),
(1024,-53,-50,13),
(1025,-100,-57,26),
(1025,-56,-52,13),
(1026,-100,-59,26),
(1026,-58,-54,13),
(1027,-101,-60,26),
(1027,-59,-56,13),
(1028,-101,-64,26),
(1028,-63,-58,13),
(1029,-101,-64,26),
(1029,-63,-61,13),
(1030,-102,-65,26),
(1030,-64,-63,13),
(1031,-100,-65,26),
(1032,-101,-67,26),
(1033,-102,-69,26),
(1034,-103,-72,26),
(1035,-103,-74,26),
(1036,-103,-76,26),
(1037,-104,-78,26),
(1038,-105,-80,26),
(1039,-105,-82,26),
(1040,-106,-84,26),
(1041,-108,-87,26),
(1042,-109,-88,26),
(1043,-111,-91,26),
(1044,-111,-93,26),
(1045,-112,-94,26),
(1046,-110,-96,26),
(1047,-110,-98,26),
(1048,-109,-99,26),
(1049,-109,-101,26),
(1050,-110,-102,26),
(1051,-110,-103,26),
(1052,-111,-105,26),
(1053,-111,-105,26),
(1054,-112,-106,26),
(1055,-111,-107,26),
(1056,-111,-109,26),
(1909,40,40,72),
(1909,42,42,72),
(1909,49,50,72),
(1910,38,45,72),
(1910,47,50,72),
(1911,36,49,72),
(1912,35,49,72),
(1913,34,50,72),
(1914,30,50,72),
(1915,30,50,72),
(1916,29,50,72),
(1916,58,59,79),
(1917,8,9,76),
(1917,28,50,72),
(1917,56,59,79),
(1917,66,67,79),
(1918,7,9,76),
(1918,26,51,72),
(1918,53,53,79),
(1918,55,59,79),
(1918,65,68,79),
(1919,6,9,76),
(1919,23,51,72),
(1919,52,60,79),
(1919,64,67,79),
(1920,5,9,76),
(1920,21,50,72),
(1920,51,59,79),
(1920,64,69,79),
(1921,5,11,76),
(1921,19,50,72),
(1921,51,59,79),
(1921,62,69,79),
(1922,4,12,76),
(1922,16,16,76),
(1922,17,49,72),
(1922,50,58,79),
(1922,61,69,79),
(1923,3,15,76),
(1923,16,48,72),
(1923,49,58,79),
(1923,60,70,79),
(1924,3,15,76),
(1924,16,48,72),
(1924,49,69,79),
(1925,2,15,76),
(1925,16,48,72),
(1925,49,69,79),
(1926,2,15,76),
(1926,16,47,72),
(1926,48,68,79),
(1927,-25,-23,80),
(1927,2,14,76),
(1927,15,47,72),
(1927,48,68,79),
(1928,-26,-23,80),
(1928,0,14,76),
(1928,15,47,72),
(1928,48,67,79),
(1929,-29,-29,80),
(1929,-26,-24,80),
(1929,0,14,76),
(1929,15,46,72),
(1929,47,63,79),
(1930,-31,-29,80),
(1930,-27,-24,80),
(1930,-2,13,76),
(1930,14,45,72),
(1930,46,62,79),
(1930,63,64,53),
(1931,-32,-25,80),
(1931,-2,13,76),
(1931,14,44,72),
(1931,45,62,79),
(1931,63,65,53),
(1932,-33,-24,80),
(1932,-3,12,76),
(1932,13,38,72),
(1932,39,39,79),
(1932,40,42,72),
(1932,43,57,79),
(1932,58,69,53),
(1933,-34,-25,80),
(1933,-5,11,76),
(1933,12,37,72),
(1933,38,39,79),
(1933,40,42,72),
(1933,43,57,79),
(1933,58,69,53),
(1933,71,71,53),
(1933,78,79,53),
(1934,-35,-25,80),
(1934,-5,11,76),
(1934,12,36,72),
(1934,37,38,79),
(1934,39,41,72),
(1934,42,57,79),
(1934,58,72,53),
(1934,75,82,53),
(1934,85,89,53),
(1935,-36,-25,80),
(1935,-6,10,76),
(1935,11,34,72),
(1935,35,37,79),
(1935,38,39,72),
(1935,40,58,79),
(1935,59,89,53),
(1936,-37,-25,80),
(1936,-10,-10,76),
(1936,-7,10,76),
(1936,11,33,72),
(1936,34,57,79),
(1936,58,88,53),
(1937,-37,-26,80),
(1937,-12,9,76),
(1937,10,33,72),
(1937,34,57,79),
(1937,58,88,53),
(1938,-40,-39,80),
(1938,-37,-26,80),
(1938,-12,9,76),
(1938,10,32,72),
(1938,33,57,79),
(1938,58,88,53),
(1939,-41,-27,80),
(1939,-13,9,76),
(1939,10,31,72),
(1939,32,56,79),
(1939,57,87,53),
(1940,-44,-27,80),
(1940,-13,8,76),
(1940,9,31,72),
(1940,32,56,79),
(1940,57,87,53),
(1941,-48,-48,59),
(1941,-45,-27,80),
(1941,-13,7,76),
(1941,8,30,72),
(1941,31,56,79),
(1941,57,87,53),
(1942,-49,-49,59),
(1942,-46,-22,80),
(1942,-14,6,76),
(1942,7,29,72),
(1942,30,55,79),
(1942,56,86,53),
(1943,-51,-49,59),
(1943,-47,-18,80),
(1943,-15,4,76),
(1943,5,29,72),
(1943,30,30,79),
(1943,31,33,72),
(1943,34,56,79),
(1943,57,86,53),
(1944,-53,-47,59),
(1944,-46,-17,80),
(1944,-16,4,76),
(1944,5,32,72),
(1944,33,58,79),
(1944,59,86,53),
(1945,-60,-56,59),
(1945,-54,-47,59),
(1945,-46,-18,80),
(1945,-17,4,76),
(1945,5,31,72),
(1945,32,58,79),
(1945,59,86,53),
(1946,-61,-57,59),
(1946,-54,-48,59),
(1946,-47,-18,80),
(1946,-17,4,76),
(1946,5,31,72),
(1946,32,58,79),
(1946,59,86,53),
(1947,-63,-56,59),
(1947,-54,-49,59),
(1947,-48,-19,80),
(1947,-18,3,76),
(1947,4,30,72),
(1947,31,58,79),
(1947,59,86,53),
(1948,-64,-56,59),
(1948,-54,-49,59),
(1948,-48,-20,80),
(1948,-19,2,76),
(1948,3,30,72),
(1948,31,58,79),
(1948,59,86,53),
(1949,-65,-47,59),
(1949,-46,-20,80),
(1949,-19,2,76),
(1949,3,30,72),
(1949,31,57,79),
(1949,58,88,53),
(1950,-66,-46,59),
(1950,-45,-20,80),
(1950,-19,1,76),
(1950,2,29,72),
(1950,30,56,79),
(1950,57,88,53),
(1951,-72,-45,59),
(1951,-44,-20,80),
(1951,-19,-14,76),
(1951,-13,-10,80),
(1951,-9,0,76),
(1951,1,28,72),
(1951,29,55,79),
(1951,56,88,53),
(1952,-73,-44,59),
(1952,-43,-20,80),
(1952,-19,-15,76),
(1952,-14,-10,80),
(1952,-9,-1,76),
(1952,0,26,72),
(1952,27,29,58),
(1952,30,54,79),
(1952,55,87,53),
(1953,-73,-46,59),
(1953,-45,-20,80),
(1953,-19,-15,76),
(1953,-14,-10,80),
(1953,-9,-1,76),
(1953,0,18,72),
(1953,19,19,63),
(1953,20,24,72),
(1953,25,30,58),
(1953,31,52,79),
(1953,53,86,53),
(1954,-74,-47,59),
(1954,-46,-10,80),
(1954,-9,-3,76),
(1954,-2,17,72),
(1954,18,24,63),
(1954,25,31,58),
(1954,32,34,79),
(1954,35,38,58),
(1954,39,52,79),
(1954,53,84,53),
(1955,-74,-74,59),
(1955,-70,-48,59),
(1955,-47,-15,80),
(1955,-14,-13,64),
(1955,-12,-9,80),
(1955,-8,-3,76),
(1955,-2,10,72),
(1955,11,11,65),
(1955,12,15,72),
(1955,16,24,63),
(1955,25,38,58),
(1955,39,49,79),
(1955,50,52,68),
(1955,53,83,53),
(1956,-70,-49,59),
(1956,-48,-17,80),
(1956,-16,-12,64),
(1956,-11,-11,80),
(1956,-10,-10,64),
(1956,-9,-4,76),
(1956,-3,-3,72),
(1956,-2,-2,65),
(1956,-1,-1,72),
(1956,0,0,65),
(1956,1,7,72),
(1956,8,11,65),
(1956,12,24,63),
(1956,25,37,58),
(1956,38,46,79),
(1956,47,52,68),
(1956,53,83,53),
(1957,-71,-48,59),
(1957,-47,-18,80),
(1957,-17,-5,64),
(1957,-4,1,65),
(1957,2,4,72),
(1957,5,10,65),
(1957,11,22,63),
(1957,23,37,58),
(1957,38,44,79),
(1957,45,52,68),
(1957,53,83,53),
(1958,-71,-63,59),
(1958,-61,-49,59),
(1958,-48,-32,80),
(1958,-30,-18,80),
(1958,-17,-6,64),
(1958,-5,1,65),
(1958,2,3,72),
(1958,4,8,65),
(1958,9,19,63),
(1958,20,20,58),
(1958,21,21,63),
(1958,22,37,58),
(1958,38,41,79),
(1958,42,51,68),
(1958,52,52,53),
(1958,53,55,68),
(1958,56,82,53),
(1959,-72,-72,59),
(1959,-70,-65,59),
(1959,-61,-49,59),
(1959,-48,-34,80),
(1959,-30,-19,80),
(1959,-18,-6,64),
(1959,-5,8,65),
(1959,9,18,63),
(1959,19,35,58),
(1959,36,39,79),
(1959,40,55,68),
(1959,56,61,53),
(1959,62,62,68),
(1959,63,81,53),
(1960,-71,-68,59),
(1960,-66,-66,59),
(1960,-61,-51,59),
(1960,-50,-35,80),
(1960,-30,-19,80),
(1960,-18,-6,64),
(1960,-5,9,65),
(1960,10,17,63),
(1960,18,34,58),
(1960,35,38,79),
(1960,39,62,68),
(1960,63,68,53),
(1960,69,69,68),
(1960,70,80,53),
(1961,-71,-69,59),
(1961,-67,-66,59),
(1961,-62,-61,59),
(1961,-59,-52,59),
(1961,-51,-36,80),
(1961,-31,-19,80),
(1961,-18,-6,64),
(1961,-5,-2,65),
(1961,-1,-1,74),
(1961,0,8,65),
(1961,9,17,63),
(1961,18,34,58),
(1961,35,36,79),
(1961,37,63,68),
(1961,64,67,53),
(1961,68,68,68),
(1961,69,74,53),
(1961,76,79,53),
(1962,-73,-70,59),
(1962,-63,-62,59),
(1962,-59,-52,59),
(1962,-51,-37,80),
(1962,-32,-19,80),
(1962,-18,-7,64),
(1962,-6,-4,65),
(1962,-3,-1,74),
(1962,0,8,65),
(1962,9,16,63),
(1962,17,33,58),
(1962,34,68,68),
(1962,69,73,53),
(1962,78,78,53),
(1963,-73,-70,59),
(1963,-63,-63,59),
(1963,-57,-52,59),
(1963,-51,-38,80),
(1963,-34,-18,80),
(1963,-17,-8,64),
(1963,-7,-5,65),
(1963,-4,-1,74),
(1963,0,8,65),
(1963,9,12,63),
(1963,13,33,58),
(1963,34,68,68),
(1963,69,72,53),
(1964,-74,-70,59),
(1964,-57,-51,59),
(1964,-50,-38,80),
(1964,-34,-18,80),
(1964,-17,-7,64),
(1964,-6,-1,74),
(1964,0,5,65),
(1964,6,6,52),
(1964,7,9,65),
(1964,10,11,63),
(1964,12,34,58),
(1964,35,68,68),
(1964,69,72,53),
(1965,-75,-71,59),
(1965,-56,-52,59),
(1965,-51,-38,80),
(1965,-34,-24,80),
(1965,-21,-18,80),
(1965,-17,-8,64),
(1965,-7,-1,74),
(1965,0,4,65),
(1965,5,6,52),
(1965,7,11,65),
(1965,12,34,58),
(1965,35,68,68),
(1965,69,71,53),
(1966,-75,-75,59),
(1966,-73,-72,59),
(1966,-56,-52,59),
(1966,-51,-39,80),
(1966,-35,-27,80),
(1966,-20,-18,80),
(1966,-17,-11,64),
(1966,-10,-1,74),
(1966,0,1,65),
(1966,2,6,52),
(1966,7,10,65),
(1966,11,20,58),
(1966,21,21,57),
(1966,22,33,58),
(1966,34,68,68),
(1967,-56,-53,59),
(1967,-52,-40,80),
(1967,-36,-27,80),
(1967,-25,-25,80),
(1967,-18,-12,64),
(1967,-11,-2,74),
(1967,-1,0,65),
(1967,1,4,52),
(1967,5,10,65),
(1967,11,19,58),
(1967,20,21,57),
(1967,22,31,58),
(1967,32,68,68),
(1968,-57,-53,59),
(1968,-52,-41,80),
(1968,-37,-28,80),
(1968,-15,-12,64),
(1968,-11,-1,74),
(1968,0,3,52),
(1968,4,10,65),
(1968,11,18,58),
(1968,19,21,57),
(1968,22,30,58),
(1968,31,68,68),
(1969,-57,-53,59),
(1969,-52,-42,80),
(1969,-37,-29,80),
(1969,-9,-2,74),
(1969,-1,2,52),
(1969,3,9,65),
(1969,10,17,58),
(1969,18,21,57),
(1969,22,29,58),
(1969,30,67,68),
(1970,-58,-53,59),
(1970,-52,-43,80),
(1970,-37,-30,80),
(1970,-8,-3,74),
(1970,-2,1,52),
(1970,2,2,65),
(1970,3,4,71),
(1970,5,8,65),
(1970,9,16,58),
(1970,17,21,57),
(1970,22,28,58),
(1970,29,66,68),
(1971,-58,-54,59),
(1971,-53,-44,80),
(1971,-37,-31,80),
(1971,-7,-4,74),
(1971,-3,1,52),
(1971,2,2,71),
(1971,4,8,71),
(1971,9,15,58),
(1971,16,21,57),
(1971,22,26,58),
(1971,27,28,57),
(1971,29,65,68),
(1972,-60,-58,59),
(1972,-56,-53,59),
(1972,-52,-45,80),
(1972,-38,-32,80),
(1972,-6,-5,74),
(1972,-4,0,52),
(1972,4,12,71),
(1972,13,24,57),
(1972,25,25,58),
(1972,26,27,57),
(1972,28,65,68),
(1973,-60,-59,59),
(1973,-56,-52,59),
(1973,-51,-46,80),
(1973,-38,-33,80),
(1973,-5,-5,74),
(1973,-4,-4,52),
(1973,6,12,71),
(1973,13,27,57),
(1973,28,64,68),
(1974,-62,-60,59),
(1974,-56,-53,59),
(1974,-52,-49,80),
(1974,-37,-34,80),
(1974,6,10,71),
(1974,11,27,57),
(1974,28,64,68),
(1975,-57,-57,80),
(1975,-56,-54,59),
(1975,-53,-48,80),
(1975,-37,-37,80),
(1975,-35,-35,80),
(1975,6,10,71),
(1975,11,26,57),
(1975,27,63,68),
(1976,-58,-49,80),
(1976,6,10,71),
(1976,11,25,57),
(1976,26,62,68),
(1977,-59,-52,80),
(1977,-50,-50,80),
(1977,-13,-12,60),
(1977,6,9,71),
(1977,10,25,57),
(1977,26,61,68),
(1978,-60,-53,80),
(1978,-15,-11,60),
(1978,1,3,67),
(1978,8,9,54),
(1978,10,25,57),
(1978,26,61,68),
(1979,-61,-54,80),
(1979,-17,-10,60),
(1979,-1,3,67),
(1979,7,10,54),
(1979,11,23,57),
(1979,24,58,68),
(1980,-60,-56,80),
(1980,-18,-9,60),
(1980,-6,-6,60),
(1980,-3,3,67),
(1980,4,10,54),
(1980,11,22,57),
(1980,23,44,68),
(1980,48,57,68),
(1981,-18,-5,60),
(1981,-4,0,67),
(1981,1,9,54),
(1981,10,21,57),
(1981,22,43,68),
(1981,48,56,68),
(1982,-19,-4,60),
(1982,-3,0,67),
(1982,1,7,54),
(1982,8,21,57),
(1982,22,42,68),
(1982,49,54,68),
(1983,-20,-4,60),
(1983,-3,-1,67),
(1983,0,6,54),
(1983,7,21,57),
(1983,22,40,68),
(1983,50,53,68),
(1984,-22,-4,60),
(1984,-3,-1,67),
(1984,0,6,54),
(1984,7,21,57),
(1984,22,38,68),
(1984,50,52,68),
(1985,-23,-4,60),
(1985,-3,0,67),
(1985,1,5,54),
(1985,6,22,57),
(1985,23,37,68),
(1985,49,51,68),
(1986,-24,-4,60),
(1986,-3,1,67),
(1986,2,4,54),
(1986,5,22,57),
(1986,23,36,68),
(1986,49,49,68),
(1987,-26,-25,73),
(1987,-24,-4,60),
(1987,-3,2,67),
(1987,3,4,54),
(1987,5,21,57),
(1987,22,35,68),
(1988,-29,-26,73),
(1988,-25,-19,60),
(1988,-18,-16,73),
(1988,-15,-4,60),
(1988,-3,2,67),
(1988,3,4,54),
(1988,5,21,57),
(1988,22,34,68),
(1989,-31,-26,73),
(1989,-25,-24,60),
(1989,-23,-16,73),
(1989,-15,-13,60),
(1989,-12,-11,73),
(1989,-10,-3,60),
(1989,-2,3,67),
(1989,4,4,54),
(1989,5,20,57),
(1989,21,33,68),
(1990,-32,-12,73),
(1990,-11,-4,60),
(1990,-3,3,67),
(1990,4,20,57),
(1990,21,32,68),
(1991,-34,-11,73),
(1991,-10,-5,60),
(1991,-4,2,67),
(1991,3,4,73),
(1991,5,18,57),
(1991,21,30,68),
(1992,-34,-11,73),
(1992,-10,-7,60),
(1992,-6,0,67),
(1992,1,5,73),
(1992,6,14,57),
(1992,22,29,68),
(1993,-34,-11,73),
(1993,-10,-8,60),
(1993,-7,-7,73),
(1993,-6,-5,67),
(1993,-4,-4,73),
(1993,-3,-1,67),
(1993,0,6,73),
(1993,7,13,57),
(1993,22,27,68),
(1994,-33,6,73),
(1994,7,10,57),
(1994,23,25,68),
(1995,-33,5,73),
(1995,6,9,57),
(1996,-33,6,73),
(1996,7,7,57),
(1997,-34,5,73),
(1998,-36,-36,62),
(1998,-35,4,73),
(1999,-38,-35,62),
(1999,-34,4,73),
(2000,-39,-36,62),
(2000,-35,3,73),
(2001,-40,-36,62),
(2001,-35,3,73),
(2002,-42,-37,62),
(2002,-36,2,73),
(2003,-46,-38,62),
(2003,-37,-35,73),
(2003,-34,-33,62),
(2003,-32,2,73),
(2004,-46,-39,62),
(2004,-38,-36,73),
(2004,-35,-32,62),
(2004,-31,-29,73),
(2004,-28,-28,62),
(2004,-27,1,73),
(2005,-46,-40,62),
(2005,-39,-36,73),
(2005,-35,-33,62),
(2005,-32,-32,73),
(2005,-31,-31,62),
(2005,-30,0,73),
(2006,-49,-39,62),
(2006,-38,-37,73),
(2006,-36,-29,62),
(2006,-28,0,73),
(2007,-50,-28,62),
(2007,-27,0,73),
(2008,-51,-28,62),
(2008,-27,-1,73),
(2009,-51,-29,62),
(2009,-28,-2,73),
(2010,-52,-29,62),
(2010,-28,-28,73),
(2010,-27,-27,51),
(2010,-26,-2,73),
(2011,-52,-30,62),
(2011,-29,-27,51),
(2011,-26,-4,73),
(2012,-52,-31,62),
(2012,-30,-27,51),
(2012,-26,-6,73),
(2013,-53,-32,62),
(2013,-31,-27,51),
(2013,-26,-6,73),
(2014,-54,-32,62),
(2014,-31,-25,51),
(2014,-24,-5,73),
(2015,-54,-33,62),
(2015,-32,-24,51),
(2015,-23,-5,73),
(2016,-55,-34,62),
(2016,-33,-25,51),
(2016,-24,-6,73),
(2017,-56,-37,62),
(2017,-36,-25,51),
(2017,-24,-7,73),
(2018,-56,-37,62),
(2018,-36,-25,51),
(2018,-24,-9,73),
(2019,-56,-39,62),
(2019,-38,-25,51),
(2019,-24,-24,73),
(2019,-23,-21,51),
(2019,-20,-13,73),
(2020,-56,-41,62),
(2020,-40,-40,51),
(2020,-39,-39,62),
(2020,-38,-20,51),
(2020,-19,-14,73),
(2021,-56,-56,62),
(2021,-52,-43,62),
(2021,-41,-17,51),
(2021,-16,-16,73),
(2022,-52,-48,62),
(2022,-46,-45,62),
(2022,-41,-17,51),
(2023,-50,-48,62),
(2023,-41,-18,51),
(2024,-41,-40,51),
(2024,-38,-18,51),
(2025,-39,-19,51),
(2026,-40,-20,51),
(2027,-41,-21,51),
(2028,-42,-22,51),
(2029,-43,-23,51),
(2030,-44,-23,51),
(2031,-46,-41,51),
(2031,-38,-20,51),
(2032,-47,-42,51),
(2032,-38,-19,51),
(2033,-47,-47,51),
(2033,-45,-42,51),
(2033,-38,-19,51),
(2034,-44,-43,51),
(2034,-40,-19,51),
(2035,-41,-20,51),
(2036,-41,-21,51),
(2037,-41,-22,51),
(2037,-16,-16,55),
(2038,-39,-23,51),
(2038,-17,-17,55),
(2039,-39,-23,51),
(2039,-18,-17,55),
(2040,-38,-38,51),
(2040,-34,-24,51),
(2040,-20,-17,55),
(2041,-34,-22,51),
(2041,-21,-18,55),
(2042,-35,-23,51),
(2042,-22,-18,55),
(2043,-38,-25,51),
(2043,-24,-18,55),
(2044,-38,-26,51),
(2044,-25,-19,55),
(2045,-59,-59,61),
(2045,-38,-28,51),
(2045,-27,-16,55),
(2046,-61,-61,61),
(2046,-42,-42,55),
(2046,-38,-30,51),
(2046,-29,-16,55),
(2047,-62,-61,61),
(2047,-58,-56,61),
(2047,-45,-42,55),
(2047,-38,-32,51),
(2047,-31,-16,55),
(2047,-12,-10,55),
(2048,-63,-63,61),
(2048,-58,-55,61),
(2048,-50,-50,61),
(2048,-47,-45,61),
(2048,-44,-43,55),
(2048,-39,-34,51),
(2048,-33,-15,55),
(2048,-12,-11,55),
(2049,-62,-54,61),
(2049,-51,-51,61),
(2049,-48,-45,61),
(2049,-44,-42,55),
(2049,-39,-36,51),
(2049,-35,-11,55),
(2050,-63,-46,61),
(2050,-45,-38,55),
(2050,-37,-36,51),
(2050,-35,-11,55),
(2051,-64,-45,61),
(2051,-44,-38,55),
(2051,-37,-37,51),
(2051,-36,-11,55),
(2052,-66,-46,61),
(2052,-45,-15,55),
(2052,-12,-12,55),
(2053,-67,-46,61),
(2053,-45,-16,55),
(2054,-67,-47,61),
(2054,-46,-19,55),
(2055,-67,-47,61),
(2055,-46,-19,55),
(2056,-68,-48,61),
(2056,-47,-20,55),
(2057,-69,-49,61),
(2057,-48,-21,55),
(2058,-69,-50,61),
(2058,-49,-26,55),
(2058,-24,-23,55),
(2059,-70,-51,61),
(2059,-50,-27,55),
(2060,-72,-53,61),
(2060,-52,-28,55),
(2061,-71,-53,61),
(2061,-52,-28,55),
(2062,-71,-53,61),
(2062,-52,-29,55),
(2063,-72,-53,61),
(2063,-52,-29,55),
(2064,-72,-54,61),
(2064,-53,-29,55),
(2065,-71,-55,61),
(2065,-54,-30,55),
(2066,-69,-56,61),
(2066,-55,-30,55),
(2067,-69,-56,61),
(2067,-55,-29,55),
(2068,-68,-57,61),
(2068,-56,-30,55),
(2069,-66,-58,61),
(2069,-57,-30,55),
(2070,-66,-58,61),
(2070,-57,-30,55),
(2071,-67,-59,61),
(2071,-58,-31,55),
(2072,-68,-59,61),
(2072,-58,-31,55),
(2073,-69,-56,61),
(2073,-55,-31,55),
(2074,-70,-56,61),
(2074,-55,-32,55),
(2075,-71,-55,61),
(2075,-54,-32,55),
(2076,-72,-55,61),
(2076,-54,-32,55),
(2077,-73,-55,61),
(2077,-54,-33,55),
(2077,-29,-27,55),
(2078,-74,-55,61),
(2078,-54,-34,55),
(2078,-30,-27,55),
(2079,-75,-55,61),
(2079,-54,-33,55),
(2079,-31,-27,55),
(2080,-77,-54,61),
(2080,-53,-27,55),
(2081,-79,-54,61),
(2081,-53,-28,55),
(2081,-24,-24,55),
(2082,-80,-55,61),
(2082,-54,-22,55),
(2083,-85,-85,61),
(2083,-83,-55,61),
(2083,-54,-19,55),
(2084,-85,-55,61),
(2084,-54,-17,55),
(2085,-85,-56,61),
(2085,-55,-17,55),
(2086,-85,-58,61),
(2086,-57,-18,55),
(2087,-84,-59,61),
(2087,-58,-17,55),
(2088,-85,-61,61),
(2088,-60,-17,55),
(2089,-84,-64,61),
(2089,-63,-17,55),
(2090,-84,-67,61),
(2090,-66,-18,55),
(2091,-84,-70,61),
(2091,-69,-18,55),
(2092,-83,-72,61),
(2092,-71,-19,55),
(2093,-83,-73,61),
(2093,-72,-20,55),
(2094,-83,-81,61),
(2094,-79,-79,61),
(2094,-78,-78,55),
(2094,-77,-74,61),
(2094,-73,-20,55),
(2095,-79,-20,55),
(2096,-79,-20,55),
(2097,-79,-21,55),
(2098,-79,-21,55),
(2099,-79,-22,55),
(2100,-79,-23,55),
(2101,-78,-72,55),
(2101,-70,-24,55),
(2102,-77,-74,55),
(2102,-69,-25,55),
(2103,-70,-25,55),
(2104,-71,-26,55),
(2105,-71,-28,55),
(2106,-68,-29,55),
(2107,-67,-32,55),
(2108,-66,-33,55),
(2109,-66,-34,55),
(2110,-67,-53,55),
(2110,-51,-35,55),
(2111,-67,-54,55),
(2111,-51,-35,55),
(2112,-66,-54,55),
(2112,-48,-36,55),
(2113,-65,-55,55),
(2113,-48,-36,55),
(2114,-61,-57,55),
(2114,-48,-38,55),
(2115,-60,-60,55),
(2115,-45,-44,55),
(2115,-41,-40,55);

-- İzmir'den çıkarılan ilçeler (Tire, Ödemiş, Selçuk, Kınık, Karaburun, Beydağ, Kiraz): yer listesi ve artık haritada
-- olmayan İzmir peteklerine verilmiş adlar silinir
delete from public.places
 where city = 'izmir' and district in ('Tire', 'Ödemiş', 'Selçuk', 'Kınık', 'Karaburun', 'Beydağ', 'Kiraz');
delete from public.map_cell_names n
 where n.r between 1500 and 2499
   and not exists (select 1 from public.map_land_ranges lr where lr.r = n.r and n.q between lr.q0 and lr.q1);

-- İstanbul Boğazı: su yolunun orta hattına değen petekler artık su (iki kıyıyı birleştirmesin). Bu peteklerdeki kıyı
-- yerleri kendi ilçelerindeki en yakın kara peteğine alınır (karşı yakaya geçmez). Tekrar çalışması zararsızdır.
update public.places p set q = v.q, r = v.r
  from (values
  ('888819fc-03dd-46bd-af64-ba1088224e4a', 13, 980),
  ('eb36448e-34b3-473f-b758-6b7362c854bb', 13, 981),
  ('e309a482-0ced-470e-8efc-c708d8cbbdf3', 13, 983),
  ('3cc68f84-d229-493c-ad68-f276ec68a8c8', 13, 982),
  ('ab6bd4fd-383d-451d-8062-45807aa67c04', 13, 983),
  ('fcb79077-3df6-4b33-a38f-56e662107132', 13, 981),
  ('e8d268bc-3179-481d-9be2-1b7a32566bbc', 13, 981),
  ('c414f387-dca7-4a3d-85ec-1402810705e9', 13, 981),
  ('3de509b1-eb8c-43ee-bd2a-d5bb6dde62de', 14, 978),
  ('8a5bc352-47c1-4287-9b7b-c1b12715a59d', 13, 981),
  ('5140c8df-ff92-41f7-ad02-4d9ecf54d1ed', 13, 983),
  ('5b165184-ce70-45ff-99fa-7de827377c04', 13, 981),
  ('495155e0-31e1-4aa5-a328-f7b3f70baa5d', 14, 979),
  ('cb15fb50-b717-4e71-ad53-a2c00e953b6c', 13, 982),
  ('31ed5e50-2354-4948-a32c-83a922bf68b9', 13, 983),
  ('5754c767-47a4-4e72-9032-d3887f517562', 13, 981),
  ('b836ae8e-9e98-45e3-8fe4-fb010d64801b', 13, 981),
  ('dad180a4-f4d9-4c3d-bf55-a5bc66c83f8e', 13, 981),
  ('87be5078-0692-4cee-bc2b-22e83335d73b', 13, 981),
  ('c8a751fa-a64d-4db6-a6be-895a9294b0fe', 13, 981),
  ('9a13215b-1c66-4ab9-8e33-418822f585c2', 13, 981),
  ('133e35a6-e9b5-4889-a544-0744abfe8c26', 13, 981),
  ('b785bdbb-f9b0-4a4e-89a1-3f85485f31ed', 13, 981),
  ('6fafacaf-e3a6-459a-b42e-99eade4b5eec', 13, 981),
  ('a481d8ac-6c13-4965-adfd-32a5c04de345', 13, 981),
  ('5fc3a193-dd8f-4cfa-b8cf-b8596b58cfc3', 13, 981),
  ('79fa5305-7659-41cd-b851-720b155b2640', 13, 981),
  ('2c958617-3585-4a13-8549-73209ebc8a5b', 13, 981),
  ('395044da-be8e-4393-81fa-34975216c1b8', 13, 981),
  ('201fe2d9-a29a-466a-93da-b8c0f1827411', 13, 981),
  ('24bbacc0-3cbb-4c2f-be6b-8a369c8f23da', 13, 981),
  ('fe1e9093-449e-4240-9c6c-5134f353ae90', 13, 981),
  ('0cb1a7fd-bdb3-4a44-9653-42c14332b82d', 13, 981),
  ('6a5eeb22-e86c-476a-a3f1-bf53fe3c2a96', 13, 980),
  ('3c36a2b8-608f-4ab8-a890-8ac616e8b81b', 14, 979),
  ('77e257fc-e20b-4cdf-92e1-88d84aad5591', 13, 981),
  ('a33207ca-4672-4720-93a2-c141d4e95b60', 13, 981),
  ('d4366cee-f854-4b63-ac55-640fff28884a', 13, 981),
  ('ef69f5ae-6646-47d5-b760-f5c80245807e', 13, 981),
  ('c6b9c5d9-8611-4786-9dda-397d4fb47d4f', 13, 981),
  ('57c2f801-a5a5-4a8c-b271-ee353221b8a0', 13, 983),
  ('abfbf817-99c8-4770-ae04-6265c80d6636', 13, 982),
  ('3fb62c31-5e53-48b3-a384-101f6c79ba9e', 13, 983),
  ('bb07cf9c-d11b-464c-ae58-978124495395', 13, 983),
  ('33c14d2a-ee13-4c5c-9b27-e86106f78e90', 13, 981),
  ('bbcf1d40-13a8-4c2e-9cb3-89924fb5e384', 13, 983),
  ('e8eebd98-b060-4106-b526-5dca5b5cf017', 13, 981),
  ('1c02a344-644c-4e88-a2d8-78a38820a039', 13, 982),
  ('08800ab2-d904-4834-b884-f43bd8cd16fd', 13, 981),
  ('4212b153-746d-406d-be82-e4a674215b2b', 13, 981),
  ('80c1be28-2d04-4008-b870-4c9bb853f083', 13, 978),
  ('37a145f3-6d64-458d-a619-43ce4f2f7109', 13, 978),
  ('2d1cc78e-6a4e-48fc-aaf9-a290a600ebe5', 13, 981),
  ('76f5e012-b676-432e-85d4-8e7519f1e2bd', 13, 981),
  ('95066868-dbd2-4abc-8cc6-ab8fd1c6d9a5', 13, 981),
  ('981a0863-cf9a-43f8-b811-ae21cc9cb309', 13, 981),
  ('80479dc1-ed20-4a04-a03f-c33d26911f7a', 13, 981),
  ('5340fb80-03cd-4c04-94f8-4132eaa07118', 13, 981),
  ('a5dd4926-03d9-41f8-83ca-751f81f02b08', 13, 982),
  ('65bf2e0d-b26b-47d9-9682-de7fb9fea332', 13, 978),
  ('38841715-038f-448b-9b74-7692fd5453de', 13, 980),
  ('c3850921-fb12-4f83-a3e2-b6eee26691d7', 13, 983),
  ('cdfb41b4-faa8-42f4-948b-2d80a2ace672', 13, 981),
  ('289a2714-7221-451f-af20-efa690141179', 13, 983),
  ('a9f0ed05-fbbd-4772-a7ca-967863e6d398', 13, 983),
  ('9165b336-4542-427b-b0ed-cba458479b2e', 13, 983),
  ('7fc66aef-5d7b-4979-b939-831857eb8f2f', 13, 981),
  ('0bebacdb-ccdb-4343-be0d-f5bb232f7570', 13, 982),
  ('b17ec957-9aed-420e-8098-0e319a10dff8', 14, 979),
  ('1ebd7320-cfbf-4699-b634-20ef7bb17671', 14, 978),
  ('fc464cef-84db-4e8e-8e4d-b38599ba881f', 13, 982),
  ('577de168-f5e9-4913-b597-89b6893b5859', 14, 979),
  ('dfe84650-e926-4cf0-a7d5-370fc896f3b2', 14, 978),
  ('b9cb401c-3e44-4ea1-9afd-1ba229b3325a', 13, 977),
  ('9a4e82e8-cb9b-409a-ab56-329a0f20cb51', 14, 978),
  ('617e3a38-68ae-4a79-a2de-dd88e5ee2f72', 13, 981),
  ('2739aa42-d2c9-4ef5-b8c8-33e80d59732f', 13, 981),
  ('ebf01646-2ff5-4add-aca1-41d7e027f0a7', 13, 981),
  ('d955347f-89e4-4543-b1ce-ed899b3132bd', 14, 978),
  ('cc5c3b08-3115-4db7-8a3f-713cff63bbe4', 13, 983),
  ('3d6d69f4-1d8e-4935-9531-ce522ae96cff', 13, 981),
  ('be97d001-00f6-49be-b1c2-553a31477d53', 13, 981),
  ('77493ab2-02b1-496f-bb0a-e44fe7fa59ce', 14, 978),
  ('a3cb7678-cbaf-48a5-b5b9-fe3300a97ff2', 13, 981),
  ('f772dacc-c94a-42f7-87a6-84208a21266e', 13, 983),
  ('7ebe5819-cb59-4d49-b7ba-ac1982d341e0', 13, 983),
  ('4f8271d2-47aa-432b-8af5-48a28a5b860e', 13, 983),
  ('00801666-ec0c-4bd8-8331-f317d609e9a4', 13, 983),
  ('56475bb9-9bdc-4b33-887f-c02e212fa95a', 13, 983),
  ('5cc0fa27-5d3b-4ca5-8a74-9941938f0908', 13, 983),
  ('f1b8898f-1875-4f9a-8a85-c3ec888f986b', 13, 983),
  ('7b740d83-1a41-47c1-ab0f-7492b6e218c5', 13, 983),
  ('7e1170a7-f0c6-47d9-8b4c-0875ecf58eca', 13, 983),
  ('e7e942e3-8421-4e0e-b8b5-652e51d762b4', 13, 983),
  ('dd013518-4572-49d5-bb5b-62b78047dd69', 13, 981),
  ('224c95c0-0dde-457a-b3a7-0f8702556acc', 13, 982),
  ('132013b2-d021-4336-b7dc-324cbfb70fa9', 14, 978),
  ('12794a93-5f2e-4ec2-b333-a8cf292079e1', 13, 981),
  ('266976f9-f883-4bdc-8c46-d2a1a7afe18f', 13, 978),
  ('fce84b82-de26-4f17-a0f0-a7460e5c8ed4', 13, 982),
  ('b766ecc6-a287-456a-9b92-0535bbdb0d62', 14, 978),
  ('9740e810-5d59-45fc-a33c-021ecb36344b', 14, 979),
  ('9ebe00f6-da01-4861-9409-24d1b32a150a', 13, 981),
  ('ad39a1cf-b257-4890-a82c-1de718d9f46e', 13, 978),
  ('2d7b40e5-e952-4d6c-977a-45858f71c37a', 13, 981),
  ('f882bf28-3f99-4bbe-82fc-4decb0330dfa', 13, 981),
  ('2f312828-d042-4cca-b653-ed2ca24218b8', 14, 978),
  ('8c56cbf2-8190-409b-be52-66187a147fdd', 13, 981),
  ('ce878ce3-0b73-4bb5-adcb-b9a311c1a02e', 13, 983),
  ('ebaf95a9-e68b-4bf5-ae2f-70be862c075e', 13, 983),
  ('f3b452b2-534e-4611-9698-354f9e40a3ab', 13, 981),
  ('3d07d010-2e2e-4061-91e3-e1efe97b7bc5', 13, 981),
  ('a12f2be4-9ab6-41ca-87d4-2cc334fd8b10', 14, 978),
  ('c08a937f-0a73-4ef7-a0a7-4b25db48450c', 13, 983),
  ('6deae004-603a-4f19-adf4-8eb020e9826c', 13, 981),
  ('514b549b-9370-4e85-b89c-54cd31bc3ac9', 13, 982),
  ('84d36174-8639-4c4f-ab80-d4c748d5387c', 13, 981),
  ('89318739-92aa-4723-aee3-c1d78d646126', 13, 981),
  ('4f3d9e05-5992-4d2d-afc5-5428c67455e6', 13, 978),
  ('967717c3-6991-43a7-8a31-7b98e0bdedae', 13, 978),
  ('88bf2984-aa3b-4f3d-a140-e3fd454e142b', 13, 980),
  ('dfe80ac9-1996-4b4b-b98d-b7ded2f31a43', 13, 981),
  ('b8c4b9ec-109e-4a77-bbca-24cceccc4b57', 14, 978),
  ('63f0ae6e-e702-4cf6-881f-b792409d201e', 13, 981),
  ('be1f31c4-f62f-42b7-be99-96797a9bd6b9', 13, 981),
  ('ffd554fb-e827-42f3-a826-9c1e3a616dc5', 14, 978),
  ('dd2a9e8f-1974-478c-b424-860dad36884e', 13, 981),
  ('e8e79901-83f8-455f-b7ca-f727e7cbeb54', 13, 978),
  ('8109f82c-4761-401f-a776-712133493a47', 13, 982),
  ('c77cdb53-1dd2-4c25-a5c3-788451b85741', 13, 981),
  ('f2327b84-e5f4-4565-9bb5-633b079c5ce0', 13, 981),
  ('c26c8ae8-4199-4efc-a9e0-86343edbf79f', 13, 981),
  ('afa08def-afcd-4ca5-a87f-0ea7b15debe1', 13, 978),
  ('db6162af-e838-43d2-8c93-7a4c0aee31fc', 13, 981),
  ('8b8c919d-d19e-4257-9279-eab8e2e757d3', 14, 978),
  ('1061a443-c50e-4b74-9000-a44c69a3ffbc', 14, 978),
  ('ed7dcd5d-6243-4ec8-940c-a14b4fe8d1ae', 13, 981),
  ('931bf214-b401-4918-94ec-0b1496fb04f3', 13, 982),
  ('5893f51a-3c20-429f-85d3-e88a23c108f1', 14, 978),
  ('ce7661ea-7089-49e7-a0a8-b83681fca3ee', 13, 980),
  ('1dca21d9-cd00-422f-94b4-be4c273a4248', 14, 978),
  ('522884e6-9189-41ff-88bb-e2326584a961', 13, 981),
  ('f8c10c40-bcf5-4150-9bf2-b213a4c6aaf9', 13, 981),
  ('c2ea39ac-1f7e-4be2-8969-14490fd7c530', 13, 981),
  ('b085953f-e940-4366-bd47-7a94957a53cd', 13, 983),
  ('2ababee2-f86c-4137-bd7f-6618569a8963', 14, 979),
  ('51b6097c-a58f-4092-b0c5-8781b7619855', 13, 981),
  ('85408fab-a80b-4803-b8f8-c083af2c37b3', 13, 980),
  ('7271829c-2ae4-4943-a7dc-5536aaee6ca1', 13, 981),
  ('93600323-7a73-4360-939b-eb8e03d37ef2', 13, 983),
  ('794daba0-314b-4c68-8c1b-c02f4a588c29', 14, 978),
  ('80065e09-3914-4535-b701-bcd5ccf18461', 14, 978),
  ('b39ca9d6-c8f8-4e29-a7ab-ed90d0ca5917', 14, 978),
  ('a4bfdf0b-d04b-4e13-bffa-61855247bd63', 13, 981),
  ('ca3289fc-67f8-41ff-818b-a6e84c1224de', 14, 979),
  ('819aa8c9-4ed2-4a9a-8586-76986a690ca4', 14, 979),
  ('66d4345b-e550-4c89-bbd5-861524ddb3be', 14, 978),
  ('12020f36-71fc-40c0-aaec-9d5caa569d1e', 13, 983),
  ('d906b8de-cbb2-4304-b5d3-d978324c15ea', 13, 981),
  ('6c94b0a4-3686-4ab1-b4f6-7cd1a96246d3', 14, 978),
  ('bb497a9d-37da-43f0-b77d-e2d0b7204284', 13, 981),
  ('0124f28b-b759-4993-9806-5a6745ccdb4b', 13, 978),
  ('b75c66a3-3f84-459c-94b9-6bec7999f44d', 13, 981),
  ('295b6efc-920a-4881-b93b-21a87d3f838f', 13, 978),
  ('e4f23403-2f8e-42b8-8cfe-ffe95f4d370a', 13, 981),
  ('8d420cd8-b02e-421f-8823-3a59effdb4a9', 14, 978),
  ('ffebbac6-4bba-426b-8e2c-1ba12a529496', 13, 981),
  ('78ba0e33-a905-429a-bcca-8bd1992b7cbf', 13, 981),
  ('610f4aaf-46bc-41e7-818c-046f6c57ebcf', 13, 981),
  ('664ae288-4f07-43ab-8db9-0e2f618d31c1', 13, 981),
  ('d1f628a9-b827-40a9-beec-d9f512f42f09', 13, 981),
  ('49ac1585-469a-4f7c-93a3-bf766585dd5a', 13, 981),
  ('e4109a04-8827-4de9-9187-7a97d6eeb0e9', 13, 981),
  ('f6e9a465-5a41-4d00-8bb3-4537aa4a1ea7', 14, 978),
  ('c10d5993-2422-4287-b866-c8d2a92e342a', 13, 981),
  ('8e1c4b95-1345-404a-ad0d-9eb27b5b144e', 13, 983),
  ('f588d72f-8527-4c1a-832c-ef2b7a1097c2', 14, 978),
  ('78951954-3ee6-4763-85f8-734a4f52cac6', 14, 979),
  ('3b9cb1c0-776e-40c5-b4fc-03220b561c82', 13, 981),
  ('7d4c4391-f5f8-40c9-9364-4acabb633146', 13, 978),
  ('2ae9498c-ed20-4015-aeb0-703a09561a85', 13, 981),
  ('e34d947a-5b14-4dcb-a403-bb872e0fddba', 13, 981),
  ('7fbee4a4-4679-41d4-891a-b422688b6106', 14, 979),
  ('b0f7a9e0-2a50-436b-ab6b-f7e47e5e1ec7', 13, 981),
  ('69e6fa69-2594-4584-9ccf-1ca25715bb9f', 13, 978),
  ('28af531f-be29-4980-abbd-70706b464a02', 13, 978),
  ('fddd73d5-1fc6-4051-9399-be58a0366dbd', 13, 981),
  ('98b33363-ba4e-4328-a9d3-267baa3b268a', 13, 981),
  ('3c9b6d95-9fff-40f6-b4e1-bc9f191928c2', 13, 981),
  ('a27174ef-b070-438a-bc85-99a1231ce502', 13, 982),
  ('f99d4649-d832-4970-b21d-54223777c71f', 14, 978),
  ('2775b675-e9aa-4e2e-b0a9-34c8d0710886', 14, 979),
  ('e3759f1b-5476-4930-a955-a798455cd46f', 13, 981),
  ('f4d7367b-a309-4db6-a84a-1417d3bdcf2b', 13, 981),
  ('c8201d17-ceaf-4775-bdec-bef87b4568c5', 13, 981),
  ('f07f7a8b-9ec7-4502-a4b2-2ca1757808ed', 13, 981),
  ('71fca8e2-efc8-443b-ad4d-88399e114588', 13, 981),
  ('c03fc9e1-efb9-44a4-b8ac-2bb6d1038cf4', 13, 981),
  ('ff4c6e05-8b9d-42df-9d00-03a33e31fa25', 14, 978),
  ('918c5453-9d2a-4535-996a-42fb243be76c', 13, 981),
  ('b52f69cb-5ea3-4215-ab14-bd3a9c50da5b', 13, 978),
  ('36ef8262-5665-4f79-83eb-45ed44a91522', 13, 981),
  ('4be54e9b-cb80-45fd-bc69-8262dd3ffc02', 14, 978),
  ('8c355a0b-b39f-4a50-83bf-e8b1b7d23c1c', 14, 978),
  ('4eebe816-b95c-4db1-99a5-0a3d9e59c5a2', 13, 981),
  ('6bde0bc0-af56-4f89-afe9-cb1c8c5f6cff', 13, 981),
  ('de6d0f2b-db42-4b09-b899-b0b041b23381', 13, 983),
  ('5637837f-3813-4153-a2d6-0e2e58ac260d', 13, 983),
  ('212edf50-7315-4ffe-8019-72d7c52ce20c', 13, 981),
  ('5f5b3a5a-d15a-423e-8394-2ef9ac51095b', 14, 978),
  ('b1c288a2-2c28-47ab-9ab7-922b43845557', 13, 981),
  ('f3b6db3a-f8c4-4ec1-a734-ceae4735e93d', 14, 978),
  ('fe695f9a-22e0-44a9-badb-fa7703826785', 13, 983),
  ('0425d0de-5635-4fc5-b32f-2e7fa783c9c6', 14, 978),
  ('77d08afe-8fcc-46d6-bdfa-474296caed42', 14, 978),
  ('4b49ffc5-154a-4ff5-8310-87401d275d10', 13, 981),
  ('6a9521e2-9f3e-4d55-a4ab-77fa6232b584', 13, 978),
  ('04f56b02-8325-4dc9-bf98-899e509dccf0', 13, 983),
  ('9569c45f-1b69-4c0e-b3c9-9939f26b1a8c', 13, 978),
  ('0b6c2e89-5df0-4747-91e7-68c1d80ebc90', 13, 981),
  ('a9629092-25ca-47b9-aa19-1e33ec6bcf55', 13, 981),
  ('37914031-6ad0-4e25-ae58-56b2aa7470a0', 12, 977),
  ('fb56377d-f729-4aa3-bdde-32f3b5f3682c', 12, 977),
  ('8d9e433d-959b-4471-a2ab-97dc228bd3f0', 13, 978),
  ('6a987ecb-f112-4e7f-9671-9345e680aa81', 14, 978),
  ('91305d08-e31f-4671-8a5e-c797647a8c3a', 13, 981),
  ('34d58a1e-dc47-485c-9c40-a23dec0c8634', 13, 983),
  ('b84dd147-5893-4ed9-b520-3a276564abbe', 13, 983),
  ('5b3cf75f-a87c-46f8-bf28-d2999a8b2a8f', 13, 978),
  ('de9b3184-d8c6-40d4-bc9f-d8d0297d0f3a', 13, 978),
  ('0b88b5c9-5f03-46f4-aa2c-5cd812dbf6ea', 13, 981),
  ('66a07f7b-ede3-4bbd-bc8a-c24b3245d3ef', 13, 978),
  ('d49f0801-c03e-4b00-8639-034e569b7aa0', 13, 981),
  ('532325d4-c442-49bd-902f-4f870db9224a', 13, 981),
  ('26f8ece0-0dd4-4318-bb0f-3ec9f32f2c02', 13, 981),
  ('d4a73ded-87a2-4443-9ec6-0c03abbc83db', 13, 978),
  ('8ae35752-57e4-4143-b11e-c19222fcf2f4', 13, 978),
  ('91e399e9-281e-4ee5-920e-da0bb719b008', 13, 981),
  ('a953a941-3f32-4d22-9aa0-9dc42e0af7bb', 13, 978),
  ('94239e01-b42f-4a9b-bc72-7042d6a154ca', 13, 981),
  ('ef0aaa4d-492c-4be5-99c5-cc7886dc7885', 13, 981),
  ('c9614234-0175-4fb0-8813-aa3bb9c67dad', 14, 979),
  ('92d059a6-cb07-46df-b200-7dcac4e45f36', 13, 981),
  ('067d4784-8c0e-4d87-b763-f222a603d051', 13, 978),
  ('107c2e28-3803-45cf-91ef-7aa1d05ce363', 13, 983),
  ('2f83898f-7bb3-491a-ae54-1e9c3bdb680c', 13, 981),
  ('ed1adeab-9bfa-483b-8725-7d4a7c5e8f98', 13, 981),
  ('f23a6f24-4f85-413e-9944-dd53ce7dd1f4', 13, 981),
  ('ee6ff8a2-a09f-44e1-b052-b39aa89f845e', 13, 981),
  ('5026dcc1-b94a-4721-82b8-c4ce9cbad564', 13, 981),
  ('c81de641-7487-490c-8738-44df4847c05a', 13, 981),
  ('f75c3429-b54c-4755-a2c0-924d42d9531b', 14, 978),
  ('e43a810a-423f-40d9-b7aa-054702468a52', 13, 980),
  ('619c6945-5f8b-4fec-bd12-d7cc7818b806', 13, 981),
  ('539704a4-014e-497c-955d-abb442b2b022', 14, 978),
  ('b3a4692c-6665-45e4-8eb8-06ee82fc491c', 14, 979),
  ('289fd1ea-ef04-456f-84f3-381a0bd919a5', 13, 982),
  ('c23a48d5-ab76-41a0-864b-008181873578', 13, 981),
  ('56431ef6-12fa-4c08-aec7-c78abc2e57d9', 13, 981),
  ('cce2f054-68d4-4b0d-9935-a7ac12f1231e', 13, 981),
  ('3ad5b833-c7d6-4688-91c2-74d1a2e37d3a', 14, 978),
  ('fa89355a-0089-4f2e-a0fd-dd7bdd39aeba', 13, 981),
  ('92500911-3316-4e19-87dc-000384c37041', 14, 978),
  ('e91d4d6b-c13e-41a8-9c59-73bee763bebb', 13, 981),
  ('70fa6c7d-7734-4a36-bad8-08dab60479b1', 13, 981),
  ('fb5760ce-9c08-47e4-a256-d4df7cf4875a', 13, 981),
  ('70c2d4ab-8c42-46cb-afac-a26a7b0ced0d', 13, 978),
  ('d163ae6c-f4d7-41a2-aab4-fd8beb166cbd', 13, 981),
  ('4325c355-dbeb-46f2-b3d5-76f0530ff32a', 13, 983),
  ('62be8f76-69a5-4ad0-87a7-d892d79c76da', 13, 983),
  ('6dcf710e-1b4b-4a2b-9903-44f09ea214ea', 13, 981),
  ('9e702e30-a36b-4e67-8b2e-afaeb287cd83', 13, 981),
  ('a5117e02-38b8-4410-afc1-91a4eacb2776', 13, 978),
  ('b145241f-277b-41b9-b6c7-72a026f27a52', 13, 981),
  ('86eb3a2f-0d90-4c29-92d0-a5d353652ac0', 13, 982),
  ('b0cb7a0d-a693-4363-86a2-c64930fbd988', 13, 978),
  ('d36e500e-3320-4554-8498-794960f85af9', 13, 978),
  ('177ba1c8-2865-4f04-83a0-b08fe7540f95', 14, 979),
  ('b874eed1-095a-4e76-9923-592366921403', 14, 978),
  ('5f2ca580-9654-4e68-99e3-171257c165bf', 14, 979),
  ('d49f5784-d62b-447b-b28e-a65123fd010a', 13, 981),
  ('f764de53-2d19-47d8-bc06-f82633d56c4e', 13, 978),
  ('c56f27ea-af7a-49c6-a6a2-59e93f97251a', 13, 983),
  ('4da1acc3-1721-4a11-acd1-9e76a8749d5a', 13, 981),
  ('a2cf1f41-2789-48eb-b631-59cb561fe7f5', 13, 981),
  ('d4b6504a-dcd5-42f7-bce4-34b4be2a52cd', 13, 982),
  ('742dcef8-61cb-4053-a091-a6baaa64c101', 13, 983),
  ('51494a79-ea2b-4d5c-b2c5-303870bf1378', 13, 981),
  ('373b74f6-9e2e-4644-a772-965b3f23aff3', 13, 981),
  ('c135eb44-e51f-4968-9692-d1a2cc24da9d', 13, 981),
  ('872fd0aa-f5d1-4c88-b690-f887567faba9', 13, 981),
  ('ea76fdc4-6753-4ffb-a286-5dde3bcb3aea', 13, 981),
  ('907277a5-f794-4452-93f7-9eaa4bcff9a1', 13, 978),
  ('224de4cd-83b7-46e2-96c8-530471614fe9', 13, 978),
  ('f8df87b6-f582-4c2e-9bb9-b378b227c5e2', 13, 981),
  ('90ddc0ec-c0ab-40f5-9b50-d3a34bac7e77', 13, 983),
  ('2e0b392b-9430-4980-829e-226a8dc3fdb0', 13, 981),
  ('cf2cca09-93cf-42a1-b029-ece0729a5602', 13, 981),
  ('c5949472-b88c-49f4-9aa9-120ba3b17662', 13, 982),
  ('31ac6361-c7b3-46d0-bc6a-e67c642016ae', 13, 981),
  ('2d87e9e5-d0c4-4a88-8bf4-a79f6b504d33', 13, 981),
  ('3450646b-c98b-4a25-a39d-9f936b740e41', 14, 978),
  ('a7282c95-c90f-4f02-b2e8-fadcc10a99b0', 13, 978),
  ('844abf9c-31cb-4542-a06a-94b8cb331c93', 13, 981),
  ('ce58611c-1412-4e86-b0c3-642cd1579f1c', 13, 983),
  ('63adb996-f9a9-4869-b5c7-e21794dafaef', 13, 978),
  ('f5893901-3818-430c-87a5-9bade2c4673c', 14, 978),
  ('c03383c0-b65c-46cd-ae0b-31cb71322fdd', 13, 978),
  ('7721a4c0-f8dc-46b1-ae8a-734c7647e314', 14, 979),
  ('b8627c8d-4117-4b9c-8dd3-74c3be3ac4a8', 13, 981),
  ('042f16ed-6bf3-435d-b32c-7bd2cf557359', 14, 978),
  ('8c96f3ad-a103-4f46-986c-213a32714c36', 13, 981),
  ('53770c99-4df3-4de2-a410-734c5b25ea4c', 13, 983),
  ('ee5b2bff-9c1c-4a04-afe6-a4e50b658ccb', 13, 981),
  ('e02b2a22-6c88-4154-94b4-631e76b66147', 13, 981),
  ('416e0df0-b93f-42cf-89a3-d94db4e9ebbf', 13, 983),
  ('6eadd36c-19b8-489f-b0fa-e5e47305e550', 13, 981),
  ('dda87dc7-ac96-4c6c-b9dd-7698bb450e25', 14, 978),
  ('6725573a-9278-44b6-817c-81d9579c4ff2', 13, 983),
  ('28eeb87c-418a-4a1b-9250-ecb88516ad82', 13, 983),
  ('14a2ff2a-9509-4ab1-8864-e1c489f30c61', 13, 981),
  ('e7c860bb-d0bb-4127-9c4b-09d5a18fd00b', 13, 978),
  ('60094355-2a1c-4c82-9ace-c6248f01051a', 14, 978),
  ('fdd6faff-f157-479b-ad66-345873d8be2e', 14, 978),
  ('82308b44-e2e5-4d8f-a4e4-709e6273283e', 14, 978),
  ('750bb9d5-2cee-4628-869b-83b3f3cce32d', 14, 979),
  ('a9b1d8c5-a9fe-4b26-9744-9d1b2d1ab651', 14, 978),
  ('ff0a9aa0-2ab0-44fc-94ef-83a807327ae2', 14, 978),
  ('dd7b833b-b3a9-47ac-a61b-8f0c1cec6a77', 13, 978),
  ('02ec6c60-5996-4f0a-add0-dc06ef737d73', 14, 978),
  ('a51fa321-1758-4c4b-8d1a-7b86d8dcc678', 13, 978),
  ('60aa7bb3-6299-4963-8c2f-db869a308745', 13, 978),
  ('dcaac2fd-cd78-4e3c-8883-9b6d5d3d106c', 13, 978),
  ('f30d8973-4c54-4314-98f2-75fc1a74e69e', 14, 978),
  ('7859c50d-831f-4cdd-987a-e55bd35d2163', 13, 981),
  ('f5c24267-210f-4ece-85b4-52a6b80e2dfa', 13, 981),
  ('219be9d1-deb3-4582-a410-7fd4fc969715', 13, 983),
  ('d882dd77-c763-4075-886f-d87a01b58ebc', 13, 981),
  ('eb712459-c974-4282-9bb7-34bfc103713e', 13, 981),
  ('152c3cf7-ae08-4e1a-a405-e490a5e4f051', 13, 982),
  ('006acd86-f216-48aa-876c-b1675721d238', 13, 981),
  ('c77e16be-ac86-4ad5-b233-df5e1a8e2143', 14, 978),
  ('04978cad-30b3-47b5-9f3b-5172e15d2c9b', 13, 981),
  ('65d77842-cfac-48a4-86f5-778d9790c3b4', 13, 981),
  ('8420cf52-8600-47a5-819d-fc59ff5adb00', 13, 983),
  ('295559ed-d49f-4634-ab86-d7c26dd3c918', 13, 981),
  ('225d453f-5b2f-409a-bc04-5b89cb154bb9', 13, 981),
  ('5f18196a-10df-488d-9b99-92376970aeca', 13, 981),
  ('c08f9795-914a-4f8a-9177-22eb1b8c7780', 13, 981),
  ('ede2ea3e-8bad-4f46-a5cf-0f56f373b2d4', 13, 981),
  ('9583dea3-6d69-4444-a65c-ef4c4a626bad', 13, 981),
  ('68202228-096b-4cb1-8386-1e59db0a13ae', 13, 981),
  ('df8bdf98-9f93-4051-88f3-cf7559dc2179', 13, 983),
  ('f5a5ed17-7267-4417-9feb-f61f274b2858', 13, 978),
  ('0629c67f-aeb2-4f5c-bce5-82c554bef0ae', 13, 978),
  ('4e775411-e7da-42dc-9bc8-647f9e604cdc', 13, 978),
  ('a765e128-395a-4a84-8389-a0ea5cdd1e88', 13, 981),
  ('c00141a6-8222-497a-ba6a-80b5a2edbcb9', 13, 981),
  ('9a5e634c-6f3d-4f2d-a1e5-bd1d11ad3bb1', 13, 980),
  ('b04608a2-e1f3-4a1e-829b-0d015fa67bb6', 13, 981),
  ('1291766e-43b4-4f81-af97-51e636b5e7c5', 14, 978),
  ('63a97382-14ff-4241-9d78-15bd3aa47bec', 13, 981),
  ('719773a2-20e8-4dc4-a8bf-08e69c6b8101', 13, 981),
  ('8ca2abcf-e339-42e3-b013-3d8ab93f375a', 13, 981),
  ('c85077a9-ffa7-439c-9f51-e87a56a74502', 13, 978),
  ('75c2174b-b974-4b3f-b87b-6ab36993ed24', 13, 982),
  ('4e492ff7-545d-4dce-a9f9-c033ae074808', 13, 983),
  ('af40ca12-090c-488f-b993-5069f38294bc', 13, 981),
  ('b27124f8-b54b-44a8-b68a-9e773533435d', 13, 983),
  ('fd2a7c3e-ad57-43d4-b34f-7c1ae89e227e', 13, 981),
  ('10407b3d-7a94-43bd-9a6c-3069a1064122', 13, 983),
  ('b9cd7a69-6f81-4b04-a4e4-acbbba678ef2', 13, 981),
  ('5315c385-9980-4302-99fd-f628e5bcf7e1', 13, 981),
  ('630e4cd6-13a4-4f06-b0d8-81980b74664b', 13, 981),
  ('ae3995d8-be9b-4235-b933-6267e2da1d35', 14, 978),
  ('31f8611a-62fa-4687-9b95-3255c7c345ea', 13, 981),
  ('067c7a70-79e3-4d81-86f5-71a78ccc376a', 13, 981),
  ('86d87950-513b-41b7-ae46-a412b4cbf789', 14, 979),
  ('3a6eb164-3cf5-4bcb-bdb5-013b75d71558', 13, 980),
  ('4d93d0a6-78ca-4682-9e76-9742a95ac020', 12, 977),
  ('4327ac4b-b700-49c4-aa75-04d05b162181', 13, 981),
  ('11eb8caf-13a9-4e6c-9cb2-bab8c4e5971d', 13, 981),
  ('5afbb472-be18-4648-b558-893a5817b9a9', 13, 981),
  ('3a693e5e-a01a-405d-8983-b8d860397561', 13, 982),
  ('ee036610-2b5b-4a26-8b01-0762923425a8', 13, 983),
  ('c962e730-3df1-448f-8c6a-a1936d9a427c', 13, 981),
  ('e9f57261-0bf1-49fb-9a2d-f188a4873c87', 13, 983),
  ('d1d330f5-07fd-46b6-bbb4-f6b56958eefc', 13, 981),
  ('285092b8-83e9-4bfe-80be-84687fc352ea', 13, 978),
  ('b9099dd8-c54b-4fe5-9b2a-53b076b3d053', 14, 978),
  ('f56b610e-43b3-43fc-ab86-3b878f2ad951', 13, 977),
  ('1b1c7b39-7982-4834-9c34-fed76db36581', 13, 982),
  ('c2c767f2-5e95-48c2-bada-22697d4db0b9', 13, 978),
  ('f500abb2-7379-4559-97f9-37a21ebad863', 14, 978),
  ('73c9d1e6-0c52-4c79-9acc-f750e20c3521', 13, 982),
  ('648456fc-b7eb-437e-be39-3d2c011daf5e', 13, 981),
  ('1763bb4e-991c-4311-b4fc-a60571ace411', 14, 978),
  ('fab3d560-0d11-4a14-a4ec-7a3806cd3a3c', 13, 981),
  ('5bd27cc1-e569-4b43-951a-6a758835e769', 13, 981),
  ('c36cc83e-ee64-4b3f-a5c0-0afc6975d016', 13, 981),
  ('4e028e3a-2f32-4370-9ded-3e7771ee3b06', 13, 981),
  ('135fb8f6-cf1b-402a-89c0-11263240121c', 13, 980),
  ('be5c1f4c-2e75-4c7a-9ad4-a18d06551125', 13, 981),
  ('6712730d-c34c-4562-8cae-9d1f582bf0ee', 13, 981),
  ('0af762ce-847b-4273-b7d8-d9e6aadd5ab3', 13, 981),
  ('cc73141c-c841-41f9-be75-bd34be0cf137', 13, 978),
  ('24b6d161-767a-4530-9f73-d2db5b920290', 13, 981),
  ('b594c721-9f11-4c39-a4c9-91f09e0439f9', 13, 983),
  ('f6cf9e4a-4250-4f7f-ab83-6ddf358670d3', 13, 981),
  ('9b5ce4c3-bf21-4e89-937e-a815790c2f70', 13, 977),
  ('7810f5ea-c796-4118-876b-373f45760c21', 13, 978),
  ('0368f0f2-e1d5-4abe-8b88-22dc8861c534', 13, 978),
  ('9e241529-e5db-4a64-8693-30d63db800e6', 13, 978),
  ('5a89d0d3-9d04-4012-b2ec-941e6d800846', 13, 978),
  ('257f2012-1d4a-4000-8bfe-b18f72b5a0e9', 13, 981),
  ('0fc235bd-681c-4b18-82ac-daf0e6b3eaa3', 13, 981),
  ('df0686c0-6dce-4ac5-bf40-9f2292caa785', 13, 981),
  ('611e8ade-cfa7-4c50-aadc-7f8ddf9f2201', 13, 983),
  ('935bdbf4-4644-486e-8905-46d6c1ac017c', 13, 981),
  ('9867ef3b-49ce-46a4-86e3-a8356bd3df5d', 12, 977),
  ('5b5d1b41-271f-4769-96fb-e4ca5b8886a8', 13, 981),
  ('0f3a1d0d-0bd7-4abd-8d6d-f60d5f216894', 14, 979),
  ('5f07dcf7-5685-4d6d-984d-51888f6cd2ad', 13, 978),
  ('49d7cc28-0ca9-44bb-aa9e-d485514921b8', 13, 981),
  ('7e036719-9d05-403b-ad24-99d0c91f7458', 13, 981),
  ('5483bd87-42a4-4352-9e31-10676c339eae', 13, 977),
  ('c0528d20-a860-4ba4-a8b5-7d0ffe350e13', 13, 980),
  ('629902f1-1ae3-421d-a15f-91de912f2b6d', 14, 978),
  ('9dd0de71-7166-44f7-95aa-68ccca085794', 13, 981),
  ('fe0aaada-1a5a-45d9-8519-3700f9d83cba', 13, 981),
  ('6e784957-ce9d-47ec-9cc9-2d2ae7ce4dc2', 13, 981),
  ('bddc9aba-73f6-4970-8698-2559b8a1ec67', 13, 981),
  ('934268fe-6e7f-447e-9574-319af1b341b8', 14, 978),
  ('dbff6aad-139e-471a-a134-860070e82589', 14, 979),
  ('c58b9756-f467-45e3-a67f-071293a07059', 13, 978),
  ('58d92558-262e-4a7f-9a65-16854ebde774', 13, 983),
  ('0a3f24a5-90d3-407a-adcd-90f64dba5048', 13, 981),
  ('340801ea-bea6-4dd5-b0f1-3c509e178e30', 14, 978),
  ('0a5da085-5ae5-4c74-b5cd-5230d92456c4', 14, 979),
  ('7b0bee29-c01b-404c-a4f4-0986a461e72e', 13, 978),
  ('bbe0fb12-2085-4249-aeb1-405a5b0ba6bc', 14, 978),
  ('356641ab-896a-443e-a1cb-dd4ffcc9ab87', 14, 979),
  ('f46ada99-f442-4610-ad39-8765188bcd21', 13, 981),
  ('6560c165-7352-4017-a847-28c4089e6ea9', 13, 981),
  ('eba026f5-9cea-4b8f-aa35-45c42b571697', 13, 981),
  ('8e8d2806-9f7c-472d-8c44-34d86cbb0080', 13, 981),
  ('b88260cb-3917-4ca9-b950-f8ec592c21c9', 13, 981),
  ('a9a46a17-2a65-47af-8eb5-076dd726d8eb', 13, 978),
  ('84f8d9ad-59ce-4981-ab6c-11afc081ffa5', 14, 978),
  ('f4328577-2e14-48cc-b671-4b4bb4d15ded', 13, 982),
  ('eca32606-b53c-45ab-a808-b0eddabea4f3', 14, 979),
  ('181965c0-3757-46a2-b50c-a77a22bd45b0', 13, 982),
  ('b36fad7a-213a-49e2-ac27-7f102a1946fb', 13, 981),
  ('769b69ad-64bb-4892-ad89-26c7a0295c46', 13, 981),
  ('94ea594e-87b0-4fa9-ab8d-4c076d3b5772', 13, 983),
  ('a631866f-8eb9-4b72-a00d-97c178d3d039', 13, 981),
  ('16dffb5c-c7ae-48bf-a663-41de26e739f0', 13, 981),
  ('9ae49b98-398f-4013-8218-7b8ac63edd83', 14, 985),
  ('4432f2d3-4c6e-44af-be8c-3e803423e5b4', 16, 982),
  ('2f600cc9-fa1d-4e3f-a5ec-b28f525a7ed3', 15, 984),
  ('dcd7e7e9-2248-443e-82f9-156c3bee9942', 16, 982),
  ('a4f36ed0-d68c-4fb6-a1d2-43ccc554c90f', 11, 996),
  ('6d7bf033-0f86-4b5c-a6e9-47cb91dc218b', 16, 982),
  ('abf0225b-6318-45fb-a7d6-f15856af26b3', 11, 996),
  ('0585e231-9aa8-4d68-9601-ae50da3433ee', 15, 984),
  ('407acd75-84a6-42a1-9b5b-90973d5baf31', 16, 982),
  ('d0c7b8a2-2295-4ffe-b6a8-b9c1cc61c3a4', 14, 985),
  ('9ba2ad11-d64e-4e0f-a934-b16a3620cae7', 15, 984),
  ('3d4e60a7-144e-4a5f-b659-591d266a47e8', 16, 982),
  ('2f32e72a-98a4-4baa-8ce8-786b6925f7b6', 15, 985),
  ('41c103c4-a294-403f-a1d0-a4934f97f65a', 15, 986),
  ('056d930d-5f9b-449f-97b3-7d0bd22e030f', 16, 982),
  ('6e9897a2-a90c-4dad-a990-804618ab48bf', 12, 991),
  ('db106280-9c9f-4b26-bcc0-2152b1043679', 16, 982),
  ('9665f6ad-d1bd-4a2d-9027-6049a7fb8ca9', 16, 983),
  ('34d3c794-b4df-42bb-94b9-3d2b0ab2f2ff', 16, 982),
  ('d7bcbf4e-b820-4d0c-9ee7-02eb5623b9ef', 16, 982),
  ('71b5ea58-0190-4c13-92f0-e0e49e31adc5', 16, 982),
  ('ba198b8a-2ee2-4cf2-aa5d-b2a13145ac48', 15, 984),
  ('f6305cc6-8f1f-481e-bfbe-5e39ce9f904a', 16, 983),
  ('a60bab58-e829-47cf-ba17-ea5cb3307e56', 16, 982),
  ('abfd28f4-96d2-4563-b0b1-eeee93e6e06c', 15, 986),
  ('4e3b2f1f-fe59-48ec-9ae7-fc7cb5c41651', 15, 986),
  ('f1d1e7e0-8584-4cbf-b8cc-c98b6b8babae', 16, 982),
  ('d7763f0f-d95a-4ab6-a80c-7c5126cf1124', 16, 982),
  ('d12be512-f88e-4707-a227-41124432e610', 16, 982),
  ('888fbba1-19c9-4c27-99c1-0ee35edfb6fd', 16, 982),
  ('7f43214f-ec62-4e5f-a2cc-1903a3bbc5fb', 16, 982),
  ('17507af4-1015-4651-bcd5-525a70ed5ddd', 16, 982),
  ('34779cbe-0aa5-42b6-ac4d-6346cf7a9fb5', 16, 982),
  ('5d8d40f2-763f-4ccf-a3c8-d77748a69fad', 16, 982),
  ('42116ea5-e8ae-4f01-8303-b20618a8a0bc', 16, 982),
  ('1e0f4b6d-5039-4d6c-b393-34b74fdda20f', 16, 982),
  ('05bacb79-76ae-4b74-931a-7d6fc3dd830c', 16, 982),
  ('4cccfc15-0ca3-47fa-80b5-91f02bf2ccdb', 16, 982),
  ('cb22206b-bc6a-40ad-b6d0-da75f02be5c7', 16, 982),
  ('24e8231f-7c47-4fd8-9919-2bbadc7c33e7', 16, 982),
  ('7ea9c5ba-4862-4891-8aee-7584f3d5e1ed', 15, 986),
  ('80d59c34-acd3-408b-abcb-bff239740a09', 15, 984),
  ('f823b332-c652-47b2-b02b-3d5447e2f23e', 15, 985),
  ('2b6c696f-27e6-48e5-8b47-764d50783c85', 15, 986),
  ('2105e35d-2c93-47c2-99d8-de0766757031', 16, 982),
  ('ef8fc9fc-c0f9-4de3-afa4-e32fd6ce95e7', 16, 982),
  ('cf6b5a50-262c-4fe4-806f-ed9d926834a3', 16, 982),
  ('e96cd976-58fe-42b6-aaa1-0648bab59601', 14, 985),
  ('b7a05c0a-0e75-4bd6-8887-1dfefb2a7297', 16, 982),
  ('a2081047-128a-4cf8-b576-ca8d17bb6ff4', 16, 982),
  ('19d885e2-7155-4688-b49b-1ed6597c5d12', 16, 982),
  ('9fd77dcc-2dd5-4cd8-9946-a05179dc708a', 15, 985),
  ('fb5ad693-85cf-4950-9575-79dc8d130963', 14, 985),
  ('0a7153c8-9142-4861-8565-57fd10d1de98', 14, 985),
  ('863e4c51-7028-4f75-83c2-699037b11cf1', 16, 982),
  ('85aa3df3-0675-42f4-9738-7d0aba631271', 16, 982),
  ('30cc68c0-b1c4-4e26-86f7-e07f23c847ee', 16, 982),
  ('3872d617-c492-49ea-8b98-4b9a9bed4e96', 16, 982),
  ('cb44372a-a142-47a6-81fd-bf4b15db7e98', 16, 982),
  ('61684330-6cdb-48d1-ae28-68816ca52130', 16, 982),
  ('3ae7b388-9bd3-4cff-98a7-2914067d32a4', 16, 982),
  ('df0c254f-3be5-4231-a337-1da44beaeb7b', 16, 982),
  ('dfdc84d0-a610-4fa4-8128-956141d9a1eb', 15, 984),
  ('2e4782ab-64ca-4f35-9a8d-17295cf0d42e', 16, 982),
  ('55ae6f6b-fc5f-4195-bd23-6e4e6edac1fd', 16, 982),
  ('0c59eb1b-a44e-4a21-95e6-c7d084827f1d', 11, 996),
  ('3c5b4675-aadb-4525-a7cc-2c01d2a85a68', 16, 982),
  ('3c1529a0-e2cf-4170-b54e-124849dd3897', 16, 982),
  ('bf777224-933a-4fb2-8f03-23908b9b64bd', 16, 982),
  ('138d3b04-4bca-4856-ae81-37574ab17df2', 14, 985),
  ('c94e62de-5f4b-4f0b-833c-9bef6a80c86c', 16, 982),
  ('f427b530-2ed8-4a6b-8b71-eed75429ec2f', 16, 982),
  ('5af55797-9c91-4eb2-ac4e-dba124dc4501', 16, 982),
  ('19b46f7e-b015-4ba7-b2e6-116f61db4e3a', 16, 982),
  ('3b6ca664-cd65-4589-8b69-92e4dcb594a4', 16, 982),
  ('0aff675d-943e-4e5c-be51-87c9d103871a', 16, 982),
  ('c8cd0480-c73a-4d49-a9e4-c8bc1bbfcc96', 16, 982),
  ('dfd319ff-c656-40ac-b360-1a1daf140744', 16, 982),
  ('4ad7fa12-0b08-4303-88b1-7122d8a01155', 16, 982),
  ('2bc796b2-f963-4608-8c11-0023d45c8026', 16, 982),
  ('263bb94f-e290-41d9-a17c-e40bde2081c7', 14, 985),
  ('3482c1e0-e14b-4262-b94c-a394742d8dd3', 16, 982),
  ('c88c9a4b-6a02-422e-83a0-17c5a1c282d5', 15, 984),
  ('d8c9596d-d263-4fcc-aeb2-6a22319caf18', 16, 982),
  ('8687d02c-3168-4122-9249-cd76f7456c92', 15, 986),
  ('4327ce78-d28d-477f-9e68-b0ad8e3d02f9', 16, 982),
  ('0a64b226-cb1e-4cab-a44f-072eed961279', 16, 982),
  ('ca149eeb-ee88-4b7e-b036-6dce540067c4', 16, 982),
  ('821ab155-1190-48d0-ad44-7fe5217b09e1', 16, 982),
  ('9d881c0e-a174-4f3c-9f8a-764a5c1a3b19', 16, 982),
  ('6fd13468-d49a-44de-a9a1-13d75a0f0c17', 16, 982),
  ('ffc38022-1ea6-48a7-a0b0-c6d90f0e7c1e', 16, 982),
  ('8d340cf5-d481-4ff0-9ed0-574673e6193c', 14, 985),
  ('38800407-501f-4619-aad5-6020eff63baa', 16, 982),
  ('6336d02b-a771-4c38-a7a2-f99d6faf83b2', 16, 982),
  ('cc648f7f-7cd3-4124-9b9d-76d2ac7223c1', 15, 986),
  ('f7e9548e-8533-4c2b-a4fb-ea6b36b60b24', 16, 982),
  ('6068ef94-88b7-4e36-9be7-326d53509a0a', 16, 982),
  ('2263e303-58c1-4d2f-852a-623399d0f849', 16, 982),
  ('b4c3de02-f26d-42a2-991e-b702979ff211', 16, 982),
  ('e2447c5f-f657-48c4-9306-86f62644c502', 16, 982),
  ('276899bd-53c3-4fd9-9616-1ba6796d0a6c', 15, 984),
  ('779baf81-009f-43ae-a543-abb49136c77d', 14, 985),
  ('a2aa49a5-8805-408e-a9fd-2b55cf573855', 16, 982),
  ('8c31313b-31d9-4443-8b49-4f1252111922', 11, 996),
  ('a4d72435-4b2c-42ce-828f-ccfa1bb23934', 15, 984),
  ('b9e30912-9aa1-4034-84d2-4fb8e941fb00', 15, 986),
  ('d167317f-982f-4d38-b88e-b69c03c08a87', 15, 986),
  ('fa4eac3f-cd78-4b36-8dd4-47c24425a993', 11, 975),
  ('4c3f273c-0df2-4691-bf78-022e425149b8', 13, 984),
  ('9e873e14-8b7a-4af8-8d0e-2b7da608f0cb', 13, 984),
  ('9d34f4db-9f6e-4fbb-8c8e-47da6b1ac55a', 13, 984),
  ('dd2ab55d-67c7-449a-8f76-466a2df97564', 8, 998),
  ('7d8c9105-ee82-44f6-85d2-1e1e8bee4f8f', 8, 997),
  ('42b359b9-9b16-47cb-b32e-6f071db6b127', 8, 998),
  ('9d463afb-d41d-4886-95ba-381f5b05b2da', 12, 985),
  ('a6655f35-ed0c-4e6d-9253-be0a12f5b40b', 13, 984),
  ('bccea206-357e-4503-97e6-58ab2b79b6b6', 13, 984),
  ('06527d61-804f-45c9-86cd-1c0988a1f6df', 8, 998),
  ('98979a5b-27ea-4f3c-87df-490f8fb29b7d', 13, 984),
  ('34c1a84d-f0bd-4eb3-80b7-74425df397e9', 13, 984),
  ('cf7a0989-6332-4fa8-ae35-0d40e1734453', 8, 997),
  ('8ad83150-aa15-4292-8f82-c2cf163d2bbe', 8, 998),
  ('ce67870a-daca-4f17-914e-a2237734c060', 8, 998),
  ('b8aefc71-5ae1-4256-be7b-e86513413f1e', 8, 997),
  ('eec8dd13-aa9a-48e7-8bcb-a0dabb9505c2', 8, 998),
  ('186672d9-3f9e-45f2-aa83-b90d7d6749c7', 12, 986),
  ('51412182-58c9-4463-9129-e996a0cc1cde', 12, 985),
  ('c6a4d709-23e9-4b7d-a00f-bc266a26ba9d', 12, 985),
  ('e7c9d0e9-b9c0-4de7-a3d6-52d5fc30ed70', 12, 985),
  ('a3e74556-8766-4e5f-9aff-0d1838efb4f4', 12, 985),
  ('cfc88f5a-507e-4005-8dc9-88f43c362095', 12, 985),
  ('a2fe53dd-c345-49cb-870e-4066c36491b9', 12, 986),
  ('4919f1a9-c184-44f4-b8a4-b47c3045343c', 12, 985),
  ('5ba41bed-d30e-4d3b-9e22-cab060d157d7', 12, 985),
  ('cc861fdc-d6eb-452f-a2e1-8a9bcc76d86a', 12, 986),
  ('72421572-cb8d-44cb-a807-b2d9bd20d8e0', 13, 984),
  ('9efe9f82-1a59-4af9-96d0-b819c0e37c1a', 12, 986),
  ('d165408f-c7b0-4b78-b69f-b987008ae745', 13, 984),
  ('ddc7ec7a-7307-44e9-acb9-b4ff2b0c5d85', 13, 984),
  ('f65d8d8d-7a4a-4a5d-a652-de757a7155cf', 8, 998),
  ('4998fa23-d7ca-4882-a026-807b027279c6', 13, 984),
  ('ae989fb8-2e41-42dd-87ac-417243ff803e', 13, 984),
  ('d6a018e3-3812-4d76-bce9-aa1649cfc700', 13, 984),
  ('fc42e5a2-65df-4a82-9933-ee2b81dfc2b9', 8, 997),
  ('1a0ace58-7c4d-4947-9d1d-3b53ca4f6570', 8, 998),
  ('2651ca12-88f5-4e0d-a167-f2a258e6cbf7', 13, 984),
  ('7cd0e711-1658-4418-be72-81ff2ed6a914', 12, 986),
  ('7931c7fe-e13b-4403-9659-b5076bebf800', 13, 984),
  ('4c1ec23d-5b27-44b6-8f40-307c6ffa29fc', 12, 985),
  ('ee0b9a72-ca8a-45a7-9dbd-0f9f305273d5', 12, 985),
  ('09c96dfd-f5b3-446f-a325-d91e883f27ad', 8, 997),
  ('c8ec3622-9ff3-4604-8636-d0166118fd50', 13, 984),
  ('b362c19e-3567-4237-bc5c-07780047aa78', 13, 984),
  ('f19c8e2a-42b9-4536-a80d-2fe49f4f6baf', 13, 984),
  ('e80a591f-ca20-4003-81f3-8f81a0ab4fa0', 12, 986),
  ('bb5028c7-0c8d-45ce-aaa0-2ad7283c9c3e', 12, 986),
  ('a9110fc5-1b52-4c8a-b22b-6704417046cd', 13, 984),
  ('0998836c-fb57-4212-b459-36efe5ce5cd0', 12, 986),
  ('78b5245b-5962-4959-b79f-63aa0d989b04', 12, 986),
  ('d8ad0c64-6edf-4121-aa80-6d280be1dac5', 13, 984),
  ('afb453d1-6509-41bf-ace8-f5f832d5c705', 13, 984),
  ('e398eb62-77df-4eb2-b50c-136844b35eec', 12, 985),
  ('0b9f69c8-f814-48e5-a8a7-b4c9851a9c84', 13, 984),
  ('6bafac60-519c-4dcd-b5f9-62bfcb103800', 12, 986),
  ('c6fe7acc-b3f7-4012-98be-6e0e52836adf', 8, 997),
  ('31b8c8a7-3729-4e26-a1f1-6954bac5ac96', 12, 985),
  ('3b804f88-d14d-438c-986b-f2a359cd6648', 8, 997),
  ('c1352945-ca15-41f5-87ac-ac11923fb421', 8, 998),
  ('6b7f74c5-bc37-4594-899b-eba771d802eb', 8, 997),
  ('91cfb939-aeb6-44e2-a774-8adeb9882573', 13, 984),
  ('777ae003-250f-46b9-ac35-633c6ab5e88b', 13, 984),
  ('af3eff58-a9dd-4b91-b4c5-3c6dd828f0bb', 8, 998),
  ('d78f8e7a-4cfa-4e5d-b6fd-8ea685bbced4', 13, 984),
  ('5cb6b064-cc84-417c-b71c-9560687cbd7b', 12, 985),
  ('d1cb6eba-bdcc-4ff8-b22a-5a320f1bc980', 12, 985),
  ('08dee5de-059b-47ba-99d6-a6d5e9a8718c', 8, 998),
  ('94816dcc-827c-4ca0-8f8d-6c19f6a0a1d4', 13, 984),
  ('b03b73c5-93fe-4b3d-a666-79888e856e3a', 8, 997),
  ('5ebdcfc2-ea57-4087-89eb-526cf36ff532', 13, 984),
  ('03081366-f44f-4d67-ad68-0083059782ae', 12, 985),
  ('f95cdc53-0de4-46e9-8a14-c3ef7eca2ead', 13, 984),
  ('942acfd0-24b2-4fac-b66a-778c7ee20117', 12, 987),
  ('26ff4615-7342-4052-9830-f02004b905d9', 13, 984),
  ('f2d8068e-e10f-4a3c-831d-e975b75cf54a', 13, 984),
  ('bd85dec0-7141-43cb-ad14-ac0fe6d8b28b', 13, 984),
  ('eb9f8998-344d-4adf-96b4-a3bfe9569d56', 13, 984),
  ('701541d1-a4ad-4055-bbe7-b2cc6fcb0203', 8, 997),
  ('6b9a8109-f6d0-42e9-9428-029a70f558be', 13, 984),
  ('afb2be25-a64b-48e3-8ccd-b27117697ff9', 12, 986),
  ('84b7d6a5-7a2d-4ddd-9476-9b02790b6c8d', 8, 998),
  ('34c418d6-88c8-40de-bb45-0a19eff3c98b', 8, 997),
  ('189aa53b-c2ec-4d88-a6dd-05d910e9fd23', 13, 984),
  ('61a59db5-84ed-47f9-a113-387e99fd9ca2', 8, 998),
  ('6552cdb8-29c2-43ba-ad9e-d1c183d92cb7', 12, 985),
  ('75ad8299-4c4c-47cb-8e51-3f93a8321964', 13, 984),
  ('698c74b7-6aaf-4c98-ba27-a3907001dd99', 8, 997),
  ('c41fe740-5b7c-4605-8afa-02a0b7233d5d', 13, 984),
  ('83898f88-d4ea-44fe-a240-332d104c50f5', 13, 984),
  ('e1922d36-3db9-491e-89f0-97c11a5195c1', 8, 997),
  ('63060371-589b-4cf4-9604-a53fb63c0dac', 13, 984),
  ('656951f9-8ed6-4eff-8572-2371fba46433', 12, 985),
  ('028c7af8-d011-4538-a97c-eec38daaebb9', 12, 986),
  ('514506a4-c469-4ee4-a769-5babc77fbc1b', 8, 998),
  ('065509c8-3a89-4b52-81c2-70aac7a1241f', 12, 985),
  ('89ff8c5e-9477-4284-92d9-649b125cc5cf', 12, 985),
  ('647abedd-0359-420e-ab3a-6cc5a5682c39', 8, 997),
  ('a8a66ee9-cb33-4f42-9fcb-2dcccdb0e1c6', 8, 998),
  ('0d801d84-b533-4fbe-b4a3-f83c8fedde4b', 13, 984),
  ('ca8bcb6e-874f-4cc2-bbb3-08b68bbddac6', 13, 984),
  ('4ff3a4e8-7f3f-4014-902b-bfc08e051969', 8, 998),
  ('cff6b3fe-f6c1-49cc-bf0d-7859ae3eeef5', 8, 997),
  ('cacd01b8-12f6-4a82-8ec6-a3b050544eb8', 8, 998),
  ('7cc0fcd5-f2ed-4921-989d-0379ddb8cb10', 13, 984),
  ('ea8150cd-a18e-45bd-8bd6-9845f373fc9e', 13, 984),
  ('6deafdf4-c05c-49f5-942c-36d6f029f8d1', 13, 984),
  ('441b2000-b7f8-469f-bbfd-3fb2ec8d036b', 13, 984),
  ('d8c9d9e7-b941-4686-a5b1-63991f9b634c', 8, 997),
  ('d9ffe47d-3af2-43a9-aebf-557415bc9228', 13, 984),
  ('01c0aa4f-268c-4adc-b0b4-9c7f49603cbe', 8, 997),
  ('a8a21e53-11fd-48fe-9f1c-2ee125098020', 8, 998),
  ('00e6bdb3-9c6b-4d5f-994f-f65f330fa592', 8, 998),
  ('a1df9276-7f33-4aec-b929-2c6bc32652da', 13, 984),
  ('4cd4b1bf-4713-484a-ad1b-c9d079f36ed3', 13, 984),
  ('ba164165-c5dd-406b-979f-f6c3de9a9d5a', 8, 997),
  ('2849d751-ff0c-4cf2-9ec4-83cb3adbfd9f', 12, 986),
  ('1dedf6c8-0009-4307-9182-a6146647a5a5', 8, 997),
  ('47fb981d-8840-4045-bfa7-99405d867433', 8, 997),
  ('8346fac8-0411-452f-ac83-9ad5fff79fa5', 13, 984),
  ('c8a47158-8265-4cfd-8a80-8f47df40d925', 13, 984),
  ('8af1bfde-d5ca-40bf-99ea-92abfda91b0d', 13, 984),
  ('f3c4ed62-acdb-4012-b2cf-979c3cfae37e', 12, 986),
  ('802ccda3-8ceb-45a5-b6a1-fa8ed71cf474', 8, 998),
  ('7fa4527c-6114-4ac0-8a3d-af6ecd3568ce', 8, 997),
  ('7a37e70b-caa6-497a-ac8a-7df70d69e0fa', 13, 984),
  ('511155aa-9852-41f7-a381-0c5b03d3d3e4', 13, 984),
  ('77ed9724-00dd-4024-a1e7-99cb5bdfe5b7', 13, 984),
  ('95aa9364-86af-4a3d-9939-ccf6058ed048', 8, 998),
  ('0c46572c-5be1-4327-b783-675a0c62d9ce', 13, 984),
  ('57324fae-c4f3-4aed-9ffa-1a876fd9bf28', 8, 998),
  ('e18c657b-2b38-4045-920c-79e10dd143f1', 12, 986),
  ('3ed212c1-9ad4-412b-9c5f-654727d3a97d', 8, 998),
  ('eef61c13-f7cc-4c79-bd03-637328da330e', 13, 984),
  ('86df4611-68e0-4485-a353-703135c3247f', 13, 984),
  ('5cd659c0-ab54-4b7a-878e-c3f99037ac0c', 8, 997),
  ('32efd533-6cd4-408c-bd44-c5bbe631cb76', 12, 987),
  ('1a879d4c-6e2b-489b-8877-4f8e178f28d7', 13, 984),
  ('edbb5876-8082-4e93-b429-6a3b67c32842', 16, 981),
  ('5afbb307-55b2-4f04-bbff-2b5e0040a2e3', 16, 981),
  ('754253a7-311f-45b1-960e-3f7d791a6c9f', 16, 980),
  ('fbeab9a2-39f3-4e0b-8822-98479cbf4727', 16, 981),
  ('31c7e541-de46-44e9-9eea-1238b6d09ea5', 16, 976),
  ('b4530e37-589c-4243-a930-6f067d5506ed', 16, 977),
  ('af3c5867-a4e8-432c-a924-d81b4218c6f4', 16, 977),
  ('ee1a1f00-4b66-4014-8031-e24cd12794ef', 16, 977),
  ('c3e632f3-545e-40aa-b6c8-d3ae61f7887b', 16, 980),
  ('e04366c6-dcc3-40ac-9c67-f9795026785e', 16, 981),
  ('a1f53fdd-ab3c-4b04-bb89-2058aba48a89', 16, 980),
  ('9af47250-dece-4c8a-8490-d6fcc42d79c9', 16, 981),
  ('b53bd6e3-55c0-44ce-a491-8f04f6c681e9', 16, 980),
  ('97b22975-4a45-4865-ac1f-ad5c1097472b', 16, 980),
  ('76ccfac2-340d-4e17-9d85-9d6579e28a8b', 16, 981),
  ('d8e16578-727e-4ff1-a759-a7970d667898', 16, 981),
  ('05aed224-b748-490f-adb6-d0f97c573952', 16, 980),
  ('53b34dac-672f-4bd1-9866-5255db74a48a', 16, 976),
  ('dc13294e-e593-4a51-a209-66b887cefaa6', 16, 981),
  ('f5fc574d-2202-428e-b63f-fa8aa8a7955e', 16, 981),
  ('9fe01300-a4b6-43e0-be13-915808fcbd7b', 15, 975),
  ('3b9d1a5d-c66b-4b39-82e3-69d7cc418de4', 16, 981),
  ('f5601f57-e2ef-4fd6-a101-d804397cb8a0', 16, 981),
  ('e4394935-7d7b-4f8e-9ffc-b4f14dba821d', 16, 981),
  ('3c4a9ec9-24a7-4050-8505-9fe3c8c97163', 16, 980),
  ('63d2aa9d-eaf5-4a02-8913-79ab93b27d99', 16, 981),
  ('6e374e9a-c6ae-47a2-ad2b-3c5a4d8717ae', 16, 981),
  ('3e28a0e2-5ec7-46e9-9f14-50407cf0a5bd', 16, 981),
  ('95e7e3b5-f5f5-4de6-b6ff-b5db02aded4c', 16, 981),
  ('41e9e10b-d85f-48fd-9898-544e81d42e94', 16, 981),
  ('3bc1c57a-ad93-40b2-98e6-3132e0941a7e', 16, 981),
  ('0f6a9f0d-acd6-4734-aa56-f4efffe1a0df', 16, 981),
  ('9b2866a4-5bb4-44c3-b714-c6c94cd03d7e', 16, 981),
  ('17a12578-90e6-4e94-b365-8596afcf64f9', 16, 981),
  ('509686c4-9e36-4154-9621-fa34d95364be', 16, 981),
  ('886c8e3d-9f35-4f52-b3ea-7ab0afe5b7ff', 16, 980),
  ('23420514-a0fe-472d-a646-752c07790005', 16, 981),
  ('0390f4a0-38c5-44d1-a058-68800584edbf', 16, 981),
  ('15652c5d-0788-4041-82a6-626de17283c1', 16, 981),
  ('96b242c0-c0b3-4210-812a-8b076527e10e', 16, 981),
  ('c401a026-15ef-496e-9662-10e616fd8bf4', 16, 977),
  ('66602cc1-3a4f-4381-b57a-ed183339946d', 16, 981),
  ('00e58cb5-9ac9-493c-a5c7-43115957f35b', 16, 980),
  ('106e77f4-fd51-44b6-a136-bc0307f90223', 16, 981),
  ('1744f28c-e517-4366-b44f-0b0d88af21db', 16, 981),
  ('9226b27a-da9f-48e4-8227-f5ee5758ed66', 16, 979),
  ('6ccefb44-26ff-4f44-a434-ddb151c604e5', 16, 976),
  ('59f4842c-7972-443f-bca5-eedff7a4d5ba', 16, 981),
  ('64baf8a5-e134-42cf-95ee-3be1a70c9f7d', 16, 981),
  ('3ffa901a-b75e-48f2-9e73-20f02816b4b2', 15, 976),
  ('6dee8b0a-d09c-44dc-b6f6-e41911fad080', 16, 981),
  ('fea93352-5ea2-46fa-b299-3c109346e714', 16, 980),
  ('a3a70ede-1eb3-43a6-9275-bb3bf4959bfe', 16, 980),
  ('736b7ecb-0e99-46fe-bd0a-1f5586bc48ab', 16, 976)
  ) as v(id, q, r)
 where p.id::text = v.id and (p.q, p.r) is distinct from (v.q, v.r);

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
    'format', 'peoplehere-veri-dosyasi-v1',
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
           (select coalesce(p.admin_real_name, p.full_name) from public.profiles p where p.alias_no = c)
      from unnest(public._reserved_alias_nos()) as c
     order by c;
end $$;

-- Moderatör: ayrılmış rumuz kodunu seç (p_code boş = kodu bırak, yeniden rastgele rumuz al). Başka moderatörün
-- kullandığı kod seçilemez. Seçilen kod haftalık yenilemede değişmez; rumuz "Moderatör#41" olur.
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
    update public.profiles set alias_no = p_code, alias = 'Moderatör#' || p_code,
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
  perform public._require_feature('mesajlar');
  perform public._require_city();
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
-- Doğrulamadan önceki gerçek ad: moderatör doğrulamayı kaldırırsa ad buna geri döner
alter table public.identity_verifications add column if not exists previous_name text;
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
  -- Kimlik doğrulama ayarla kapatılabilir (NVİ'nin ücretsiz servisi kapandı; yeni yöntem gelene kadar kapalı)
  if not public.setting_bool('identity_verification_enabled') then return 'disabled'; end if;
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

-- NVİ'ye ulaşılamadıysa son deneme günlük haktan düşülmez (servis sorunu üyenin hakkını yemesin)
create or replace function public.service_identity_refund(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.identity_attempts
   where id = (select max(id) from public.identity_attempts
                where user_id = p_user and created_at > now() - interval '2 minutes');
$$;

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
  insert into public.identity_verifications (user_id, tc_hash, previous_name) values (p_user, p_hash, v.full_name)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'used'; end if;
  update public.profiles set identity_verified_at = now(), full_name = v_name where id = p_user;
  perform public._notify(p_user, 'system', 'Hesabın doğrulandı',
    'Kimlik bilgilerin nüfus kaydıyla uyuştu. Akışta adının yanında sarı doğrulama tiki görünür.',
    jsonb_build_object('route', '/profile'));
  return 'ok';
end $$;

-- Profil resmi (abone, doğrulanmış hesap ya da moderatör; uygulamada yalnızca kamerayla çekilir). Dosya önce Storage'daki
-- "profile-photos" kutusuna <üye kimliği>/<dosya>
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
  select photo_path into v_old from public.profiles where id = v.id for update;
  -- Resim kaldırmak her zaman serbest; eklemek abonelere (ya da doğrulanmış hesaba) açık
  if p_path is not null and btrim(p_path) <> '' and not public._photo_allowed(v) then
    raise exception 'photo_requires_premium';
  end if;
  if v_path is null then
    update public.profiles set photo_path = null, photo_status = null, photo_updated_at = now() where id = v.id;
    return v_old;
  end if;
  if v.photo_updated_at is not null and v.photo_updated_at > now() - interval '30 seconds' then
    raise exception 'rate_limited';
  end if;
  -- Haftada bir değişiklik (kaldırıp yeniden eklemek de sayılır; reddedilen resim sayılmaz)
  if v.role::text <> 'admin' and v.photo_changed_at is not null and v.photo_changed_at > now() - interval '7 days' then
    raise exception 'photo_weekly_limit';
  end if;
  if v_path !~ ('^' || v.id::text || '/[A-Za-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$') then raise exception 'invalid_image'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = v_path) then
    raise exception 'invalid_image';
  end if;
  update public.profiles
     set photo_path = v_path, photo_updated_at = now(), photo_changed_at = now(),
         photo_status = case when v.role = 'admin' then 'approved' else 'pending' end,
         -- Moderatör kontrolü: 10–30 dakika içinde rastgele bir anda kendiliğinden onaylanır (moderatör bu sürede reddedebilir)
         photo_auto_at = now() + make_interval(mins => 10 + floor(random() * 21)::int)
   where id = v.id;
  return case when v_old is distinct from v_path then v_old end;
end $$;

-- Storage kuralı: yalnızca resim hakkı olan (abone / doğrulanmış / moderatör), etkin üye kendi klasörüne yükler; klasörde en
-- çok 3 dosya (eskiler silinir).
-- Haftalık değişiklik hakkı dolmuşsa yükleme de yapılamaz.
create or replace function public._profile_photo_slot_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(p_name))[1] = auth.uid()::text
     and cardinality(storage.foldername(p_name)) = 1
     and public._is_active_user()
     and exists (select 1 from public.profiles pr
                  where pr.id = auth.uid() and public._photo_allowed(pr) and pr.role::text <> 'sponsor'
                    and (pr.role::text = 'admin' or pr.photo_changed_at is null
                         or pr.photo_changed_at <= now() - interval '7 days'))
     and (select count(*) from storage.objects o
           where o.bucket_id = 'profile-photos' and (storage.foldername(o.name))[1] = auth.uid()::text) < 3;
$$;

-- Moderatör: üyenin hesap doğrulamasını kaldırır. Sarı tik ve profil resmi kalkar, gerçek ad doğrulamadan önceki ada
-- döner, TC özeti silinir: üye isterse yeniden doğrulama yapabilir (deneme sayacı da sıfırlanır). Üyeye bildirim gider.
create or replace function public.admin_revoke_identity(p_user uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prev text;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  perform public._require_admin();
  perform 1 from public.profiles where id = p_user and identity_verified_at is not null for update;
  if not found then raise exception 'not_identity_verified'; end if;
  delete from public.identity_verifications where user_id = p_user returning previous_name into v_prev;
  delete from public.identity_attempts where user_id = p_user;
  update public.profiles
     set identity_verified_at = null,
         full_name = coalesce(nullif(btrim(v_prev), ''), full_name)
   where id = p_user;
  -- Profil resmi yalnızca başka bir hakkı (abonelik) yoksa kalkar
  update public.profiles p
     set photo_path = null, photo_status = null, photo_auto_at = null
   where p.id = p_user and not public._photo_allowed(p);
  perform public._audit('identity_revoke', p_user, jsonb_build_object('note', v_note));
  perform public._notify(p_user, 'system', 'Hesap doğrulaman kaldırıldı',
    coalesce(v_note || ' ', '') || 'İstersen Profil > adının yanındaki “Doğrula” düğmesiyle yeniden doğrulama yapabilirsin.',
    jsonb_build_object('route', '/profile'));
end $$;

-- Web yönetim paneline giriş: panel, girişten hemen sonra bunu çağırır. Yalnızca moderatör hesabı için; oturum 7 gün
-- geçerlidir. Telefondaki oturum kapanmaz.
create or replace function public.admin_web_claim()
returns void language plpgsql security definer set search_path = public as $$
declare v_sid text := nullif(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and banned_at is null) then
    raise exception 'forbidden';
  end if;
  if v_sid is null then raise exception 'not_authenticated'; end if;
  delete from public.admin_web_sessions where expires_at < now();
  insert into public.admin_web_sessions (session_id, user_id, expires_at)
  values (v_sid::uuid, auth.uid(), now() + interval '7 days')
  on conflict (session_id) do update set expires_at = excluded.expires_at
   where public.admin_web_sessions.user_id = auth.uid();
  perform public._audit('web_login', auth.uid(), '{}'::jsonb);
end $$;

-- Web panelden çıkış
create or replace function public.admin_web_release()
returns void language sql security definer set search_path = public as $$
  delete from public.admin_web_sessions
   where session_id::text = (auth.jwt() ->> 'session_id') and user_id = auth.uid();
$$;

-- Moderatör hesabı her yerde herkese "Moderatör" adıyla görünür (gerçek adı admin_real_name'de saklanır; yalnızca
-- web panelde görünür). Moderatörlük kaldırılınca gerçek adı geri gelir ve web panel oturumları kapanır.
alter table public.profiles add column if not exists admin_real_name text;
create or replace function public._profile_staff_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' then
    if new.full_name is distinct from 'Moderatör' then
      new.admin_real_name := new.full_name;
      new.full_name := 'Moderatör';
    end if;
  elsif tg_op = 'UPDATE' and old.role = 'admin' then
    new.full_name := coalesce(nullif(btrim(new.admin_real_name), ''),
                              case when new.full_name = 'Moderatör' then 'Üye' else new.full_name end);
    new.admin_real_name := null;
    -- Ayrılmış rumuz kodu (#41, #1000) kişinin bir sonraki işleminde kendiliğinden bırakılır (_rotate_alias_if_needed)
    delete from public.admin_web_sessions where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_staff_name on public.profiles;
create trigger profiles_staff_name before insert or update of role, full_name on public.profiles
  for each row execute function public._profile_staff_name();
-- Mevcut moderatörler (ve eski "Kat Görevlisi#41" rumuzları)
update public.profiles set role = role where role = 'admin' and full_name is distinct from 'Moderatör';
update public.profiles set alias = 'Moderatör#' || alias_no
 where alias like 'Kat Görevlisi#%' and alias_no is not null;

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
     where pr.photo_status = 'pending' and pr.photo_auto_at > now() and pr.photo_path is not null
       and pr.banned_at is null
     order by pr.photo_updated_at asc
     limit 100;
end $$;

-- Moderatör: profil resmini onayla / reddet. p_path: incelenen dosya (bu arada değiştiyse işlem yapılmaz). Üyeye bildirim gider.
create or replace function public.admin_review_photo(p_user uuid, p_path text, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok boolean := coalesce(p_approve, false);
begin
  perform public._require_admin();
  -- Reddedilen resim profilden çıkar (dosyası moderatörün ekranında silinir) ve haftalık hak geri verilir
  update public.profiles
     set photo_status = case when v_ok then 'approved' else 'rejected' end,
         photo_path = case when v_ok then photo_path end,
         photo_changed_at = case when v_ok then photo_changed_at end
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
Bu politika, PeopleHere uygulamasını kullanırken hangi bilgilerinin işlendiğini, neden işlendiğini ve hangi haklara sahip olduğunu anlatır. Ayrıntılı yasal bilgi için KVKK aydınlatma metnine de bakabilirsin.

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
Daha çok etkinlik ve oyun açma hakkı, özel mesaj başlatma ve PeopleHere Özel ücretli etkinliklere ücretsiz katılım. Abonelik puanını ya da hediye kazanma şansını artırmaz.

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

-- ---------------------------------------------------------------------
-- Web paneli 2: trafik kayıtları (5651), veri saklama ve imha, ayar değişikliği kaydı, yedekleme
-- ---------------------------------------------------------------------

-- Trafik kayıtları (5651 sayılı Kanun, yer sağlayıcı yükümlülüğü): kim, ne zaman, hangi IP adresinden giriş yaptı ya da
-- içerik ekledi. İçeriğin kendisi burada tutulmaz. Hesap silinse de yasal süre boyunca (varsayılan 2 yıl) saklanır;
-- yalnızca mahkeme / savcılık talebinde web panelden okunur. Kimse değiştiremez ya da silemez (yalnızca süre dolunca imha).
create table if not exists public.traffic_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  username text,
  action text not null,
  object_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists traffic_log_user_idx on public.traffic_log (user_id, created_at desc);
create index if not exists traffic_log_time_idx on public.traffic_log (created_at desc);
create index if not exists traffic_log_ip_idx on public.traffic_log (ip, created_at desc);
alter table public.traffic_log enable row level security;
revoke all on public.traffic_log from anon, authenticated;

-- İsteğin geldiği IP adresi (Supabase'in ilettiği başlıktan; yoksa boş)
create or replace function public._client_ip()
returns text language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then return null;
  end;
  if h is null then return null; end if;
  return left(nullif(btrim(coalesce(split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'cf-connecting-ip',
                                    h ->> 'x-real-ip', '')), ''), 64);
end $$;

create or replace function public._traffic(p_action text, p_object uuid default null, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_ua text;
begin
  if v_user is null then return; end if;
  begin
    v_ua := left(current_setting('request.headers', true)::json ->> 'user-agent', 200);
  exception when others then v_ua := null;
  end;
  insert into public.traffic_log (user_id, username, action, object_id, ip, user_agent)
  values (v_user, (select username from public.profiles where id = v_user), left(p_action, 40), p_object,
          public._client_ip(), v_ua);
end $$;

-- İçerik eklenince trafik kaydı (tetikleyici). Argümanlar: kullanıcı sütunu, işlem adı, nesne sütunu.
create or replace function public._traffic_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  perform public._traffic(tg_argv[1], nullif(j ->> tg_argv[2], '')::uuid, nullif(j ->> tg_argv[0], '')::uuid);
  return null;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
      ('post_authors', 'author_id', 'post', 'post_id'),
      ('comment_authors', 'author_id', 'comment', 'comment_id'),
      ('dm_messages', 'sender_id', 'dm', 'id'),
      ('event_comments', 'user_id', 'event_comment', 'id'),
      ('venue_reviews', 'user_id', 'venue_review', 'id'),
      ('game_rooms', 'host_id', 'game_room', 'id'),
      ('quiz_chat', 'user_id', 'quiz_chat', 'id'),
      ('vv_whispers', 'from_user', 'vv_whisper', 'id'),
      ('events', 'created_by', 'event', 'id'),
      ('problem_reports', 'user_id', 'problem_report', 'id')
    ) as t(tbl, ucol, act, ocol)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists traffic_log_ins on public.%I', r.tbl);
      execute format('create trigger traffic_log_ins after insert on public.%I for each row '
                     'execute function public._traffic_trigger(%L, %L, %L)', r.tbl, r.ucol, r.act, r.ocol);
    end if;
  end loop;
end $$;

-- Ayar ve seviye tablolarındaki her değişiklik moderatör işlem günlüğüne yazılır (eski ve yeni değerle)
create or replace function public._audit_table_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;  -- sunucu içi (kurulum) değişiklikleri yazılmaz
  insert into public.admin_audit_log (admin_id, action, target_user, detail)
  values (auth.uid(), 'table_' || lower(tg_op), null,
          jsonb_build_object('table', tg_table_name,
                             'old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                             'new', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return null;
end $$;
drop trigger if exists app_settings_audit on public.app_settings;
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public._audit_table_change();
drop trigger if exists levels_audit on public.levels;
create trigger levels_audit after insert or update or delete on public.levels
  for each row execute function public._audit_table_change();

-- Saklama süreleri (gün). Web panel > Veri saklama ve Ayarlar'dan değiştirilebilir.
insert into public.app_settings (key, value, description) values
  ('retention_traffic_days', '730', 'Trafik kayıtları (IP, zaman) kaç gün saklanır? 5651: en az 365, en çok 730.'),
  ('retention_audit_days', '730', 'Moderatör işlem günlüğü kaç gün saklanır?'),
  ('retention_dm_days', '365', 'Son mesajından bu yana bu kadar gün geçen özel yazışmalar silinir.'),
  ('retention_reports_days', '730', 'Sonuçlanmış şikayet ve sorun bildirimleri kaç gün saklanır?')
on conflict (key) do nothing;

-- Süresi dolan kayıtları imha eder (KVKK: gereğinden uzun saklama yok). Aynı anda tek temizlik çalışır.
-- Döner: her kategoride silinen kayıt sayısı.
create or replace function public._retention_purge()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d_traffic int := least(730, greatest(365, public.setting_int('retention_traffic_days', 730)));
  d_audit int := greatest(180, public.setting_int('retention_audit_days', 730));
  d_dm int := greatest(30, public.setting_int('retention_dm_days', 365));
  d_rep int := greatest(90, public.setting_int('retention_reports_days', 730));
  n_traffic int; n_audit int; n_dm int; n_rep int; n_prob int; n_att int; n_sess int;
begin
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then return '{}'::jsonb; end if;
  delete from public.traffic_log where created_at < now() - make_interval(days => d_traffic);
  get diagnostics n_traffic = row_count;
  delete from public.admin_audit_log where created_at < now() - make_interval(days => d_audit);
  get diagnostics n_audit = row_count;
  delete from public.dm_threads where last_at < now() - make_interval(days => d_dm);
  get diagnostics n_dm = row_count;
  delete from public.reports where status <> 'open' and created_at < now() - make_interval(days => d_rep);
  get diagnostics n_rep = row_count;
  delete from public.problem_reports where status = 'closed' and created_at < now() - make_interval(days => d_rep);
  get diagnostics n_prob = row_count;
  delete from public.identity_attempts where created_at < now() - interval '30 days';
  get diagnostics n_att = row_count;
  delete from public.admin_web_sessions where expires_at < now();
  get diagnostics n_sess = row_count;
  delete from public.game_seekers where day < public._map_day();
  perform public._feed_purge();
  return jsonb_build_object('traffic', n_traffic, 'audit', n_audit, 'dm_threads', n_dm, 'reports', n_rep,
                            'problems', n_prob, 'identity_attempts', n_att, 'web_sessions', n_sess);
end $$;

-- Giriş (oturum bu telefona geçince): trafik kaydı + ara sıra imha işi
create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare v_sid text := nullif(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public._traffic('login');
  if random() < 0.05 then perform public._retention_purge(); end if;
  if v_sid is null then return; end if;
  update public.profiles set active_session = v_sid::uuid where id = auth.uid() and banned_at is null;
end $$;

-- Web panel > Veri saklama: her kategorinin kayıt sayısı, en eski kaydı ve saklama süresi
create or replace function public.admin_retention_status()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'traffic', jsonb_build_object('count', (select count(*) from public.traffic_log),
                                  'oldest', (select min(created_at) from public.traffic_log),
                                  'days', public.setting_int('retention_traffic_days', 730)),
    'audit', jsonb_build_object('count', (select count(*) from public.admin_audit_log),
                                'oldest', (select min(created_at) from public.admin_audit_log),
                                'days', public.setting_int('retention_audit_days', 730)),
    'dm', jsonb_build_object('count', (select count(*) from public.dm_messages),
                             'threads', (select count(*) from public.dm_threads),
                             'oldest', (select min(created_at) from public.dm_messages),
                             'days', public.setting_int('retention_dm_days', 365)),
    'posts', jsonb_build_object('count', (select count(*) from public.posts),
                                'oldest', (select min(created_at) from public.posts),
                                'days', public.setting_int('feed_archive_days', 365)),
    'reports', jsonb_build_object('count', (select count(*) from public.reports),
                                  'oldest', (select min(created_at) from public.reports),
                                  'days', public.setting_int('retention_reports_days', 730)),
    'notifications', jsonb_build_object('count', (select count(*) from public.notifications),
                                        'oldest', (select min(created_at) from public.notifications),
                                        'days', 60),
    'members', jsonb_build_object('count', (select count(*) from public.profiles),
                                  'verified', (select count(*) from public.profiles where identity_verified_at is not null))
  );
end $$;

-- Web panel > Veri saklama > "Şimdi temizle"
create or replace function public.admin_run_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_admin();
  v := public._retention_purge();
  perform public._audit('retention_purge', null, v);
  return v;
end $$;

-- Web panel > Trafik kayıtları: adli talep için arama (üye, kullanıcı adı, IP, tarih aralığı). Her arama günlüğe yazılır.
drop function if exists public.admin_traffic_search(text, timestamptz, timestamptz, int);
create or replace function public.admin_traffic_search(p_query text default null, p_from timestamptz default null,
                                                       p_to timestamptz default null, p_limit int default 500)
returns table (id bigint, created_at timestamptz, user_id uuid, username text, full_name text, action text,
               object_id uuid, ip text, user_agent text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_admin();
  perform public._audit('traffic_search', null, jsonb_build_object('query', q, 'from', p_from, 'to', p_to));
  return query
    select t.id, t.created_at, t.user_id, t.username, coalesce(pr.admin_real_name, pr.full_name), t.action,
           t.object_id, t.ip, t.user_agent
      from public.traffic_log t
      left join public.profiles pr on pr.id = t.user_id
     where (p_from is null or t.created_at >= p_from)
       and (p_to is null or t.created_at < p_to)
       and (q is null or t.ip = q or t.username = lower(q) or t.user_id::text = q
            or public._tr_fold(coalesce(pr.full_name, '')) like '%' || public._tr_fold(q) || '%'
            or public._tr_fold(coalesce(pr.alias, '')) = public._tr_fold(q))
     order by t.created_at desc
     limit greatest(1, least(coalesce(p_limit, 500), 5000));
end $$;

-- Çevrimiçi durumu: uygulama açıkken 5 dakikada bir "buradayım" der. Son 10 dakikada sinyal gelen üye çevrimiçi sayılır.
-- Yalnızca moderatör görür (profil satırını başkası okuyamaz). Aynı dakikada birden çok sinyal yazılmaz.
alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc) where last_seen_at is not null;
create or replace function public.heartbeat()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and banned_at is null
     and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
$$;

-- Kimlik doğrulama açık mı? NVİ'nin ücretsiz doğrulama servisi 30.09.2025'te kapandı; yeni bir yöntem (ücretli doğrulama
-- firması, KPS ya da kimlik kartı çipi) bağlanana kadar KAPALI. Kapalıyken: uygulamada doğrulama düğmeleri ve
-- "doğrulanmamış üye ödül alamaz" uyarıları görünmez, sıralama ödülleri herkese verilir, doğrulama isteği reddedilir.
insert into public.app_settings (key, value, description) values
  ('identity_verification_enabled', 'false',
   'Kimlik doğrulama açık mı? (true yapınca doğrulama düğmeleri görünür ve sıralama ödülleri yalnızca doğrulanmış üyelere verilir. Çalışan bir doğrulama yöntemi bağlanmadan AÇMA)')
on conflict (key) do nothing;

-- ---- Sesli sohbet (uzaktan odalar) ------------------------------------------------------------------------------
-- Ses Agora üzerinden taşınır; KAYDEDİLMEZ, sunucumuza ses gelmez. Burada yalnızca kimin odada olduğu, konuşma sırası,
-- mikrofon/filtre durumu ve aylık dakika sayacı tutulur. Kurallar:
--   * Yalnızca uzaktan Vampir–Köylü odasında. Oyuncular sırayla konuşur: sabah tartışmasında (dawn) hayatta olan her
--     oyuncu voice_turn_seconds (30) saniye konuşur, sonra sıradakine geçilir. Mikrofonunu kapatan, uygulamayı arka plana
--     alan ya da telefon çağrısı gelen kişinin sırası atlanır. Anlatıcı (oynamayan moderatör) her zaman konuşabilir.
--   * Konuşma sırası sunucuda belirlenir; uygulama yalnızca sırası gelenin mikrofonunu açar.
--   * Oylamayla atma: yalnızca sabah konuşmalarından hemen sonra (oylama ve sonucu sırasında) açılır. Bir kişiyi
--     atmak isteyen voice_kick_min_votes (4; odada daha azı varsa öteki herkes) olunca 10 sn içinde odadan çıkar ve geri giremez.
--   * Aylık kişi-dakika sınırı (voice_month_minutes) dolunca sesli sohbet o ay kapanır (ücret çıkmasın).
create sequence if not exists public.voice_uid_seq start 1000;

create table if not exists public.room_voice_members (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  agora_uid bigint not null default nextval('public.voice_uid_seq'),
  mic_on boolean not null default true,
  filter_on boolean not null default false,
  away boolean not null default false,
  last_ping timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_voice_members enable row level security;

create table if not exists public.room_voice_turns (
  room_id uuid primary key references public.game_rooms (id) on delete cascade,
  phase_key text not null,
  speakers uuid[] not null default '{}',
  idx int not null default 0,
  turn_ends_at timestamptz
);
alter table public.room_voice_turns enable row level security;

create table if not exists public.room_kick_votes (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, target_id, voter_id)
);
alter table public.room_kick_votes enable row level security;
-- Oy hangi gündüze ait ("day:<tur>"); başka gündüzün oyu sayılmaz
alter table public.room_kick_votes add column if not exists phase_key text not null default '';

-- Atma sayacı: bir kişiyi atmak isteyen sayısı eşiğe ulaşınca 10 sn sonra karar verilir
create table if not exists public.room_kick_timers (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  phase_key text not null,
  decide_at timestamptz not null,
  primary key (room_id, target_id)
);
alter table public.room_kick_timers enable row level security;

create table if not exists public.voice_usage (
  month date primary key,
  minutes int not null default 0
);
alter table public.voice_usage enable row level security;

create or replace function public._voice_month()
returns date language sql stable as $$
  select date_trunc('month', now() at time zone 'Europe/Istanbul')::date;
$$;

-- Bu ay ses kotası kaldı mı?
create or replace function public._voice_budget_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select public.setting_bool('voice_enabled')
     and coalesce((select minutes from public.voice_usage where month = public._voice_month()), 0)
         < greatest(0, public.setting_int('voice_month_minutes', 9000));
$$;

create or replace function public._voice_turn_secs()
returns int language sql stable set search_path = public as $$
  select least(120, greatest(10, public.setting_int('voice_turn_seconds', 30)));
$$;

-- Oyuncu sesli sohbete katılabilir mi? (odada etkin oyuncu, ya da anlatıcı / odaya bakan moderatör)
create or replace function public._voice_allowed(r public.game_rooms, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select r.remote and r.game_type = 'vampire_villager' and r.status in ('lobby', 'playing')
     and not exists (select 1 from public.room_bans b where b.room_id = r.id and b.user_id = p_user)
     and (exists (select 1 from public.room_players rp
                   where rp.room_id = r.id and rp.user_id = p_user and rp.left_at is null)
          or r.host_id = p_user
          or exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin' and p.banned_at is null));
$$;

-- Anlatıcı mı? (oynamayan moderatör: sıra beklemeden konuşur)
create or replace function public._voice_is_narrator(r public.game_rooms, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select r.host_id = p_user and public._vv_mode(r) = 'narrator';
$$;

-- Konuşma sırasını ilerletir ve şu an konuşanı döndürür (yoksa boş). Odayı kilitlemez (yalnızca sıra satırını).
create or replace function public._voice_turn_tick(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  t public.room_voice_turns;
  v_key text;
  v_secs int := public._voice_turn_secs();
  v_sp uuid;
  v_ok boolean;
  n int := 0;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not r.remote or r.status <> 'playing' or coalesce(r.state->>'phase', '') <> 'dawn' then
    return null;
  end if;
  v_key := 'dawn:' || coalesce(r.state->>'round', '0');
  insert into public.room_voice_turns (room_id, phase_key) values (p_room_id, '')
  on conflict (room_id) do nothing;
  select * into t from public.room_voice_turns where room_id = p_room_id for update;
  if t.phase_key <> v_key then
    -- Yeni sabah: hayatta olan oyuncular rastgele (ama tur boyunca sabit) bir sırayla konuşur
    update public.room_voice_turns
       set phase_key = v_key, idx = 0, turn_ends_at = now() + make_interval(secs => v_secs),
           speakers = coalesce((select array_agg(rp.user_id order by md5(p_room_id::text || v_key || rp.user_id::text))
                                  from public.room_players rp
                                 where rp.room_id = p_room_id and rp.left_at is null and rp.is_alive), '{}')
     where room_id = p_room_id
     returning * into t;
  end if;
  loop
    n := n + 1;
    exit when n > 64 or t.idx >= coalesce(array_length(t.speakers, 1), 0);
    v_sp := t.speakers[t.idx + 1];
    -- Konuşabilir mi: odada, hayatta, sesli sohbete bağlı (son 60 sn), mikrofonu açık, uygulama önde
    select (rp.left_at is null and rp.is_alive) and coalesce(m.mic_on and not m.away and m.last_ping > now() - interval '60 seconds', false)
      into v_ok
      from public.room_players rp
      left join public.room_voice_members m on m.room_id = rp.room_id and m.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.user_id = v_sp;
    if coalesce(v_ok, false) and t.turn_ends_at > now() then
      exit;
    end if;
    -- Süresi doldu ya da konuşamıyor: sıradakine geç
    t.idx := t.idx + 1;
    t.turn_ends_at := now() + make_interval(secs => v_secs);
  end loop;
  update public.room_voice_turns set idx = t.idx, turn_ends_at = t.turn_ends_at where room_id = p_room_id;
  if t.idx >= coalesce(array_length(t.speakers, 1), 0) then return null; end if;
  return t.speakers[t.idx + 1];
end $$;

-- Sabah konuşmaları bitti mi? (Otomatik Oyun'da sabah bunun üzerine oylamaya geçer)
create or replace function public._voice_turns_done(p_room_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  t public.room_voice_turns;
begin
  perform public._voice_turn_tick(p_room_id);
  select * into t from public.room_voice_turns where room_id = p_room_id;
  return found and t.idx >= coalesce(array_length(t.speakers, 1), 0);
end $$;

-- Odanın sesli sohbet durumu (oyun ekranı birkaç saniyede bir okur)
create or replace function public.voice_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  t public.room_voice_turns;
  v_sp uuid;
  v_active int;
  v_key text;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not public._voice_allowed(r, v.id) then
    return jsonb_build_object('allowed', false);
  end if;
  perform public._voice_kick_tick(p_room_id);
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not public._voice_allowed(r, v.id) then
    return jsonb_build_object('allowed', false);
  end if;
  v_key := public._voice_kick_key(r);
  v_sp := public._voice_turn_tick(p_room_id);
  select * into t from public.room_voice_turns where room_id = p_room_id;
  select count(*)::int into v_active from public.room_players rp where rp.room_id = p_room_id and rp.left_at is null;
  return jsonb_build_object(
    'allowed', true,
    'enabled', public._voice_budget_ok(),
    'kick_enabled', public.setting_bool('voice_kick_enabled'),
    -- Atma oylaması yalnızca sabah konuşmalarından hemen sonra (oylama ve sonucu sırasında) açıktır
    'kick_open', public.setting_bool('voice_kick_enabled') and v_key is not null,
    'kick_needed', public._voice_kick_needed(p_room_id, null),
    'kick_seconds', public._voice_kick_secs(),
    'phase', r.state->>'phase',
    'narrator', case when public._vv_mode(r) = 'narrator' then r.host_id end,
    'speaker', v_sp,
    'turn_ends_at', case when v_sp is not null then t.turn_ends_at end,
    'turn_seconds', public._voice_turn_secs(),
    'queue', case when v_sp is not null
                  then to_jsonb(t.speakers[t.idx + 2 : coalesce(array_length(t.speakers, 1), 0)]) else '[]'::jsonb end,
    'can_speak', (v_sp = v.id) or public._voice_is_narrator(r, v.id),
    'players_active', v_active,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', rp.user_id, 'name', rp.display_name, 'alive', rp.is_alive,
               'connected', coalesce(m.last_ping > now() - interval '60 seconds', false),
               'mic_on', coalesce(m.mic_on, false), 'filter_on', coalesce(m.filter_on, false),
               'away', coalesce(m.away, false), 'agora_uid', m.agora_uid,
               'kick_votes', public._voice_kick_count(p_room_id, rp.user_id, v_key),
               'my_kick_vote', exists (select 1 from public.room_kick_votes k
                                        where k.room_id = p_room_id and k.target_id = rp.user_id and k.voter_id = v.id
                                          and k.phase_key = v_key),
               'kick_decide_at', (select kt.decide_at from public.room_kick_timers kt
                                   where kt.room_id = p_room_id and kt.target_id = rp.user_id),
               'kickable', rp.user_id <> r.host_id and rp.user_id <> v.id
                           and not exists (select 1 from public.profiles p where p.id = rp.user_id and p.role = 'admin'))
             order by rp.joined_at)
        from public.room_players rp
        left join public.room_voice_members m on m.room_id = rp.room_id and m.user_id = rp.user_id
       where rp.room_id = p_room_id and rp.left_at is null), '[]'::jsonb)
  );
end $$;

-- Mikrofon / filtre / arka plan durumunu bildirir (herkes görür). Boş bırakılan değer değişmez.
create or replace function public.voice_set(p_room_id uuid, p_mic boolean default null, p_filter boolean default null,
                                            p_away boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not public._voice_allowed(r, v.id) then raise exception 'forbidden'; end if;
  insert into public.room_voice_members (room_id, user_id) values (p_room_id, v.id) on conflict do nothing;
  update public.room_voice_members
     set mic_on = coalesce(p_mic, mic_on), filter_on = coalesce(p_filter, filter_on), away = coalesce(p_away, away)
   where room_id = p_room_id and user_id = v.id;
  perform public._voice_turn_tick(p_room_id);
end $$;

-- Konuşan kişi sözünü erken bitirir: sıra hemen sıradakine geçer
create or replace function public.voice_yield(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  if public._voice_turn_tick(p_room_id) = v.id then
    update public.room_voice_turns
       set idx = idx + 1, turn_ends_at = now() + make_interval(secs => public._voice_turn_secs())
     where room_id = p_room_id;
    perform public._voice_turn_tick(p_room_id);
  end if;
end $$;

-- Sesli sohbete bağlı olan telefon dakikada bir bildirir: dakika sayacı (kota) ve "bağlı" işareti.
-- Döner: stop = true ise uygulama sesli sohbetten çıkar (kota doldu ya da artık odada değil).
create or replace function public.voice_ping(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_last timestamptz;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not public._voice_allowed(r, v.id) then return jsonb_build_object('stop', true, 'reason', 'not_member'); end if;
  if not public._voice_budget_ok() then return jsonb_build_object('stop', true, 'reason', 'budget'); end if;
  insert into public.room_voice_members (room_id, user_id) values (p_room_id, v.id) on conflict do nothing;
  select last_ping into v_last from public.room_voice_members where room_id = p_room_id and user_id = v.id for update;
  update public.room_voice_members set last_ping = now() where room_id = p_room_id and user_id = v.id;
  -- Dakika sayacı: aynı kişi için en çok dakikada bir artar
  if v_last is null or v_last < now() - interval '50 seconds' then
    insert into public.voice_usage (month, minutes) values (public._voice_month(), 1)
    on conflict (month) do update set minutes = public.voice_usage.minutes + 1;
  end if;
  return jsonb_build_object('stop', false);
end $$;

-- Ses anahtarı için bilgi (yalnızca voice-token Edge Function'ı çağırır). Sesin kendisi buradan geçmez.
create or replace function public.service_voice_token(p_user uuid, p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_uid bigint;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not public._voice_allowed(r, p_user) then return jsonb_build_object('result', 'forbidden'); end if;
  if exists (select 1 from public.profiles p where p.id = p_user and (p.banned_at is not null or p.role::text = 'sponsor')) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if not public._voice_budget_ok() then return jsonb_build_object('result', 'budget'); end if;
  insert into public.room_voice_members (room_id, user_id) values (p_room_id, p_user) on conflict do nothing;
  select agora_uid into v_uid from public.room_voice_members where room_id = p_room_id and user_id = p_user;
  return jsonb_build_object('result', 'ok', 'uid', v_uid, 'channel', 'room-' || p_room_id::text);
end $$;

-- Oylamayla atma (uzaktan odalar). Oylama yalnızca sabah konuşmalarından hemen sonra açılır: o turun asılma oylaması
-- ve sonucu ekrandayken. Bir kişiyi atmak isteyen sayısı eşiğe (voice_kick_min_votes, varsayılan 4; odada daha az
-- kişi varsa öteki herkes) ulaşınca voice_kick_seconds (10) sn sayaç başlar; süre dolduğunda oylar hâlâ eşikteyse kişi
-- odadan çıkarılır ve geri giremez. Oda sahibi ve moderatör atılamaz.
create or replace function public._voice_kick_key(r public.game_rooms)
returns text language sql stable set search_path = public as $$
  select case when r.remote and r.status = 'playing' and coalesce(r.state->>'phase', '') in ('vote', 'vote_result')
              then 'day:' || coalesce(r.state->>'round', '0') end;
$$;

create or replace function public._voice_kick_secs()
returns int language sql stable set search_path = public as $$
  select least(60, greatest(5, public.setting_int('voice_kick_seconds', 10)));
$$;

-- Atmak için gereken oy (p_target boşsa odadaki genel eşik). Atılamıyorsa (odada 2'den az kişi kalır) boş döner.
create or replace function public._voice_kick_needed(p_room_id uuid, p_target uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when x.n >= 2 then least(greatest(2, public.setting_int('voice_kick_min_votes', 4)), x.n) end
    from (select count(*)::int - (case when p_target is null then 1 else 0 end) as n
            from public.room_players rp
           where rp.room_id = p_room_id and rp.left_at is null
             and rp.user_id is distinct from p_target) x;
$$;

create or replace function public._voice_kick_count(p_room_id uuid, p_target uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.room_kick_votes k
    join public.room_players vp on vp.room_id = k.room_id and vp.user_id = k.voter_id and vp.left_at is null
   where k.room_id = p_room_id and k.target_id = p_target and k.phase_key = p_key;
$$;

-- Süresi dolan atma sayaçlarını sonuçlandırır (voice_state / room_vote_kick / vv_view çağırır)
create or replace function public._voice_kick_tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  k record;
  v_needed int;
begin
  if not exists (select 1 from public.room_kick_timers where room_id = p_room_id and decide_at <= now()) then return; end if;
  -- Kilit sırası room_vote_kick ile aynı: önce oda, sonra sayaç
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'playing' then
    delete from public.room_kick_timers where room_id = p_room_id;
    return;
  end if;
  for k in delete from public.room_kick_timers
            where room_id = p_room_id and decide_at <= now()
        returning target_id, phase_key
  loop
    v_needed := public._voice_kick_needed(p_room_id, k.target_id);
    if v_needed is not null
       and public._voice_kick_count(p_room_id, k.target_id, k.phase_key) >= v_needed
       and exists (select 1 from public.room_players rp
                    where rp.room_id = p_room_id and rp.user_id = k.target_id and rp.left_at is null)
       and k.target_id <> r.host_id
       and not exists (select 1 from public.profiles p where p.id = k.target_id and p.role = 'admin') then
      insert into public.room_bans (room_id, user_id) values (p_room_id, k.target_id) on conflict do nothing;
      delete from public.room_kick_votes where room_id = p_room_id and (target_id = k.target_id or voter_id = k.target_id);
      delete from public.room_kick_timers where room_id = p_room_id and target_id = k.target_id;
      delete from public.room_voice_members where room_id = p_room_id and user_id = k.target_id;
      perform public._room_remove_player(p_room_id, k.target_id, 'kicked');
      perform public._notify(k.target_id, 'system', 'Odadan çıkarıldın',
        'Uzaktan oyundaki oyuncular seni odadan çıkarmak için oy verdi. Bu odaya yeniden giremezsin.', '{}'::jsonb);
    end if;
  end loop;
end $$;

-- Oy ver / oyunu geri al. Döner: { kicked, votes, needed, decide_at }
create or replace function public.room_vote_kick(p_room_id uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_key text;
  v_votes int;
  v_needed int;
  v_at timestamptz;
begin
  v := public._require_writer(null);
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or not r.remote or r.status not in ('lobby', 'playing') then raise exception 'room_not_found'; end if;
  if not public.setting_bool('voice_kick_enabled') then raise exception 'kick_disabled'; end if;
  if not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null) then
    raise exception 'forbidden';
  end if;
  if p_target = v.id or p_target = r.host_id
     or exists (select 1 from public.profiles p where p.id = p_target and p.role = 'admin')
     or not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = p_target and rp.left_at is null) then
    raise exception 'not_kickable';
  end if;
  v_key := public._voice_kick_key(r);
  if v_key is null then raise exception 'kick_closed'; end if;
  if exists (select 1 from public.room_kick_votes
              where room_id = p_room_id and target_id = p_target and voter_id = v.id and phase_key = v_key) then
    delete from public.room_kick_votes where room_id = p_room_id and target_id = p_target and voter_id = v.id;
  else
    insert into public.room_kick_votes (room_id, target_id, voter_id, phase_key) values (p_room_id, p_target, v.id, v_key)
    on conflict (room_id, target_id, voter_id) do update set phase_key = excluded.phase_key, created_at = now();
  end if;
  v_votes := public._voice_kick_count(p_room_id, p_target, v_key);
  v_needed := public._voice_kick_needed(p_room_id, p_target);
  if v_needed is not null and v_votes >= v_needed then
    insert into public.room_kick_timers (room_id, target_id, phase_key, decide_at)
    values (p_room_id, p_target, v_key, now() + make_interval(secs => public._voice_kick_secs()))
    on conflict (room_id, target_id) do nothing;
  else
    -- Oylar eşiğin altına indi: sayaç durur
    delete from public.room_kick_timers where room_id = p_room_id and target_id = p_target;
  end if;
  select decide_at into v_at from public.room_kick_timers where room_id = p_room_id and target_id = p_target;
  return jsonb_build_object('kicked', false, 'votes', v_votes, 'needed', v_needed, 'decide_at', v_at);
end $$;

-- Uzaktan oyun puanı ve sesli sohbet ayarları
insert into public.app_settings (key, value, description) values
  ('pts_remote_pct', '50', 'Uzaktan oyunun puanı, aynı sonucun yan yana oyundaki puanının yüzde kaçı? (10–80; varsayılan 50)'),
  ('pts_remote_daily_cap', '2', 'Günde en çok kaç uzaktan oyundan puan alınır'),
  ('pts_remote_month_cap', '6', 'Ayda en çok kaç uzaktan oyundan puan alınır'),
  ('voice_enabled', 'true', 'Uzaktan odalarda sesli sohbet açık mı?'),
  ('voice_turn_seconds', '30', 'Sesli sohbette her oyuncunun konuşma süresi (saniye, 10–120)'),
  ('voice_month_minutes', '9000', 'Ayda en çok kaç kişi-dakika sesli sohbet (ses sağlayıcının ücretsiz kotası 10.000; dolunca sesli sohbet o ay kapanır)'),
  ('voice_kick_enabled', 'true', 'Uzaktan odalarda oylamayla oyuncu atma açık mı?'),
  ('voice_kick_min_votes', '4', 'Uzaktan odada bir oyuncuyu atmak için gereken oy (odada daha az kişi varsa öteki herkes)'),
  ('voice_kick_seconds', '10', 'Atma oyu eşiğe ulaşınca kaç saniye sonra karar verilir (5–60)'),
  ('game_join_max_meters', '100', 'Yan yana oyunda odaya girenin oda sahibine en çok kaç metre uzakta olabileceği (telefonların konum hatası bunun üstüne eklenir)'),
  ('game_join_max_meters_cap', '150', 'Yan yana oyunda konum hatası dahil en çok kaç metre uzaklığa izin verilir')
on conflict (key) do nothing;
update public.app_settings set description = 'KULLANILMIYOR: yan yana oyunlarda günlük puan sınırı yoktur' where key = 'pts_game_daily_cap';
update public.app_settings set description = 'KULLANILMIYOR: yan yana oyunlarda aylık puan sınırı yoktur' where key = 'pts_game_month_cap';

-- ---- GEÇİCİ: Vampir–Köylü deneme oyuncuları (botlar) ----------------------------------------------------------------
-- Tek telefonla test için: moderatör bekleme salonundaki odaya "Deneme oyuncusu" ekler; botlar kendi kendine hazır olur,
-- gece seçim yapar ve oy verir. Bot eklenen oda "deneme odası" olur: o odada KİMSEYE puan, başarım ya da istatistik
-- yazılmaz (botlarla puan toplanamaz). Botlar şifresiz hesaplardır; kimse onlarla giriş yapamaz.
-- Kaldırırken: bu bölüm, profiles.is_bot ve bot hesapları (auth.users, kimlikleri b0700000-…) silinir.
alter table public.profiles add column if not exists is_bot boolean not null default false;
-- Ses şikâyeti kuralları: haksız şikâyet sayacı, şikâyet ve mikrofon yasağı, haklı bulunan ses ihlali sayısı
alter table public.profiles add column if not exists unjust_reports int not null default 0;
alter table public.profiles add column if not exists voice_strikes int not null default 0;
alter table public.profiles add column if not exists report_banned_until timestamptz;
alter table public.profiles add column if not exists mic_banned_until timestamptz;

do $$
declare i int;
begin
  -- 15 deneme oyuncusu: moderatörle birlikte en kalabalık oyun (16 kişi) denenebilsin
  for i in 1..15 loop
    if not exists (select 1 from public.profiles where id = ('b0700000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid) then
      insert into auth.users (id, aud, role, raw_user_meta_data, created_at, updated_at)
      values (('b0700000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
              jsonb_build_object('full_name', 'Deneme Botu ' || i, 'username', 'deneme_bot_' || i,
                                 'device_id', 'peoplehere-test-bot-device-' || i),
              now(), now());
    end if;
  end loop;
  update public.profiles set is_bot = true where id::text like 'b0700000-0000-4000-8000-%';
exception when others then
  raise warning 'Deneme oyuncuları oluşturulamadı: %', sqlerrm;
end $$;

-- Moderatör: bekleme salonundaki odaya deneme oyuncusu ekler (bir seferde en çok 15). Oda deneme odası olur.
create or replace function public.admin_add_test_bots(p_room_id uuid, p_count int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  n int;
begin
  perform public._require_user();
  perform public._require_admin();
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type not in ('vampire_villager', 'shark_cage') or r.status <> 'lobby' then
    raise exception 'room_not_found';
  end if;
  update public.game_rooms set config = config || jsonb_build_object('test', true) where id = p_room_id;
  -- Oda sınırı aşılmaz: yalnızca boş yer kadar deneme oyuncusu eklenir
  perform pg_advisory_xact_lock(hashtext('rp_seat:' || p_room_id::text));
  n := coalesce((select gt.max_players from public.game_types gt where gt.key = r.game_type), 16)
       - (select count(*)::int from public.room_players rp where rp.room_id = p_room_id and rp.left_at is null);
  if n <= 0 then raise exception 'room_full'; end if;
  insert into public.room_players (room_id, user_id, display_name)
  select p_room_id, p.id, p.full_name
    from public.profiles p
   where p.is_bot
     and not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = p.id)
   order by p.id
   limit least(15, n, greatest(1, coalesce(p_count, 3)));
  get diagnostics n = row_count;
  perform public._audit('test_bots', null, jsonb_build_object('room', p_room_id, 'count', n));
  return n;
end $$;

-- Botların hamleleri (oyuna bakan her telefon tetikler; ayrı zamanlayıcı yok). Yalnızca deneme odasında.
create or replace function public._vv_bots_act(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  b record;
  v_phase text;
  v_round int;
  v_age numeric;
  v_t uuid;
  v_pending int;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not coalesce((r.config->>'test')::boolean, false) then return; end if;
  -- Botlar "buradayım" işaretini hep tazeler (bağlantısı koptu sayılıp atılmasınlar)
  update public.room_players rp set last_seen_at = now()
    from public.profiles p
   where p.id = rp.user_id and p.is_bot and rp.room_id = p_room_id and rp.left_at is null;
  -- Eşleştirme lobisinde ve yeni el bekleme odasında botlar "Hazırım" der
  if r.status = 'lobby' and (coalesce((r.config->>'match')::boolean, false) or r.config ? 'rematch_of')
     and (r.state ? 'rematch_until'
          or (select count(*) from public.room_players where room_id = p_room_id and left_at is null)
             >= (select coalesce(min_players, 5) from public.game_types where key = 'vampire_villager')) then
    update public.game_rooms
       set state = jsonb_set(state, '{ready}', coalesce((
             select jsonb_agg(distinct y.x) from (
               select jsonb_array_elements_text(coalesce(r.state->'ready', '[]'::jsonb)) as x
               union
               select rp.user_id::text from public.room_players rp join public.profiles p on p.id = rp.user_id and p.is_bot
                where rp.room_id = p_room_id and rp.left_at is null) y), '[]'::jsonb))
     where id = p_room_id;
  end if;
  if r.status <> 'playing' then return; end if;
  v_phase := r.state->>'phase';
  v_round := coalesce((r.state->>'round')::int, 0);
  v_age := extract(epoch from now() - public._vv_phase_started(r));
  for b in
    select rp.user_id, s.role, s.data
      from public.room_players rp
      join public.profiles p on p.id = rp.user_id and p.is_bot
      join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.left_at is null and rp.is_alive
  loop
    if v_phase = 'reveal' and not coalesce((b.data->>'ready')::boolean, false) then
      update public.room_player_secrets set data = data || jsonb_build_object('ready', true)
       where room_id = p_room_id and user_id = b.user_id;
    elsif v_phase = 'night' and v_age >= 4 and b.role in ('vampire', 'doctor', 'detective')
          and coalesce((b.data->'night'->>'round')::int, 0) <> v_round then
      select rp2.user_id into v_t
        from public.room_players rp2
        join public.room_player_secrets s2 on s2.room_id = rp2.room_id and s2.user_id = rp2.user_id
       where rp2.room_id = p_room_id and rp2.is_alive and rp2.left_at is null
         and (b.role <> 'vampire' or s2.role <> 'vampire')
         and (b.role <> 'detective' or rp2.user_id <> b.user_id)
         and (b.role <> 'doctor' or rp2.user_id::text is distinct from b.data->>'last_protect')
       order by random() limit 1;
      if v_t is not null then
        update public.room_player_secrets
           set data = data || jsonb_build_object('night', jsonb_build_object('round', v_round, 'target', v_t))
         where room_id = p_room_id and user_id = b.user_id;
      end if;
    elsif v_phase = 'vote' and v_age >= 6 and coalesce((b.data->'vote'->>'round')::int, 0) <> v_round then
      v_t := null;
      if random() > 0.2 then
        select rp2.user_id into v_t from public.room_players rp2
         where rp2.room_id = p_room_id and rp2.is_alive and rp2.left_at is null and rp2.user_id <> b.user_id
         order by random() limit 1;
      end if;
      update public.room_player_secrets
         set data = data || jsonb_build_object('vote', jsonb_build_object('round', v_round, 'target', v_t))
       where room_id = p_room_id and user_id = b.user_id;
    end if;
  end loop;
  if v_phase = 'dawn' then perform public._vv_skip_check(p_room_id); end if;
  -- Herkes oy verdiyse oylama sonuçlanır (oyuncunun oy vermesindeki gibi)
  if v_phase = 'vote' then
    select count(*)::int into v_pending
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
     where s.room_id = p_room_id and rp.is_alive and rp.left_at is null
       and coalesce((s.data->'vote'->>'round')::int, 0) <> v_round;
    if v_pending = 0 then perform public._vv_resolve_vote(p_room_id); end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5e) Köpekbalığı Kafesi (shark_cage)
--   Deniz temalı gizli rol oyunu (6–16 kişi). Vampir–Köylü'den bağımsızdır; aynı oda altyapısını (game_rooms,
--   room_players, room_player_secrets) kullanır. Akış (state.phase):
--     reveal (rol çarkı) -> night (dalış) -> day (plaj) -> vote (kafes oylaması) -> vote_result -> night -> ... -> ended
--   Takımlar: Köpekbalıkları (avcılar, ~%30), İnsanlar (~%60), Tarafsızlar (10+ kişide 1, 16 kişide 2).
--   GİZLİLİK: herkesin görebildiği bilgi game_rooms.state içindedir (oda üyeleri okuyabilir). Rol, gece seçimleri,
--   notlar ve ziyaretler YALNIZCA room_player_secrets.data içindedir; sk_view kişiye özel süzer.
--   Oyun şekli: auto (kimse yönetmez), host (oda sahibi ilerletir ve oynar; rolleri görmez), narrator (YALNIZCA etkinlik
--   oyununda etkinlik sahibi; oynamaz, herkesin rolünü görür; anlatıcılı oyunda kimse puan almaz, hak düşmez).
--   Gece sırası: Çekiçbaş engeller -> Cankurtaran / Hemşire korur -> ölümler -> Kaplan / Oşinograf bilgisi.
--   Kazanma: İnsanlar (köpekbalıkları ve tarafsız katiller ölünce), Köpekbalıkları (sayıları kalanlara eşit olunca ve
--   tarafsız katil kalmayınca), Mürekkep Balığı / Sörfçü (tek başına ya da biriyle baş başa kalınca), Hazine Avcısı
--   (oylamayla kafese atılınca: oyun biter, herkes kaybeder).
-- ---------------------------------------------------------------------
insert into public.game_types (key, title, description, min_players, max_players, enabled, sort_order)
values ('shark_cage', 'Köpekbalığı Kafesi', 'Dalış, su üstü ve karar oylaması: gizli roller denizde', 6, 16, true, 0)
on conflict (key) do nothing;
update public.game_types set description = 'Dalış, su üstü ve karar oylaması: gizli roller denizde'
 where key = 'shark_cage' and description = 'Dalış, plaj ve kafes oylaması: gizli roller denizde';

-- Köpekbalıklarının gece sohbeti de elenenlerin sohbet tablosunda durur (kanal: dead | shark)
alter table public.vv_dead_chat add column if not exists channel text not null default 'dead';
alter table public.vv_dead_chat drop constraint if exists vv_dead_chat_channel_check;
alter table public.vv_dead_chat add constraint vv_dead_chat_channel_check check (channel in ('dead', 'shark', 'all'));
-- Mesaj geçmişinde gece / gündüz ayrımı için yazıldığı tur ve aşama (eski mesajlarda boş)
alter table public.vv_dead_chat add column if not exists round int;
alter table public.vv_dead_chat add column if not exists phase text;

create or replace function public._sk_team(p_role text)
returns text language sql immutable set search_path = public as $$
  select case when p_role in ('alpha', 'tiger', 'hammer', 'nurse', 'shark') then 'shark'
              when p_role in ('squid', 'surfer', 'scavenger') then 'neutral'
              when p_role is null then null
              else 'human' end;
$$;

-- Takım sayıları: köpekbalığı = oyuncuların %30'u (yuvarlanır), tarafsız = 10–15 kişide 1, 16 kişide 2
create or replace function public._sk_counts(p_n int)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('shark', x.s, 'neutral', x.q, 'human', p_n - x.s - x.q)
    from (select floor(p_n * 0.3 + 0.5)::int as s,
                 (case when p_n >= 16 then 2 when p_n >= 10 then 1 else 0 end) as q) x;
$$;

-- Rol listesi (karıştırılmadan). Her rolün gelme şansı vardır; güçlü rollerin şansı daha düşüktür:
--   köpekbalıkları: Alfa her zaman; özel köpekbalıkları Kaplan %70, Hemşire %70, Çekiçbaş %55 şansla aday olur, kalan
--     yerler düz köpekbalığı;
--   insanlar: Cankurtaran %85, Oşinograf %80, Zıpkıncı (7+) %55, Komutan (8+) %50, Medyum (10+) %70; kalanlar Tatilci;
--   tarafsızlar (10+): Mürekkep Balığı 45, Sörfçü 40, Hazine Avcısı 15 ağırlıkla (aynı rol iki kez gelmez).
-- Takım sayıları değişmez (_sk_counts). Her rolün kişi başı gelme oranı oyun başında hesaplanıp çarkta gösterilir.
create or replace function public._sk_roles(p_n int)
returns text[] language plpgsql volatile set search_path = public as $$
declare
  c jsonb := public._sk_counts(p_n);
  s int := (c->>'shark')::int;
  q int := (c->>'neutral')::int;
  h int := (c->>'human')::int;
  v text[] := array['alpha'];
  specials text[];
  humans text[];
  pool text[] := array['squid', 'surfer', 'scavenger'];
  weights int[] := array[45, 40, 15];
  pick text;
  i int;
  j int;
  tot int;
  x int;
begin
  select coalesce(array_agg(k order by random()), '{}') into specials
    from (values ('tiger', 0.70), ('nurse', 0.70), ('hammer', 0.55)) t(k, ch)
   where random() < t.ch;
  for i in 1..(s - 1) loop
    v := v || coalesce(specials[i], 'shark');
  end loop;
  select coalesce(array_agg(k order by random()), '{}') into humans
    from (values ('lifeguard', 0.85, 0), ('oceanographer', 0.80, 0), ('spearman', 0.55, 7),
                 ('marshal', 0.50, 8), ('medium', 0.70, 10)) t(k, ch, minn)
   where p_n >= t.minn and random() < t.ch;
  for i in 1..h loop
    v := v || coalesce(humans[i], 'tourist');
  end loop;
  for i in 1..q loop
    tot := 0;
    for j in 1..array_length(pool, 1) loop tot := tot + weights[j]; end loop;
    x := floor(random() * tot)::int;
    pick := pool[array_length(pool, 1)];
    for j in 1..array_length(pool, 1) loop
      if x < weights[j] then pick := pool[j]; exit; end if;
      x := x - weights[j];
    end loop;
    v := v || pick;
    j := array_position(pool, pick);
    pool := pool[1:j - 1] || pool[j + 1:];
    weights := weights[1:j - 1] || weights[j + 1:];
  end loop;
  return v;
end $$;

-- Her rolün kişi başı gelme oranı (yüzde, tam sayı): dağıtım 800 kez denenip sayılır. Oyun başında bir kez hesaplanır.
create or replace function public._sk_role_odds(p_n int)
returns jsonb language plpgsql volatile set search_path = public as $$
declare
  t int := 800;
  i int;
  r text;
  cnt jsonb := '{}'::jsonb;
begin
  for i in 1..t loop
    foreach r in array public._sk_roles(p_n) loop
      cnt := cnt || jsonb_build_object(r, coalesce((cnt->>r)::int, 0) + 1);
    end loop;
  end loop;
  return (select jsonb_object_agg(k, greatest(1, round((v::text)::numeric * 100 / (t * p_n)))::int)
            from jsonb_each(cnt) as e(k, v));
end $$;

create or replace function public._sk_mode(r public.game_rooms)
returns text language sql immutable set search_path = public as $$
  select coalesce(r.config->>'mode', 'auto');
$$;

-- Her şeyi gören kişi: anlatıcı (etkinlik sahibi, oynamaz) ya da odaya oyuncu olarak girmemiş moderatör
create or replace function public._sk_is_omni(r public.game_rooms, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.room_players where room_id = r.id and user_id = p_user)
     and ((r.host_id = p_user and public._sk_mode(r) = 'narrator')
          or exists (select 1 from public.profiles where id = p_user and role = 'admin'));
$$;

-- Gecenin seçimleri bitti mi (rolüne göre): köpekbalıkları av oyu, özel köpekbalıkları + yetenek, diğer rollerin yeteneği
create or replace function public._sk_night_done(p_role text, p_data jsonb, p_round int)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_role in ('alpha', 'shark') then coalesce((p_data->'hunt'->>'round')::int, 0) = p_round
    when p_role in ('tiger', 'hammer', 'nurse') then coalesce((p_data->'hunt'->>'round')::int, 0) = p_round
                                                    and coalesce((p_data->'night'->>'round')::int, 0) = p_round
    when p_role in ('lifeguard', 'oceanographer', 'squid', 'surfer') then coalesce((p_data->'night'->>'round')::int, 0) = p_round
    else true end;
$$;

-- Bir kişinin gizli kaydına not ekler (gece sonuçları)
create or replace function public._sk_note(p_room uuid, p_user uuid, p_note jsonb)
returns void language sql security definer set search_path = public as $$
  update public.room_player_secrets
     set data = jsonb_set(data, '{notes}', coalesce(data->'notes', '[]'::jsonb) || jsonb_build_array(p_note))
   where room_id = p_room and user_id = p_user;
$$;

create or replace function public._sk_name(p_room uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select display_name from public.room_players where room_id = p_room and user_id = p_user;
$$;

-- Kazanan var mı? 'human' | 'shark' | 'squid' | 'surfer' | 'nobody' | null (sürüyor). Hazine Avcısı oylamada çözülür.
create or replace function public._sk_check_winner(p_room_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when t.alive = 0 then 'nobody'
    when t.sh = 0 and t.sq = 0 and t.sf = 0 then (case when t.hu > 0 then 'human' else 'nobody' end)
    when t.sq = 0 and t.sf = 0 and t.sh >= t.alive - t.sh then 'shark'
    when t.sq = 1 and t.sh = 0 and t.sf = 0 and t.alive <= 2 then 'squid'
    when t.sf = 1 and t.sh = 0 and t.sq = 0 and t.alive <= 2 then 'surfer'
    else null end
    from (
      select (count(*) filter (where rp.is_alive))::int as alive,
             (count(*) filter (where rp.is_alive and public._sk_team(s.role) = 'shark'))::int as sh,
             (count(*) filter (where rp.is_alive and public._sk_team(s.role) = 'human'))::int as hu,
             (count(*) filter (where rp.is_alive and s.role = 'squid'))::int as sq,
             (count(*) filter (where rp.is_alive and s.role = 'surfer'))::int as sf
        from public.room_players rp
        join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
       where rp.room_id = p_room_id
    ) t;
$$;

-- Oyunu bitirir: kazananların score'u 1 olur (puan sırası buna göre), oda "bitti" olur (puan tetikleyicisi çalışır)
create or replace function public._sk_finish(p_room_id uuid, p_winner text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.room_players rp
     set score = (case when (p_winner = 'human' and public._sk_team(s.role) = 'human')
                         or (p_winner = 'shark' and public._sk_team(s.role) = 'shark')
                         or (p_winner in ('squid', 'surfer', 'scavenger') and s.role = p_winner)
                       then 1 else 0 end)
    from public.room_player_secrets s
   where s.room_id = rp.room_id and s.user_id = rp.user_id and rp.room_id = p_room_id;
  update public.game_rooms
     set state = state || jsonb_build_object('phase', 'ended', 'winner', p_winner, 'phase_started_at', now()),
         status = 'finished',
         finished_at = now()
   where id = p_room_id;
end $$;

-- Rolü herkese açıklar (kafese atılan, zıpkınlanan, oyundan ayrılan, kimliğini açan Komutan)
create or replace function public._sk_reveal(p_room_id uuid, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = jsonb_set(state, '{reveals}',
           coalesce(state->'reveals', '{}'::jsonb)
           || jsonb_build_object(p_user::text,
                (select s.role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = p_user)))
   where id = p_room_id;
$$;

-- Bekleyen gece seçimi sayısı (yaşayanlar)
create or replace function public._sk_night_pending(p_room_id uuid, p_round int)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
   where s.room_id = p_room_id and rp.is_alive and rp.left_at is null
     and not public._sk_night_done(s.role, s.data, p_round);
$$;

create or replace function public._sk_vote_pending(p_room_id uuid, p_round int)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
   where s.room_id = p_room_id and rp.is_alive and rp.left_at is null
     and coalesce((s.data->'vote'->>'round')::int, 0) <> p_round;
$$;

create or replace function public._sk_go_night(p_room_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = (state - 'last_night' - 'last_vote' - 'day_event')
                 || jsonb_build_object('phase', 'night', 'round', coalesce((state->>'round')::int, 0) + 1,
                                       'phase_started_at', now())
   where id = p_room_id;
$$;

create or replace function public._sk_go_vote(p_room_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.game_rooms
     set state = state || jsonb_build_object('phase', 'vote', 'phase_started_at', now())
   where id = p_room_id;
$$;

-- Geceyi sonuçlandırır (sıra: engel -> koruma -> ölümler -> bilgi), plaj (gündüz) başlar
create or replace function public._sk_resolve_night(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_round int;
  v_blocked uuid;
  v_leader uuid;
  v_hunt uuid;
  v_lg_user uuid;
  v_lg uuid;
  v_nurse_user uuid;
  v_nurse uuid;
  v_squid_t uuid;
  v_dead uuid[] := '{}';
  -- Ölenin neden öldüğü (yalnızca kendisine not olarak gider; kimin yaptığı yazılmaz, yalnızca rol)
  v_cause jsonb := '{}';
  v_marks jsonb;
  x record;
  v_list jsonb;
  v_winner text;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if r.status <> 'playing' or r.state->>'phase' <> 'night' then return; end if;
  v_round := (r.state->>'round')::int;

  -- 1) Çekiçbaş: seçtiği kişinin bu gecelik yeteneği çalışmaz
  select (s.data->'night'->>'target')::uuid into v_blocked
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
   where s.room_id = p_room_id and s.role = 'hammer' and (s.data->'night'->>'round')::int = v_round
   limit 1;

  -- 2) Korumalar (engellenmediyse)
  select s.user_id, (s.data->'night'->>'target')::uuid into v_lg_user, v_lg
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
   where s.room_id = p_room_id and s.role = 'lifeguard' and (s.data->'night'->>'round')::int = v_round
   limit 1;
  if v_lg_user is not null and v_lg_user = v_blocked then v_lg := null; end if;
  if v_lg is not null and v_lg = v_lg_user then
    update public.room_player_secrets set data = data || '{"self_used": true}'::jsonb
     where room_id = p_room_id and user_id = v_lg_user;
  end if;
  select s.user_id, (s.data->'night'->>'target')::uuid into v_nurse_user, v_nurse
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
   where s.room_id = p_room_id and s.role = 'nurse' and (s.data->'night'->>'round')::int = v_round
   limit 1;
  if v_nurse_user is not null and v_nurse_user = v_blocked then v_nurse := null; end if;
  -- Hemşirenin kalkanı ertesi gündüz Zıpkıncı'ya karşı da geçerlidir
  if v_nurse is not null then
    update public.room_player_secrets
       set data = data || jsonb_build_object('shield', jsonb_build_object('round', v_round, 'target', v_nurse))
     where room_id = p_room_id and user_id = v_nurse_user;
  end if;

  -- 3a) Köpekbalıklarının avı: en çok oy; eşitlikte lider (Alfa, yoksa en eski köpekbalığı) seçimi
  select rp.user_id into v_leader
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.is_alive and rp.left_at is null and public._sk_team(s.role) = 'shark'
   order by (s.role = 'alpha') desc, rp.joined_at
   limit 1;
  select c.t into v_hunt
    from (
      select (s.data->'hunt'->>'target')::uuid as t, count(*) as n, bool_or(s.user_id = v_leader) as led
        from public.room_player_secrets s
        join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
       where s.room_id = p_room_id and public._sk_team(s.role) = 'shark'
         and (s.data->'hunt'->>'round')::int = v_round and (s.data->'hunt'->>'target') is not null
         and exists (select 1 from public.room_players tp
                      where tp.room_id = p_room_id and tp.user_id = (s.data->'hunt'->>'target')::uuid and tp.is_alive)
       group by 1
    ) c
   order by c.n desc, c.led desc, random()
   limit 1;
  -- Mürekkep Balığı ısırıktan etkilenmez; Cankurtaran'ın koruduğu kişi ölmez
  if v_hunt is not null and v_hunt is distinct from v_lg
     and coalesce((select s.role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v_hunt), '') <> 'squid' then
    v_dead := v_dead || v_hunt;
    v_cause := v_cause || jsonb_build_object(v_hunt::text, 'hunt');
  end if;
  if v_hunt is not null and v_hunt = v_lg and v_lg_user is not null then
    perform public._sk_note(p_room_id, v_lg_user, jsonb_build_object('round', v_round, 'kind', 'saved',
      'id', v_lg, 'name', public._sk_name(p_room_id, v_lg)));
  end if;

  -- 3b) Mürekkep Balığı: kalkan deler (koruma işe yaramaz)
  select (s.data->'night'->>'target')::uuid into v_squid_t
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
   where s.room_id = p_room_id and s.role = 'squid' and (s.data->'night'->>'round')::int = v_round
     and s.user_id is distinct from v_blocked
   limit 1;
  if v_squid_t is not null and exists (select 1 from public.room_players
                                         where room_id = p_room_id and user_id = v_squid_t and is_alive) then
    v_dead := v_dead || v_squid_t;
    if not v_cause ? v_squid_t::text then v_cause := v_cause || jsonb_build_object(v_squid_t::text, 'squid'); end if;
  end if;

  -- 3c) Yalnız Sörfçü: işaretler ya da "Telsiz Patlat" (işaretli herkes; Cankurtaran / Hemşire koruması kurtarır)
  for x in
    select s.user_id, s.data
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
     where s.room_id = p_room_id and s.role = 'surfer' and (s.data->'night'->>'round')::int = v_round
       and s.user_id is distinct from v_blocked
  loop
    v_marks := coalesce(x.data->'marks', '[]'::jsonb);
    if coalesce((x.data->'night'->>'ignite')::boolean, false) then
      select v_dead || coalesce(array_agg(m::uuid), '{}') into v_dead
        from jsonb_array_elements_text(v_marks) m
       where m::uuid is distinct from v_lg and m::uuid is distinct from v_nurse
         and exists (select 1 from public.room_players where room_id = p_room_id and user_id = m::uuid and is_alive);
      select coalesce(jsonb_object_agg(m, 'surfer'), '{}'::jsonb) || v_cause into v_cause
        from jsonb_array_elements_text(v_marks) m
       where m::uuid = any (v_dead);
      update public.room_player_secrets set data = data || '{"marks": []}'::jsonb
       where room_id = p_room_id and user_id = x.user_id;
    elsif (x.data->'night'->>'target') is not null then
      update public.room_player_secrets
         set data = data || jsonb_build_object('marks', v_marks || jsonb_build_array(x.data->'night'->>'target'))
       where room_id = p_room_id and user_id = x.user_id;
    end if;
  end loop;

  -- Ziyaretler (Oşinograf haritası ve Kaplan için): engellenmeyen yetenek hedefleri + köpekbalıklarının av oyları
  for x in
    select s.user_id, s.role, s.data
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
     where s.room_id = p_room_id
  loop
    v_list := '[]'::jsonb;
    if (x.data->'night'->>'round')::int = v_round and (x.data->'night'->>'target') is not null
       and x.user_id is distinct from v_blocked then
      v_list := v_list || jsonb_build_array(x.data->'night'->>'target');
    end if;
    if public._sk_team(x.role) = 'shark' and (x.data->'hunt'->>'round')::int = v_round
       and (x.data->'hunt'->>'target') is not null and not (v_list ? (x.data->'hunt'->>'target')) then
      v_list := v_list || jsonb_build_array(x.data->'hunt'->>'target');
    end if;
    if jsonb_array_length(v_list) > 0 then
      update public.room_player_secrets
         set data = jsonb_set(data, '{visits}', coalesce(data->'visits', '[]'::jsonb)
                                 || jsonb_build_array(jsonb_build_object('round', v_round, 'targets', v_list)))
       where room_id = p_room_id and user_id = x.user_id;
    end if;
    if x.user_id = v_blocked and x.role in ('lifeguard', 'oceanographer', 'tiger', 'nurse', 'squid', 'surfer') then
      perform public._sk_note(p_room_id, x.user_id, jsonb_build_object('round', v_round, 'kind', 'blocked'));
    end if;
  end loop;

  -- 4) Bilgi: Kaplan (hedefin bu gece kimi ziyaret ettiği), Oşinograf (takım + son 2 gecenin ziyaretleri)
  for x in
    select s.user_id, s.role, (s.data->'night'->>'target')::uuid as t
      from public.room_player_secrets s
      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
     where s.room_id = p_room_id and s.role in ('tiger', 'oceanographer')
       and (s.data->'night'->>'round')::int = v_round and (s.data->'night'->>'target') is not null
       and s.user_id is distinct from v_blocked
  loop
    v_list := null;
    select jsonb_build_object(
             'round', v_round,
             'kind', case when x.role = 'tiger' then 'track' else 'scan' end,
             'id', x.t,
             'name', public._sk_name(p_room_id, x.t),
             'team', case when x.role = 'oceanographer' then public._sk_team(ts.role) end,
             'visits', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'round', (e->>'round')::int,
                        'ids', e->'targets',
                        'names', (select coalesce(jsonb_agg(public._sk_name(p_room_id, tid::uuid)), '[]'::jsonb)
                                    from jsonb_array_elements_text(e->'targets') tid)) order by (e->>'round')::int)
                 from jsonb_array_elements(coalesce(ts.data->'visits', '[]'::jsonb)) e
                where (e->>'round')::int > v_round - (case when x.role = 'tiger' then 1 else 2 end)), '[]'::jsonb))
      into v_list
      from public.room_player_secrets ts
     where ts.room_id = p_room_id and ts.user_id = x.t;
    if v_list is not null then perform public._sk_note(p_room_id, x.user_id, v_list); end if;
  end loop;

  -- Ölümler. Wolvesville kuralı: ölenin rolü herkese açıklanır (gece avlanan da)
  update public.room_players set is_alive = false, out_at = now()
   where room_id = p_room_id and is_alive and user_id = any (v_dead);
  perform public._sk_note(p_room_id, k::uuid, jsonb_build_object('round', v_round, 'kind', 'death', 'cause', v_cause->>k))
     from jsonb_object_keys(v_cause) k
    where k::uuid = any (v_dead);
  perform public._sk_reveal(p_room_id, d) from unnest(coalesce(v_dead, '{}'::uuid[])) d;

  update public.game_rooms
     set state = state || jsonb_build_object(
           'phase', 'day',
           'phase_started_at', now(),
           'last_night', jsonb_build_object(
             'round', v_round,
             'dead', coalesce((select jsonb_agg(jsonb_build_object('id', rp.user_id, 'name', rp.display_name)
                                                order by rp.display_name)
                                 from public.room_players rp
                                where rp.room_id = p_room_id and rp.user_id = any (v_dead)), '[]'::jsonb)))
   where id = p_room_id;

  v_winner := public._sk_check_winner(p_room_id);
  if v_winner is not null then perform public._sk_finish(p_room_id, v_winner); end if;
end $$;

-- Kafes oylamasını sonuçlandırır: en çok (ağırlıklı) oyu alan tek kişi kafese atılır ve rolü açıklanır. Eşitlikte kimse.
-- Komutan kimliğini açtıysa oyu 2 sayılır. Kafese atılan Hazine Avcısı ise oyun biter ve yalnız o kazanır.
create or replace function public._sk_resolve_vote(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_round int;
  v_marshal text;
  v_tally jsonb;
  v_top int;
  v_second int;
  v_skips int;
  v_absent int;
  v_caged uuid;
  v_name text;
  v_role text;
  v_winner text;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if r.status <> 'playing' or r.state->>'phase' <> 'vote' then return; end if;
  v_round := (r.state->>'round')::int;
  v_marshal := r.state->>'marshal';

  select coalesce(jsonb_agg(jsonb_build_object('id', x.t, 'name', x.name, 'votes', x.c) order by x.c desc, x.name),
                  '[]'::jsonb)
    into v_tally
    from (
      select (s.data->'vote'->>'target')::uuid as t, tp.display_name as name,
             sum(case when s.user_id::text = v_marshal then 2 else 1 end)::int as c
        from public.room_player_secrets s
        join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
        join public.room_players tp on tp.room_id = s.room_id and tp.user_id = (s.data->'vote'->>'target')::uuid and tp.is_alive
       where s.room_id = p_room_id and (s.data->'vote'->>'round')::int = v_round and (s.data->'vote'->>'target') is not null
       group by 1, 2
    ) x;
  v_top := coalesce((v_tally->0->>'votes')::int, 0);
  v_second := coalesce((v_tally->1->>'votes')::int, 0);

  select (count(*) filter (where (s.data->'vote'->>'round')::int = v_round and (s.data->'vote'->>'target') is null))::int,
         (count(*) filter (where coalesce((s.data->'vote'->>'round')::int, 0) <> v_round))::int
    into v_skips, v_absent
    from public.room_player_secrets s
    join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive and rp.left_at is null
   where s.room_id = p_room_id;

  if v_top > 0 and v_top > v_second then
    v_caged := (v_tally->0->>'id')::uuid;
    update public.room_players set is_alive = false, out_at = now()
     where room_id = p_room_id and user_id = v_caged
    returning display_name into v_name;
    select s.role into v_role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v_caged;
    perform public._sk_reveal(p_room_id, v_caged);
  end if;

  update public.game_rooms
     set state = state || jsonb_build_object(
           'phase', 'vote_result',
           'phase_started_at', now(),
           'last_vote', jsonb_build_object(
             'round', v_round,
             'caged', case when v_caged is null then null
                           else jsonb_build_object('id', v_caged, 'name', v_name, 'role', v_role) end,
             'tally', v_tally, 'skips', v_skips, 'absent', v_absent, 'tie', (v_top > 0 and v_top = v_second)))
   where id = p_room_id;

  if v_role = 'scavenger' then
    perform public._sk_finish(p_room_id, 'scavenger');
    return;
  end if;
  v_winner := public._sk_check_winner(p_room_id);
  if v_winner is not null then perform public._sk_finish(p_room_id, v_winner); end if;
end $$;

-- Oyun sürerken oyuncu ayrılınca (atılınca): rolü açıklanır, kazanan var mı bakılır, bekleyen aşama ilerler
create or replace function public._sk_after_leave(p_room_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_winner text;
  v_round int;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if r.status <> 'playing' then return; end if;
  v_round := coalesce((r.state->>'round')::int, 0);
  perform public._sk_reveal(p_room_id, p_user_id);
  v_winner := public._sk_check_winner(p_room_id);
  if v_winner is not null then
    perform public._sk_finish(p_room_id, v_winner);
    return;
  end if;
  if r.state->>'phase' = 'night' and public._sk_mode(r) <> 'auto' and public._sk_night_pending(p_room_id, v_round) = 0 then
    perform public._sk_resolve_night(p_room_id);
  elsif r.state->>'phase' = 'vote' and public._sk_vote_pending(p_room_id, v_round) = 0 then
    perform public._sk_resolve_vote(p_room_id);
  elsif r.state->>'phase' = 'day' then
    perform public._sk_skip_check(p_room_id);
  end if;
end $$;

-- Otomatik oyun: süresi dolan ya da herkesin işini bitirdiği aşamayı ilerletir (oyuna bakan her telefon tetikler)
create or replace function public._sk_auto_tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_phase text;
  v_age numeric;
  v_t jsonb;
  v_round int;
  v_pending int;
  v_idle int;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'playing' or public._sk_mode(r) <> 'auto' then return; end if;
  v_phase := r.state->>'phase';
  v_t := coalesce(r.state->'timers', '{}'::jsonb);
  v_round := coalesce((r.state->>'round')::int, 0);
  v_age := extract(epoch from now() - public._vv_phase_started(r));

  if v_phase = 'reveal' then
    select count(*)::int into v_pending
      from public.room_players rp
      join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.left_at is null and not coalesce((s.data->>'ready')::boolean, false);
    if (v_pending = 0 and v_age >= 8) or v_age >= coalesce((v_t->>'reveal')::int, 30) then
      perform public._sk_go_night(p_room_id);
    end if;
  elsif v_phase = 'night' then
    -- Herkes seçince biter ama kimin rolü olduğu süreden anlaşılmasın diye en az 15 sn sürer
    if (public._sk_night_pending(p_room_id, v_round) = 0 and v_age >= 15)
       or v_age >= coalesce((v_t->>'night')::int, 50) then
      perform public._sk_resolve_night(p_room_id);
    end if;
  elsif v_phase = 'day' then
    if v_age >= coalesce((v_t->>'day')::int, 120) then perform public._sk_go_vote(p_room_id); end if;
  elsif v_phase = 'vote' then
    if public._sk_vote_pending(p_room_id, v_round) = 0 or v_age >= coalesce((v_t->>'vote')::int, 60) then
      perform public._sk_resolve_vote(p_room_id);
    end if;
  elsif v_phase = 'vote_result' then
    if v_age >= coalesce((v_t->>'result')::int, 12) then
      -- Üst üste iki tur kimse hiçbir şey yapmadıysa oda kapanır
      v_idle := case when jsonb_array_length(coalesce(r.state->'last_night'->'dead', '[]'::jsonb)) > 0
                       or (r.state->'last_vote'->>'caged') is not null
                       or jsonb_array_length(coalesce(r.state->'last_vote'->'tally', '[]'::jsonb)) > 0
                       or coalesce((r.state->'last_vote'->>'skips')::int, 0) > 0
                     then 0 else coalesce((r.state->>'idle_rounds')::int, 0) + 1 end;
      if v_idle >= 2 then
        perform public._room_close(p_room_id, 'inactive');
      else
        update public.game_rooms set state = state || jsonb_build_object('idle_rounds', v_idle) where id = p_room_id;
        perform public._sk_go_night(p_room_id);
      end if;
    end if;
  end if;
end $$;

-- GEÇİCİ: deneme odasında botların hamleleri (oyuna bakan her telefon tetikler)
create or replace function public._sk_bots_act(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  b record;
  v_phase text;
  v_round int;
  v_age numeric;
  v_t uuid;
  v_n int;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if not found or not coalesce((r.config->>'test')::boolean, false) then return; end if;
  update public.room_players rp set last_seen_at = now()
    from public.profiles p
   where p.id = rp.user_id and p.is_bot and rp.room_id = p_room_id and rp.left_at is null;
  -- Eşleştirme lobisinde botlar (6 kişi olunca) "Hazırım" der
  if r.status = 'lobby' and coalesce((r.config->>'match')::boolean, false)
     and (select count(*) from public.room_players where room_id = p_room_id and left_at is null) >= 6 then
    update public.game_rooms
       set state = jsonb_set(state, '{ready}', coalesce((
             select jsonb_agg(distinct y.x) from (
               select jsonb_array_elements_text(coalesce(r.state->'ready', '[]'::jsonb)) as x
               union
               select rp.user_id::text from public.room_players rp join public.profiles p on p.id = rp.user_id and p.is_bot
                where rp.room_id = p_room_id and rp.left_at is null) y), '[]'::jsonb))
     where id = p_room_id;
  end if;
  if r.status <> 'playing' then return; end if;
  v_phase := r.state->>'phase';
  v_round := coalesce((r.state->>'round')::int, 0);
  v_age := extract(epoch from now() - public._vv_phase_started(r));
  for b in
    select rp.user_id, s.role, s.data
      from public.room_players rp
      join public.profiles p on p.id = rp.user_id and p.is_bot
      join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.left_at is null and rp.is_alive
  loop
    if v_phase = 'reveal' and not coalesce((b.data->>'ready')::boolean, false) then
      update public.room_player_secrets set data = data || '{"ready": true}'::jsonb
       where room_id = p_room_id and user_id = b.user_id;
    elsif v_phase = 'night' and v_age >= 4 and not public._sk_night_done(b.role, b.data, v_round) then
      if public._sk_team(b.role) = 'shark' and coalesce((b.data->'hunt'->>'round')::int, 0) <> v_round then
        select rp2.user_id into v_t
          from public.room_players rp2
          join public.room_player_secrets s2 on s2.room_id = rp2.room_id and s2.user_id = rp2.user_id
         where rp2.room_id = p_room_id and rp2.is_alive and rp2.left_at is null and public._sk_team(s2.role) <> 'shark'
         order by random() limit 1;
        update public.room_player_secrets
           set data = data || jsonb_build_object('hunt', jsonb_build_object('round', v_round, 'target', v_t))
         where room_id = p_room_id and user_id = b.user_id;
      end if;
      if b.role in ('tiger', 'hammer', 'nurse', 'lifeguard', 'oceanographer', 'squid', 'surfer')
         and coalesce((b.data->'night'->>'round')::int, 0) <> v_round then
        select rp2.user_id into v_t
          from public.room_players rp2
          join public.room_player_secrets s2 on s2.room_id = rp2.room_id and s2.user_id = rp2.user_id
         where rp2.room_id = p_room_id and rp2.is_alive and rp2.left_at is null
           and (b.role not in ('tiger', 'oceanographer', 'squid', 'surfer') or rp2.user_id <> b.user_id)
           and (b.role <> 'hammer' or public._sk_team(s2.role) <> 'shark')
           and (b.role <> 'nurse' or public._sk_team(s2.role) = 'shark')
           and (b.role <> 'lifeguard' or rp2.user_id <> b.user_id or not coalesce((b.data->>'self_used')::boolean, false))
         order by random() limit 1;
        v_n := jsonb_array_length(coalesce(b.data->'marks', '[]'::jsonb));
        update public.room_player_secrets
           set data = data || jsonb_build_object('night',
                 case when b.role = 'surfer' and v_n >= 2 and random() < 0.4
                      then jsonb_build_object('round', v_round, 'target', null, 'ignite', true)
                      else jsonb_build_object('round', v_round, 'target', v_t) end)
         where room_id = p_room_id and user_id = b.user_id;
      end if;
    elsif v_phase = 'vote' and v_age >= 6 and coalesce((b.data->'vote'->>'round')::int, 0) <> v_round then
      v_t := null;
      if random() > 0.2 then
        select rp2.user_id into v_t from public.room_players rp2
         where rp2.room_id = p_room_id and rp2.is_alive and rp2.left_at is null and rp2.user_id <> b.user_id
         order by random() limit 1;
      end if;
      update public.room_player_secrets
         set data = data || jsonb_build_object('vote', jsonb_build_object('round', v_round, 'target', v_t))
       where room_id = p_room_id and user_id = b.user_id;
    end if;
  end loop;
  if v_phase = 'vote' and public._sk_vote_pending(p_room_id, v_round) = 0 then
    perform public._sk_resolve_vote(p_room_id);
  end if;
  if v_phase = 'day' then perform public._sk_skip_check(p_room_id); end if;
end $$;

-- Odayı kilitleyerek okur; temizlik, "buradayım", botlar ve otomatik ilerleme
-- Oyun akışı günlüğü (yazışma penceresinde renkli bilgi satırları): oda durumu her değiştiğinde herkese açık olaylar
-- (aşama başladı, gece kimler öldü, zıpkın, kafes sonucu, Komutan, oyundan ayrılan, oyun sonu) state.log'a eklenir.
-- Yalnızca zaten herkese açık bilgiler yazılır; gizli roller ve gece seçimleri asla yazılmaz.
create or replace function public._sk_state_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := coalesce(old.state, '{}'::jsonb);
  n jsonb := coalesce(new.state, '{}'::jsonb);
  v_log jsonb;
  v_add jsonb := '[]'::jsonb;
  v_ph text := n->>'phase';
  v_rd int := coalesce((n->>'round')::int, 0);
  v_skip text[];
  k text;
begin
  if n is not distinct from o then return new; end if;
  v_log := case when n ? 'log' then n->'log' else coalesce(o->'log', '[]'::jsonb) end;
  -- Yeni oyun (rol çarkı, 0. tur): günlük sıfırdan başlar
  if v_ph = 'reveal' and v_rd = 0 and coalesce(o->>'phase', '') <> 'reveal' then v_log := '[]'::jsonb; end if;

  if v_ph is distinct from o->>'phase' and v_ph in ('reveal', 'night', 'day', 'vote') then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'phase', 'phase', v_ph));
  end if;
  if n->'last_night' is not null and n->'last_night' is distinct from o->'last_night' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'night', 'night', (n->'last_night'->>'round')::int,
      'ids', coalesce((select jsonb_agg(e->'id') from jsonb_array_elements(n->'last_night'->'dead') e), '[]'::jsonb)));
  end if;
  if n->'day_event' is not null and n->'day_event' is distinct from o->'day_event' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', n->'day_event'->>'kind', 'id', n->'day_event'->'id',
      'role', n->'day_event'->'role'));
  end if;
  if n->>'marshal' is not null and n->>'marshal' is distinct from o->>'marshal' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'marshal', 'id', n->'marshal'));
  end if;
  if n->'last_vote' is not null and n->'last_vote' is distinct from o->'last_vote' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'vote', 'id', n->'last_vote'->'caged'->'id',
      'role', n->'last_vote'->'caged'->'role', 'tie', coalesce((n->'last_vote'->>'tie')::boolean, false)));
  end if;
  -- Açıklanan rol: kafes, zıpkın ve Komutan zaten yazıldı; geri kalanı oyundan ayrılanlardır
  v_skip := array[n->'last_vote'->'caged'->>'id', n->'day_event'->>'id', n->>'marshal'];
  for k in select jsonb_object_keys(coalesce(n->'reveals', '{}'::jsonb)) loop
    if not coalesce(o->'reveals', '{}'::jsonb) ? k and not coalesce(k = any (v_skip), false)
       and exists (select 1 from public.room_players rp
                    where rp.room_id = new.id and rp.user_id::text = k and rp.left_at is not null) then
      v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'left', 'id', k, 'role', n->'reveals'->k));
    end if;
  end loop;
  if n->>'winner' is not null and n->>'winner' is distinct from o->>'winner' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'end', 'winner', n->>'winner'));
  end if;

  if jsonb_array_length(v_add) = 0 then return new; end if;
  v_log := v_log || (select jsonb_agg(e || jsonb_build_object('at', clock_timestamp(), 'round', v_rd,
                                                              'ph', case when v_ph = 'night' then 'night' else 'day' end)
                                      order by i)
                       from jsonb_array_elements(v_add) with ordinality as t(e, i));
  if jsonb_array_length(v_log) > 250 then
    v_log := (select jsonb_agg(e order by i) from jsonb_array_elements(v_log) with ordinality as t(e, i)
               where i > jsonb_array_length(v_log) - 250);
  end if;
  new.state := jsonb_set(n, '{log}', v_log);
  return new;
end $$;
drop trigger if exists on_sk_state_log on public.game_rooms;
create trigger on_sk_state_log
  before update of state on public.game_rooms
  for each row
  when (new.game_type = 'shark_cage')
  execute function public._sk_state_log();

create or replace function public._sk_room(p_room_id uuid)
returns public.game_rooms language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_left timestamptz;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type <> 'shark_cage' then raise exception 'room_not_found'; end if;
  if r.status in ('lobby', 'playing') then
    perform public._room_sweep(p_room_id);
    perform public._room_touch(p_room_id, auth.uid());
    select rp.left_at into v_left from public.room_players rp where rp.room_id = p_room_id and rp.user_id = auth.uid();
    if v_left is not null then raise exception 'you_left'; end if;
    perform public._sk_bots_act(p_room_id);
    perform public._sk_auto_tick(p_room_id);
    select * into r from public.game_rooms where id = p_room_id;
  end if;
  return r;
end $$;

-- Oyunu başlatır: roller dağıtılır (yalnızca oda sahibi ya da moderatör). Anlatıcı oyuncu sayılmaz.
-- Rolleri dağıtır ve oyunu başlatır (iç kullanım; çağıran odayı kilitlemiş olmalı)
-- Moderatör deneme odasında kendi rolünü seçebilir (test için). Seçim gizli tabloda durur (kimse okuyamaz), oyun
-- başlarken uygulanır: o rol dağıtımda varsa sahibiyle yer değiştirir, yoksa moderatörün rolü o olur. Yalnızca deneme
-- odasında (botlu, kimseye puan yazılmayan) geçerlidir; gerçek oyunda moderatör rol seçemez.
create table if not exists public.sk_role_picks (
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  primary key (room_id, user_id)
);
alter table public.sk_role_picks enable row level security;

create or replace function public.sk_pick_role(p_room_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  perform public._require_admin();
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.game_type <> 'shark_cage' then raise exception 'room_not_found'; end if;
  if r.status <> 'lobby' then raise exception 'invalid_transition'; end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id and left_at is null) then
    raise exception 'not_in_room';
  end if;
  if p_role is null then
    delete from public.sk_role_picks where room_id = p_room_id and user_id = v.id;
    return;
  end if;
  if p_role not in ('alpha', 'tiger', 'hammer', 'nurse', 'shark', 'lifeguard', 'oceanographer', 'spearman', 'marshal',
                    'medium', 'tourist', 'squid', 'surfer', 'scavenger') then
    raise exception 'invalid_role';
  end if;
  insert into public.sk_role_picks (room_id, user_id, role) values (p_room_id, v.id, p_role)
  on conflict (room_id, user_id) do update set role = excluded.role;
end $$;

create or replace function public._sk_begin(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_n int;
  v_min int;
  v_max int;
  v_roles text[];
  v_pick record;
  v_mine text;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if r.status <> 'lobby' then raise exception 'invalid_transition'; end if;
  if public._sk_mode(r) = 'narrator' then
    delete from public.room_players where room_id = p_room_id and user_id = r.host_id;
  end if;
  select min_players, max_players into v_min, v_max from public.game_types where key = 'shark_cage';
  select count(*)::int into v_n from public.room_players where room_id = p_room_id and left_at is null;
  if v_n < coalesce(v_min, 6) then raise exception 'not_enough_players'; end if;
  if v_n > coalesce(v_max, 16) then raise exception 'room_full'; end if;
  perform public._rp_compact_seats(p_room_id);
  v_roles := public._sk_roles(v_n);

  delete from public.room_player_secrets where room_id = p_room_id;
  insert into public.room_player_secrets (room_id, user_id, role, data)
  select p_room_id, x.user_id, v_roles[x.rn], '{}'::jsonb
    from (select rp.user_id, row_number() over (order by random())::int as rn
            from public.room_players rp where rp.room_id = p_room_id and rp.left_at is null) x;

  -- Moderatörün rol seçimi (yalnızca deneme odasında)
  if coalesce((r.config->>'test')::boolean, false) then
    for v_pick in
      select pk.user_id, pk.role from public.sk_role_picks pk
        join public.profiles pr on pr.id = pk.user_id and pr.role = 'admin'
        join public.room_players rp on rp.room_id = pk.room_id and rp.user_id = pk.user_id and rp.left_at is null
       where pk.room_id = p_room_id
    loop
      select s.role into v_mine from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v_pick.user_id;
      if v_mine is distinct from v_pick.role then
        update public.room_player_secrets set role = v_mine
         where (room_id, user_id) = (select s.room_id, s.user_id from public.room_player_secrets s
                                      where s.room_id = p_room_id and s.role = v_pick.role and s.user_id <> v_pick.user_id
                                        and not exists (select 1 from public.sk_role_picks o
                                                         where o.room_id = s.room_id and o.user_id = s.user_id)
                                      limit 1);
        update public.room_player_secrets set role = v_pick.role where room_id = p_room_id and user_id = v_pick.user_id;
      end if;
    end loop;
  end if;
  delete from public.sk_role_picks where room_id = p_room_id;

  update public.room_players set is_alive = true, score = 0, out_at = null where room_id = p_room_id;
  update public.game_rooms
     set status = 'playing',
         started_at = now(),
         state = jsonb_build_object('phase', 'reveal', 'round', 0, 'phase_started_at', now(),
                                    'counts', public._sk_counts(v_n), 'reveals', '{}'::jsonb,
                                    'odds', public._sk_role_odds(v_n),
                                    'timers', jsonb_build_object(
                                      'reveal', public.setting_int('sk_reveal_seconds', 30),
                                      'night', public.setting_int('sk_night_seconds', 50),
                                      'day', public.setting_int('sk_day_seconds', 120),
                                      'vote', public.setting_int('sk_vote_seconds', 60),
                                      'result', public.setting_int('sk_result_seconds', 12)))
   where id = p_room_id;
end $$;

create or replace function public.sk_start(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'invalid_transition'; end if;
  -- Eşleştirme odası "Hazırım" çoğunluğuyla kendiliğinden başlar
  if coalesce((r.config->>'match')::boolean, false) then raise exception 'match_room'; end if;
  perform public._sk_begin(p_room_id);
end $$;

-- "Rolümü gördüm"
create or replace function public.sk_ready(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  update public.room_player_secrets set data = data || '{"ready": true}'::jsonb
   where room_id = p_room_id and user_id = v.id;
  if not found then raise exception 'not_in_room'; end if;
end $$;

-- Gece seçimi. p_kind: 'hunt' (köpekbalıklarının av oyu), 'ability' (rol yeteneği), 'ignite' (Sörfçü: Telsiz Patlat).
-- p_target boş = bu gece kullanmıyorum.
create or replace function public.sk_night_action(p_room_id uuid, p_kind text, p_target uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  me public.room_player_secrets;
  v_round int;
  v_alive boolean;
  t_role text;
  t_alive boolean;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'night' then raise exception 'wrong_phase'; end if;
  v_round := (r.state->>'round')::int;
  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;
  if not found then raise exception 'not_in_room'; end if;
  select rp.is_alive into v_alive from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  if not coalesce(v_alive, false) then raise exception 'you_are_dead'; end if;

  if p_target is not null then
    select s.role, rp.is_alive into t_role, t_alive
      from public.room_players rp
      join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
     where rp.room_id = p_room_id and rp.user_id = p_target and rp.left_at is null;
    if not found or not t_alive then raise exception 'invalid_target'; end if;
  end if;

  if p_kind = 'hunt' then
    if public._sk_team(me.role) <> 'shark' then raise exception 'no_night_action'; end if;
    if p_target is not null and public._sk_team(t_role) = 'shark' then raise exception 'cannot_target_ally'; end if;
    update public.room_player_secrets
       set data = data || jsonb_build_object('hunt', jsonb_build_object('round', v_round, 'target', p_target))
     where room_id = p_room_id and user_id = v.id;
  elsif p_kind = 'ignite' then
    if me.role <> 'surfer' then raise exception 'no_night_action'; end if;
    if jsonb_array_length(coalesce(me.data->'marks', '[]'::jsonb)) = 0 then raise exception 'no_marks'; end if;
    update public.room_player_secrets
       set data = data || jsonb_build_object('night', jsonb_build_object('round', v_round, 'target', null, 'ignite', true))
     where room_id = p_room_id and user_id = v.id;
  elsif p_kind = 'ability' then
    if me.role not in ('tiger', 'hammer', 'nurse', 'lifeguard', 'oceanographer', 'squid', 'surfer') then
      raise exception 'no_night_action';
    end if;
    if p_target is not null then
      if p_target = v.id and me.role in ('tiger', 'oceanographer', 'squid', 'surfer', 'hammer') then
        raise exception 'invalid_target';
      end if;
      if me.role = 'hammer' and public._sk_team(t_role) = 'shark' then raise exception 'cannot_target_ally'; end if;
      if me.role = 'nurse' and public._sk_team(t_role) <> 'shark' then raise exception 'sharks_only'; end if;
      if me.role = 'lifeguard' and p_target = v.id and coalesce((me.data->>'self_used')::boolean, false) then
        raise exception 'self_used';
      end if;
      if me.role = 'surfer' and coalesce(me.data->'marks', '[]'::jsonb) ? p_target::text then
        raise exception 'already_marked';
      end if;
    end if;
    update public.room_player_secrets
       set data = data || jsonb_build_object('night', jsonb_build_object('round', v_round, 'target', p_target))
     where room_id = p_room_id and user_id = v.id;
  else
    raise exception 'invalid_kind';
  end if;

  if public._sk_night_pending(p_room_id, v_round) = 0 then
    if public._sk_mode(r) = 'auto' then perform public._sk_auto_tick(p_room_id);
    else perform public._sk_resolve_night(p_room_id); end if;
  end if;
end $$;

-- Plaj: Zıpkıncı tek zıpkınını atar (2. günden itibaren). Vurulan ölür ve rolü açıklanır; Hemşire'nin o gece koruduğu
-- köpekbalığı kurtulur. Zıpkıncı masum vursa da ölmez.
create or replace function public.sk_spear(p_room_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  me public.room_player_secrets;
  v_round int;
  v_alive boolean;
  t_role text;
  v_name text;
  v_shield boolean;
  v_winner text;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'day' then raise exception 'wrong_phase'; end if;
  v_round := (r.state->>'round')::int;
  if v_round < 2 then raise exception 'spear_day_one'; end if;
  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;
  if not found or me.role <> 'spearman' then raise exception 'no_spear'; end if;
  select rp.is_alive into v_alive from public.room_players rp where rp.room_id = p_room_id and rp.user_id = v.id;
  if not coalesce(v_alive, false) then raise exception 'you_are_dead'; end if;
  if coalesce((me.data->>'spear_used')::boolean, false) then raise exception 'spear_used'; end if;
  if p_target = v.id then raise exception 'invalid_target'; end if;
  select s.role, rp.display_name into t_role, v_name
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = p_target and rp.is_alive and rp.left_at is null;
  if not found then raise exception 'invalid_target'; end if;

  update public.room_player_secrets set data = data || '{"spear_used": true}'::jsonb
   where room_id = p_room_id and user_id = v.id;
  v_shield := public._sk_team(t_role) = 'shark' and exists (
    select 1 from public.room_player_secrets s
     where s.room_id = p_room_id and s.role = 'nurse'
       and (s.data->'shield'->>'round')::int = v_round and s.data->'shield'->>'target' = p_target::text);
  if v_shield then
    update public.game_rooms
       set state = state || jsonb_build_object('day_event', jsonb_build_object('round', v_round, 'kind', 'spear_miss',
                                                'id', p_target, 'name', v_name))
     where id = p_room_id;
    return;
  end if;
  update public.room_players set is_alive = false, out_at = now() where room_id = p_room_id and user_id = p_target;
  perform public._sk_reveal(p_room_id, p_target);
  update public.game_rooms
     set state = state || jsonb_build_object('day_event', jsonb_build_object('round', v_round, 'kind', 'spear',
                                              'id', p_target, 'name', v_name, 'role', t_role))
   where id = p_room_id;
  v_winner := public._sk_check_winner(p_room_id);
  if v_winner is not null then perform public._sk_finish(p_room_id, v_winner); end if;
end $$;

-- Plaj / oylama: Sahil Güvenlik Komutanı kimliğini açar; oyu artık 2 sayılır
create or replace function public.sk_reveal_marshal(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' not in ('day', 'vote') then raise exception 'wrong_phase'; end if;
  if not exists (select 1 from public.room_player_secrets s
                   join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.is_alive
                  where s.room_id = p_room_id and s.user_id = v.id and s.role = 'marshal') then
    raise exception 'not_marshal';
  end if;
  if r.state->>'marshal' is not null then raise exception 'already_revealed'; end if;
  update public.game_rooms set state = state || jsonb_build_object('marshal', v.id) where id = p_room_id;
  perform public._sk_reveal(p_room_id, v.id);
end $$;

-- Kafes oyu (açık oy). p_target boş = pas. Herkes oy verince oylama biter.
create or replace function public.sk_vote(p_room_id uuid, p_target uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_round int;
  v_alive boolean;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'vote' then raise exception 'wrong_phase'; end if;
  v_round := (r.state->>'round')::int;
  select rp.is_alive into v_alive from public.room_players rp
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if not found then raise exception 'not_in_room'; end if;
  if not v_alive then raise exception 'you_are_dead'; end if;
  if p_target is not null then
    if p_target = v.id then raise exception 'invalid_target'; end if;
    perform 1 from public.room_players where room_id = p_room_id and user_id = p_target and is_alive and left_at is null;
    if not found then raise exception 'invalid_target'; end if;
  end if;
  update public.room_player_secrets
     set data = data || jsonb_build_object('vote', jsonb_build_object('round', v_round, 'target', p_target))
   where room_id = p_room_id and user_id = v.id;
  if public._sk_vote_pending(p_room_id, v_round) = 0 then perform public._sk_resolve_vote(p_room_id); end if;
end $$;

-- Oyunu elle ilerletir (oda sahibi "Ben Yöneticiyim" modunda ya da anlatıcı). Otomatik oyunda kullanılamaz.
-- reveal -> gece, gece -> sonuç, plaj -> oylama, oylama -> sonuç, sonuç -> gece. Oynayan yönetici geceyi ve oylamayı
-- ancak sk_force_end_seconds (45) dolunca erken bitirebilir.
create or replace function public.sk_next(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_phase text;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.host_id <> v.id and v.role <> 'admin' then raise exception 'forbidden'; end if;
  if public._sk_mode(r) = 'auto' then raise exception 'auto_mode'; end if;
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  v_phase := r.state->>'phase';
  if v_phase in ('night', 'vote') and not public._sk_is_omni(r, v.id)
     and now() < public._vv_phase_started(r) + make_interval(secs => public.setting_int('sk_force_end_seconds', 45)) then
    raise exception 'too_early';
  end if;
  if v_phase in ('reveal', 'vote_result') then perform public._sk_go_night(p_room_id);
  elsif v_phase = 'night' then perform public._sk_resolve_night(p_room_id);
  elsif v_phase = 'day' then perform public._sk_go_vote(p_room_id);
  elsif v_phase = 'vote' then perform public._sk_resolve_vote(p_room_id);
  else raise exception 'wrong_phase'; end if;
end $$;

-- Yeni el zinciri: oyun bitince açılan bekleme odası config.rematch_of ile önceki odaya bağlıdır. Herkese açık yazışma
-- bekleme odasında da sürer; bu odanın ve önceki 2 elin mesajları okunur (hand: 0 bu el, 1 önceki el, 2 iki el önce).
create or replace function public._room_chain(p_room_id uuid)
returns table (room_id uuid, hand int) language sql stable security definer set search_path = public as $$
  with recursive c(room_id, hand) as (
    select p_room_id, 0
    union all
    select (r.config->>'rematch_of')::uuid, c.hand + 1
      from c join public.game_rooms r on r.id = c.room_id
     where c.hand < 2 and r.config ? 'rematch_of'
  )
  select c.room_id, c.hand from c;
$$;

create or replace function public._room_all_chat(p_room_id uuid, p_user uuid, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                               'mine', d.user_id = p_user, 'from', d.user_id, 'channel', d.channel,
                                               'round', d.round, 'phase', d.phase, 'hand', d.hand)
                            order by d.created_at), '[]'::jsonb)
    from (select x.*, c.hand
            from public.vv_dead_chat x
            join public._room_chain(p_room_id) c on c.room_id = x.room_id
           where x.channel = 'all'
           order by x.created_at desc limit p_limit) d;
$$;

-- Sohbet: 'all' (herkese açık; plajda ve oylamada yaşayanlar yazar, odadaki herkes okur), 'shark' (yaşayan
-- köpekbalıkları, yalnızca gece) ya da 'dead' (elenenler; Medyum plajda ve oylamada da yazar). Fısıltı yoktur.
create or replace function public.sk_say(p_room_id uuid, p_channel text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_name text;
  v_alive boolean;
  v_role text;
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_body) not between 1 and 120 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  r := public._sk_room(p_room_id);
  if r.status not in ('playing', 'lobby') then raise exception 'wrong_phase'; end if;
  select rp.display_name, rp.is_alive, s.role into v_name, v_alive, v_role
    from public.room_players rp
    left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if v_name is null then raise exception 'not_in_room'; end if;
  -- Bekleme odasında odadaki herkes herkese açık yazışmaya yazar
  if r.status = 'lobby' then
    if p_channel <> 'all' then raise exception 'invalid_channel'; end if;
  elsif p_channel = 'all' then
    if not v_alive then raise exception 'not_alive'; end if;
    if r.state->>'phase' not in ('day', 'vote', 'vote_result') then raise exception 'day_only'; end if;
  elsif p_channel = 'shark' then
    if not v_alive or public._sk_team(v_role) <> 'shark' then raise exception 'forbidden'; end if;
    if r.state->>'phase' <> 'night' then raise exception 'night_only'; end if;
  elsif p_channel = 'dead' then
    if v_alive and not (v_role = 'medium' and r.state->>'phase' in ('day', 'vote')) then raise exception 'not_dead'; end if;
  else
    raise exception 'invalid_channel';
  end if;
  if exists (select 1 from public.vv_dead_chat where room_id = p_room_id and user_id = v.id
              and created_at > now() - interval '1500 milliseconds') then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.vv_dead_chat where room_id = p_room_id and user_id = v.id) >= 80 then
    raise exception 'chat_limit';
  end if;
  insert into public.vv_dead_chat (room_id, user_id, name, body, channel, round, phase)
  -- "(Medyum)" etiketi yalnızca ölülerin sohbetinde (herkese açık yazışmada Medyum'un kimliği belli olmamalı)
  values (p_room_id, v.id, case when v_role = 'medium' and v_alive and p_channel = 'dead' then v_name || ' (Medyum)' else v_name end,
          v_body, p_channel, case when r.status = 'lobby' then 0 else coalesce((r.state->>'round')::int, 0) end,
          case when r.status = 'lobby' then 'lobby' else r.state->>'phase' end);
end $$;

-- Kişiye özel görünüm. Rol yalnızca: kendin, köpekbalığıysan takım arkadaşların, açıklananlar (kafes, zıpkın, ayrılan,
-- Komutan), anlatıcı ve oyun bitince herkes. Gece kimin ne seçtiği yalnızca anlatıcıya (köpekbalıkları birbirinin av
-- oyunu görür). Kafes oyları herkese açıktır.
create or replace function public.sk_view(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  me public.room_player_secrets;
  v_is_player boolean;
  v_alive boolean;
  v_left timestamptz;
  v_omni boolean;
  v_phase text;
  v_round int;
  v_all boolean;
  v_shark boolean;
  v_players jsonb;
  v_host_name text;
  v_host_role text;
  v_count int;
  v_mode text;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type <> 'shark_cage' then raise exception 'room_not_found'; end if;
  if r.remote then perform public._sk_voice_cleanup(); end if;
  if r.status in ('lobby', 'playing') then
    perform public._room_sweep(p_room_id);
    perform public._room_touch(p_room_id, v.id);
    -- Oyunu ilerletme aynı anda yalnızca bir çağrıda yapılır; öteki oyuncuların çağrıları kilidi beklemeden okur
    if pg_try_advisory_xact_lock(hashtext('room_tick'), hashtext(p_room_id::text)) then
      perform public._sk_bots_act(p_room_id);
      if r.status = 'playing' then perform public._sk_auto_tick(p_room_id); end if;
      if r.status = 'lobby' then perform public._room_lobby_tick(p_room_id); end if;
      perform public._kick_tick(p_room_id);
    end if;
    select * into r from public.game_rooms where id = p_room_id;
  end if;

  v_mode := public._sk_mode(r);
  select rp.is_alive, rp.left_at into v_alive, v_left from public.room_players rp
   where rp.room_id = p_room_id and rp.user_id = v.id;
  v_is_player := found;
  v_alive := coalesce(v_alive, false);
  v_omni := public._sk_is_omni(r, v.id);
  if not (v_is_player or r.host_id = v.id or v.role = 'admin') then raise exception 'forbidden'; end if;

  v_phase := case when r.status = 'lobby' then 'lobby' when r.status = 'cancelled' then 'cancelled'
                  when r.status = 'finished' then 'ended' else coalesce(r.state->>'phase', 'reveal') end;
  v_round := coalesce((r.state->>'round')::int, 0);
  v_all := v_omni or r.status = 'finished';
  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;
  v_shark := public._sk_team(me.role) = 'shark';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.user_id,
           'seat', x.seat_no,
           'name', x.display_name,
           'avatar', x.avatar_index,
           'is_alive', x.is_alive,
           'left', x.left_at is not null,
           'is_host', x.user_id = r.host_id,
           'is_me', x.user_id = v.id,
           'role', x.vis_role,
           'team', public._sk_team(x.vis_role),
           'ally', v_shark and public._sk_team(x.role) = 'shark' and x.user_id <> v.id,
           'revealed', r.state->'reveals' ? x.user_id::text,
           'marshal', r.state->>'marshal' = x.user_id::text,
           -- Oyunda kaldığı süre (sn): elenen / ayrılan için elendiği ana kadar; oyun bitince sona kalanlar için bitişe kadar
           'alive_sec', case when r.started_at is not null and r.status in ('playing', 'finished')
                              and (not x.is_alive or r.status = 'finished')
                             then greatest(0, extract(epoch from coalesce(x.out_at, x.left_at, r.finished_at, now())
                                                                 - r.started_at)::int) end,
           -- Oyun bitince bu oyundan kazandığı puan (sıralama tablosunda görünür)
           'points', case when r.status = 'finished' then
                       (select coalesce(sum(pe.amount), 0) from public.point_events pe
                         where pe.room_id = r.id and pe.user_id = x.user_id
                           and pe.source in ('game_play', 'game_remote')) end,
           'hunt_pick', case when (v_shark or v_omni) and public._sk_team(x.role) = 'shark'
                              and (x.data->'hunt'->>'round')::int = v_round then x.data->'hunt'->>'target' end,
           'acted', case when v_omni and v_phase = 'night' then public._sk_night_done(x.role, x.data, v_round)
                         when v_omni and v_phase = 'reveal' then coalesce((x.data->>'ready')::boolean, false) end
         ) order by x.seat_no), '[]'::jsonb)
    into v_players
    from (
      select rp.*, s.role, s.data, pr.avatar_index,
             coalesce(rp.seat, (row_number() over (order by rp.joined_at, rp.user_id))::int) as seat_no,
             case when v_all or rp.user_id = v.id or (v_shark and public._sk_team(s.role) = 'shark')
                  then s.role else r.state->'reveals'->>(rp.user_id::text) end as vis_role
        from public.room_players rp
        left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
        left join public.profiles pr on pr.id = rp.user_id
       where rp.room_id = p_room_id
    ) x;

  select count(*)::int into v_count from public.room_players where room_id = p_room_id and left_at is null;
  select p.full_name, p.role into v_host_name, v_host_role from public.profiles p where p.id = r.host_id;

  return jsonb_build_object(
    'phase', v_phase,
    'status', r.status,
    'round', v_round,
    'winner', r.state->>'winner',
    'mode', v_mode,
    'remote', r.remote,
    'event', r.event_id is not null,
    'test', coalesce((r.config->>'test')::boolean, false),
    -- Kod: oda sahibine; eşleştirme odasında (davet bağlantısı için) bekleme salonundaki herkese
    'code', case when r.host_id = v.id
                   or ((coalesce((r.config->>'match')::boolean, false) or r.config ? 'rematch_of')
                       and v_is_player and r.status = 'lobby')
                 then (select c.code from public.room_codes c where c.room_id = r.id) end,
    'match', coalesce((r.config->>'match')::boolean, false),
    'lobby_ready', case when r.status = 'lobby' then coalesce(r.state->'ready', '[]'::jsonb) end,
    -- Yeni el: bekleme odasında "Hazırım" geri sayımı (sn) ve biten oyundan sonra açılan bekleme odası
    'rematch', r.config ? 'rematch_of',
    'rematch_left', case when r.status = 'lobby' and r.state ? 'rematch_until'
                         then greatest(0, ceil(extract(epoch from (r.state->>'rematch_until')::timestamptz - now()))::int) end,
    -- Eşleştirme lobisi: oyunun başlamasına kalan bekleme süresi (sn)
    'match_left', case when r.status = 'lobby' and r.state ? 'match_until'
                       then greatest(0, ceil(extract(epoch from (r.state->>'match_until')::timestamptz - now()))::int) end,
    -- Oyuncu atma oylaması ve kişinin mikrofon / şikâyet yasağı
    'kick', public._kick_state(r.id, v.id),
    'mic_banned', v.mic_banned_until is not null and v.mic_banned_until > now(),
    'report_banned', v.report_banned_until is not null and v.report_banned_until > now(),
    'next_room', case when r.status = 'finished' then r.state->>'next_room' end,
    'next_note', case when r.status = 'finished' then r.state->>'rematch' end,
    'close_reason', r.state->>'close_reason',
    'counts', coalesce(r.state->'counts', public._sk_counts(greatest(6, v_count))),
    -- Bu oyunda dağıtılan roller ve sayıları (Wolvesville'deki gibi herkese açık) ve çarktaki gelme oranları
    'roles', case when r.status in ('playing', 'finished') then (
               select coalesce(jsonb_object_agg(x.role, x.n), '{}'::jsonb)
                 from (select s.role, count(*)::int as n from public.room_player_secrets s
                        where s.room_id = p_room_id and s.role is not null group by s.role) x) end,
    'odds', r.state->'odds',
    'players', v_players,
    'host', jsonb_build_object('id', r.host_id, 'name', case when v_host_role = 'admin' then 'PeopleHere' else v_host_name end,
                               'is_me', r.host_id = v.id, 'is_moderator', v_host_role = 'admin'),
    'marshal', r.state->>'marshal',
    'last_night', r.state->'last_night',
    'day_event', case when (r.state->'day_event'->>'round')::int = v_round then r.state->'day_event' end,
    'last_vote', r.state->'last_vote',
    -- Oyun akışı günlüğü (herkese açık olaylar; yazışma penceresinde renkli satırlar)
    'log', coalesce(r.state->'log', '[]'::jsonb),
    'votes', case when v_phase in ('vote', 'vote_result') then (
               select coalesce(jsonb_agg(jsonb_build_object('from', s.user_id, 'to', s.data->'vote'->>'target',
                                                            'weight', case when s.user_id::text = r.state->>'marshal' then 2 else 1 end)
                                         order by rp.joined_at), '[]'::jsonb)
                 from public.room_player_secrets s
                 join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
                where s.room_id = p_room_id and (s.data->'vote'->>'round')::int = v_round)
             else '[]'::jsonb end,
    -- "Tartışmayı hızlı geç": plajda yaşayanların yarısından fazlası işaretlerse kafes oylaması hemen başlar
    'skip', case when v_phase = 'day' then public._skip_tally(p_room_id, v_round)
                   || jsonb_build_object('mine', coalesce((me.data->>'skip_round')::int, 0) = v_round) end,
    'pending', case when v_phase = 'vote' then jsonb_build_object(
                 'total', (select count(*) from public.room_players where room_id = p_room_id and is_alive and left_at is null),
                 'done', (select count(*) from public.room_player_secrets s
                            join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id
                           where s.room_id = p_room_id and rp.is_alive and rp.left_at is null
                             and (s.data->'vote'->>'round')::int = v_round)) end,
    'ready_count', (select count(*) from public.room_player_secrets s
                      join public.room_players rp on rp.room_id = s.room_id and rp.user_id = s.user_id and rp.left_at is null
                     where s.room_id = p_room_id and coalesce((s.data->>'ready')::boolean, false)),
    'phase_limit', case when v_mode = 'auto' and r.status = 'playing'
                        then (r.state->'timers'->>(case v_phase when 'vote_result' then 'result' else v_phase end))::int end,
    'phase_age', greatest(0, round(extract(epoch from now() - public._vv_phase_started(r)), 2)),
    'force_after', public.setting_int('sk_force_end_seconds', 45),
    'min_players', 6,
    'max_players', 16,
    'me', jsonb_build_object(
      'is_player', v_is_player,
      'left', v_left is not null,
      'is_host', r.host_id = v.id,
      'is_admin', v.role = 'admin',
      'is_omniscient', v_omni,
      'can_control', v_mode <> 'auto' and (r.host_id = v.id or v.role = 'admin') and r.status in ('lobby', 'playing'),
      'is_alive', v_alive,
      'role', me.role,
      'team', public._sk_team(me.role),
      'ready', coalesce((me.data->>'ready')::boolean, false),
      'done', case when v_phase = 'night' then public._sk_night_done(me.role, me.data, v_round) end,
      'ability_done', coalesce((me.data->'night'->>'round')::int = v_round, false),
      'night_target', case when (me.data->'night'->>'round')::int = v_round then me.data->'night'->>'target' end,
      'ignite', case when (me.data->'night'->>'round')::int = v_round then coalesce((me.data->'night'->>'ignite')::boolean, false) end,
      'hunt_target', case when (me.data->'hunt'->>'round')::int = v_round then me.data->'hunt'->>'target' end,
      'voted', coalesce((me.data->'vote'->>'round')::int = v_round, false),
      'vote_target', case when (me.data->'vote'->>'round')::int = v_round then me.data->'vote'->>'target' end,
      'notes', coalesce(me.data->'notes', '[]'::jsonb),
      'marks', coalesce(me.data->'marks', '[]'::jsonb),
      'self_used', coalesce((me.data->>'self_used')::boolean, false),
      'spear_used', coalesce((me.data->>'spear_used')::boolean, false),
      -- Bu tartışmada kalan bas-konuş süresi (ms): plaj+oylama bir tartışma, her dalış ayrı (köpekbalığı frekansı)
      -- Moderatörün deneme odası için seçtiği rol (yalnızca kendisine)
      'picked_role', case when r.status = 'lobby' and v.role = 'admin'
                          then (select pk.role from public.sk_role_picks pk where pk.room_id = p_room_id and pk.user_id = v.id) end,
      'voice_left_ms', greatest(0, public.setting_int('sk_voice_round_ms', 10000)
                         - case when (me.data->'voice'->>'round')::int = v_round
                                 and me.data->'voice'->>'channel' = (case when v_phase = 'night' then 'shark' else 'all' end)
                                then coalesce((me.data->'voice'->>'ms')::int, 0) else 0 end)),
    -- Bas-konuş ses mesajları (yalnızca uzaktan odada; künye, ses sk_voice_get ile alınır)
    'voice', case when r.remote and r.status = 'playing' then public._sk_clips_for(p_room_id, v.id) else '[]'::jsonb end,
    'server_now', now(),
    -- Sohbetler: köpekbalıkları (yaşayan köpekbalıkları), elenenler (elenenler; Medyum plajda/oylamada); bitince herkes
    -- Herkese açık yazışma: odadaki herkes okur
    'chat', case when r.status in ('lobby', 'playing', 'finished') then public._room_all_chat(p_room_id, v.id, 80) end,
    'shark_chat', case when (v_shark and v_alive) or v_omni or r.status = 'finished' then (
                    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                                                 'mine', d.user_id = v.id, 'from', d.user_id,
                                                                 'round', d.round, 'phase', d.phase) order by d.created_at), '[]'::jsonb)
                      from (select * from public.vv_dead_chat where room_id = p_room_id and channel = 'shark'
                             order by created_at desc limit 60) d) end,
    'dead_chat', case when (v_is_player and not v_alive and v_left is null) or v_omni or r.status = 'finished'
                        or (me.role = 'medium' and v_alive and v_phase in ('day', 'vote')) then (
                    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                                                 'mine', d.user_id = v.id, 'from', d.user_id,
                                                                 'round', d.round, 'phase', d.phase) order by d.created_at), '[]'::jsonb)
                      from (select * from public.vv_dead_chat where room_id = p_room_id and channel = 'dead'
                             order by created_at desc limit 60) d) end
  );
end $$;

-- Bekleme odasında boş kutucuğa geç (iki oyun). Kutucuklar 1..en çok oyuncu; dolu kutucuğa geçilmez.
create or replace function public.room_take_seat(p_room_id uuid, p_seat int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_max int;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type not in ('shark_cage', 'vampire_villager') then raise exception 'room_not_found'; end if;
  if r.status <> 'lobby' then raise exception 'wrong_phase'; end if;
  select coalesce(max_players, 16) into v_max from public.game_types where key = r.game_type;
  if p_seat is null or p_seat < 1 or p_seat > v_max then raise exception 'invalid_seat'; end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id and left_at is null) then
    raise exception 'not_in_room';
  end if;
  perform pg_advisory_xact_lock(hashtext('rp_seat:' || p_room_id::text));
  if exists (select 1 from public.room_players where room_id = p_room_id and seat = p_seat and user_id <> v.id) then
    raise exception 'seat_taken';
  end if;
  update public.room_players set seat = p_seat where room_id = p_room_id and user_id = v.id;
  perform public._room_touch(p_room_id, v.id);
end $$;

-- Mesaj geçmişi: kişinin görmeye hakkı olan bütün yazışmalar (herkese açık, köpekbalığı frekansı, ölülerin frekansı),
-- tur ve aşamasıyla (gece / gündüz ayrımı için). Görünürlük kuralları sk_view ile aynıdır; en çok 400 mesaj.
create or replace function public.sk_history(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_is_player boolean;
  v_alive boolean;
  v_left timestamptz;
  v_role text;
  v_omni boolean;
  v_phase text;
  v_shark boolean;
  v_dead boolean;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type <> 'shark_cage' then raise exception 'room_not_found'; end if;
  select rp.is_alive, rp.left_at into v_alive, v_left from public.room_players rp
   where rp.room_id = p_room_id and rp.user_id = v.id;
  v_is_player := found;
  v_alive := coalesce(v_alive, false);
  v_omni := public._sk_is_omni(r, v.id);
  if not (v_is_player or r.host_id = v.id or v.role = 'admin') then raise exception 'forbidden'; end if;
  select s.role into v_role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id;
  v_phase := case when r.status = 'finished' then 'ended' else coalesce(r.state->>'phase', '') end;
  v_shark := (public._sk_team(v_role) = 'shark' and v_alive) or v_omni or r.status = 'finished';
  v_dead := (v_is_player and not v_alive and v_left is null) or v_omni or r.status = 'finished'
            or (v_role = 'medium' and v_alive and v_phase in ('day', 'vote'));
  if r.status not in ('lobby', 'playing', 'finished') then return '[]'::jsonb; end if;
  -- Herkese açık yazışma: bu el + önceki 2 el; takım ve ölüler kanalı yalnızca bu elden
  return (
    select coalesce(jsonb_agg(e order by e->>'at'), '[]'::jsonb)
      from (select e from jsonb_array_elements(public._room_all_chat(p_room_id, v.id, 400)) e
            union all
            select jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                      'mine', d.user_id = v.id, 'from', d.user_id, 'channel', d.channel,
                                      'round', d.round, 'phase', d.phase, 'hand', 0)
              from (select * from public.vv_dead_chat
                     where room_id = p_room_id
                       and ((channel = 'shark' and v_shark) or (channel = 'dead' and v_dead))
                     order by created_at desc limit 400) d) x(e));
end $$;


-- ---------------------------------------------------------------------
-- Vampir–Köylü, Köpekbalığı Kafesi ekranıyla aynı: herkese açık yazışma (sabah ve oylamada yaşayanlar), vampirlerin
-- gece frekansı, ölülerin frekansı; oyun akışı günlüğü; oyuncu numarası, oyunda kalma süresi, oyun sonu puanı.
-- Kurallar ve roller değişmez. Mesajlar Köpekbalığı'ndaki gibi vv_dead_chat tablosunda kanal, tur ve aşamayla durur.
-- ---------------------------------------------------------------------
create or replace function public.vv_say(p_room_id uuid, p_channel text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_name text;
  v_alive boolean;
  v_role text;
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_body) not between 1 and 120 then raise exception 'invalid_body'; end if;
  if public._has_link(v_body) then raise exception 'links_not_allowed'; end if;
  r := public._vv_room(p_room_id);
  if r.status not in ('playing', 'lobby') then raise exception 'wrong_phase'; end if;
  select rp.display_name, rp.is_alive, s.role into v_name, v_alive, v_role
    from public.room_players rp
    left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if v_name is null then raise exception 'not_in_room'; end if;
  -- Bekleme odasında odadaki herkes herkese açık yazışmaya yazar
  if r.status = 'lobby' then
    if p_channel <> 'all' then raise exception 'invalid_channel'; end if;
  elsif p_channel = 'all' then
    if not v_alive then raise exception 'not_alive'; end if;
    if r.state->>'phase' not in ('dawn', 'vote', 'vote_result') then raise exception 'day_only'; end if;
  elsif p_channel = 'shark' then
    if not v_alive or v_role <> 'vampire' then raise exception 'forbidden'; end if;
    if r.state->>'phase' <> 'night' then raise exception 'night_only'; end if;
  elsif p_channel = 'dead' then
    if v_alive then raise exception 'not_dead'; end if;
  else
    raise exception 'invalid_channel';
  end if;
  if exists (select 1 from public.vv_dead_chat where room_id = p_room_id and user_id = v.id
              and created_at > now() - interval '1500 milliseconds') then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.vv_dead_chat where room_id = p_room_id and user_id = v.id) >= 80 then
    raise exception 'chat_limit';
  end if;
  insert into public.vv_dead_chat (room_id, user_id, name, body, channel, round, phase)
  values (p_room_id, v.id, v_name, v_body, p_channel,
          case when r.status = 'lobby' then 0 else coalesce((r.state->>'round')::int, 0) end,
          case when r.status = 'lobby' then 'lobby' when r.state->>'phase' = 'dawn' then 'day' else r.state->>'phase' end);
end $$;

-- Kişinin görebildiği kanallar (vv_view ve vv_history ortak): vampir frekansı yaşayan vampirlere, ölülerin frekansı
-- elenenlere (ayrılan hariç); anlatıcı ve oyun bitince herkes hepsini görür
create or replace function public._vv_chat_rights(p_room_id uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_alive boolean;
  v_left timestamptz;
  v_player boolean;
  v_role text;
  v_omni boolean;
begin
  select * into r from public.game_rooms where id = p_room_id;
  select rp.is_alive, rp.left_at into v_alive, v_left from public.room_players rp
   where rp.room_id = p_room_id and rp.user_id = p_user;
  v_player := found;
  v_omni := not v_player and exists (select 1 from public.profiles where id = p_user and role = 'admin');
  select s.role into v_role from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = p_user;
  return jsonb_build_object(
    'all', r.status in ('lobby', 'playing', 'finished'),
    'shark', r.status = 'finished' or v_omni or (r.status = 'playing' and v_role = 'vampire' and coalesce(v_alive, false)),
    'dead', r.status = 'finished' or v_omni
            or (r.status = 'playing' and v_player and not coalesce(v_alive, false) and v_left is null));
end $$;

create or replace function public._vv_chat_list(p_room_id uuid, p_user uuid, p_channel text, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                               'mine', d.user_id = p_user, 'from', d.user_id, 'channel', d.channel,
                                               'round', d.round, 'phase', d.phase) order by d.created_at), '[]'::jsonb)
    from (select * from public.vv_dead_chat
           where room_id = p_room_id and (p_channel is null or channel = p_channel)
           order by created_at desc limit p_limit) d;
$$;

-- Vampir–Köylü mesaj geçmişi (yazışma penceresi; görünürlük vv_view ile aynı, en çok 400 mesaj)
create or replace function public.vv_history(p_room_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  k jsonb;
begin
  v := public._require_user();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type <> 'vampire_villager' then raise exception 'room_not_found'; end if;
  if not (exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id)
          or r.host_id = v.id or v.role = 'admin') then
    raise exception 'forbidden';
  end if;
  if r.status not in ('lobby', 'playing', 'finished') then return '[]'::jsonb; end if;
  k := public._vv_chat_rights(p_room_id, v.id);
  -- Herkese açık yazışma: bu el + önceki 2 el; vampir ve ölüler kanalı yalnızca bu elden
  return (
    select coalesce(jsonb_agg(e order by e->>'at'), '[]'::jsonb)
      from (select e from jsonb_array_elements(public._room_all_chat(p_room_id, v.id, 400)) e
             where (k->>'all')::boolean
            union all
            select e from jsonb_array_elements(public._vv_chat_list(p_room_id, v.id, null, 400)) e
             where (e->>'channel' = 'shark' and (k->>'shark')::boolean)
                or (e->>'channel' = 'dead' and (k->>'dead')::boolean)) x(e));
end $$;

-- vv_view'e eklenenler: Köpekbalığı ekranındaki oyuncu bilgileri, yazışmalar, oyun akışı, roller ve sunucu saati
create or replace function public._vv_view_extra(p_room_id uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.game_rooms;
  me public.room_player_secrets;
  v_player boolean;
  v_alive boolean;
  v_omni boolean;
  v_all boolean;
  v_vamp boolean;
  v_round int;
  k jsonb;
  v_players jsonb;
begin
  select * into r from public.game_rooms where id = p_room_id;
  select rp.is_alive into v_alive from public.room_players rp where rp.room_id = p_room_id and rp.user_id = p_user;
  v_player := found;
  v_alive := coalesce(v_alive, false);
  v_omni := not v_player and exists (select 1 from public.profiles where id = p_user and role = 'admin');
  v_all := v_omni or r.status = 'finished';
  select s.* into me from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = p_user;
  v_vamp := me.role = 'vampire';
  v_round := coalesce((r.state->>'round')::int, 0);
  k := public._vv_chat_rights(p_room_id, p_user);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', rp.user_id,
           'seat', coalesce(rp.seat, 0),
           'name', rp.display_name,
           'avatar', pr.avatar_index,
           'is_alive', rp.is_alive,
           'left', rp.left_at is not null,
           'is_host', rp.user_id = r.host_id,
           'is_me', rp.user_id = p_user,
           'role', case when v_all or rp.user_id = p_user or (v_vamp and s.role = 'vampire') then s.role
                        else r.state->'reveals'->>(rp.user_id::text) end,
           'ally', v_vamp and s.role = 'vampire' and rp.user_id <> p_user,
           'revealed', coalesce(r.state->'reveals', '{}'::jsonb) ? rp.user_id::text,
           'alive_sec', case when r.started_at is not null and r.status in ('playing', 'finished')
                              and (not rp.is_alive or r.status = 'finished')
                             then greatest(0, extract(epoch from coalesce(rp.out_at, rp.left_at, r.finished_at, now())
                                                                 - r.started_at)::int) end,
           'points', case when r.status = 'finished' then
                       (select coalesce(sum(pe.amount), 0) from public.point_events pe
                         where pe.room_id = r.id and pe.user_id = rp.user_id
                           and pe.source in ('game_play', 'game_remote')) end,
           -- Vampirler (ve anlatıcı) birbirinin gece seçimini görür
           'hunt_pick', case when ((v_vamp and v_alive) or v_omni) and s.role = 'vampire'
                              and (s.data->'night'->>'round')::int = v_round then s.data->'night'->>'target' end,
           'night_done', case when v_omni then coalesce((s.data->'night'->>'round')::int, 0) = v_round end,
           'voted', case when v_omni then coalesce((s.data->'vote'->>'round')::int, 0) = v_round end,
           'ready', case when v_omni then coalesce((s.data->>'ready')::boolean, false) end
         ) order by rp.seat nulls last, rp.joined_at), '[]'::jsonb)
    into v_players
    from public.room_players rp
    left join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
    left join public.profiles pr on pr.id = rp.user_id
   where rp.room_id = p_room_id;

  return jsonb_build_object(
    'players', v_players,
    'event', r.event_id is not null,
    'match_left', case when r.status = 'lobby' and r.state ? 'match_until'
                       then greatest(0, ceil(extract(epoch from (r.state->>'match_until')::timestamptz - now()))::int) end,
    'server_now', now(),
    'log', coalesce(r.state->'log', '[]'::jsonb),
    'roles', case when r.status in ('playing', 'finished') then (
               select coalesce(jsonb_object_agg(x.role, x.n), '{}'::jsonb)
                 from (select s.role, count(*)::int as n from public.room_player_secrets s
                        where s.room_id = p_room_id and s.role is not null group by s.role) x) end,
    'chat', case when (k->>'all')::boolean then public._room_all_chat(p_room_id, p_user, 80) end,
    'shark_chat', case when (k->>'shark')::boolean then public._vv_chat_list(p_room_id, p_user, 'shark', 60) end,
    'dead_chat', case when (k->>'dead')::boolean then public._vv_chat_list(p_room_id, p_user, 'dead', 60) end);
end $$;

-- Oyun akışı günlüğü (Köpekbalığı'ndaki gibi; herkese açık olaylar): aşama, gece ölen, köyden çıkarılan, ayrılan, bitiş
create or replace function public._vv_state_log()
returns trigger language plpgsql set search_path = public as $$
declare
  o jsonb := coalesce(old.state, '{}'::jsonb);
  n jsonb := coalesce(new.state, '{}'::jsonb);
  v_add jsonb := '[]'::jsonb;
  v_log jsonb := coalesce(n->'log', '[]'::jsonb);
  v_ph text := n->>'phase';
  v_rd int := coalesce((n->>'round')::int, 0);
  v_skip text[];
  k text;
begin
  if v_ph is distinct from o->>'phase' and v_ph in ('reveal', 'night', 'dawn', 'vote') then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'phase', 'phase', case when v_ph = 'dawn' then 'day' else v_ph end));
  end if;
  if n->'last_night' is not null and n->'last_night' is distinct from o->'last_night' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'night', 'night', (n->'last_night'->>'round')::int,
      'ids', coalesce((select jsonb_agg(e->'id') from jsonb_array_elements(n->'last_night'->'killed') e), '[]'::jsonb)));
  end if;
  if n->'last_vote' is not null and n->'last_vote' is distinct from o->'last_vote' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'vote', 'id', n->'last_vote'->'executed'->'id',
      'role', n->'last_vote'->'executed'->'role', 'tie', coalesce((n->'last_vote'->>'tie')::boolean, false)));
  end if;
  -- Açıklanan rol: gece ölen ve köyden çıkarılan zaten yazıldı; geri kalanı oyundan ayrılanlardır
  v_skip := array[n->'last_vote'->'executed'->>'id']
            || coalesce((select array_agg(e->>'id') from jsonb_array_elements(n->'last_night'->'killed') e), '{}');
  for k in select jsonb_object_keys(coalesce(n->'reveals', '{}'::jsonb)) loop
    if not coalesce(o->'reveals', '{}'::jsonb) ? k and not coalesce(k = any (v_skip), false)
       and exists (select 1 from public.room_players rp
                    where rp.room_id = new.id and rp.user_id::text = k and rp.left_at is not null) then
      v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'left', 'id', k, 'role', n->'reveals'->k));
    end if;
  end loop;
  if n->>'winner' is not null and n->>'winner' is distinct from o->>'winner' then
    v_add := v_add || jsonb_build_array(jsonb_build_object('k', 'end', 'winner', n->>'winner'));
  end if;
  if jsonb_array_length(v_add) = 0 then return new; end if;
  v_log := v_log || (select jsonb_agg(e || jsonb_build_object('at', clock_timestamp(), 'round', v_rd,
                                                              'ph', case when v_ph = 'night' then 'night' else 'day' end)
                                      order by i)
                       from jsonb_array_elements(v_add) with ordinality as t(e, i));
  if jsonb_array_length(v_log) > 250 then
    v_log := (select jsonb_agg(e order by i) from jsonb_array_elements(v_log) with ordinality as t(e, i)
               where i > jsonb_array_length(v_log) - 250);
  end if;
  new.state := jsonb_set(n, '{log}', v_log);
  return new;
end $$;
drop trigger if exists on_vv_state_log on public.game_rooms;
create trigger on_vv_state_log
  before update of state on public.game_rooms
  for each row
  when (new.game_type = 'vampire_villager')
  execute function public._vv_state_log();

-- 16 kutucuklu oda düzeni: Vampir–Köylü de en çok 16 kişi (Köpekbalığı Kafesi gibi)
update public.game_types set max_players = 16 where key = 'vampire_villager' and max_players > 16;

-- Oyun içinden arkadaşlık isteği: yalnızca aynı odadaki (şu an ya da bu odada oynamış) gerçek bir oyuncuya.
-- Deneme oyuncularına (bot) istek gönderilmez. Kurallar (engel, sınır, tekrar) _send_friend_request'teki gibidir.
create or replace function public.room_friend_request(p_room_id uuid, p_player_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  t public.profiles;
begin
  perform public._require_city();
  v := public._require_user();
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id) then
    raise exception 'not_in_room';
  end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = p_player_id) then
    raise exception 'request_not_found';
  end if;
  select * into t from public.profiles where id = p_player_id;
  if not found or t.is_bot then raise exception 'request_not_found'; end if;
  return public._send_friend_request(t.id, t.alias, t.avatar_index);
end $$;

insert into public.app_settings (key, value, description) values
  ('sk_reveal_seconds', '30', 'Köpekbalığı Kafesi: rol çarkı en çok kaç saniye (herkes hazırsa daha önce biter)'),
  ('sk_night_seconds', '50', 'Köpekbalığı Kafesi: dalış (gece) süresi, saniye'),
  ('sk_day_seconds', '120', 'Köpekbalığı Kafesi: plaj (gündüz tartışması) süresi, saniye'),
  ('sk_vote_seconds', '60', 'Köpekbalığı Kafesi: kafes oylaması süresi, saniye'),
  ('sk_result_seconds', '12', 'Köpekbalığı Kafesi: oylama sonucunun ekranda kalma süresi, saniye'),
  ('sk_force_end_seconds', '45', 'Köpekbalığı Kafesi: oynayan yönetici geceyi ya da oylamayı bu kadar saniye dolmadan bitiremez')
on conflict (key) do nothing;
insert into public.app_settings (key, value, description) values
  ('sk_voice_round_ms', '10000', 'Köpekbalığı Kafesi ve Vampir–Köylü: bir oyuncunun her tartışmada (plaj+oylama ya da dalış) toplam bas-konuş süresi, milisaniye')
on conflict (key) do nothing;


-- ---- Köpekbalığı Kafesi: bas-konuş ses mesajları (yalnızca uzaktan oda) ---------------------------------------
-- Basılı tutunca en çok 5 sn kaydedilen kısa ses mesajı. Ses, sunucuda GEÇİCİ olarak durur ve odadakilere sırayla çalınır:
-- en geç 10 dakika sonra kalıcı olarak silinir. Şikâyet edilen mesaj moderatör bakana kadar en çok 14 gün saklanır.
-- Yedeklere alınmaz. Plaj ve oylamada yaşayan herkes konuşur (herkes duyar); dalışta yalnızca köpekbalıkları kendi
-- frekansında konuşur (yalnız onlar duyar). Elenenler ve izleyenler konuşamaz.
create table if not exists public.sk_voice_clips (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('all', 'shark')),
  audio text not null check (char_length(audio) between 100 and 90000),
  duration_ms int not null check (duration_ms between 300 and 6000),
  created_at timestamptz not null default now(),
  reported_at timestamptz
);
-- Bazı telefonlar 5 sn'lik kaydı daha yüksek kalitede yazar: üst sınır 240 bin karakter (yaklaşık 180 KB)
alter table public.sk_voice_clips drop constraint if exists sk_voice_clips_audio_check;
alter table public.sk_voice_clips add constraint sk_voice_clips_audio_check check (char_length(audio) between 100 and 240000);
-- Tek ses mesajı en çok 10 sn (tartışmadaki toplam hak da 10 sn)
alter table public.sk_voice_clips drop constraint if exists sk_voice_clips_duration_ms_check;
alter table public.sk_voice_clips add constraint sk_voice_clips_duration_ms_check check (duration_ms between 300 and 11000);
create index if not exists sk_voice_clips_room_idx on public.sk_voice_clips (room_id, created_at);
create index if not exists sk_voice_clips_created_idx on public.sk_voice_clips (created_at);
alter table public.sk_voice_clips enable row level security;

create or replace function public._sk_voice_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.sk_voice_clips
   where (reported_at is null and created_at < now() - interval '10 minutes')
      or (reported_at is not null and reported_at < now() - interval '14 days');
$$;

-- Bu kişi bu ses mesajını dinleyebilir mi?
create or replace function public._sk_clip_visible(c public.sk_voice_clips, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_rooms r where r.id = c.room_id
                  and (r.host_id = p_user
                       or exists (select 1 from public.room_players rp
                                   where rp.room_id = r.id and rp.user_id = p_user and rp.left_at is null)
                       or exists (select 1 from public.profiles pr where pr.id = p_user and pr.role = 'admin')))
     and (c.channel = 'all'
          or exists (select 1 from public.game_rooms r where r.id = c.room_id and public._sk_is_omni(r, p_user))
          or exists (select 1 from public.room_players rp
                       join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
                      join public.game_rooms gr on gr.id = rp.room_id
                      where rp.room_id = c.room_id and rp.user_id = p_user and rp.is_alive and rp.left_at is null
                        and (case when gr.game_type = 'vampire_villager' then s.role = 'vampire'
                                  else public._sk_team(s.role) = 'shark' end)));
$$;

-- Ses mesajı gönder (base64, en çok ~65 KB, 0,3–6 sn). Döner: mesajın kimliği.
create or replace function public.sk_voice_post(p_room_id uuid, p_audio text, p_duration_ms int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
  v_alive boolean;
  v_role text;
  v_channel text;
  v_id uuid;
  v_round int;
  v_data jsonb;
  v_used int;
  -- Bazı telefonlar base64 yazının içine satır sonu koyar: boşluklar atılır
  v_audio text := regexp_replace(coalesce(p_audio, ''), '\s', '', 'g');
begin
  v := public._require_user();
  if v.muted_until is not null and v.muted_until > now() then raise exception 'muted'; end if;
  if char_length(v_audio) < 100 or v_audio !~ '^[A-Za-z0-9+/=]+$' then raise exception 'invalid_audio'; end if;
  if p_duration_ms is null or p_duration_ms not between 300 and 11000 then raise exception 'invalid_audio'; end if;
  -- Mikrofon yasağı (haklı bulunan ses şikâyeti ya da tekrarlanan haksız şikâyet)
  if v.mic_banned_until is not null and v.mic_banned_until > now() then raise exception 'mic_banned'; end if;
  -- Boyut: en çok 240 bin karakter ve bildirilen süreyle orantılı (yüksek kaliteli kayda da yer var). Bildirilenden uzun
  -- ses gönderilse bile dinleyenin telefonu çalmayı bildirilen sürenin sonunda keser.
  if char_length(v_audio) > least(240000, 12000 + p_duration_ms * 40) then raise exception 'audio_too_big'; end if;
  perform public._sk_voice_cleanup();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type not in ('shark_cage', 'vampire_villager') or not r.remote or r.status <> 'playing' then
    raise exception 'voice_closed';
  end if;
  select rp.is_alive, s.role into v_alive, v_role
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if not coalesce(v_alive, false) then raise exception 'voice_closed'; end if;
  -- Kanal: tartışmada herkes ('all'); gecede yalnızca kötü takım kendi frekansında ('shark': köpekbalıkları / vampirler)
  v_channel := case when r.game_type = 'vampire_villager' then
                      case when r.state->>'phase' in ('dawn', 'vote', 'vote_result') then 'all'
                           when r.state->>'phase' = 'night' and v_role = 'vampire' then 'shark' end
                    when r.state->>'phase' in ('day', 'vote', 'vote_result') then 'all'
                    when r.state->>'phase' = 'night' and public._sk_team(v_role) = 'shark' then 'shark' end;
  if v_channel is null then raise exception 'voice_closed'; end if;
  -- Her tartışmada (tur + kanal) kişi başı en çok 10 sn konuşma (ayar: sk_voice_round_ms). Sayaç gizli kayıtta tutulur.
  v_round := coalesce((r.state->>'round')::int, 0);
  select s.data into v_data from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id for update;
  v_used := case when (v_data->'voice'->>'round')::int = v_round and v_data->'voice'->>'channel' = v_channel
                 then coalesce((v_data->'voice'->>'ms')::int, 0) else 0 end;
  if v_used + p_duration_ms > public.setting_int('sk_voice_round_ms', 10000) + 500 then raise exception 'voice_quota'; end if;
  if exists (select 1 from public.sk_voice_clips where room_id = p_room_id and user_id = v.id
              and created_at > now() - interval '3 seconds') then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.sk_voice_clips where room_id = p_room_id and user_id = v.id) >= 60 then
    raise exception 'chat_limit';
  end if;
  insert into public.sk_voice_clips (room_id, user_id, channel, audio, duration_ms)
  values (p_room_id, v.id, v_channel, v_audio, p_duration_ms)
  returning id into v_id;
  update public.room_player_secrets
     set data = data || jsonb_build_object('voice', jsonb_build_object('round', v_round, 'channel', v_channel,
                                                                       'ms', v_used + p_duration_ms))
   where room_id = p_room_id and user_id = v.id;
  perform public._room_touch(p_room_id, v.id);
  return v_id;
end $$;

-- Ses mesajının kendisi (dinleyebilen kişiye)
create or replace function public.sk_voice_get(p_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v public.profiles;
  c public.sk_voice_clips;
begin
  v := public._require_user();
  select * into c from public.sk_voice_clips where id = p_id;
  if not found or not public._sk_clip_visible(c, v.id) then raise exception 'clip_not_found'; end if;
  return c.audio;
end $$;

-- Moderatör: şikâyet edilen ses mesajını dinler (web panel)
create or replace function public.admin_get_voice_clip(p_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._require_admin();
  return (select audio from public.sk_voice_clips where id = p_id);
end $$;

-- sk_view'e eklenen liste: son 2 dakikanın dinleyebildiğin ses mesajları (içerik değil, yalnızca künye)
create or replace function public._sk_clips_for(p_room_id uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'from', c.user_id, 'channel', c.channel,
                                               'at', c.created_at, 'ms', c.duration_ms) order by c.created_at), '[]'::jsonb)
    from public.sk_voice_clips c
   where c.room_id = p_room_id and c.created_at > now() - interval '2 minutes'
     and public._sk_clip_visible(c, p_user);
$$;


-- Uzaktan oyunda bugün ve bu ay kalan puanlı oyun hakkı (oyun giriş ekranındaki sayaç). Yan yana oyunda sınır yoktur.
create or replace function public.my_remote_caps()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v public.profiles;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
begin
  v := public._require_user();
  return jsonb_build_object(
    'today', (select count(*) from public.point_events pe
               where pe.user_id = v.id and pe.source = 'game_remote' and pe.created_at >= v_today),
    'month', (select count(*) from public.point_events pe
               where pe.user_id = v.id and pe.source = 'game_remote' and pe.created_at >= public._month_start()),
    'daily_cap', public.setting_int('pts_remote_daily_cap', 2),
    'month_cap', public.setting_int('pts_remote_month_cap', 6),
    'pct', least(80, greatest(10, public.setting_int('pts_remote_pct', 20))),
    'top_cap', public.setting_int('pts_game_top_cap', 12),
    'min_players', public.setting_int('pts_game_min_players', 4));
end $$;


-- Aylık puan hedefleri (her oyunun giriş ekranındaki hedef çubuğu ve Oyunlar'daki "Kalan hedef"): bu ay her oyundan
-- uzaktan ve yan yana kazanılan puan ve sınırları. Etkinliklerin sınırı yoktur; bu ay etkinliklerden kazanılan da döner.
create or replace function public.my_game_goals()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v public.profiles;
  v_start timestamptz := public._month_start();
begin
  v := public._require_user();
  return jsonb_build_object(
    'remote_cap', public.setting_int('pts_remote_month_points', 250),
    'side_cap', public.setting_int('pts_side_month_points', 1750),
    'venue_pct', greatest(100, public.setting_int('pts_venue_bonus_pct', 125)),
    'party_min_players', public.setting_int('pts_party_min_players', 5),
    'quiz', jsonb_build_object(
      'earned', (select coalesce(sum(amount), 0) from public.point_events
                  where user_id = v.id and source = 'quiz_play' and created_at >= v_start),
      'cap', round(public.setting_int('pts_quiz_month_points', 250) * public._quiz_level_mult(v.id), 2)),
    'games', (select coalesce(jsonb_object_agg(g.key, jsonb_build_object(
                'remote', (select coalesce(sum(pe.amount), 0) from public.point_events pe
                             join public.game_rooms gr on gr.id = pe.room_id
                            where pe.user_id = v.id and pe.source = 'game_remote' and gr.game_type = g.key
                              and pe.created_at >= v_start),
                'side', (select coalesce(sum(pe.amount), 0) from public.point_events pe
                           join public.game_rooms gr on gr.id = pe.room_id
                          where pe.user_id = v.id and pe.source = 'game_play' and gr.game_type = g.key
                            and pe.created_at >= v_start))), '{}'::jsonb)
                from (values ('shark_cage'), ('vampire_villager')) g(key)),
    'events', (select coalesce(sum(amount), 0) from public.point_events
                where user_id = v.id and source like 'event%' and created_at >= v_start));
end $$;

-- ---- "Tartışmayı hızlı geç" (Vampir–Köylü sabahı, Köpekbalığı Kafesi plajı) ---------------------------------------
-- Yaşayan her oyuncu işaretleyebilir / işaretini kaldırabilir. Yaşayanların yarısından fazlası işaretlerse tartışma
-- hemen biter ve oylama başlar (bütün oyun şekillerinde). İşaret o tura aittir (gizli kayıtta skip_round).
create or replace function public._skip_tally(p_room_id uuid, p_round int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('yes', t.yes, 'alive', t.alive, 'needed', t.alive / 2 + 1)
    from (select (count(*) filter (where coalesce((s.data->>'skip_round')::int, 0) = p_round))::int as yes,
                 count(*)::int as alive
            from public.room_players rp
            join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
           where rp.room_id = p_room_id and rp.is_alive and rp.left_at is null) t;
$$;

create or replace function public._skip_set(p_room_id uuid, p_user uuid, p_round int, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.room_players
                  where room_id = p_room_id and user_id = p_user and is_alive and left_at is null) then
    raise exception 'you_are_dead';
  end if;
  update public.room_player_secrets
     set data = case when coalesce(p_on, false) then data || jsonb_build_object('skip_round', p_round)
                     else data - 'skip_round' end
   where room_id = p_room_id and user_id = p_user;
end $$;

create or replace function public._vv_skip_check(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  t jsonb;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if r.status <> 'playing' or r.state->>'phase' <> 'dawn' then return; end if;
  t := public._skip_tally(p_room_id, (r.state->>'round')::int);
  if (t->>'alive')::int > 0 and (t->>'yes')::int >= (t->>'needed')::int then perform public._vv_go_vote(p_room_id); end if;
end $$;

create or replace function public._sk_skip_check(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  t jsonb;
begin
  select * into r from public.game_rooms where id = p_room_id;
  if r.status <> 'playing' or r.state->>'phase' <> 'day' then return; end if;
  t := public._skip_tally(p_room_id, (r.state->>'round')::int);
  if (t->>'alive')::int > 0 and (t->>'yes')::int >= (t->>'needed')::int then perform public._sk_go_vote(p_room_id); end if;
end $$;

create or replace function public.vv_skip_discussion(p_room_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._vv_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'dawn' then raise exception 'wrong_phase'; end if;
  perform public._skip_set(p_room_id, v.id, (r.state->>'round')::int, p_on);
  perform public._vv_skip_check(p_room_id);
end $$;

create or replace function public.sk_skip_discussion(p_room_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'playing' or r.state->>'phase' <> 'day' then raise exception 'wrong_phase'; end if;
  perform public._skip_set(p_room_id, v.id, (r.state->>'round')::int, p_on);
  perform public._sk_skip_check(p_room_id);
end $$;


-- ---- Köpekbalığı Kafesi: uzaktan eşleştirme ------------------------------------------------------------------------
-- "Eşleş" diyenler sıraya girer (bütün illerden). Dolmayı bekleyen, başlamamış bir uzaktan oda varsa oraya yerleşilir.
-- Yoksa aranmaya devam edilir: sırada 3 kişi olunca ya da arayan kişi match_solo_room_seconds (45) saniyedir
-- bulamadıysa yeni oda açılır ve sıradaki herkes oraya yerleşir; kişi odada tek başına da bekleyebilir.
-- Uzaktan eşleşmede ODA SAHİBİ YOKTUR: host_id yalnızca tekniktir (odadaki bir oyuncu); ayrılınca sıradakine geçer,
-- odada kimse kalmazsa oda kapanır. Lobide 6 kişi olunca "Hazırım" düğmesi açılır; hazır diyenler demeyenlerden fazla
-- olunca oyun kendiliğinden başlar (Otomatik Oyun). Herkes rumuzuyla görünür.
create table if not exists public.sk_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.sk_queue enable row level security;
-- Paket: eşleştirme iki oyunda (Köpekbalığı Kafesi, Vampir–Köylü); kişi aynı anda tek oyun için arar
alter table public.sk_queue add column if not exists game_type text not null default 'shark_cage';

-- Sıradakiyle eşleştirmeyi dener. Döner: kişinin girdiği eşleştirme odası (yoksa boş).
create or replace function public._sk_match_try(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
  v_code text;
  v_try int := 0;
  v_host uuid;
  v_n int;
  v_game text;
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtext('sk_match'));
  -- 20 sn'dir haber vermeyen (ekrandan çıkmış) sıradan düşer; deneme oyuncuları düşmez
  delete from public.sk_queue q
   where q.last_seen < now() - interval '20 seconds'
     and not exists (select 1 from public.profiles p where p.id = q.user_id and p.is_bot);
  -- Zaten bir eşleştirme odasındaysa oraya
  select rp.room_id into v_room
    from public.room_players rp join public.game_rooms r on r.id = rp.room_id
   where rp.user_id = p_user and rp.left_at is null and r.status in ('lobby', 'playing')
     and coalesce((r.config->>'match')::boolean, false)
   order by r.created_at desc limit 1;
  if v_room is not null then
    delete from public.sk_queue where user_id = p_user;
    return v_room;
  end if;
  select q.game_type into v_game from public.sk_queue q where q.user_id = p_user;
  if v_game is null then return null; end if;
  select coalesce(gt.max_players, 16) into v_max from public.game_types gt where gt.key = v_game;

  -- 1) Yer olan açık eşleştirme lobisi (biten oyundan sonra açılan uzaktan bekleme odaları da)
  select r.id into v_room
    from public.game_rooms r
   where r.game_type = v_game and r.status = 'lobby' and coalesce((r.config->>'match')::boolean, false)
     and (select count(*) from public.room_players rp where rp.room_id = r.id) < v_max
     and not exists (select 1 from public.room_bans b where b.room_id = r.id and b.user_id = p_user)
   -- Önce oyun sonu bekleyen odalar (oyuncular hazır bekliyor), sonra en eski lobi
   order by (r.config ? 'rematch_of') desc, r.created_at
   limit 1;
  if v_room is not null then
    insert into public.room_players (room_id, user_id, display_name)
    select v_room, p.id, p.alias from public.profiles p where p.id = p_user
    on conflict (room_id, user_id) do nothing;
    if exists (select 1 from public.profiles where id = p_user and is_bot) then
      update public.game_rooms set config = config || '{"test": true}'::jsonb where id = v_room;
    end if;
    delete from public.sk_queue where user_id = p_user;
    return v_room;
  end if;

  -- 2) Açık oda yok: sırada en az 3 kişi varsa ya da bu kişi 45 sn'dir arıyorsa yeni oda (sıradaki herkes yerleşir)
  select count(*)::int into v_n from public.sk_queue where game_type = v_game;
  if v_n < 3 and not exists (
       select 1 from public.sk_queue
        where user_id = p_user
          and joined_at <= now() - make_interval(secs => greatest(5, public.setting_int('match_solo_room_seconds', 45)))) then
    return null;
  end if;
  select user_id into v_host from public.sk_queue where game_type = v_game order by joined_at limit 1;
  insert into public.game_rooms (game_type, host_id, config, remote, state)
  values (v_game, v_host, jsonb_build_object('mode', 'auto', 'match', true), true, '{"ready": []}'::jsonb)
  returning id into v_room;
  loop
    v_code := public._random_code(5);
    begin
      insert into public.room_codes (room_id, code) values (v_room, v_code);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'code_generation_failed'; end if;
    end;
  end loop;
  insert into public.room_players (room_id, user_id, display_name)
  select v_room, q.user_id, p.alias
    from (select user_id from public.sk_queue where game_type = v_game order by joined_at limit v_max) q
    join public.profiles p on p.id = q.user_id;
  if exists (select 1 from public.room_players rp join public.profiles p on p.id = rp.user_id and p.is_bot
              where rp.room_id = v_room) then
    update public.game_rooms set config = config || '{"test": true}'::jsonb where id = v_room;
  end if;
  delete from public.sk_queue where user_id in (select user_id from public.room_players where room_id = v_room);
  return case when exists (select 1 from public.room_players where room_id = v_room and user_id = p_user) then v_room end;
end $$;

-- Açık oda bulunamazsa odanın açılmasına kalan saniye (arama ekranında geri sayım)
create or replace function public._match_solo_left(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, ceil(extract(epoch from q.joined_at
                                  + make_interval(secs => greatest(5, public.setting_int('match_solo_room_seconds', 45)))
                                  - now())))::int
    from public.sk_queue q where q.user_id = p_user;
$$;

-- Eşleşmek için sıraya gir (oyun: shark_cage | vampire_villager).
-- Döner: { room (eşleştiyse), waiting (sıradaki kişi), solo_left (oda açılmasına kalan sn) }
create or replace function public.match_join(p_game text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room uuid;
  v_live uuid;
begin
  perform public._require_feature('uzaktan');
  perform public._require_city();
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if p_game not in ('shark_cage', 'vampire_villager')
     or not exists (select 1 from public.game_types where key = p_game and enabled) then
    raise exception 'game_not_available';
  end if;
  v_live := public._user_live_room(v.id);
  if v.role <> 'admin' and v_live is not null
     and not exists (select 1 from public.game_rooms r where r.id = v_live and coalesce((r.config->>'match')::boolean, false)) then
    raise exception 'already_in_game';
  end if;
  -- Başka oyuna geçen kişinin arama süresi baştan başlar (45 sn kuralı)
  insert into public.sk_queue (user_id, game_type) values (v.id, p_game)
  on conflict (user_id) do update
    set last_seen = now(), game_type = excluded.game_type,
        joined_at = case when public.sk_queue.game_type = excluded.game_type then public.sk_queue.joined_at else now() end;
  v_room := public._sk_match_try(v.id);
  return jsonb_build_object('room', v_room,
                            'waiting', (select count(*) from public.sk_queue where game_type = p_game),
                            'solo_left', public._match_solo_left(v.id));
end $$;

create or replace function public.sk_match_join()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_feature('uzaktan');
  perform public._require_city();
  return public.match_join('shark_cage');
end $$;

-- Arama ekranı birkaç saniyede bir sorar (aynı zamanda "hâlâ arıyorum" işareti)
create or replace function public.sk_match_poll()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room uuid;
begin
  v := public._require_user();
  update public.sk_queue set last_seen = now() where user_id = v.id;
  v_room := public._sk_match_try(v.id);
  return jsonb_build_object('room', v_room,
                            'waiting', (select count(*) from public.sk_queue q
                                         where q.game_type = coalesce((select game_type from public.sk_queue where user_id = v.id),
                                                                      'shark_cage')),
                            'searching', exists (select 1 from public.sk_queue where user_id = v.id),
                            'solo_left', public._match_solo_left(v.id));
end $$;

create or replace function public.sk_match_cancel()
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
begin
  v := public._require_user();
  delete from public.sk_queue where user_id = v.id;
end $$;

-- Lobide 6 kişi varsa ve hazır diyenler demeyenlerden fazlaysa oyun başlar
create or replace function public._sk_match_autostart(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._room_lobby_tick(p_room_id);
end $$;

-- "Hazırım" (eşleştirme lobisi ve yeni el bekleme odası; ortak işlev room_lobby_ready)
create or replace function public.sk_lobby_ready(p_room_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.room_lobby_ready(p_room_id, p_on);
end $$;

-- GEÇİCİ: moderatör tek telefonla deneyebilsin diye deneme oyuncularını eşleştirme sırasına koyar
drop function if exists public.admin_queue_test_bots(int);
create or replace function public.admin_queue_test_bots(p_count int default 3, p_game text default 'shark_cage')
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public._require_user();
  perform public._require_admin();
  if p_game not in ('shark_cage', 'vampire_villager') then raise exception 'game_not_available'; end if;
  insert into public.sk_queue (user_id, game_type)
  select p.id, p_game from public.profiles p
   where p.is_bot
     and not exists (select 1 from public.sk_queue q where q.user_id = p.id)
     and not exists (select 1 from public.room_players rp join public.game_rooms r on r.id = rp.room_id
                      where rp.user_id = p.id and rp.left_at is null and r.status in ('lobby', 'playing'))
   order by p.id
   limit least(15, greatest(1, coalesce(p_count, 3)));
  get diagnostics n = row_count;
  perform public._audit('test_bots', null, jsonb_build_object('queue', n));
  return n;
end $$;

-- ---- GEÇİCİ: Yazı düzenleme modu ---------------------------------------------------------------------------------
-- Moderatör uygulamadaki sabit yazıları (düğme, başlık, açıklama) düzeltir; düzeltmeler herkeste görünür. Düzeltmeler
-- koda işlenince bu bölüm ve tablo kaldırılacak. Yalnızca moderatör yazar; her değişiklik işlem günlüğüne düşer.
create table if not exists public.ui_text_overrides (
  source text primary key check (char_length(source) between 1 and 2000),
  text text not null check (char_length(text) between 1 and 2000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.ui_text_overrides enable row level security;
drop policy if exists ui_text_overrides_select on public.ui_text_overrides;
create policy ui_text_overrides_select on public.ui_text_overrides for select to authenticated using (public.is_admin());

-- Bütün düzeltmeler (giriş ekranı dahil her yerde gerekir; içinde kişisel bilgi yoktur)
create or replace function public.get_ui_texts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(source, text), '{}'::jsonb) from public.ui_text_overrides;
$$;

-- Moderatör: yazıyı düzelt. p_text boşsa ya da orijinalle aynıysa düzeltme silinir.
create or replace function public.admin_set_ui_text(p_source text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  perform public._require_user();
  perform public._require_admin();
  if p_source is null or char_length(p_source) not between 1 and 2000
     or (v_text is not null and char_length(p_text) > 2000) then
    raise exception 'invalid_text';
  end if;
  if v_text is null or p_text = p_source then
    delete from public.ui_text_overrides where source = p_source;
  else
    if not exists (select 1 from public.ui_text_overrides where source = p_source)
       and (select count(*) from public.ui_text_overrides) >= 5000 then
      raise exception 'too_many';
    end if;
    insert into public.ui_text_overrides (source, text, updated_by) values (p_source, p_text, auth.uid())
    on conflict (source) do update set text = excluded.text, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public._audit('ui_text', null,
    jsonb_build_object('source', left(p_source, 300), 'text', left(coalesce(v_text, '(orijinale döndü)'), 300)));
end $$;

-- ---- Yedekleme --------------------------------------------------------------------------------------------------
-- Yedek: public şemasındaki bütün tablolar tek bir JSON'da. Giriş hesapları (e-posta, şifre) yedeğe GİRMEZ ve geri
-- yüklemede hiçbir giriş hesabına dokunulmaz. Bu fonksiyonları yalnızca sunucu (Edge Function `admin-backup`,
-- veritabanına doğrudan bağlanarak) çalıştırır; uygulama ya da web sayfası doğrudan çağıramaz.

-- Tablolar, birbirine bağlılık sırasına göre (önce bağlanılan tablo). Döngü varsa kalanlar ada göre eklenir.
create or replace function public._backup_tables()
returns text[] language plpgsql stable set search_path = public as $$
declare
  v_all text[];
  v_done text[] := '{}';
  v_progress boolean := true;
  t text;
begin
  select array_agg(c.relname::text order by c.relname) into v_all
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('admin_web_sessions', 'room_host_locations', 'sk_voice_clips');
  while v_progress loop
    v_progress := false;
    foreach t in array v_all loop
      if t = any (v_done) then continue; end if;
      if not exists (
        select 1 from pg_constraint k
          join pg_class src on src.oid = k.conrelid join pg_namespace sn on sn.oid = src.relnamespace
          join pg_class ref on ref.oid = k.confrelid join pg_namespace rn on rn.oid = ref.relnamespace
         where k.contype = 'f' and sn.nspname = 'public' and src.relname = t
           and rn.nspname = 'public' and ref.relname <> t
           and ref.relname <> all (v_done) and ref.relname = any (v_all)) then
        v_done := v_done || t;
        v_progress := true;
      end if;
    end loop;
  end loop;
  foreach t in array v_all loop
    if t <> all (v_done) then v_done := v_done || t; end if;
  end loop;
  return v_done;
end $$;

create or replace function public.admin_backup_export(p_admin uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text;
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_counts jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_admin and role = 'admin' and banned_at is null) then
    raise exception 'forbidden';
  end if;
  foreach t in array public._backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
    v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
  end loop;
  insert into public.admin_audit_log (admin_id, action, detail)
  values (p_admin, 'backup_export', jsonb_build_object('tables', (select count(*) from jsonb_object_keys(v_tables))));
  return jsonb_build_object('format', 'peoplehere-yedek-v1', 'created_at', now(), 'by', p_admin,
                            'counts', v_counts, 'tables', v_tables);
end $$;

-- Yedeği geri yükler. Tek işlemdir: bir şey ters giderse hiçbir şey değişmez. Kurallar:
--  * İçerik (gönderiler, oyunlar, etkinlikler, puanlar, ayarlar…) yedekteki hâline döner; yedekten sonra eklenenler silinir.
--  * Giriş hesaplarına (auth) hiç dokunulmaz. Yedekten sonra açılan hesaplar kalır; yalnızca o tarihten sonraki
--    içerikleri gider ve bir sonraki girişlerinde yeni rumuz alırlar.
--  * Yedekten sonra SİLİNEN hesaplar geri GELMEZ (KVKK: silinen kişinin verisi geri yüklenmez); onlara bağlı kayıtlar atlanır.
--  * İşlem günlüğü ve trafik kayıtları silinmez (yasal kayıt); yedekteki eksik satırlar eklenir.
--  * Resim dosyaları yedekte yoktur (Storage'da durur); yalnızca dosya yolları geri gelir.
create or replace function public.admin_backup_restore(p_data jsonb, p_admin uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tables text[] := public._backup_tables();
  -- Yasal kayıtlar: silinmez, yalnızca eksik satırlar eklenir
  v_keep text[] := array['admin_audit_log', 'traffic_log'];
  -- Hesap tabloları: yalnızca yedekte bulunan kişilerin satırları değişir (sonradan açılan hesapların satırı kalır)
  v_account jsonb := '{"profiles": "id", "device_accounts": "user_id", "account_recovery": "user_id",
                       "identity_verifications": "user_id"}'::jsonb;
  t text;
  v_rows jsonb;
  v_cols text;
  v_pk text;
  v_set text;
  v_where text;
  v_fk record;
  v_n int;
  v_counts jsonb := '{}'::jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_backup_users uuid[];
  v_kept_users int;
  v_sessions jsonb;
  c record;
begin
  if p_data ->> 'format' is distinct from 'peoplehere-yedek-v1' or jsonb_typeof(p_data -> 'tables') <> 'object' then
    raise exception 'invalid_backup';
  end if;
  if not exists (select 1 from public.profiles where id = p_admin and role = 'admin' and banned_at is null) then
    raise exception 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtext('backup_restore'));

  select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_backup_users
    from jsonb_array_elements(coalesce(p_data -> 'tables' -> 'profiles', '[]'::jsonb)) r;
  if cardinality(v_backup_users) = 0 then raise exception 'backup_has_no_members'; end if;
  select count(*) into v_kept_users from public.profiles p where p.id <> all (v_backup_users);

  -- Panel oturumları geri yüklemeden sonra korunur
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_sessions from public.admin_web_sessions s;

  -- Sonradan açılan hesapların rumuzu yedekteki biriyle çakışmasın: bir sonraki girişte yeni rumuz alırlar
  update public.profiles
     set alias = 'Üye#' || id::text, alias_no = null, alias_week = alias_week - 7
   where id <> all (v_backup_users);

  -- Tetikleyicileri kapat (puan, bildirim, trafik kaydı yeniden çalışmasın)
  foreach t in array v_tables loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  -- 1) Sondan başa: yedekte OLMAYAN satırları sil (yedekten sonra eklenenler). Yedekte hiç bulunmayan tablo
  --    (yedekten sonra eklenmiş yeni özellik) olduğu gibi kalır.
  for i in reverse cardinality(v_tables) .. 1 loop
    t := v_tables[i];
    v_rows := p_data -> 'tables' -> t;
    if t = any (v_keep) or v_rows is null or jsonb_typeof(v_rows) <> 'array' then continue; end if;
    select string_agg(format('%I', a.attname), ', ' order by array_position(ix.indkey::int2[], a.attnum))
      into v_pk
      from pg_index ix join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = any (ix.indkey)
     where ix.indrelid = ('public.' || t)::regclass and ix.indisprimary;
    if v_pk is null then
      execute format('delete from public.%I', t);
    else
      execute format('delete from public.%1$I d where (%2$s) not in (select %2$s from '
                     'jsonb_populate_recordset(null::public.%1$I, $1)) %3$s', t, v_pk,
                     case when v_account ? t then format('and d.%I = any ($2)', v_account ->> t) else '' end)
        using v_rows, v_backup_users;
    end if;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_deleted := v_deleted || jsonb_build_object(t, v_n); end if;
  end loop;

  -- 2) Baştan sona: yedekteki satırları yaz (varsa güncelle). Yalnızca bugün de var olan sütunlar; bağlandığı
  --    kayıt yoksa (ör. sonradan silinen hesap) satır atlanır.
  foreach t in array v_tables loop
    v_rows := p_data -> 'tables' -> t;
    if v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0 then continue; end if;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum),
           string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
             filter (where a.attidentity <> 'a')
      into v_cols, v_set
      from pg_attribute a
     where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = ''
       and (v_rows -> 0) ? a.attname::text;
    if v_cols is null then continue; end if;
    select string_agg(format('%I', a.attname), ', ' order by array_position(ix.indkey::int2[], a.attnum))
      into v_pk
      from pg_index ix join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = any (ix.indkey)
     where ix.indrelid = ('public.' || t)::regclass and ix.indisprimary;
    v_where := 'true';
    for v_fk in
      select (select array_agg(a.attname::text order by x.ord) from unnest(k.conkey) with ordinality x(n, ord)
                join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.n) as cols,
             (select array_agg(a.attname::text order by x.ord) from unnest(k.confkey) with ordinality x(n, ord)
                join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.n) as refcols,
             rn.nspname::text as refschema, ref.relname::text as reftable
        from pg_constraint k
        join pg_class ref on ref.oid = k.confrelid join pg_namespace rn on rn.oid = ref.relnamespace
       where k.contype = 'f' and k.conrelid = ('public.' || t)::regclass and k.confrelid <> k.conrelid
    loop
      v_where := v_where || ' and (' ||
        (select string_agg(format('x.%I is null', col), ' or ') from unnest(v_fk.cols) col) ||
        format(' or exists (select 1 from %I.%I r where ', v_fk.refschema, v_fk.reftable) ||
        (select string_agg(format('r.%I = x.%I', v_fk.refcols[i2], v_fk.cols[i2]), ' and ')
           from generate_subscripts(v_fk.cols, 1) i2) || '))';
    end loop;
    execute format('insert into public.%1$I (%2$s) overriding system value select %2$s '
                   'from jsonb_populate_recordset(null::public.%1$I, $1) x where %3$s %4$s',
                   t, v_cols, v_where,
                   case when t = any (v_keep) or v_pk is null then 'on conflict do nothing'
                        when v_set is null then format('on conflict (%s) do nothing', v_pk)
                        else format('on conflict (%s) do update set %s', v_pk, v_set) end)
      using v_rows;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  end loop;

  -- Yedekten sonra silinen hesapların gönderi ve yorumları da geri gelmez (hesap silinince içerikleri de silinir)
  delete from public.posts p
   where exists (select 1 from jsonb_array_elements(coalesce(p_data -> 'tables' -> 'post_authors', '[]'::jsonb)) a
                  where (a ->> 'post_id')::uuid = p.id
                    and not exists (select 1 from public.profiles pr where pr.id = (a ->> 'author_id')::uuid));
  delete from public.comments cm
   where exists (select 1 from jsonb_array_elements(coalesce(p_data -> 'tables' -> 'comment_authors', '[]'::jsonb)) a
                  where (a ->> 'comment_id')::uuid = cm.id
                    and not exists (select 1 from public.profiles pr where pr.id = (a ->> 'author_id')::uuid));

  -- 3) Otomatik numaraları en büyük değere getir, tetikleyicileri aç
  for c in
    select cl.relname::text as tbl, a.attname::text as col,
           pg_get_serial_sequence(format('public.%I', cl.relname), a.attname) as seq
      from pg_attribute a join pg_class cl on cl.oid = a.attrelid join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relkind = 'r' and a.attnum > 0 and not a.attisdropped
       and pg_get_serial_sequence(format('public.%I', cl.relname), a.attname) is not null
  loop
    execute format('select setval(%L, greatest(coalesce((select max(%I) from public.%I), 0), 1))',
                   c.seq, c.col, c.tbl);
  end loop;
  foreach t in array v_tables loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- 4) Panel oturumlarını geri koy
  insert into public.admin_web_sessions
  select * from jsonb_populate_recordset(null::public.admin_web_sessions, v_sessions) s
   where exists (select 1 from public.profiles p where p.id = s.user_id)
  on conflict do nothing;

  insert into public.admin_audit_log (admin_id, action, detail)
  values (p_admin, 'backup_restore', jsonb_build_object('backup_created_at', p_data ->> 'created_at',
                                                        'kept_new_accounts', v_kept_users, 'deleted', v_deleted,
                                                        'rows', v_counts));
  return jsonb_build_object('ok', true, 'kept_new_accounts', v_kept_users, 'deleted', v_deleted, 'rows', v_counts);
end $$;

-- ---- Oyun bitince yeni el (Vampir–Köylü ve Köpekbalığı Kafesi) -------------------------------------------------
-- Oyun bitince oyuncular dağılmaz: aynı oyuncularla yeni bir bekleme odası (yeni oda, yeni ID) kendiliğinden açılır ve
-- herkes oraya geçer. Bekleme odasında 45 sn geri sayım vardır: süre dolunca "Hazırım" diyenlerle yeni el başlar
-- (hazır demeyenler odadan çıkar). Hazır diyen en az oyun alt sınırı (6) kadar değilse oda normal bekleme odası olur.
-- Yan yana oyunda her el oda sahibinin aylık oyun hakkından 1 düşer: hakkı kalan ilk oyuncu (önce eski oda sahibi)
-- yeni odanın sahibi olur; kimsenin hakkı kalmadıysa yeni el açılmaz. Uzaktan oda eşleştirme lobisi olur
-- (eşleşme arayanlar boş yerlere yerleşir). Etkinlik oyunu hak harcamaz.

-- Kişinin yan yana oyun açma hakkı var mı? Döner: { ok, credit (varsa harcanacak sponsor hakkı) }
-- Yeni el için hak denetimi: oyun hakkı artık yok, herkes açabilir (mekân bonusu odanın ayarıyla yeni ele geçer)
create or replace function public._room_quota_check(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('ok', exists (select 1 from public.profiles where id = p_user));
end $$;

create or replace function public._room_rematch(p_old uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_side boolean;
  v_host uuid;
  v_credit uuid;
  q jsonb;
  c record;
  v_new uuid;
  v_code text;
  v_try int := 0;
  v_narrator boolean;
begin
  select * into r from public.game_rooms where id = p_old;
  if not found or r.status <> 'finished' or r.game_type not in ('vampire_villager', 'shark_cage') then return null; end if;
  if r.state ? 'next_room' then return (r.state->>'next_room')::uuid; end if;
  if not exists (select 1 from public.room_players rp join public.profiles p on p.id = rp.user_id
                  where rp.room_id = p_old and rp.left_at is null and not p.is_bot) then
    return null;
  end if;
  v_side := not r.remote and r.event_id is null;
  v_narrator := coalesce(r.config->>'mode', 'auto') = 'narrator';
  if v_narrator then
    -- Anlatıcılı (etkinlik) oyun: anlatıcı yine anlatıcıdır (oynamaz, hak harcamaz)
    v_host := r.host_id;
  else
    for c in
      select rp.user_id from public.room_players rp join public.profiles p on p.id = rp.user_id
       where rp.room_id = p_old and rp.left_at is null and not p.is_bot
       order by (rp.user_id = r.host_id) desc, rp.joined_at
    loop
      if not v_side then v_host := c.user_id; exit; end if;
      q := public._room_quota_check(c.user_id);
      if coalesce((q->>'ok')::boolean, false) then
        v_host := c.user_id;
        v_credit := (q->>'credit')::uuid;
        exit;
      end if;
    end loop;
  end if;
  if v_host is null then
    update public.game_rooms set state = state || '{"rematch": "no_quota"}'::jsonb where id = p_old;
    return null;
  end if;

  insert into public.game_rooms (game_type, event_id, host_id, config, place_q, place_r, place_note, remote, state)
  values (r.game_type, r.event_id, v_host,
          (r.config - 'no_points') || jsonb_build_object('rematch_of', p_old)
            || case when r.remote then jsonb_build_object('match', true, 'mode', 'auto') else '{}'::jsonb end,
          r.place_q, r.place_r, r.place_note, r.remote,
          jsonb_build_object(
            'ready', coalesce((select jsonb_agg(rp.user_id::text) from public.room_players rp
                                join public.profiles p on p.id = rp.user_id and p.is_bot
                               where rp.room_id = p_old and rp.left_at is null), '[]'::jsonb),
            'rematch_until', now() + make_interval(secs => greatest(10, public.setting_int('rematch_seconds', 45)))))
  returning id into v_new;
  loop
    v_code := public._random_code(5);
    begin
      insert into public.room_codes (room_id, code) values (v_new, v_code);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'code_generation_failed'; end if;
    end;
  end loop;
  -- Herkes eski numarasıyla (yeri değişmeden) bekleme odasına geçer
  insert into public.room_players (room_id, user_id, display_name, joined_at, seat)
  select v_new, x.user_id, x.display_name, now() + make_interval(secs => x.rn / 1000.0), x.seat
    from (select rp.user_id, rp.display_name, rp.seat, row_number() over (order by rp.seat, rp.joined_at) as rn
            from public.room_players rp where rp.room_id = p_old and rp.left_at is null) x;
  if v_credit is not null then
    update public.sponsor_credits set room_id = v_new where id = v_credit;
  end if;
  update public.game_rooms set state = state || jsonb_build_object('next_room', v_new) where id = p_old;
  return v_new;
end $$;

create or replace function public._room_rematch_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._room_rematch(new.id);
  return null;
end $$;
drop trigger if exists on_room_rematch on public.game_rooms;
create trigger on_room_rematch
  after update of status on public.game_rooms
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished'
        and new.game_type in ('vampire_villager', 'shark_cage'))
  execute function public._room_rematch_trg();

-- Bekleme odası saati: yeni el geri sayımı bitince hazır olanlarla başlar; eşleştirme lobisinde hazır diyenler
-- demeyenlerden fazla olunca başlar. (Oyun ekranı her yenilemede çağırır.)
create or replace function public._room_lobby_tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms;
  v_min int;
  v_n int;
  v_ready int;
  v_host uuid;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'lobby' or r.game_type not in ('vampire_villager', 'shark_cage') then return; end if;
  select coalesce(gt.min_players, 6) into v_min from public.game_types gt where gt.key = r.game_type;
  select count(*)::int into v_n from public.room_players where room_id = p_room_id and left_at is null;
  select count(*)::int into v_ready
    from public.room_players rp
   where rp.room_id = p_room_id and rp.left_at is null
     and coalesce(r.state->'ready', '[]'::jsonb) ? rp.user_id::text;

  if r.state ? 'rematch_until' then
    if now() < (r.state->>'rematch_until')::timestamptz then return; end if;
    if v_ready >= v_min then
      -- Hazır demeyenler yeni ele alınmaz; oda sahibi hazır değilse sahiplik hazır olan ilk gerçek oyuncuya geçer
      if not (coalesce(r.state->'ready', '[]'::jsonb) ? r.host_id::text)
         and coalesce(r.config->>'mode', 'auto') <> 'narrator' then
        select rp.user_id into v_host from public.room_players rp join public.profiles p on p.id = rp.user_id
         where rp.room_id = p_room_id and rp.left_at is null and not p.is_bot
           and coalesce(r.state->'ready', '[]'::jsonb) ? rp.user_id::text
         order by rp.joined_at limit 1;
        if v_host is not null then update public.game_rooms set host_id = v_host, host_seen_at = now() where id = p_room_id; end if;
      end if;
      delete from public.room_players rp
       where rp.room_id = p_room_id and not (coalesce(r.state->'ready', '[]'::jsonb) ? rp.user_id::text);
      update public.game_rooms set state = state - 'rematch_until' where id = p_room_id;
      if r.game_type = 'shark_cage' then perform public._sk_begin(p_room_id); else perform public._vv_begin(p_room_id); end if;
      return;
    end if;
    -- Yeterince hazır yok: normal bekleme odası olarak beklenir
    update public.game_rooms set state = state - 'rematch_until' where id = p_room_id;
    return;
  end if;

  -- Eşleştirme lobisi hemen başlamaz: en az oyuncu sayısına ulaşınca geri sayım (match_wait_seconds, 60 sn) başlar,
  -- bu sürede başka oyuncular da gelir. Süre dolunca (ya da oda dolunca) "Hazırım" diyenler çoğunluktaysa başlar.
  if coalesce((r.config->>'match')::boolean, false) then
    if v_n < v_min then
      if r.state ? 'match_until' then update public.game_rooms set state = state - 'match_until' where id = p_room_id; end if;
      return;
    end if;
    if not r.state ? 'match_until' then
      update public.game_rooms
         set state = state || jsonb_build_object('match_until',
               now() + make_interval(secs => greatest(10, public.setting_int('match_wait_seconds', 60))))
       where id = p_room_id;
      return;
    end if;
    if now() < (r.state->>'match_until')::timestamptz
       and v_n < (select coalesce(gt.max_players, 16) from public.game_types gt where gt.key = r.game_type) then
      return;
    end if;
    if v_ready > v_n - v_ready then
      if r.game_type = 'shark_cage' then perform public._sk_begin(p_room_id); else perform public._vv_begin(p_room_id); end if;
    end if;
  end if;
end $$;

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
