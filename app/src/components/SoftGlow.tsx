import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/**
 * Yumuşak, köşesiz ışık: ortası renkli, kenarlara doğru tamamen saydamlaşan elips. Bulunduğu kutunun ortasına
 * yerleşir ve dokunmaları engellemez. Ölçüler piksel olarak verilir (yüzdeli SVG bazı telefonlarda bozuk çiziliyordu).
 */
export function SoftGlow({
  width,
  height,
  color,
  opacity = 0.3,
  color2,
}: {
  width: number;
  height: number;
  color: string;
  opacity?: number;
  /** Kenara doğru geçilen ikinci renk (verilmezse aynı renk) */
  color2?: string;
}) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { width, height, marginLeft: -width / 2, marginTop: -height / 2 }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color2 ?? color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color2 ?? color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: '50%', top: '50%' },
});
