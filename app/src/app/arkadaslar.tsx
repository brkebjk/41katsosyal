import { router } from 'expo-router';
import { useState } from 'react';

import { FriendsBody } from '@/components/FriendsSheet';
import { Screen } from '@/components/Screen';

/** Arkadaşlar ekranı (bildirimlerden açılır). Profil ve akışta aynı içerik açılır pencerede görünür. */
export default function FriendsScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Screen
      title="Arkadaşlar"
      subtitle="Arkadaşlar birbirinin gerçek adını görür"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => setRefreshKey((k) => k + 1)}
    >
      <FriendsBody refreshKey={refreshKey} />
    </Screen>
  );
}
