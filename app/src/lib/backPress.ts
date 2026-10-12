// Android geri tuşu / geri kaydırma hareketi: açık bir pencere (panel, alt panel, petek menüsü) varken önce o kapanır.
// En son açılan pencere önce kapanır (React Native en son eklenen dinleyiciyi önce çağırır). Başlamış oyun ekranları
// bunu kullanmaz; oralarda geri tuşu oyundan çıkmayı soran kendi kuralını uygular.

import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export function useBackClose(active: boolean, onClose: () => void): void {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
