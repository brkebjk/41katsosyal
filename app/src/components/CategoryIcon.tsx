import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { CategoryInfo } from '@/lib/eventCategories';

// Motosiklet simgesi. Ionicons'ta motosiklet olmadığı için “Material Design Icons” (Apache 2.0) setindeki
// `motorbike` çiziminin çizgileri buraya alındı; böylece bir de ~1 MB'lık simge yazı tipi eklememiz gerekmedi.
const MOTORBIKE_PATH =
  'M372 -235 286 -320H192V-277H269L311 -235H139Q99 -235 71 -207Q43 -179 43 -139Q43 -99 71 -71Q99 -43 139 -43Q174 -43 200.5 -65.5Q227 -88 233 -122L278 -149Q277 -146 277 -139Q277 -99 305 -71Q333 -43 373 -43Q413 -43 441 -71Q469 -99 469 -139Q469 -179 441 -207Q413 -235 373 -235ZM189 -122Q183 -106 169.5 -95.5Q156 -85 138 -85Q116 -85 100.5 -101Q85 -117 85 -139Q85 -161 100.5 -176.5Q116 -192 138 -192Q156 -192 169.5 -181.5Q183 -171 189 -155H128V-123ZM373 -85Q351 -85 335 -101Q319 -117 319 -139Q319 -161 335 -176.5Q351 -192 373 -192Q395 -192 410.5 -176.5Q426 -161 426 -139Q426 -117 410.5 -101Q395 -85 373 -85Z';

/** Çizimin kapladığı alan (yatay, dikey); genişlik/yükseklik oranı yaklaşık 1,48. */
const MOTORBIKE_BOX = { x: 36, y: -327, w: 440, h: 291 };

export function MotorbikeIcon({ size, color }: { size: number; color: string }) {
  const h = size;
  const w = Math.round((size * MOTORBIKE_BOX.w) / MOTORBIKE_BOX.h);
  return (
    <Svg
      width={w}
      height={h}
      viewBox={`${MOTORBIKE_BOX.x} ${MOTORBIKE_BOX.y} ${MOTORBIKE_BOX.w} ${MOTORBIKE_BOX.h}`}
    >
      <Path d={MOTORBIKE_PATH} fill={color} />
    </Svg>
  );
}

type Props = {
  info: Pick<CategoryInfo, 'icon' | 'withMotorbike'>;
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
};

/** Kategorinin simgesi. “Araba / Motor Buluşması”nda araba ile motosiklet yan yana görünür. */
export function CategoryIcon({ info, size, color, style }: Props) {
  if (!info.withMotorbike)
    return <Ionicons name={info.icon} size={size} color={color} style={style as never} />;
  return (
    <View style={[styles.row, { gap: Math.max(2, Math.round(size * 0.12)) }, style]}>
      <Ionicons name={info.icon} size={size} color={color} />
      <MotorbikeIcon size={Math.round(size * 0.72)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
