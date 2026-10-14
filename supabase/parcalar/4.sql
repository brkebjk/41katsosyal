-- PARÇA 4 / 4 — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.

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

notify pgrst, 'reload schema';
