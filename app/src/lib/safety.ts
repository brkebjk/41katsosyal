// Yüz yüze buluşma güvenliği: katılmadan / kod girmeden önce gösterilen uyarı ve acil durum (112) araması.

import { Linking } from 'react-native';

import { confirmAction, notify, showDialog } from '@/lib/dialog';

const TIPS =
  '• Tanımadığın kişilerle kalabalık, herkese açık ve aydınlık yerlerde buluş.\n' +
  '• Nereye ve kiminle gittiğini bir yakınına haber ver.\n' +
  '• Kişisel bilgilerini (ev adresi, okul/iş yeri, banka bilgisi) paylaşma; kimseye para gönderme.\n' +
  '• Kendi ulaşımını kendin ayarla, içkini ve eşyanı gözünün önünden ayırma.\n' +
  '• Rahatsız olursan hemen ayrıl; tehlike anında 112’yi ara ve kişiyi uygulamadan bildir.';

const DISCLAIMER =
  '41. Kat Sosyal yalnızca üyeleri bir araya getiren bir platformdur. Etkinliklerde ve oyunlarda üyeler arasında ' +
  'yaşanabilecek bireysel etkileşimlerden, fiziksel buluşmalarda doğabilecek olaylardan, kayıp, zarar ve ' +
  'anlaşmazlıklardan 41. Kat Sosyal sorumlu değildir. Katılım tamamen kendi sorumluluğundadır.';

/**
 * Bir etkinliğe katılmadan ya da herhangi bir katılım kodu (oyun odası, etkinlik) girmeden önce gösterilir.
 * Kullanıcı “Anladım, devam et” derse true döner.
 */
export function confirmMeetupSafety(kind: 'event' | 'game'): Promise<boolean> {
  return showDialog<boolean>({
    title: kind === 'event' ? 'Etkinliğe katılmadan önce' : 'Oyuna katılmadan önce',
    message: `Tanımadığın insanlarla buluşurken dikkat et:\n\n${TIPS}`,
    warning: DISCLAIMER,
    icon: 'shield-checkmark',
    buttons: [
      { label: 'Anladım, devam et', value: true, style: 'primary' },
      { label: 'Vazgeç', value: false, style: 'ghost' },
    ],
    cancelValue: false,
  });
}

/** Önce sorar, onaylanırsa telefonun arama ekranında 112'yi açar. */
export async function callEmergency(): Promise<void> {
  const ok = await confirmAction(
    'Kolluk kuvvetlerini ara',
    '112 Acil Çağrı Merkezi aranacak. Gerçek bir tehlike ya da acil durum varsa devam et.',
    '112’yi ara',
    true,
  );
  if (!ok) return;
  try {
    await Linking.openURL('tel:112');
  } catch {
    await notify('Arama açılamadı', 'Telefonundan 112’yi elle ara.', { tone: 'danger', icon: 'call' });
  }
}
