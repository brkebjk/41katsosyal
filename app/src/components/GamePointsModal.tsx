import { useEffect, useState } from 'react';

import { InfoModal } from '@/components/InfoModal';
import { PointsTable } from '@/components/PointsTable';
import { gamePointsInfo, pointsTable, type InfoItem } from '@/lib/gameInfo';
import { DEFAULT_RULES, getPointRules, type PointRules } from '@/lib/ranking';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Verilirse (oyunun bekleme odası) tablo odadaki bu kişi sayısıyla gösterilir; yoksa 8 kişilik örnek */
  players?: number;
  /** Oyuna özel ek satırlar */
  extra?: InfoItem[];
};

/** “Oyun puanı nasıl hesaplanır?” penceresi. Sayılar açılırken sunucu ayarlarından okunur. */
export function GamePointsModal({ visible, onClose, players, extra }: Props) {
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
  const info = gamePointsInfo(rules, players, extra);
  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      title={info.title}
      icon={info.icon}
      items={info.items}
      note={info.note}
      top={<PointsTable data={pointsTable(rules, players)} />}
    />
  );
}
