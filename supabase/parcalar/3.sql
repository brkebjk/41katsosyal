-- PARÇA 3 / 3 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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

do $$
declare i int;
begin
  for i in 1..8 loop
    if not exists (select 1 from public.profiles where id = ('b0700000-0000-4000-8000-00000000000' || i)::uuid) then
      insert into auth.users (id, aud, role, raw_user_meta_data, created_at, updated_at)
      values (('b0700000-0000-4000-8000-00000000000' || i)::uuid, 'authenticated', 'authenticated',
              jsonb_build_object('full_name', 'Deneme Botu ' || i, 'username', 'deneme_bot_' || i,
                                 'device_id', 'kat41-test-bot-device-' || i),
              now(), now());
    end if;
  end loop;
  update public.profiles set is_bot = true where id::text like 'b0700000-0000-4000-8000-00000000000%';
exception when others then
  raise warning 'Deneme oyuncuları oluşturulamadı: %', sqlerrm;
end $$;

-- Moderatör: bekleme salonundaki Vampir–Köylü odasına deneme oyuncusu ekler (en çok 8). Oda deneme odası olur.
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
  insert into public.room_players (room_id, user_id, display_name)
  select p_room_id, p.id, p.full_name
    from public.profiles p
   where p.is_bot
     and not exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id = p.id)
   order by p.full_name
   limit least(8, greatest(1, coalesce(p_count, 3)));
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
values ('shark_cage', 'Köpekbalığı Kafesi', 'Dalış, plaj ve kafes oylaması: gizli roller denizde', 6, 16, true, 0)
on conflict (key) do nothing;

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

-- Rol listesi (karıştırılmadan): Alfa + (Çekiçbaş/Kaplan/Hemşire rastgele) + düz köpekbalığı; Cankurtaran ve Oşinograf
-- her zaman, Zıpkıncı 7+, Komutan 8+, Medyum 10+, kalanlar Tatilci; tarafsız: Mürekkep Balığı / Sörfçü, Hazine Avcısı %15
create or replace function public._sk_roles(p_n int)
returns text[] language plpgsql volatile set search_path = public as $$
declare
  c jsonb := public._sk_counts(p_n);
  s int := (c->>'shark')::int;
  q int := (c->>'neutral')::int;
  h int := (c->>'human')::int;
  v text[] := array['alpha'];
  specials text[];
  pool text[] := array['squid', 'surfer', 'scavenger'];
  pick text;
  i int;
begin
  select array_agg(x order by random()) into specials from unnest(array['hammer', 'tiger', 'nurse']) x;
  for i in 1..(s - 1) loop
    v := v || (case when i <= 3 then specials[i] else 'shark' end);
  end loop;
  v := v || array['lifeguard', 'oceanographer'];
  if p_n >= 7 then v := v || 'spearman'::text; end if;
  if p_n >= 8 then v := v || 'marshal'::text; end if;
  if p_n >= 10 then v := v || 'medium'::text; end if;
  while coalesce(array_length(v, 1), 0) < s + h loop
    v := v || 'tourist'::text;
  end loop;
  for i in 1..q loop
    if 'scavenger' = any (pool) and random() < 0.15 then
      pick := 'scavenger';
    else
      select x into pick from unnest(pool) x where x <> 'scavenger' order by random() limit 1;
      pick := coalesce(pick, 'scavenger');
    end if;
    v := v || pick;
    pool := array_remove(pool, pick);
  end loop;
  return v;
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

  -- Ölümler
  update public.room_players set is_alive = false, out_at = now()
   where room_id = p_room_id and is_alive and user_id = any (v_dead);

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
  if r.status <> 'playing' then raise exception 'wrong_phase'; end if;
  select rp.display_name, rp.is_alive, s.role into v_name, v_alive, v_role
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if v_name is null then raise exception 'not_in_room'; end if;
  if p_channel = 'all' then
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
          v_body, p_channel, coalesce((r.state->>'round')::int, 0), r.state->>'phase');
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
    if r.status = 'lobby' then perform public._sk_match_autostart(p_room_id); end if;
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
           'seat', x.seat,
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
         ) order by x.seat), '[]'::jsonb)
    into v_players
    from (
      select rp.*, s.role, s.data, pr.avatar_index,
             row_number() over (order by rp.joined_at, rp.user_id)::int as seat,
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
                   or (coalesce((r.config->>'match')::boolean, false) and v_is_player and r.status = 'lobby')
                 then (select c.code from public.room_codes c where c.room_id = r.id) end,
    'match', coalesce((r.config->>'match')::boolean, false),
    'lobby_ready', case when r.status = 'lobby' then coalesce(r.state->'ready', '[]'::jsonb) end,
    'close_reason', r.state->>'close_reason',
    'counts', coalesce(r.state->'counts', public._sk_counts(greatest(6, v_count))),
    'players', v_players,
    'host', jsonb_build_object('id', r.host_id, 'name', case when v_host_role = 'admin' then '41. Kat Sosyal' else v_host_name end,
                               'is_me', r.host_id = v.id, 'is_moderator', v_host_role = 'admin'),
    'marshal', r.state->>'marshal',
    'last_night', r.state->'last_night',
    'day_event', case when (r.state->'day_event'->>'round')::int = v_round then r.state->'day_event' end,
    'last_vote', r.state->'last_vote',
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
      'voice_left_ms', greatest(0, public.setting_int('sk_voice_round_ms', 15000)
                         - case when (me.data->'voice'->>'round')::int = v_round
                                 and me.data->'voice'->>'channel' = (case when v_phase = 'night' then 'shark' else 'all' end)
                                then coalesce((me.data->'voice'->>'ms')::int, 0) else 0 end)),
    -- Bas-konuş ses mesajları (yalnızca uzaktan odada; künye, ses sk_voice_get ile alınır)
    'voice', case when r.remote and r.status = 'playing' then public._sk_clips_for(p_room_id, v.id) else '[]'::jsonb end,
    'server_now', now(),
    -- Sohbetler: köpekbalıkları (yaşayan köpekbalıkları), elenenler (elenenler; Medyum plajda/oylamada); bitince herkes
    -- Herkese açık yazışma: odadaki herkes okur
    'chat', case when r.status in ('playing', 'finished') then (
              select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                                           'mine', d.user_id = v.id, 'from', d.user_id,
                                                           'round', d.round, 'phase', d.phase) order by d.created_at), '[]'::jsonb)
                from (select * from public.vv_dead_chat where room_id = p_room_id and channel = 'all'
                       order by created_at desc limit 60) d) end,
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
  if r.status not in ('playing', 'finished') then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'body', d.body, 'at', d.created_at,
                                                 'mine', d.user_id = v.id, 'from', d.user_id, 'channel', d.channel,
                                                 'round', d.round, 'phase', d.phase) order by d.created_at), '[]'::jsonb)
      from (select * from public.vv_dead_chat
             where room_id = p_room_id
               and (channel = 'all' or (channel = 'shark' and v_shark) or (channel = 'dead' and v_dead))
             order by created_at desc limit 400) d);
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
  ('sk_voice_round_ms', '15000', 'Köpekbalığı Kafesi: bir oyuncunun her tartışmada (plaj+oylama ya da dalış) toplam bas-konuş süresi, milisaniye')
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
                      where rp.room_id = c.room_id and rp.user_id = p_user and rp.is_alive and rp.left_at is null
                        and public._sk_team(s.role) = 'shark'));
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
  if p_duration_ms is null or p_duration_ms not between 300 and 6000 then raise exception 'invalid_audio'; end if;
  -- Boyut: en çok 240 bin karakter ve bildirilen süreyle orantılı (yüksek kaliteli kayda da yer var). Bildirilenden uzun
  -- ses gönderilse bile dinleyenin telefonu çalmayı bildirilen sürenin sonunda keser.
  if char_length(v_audio) > least(240000, 12000 + p_duration_ms * 40) then raise exception 'audio_too_big'; end if;
  perform public._sk_voice_cleanup();
  select * into r from public.game_rooms where id = p_room_id;
  if not found or r.game_type <> 'shark_cage' or not r.remote or r.status <> 'playing' then raise exception 'voice_closed'; end if;
  select rp.is_alive, s.role into v_alive, v_role
    from public.room_players rp
    join public.room_player_secrets s on s.room_id = rp.room_id and s.user_id = rp.user_id
   where rp.room_id = p_room_id and rp.user_id = v.id and rp.left_at is null;
  if not coalesce(v_alive, false) then raise exception 'voice_closed'; end if;
  v_channel := case when r.state->>'phase' in ('day', 'vote', 'vote_result') then 'all'
                    when r.state->>'phase' = 'night' and public._sk_team(v_role) = 'shark' then 'shark' end;
  if v_channel is null then raise exception 'voice_closed'; end if;
  -- Her tartışmada (tur + kanal) kişi başı en çok 15 sn konuşma (ayar: sk_voice_round_ms). Sayaç gizli kayıtta tutulur.
  v_round := coalesce((r.state->>'round')::int, 0);
  select s.data into v_data from public.room_player_secrets s where s.room_id = p_room_id and s.user_id = v.id for update;
  v_used := case when (v_data->'voice'->>'round')::int = v_round and v_data->'voice'->>'channel' = v_channel
                 then coalesce((v_data->'voice'->>'ms')::int, 0) else 0 end;
  if v_used + p_duration_ms > public.setting_int('sk_voice_round_ms', 15000) + 500 then raise exception 'voice_quota'; end if;
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
    'pct', least(80, greatest(10, public.setting_int('pts_remote_pct', 50))),
    'top_cap', public.setting_int('pts_game_top_cap', 12),
    'min_players', public.setting_int('pts_game_min_players', 4));
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
-- "Eşleş" diyenler sıraya girer (harita üstünde aranır). Açık bir eşleştirme lobisi varsa (16 kişiden az) oraya girilir;
-- yoksa sırada 3 kişi olunca yeni lobi açılır. Lobide 6 kişi olunca "Hazırım" düğmesi açılır; hazır diyenler
-- demeyenlerden fazla olunca oyun kendiliğinden başlar (Otomatik Oyun, uzaktan, puan yarı). Herkes rumuzuyla görünür.
-- Lobideki herkes davet bağlantısı (oda kodu) paylaşabilir; kalabalık oyun daha çok puan verir.
create table if not exists public.sk_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.sk_queue enable row level security;

-- Sıradakiyle eşleştirmeyi dener. Döner: kişinin girdiği eşleştirme odası (yoksa boş).
create or replace function public._sk_match_try(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
  v_code text;
  v_try int := 0;
  v_host uuid;
  v_n int;
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
  if not exists (select 1 from public.sk_queue where user_id = p_user) then return null; end if;

  -- 1) Yer olan açık eşleştirme lobisi
  select r.id into v_room
    from public.game_rooms r
   where r.game_type = 'shark_cage' and r.status = 'lobby' and coalesce((r.config->>'match')::boolean, false)
     and (select count(*) from public.room_players rp where rp.room_id = r.id) < 16
     and not exists (select 1 from public.room_bans b where b.room_id = r.id and b.user_id = p_user)
   order by r.created_at
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

  -- 2) Sırada en az 3 kişi: yeni lobi
  select count(*)::int into v_n from public.sk_queue;
  if v_n < 3 then return null; end if;
  select user_id into v_host from public.sk_queue order by joined_at limit 1;
  insert into public.game_rooms (game_type, host_id, config, remote, state)
  values ('shark_cage', v_host, jsonb_build_object('mode', 'auto', 'match', true), true, '{"ready": []}'::jsonb)
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
    from (select user_id from public.sk_queue order by joined_at limit 16) q
    join public.profiles p on p.id = q.user_id;
  if exists (select 1 from public.room_players rp join public.profiles p on p.id = rp.user_id and p.is_bot
              where rp.room_id = v_room) then
    update public.game_rooms set config = config || '{"test": true}'::jsonb where id = v_room;
  end if;
  delete from public.sk_queue where user_id in (select user_id from public.room_players where room_id = v_room);
  return case when exists (select 1 from public.room_players where room_id = v_room and user_id = p_user) then v_room end;
end $$;

-- Eşleşmek için sıraya gir. Döner: { room (eşleştiyse), waiting (sıradaki kişi sayısı) }
create or replace function public.sk_match_join()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  v_room uuid;
  v_live uuid;
begin
  v := public._require_user();
  if v.role::text = 'sponsor' then raise exception 'sponsor_not_allowed'; end if;
  if not exists (select 1 from public.game_types where key = 'shark_cage' and enabled) then
    raise exception 'game_not_available';
  end if;
  v_live := public._user_live_room(v.id);
  if v.role <> 'admin' and v_live is not null
     and not exists (select 1 from public.game_rooms r where r.id = v_live and coalesce((r.config->>'match')::boolean, false)) then
    raise exception 'already_in_game';
  end if;
  insert into public.sk_queue (user_id) values (v.id)
  on conflict (user_id) do update set last_seen = now();
  v_room := public._sk_match_try(v.id);
  return jsonb_build_object('room', v_room, 'waiting', (select count(*) from public.sk_queue));
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
  return jsonb_build_object('room', v_room, 'waiting', (select count(*) from public.sk_queue),
                            'searching', exists (select 1 from public.sk_queue where user_id = v.id));
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
declare
  r public.game_rooms;
  v_n int;
  v_ready int;
begin
  select * into r from public.game_rooms where id = p_room_id for update;
  if not found or r.status <> 'lobby' or not coalesce((r.config->>'match')::boolean, false) then return; end if;
  select count(*)::int into v_n from public.room_players where room_id = p_room_id and left_at is null;
  select count(*)::int into v_ready
    from jsonb_array_elements_text(coalesce(r.state->'ready', '[]'::jsonb)) x
   where exists (select 1 from public.room_players rp where rp.room_id = p_room_id and rp.user_id::text = x and rp.left_at is null);
  if v_n >= 6 and v_ready > v_n - v_ready then perform public._sk_begin(p_room_id); end if;
end $$;

-- Eşleştirme lobisinde "Hazırım" (6 kişi olmadan basılamaz) / vazgeç
create or replace function public.sk_lobby_ready(p_room_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.profiles;
  r public.game_rooms;
begin
  v := public._require_user();
  r := public._sk_room(p_room_id);
  if r.status <> 'lobby' or not coalesce((r.config->>'match')::boolean, false) then raise exception 'wrong_phase'; end if;
  if not exists (select 1 from public.room_players where room_id = p_room_id and user_id = v.id and left_at is null) then
    raise exception 'not_in_room';
  end if;
  if coalesce(p_on, false) and (select count(*) from public.room_players where room_id = p_room_id and left_at is null) < 6 then
    raise exception 'not_enough_players';
  end if;
  update public.game_rooms
     set state = jsonb_set(state, '{ready}',
           (coalesce(state->'ready', '[]'::jsonb) - v.id::text)
           || (case when coalesce(p_on, false) then jsonb_build_array(v.id::text) else '[]'::jsonb end))
   where id = p_room_id;
  perform public._sk_match_autostart(p_room_id);
end $$;

-- GEÇİCİ: moderatör tek telefonla deneyebilsin diye deneme oyuncularını eşleştirme sırasına koyar
create or replace function public.admin_queue_test_bots(p_count int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public._require_user();
  perform public._require_admin();
  insert into public.sk_queue (user_id)
  select p.id from public.profiles p
   where p.is_bot
     and not exists (select 1 from public.sk_queue q where q.user_id = p.id)
     and not exists (select 1 from public.room_players rp join public.game_rooms r on r.id = rp.room_id
                      where rp.user_id = p.id and rp.left_at is null and r.status in ('lobby', 'playing'))
   order by p.full_name
   limit least(8, greatest(1, coalesce(p_count, 3)));
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
  return jsonb_build_object('format', '41kat-yedek-v1', 'created_at', now(), 'by', p_admin,
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
  if p_data ->> 'format' is distinct from '41kat-yedek-v1' or jsonb_typeof(p_data -> 'tables') <> 'object' then
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
grant execute on function public.sk_pick_role(uuid, text) to authenticated;
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
grant execute on function public.vv_skip_discussion(uuid, boolean) to authenticated;
grant execute on function public.sk_skip_discussion(uuid, boolean) to authenticated;
grant execute on function public.sk_match_join() to authenticated;
grant execute on function public.sk_match_poll() to authenticated;
grant execute on function public.sk_match_cancel() to authenticated;
grant execute on function public.sk_lobby_ready(uuid, boolean) to authenticated;
grant execute on function public.admin_queue_test_bots(int) to authenticated;
grant execute on function public.admin_get_voice_clip(uuid) to authenticated;
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
grant execute on function public.create_room(text, uuid, text, int, int, int, int, text, boolean, double precision, double precision, real) to authenticated;
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

notify pgrst, 'reload schema';
