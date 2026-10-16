import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { joinRoom } from '@/lib/rooms';

/**
 * Davet bağlantısı: `peoplehere://kopekbaligi-katil?kod=XXXXX` açılınca uzaktan Köpekbalığı Kafesi odasına katılır ve oyun
 * ekranına geçer. Oda dolmuş, başlamış ya da kapanmışsa nedeni yazar.
 */
export default function SharkJoinLinkScreen() {
  const params = useLocalSearchParams<{ kod?: string }>();
  const code = typeof params.kod === 'string' ? params.kod.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    void joinRoom(code).then((res) => {
      if (res.roomId) router.replace({ pathname: '/kopekbaligi', params: { id: res.roomId } });
      else setError(res.error ?? 'Odaya katılınamadı.');
    });
  }, [code]);

  return (
    <Screen title="Köpekbalığı Kafesi" subtitle="Davet" onBack={() => router.replace('/games')} backLabel="Oyunlar">
      <Text style={styles.text}>
        {!code ? 'Davet bağlantısında oda kodu yok.' : error ? error : `${code} kodlu odaya katılıyorsun…`}
      </Text>
      {error || !code ? <PrimaryButton label="Oyunlara dön" onPress={() => router.replace('/games')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
