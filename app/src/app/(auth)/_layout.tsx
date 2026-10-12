import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  // Giriş yapılmamışken uygulama her zaman giriş ekranıyla başlasın
  anchor: 'giris',
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
