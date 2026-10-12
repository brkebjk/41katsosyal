// “Sıralama ve ünvanlar nasıl çalışır?” penceresinin metni. Sayılar sunucu ayarlarından (`PointRules`) gelir.

import type { InfoContent } from '@/lib/gameInfo';
import type { PointRules } from '@/lib/ranking';

export function rankingInfoContent(rules: PointRules, weekly: boolean): InfoContent {
  const items: InfoContent['items'] = [];
  if (weekly) {
    items.push({
      icon: 'refresh-circle',
      lead: 'Tablo haftada bir güncellenir.',
      text: 'Her pazartesi 00:00’da (ayın 1’inde de) sıralama yenilenir. Puanların ise hemen hesabına yazılır; tabloda bir sonraki güncellemede görünür.',
    });
  } else {
    items.push({
      icon: 'refresh-circle',
      lead: 'Tablo anında güncellenir.',
      text: 'Puanların hesabına yazıldığı gibi sıralamaya da yansır.',
    });
  }
  items.push({
    icon: 'calendar',
    lead: 'Her ay sıfırlanır.',
    text: 'Ayın 1’inde tüm tablolar sıfırdan başlar. “Geçen ay” sekmesinde kesinleşmiş sonuçları görürsün; o tablo artık değişmez.',
  });
  if (rules.titlesEnabled > 0) {
    items.push(
      {
        icon: 'ribbon',
        lead: 'Oyun şampiyonu ünvanı.',
        text: `Her oyunda ayı 1. bitiren, sonraki ay boyunca “Tabu Şampiyonu” gibi o oyuna özel bir ünvan taşır. Ünvan için o oyundan o ay puan getiren en az ${rules.titleMinPlays} oyun oynamış olmak gerekir. Puan eşitse önce daha çok kazanan, sonra puana daha erken ulaşan alır.`,
      },
      {
        icon: 'eye',
        lead: 'Nerede görünür?',
        text: 'Gerçek adının göründüğü yerlerde: sıralama, etkinlik sahibi ve yorumları, arkadaş listesi, açık odalar ve profilin. Akışta görünmez; rumuzun gizli kalır.',
      },
    );
  }
  return {
    title: 'Sıralama ve ünvanlar',
    icon: 'trophy',
    items,
    note:
      rules.titlesEnabled > 0
        ? 'Ünvan yalnızca görseldir; puan ya da hediye getirmez.'
        : 'Oyun şampiyonu ünvanları şu an kapalı.',
  };
}
