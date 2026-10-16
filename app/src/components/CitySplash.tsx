import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { takeSplashTurn, useLook } from '@/lib/look';
import { supabase } from '@/lib/supabase';

/** Görsel bu kadar ekranda kalır (dokununca hemen kapanır) */
const SHOW_MS = 1800;
const FADE_MS = 400;

/**
 * Şehir açılış görseli (yönetim panelinden): uygulama açılınca şehrin görseli kısa bir süre tam ekran görünür ve
 * yavaşça kaybolur. Dokununca hemen kapanır. Uygulama her açılışta bir kez gösterir.
 */
export function CitySplash() {
  const { splash } = useLook();
  const [shownUri, setShownUri] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));

  const uri = splash && supabase ? supabase.storage.from('app-look').getPublicUrl(splash).data.publicUrl : null;
  // Görsel ilk geldiğinde (bu açılışta bir kez) gösterilmeye başlanır
  useEffect(() => {
    if (!uri || !takeSplashTurn()) return;
    const t = setTimeout(() => setShownUri(uri), 0);
    return () => clearTimeout(t);
  }, [uri]);

  useEffect(() => {
    if (!shownUri) return;
    Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
    const t = setTimeout(
      () => Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setGone(true)),
      SHOW_MS,
    );
    return () => clearTimeout(t);
  }, [shownUri, fade]);

  function close() {
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setGone(true));
  }

  if (!shownUri || gone) return null;
  return (
    <Animated.View style={[styles.cover, { opacity: fade }]} testID="city-splash">
      <Pressable style={styles.fill} onPress={close} accessibilityRole="button" accessibilityLabel="Açılış görselini kapat">
        <Image source={{ uri: shownUri }} contentFit="cover" style={styles.fill} transition={150} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 120, elevation: 120, backgroundColor: '#05101C' },
  fill: { flex: 1, width: '100%', height: '100%' },
});
