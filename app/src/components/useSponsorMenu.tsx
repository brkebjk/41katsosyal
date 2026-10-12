import { useState, type ReactNode } from 'react';

import { VenueSheet } from '@/components/VenueSheet';

/**
 * Sponsor (mekân) hesabın adına ya da resmine dokununca mekân profilini doğrudan açar (ara menü yoktur).
 * Dönen `nodes` ekranın kaydırılan içeriğine DEĞİL, üst katmanına (Screen `overlay`) ya da pencerenin en altına konur;
 * kapsayıcının `flex: 1` olması gerekir.
 */
export function useSponsorMenu(isModerator: boolean): {
  /** Sponsor adına dokunuldu: mekân profilini açar */
  open: (sponsorId: string, name?: string) => void;
  /** Doğrudan mekân profilini açar */
  openVenue: (venueId: string) => void;
  /** Mekân profili açık mı? (ekranın üst katmanına konup konmayacağına karar vermek için) */
  isOpen: boolean;
  nodes: ReactNode;
} {
  const [venueId, setVenueId] = useState<string | null>(null);

  const nodes = venueId ? (
    <VenueSheet venueId={venueId} isModerator={isModerator} onClose={() => setVenueId(null)} />
  ) : null;

  return { open: (id) => setVenueId(id), openVenue: setVenueId, isOpen: venueId !== null, nodes };
}
