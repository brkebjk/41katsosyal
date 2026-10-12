import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat/800ExtraBold';
import { Montserrat_900Black } from '@expo-google-fonts/montserrat/900Black';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogHost } from '@/components/DialogHost';
import { FullScreenState } from '@/components/FullScreenState';
import { PermissionOnboarding } from '@/components/PermissionOnboarding';
import { RecoveryPhraseSetup } from '@/components/RecoveryPhraseSetup';
import { TopToastHost } from '@/components/TopToastHost';
import { AuthProvider, useAuth } from '@/lib/auth';
import { leaveLiveGames } from '@/lib/presence';
import { colors } from '@/theme';

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
      <StatusBar style="light" />
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

  // Uygulama (yeniden) açılınca: içinde olduğu yan yana oyunlardan çıkarılır. Oyun sırasında uygulamayı
  // kapatıp açmak oyundan ayrılmak sayılır.
  useEffect(() => {
    if (isLoggedIn) void leaveLiveGames();
  }, [isLoggedIn]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={isLoggedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="cekilis" />
          <Stack.Screen name="acik-odalar" />
          {/* Oyun sırasında kaydırarak geri dönülemez: ayrılmak için “Oyundan ayrıl” düğmesi kullanılır */}
          <Stack.Screen name="vampir" options={{ gestureEnabled: false }} />
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
    </View>
  );
}
