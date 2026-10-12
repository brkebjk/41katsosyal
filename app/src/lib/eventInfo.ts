// Etkinlik puanlarını anlatan pencere metni. Sayılar sunucu ayarlarından (`PointRules`) gelir.

import type { InfoContent } from '@/lib/gameInfo';
import { attendTiersText, type PointRules } from '@/lib/ranking';

export function eventInfoContent(r: PointRules): InfoContent {
  const dailyRule =
    r.eventCategoryDaily > 0
      ? `Bir gün içinde aynı kategoriden en çok ${r.eventCategoryDaily} etkinlikten puan alırsın (gün gece yarısı değişir). Aynı gün aynı kategoriden başka bir etkinliğe katılabilirsin ama ondan puan yazılmaz.`
      : null;
  const hostRule =
    r.eventHostDays > 0
      ? `Aynı kişinin açtığı etkinliklerden ${r.eventHostDays} günde bir puan alırsın. 41. Kat Özel etkinliklerde bu sınır yoktur.`
      : null;

  return {
    title: 'Etkinlik puanları nasıl çalışır?',
    icon: 'help-circle',
    items: [
      {
        icon: 'checkmark-circle',
        lead: `Katıl: +${r.eventAttend}–${r.eventAttend40}.`,
        text: `Kalabalık etkinlik daha çok puan: ${attendTiersText(r)}. 41. Kat Özel etkinliklerde her basamağa +${r.eventAttendOfficialBonus}. Puan için etkinlik yerinde, etkinliği açan kişinin verdiği kodu yazman gerekir; bulunduğun bölge de bir kez kontrol edilir. Sadece “Katıl”a basmak puan getirmez.`,
      },
      {
        icon: 'people',
        lead: `En az ${r.eventMinAttendees} kişi.`,
        text: `Puanlar, etkinlikte en az ${r.eventMinAttendees} kişinin katılımı doğrulanınca yazılır. Ondan önce “doğrulandı” görürsün ama puan 0 görünür; kişi sayısı tamamlanınca puan hesabına eklenir.`,
      },
      {
        icon: 'people-circle',
        lead: 'Ekipçe gel, daha çok kazan.',
        text: 'Etkinlikte “Ekip arıyorum”u açıp ekip kurabilirsin. Ekipten kodu doğrulayan kişi sayısına göre her üyenin katılım puanı artar: 2 kişi x1,25 · 4 kişi x1,5 · 8 kişi x2. Ekip etkinlik başlamadan kurulur, en çok 8 kişidir; puan yazılmayan katılıma bonus da yazılmaz.',
      },
      ...(dailyRule ? [{ icon: 'today' as const, lead: 'Günde bir kategori.', text: dailyRule }] : []),
      ...(hostRule ? [{ icon: 'person-circle' as const, lead: 'Aynı düzenleyen.', text: hostRule }] : []),
      {
        icon: 'calendar',
        lead: `Etkinlik aç: +${r.eventCreate}.`,
        text: `Ayda ${r.eventCreateMonthEvents} etkinlikten puan alınır. Etkinliğine gelen her doğrulanmış kişi için +${r.hostPerAttendee} (etkinlik başına en çok ${r.hostAttendeeCap} kişi, ayda en çok ${r.hostMonthCap} puan). Katılımcıya yukarıdaki kurallar yüzünden puan yazılmadıysa sana da yazılmaz.`,
      },
      {
        icon: 'time',
        lead: `${r.eventDurationHours} saatte kapanır.`,
        text: `Etkinlik başladıktan ${r.eventDurationHours} saat sonra kapanır ve listeden kalkar. Kod girişi başlangıçtan 5 dakika önce açılır, etkinlikle birlikte kapanır. Konser & Festival etkinlikleri başladıktan 2 saat sonra listeden kalkar; kod girişi başlangıçtan 45 dakika sonra kapanır.`,
      },
      {
        icon: 'shield-checkmark',
        lead: 'Adil oyun.',
        text: `Etkinliğe kodla katılan biri olduysa etkinliği açan kişi onu kendi kaldıramaz; moderatöre açıklamalı bir kapatma talebi gönderir. Moderatör onaylarsa etkinlik kapanır ve bu etkinlikten verilen puanlar geri alınır. Abonelik puanı artırmaz.${r.paidEvents ? '' : ' Ücretli etkinlikler puan getirmez.'}`,
      },
    ],
    note: 'Konum yalnızca kodu yazarken bir kez, yaklaşık bölge olarak alınır; kesin adresin kaydedilmez.',
  };
}
