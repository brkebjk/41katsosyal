// Etkinlik hakkı göstergesine (mor petek) dokununca ne olacağı: Profil ve Etkinlikler ekranı aynı davranır.

import { router } from 'expo-router';

import { notify, showDialog } from '@/lib/dialog';
import type { Quota } from '@/lib/events';

/**
 * Moderatör ve mekân: yalnızca bilgi. Lider: hak durumu. Başvurusu bekleyen: bilgi. Abone: doğrudan lider
 * başvurusu ('leader' döner). Diğer üyeler: Abone ol / Etkinlik lideri başvurusu seçimi.
 */
export async function eventGaugeAction(quota: Quota | null, subscribed: boolean): Promise<'leader' | null> {
  if (!quota) return null;
  if (quota.is_moderator || quota.is_sponsor) {
    await notify('Etkinlik hakkın', 'Bu hesap istediği kadar etkinlik açabilir.', { icon: 'calendar' });
    return null;
  }
  const usage = `Bu ay ${quota.events_used}/${quota.events_limit ?? '∞'} etkinlik hakkını kullandın. Hakların her ayın başında yenilenir; kullanılmayan haklar sonraki aya geçmez. Seviye 3'teki üyeler ayda +1 etkinlik hakkı alır.`;
  if (quota.is_leader) {
    await notify('Etkinlik Liderisin', usage, { icon: 'ribbon', tone: 'success' });
    return null;
  }
  if (quota.leader_pending) {
    await notify('Başvurun inceleniyor', `${usage}\n\nEtkinlik lideri başvurun moderatörde; sonuçlanınca bildirim alırsın.`, {
      icon: 'hourglass',
    });
    return null;
  }
  if (subscribed) return 'leader';
  const choice = await showDialog<'subscribed' | 'leader' | null>({
    title: 'Daha çok etkinlik aç',
    message: `${usage} Hakkını artırmak için abone olabilir ya da etkinlik lideri olmak için başvurabilirsin.`,
    icon: 'calendar',
    buttons: [
      { label: 'Abone ol', value: 'subscribed', style: 'primary' },
      { label: 'Etkinlik lideri başvurusu', value: 'leader', style: 'ghost' },
      { label: 'Vazgeç', value: null, style: 'ghost' },
    ],
    cancelValue: null,
  });
  if (choice === 'subscribed') router.push('/abonelik');
  return choice === 'leader' ? 'leader' : null;
}
