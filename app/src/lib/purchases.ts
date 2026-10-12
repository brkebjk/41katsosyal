// Uygulama içi satın alma (RevenueCat üzerinden App Store / Google Play).
//
// Anahtarlar `.env` dosyasından okunur. Anahtar yoksa ya da uygulama Expo Go içinde açıldıysa
// satın alma kapalı görünür ("yakında"); uygulamanın geri kalanı etkilenmez. Gerçek satın alma
// için uygulamanın bir "geliştirme sürümü" (development build) olarak derlenmesi gerekir.

import { Platform } from 'react-native';
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases';

import { syncSubscription } from '@/lib/subscriptionSync';
import type { PurchaseOutcome, StorePackage } from '@/lib/purchaseTypes';

export type { PurchaseOutcome, StorePackage } from '@/lib/purchaseTypes';

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

/** Bu telefonda satın alma anahtarı tanımlıysa true. */
export const purchasesAvailable = Boolean(apiKey);

let started = false;
let currentUser: string | null = null;

/** Giriş yapan üyeyi mağaza hesabıyla eşler. Hata verirse sessizce geçer. */
export async function startPurchases(userId: string): Promise<void> {
  if (!apiKey) return;
  try {
    if (!started) {
      Purchases.configure({ apiKey, appUserID: userId });
      started = true;
      currentUser = userId;
    } else if (currentUser !== userId) {
      await Purchases.logIn(userId);
      currentUser = userId;
    }
  } catch {
    /* satın alma kullanılamaz; uygulamanın geri kalanı çalışmaya devam eder */
  }
}

/** Çıkış yapınca mağaza hesabı eşlemesini bırakır. */
export async function stopPurchases(): Promise<void> {
  if (!started || currentUser === null) return;
  currentUser = null;
  try {
    await Purchases.logOut();
  } catch {
    /* zaten anonimse hata verir; önemli değil */
  }
}

const PACKAGE_TITLE: Partial<Record<PACKAGE_TYPE, { title: string; per: string }>> = {
  [PACKAGE_TYPE.WEEKLY]: { title: 'Haftalık', per: 'hafta' },
  [PACKAGE_TYPE.MONTHLY]: { title: 'Aylık', per: 'ay' },
  [PACKAGE_TYPE.TWO_MONTH]: { title: '2 aylık', per: '2 ay' },
  [PACKAGE_TYPE.THREE_MONTH]: { title: '3 aylık', per: '3 ay' },
  [PACKAGE_TYPE.SIX_MONTH]: { title: '6 aylık', per: '6 ay' },
  [PACKAGE_TYPE.ANNUAL]: { title: 'Yıllık', per: 'yıl' },
  [PACKAGE_TYPE.LIFETIME]: { title: 'Süresiz', per: 'tek sefer' },
};

function toStorePackage(p: PurchasesPackage): StorePackage {
  const known = PACKAGE_TITLE[p.packageType];
  return {
    id: p.identifier,
    title: known?.title ?? p.product.title,
    priceText: p.product.priceString,
    per: known?.per ?? '',
    handle: p,
  };
}

/** Mağazadaki güncel paketler ve fiyatlar. Fiyatı mağaza panelinden belirlersin; uygulama onu okur. */
export async function loadPackages(): Promise<{ packages: StorePackage[]; error: string | null }> {
  if (!apiKey || !started) return { packages: [], error: null };
  try {
    const offerings = await Purchases.getOfferings();
    const list = offerings.current?.availablePackages ?? [];
    if (list.length === 0)
      return { packages: [], error: 'Şu an satın alınabilir bir paket yok. Biraz sonra tekrar dene.' };
    return { packages: list.map(toStorePackage), error: null };
  } catch {
    return { packages: [], error: 'Fiyatlar yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.' };
  }
}

const PENDING_TEXT =
  'Ödemen alındı. Aboneliğin birkaç dakika içinde hesabına işlenecek. İşlenmezse “Satın alımları geri yükle”ye dokun.';

/** Aboneliği mağazada satın alır, sonra sunucuya işletir. */
export async function buyPackage(pkg: StorePackage): Promise<PurchaseOutcome> {
  if (!apiKey || !started) return { status: 'error', message: 'Satın alma şu an kullanılamıyor.' };
  try {
    await Purchases.purchasePackage(pkg.handle as PurchasesPackage);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return { status: 'cancelled' };
    return {
      status: 'error',
      message: 'Satın alma tamamlanamadı. Ücret alındıysa “Satın alımları geri yükle”ye dokun.',
    };
  }
  let sync = await syncSubscription();
  if (!sync.storeActive) {
    // Mağaza bilgisi sunucuya birkaç saniye geç ulaşabilir; bir kez daha dene.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    sync = await syncSubscription();
  }
  return sync.ok && sync.storeActive ? { status: 'done' } : { status: 'pending', message: PENDING_TEXT };
}

/** Aynı mağaza hesabıyla daha önce alınmış aboneliği bu hesaba geri yükler. */
export async function restorePurchases(): Promise<PurchaseOutcome> {
  if (!apiKey || !started) return { status: 'error', message: 'Satın alma şu an kullanılamıyor.' };
  try {
    await Purchases.restorePurchases();
  } catch {
    return {
      status: 'error',
      message: 'Geri yükleme yapılamadı. İnternet bağlantını kontrol edip tekrar dene.',
    };
  }
  const sync = await syncSubscription();
  if (!sync.ok) return { status: 'error', message: 'Geri yükleme yapılamadı. Biraz sonra tekrar dene.' };
  return sync.storeActive
    ? { status: 'done' }
    : { status: 'none', message: 'Bu mağaza hesabına bağlı etkin bir abonelik bulunamadı.' };
}

export { syncSubscription };
