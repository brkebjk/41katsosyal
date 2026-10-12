import { useEffect, useState } from 'react';

import { InfoModal } from '@/components/InfoModal';
import { eventInfoContent } from '@/lib/eventInfo';
import { DEFAULT_RULES, getPointRules, type PointRules } from '@/lib/ranking';

type Props = { visible: boolean; onClose: () => void };

/** Etkinlik sayfasındaki “Etkinlik puanları nasıl çalışır?” penceresi. Sayılar sunucu ayarlarından okunur. */
export function EventPointsModal({ visible, onClose }: Props) {
  const [rules, setRules] = useState<PointRules>(DEFAULT_RULES);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void getPointRules().then((r) => {
      if (active) setRules(r);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const info = eventInfoContent(rules);
  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      title={info.title}
      icon={info.icon}
      items={info.items}
      note={info.note}
    />
  );
}
