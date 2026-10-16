import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TIPS } from '@/components/AppTour';
import { currentTab, onTabFocused } from '@/lib/tabReset';
import { setActiveTourId, useTourRect, useTourRunning } from '@/lib/tour';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const PAD = 6;
/** Sekme açıldıktan sonra ipucu bu kadar bekler (ekran yerleşsin) */
const SHOW_DELAY_MS = 900;

const seenKey = (userId: string) => `peoplehere_tips_v1_${userId}`;

function readSeen(userId: string): string[] {
  try {
    const v = SecureStore.getItem(seenKey(userId));
    const list = v ? (JSON.parse(v) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(userId: string, list: string[]): void {
  try {
    SecureStore.setItem(seenKey(userId), JSON.stringify(list));
  } catch {
    // kaydedilemezse ipucu bir sonraki açılışta yeniden çıkabilir
  }
}

/**
 * Sekme ipuçları: uygulama eğitimi bittikten sonra bir sekme ilk açıldığında, eğitimde anlatılmayan alanlar kısa kartla
 * gösterilir (alanın çevresinde ince çerçeve). Ekranı kilitlemez; “Anladım” ile sıradaki ipucuna geçilir. Her sekmenin
 * ipuçları bu telefonda bu üyeye bir kez gösterilir.
 */
export function TabTips({ userId, tabBarHeight }: { userId: string; tabBarHeight: number }) {
  const tourRunning = useTourRunning();
  const [tab, setTab] = useState<string | null>(() => currentTab());
  const [seen, setSeen] = useState<string[]>(() => readSeen(userId));
  /** İpucunun gösterilebileceği sekme (sekme açıldıktan biraz sonra) ve o sekmede kaçıncı ipucunda olunduğu */
  const [readyTab, setReadyTab] = useState<string | null>(null);
  const [pos, setPos] = useState<{ tab: string | null; i: number }>({ tab: null, i: 0 });
  const ready = readyTab !== null && readyTab === tab;
  const index = pos.tab === tab ? pos.i : 0;
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => onTabFocused((name) => setTab(name)), []);

  const tips = tab && !seen.includes(tab) ? (TIPS[tab] ?? []) : [];
  const tip = !tourRunning && ready ? (tips[index] ?? null) : null;
  const rect = useTourRect(tip ? tip.target : null);

  // Sekme değişince ipucu biraz bekleyip çıkar
  useEffect(() => {
    if (tourRunning || !tab) return;
    const t = setTimeout(() => setReadyTab(tab), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [tab, tourRunning]);

  // Anlatılan alan kendini ölçsün
  useEffect(() => {
    if (!tip) return;
    setActiveTourId(tip.target);
    return () => setActiveTourId(null);
  }, [tip]);

  if (!tip || !tab) return null;

  function next() {
    if (!tab) return;
    if (index + 1 < tips.length) {
      setPos({ tab, i: index + 1 });
      return;
    }
    const list = [...seen, tab];
    setSeen(list);
    writeSeen(userId, list);
  }

  const ring =
    rect && origin
      ? { left: rect.x - origin.x - PAD, top: rect.y - origin.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }
      : null;

  return (
    <View
      ref={rootRef}
      style={styles.cover}
      pointerEvents="box-none"
      onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
      testID="tab-tip"
    >
      {ring ? <View pointerEvents="none" style={[styles.ring, ring]} /> : null}
      <View style={[styles.card, { bottom: tabBarHeight + spacing.sm }]}>
        <View style={styles.head}>
          <Ionicons name={tip.icon} size={18} color={colors.primary} />
          <Text style={styles.title} accessibilityRole="header">
            {tip.title}
          </Text>
          {tips.length > 1 ? <Text style={styles.count}>{`${index + 1} / ${tips.length}`}</Text> : null}
        </View>
        <Text style={styles.text}>{tip.text}</Text>
        <PrimaryButton label={index + 1 < tips.length ? 'Sonraki' : 'Anladım'} onPress={next} testID="tab-tip-next" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80, elevation: 80 },
  ring: { position: 'absolute', borderRadius: 14, borderWidth: 2, borderColor: colors.primary },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  count: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  text: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
});
