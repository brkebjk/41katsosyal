// Anlık bildirim: sunucu, üyeye yeni bir bildirim (oyun daveti, arkadaşlık isteği, mesaj…) yazınca ya da yeni bir
// duyuru yayınlanınca bunu açık bağlantı (Supabase Realtime) üzerinden hemen haber verir. Uygulama da o an
// bildirimleri okur. Böylece sunucuya birkaç saniyede bir “yeni bir şey var mı?” diye sormaya gerek kalmaz.
// Bağlantı kurulamazsa ya da koparsa uygulama eski yönteme (sık sık sormaya) kendiliğinden döner.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

let live = false;

/** Anlık bildirim bağlantısı şu an açık mı? */
export function isLiveNotifyOn(): boolean {
  return live;
}

/**
 * Bu üyenin bildirimlerini ve genel duyuruları dinlemeye başlar. Yeni bir kayıt gelince `onNew` çağrılır.
 * Dönen işlev dinlemeyi bırakır.
 */
export function startLiveNotify(userId: string, onNew: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  let channel: RealtimeChannel | null = client
    .channel(`notify-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => onNew(),
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => onNew())
    .subscribe((status) => {
      live = status === 'SUBSCRIBED';
      // Bağlantı yeniden kurulunca arada kaçmış bir şey olabilir: bir kez bakılır
      if (live) onNew();
    });
  return () => {
    live = false;
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}
