// "Oyunda kalma" kuralının uygulama tarafı.
//
// Yan yana oynanan oyunlarda (Vampir–Köylü ve sonrakiler) kişi oyun ekranından menüye dönerse, uygulamayı
// kapatıp yeniden açarsa ya da uzun süre bağlantısı kesilirse oyundan çıkarılır. Sunucu bunu zaten kendisi de
// uygular (oyun ekranı birkaç saniyede bir "buradayım" der; 45 sn gelmezse kişi çıkarılır). Bu dosya
// uygulamanın "menüye döndüm / uygulama yeni açıldı" anında bunu hemen yapan kısmıdır.

import { notify } from '@/lib/dialog';
import { leaveAllRooms, type LeftRoom } from '@/lib/rooms';

let inflight: Promise<void> | null = null;

function describe(l: LeftRoom): string {
  if (l.result === 'closed') return `${l.game}: Oda sahibiydin; ayrıldığın için oda herkes için kapandı.`;
  if (l.result === 'eliminated') {
    return `${l.game}: Oyun başlamıştı; ayrıldığın için oyundan çıkarıldın ve geri dönemezsin.`;
  }
  return `${l.game}: Bekleme odasından çıkarıldın. İstersen kodu tekrar girerek katılabilirsin.`;
}

/**
 * Kişiyi içinde olduğu bütün yan yana oyunlardan çıkarır; çıkarıldıysa bir uyarı penceresi açar.
 * Aynı anda birden çok çağrı gelirse tek istek yapılır. Dönen söz, sunucu cevap verince tamamlanır
 * (uyarı penceresinin kapanması beklenmez); oda açma ve odaya katılma bunu bekler.
 */
export function leaveLiveGames(): Promise<void> {
  if (!inflight) {
    inflight = (async () => {
      const res = await leaveAllRooms();
      if (res.left.length > 0) {
        void notify('Oyundan ayrıldın', res.left.map(describe).join('\n\n'), {
          icon: 'exit-outline',
          tone: 'danger',
        });
      }
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
