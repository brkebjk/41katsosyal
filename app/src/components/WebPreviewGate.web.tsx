// GEÇİCİ (web önizleme): uygulamanın web hâli yalnızca geliştirme sırasında moderatörlerin ekranları görmesi içindir.
// Web'de kayıt kapalıdır; moderatör olmayan hesap giriş yaparsa oturumu hemen kapatılır.
// Markete çıkarken: bu dosya, WebPreviewGate.tsx, app/src/app/_layout.tsx'teki <WebPreviewGate /> satırı ve
// .github/workflows/web-onizleme.yml silinir.

import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { FullScreenState } from '@/components/FullScreenState';
import { useAuth } from '@/lib/auth';

const NOT_ADMIN =
  'Web sürümü yalnızca geliştirme içindir ve sadece moderatör hesaplarıyla açılır. Uygulamayı telefonundan kullanabilirsin.';
const NO_SIGNUP = 'Web sürümünde kayıt kapalıdır. Hesap açmak için uygulamayı telefonundan kullan.';

export function WebPreviewGate() {
  const { isLoggedIn, profile, signOut } = useAuth();
  const pathname = usePathname();
  const [blocked, setBlocked] = useState(false);

  const notAdmin = isLoggedIn && !!profile && profile.role !== 'admin';
  useEffect(() => {
    if (!notAdmin) return;
    void signOut().then(() => setBlocked(true));
  }, [notAdmin, signOut]);

  if (blocked || notAdmin) {
    return <FullScreenState message={NOT_ADMIN} actions={[{ label: 'Tamam', onPress: () => setBlocked(false) }]} />;
  }
  if (!isLoggedIn && pathname === '/kayit') {
    return <FullScreenState message={NO_SIGNUP} actions={[{ label: 'Girişe dön', onPress: () => router.replace('/giris') }]} />;
  }
  return null;
}
