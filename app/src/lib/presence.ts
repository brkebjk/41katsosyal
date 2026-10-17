// "Oyunda kalma" kuralının uygulama tarafı.
//
// Oyun ekranından menüye dönen kişi oyundan çıkarılır. Uygulamayı kapatıp yeniden açan kişi:
//   * uzaktan oyundaysa oyundan çıkarılır,
//   * yan yana oyundaysa odaya geri döner ve "oyunu terk etmek ister misin?" diye sorulur.
// Sunucu bunu kendisi de uygular: oyun ekranı birkaç saniyede bir "buradayım" der; işaret uzaktan oyunda 45 sn,
// yan yana oyunda 5 dk gelmezse kişi çıkarılır. Bu dosya uygulamanın "menüye döndüm / uygulama yeni açıldı" kısmıdır.

import { router } from 'expo-router';

import { notify, showDialog } from '@/lib/dialog';
import { leaveAllRooms, leaveRoom, mySideRoom, type LeftRoom } from '@/lib/rooms';

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

const GAME_SCREEN: Record<string, '/vampir' | '/kopekbaligi' | '/okey'> = {
  vampire_villager: '/vampir',
  shark_cage: '/kopekbaligi',
  okey: '/okey',
  okey101: '/okey',
};

/**
 * Uygulama açılınca: uzaktan oyunlardan çıkılır; yan yana oyundaysa odaya geri dönülür ve sorulur.
 * "Oyunu terk et" denirse oyundan çıkılır (oyun başlamışsa elenir), menüye dönülür.
 */
export async function resumeOnStart(): Promise<void> {
  const res = await leaveAllRooms(true);
  if (res.left.length > 0) {
    void notify('Oyundan ayrıldın', res.left.map(describe).join('\n\n'), { icon: 'exit-outline', tone: 'danger' });
  }
  const room = await mySideRoom();
  const path = room ? GAME_SCREEN[room.game_type] : undefined;
  if (!room || !path) return;
  try {
    router.push({ pathname: path, params: { id: room.id } });
  } catch {
    return; // gezinme henüz hazır değilse oyuncu odaya Oyunlar'dan döner
  }
  const leave = await showDialog<boolean>({
    title: 'Oyuna geri döndün',
    message:
      room.status === 'playing'
        ? 'Uygulama kapanmadan önce yan yana bir oyundaydın, kaldığın yerden devam ediyorsun. Oyunu terk edersen elenirsin ve geri dönemezsin.'
        : 'Uygulama kapanmadan önce yan yana bir oyunun bekleme odasındaydın. Odadan çıkmak ister misin?',
    icon: 'game-controller',
    buttons: [
      { label: 'Oyunda kal', value: false, style: 'primary' },
      { label: room.status === 'playing' ? 'Oyunu terk et' : 'Odadan çık', value: true, style: 'danger' },
    ],
    cancelValue: false,
  });
  if (!leave) return;
  await leaveRoom(room.id);
  router.replace('/games');
}
