import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { skinColors } from '@/lib/bubbleSkins';
import { colors } from '@/theme';

type Props = {
  /** Balon rengi anahtarı (veritabanındaki `bubble_skins.key`); boşsa standart */
  skin?: string | null;
  /** Moderatör gizlediyse kenar çizgisi kırmızı olur */
  hidden?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** true: balon satırın tamamını kaplar ve en az standart yükseklikte olur (akıştaki gönderiler düzenli görünsün) */
  full?: boolean;
};

const TAIL_W = 10;
const TAIL_H = 12;

/**
 * Konuşma balonu: yuvarlak köşeli kutu ve sol üstte küçük bir kuyruk.
 * Renkler `lib/bubbleSkins.ts` içindedir; içerik (yazı, yer etiketi) çağıran yerden gelir.
 */
export function ChatBubble({ skin, hidden = false, children, style, full = false }: Props) {
  const c = skinColors(skin);
  const border = hidden ? colors.danger : c.border;
  return (
    <View style={[styles.wrap, full && styles.wrapFull, style]}>
      <View style={[styles.bubble, full && styles.bubbleFull, { backgroundColor: c.fill, borderColor: border }]}>
        {children}
      </View>
      {/* Kuyruk: sağ kenarı balonun sol kenarının üstüne biner, böylece balona yapışık görünür */}
      <View style={styles.tail} aria-hidden importantForAccessibility="no-hide-descendants">
        <Svg width={TAIL_W} height={TAIL_H} viewBox={`0 0 ${TAIL_W} ${TAIL_H}`}>
          <Polyline
            points={`${TAIL_W},0.5 0.5,0.5 ${TAIL_W},${TAIL_H - 0.5}`}
            fill={c.fill}
            stroke={border}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', maxWidth: '100%', marginLeft: TAIL_W - 1 },
  bubble: {
    borderWidth: 1,
    borderRadius: 16,
    borderTopLeftRadius: 3,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  wrapFull: { alignSelf: 'stretch' },
  bubbleFull: { minHeight: 52, justifyContent: 'center' },
  tail: { position: 'absolute', top: 0, left: -(TAIL_W - 1), pointerEvents: 'none' },
});
