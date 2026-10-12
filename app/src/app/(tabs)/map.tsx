import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Eski adres. Harita artık uygulamanın ilk ekranıdır (sekmenin dosyası `index.tsx`). Bu dosya yalnızca eski
 * “/map” bağlantıları bozulmasın diye durur; sekme çubuğunda görünmez.
 */
export default function OldMapRoute() {
  const params = useLocalSearchParams<{ q?: string; r?: string; t?: string }>();
  return <Redirect href={{ pathname: '/', params }} />;
}
