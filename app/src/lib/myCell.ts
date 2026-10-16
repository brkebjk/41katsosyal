// Bulunduğum petek: konuma bir kez bakılır ve yalnızca bu oturumda telefonda tutulur (15 dakika geçerli).
// Harita “Konumum”, “Yakınımda” filtresi ve petek akışı bunu ortak kullanır; tam konum hiçbir yere kaydedilmez.

import { useSyncExternalStore } from 'react';

import { notify } from '@/lib/dialog';
import { cellOf, hexDistance, isLand, type Cell } from '@/lib/hex';
import { locationFailText, requestOneTimeLocation, type LocationPurpose } from '@/lib/map';

const VALID_MS = 15 * 60 * 1000;
/** Petek akışı: bulunduğum peteğe en çok kaç petek uzaklıktaki peteklerin akışı okunur/yazılır */
export const CELL_FEED_DISTANCE = 1;

let current: { cell: Cell; at: number } | null = null;
const listeners = new Set<() => void>();

function set(next: { cell: Cell; at: number } | null) {
  current = next;
  listeners.forEach((l) => l());
}

/** Geçerli (15 dakikadan yeni) konum peteği ya da boş. */
export function myCellNow(): Cell | null {
  return current && Date.now() - current.at < VALID_MS ? current.cell : null;
}

export function useMyCell(): Cell | null {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => null,
  );
  return snap ? snap.cell : null;
}

/**
 * Konuma bir kez bakar ve peteğe çevirir. `reuse` true ise 15 dakikadan yeni bir konum varsa yeniden sormaz.
 * Şehir haritalarının dışındaysa ya da konum alınamazsa açıklama gösterir ve boş döner.
 */
export async function locateMyCell(purpose: LocationPurpose, reuse = true, quiet = false): Promise<Cell | null> {
  if (reuse) {
    const c = myCellNow();
    if (c) return c;
  }
  const fix = await requestOneTimeLocation(purpose);
  if (!fix.ok) {
    if (fix.reason !== 'declined' && !quiet) {
      void notify('Konumun alınamadı', locationFailText(fix.reason) || 'Biraz sonra tekrar dene.', {
        icon: 'location',
      });
    }
    return null;
  }
  const c = cellOf(fix.lon, fix.lat);
  if (!isLand(c.q, c.r)) {
    if (!quiet)
      void notify('Harita dışındasın', 'Bulunduğun yer İstanbul, Kocaeli ve İzmir haritalarının dışında görünüyor.', { icon: 'map' });
    return null;
  }
  set({ cell: c, at: Date.now() });
  return c;
}

/** Bu peteğin akışını okuyup yazabilir miyim? (bulunduğum peteğe en çok 1 petek) */
export function nearCell(my: Cell | null, target: Cell): boolean {
  return my !== null && hexDistance(my, target) <= CELL_FEED_DISTANCE;
}
