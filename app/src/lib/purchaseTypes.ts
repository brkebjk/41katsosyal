// Satın alma ekranının kullandığı ortak tipler (telefon ve web sürümü aynı tipleri kullanır).

/** Mağazadan gelen satın alınabilir bir paket (ör. "Aylık"). `handle` mağaza kitaplığına aittir, ekran ona dokunmaz. */
export type StorePackage = {
  id: string;
  title: string;
  /** Mağazanın yerel para birimiyle yazdığı fiyat, ör. "₺99,99" */
  priceText: string;
  /** "ay", "yıl" gibi */
  per: string;
  handle: unknown;
};

export type PurchaseOutcome =
  | { status: 'done' }
  /** Mağaza ödemeyi aldı ama abonelik henüz hesaba işlenemedi (internet sorunu vb.) */
  | { status: 'pending'; message: string }
  | { status: 'cancelled' }
  | { status: 'none'; message: string }
  | { status: 'error'; message: string };
