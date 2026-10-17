import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat/800ExtraBold';
import { Montserrat_900Black } from '@expo-google-fonts/montserrat/900Black';
import { useFonts } from 'expo-font';
import { Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AwakeDimmer } from '@/components/AwakeDimmer';
import { CityGate } from '@/components/CityGate';
import { DialogHost } from '@/components/DialogHost';
import { FullScreenState } from '@/components/FullScreenState';
import { PermissionOnboarding } from '@/components/PermissionOnboarding';
import { RecoveryPhraseSetup } from '@/components/RecoveryPhraseSetup';
import { TextEditHost } from '@/components/TextEditHost';
import { TopToastHost } from '@/components/TopToastHost';
import { WebPreviewGate } from '@/components/WebPreviewGate';
import { AuthProvider, useAuth } from '@/lib/auth';
import { loadCity, resetCity, setCityAdmin, useCity } from '@/lib/city';
import { installCrashReporting, reportError, setCrashScreen } from '@/lib/crash';
import { usePermissionsDone } from '@/lib/onboarding';
import { resumeOnStart } from '@/lib/presence';
import { colors, isLight } from '@/theme';

// Çökme takibi: yakalanmamış hatalar (yalnızca hatanın yeri) sunucuya bildirilir
installCrashReporting();

/** Bir ekran çizilirken hata olursa: uygulama kapanmaz, hata bildirilir ve tekrar denenebilir */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, true);
  }, [error]);
  return (
    <FullScreenState
      message="Bir şeyler ters gitti. Hatanın yeri bize iletildi; tekrar deneyebilirsin."
      actions={[{ label: 'Tekrar dene', onPress: () => void retry() }]}
    />
  );
}

export default function RootLayout() {
  // Marka yazı tipi yüklenirken kısa bir bekleme; yüklenemese bile uygulama açılır.
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_600SemiBold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Giriş yapılmamışsa sadece (auth) grubu, yapılmışsa sadece (tabs) grubu açılabilir.
 * Durum değişince uygulama kendiliğinden doğru ekrana geçer.
 */
function RootNavigator() {
  const { loading, isLoggedIn, profile, profileError, retryProfile, signOut, account, refreshAccount } = useAuth();
  // Hata olursa hangi ekranda olduğu bilinsin (yalnızca ekran adı)
  const pathname = usePathname();
  useEffect(() => {
    setCrashScreen(pathname);
  }, [pathname]);

  // Uygulama (yeniden) açılınca: uzaktan oyundan çıkarılır; yan yana oyundaysa odaya geri döner ve sorulur.
  useEffect(() => {
    if (isLoggedIn) void resumeOnStart();
  }, [isLoggedIn]);

  // Şehir: girişten sonra okunur; seçilmemişse şehir seçme ekranı açılır
  const city = useCity();
  // İlk giriş sırası: izin ekranları → şehir seçimi → uygulama eğitimi
  const permissionsDone = usePermissionsDone();
  const ready = isLoggedIn && !loading && account && !account.needs_recovery && permissionsDone;
  useEffect(() => {
    if (isLoggedIn && profile?.id) void loadCity();
    else resetCity();
  }, [isLoggedIn, profile?.id]);
  // Moderatör her şehirde her şeyi yapabilir
  useEffect(() => {
    setCityAdmin(isLoggedIn && profile?.role === 'admin');
  }, [isLoggedIn, profile?.role, profile?.id]);

  return (
    // Uygulama açıkken ekran kapanmaz; dokunulmayınca kararır
    <AwakeDimmer active={isLoggedIn && !loading}>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={isLoggedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="cekilis" />
          <Stack.Screen name="acik-odalar" />
          {/* Oyun sırasında kaydırarak geri dönülemez: ayrılmak için “Oyundan ayrıl” düğmesi kullanılır */}
          <Stack.Screen name="vampir" options={{ gestureEnabled: false }} />
          <Stack.Screen name="kopekbaligi" options={{ gestureEnabled: false }} />
          <Stack.Screen name="kopekbaligi-giris" />
          <Stack.Screen name="vampir-giris" />
          <Stack.Screen name="kopekbaligi-rehber" />
          <Stack.Screen name="kopekbaligi-ara" />
          <Stack.Screen name="kopekbaligi-katil" />
          <Stack.Screen name="okey" options={{ gestureEnabled: false }} />
          <Stack.Screen name="okey-giris" />
          <Stack.Screen name="okey-ara" />
          <Stack.Screen name="abonelik" />
          <Stack.Screen name="basarimlar" />
          <Stack.Screen name="balonlar" />
          <Stack.Screen name="kurallar" />
          <Stack.Screen name="ayricaliklar" />
          <Stack.Screen name="arkadaslar" />
          <Stack.Screen name="moderator" />
          <Stack.Screen name="siralama" />
          <Stack.Screen name="oduller" />
          <Stack.Screen name="hazine" />
          <Stack.Screen name="davet" />
          <Stack.Screen name="verilerim" />
          <Stack.Screen name="sehir" />
          {/* Bilgi Yarışması: başlangıçta kapalı; ekran, hiçbir moda girilmemişken kaydırarak geri dönmeyi kendisi açar */}
          <Stack.Screen name="bilgi" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!isLoggedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Sözleşme, KVKK ve iletişim metinleri giriş yapmadan da açılır */}
        <Stack.Screen name="belge" />
      </Stack>

      {/* Kayıttan sonra (ya da kurulmamışsa ilk girişte) kurtarma kelimeleri zorunlu olarak gösterilir */}
      {isLoggedIn && !loading && account?.needs_recovery ? (
        <RecoveryPhraseSetup mode="setup" onDone={() => void refreshAccount()} />
      ) : null}

      {/* Kurtarma kelimelerinden sonra, bu telefonda ilk girişte bir kez: bildirim türleri ve izinler */}
      {isLoggedIn && !loading && account && !account.needs_recovery && profile?.id ? (
        <PermissionOnboarding key={profile.id} userId={profile.id} />
      ) : null}

      {/* Kurtarma kelimelerinden sonra: şehir seçilmemişse şehir seçimi (bir kez; sonra yalnızca göçle değişir) */}
      {/* Bekleyen üye bir şehrin haritasına bakarken açılmaz (uygulama yeniden açılınca konuma yeniden bakılır) */}
      {ready && city.loaded && !city.my && !(city.waiting && city.visiting) ? <CityGate /> : null}

      {/* Şehir seçildikten sonra bir kez: uygulama eğitimi (sekmelerin içinde çizilir, bkz. (tabs)/_layout) */}

      {/* Üstten kayan bildirim (uygulama açıkken yeni bildirim/duyuru gelince) */}
      {isLoggedIn && !loading ? <TopToastHost /> : null}

      {loading ? <FullScreenState busy /> : null}
      {!loading && profileError ? (
        <FullScreenState
          message={profileError}
          actions={[
            { label: 'Tekrar dene', onPress: retryProfile },
            { label: 'Çıkış yap', onPress: () => void signOut(), variant: 'ghost' },
          ]}
        />
      ) : null}

      <DialogHost />
      {/* GEÇİCİ: moderatörün yazı düzenleme penceresi (yazı düzeltmeleri de buradan yüklenir) */}
      <TextEditHost />
      {/* GEÇİCİ: web önizleme yalnızca moderatörlere açık (telefonda hiçbir şey yapmaz) */}
      <WebPreviewGate />
    </View>
    </AwakeDimmer>
  );
}
