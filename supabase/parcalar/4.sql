-- PARÇA 4 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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

notify pgrst, 'reload schema';
