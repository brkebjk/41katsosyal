import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Keyboard, StyleSheet, View } from 'react-native';

const TAG = 'kat41-app-awake';
/** Bu kadar süre dokunulmazsa ekran kararır */
const DIM_AFTER_MS = 2 * 60 * 1000;
/** Kararmış ekranın koyuluğu (0 = hiç, 1 = siyah) */
const DIM_LEVEL = 0.6;

/**
 * Uygulama açıkken ekran hiç kapanmaz. Bir süre dokunulmazsa ekran kendiliğinden kararır (ekranın üstüne koyu bir
 * katman gelir); ilk dokunuş ekranı yeniden aydınlatır ve o dokunuş başka bir şeye basmaz. Klavye açıkken (yazı
 * yazarken) ekran kararmaz.
 */
export function AwakeDimmer({ active, children }: { active: boolean; children: ReactNode }) {
  const [dim] = useState(() => new Animated.Value(0));
  const [dimmed, setDimmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimmedRef = useRef(false);
  const keyboardOpen = useRef(false);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!active || keyboardOpen.current) return;
    timer.current = setTimeout(() => {
      dimmedRef.current = true;
      setDimmed(true);
      Animated.timing(dim, { toValue: DIM_LEVEL, duration: 900, useNativeDriver: true }).start();
    }, DIM_AFTER_MS);
  }, [active, dim]);

  /** Bir dokunuş oldu: kararmışsa aydınlat, sayacı baştan başlat */
  const poke = useCallback(() => {
    if (dimmedRef.current) {
      dimmedRef.current = false;
      setDimmed(false);
      Animated.timing(dim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
    schedule();
  }, [dim, schedule]);

  // Ekranın kapanmasını engelle (yalnızca giriş yapılmışken)
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(TAG).catch(() => {});
    };
  }, [active]);

  useEffect(() => {
    poke();
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
      poke();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
      poke();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') poke();
    });
    return () => {
      show.remove();
      hide.remove();
      app.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poke]);

  return (
    <View
      style={styles.flex}
      onStartShouldSetResponderCapture={() => {
        // Her dokunuşta çağrılır; dokunuşu engellemez (false döner)
        poke();
        return false;
      }}
    >
      {children}
      <Animated.View
        pointerEvents={dimmed ? 'auto' : 'none'}
        onStartShouldSetResponder={() => true}
        style={[styles.dim, { opacity: dim }]}
        accessibilityElementsHidden={!dimmed}
        importantForAccessibility={dimmed ? 'yes' : 'no-hide-descendants'}
        accessibilityLabel="Ekran karartıldı. Aydınlatmak için dokun."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
    elevation: 1000,
  },
});
