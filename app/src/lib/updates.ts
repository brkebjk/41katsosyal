// Uzaktan güncelleme (EAS Update): mağazadan yeniden indirmeye gerek kalmadan yeni sürüm telefona gelir.
//
//  - Uygulama açılırken ve uygulamaya her dönüşte (en çok 30 dakikada bir) yeni sürüm var mı diye bakılır.
//  - Yeni sürüm arka planda indirilir; inince “Yeni sürüm hazır” penceresi çıkar. “Şimdi yenile” uygulamayı yeniden
//    başlatır; “Sonra” derse bir sonraki açılışta yeni sürüm kendiliğinden açılır.
//  - Expo Go'da ve geliştirme sırasında güncelleme kapalıdır (hiçbir şey yapılmaz).

import { AppState } from 'react-native';

import { confirmAction } from '@/lib/dialog';

const CHECK_EVERY_MS = 30 * 60_000;

type UpdatesModule = typeof import('expo-updates');
/** Güncelleme modülü ilk kullanımda yüklenir; yüklenemezse (ör. eski Expo Go) güncelleme hiç denenmez */
let mod: UpdatesModule | null | undefined;
async function updatesModule(): Promise<UpdatesModule | null> {
  if (mod !== undefined) return mod;
  try {
    mod = await import('expo-updates');
  } catch {
    mod = null;
  }
  return mod;
}

let lastCheck = 0;
let busy = false;
let asked = false;

async function check(): Promise<void> {
  if (busy || asked) return;
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  busy = true;
  try {
    const Updates = await updatesModule();
    if (!Updates || !Updates.isEnabled) return;
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) return;
    const got = await Updates.fetchUpdateAsync();
    if (!got.isNew) return;
    asked = true;
    const now = await confirmAction(
      'Yeni sürüm hazır',
      'PeopleHere güncellendi. Yeni sürümü açmak için uygulama birkaç saniyeliğine yeniden başlar.',
      'Şimdi yenile',
    );
    if (now) await Updates.reloadAsync();
  } catch {
    // Ağ yoksa ya da güncelleme sunucusuna ulaşılamazsa sessizce geçilir; sonraki açılışta yeniden denenir
  } finally {
    busy = false;
  }
}

/** Açılışta ve uygulamaya dönünce güncelleme denetimini başlatır */
export function watchUpdates(): () => void {
  void check();
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void check();
  });
  return () => sub.remove();
}
