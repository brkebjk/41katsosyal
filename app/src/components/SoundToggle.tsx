import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { initSounds, onSoundChange, setSoundOn, soundOn } from '@/lib/sounds';
import { colors } from '@/theme';

/**
 * Oyun seslerini aç / kapat (bu telefonda hatırlanır). YALNIZCA efekt seslerini keser: mikrofon ve sesli sohbet
 * (konuşma, ses mesajı) bu düğmeden etkilenmez.
 */
export function SoundToggle({ color, size = 18 }: { color?: string; size?: number }) {
  const [on, setOn] = useState(soundOn);
  useEffect(() => {
    void initSounds().then(() => setOn(soundOn()));
    return onSoundChange(setOn);
  }, []);
  return (
    <Pressable
      onPress={() => setSoundOn(!on)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Oyun seslerini kapat' : 'Oyun seslerini aç'}
      testID="sound-toggle"
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Ionicons
        name={on ? 'volume-high' : 'volume-mute'}
        size={size}
        color={on ? (color ?? colors.highlight) : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
