// Web sürümünde uygulama içi satın alma yoktur (mağaza satın almaları yalnızca telefonda çalışır).

import { syncSubscription } from '@/lib/subscriptionSync';
import type { PurchaseOutcome, StorePackage } from '@/lib/purchaseTypes';

export type { PurchaseOutcome, StorePackage } from '@/lib/purchaseTypes';

export const purchasesAvailable = false;

export async function startPurchases(_userId: string): Promise<void> {}

export async function stopPurchases(): Promise<void> {}

export async function loadPackages(): Promise<{ packages: StorePackage[]; error: string | null }> {
  return { packages: [], error: null };
}

export async function buyPackage(_pkg: StorePackage): Promise<PurchaseOutcome> {
  return { status: 'error', message: 'Satın alma yalnızca telefon uygulamasında yapılır.' };
}

export async function restorePurchases(): Promise<PurchaseOutcome> {
  return { status: 'error', message: 'Satın alma yalnızca telefon uygulamasında yapılır.' };
}

export { syncSubscription };
