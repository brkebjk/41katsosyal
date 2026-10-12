import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { fmtPts } from "@/lib/labels";
import type { LevelInfo } from "@/lib/ranking";
import { colors, fonts, fontSizes, radii, spacing } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  points: number;
  levels: LevelInfo[];
};

const RING = 148;
const STROKE = 12;

/** Profil → puana dokununca: puan, seviye halkası ve seviye basamakları. Sabit pencere, kaydırma yok. */
export function PointsProgressModal({
  visible,
  onClose,
  points,
  levels,
}: Props) {
  const current =
    [...levels].reverse().find((l) => points >= l.min_points) ?? levels[0];
  const next = levels.find((l) => l.min_points > points);
  const progress = !current
    ? 0
    : next
      ? Math.min(
          1,
          Math.max(
            0,
            (points - current.min_points) /
              (next.min_points - current.min_points),
          ),
        )
      : 1;
  const r = (RING - STROKE) / 2;
  const len = 2 * Math.PI * r;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        <View
          style={styles.card}
          accessibilityViewIsModal
          testID="points-modal"
        >
          <Text style={styles.title} accessibilityRole="header">
            Puanın ve ilerlemen
          </Text>

          <View style={styles.ringWrap}>
            <Svg width={RING} height={RING}>
              <Defs>
                <SvgGradient id="pp" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={colors.highlight} />
                  <Stop offset="1" stopColor="#FF8A3D" />
                </SvgGradient>
              </Defs>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke={colors.surfaceAlt}
                strokeWidth={STROKE}
                fill="none"
              />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke="url(#pp)"
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${len} ${len}`}
                strokeDashoffset={len * (1 - progress)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text
                style={styles.points}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fmtPts(points)}
              </Text>
              <Text style={styles.pointsLabel}>puan</Text>
            </View>
          </View>

          {current ? (
            <View style={styles.levelChip}>
              <Ionicons name="trending-up" size={14} color={colors.highlight} />
              <Text style={styles.levelChipText}>
                Seviye {current.level} · {current.name}
              </Text>
            </View>
          ) : null}
          <Text style={styles.hint}>
            {next ? (
              <>
                <Text style={styles.hintStrong}>{next.name}</Text> seviyesine{" "}
                <Text style={styles.hintStrong}>
                  {fmtPts(next.min_points - points)} puan
                </Text>{" "}
                kaldı
              </>
            ) : current ? (
              "En yüksek seviyedesin!"
            ) : (
              ""
            )}
          </Text>

          {/* Seviye basamakları */}
          <View style={styles.ladder}>
            {levels.map((l) => {
              const reached = points >= l.min_points;
              const isCurrent = current?.level === l.level;
              return (
                <View
                  key={l.level}
                  style={[styles.step, isCurrent && styles.stepCurrent]}
                >
                  <View style={[styles.stepDot, reached && styles.stepDotOn]}>
                    {reached ? (
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color={colors.primaryText}
                      />
                    ) : (
                      <Text style={styles.stepNum}>{l.level}</Text>
                    )}
                  </View>
                  <Text
                    style={[styles.stepName, !reached && styles.stepMuted]}
                    numberOfLines={1}
                  >
                    {l.name}
                  </Text>
                  <Text
                    style={[styles.stepPts, isCurrent && styles.stepPtsCurrent]}
                  >
                    {fmtPts(l.min_points)}
                  </Text>
                </View>
              );
            })}
          </View>

          <PrimaryButton label="Tamam" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: spacing.xl },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5, 7, 14, 0.78)",
  },
  card: {
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg + 4,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: fontSizes.md,
  },
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  points: { color: colors.highlight, fontFamily: fonts.black, fontSize: 34 },
  pointsLabel: {
    color: colors.textMuted,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
  },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255, 200, 61, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 200, 61, 0.4)",
  },
  levelChipText: {
    color: colors.text,
    fontFamily: fonts.extra,
    fontSize: fontSizes.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: "center",
  },
  hintStrong: { color: colors.highlight, fontFamily: fonts.extra },
  ladder: { alignSelf: "stretch", gap: 4, marginVertical: spacing.xs },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  stepCurrent: { backgroundColor: "rgba(255, 200, 61, 0.1)" },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  stepDotOn: { backgroundColor: colors.primary },
  stepNum: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: 11 },
  stepName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.semi,
    fontSize: fontSizes.sm,
  },
  stepMuted: { color: colors.textMuted },
  stepPts: { color: colors.textMuted, fontFamily: fonts.extra, fontSize: 12 },
  stepPtsCurrent: { color: colors.highlight },
});
