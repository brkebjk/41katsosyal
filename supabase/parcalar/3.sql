-- PARÇA 3 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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
  (974,10,12,24),
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
  (976,12,13,21),
  (976,14,20,49),
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
  (977,12,14,21),
  (977,15,20,49),
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
  (980,12,14,21),
  (980,15,18,49),
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
  (981,12,14,21),
  (981,15,16,49),
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
  (982,11,14,21),
  (982,15,15,49),
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
  (983,14,14,41),
  (983,15,28,22),
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
  (984,14,28,22),
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
  (985,11,13,41),
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
  (986,4,13,41),
  (986,14,28,22),
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
  (990,13,40,22),
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
  (996,-2,9,41),
  (996,10,33,22),
  (996,34,64,45),
  (997,-93,-60,42),
  (997,-59,-38,26),
  (997,-37,-16,13),
  (997,-15,-3,30),
  (997,-2,9,41),
  (997,10,32,22),
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
  (1885,76,77,77),
  (1886,75,78,77),
  (1887,75,79,77),
  (1888,74,80,77),
  (1889,74,79,77),
  (1890,74,79,77),
  (1891,74,78,77),
  (1892,73,77,77),
  (1893,65,67,77),
  (1893,70,76,77),
  (1894,64,76,77),
  (1895,63,77,77),
  (1896,62,78,77),
  (1897,61,77,77),
  (1898,60,77,77),
  (1899,58,76,77),
  (1900,57,75,77),
  (1901,57,76,77),
  (1901,78,78,77),
  (1902,57,79,77),
  (1903,56,78,77),
  (1904,55,77,77),
  (1905,54,77,77),
  (1905,103,104,78),
  (1906,53,75,77),
  (1906,92,93,78),
  (1906,103,104,78),
  (1907,53,74,77),
  (1907,90,94,78),
  (1907,102,104,78),
  (1907,106,109,78),
  (1908,51,74,77),
  (1908,75,76,78),
  (1908,89,94,78),
  (1908,100,112,78),
  (1908,126,127,75),
  (1909,40,40,72),
  (1909,42,42,72),
  (1909,49,50,72),
  (1909,51,73,77),
  (1909,74,75,78),
  (1909,88,112,78),
  (1909,125,127,75),
  (1910,38,45,72),
  (1910,47,49,72),
  (1910,50,72,77),
  (1910,73,75,78),
  (1910,88,112,78),
  (1910,123,127,75),
  (1911,36,49,72),
  (1911,50,71,77),
  (1911,72,75,78),
  (1911,87,112,78),
  (1911,115,127,75),
  (1912,35,49,72),
  (1912,50,71,77),
  (1912,72,76,78),
  (1912,83,83,78),
  (1912,87,112,78),
  (1912,115,127,75),
  (1913,34,50,72),
  (1913,51,70,77),
  (1913,71,112,78),
  (1913,114,114,78),
  (1913,115,127,75),
  (1914,30,50,72),
  (1914,51,70,77),
  (1914,71,117,78),
  (1914,118,127,75),
  (1915,30,50,72),
  (1915,51,69,77),
  (1915,70,116,78),
  (1915,117,126,75),
  (1915,135,137,75),
  (1916,29,50,72),
  (1916,51,57,77),
  (1916,58,58,79),
  (1916,59,69,77),
  (1916,70,117,78),
  (1916,118,126,75),
  (1916,129,137,75),
  (1917,8,9,76),
  (1917,28,50,72),
  (1917,51,56,77),
  (1917,57,59,79),
  (1917,60,66,77),
  (1917,67,67,79),
  (1917,68,68,77),
  (1917,69,117,78),
  (1917,118,137,75),
  (1917,141,141,56),
  (1917,145,150,56),
  (1918,7,9,76),
  (1918,26,51,72),
  (1918,52,55,77),
  (1918,56,59,79),
  (1918,60,64,77),
  (1918,65,68,79),
  (1918,69,117,78),
  (1918,118,137,75),
  (1918,139,150,56),
  (1919,6,9,76),
  (1919,23,51,72),
  (1919,52,53,79),
  (1919,54,54,77),
  (1919,55,60,79),
  (1919,61,64,77),
  (1919,65,67,79),
  (1919,68,117,78),
  (1919,118,136,75),
  (1919,137,150,56),
  (1920,5,9,76),
  (1920,21,50,72),
  (1920,51,59,79),
  (1920,60,63,77),
  (1920,64,69,79),
  (1920,70,116,78),
  (1920,117,135,75),
  (1920,136,151,56),
  (1921,5,11,76),
  (1921,19,50,72),
  (1921,51,58,79),
  (1921,59,62,77),
  (1921,63,69,79),
  (1921,70,115,78),
  (1921,116,135,75),
  (1921,136,150,56),
  (1922,4,12,76),
  (1922,16,16,76),
  (1922,17,49,72),
  (1922,50,58,79),
  (1922,59,60,77),
  (1922,61,69,79),
  (1922,70,114,78),
  (1922,115,132,75),
  (1922,133,150,56),
  (1923,3,15,76),
  (1923,16,48,72),
  (1923,49,57,79),
  (1923,58,59,77),
  (1923,60,70,79),
  (1923,71,112,78),
  (1923,113,131,75),
  (1923,132,149,56),
  (1924,3,15,76),
  (1924,16,48,72),
  (1924,49,69,79),
  (1924,70,111,78),
  (1924,112,130,75),
  (1924,131,149,56),
  (1925,2,15,76),
  (1925,16,48,72),
  (1925,49,69,79),
  (1925,70,110,78),
  (1925,111,130,75),
  (1925,131,149,56),
  (1925,161,162,70),
  (1926,2,15,76),
  (1926,16,47,72),
  (1926,48,68,79),
  (1926,69,109,78),
  (1926,110,130,75),
  (1926,131,150,56),
  (1926,158,163,70),
  (1927,-25,-23,80),
  (1927,2,14,76),
  (1927,15,47,72),
  (1927,48,68,79),
  (1927,69,109,78),
  (1927,110,130,75),
  (1927,131,150,56),
  (1927,157,164,70),
  (1928,-26,-23,80),
  (1928,0,14,76),
  (1928,15,47,72),
  (1928,48,66,79),
  (1928,67,108,78),
  (1928,109,129,75),
  (1928,130,149,56),
  (1928,154,164,70),
  (1929,-29,-29,80),
  (1929,-26,-24,80),
  (1929,0,14,76),
  (1929,15,46,72),
  (1929,47,63,79),
  (1929,64,107,78),
  (1929,108,131,75),
  (1929,132,149,56),
  (1929,153,164,70),
  (1930,-31,-29,80),
  (1930,-27,-24,80),
  (1930,-2,13,76),
  (1930,14,45,72),
  (1930,46,62,79),
  (1930,63,64,53),
  (1930,65,109,78),
  (1930,110,131,75),
  (1930,132,132,56),
  (1930,133,133,75),
  (1930,134,148,56),
  (1930,149,164,70),
  (1931,-32,-25,80),
  (1931,-2,13,76),
  (1931,14,44,72),
  (1931,45,62,79),
  (1931,63,65,53),
  (1931,66,108,78),
  (1931,109,134,75),
  (1931,135,146,56),
  (1931,147,163,70),
  (1932,-33,-24,80),
  (1932,-3,12,76),
  (1932,13,38,72),
  (1932,39,39,79),
  (1932,40,42,72),
  (1932,43,57,79),
  (1932,58,66,53),
  (1932,67,68,78),
  (1932,69,69,53),
  (1932,70,107,78),
  (1932,108,134,75),
  (1932,135,144,56),
  (1932,145,161,70),
  (1933,-34,-25,80),
  (1933,-5,11,76),
  (1933,12,37,72),
  (1933,38,39,79),
  (1933,40,42,72),
  (1933,43,57,79),
  (1933,58,69,53),
  (1933,70,77,78),
  (1933,78,79,53),
  (1933,80,106,78),
  (1933,107,133,75),
  (1933,134,135,56),
  (1933,136,136,70),
  (1933,137,142,56),
  (1933,143,160,70),
  (1934,-35,-25,80),
  (1934,-5,11,76),
  (1934,12,36,72),
  (1934,37,38,79),
  (1934,39,41,72),
  (1934,42,57,79),
  (1934,58,72,53),
  (1934,73,75,78),
  (1934,76,82,53),
  (1934,83,86,78),
  (1934,87,88,53),
  (1934,89,105,78),
  (1934,106,132,75),
  (1934,133,135,70),
  (1934,136,141,56),
  (1934,142,160,70),
  (1935,-36,-25,80),
  (1935,-6,10,76),
  (1935,11,34,72),
  (1935,35,37,79),
  (1935,38,39,72),
  (1935,40,58,79),
  (1935,59,88,53),
  (1935,89,104,78),
  (1935,105,131,75),
  (1935,132,159,70),
  (1936,-37,-25,80),
  (1936,-10,-10,76),
  (1936,-7,10,76),
  (1936,11,33,72),
  (1936,34,57,79),
  (1936,58,88,53),
  (1936,89,104,78),
  (1936,105,131,75),
  (1936,132,157,70),
  (1937,-37,-26,80),
  (1937,-12,9,76),
  (1937,10,33,72),
  (1937,34,57,79),
  (1937,58,88,53),
  (1937,89,96,78),
  (1937,97,98,75),
  (1937,99,100,78),
  (1937,101,101,75),
  (1937,102,103,78),
  (1937,104,130,75),
  (1937,131,156,70),
  (1938,-40,-39,80),
  (1938,-37,-26,80),
  (1938,-12,9,76),
  (1938,10,32,72),
  (1938,33,57,79),
  (1938,58,87,53),
  (1938,88,95,78),
  (1938,96,128,75),
  (1938,129,156,70),
  (1939,-41,-27,80),
  (1939,-13,9,76),
  (1939,10,31,72),
  (1939,32,56,79),
  (1939,57,87,53),
  (1939,88,94,78),
  (1939,95,128,75),
  (1939,129,157,70),
  (1940,-44,-27,80),
  (1940,-13,8,76),
  (1940,9,31,72),
  (1940,32,56,79),
  (1940,57,87,53),
  (1940,88,90,78),
  (1940,91,127,75),
  (1940,128,158,70),
  (1941,-48,-48,59),
  (1941,-45,-27,80),
  (1941,-13,7,76),
  (1941,8,30,72),
  (1941,31,56,79),
  (1941,57,87,53),
  (1941,88,88,78),
  (1941,89,127,75),
  (1941,128,159,70),
  (1942,-49,-49,59),
  (1942,-46,-22,80),
  (1942,-14,6,76),
  (1942,7,29,72),
  (1942,30,55,79),
  (1942,56,86,53),
  (1942,87,88,78),
  (1942,89,127,75),
  (1942,128,158,70),
  (1943,-51,-49,59),
  (1943,-47,-18,80),
  (1943,-15,4,76),
  (1943,5,29,72),
  (1943,30,30,79),
  (1943,31,33,72),
  (1943,34,56,79),
  (1943,57,86,53),
  (1943,87,87,78),
  (1943,88,126,75),
  (1943,127,158,70),
  (1944,-53,-47,59),
  (1944,-46,-17,80),
  (1944,-16,4,76),
  (1944,5,32,72),
  (1944,33,58,79),
  (1944,59,86,53),
  (1944,87,125,75),
  (1944,126,157,70),
  (1945,-60,-56,59),
  (1945,-54,-47,59),
  (1945,-46,-18,80),
  (1945,-17,4,76),
  (1945,5,31,72),
  (1945,32,58,79),
  (1945,59,86,53),
  (1945,87,121,75),
  (1945,122,157,70),
  (1946,-61,-57,59),
  (1946,-54,-48,59),
  (1946,-47,-18,80),
  (1946,-17,4,76),
  (1946,5,31,72),
  (1946,32,58,79),
  (1946,59,86,53),
  (1946,87,121,75),
  (1946,122,156,70),
  (1947,-63,-56,59),
  (1947,-54,-49,59),
  (1947,-48,-19,80),
  (1947,-18,3,76),
  (1947,4,30,72),
  (1947,31,58,79),
  (1947,59,86,53),
  (1947,87,119,75),
  (1947,120,156,70),
  (1948,-64,-56,59),
  (1948,-54,-49,59),
  (1948,-48,-20,80),
  (1948,-19,2,76),
  (1948,3,30,72),
  (1948,31,58,79),
  (1948,59,86,53),
  (1948,87,119,75),
  (1948,120,155,70),
  (1949,-65,-47,59),
  (1949,-46,-20,80),
  (1949,-19,2,76),
  (1949,3,30,72),
  (1949,31,57,79),
  (1949,58,88,53),
  (1949,89,119,75),
  (1949,120,154,70),
  (1950,-66,-46,59),
  (1950,-45,-20,80),
  (1950,-19,1,76),
  (1950,2,29,72),
  (1950,30,56,79),
  (1950,57,88,53),
  (1950,89,119,75),
  (1950,120,143,70),
  (1950,145,152,70),
  (1951,-72,-45,59),
  (1951,-44,-20,80),
  (1951,-19,-14,76),
  (1951,-13,-10,80),
  (1951,-9,0,76),
  (1951,1,28,72),
  (1951,29,55,79),
  (1951,56,87,53),
  (1951,88,118,75),
  (1951,119,143,70),
  (1952,-73,-44,59),
  (1952,-43,-20,80),
  (1952,-19,-15,76),
  (1952,-14,-10,80),
  (1952,-9,-1,76),
  (1952,0,26,72),
  (1952,27,29,58),
  (1952,30,54,79),
  (1952,55,87,53),
  (1952,88,117,75),
  (1952,118,141,70),
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
  (1953,53,84,53),
  (1953,85,85,75),
  (1953,86,86,53),
  (1953,87,117,75),
  (1953,118,140,70),
  (1954,-74,-47,59),
  (1954,-46,-10,80),
  (1954,-9,-3,76),
  (1954,-2,17,72),
  (1954,18,24,63),
  (1954,25,31,58),
  (1954,32,34,79),
  (1954,35,38,58),
  (1954,39,52,79),
  (1954,53,83,53),
  (1954,84,116,75),
  (1954,117,139,70),
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
  (1955,53,82,53),
  (1955,83,115,75),
  (1955,116,138,70),
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
  (1956,53,82,53),
  (1956,83,114,75),
  (1956,115,137,70),
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
  (1957,53,82,53),
  (1957,83,114,75),
  (1957,115,135,70),
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
  (1958,88,113,75),
  (1958,114,129,70),
  (1958,131,134,70),
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
  (1959,87,113,75),
  (1959,114,121,70),
  (1959,123,125,70),
  (1959,132,132,70),
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
  (1960,87,114,75),
  (1960,115,121,70),
  (1960,124,124,70),
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
  (1961,88,114,75),
  (1961,115,121,70),
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
  (1962,88,114,75),
  (1962,115,120,70),
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
  (1963,88,114,75),
  (1963,115,118,70),
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
  (1964,86,113,75),
  (1964,114,117,70),
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
  (1965,85,112,75),
  (1965,114,117,70),
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
  (1966,85,111,75),
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
  (1967,84,108,75),
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
  (1968,84,92,75),
  (1968,97,107,75),
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
  (1969,84,90,75),
  (1969,98,98,75),
  (1969,100,106,75),
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
  (1970,84,89,75),
  (1970,100,105,75),
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
  (1971,84,87,75),
  (1971,101,104,75),
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
  (1972,85,87,75),
  (1973,-60,-59,59),
  (1973,-56,-52,59),
  (1973,-51,-46,80),
  (1973,-38,-33,80),
  (1973,-5,-5,74),
  (1973,-4,-4,52),
  (1973,6,12,71),
  (1973,13,27,57),
  (1973,28,64,68),
  (1973,85,86,75),
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
  (1977,-51,-49,66),
  (1977,-13,-12,60),
  (1977,6,9,71),
  (1977,10,25,57),
  (1977,26,61,68),
  (1978,-70,-69,66),
  (1978,-60,-53,80),
  (1978,-52,-49,66),
  (1978,-15,-11,60),
  (1978,1,3,67),
  (1978,8,9,54),
  (1978,10,25,57),
  (1978,26,61,68),
  (1979,-70,-69,66),
  (1979,-62,-62,66),
  (1979,-61,-54,80),
  (1979,-53,-50,66),
  (1979,-17,-10,60),
  (1979,-1,3,67),
  (1979,7,10,54),
  (1979,11,23,57),
  (1979,24,58,68),
  (1980,-71,-69,66),
  (1980,-64,-61,66),
  (1980,-60,-57,80),
  (1980,-56,-51,66),
  (1980,-47,-47,66),
  (1980,-18,-9,60),
  (1980,-6,-6,60),
  (1980,-3,3,67),
  (1980,4,10,54),
  (1980,11,22,57),
  (1980,23,44,68),
  (1980,48,57,68),
  (1981,-71,-70,66),
  (1981,-66,-47,66),
  (1981,-18,-5,60),
  (1981,-4,0,67),
  (1981,1,9,54),
  (1981,10,21,57),
  (1981,22,43,68),
  (1981,48,56,68),
  (1982,-71,-48,66),
  (1982,-19,-4,60),
  (1982,-3,0,67),
  (1982,1,7,54),
  (1982,8,21,57),
  (1982,22,42,68),
  (1982,49,54,68),
  (1983,-71,-48,66),
  (1983,-20,-4,60),
  (1983,-3,-1,67),
  (1983,0,6,54),
  (1983,7,21,57),
  (1983,22,40,68),
  (1983,50,53,68),
  (1984,-71,-49,66),
  (1984,-22,-4,60),
  (1984,-3,-1,67),
  (1984,0,6,54),
  (1984,7,21,57),
  (1984,22,38,68),
  (1984,50,52,68),
  (1985,-72,-50,66),
  (1985,-23,-4,60),
  (1985,-3,0,67),
  (1985,1,5,54),
  (1985,6,22,57),
  (1985,23,37,68),
  (1985,49,51,68),
  (1986,-74,-50,66),
  (1986,-24,-4,60),
  (1986,-3,1,67),
  (1986,2,4,54),
  (1986,5,22,57),
  (1986,23,36,68),
  (1986,49,49,68),
  (1987,-74,-51,66),
  (1987,-26,-25,73),
  (1987,-24,-4,60),
  (1987,-3,2,67),
  (1987,3,4,54),
  (1987,5,21,57),
  (1987,22,35,68),
  (1988,-75,-51,66),
  (1988,-29,-26,73),
  (1988,-25,-19,60),
  (1988,-18,-16,73),
  (1988,-15,-4,60),
  (1988,-3,2,67),
  (1988,3,4,54),
  (1988,5,21,57),
  (1988,22,34,68),
  (1989,-77,-52,66),
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
  (1990,-78,-54,66),
  (1990,-32,-12,73),
  (1990,-11,-4,60),
  (1990,-3,3,67),
  (1990,4,20,57),
  (1990,21,32,68),
  (1991,-78,-56,66),
  (1991,-34,-11,73),
  (1991,-10,-5,60),
  (1991,-4,2,67),
  (1991,3,4,73),
  (1991,5,18,57),
  (1991,21,30,68),
  (1992,-78,-57,66),
  (1992,-34,-11,73),
  (1992,-10,-7,60),
  (1992,-6,0,67),
  (1992,1,5,73),
  (1992,6,14,57),
  (1992,22,29,68),
  (1993,-79,-59,66),
  (1993,-34,-11,73),
  (1993,-10,-8,60),
  (1993,-7,-7,73),
  (1993,-6,-5,67),
  (1993,-4,-4,73),
  (1993,-3,-1,67),
  (1993,0,6,73),
  (1993,7,13,57),
  (1993,22,27,68),
  (1994,-81,-60,66),
  (1994,-33,6,73),
  (1994,7,10,57),
  (1994,23,25,68),
  (1995,-81,-61,66),
  (1995,-33,5,73),
  (1995,6,9,57),
  (1996,-82,-62,66),
  (1996,-33,6,73),
  (1996,7,7,57),
  (1997,-83,-62,66),
  (1997,-34,5,73),
  (1998,-83,-63,66),
  (1998,-36,-36,62),
  (1998,-35,4,73),
  (1999,-83,-64,66),
  (1999,-38,-35,62),
  (1999,-34,4,73),
  (2000,-84,-64,66),
  (2000,-39,-36,62),
  (2000,-35,3,73),
  (2001,-85,-66,66),
  (2001,-40,-36,62),
  (2001,-35,3,73),
  (2002,-86,-67,66),
  (2002,-42,-37,62),
  (2002,-36,2,73),
  (2003,-86,-68,66),
  (2003,-46,-38,62),
  (2003,-37,-35,73),
  (2003,-34,-33,62),
  (2003,-32,2,73),
  (2004,-86,-70,66),
  (2004,-46,-39,62),
  (2004,-38,-36,73),
  (2004,-35,-32,62),
  (2004,-31,-29,73),
  (2004,-28,-28,62),
  (2004,-27,1,73),
  (2005,-87,-70,66),
  (2005,-46,-40,62),
  (2005,-39,-36,73),
  (2005,-35,-33,62),
  (2005,-32,-32,73),
  (2005,-31,-31,62),
  (2005,-30,0,73),
  (2006,-88,-71,66),
  (2006,-49,-39,62),
  (2006,-38,-37,73),
  (2006,-36,-29,62),
  (2006,-28,0,73),
  (2007,-88,-71,66),
  (2007,-50,-28,62),
  (2007,-27,0,73),
  (2008,-88,-74,66),
  (2008,-51,-28,62),
  (2008,-27,-1,73),
  (2009,-88,-76,66),
  (2009,-51,-29,62),
  (2009,-28,-2,73),
  (2010,-86,-77,66),
  (2010,-52,-29,62),
  (2010,-28,-28,73),
  (2010,-27,-27,51),
  (2010,-26,-2,73),
  (2011,-85,-82,66),
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
  (2048,-4,0,69),
  (2049,-62,-54,61),
  (2049,-51,-51,61),
  (2049,-48,-45,61),
  (2049,-44,-42,55),
  (2049,-39,-36,51),
  (2049,-35,-11,55),
  (2049,-5,1,69),
  (2050,-63,-46,61),
  (2050,-45,-38,55),
  (2050,-37,-36,51),
  (2050,-35,-11,55),
  (2050,-5,1,69),
  (2051,-64,-45,61),
  (2051,-44,-38,55),
  (2051,-37,-37,51),
  (2051,-36,-11,55),
  (2051,-7,1,69),
  (2052,-66,-46,61),
  (2052,-45,-15,55),
  (2052,-14,1,69),
  (2053,-67,-46,61),
  (2053,-45,-16,55),
  (2053,-15,0,69),
  (2054,-67,-47,61),
  (2054,-46,-19,55),
  (2054,-18,-1,69),
  (2055,-67,-47,61),
  (2055,-46,-20,55),
  (2055,-19,-1,69),
  (2056,-68,-48,61),
  (2056,-47,-20,55),
  (2056,-19,-2,69),
  (2057,-69,-49,61),
  (2057,-48,-22,55),
  (2057,-21,-2,69),
  (2058,-69,-50,61),
  (2058,-49,-26,55),
  (2058,-25,-25,69),
  (2058,-24,-24,55),
  (2058,-23,-1,69),
  (2059,-70,-51,61),
  (2059,-50,-27,55),
  (2059,-26,-1,69),
  (2060,-72,-53,61),
  (2060,-52,-28,55),
  (2060,-27,0,69),
  (2061,-71,-53,61),
  (2061,-52,-29,55),
  (2061,-28,0,69),
  (2062,-71,-53,61),
  (2062,-52,-29,55),
  (2062,-28,1,69),
  (2062,4,5,69),
  (2063,-72,-53,61),
  (2063,-52,-29,55),
  (2063,-28,1,69),
  (2063,3,5,69),
  (2064,-72,-54,61),
  (2064,-53,-30,55),
  (2064,-29,3,69),
  (2065,-71,-55,61),
  (2065,-54,-31,55),
  (2065,-30,2,69),
  (2066,-69,-56,61),
  (2066,-55,-30,55),
  (2066,-29,1,69),
  (2067,-69,-56,61),
  (2067,-55,-29,55),
  (2067,-28,0,69),
  (2068,-68,-57,61),
  (2068,-56,-30,55),
  (2068,-29,-1,69),
  (2069,-66,-58,61),
  (2069,-57,-30,55),
  (2069,-29,-2,69),
  (2070,-66,-58,61),
  (2070,-57,-30,55),
  (2070,-29,-3,69),
  (2071,-67,-59,61),
  (2071,-58,-31,55),
  (2071,-30,-3,69),
  (2072,-68,-59,61),
  (2072,-58,-31,55),
  (2072,-30,-4,69),
  (2073,-69,-56,61),
  (2073,-55,-32,55),
  (2073,-31,-5,69),
  (2074,-70,-56,61),
  (2074,-55,-32,55),
  (2074,-31,-6,69),
  (2075,-71,-55,61),
  (2075,-54,-32,55),
  (2075,-31,-7,69),
  (2076,-72,-55,61),
  (2076,-54,-32,55),
  (2076,-31,-8,69),
  (2077,-73,-55,61),
  (2077,-54,-33,55),
  (2077,-32,-29,69),
  (2077,-28,-28,55),
  (2077,-27,-9,69),
  (2078,-74,-55,61),
  (2078,-54,-34,55),
  (2078,-33,-31,69),
  (2078,-30,-27,55),
  (2078,-26,-9,69),
  (2079,-75,-55,61),
  (2079,-54,-34,55),
  (2079,-33,-31,69),
  (2079,-30,-27,55),
  (2079,-26,-10,69),
  (2080,-77,-54,61),
  (2080,-53,-27,55),
  (2080,-26,-12,69),
  (2081,-79,-54,61),
  (2081,-53,-29,55),
  (2081,-28,-15,69),
  (2082,-80,-55,61),
  (2082,-54,-22,55),
  (2082,-21,-17,69),
  (2083,-85,-85,61),
  (2083,-83,-55,61),
  (2083,-54,-19,55),
  (2083,-18,-18,69),
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
    perform public._sk_bots_act(p_room_id);
    if r.status = 'playing' then perform public._sk_auto_tick(p_room_id); end if;
    if r.status = 'lobby' then perform public._room_lobby_tick(p_room_id); end if;
    perform public._kick_tick(p_room_id);
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
    'phase_age', greatest(0, extract(epoch from now() - public._vv_phase_started(r))::int),
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
  update public.profiles set city = p_city, city_next = null, city_next_at = null, city_set_at = now() where id = v.id;
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
  update public.profiles set city = p_city, city_next = null, city_next_at = null, city_set_at = now() where id = p_user;
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
grant execute on function public.create_post(text, text, uuid, int, int, int, int, uuid) to authenticated;
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
