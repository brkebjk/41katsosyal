import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, type LayoutChangeEvent, type ViewProps } from 'react-native';

import { clearTourRect, reportTourRect, useActiveTourId } from '@/lib/tour';

type Props = ViewProps & { tourId: string };

/**
 * Uygulama eğitiminde anlatılacak alan. Sıradan bir View gibi davranır (aynı stil ve özellikler); eğitim bu alanı
 * anlatırken alan ekrandaki yerini ölçüp bildirir.
 */
export const TourTarget = forwardRef<View, Props>(function TourTarget({ tourId, onLayout, ...rest }, outer) {
  const ref = useRef<View>(null);
  useImperativeHandle(outer, () => ref.current as View);
  const active = useActiveTourId() === tourId;

  const measure = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) reportTourRect(tourId, { x, y, w, h });
    });
  };

  // Bu alan anlatılırken: ekran yerleşince birkaç kez ölçülür (sekme geçişi ve kaydırma bitsin)
  useEffect(() => {
    if (!active) return;
    const ts = [60, 300, 700].map((ms) => setTimeout(measure, ms));
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca alan anlatılmaya başlayınca
  }, [active]);

  useEffect(() => () => clearTourRect(tourId), [tourId]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={(e: LayoutChangeEvent) => {
        onLayout?.(e);
        if (active) measure();
      }}
      {...rest}
    />
  );
});
