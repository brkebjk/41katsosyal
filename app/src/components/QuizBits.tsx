import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { quizCardImages, quizImages } from '@/lib/images';
import { fmtPts } from '@/lib/labels';
import { JOKER_INFO, mmss, type JokerKind, type JokerSet } from '@/lib/quiz';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const nowMs = () => Date.now();

/**
 * Can göstergesi: dolu/boş kalpler, bir sonraki canın dolmasına kalan süre ve bugünkü oyun sayısı.
 * Süre sunucu saatine göre sayılır (`offsetMs` = sunucu − telefon).
 */
export function LivesBar({
  lives,
  max,
  nextAt,
  offsetMs,
  gamesToday,
  dailyGames,
  onRefill,
  unlimited = false,
}: {
  lives: number;
  max: number;
  /** Seviye 5 ödülü: can sınırsız (kalpler yerine ∞ görünür) */
  unlimited?: boolean;
  nextAt: string | null;
  offsetMs: number;
  gamesToday: number;
  dailyGames: number;
  /** Sayaç sıfırlanınca (yeni can doldu) çağrılır */
  onRefill?: () => void;
}) {
  const [now, setNow] = useState(nowMs);
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!nextAt) return;
    const t = setInterval(() => {
      const n = nowMs();
      setNow(n);
      // Sayaç sıfırı geçince (yeni can doldu) bir kez haber verilir
      if (Date.parse(nextAt) - (n + offsetMs) <= 0 && fired.current !== nextAt) {
        fired.current = nextAt;
        onRefill?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [nextAt, offsetMs, onRefill]);
  const left = nextAt ? Date.parse(nextAt) - (now + offsetMs) : null;
  const dayLeft = Math.max(0, dailyGames - gamesToday);
  const dayRatio = dailyGames > 0 ? Math.min(1, gamesToday / dailyGames) : 1;
  // İki kutu yan yana: solda canlar (dolma sayacıyla), sağda günlük oyun limiti (kalan oyun)
  return (
    <View style={styles.lives} testID="quiz-lives">
      {unlimited ? (
        <View style={[styles.lifeBox, styles.lifeBoxHearts]} accessibilityLabel="Sınırsız can">
          <Text style={styles.boxLabel}>CANLARIN</Text>
          <View style={styles.hearts}>
            <Ionicons name="heart" size={20} color="#FF4D6D" />
            <Text style={styles.infinity}>∞</Text>
          </View>
          <Text style={[styles.livesSub, styles.unlimitedSub]}>Sınırsız · Seviye 5 ödülü</Text>
        </View>
      ) : (
      <View style={[styles.lifeBox, styles.lifeBoxHearts]} accessibilityLabel={`${lives} / ${max} can`}>
        <Text style={styles.boxLabel}>CANLARIN</Text>
        <View style={styles.hearts}>
          {Array.from({ length: max }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < lives ? 'heart' : 'heart-outline'}
              size={20}
              color={i < lives ? '#FF4D6D' : colors.textMuted}
            />
          ))}
        </View>
        <Text style={styles.livesSub}>
          {lives >= max
            ? `${lives}/${max} · dolu`
            : left !== null
              ? `${lives}/${max} · yeni can ${mmss(left)}`
              : `${lives}/${max}`}
        </Text>
      </View>
      )}
      <View
        style={[styles.lifeBox, styles.lifeBoxDay, dayLeft === 0 && styles.lifeBoxDone]}
        accessibilityLabel={`Günlük limit: ${dayLeft} oyun kaldı`}
      >
        <Text style={styles.boxLabel}>GÜNLÜK LİMİT</Text>
        <Text style={[styles.dayValue, dayLeft === 0 && { color: colors.danger }]}>
          {dayLeft}
          <Text style={styles.dayOf}>{` / ${dailyGames}`}</Text>
        </Text>
        <View style={styles.dayTrack}>
          <View style={[styles.dayFill, { width: `${Math.round((1 - dayRatio) * 100)}%` }]} />
        </View>
        <Text style={styles.livesSub}>{dayLeft === 0 ? 'Bugünlük bitti, yarın yenilenir' : 'oyun hakkın kaldı'}</Text>
      </View>
    </View>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type CardLook = {
  label: string;
  short: string;
  icon: IconName;
  color: string;
  image?: ImageSourcePropType | null;
};

const CARD_SIZES = {
  xxs: { w: 54, h: 74, icon: 16, circle: 28, label: 9.5, short: 7.5 },
  xs: { w: 66, h: 88, icon: 20, circle: 34, label: 10.5, short: 9 },
  sm: { w: 86, h: 116, icon: 26, circle: 44, label: 12, short: 10.5 },
  md: { w: 104, h: 142, icon: 32, circle: 56, label: 14, short: 11.5 },
  lg: { w: 140, h: 190, icon: 44, circle: 80, label: 17, short: 13 },
} as const;

/**
 * Joker kartı: renkli çerçeve, büyük simge, adı ve kısa açıklaması. Sağ üstte kırmızı yuvarlak içinde kalan hak sayısı.
 * Kullanılamıyorsa soluk görünür; “kullanıldı” etiketi çıkabilir.
 */
export function JokerCard({
  look,
  count,
  used = false,
  disabled = false,
  selected = false,
  size = 'md',
  onPress,
  onLongPress,
  testID,
}: {
  look: CardLook;
  /** Kalan hak (kırmızı rozet). Verilmezse rozet çıkmaz. */
  count?: number;
  used?: boolean;
  disabled?: boolean;
  selected?: boolean;
  size?: keyof typeof CARD_SIZES;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}) {
  const d = CARD_SIZES[size];
  const off = disabled || used || (count !== undefined && count < 1);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${look.label}. ${look.short}${count !== undefined ? `. ${count} hak` : ''}${used ? '. Kullanıldı' : ''}`}
      accessibilityState={{ disabled: off }}
      testID={testID}
      style={({ pressed }) => [{ width: d.w }, pressed && !off && styles.pressed]}
    >
      <LinearGradient
        colors={[`${look.color}55`, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={[
          styles.card,
          { width: d.w, height: d.h, borderColor: selected ? '#FFFFFF' : look.color },
          off && styles.cardOff,
        ]}
      >
        {look.image ? (
          <Image source={look.image} contentFit="contain" style={{ width: d.circle + 8, height: d.circle + 8 }} />
        ) : (
          <View
            style={[
              styles.cardCircle,
              { width: d.circle, height: d.circle, borderRadius: d.circle / 2, borderColor: look.color },
            ]}
          >
            <Ionicons name={look.icon} size={d.icon} color={look.color} />
          </View>
        )}
        <Text style={[styles.cardLabel, { fontSize: d.label }]} numberOfLines={1} adjustsFontSizeToFit>
          {look.label}
        </Text>
        {used || look.short ? (
          <Text style={[styles.cardShort, { fontSize: d.short, lineHeight: d.short + 3 }]} numberOfLines={2}>
            {used ? 'kullanıldı' : look.short}
          </Text>
        ) : null}
      </LinearGradient>
      {count !== undefined ? (
        <View style={[styles.countBadge, count < 1 && styles.countBadgeZero]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Solo joker → kart görünümü */
export function jokerLook(k: JokerKind): CardLook {
  const j = JOKER_INFO[k];
  // Solo kartlarında yalnızca ad yazar; ne işe yaradığı “Sandığından çıkanlar” penceresinde anlatılır
  return { label: j.label, short: '', icon: j.icon, color: j.color, image: quizCardImages[`solo_${k}`] };
}

/**
 * Sandıktan çıkanları gösteren küçük pencere: her kart ve ne işe yaradığı. İstenirse kapatılır.
 * `note` (ör. “İlk soru 5 sn sonra”) altta görünür.
 */
export function RewardPopup({
  title,
  items,
  emptyText = 'Sandık boş çıktı. Şansına küs!',
  note,
  onClose,
}: {
  title: string;
  items: { look: CardLook; desc: string; count?: number; tag?: string }[];
  emptyText?: string;
  note?: string | null;
  onClose: () => void;
}) {
  return (
    <Popup
      title={title}
      icon="gift"
      onClose={onClose}
      footer={
        <>
          {note ? <Text style={styles.rewardNote}>{note}</Text> : null}
          <PrimaryButton label="Tamam" onPress={onClose} />
        </>
      }
    >
      {items.length === 0 ? (
        <View style={styles.rewardEmptyBox}>
          <Ionicons name="sad-outline" size={48} color={colors.textMuted} />
          <Text style={styles.rewardEmpty}>{emptyText}</Text>
        </View>
      ) : (
        <>
          {/* Kartlar yan yana */}
          <View style={styles.rewardCards}>
            {items.map((it, i) => (
              <JokerCard
                key={`${it.look.label}-${i}`}
                look={it.look}
                count={it.count}
                size={items.length === 1 ? 'lg' : items.length === 2 ? 'md' : 'sm'}
              />
            ))}
          </View>
          {/* Her kartın ne işe yaradığı */}
          {items.map((it, i) => (
            <View key={`d-${it.look.label}-${i}`} style={styles.rewardRow}>
              <Text style={[styles.rewardTitle, { color: it.look.color }]}>{it.look.label}</Text>
              {it.tag ? <Text style={styles.rewardTag}>{it.tag}</Text> : null}
              <Text style={styles.rewardDesc}>{it.desc}</Text>
            </View>
          ))}
        </>
      )}
    </Popup>
  );
}

/** Puan hedefi çubuğu: “Bugün 3.5 / 10” gibi; sonda bayrak, dolunca “Hedefe ulaştın!” */
export function PointGoal({ label, value, max, icon }: { label: string; value: number; max: number; icon: IconName }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const done = max > 0 && value >= max;
  const left = Math.max(0, max - value);
  return (
    <View style={styles.goal} accessibilityLabel={`${label}: ${fmtPts(value)} / ${max} puan`}>
      <View style={styles.goalHead}>
        <Ionicons name={icon} size={15} color={done ? colors.success : colors.primary} />
        <Text style={styles.goalLabel}>{label}</Text>
        <Text style={styles.goalValue}>
          <Text style={{ color: done ? colors.success : colors.primary }}>{fmtPts(value)}</Text>
          {` / ${max}`}
        </Text>
      </View>
      <View style={styles.goalTrack}>
        <LinearGradient
          colors={done ? ['#22C55E', '#34D399'] : ['#FF6A1A', '#FFB020']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.goalFill, { width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }]}
        />
        <View style={[styles.goalFlag, done && styles.goalFlagDone]}>
          <Ionicons name={done ? 'trophy' : 'flag'} size={12} color={done ? '#071622' : colors.primary} />
        </View>
      </View>
      <Text style={styles.goalSub}>
        {done ? 'Hedefe ulaştın! Bu dönem daha fazla puan yazılmaz.' : `Hedefe ${fmtPts(left)} puan kaldı`}
      </Text>
    </View>
  );
}

/** Yuvarlak “oynat” düğmesi: üçgen simge ve altında yazı (ör. BAŞLA, RASTGELE EŞLEŞ) */
export function PlayButton({
  label,
  size,
  disabled = false,
  onPress,
  testID,
  colors: grad = ['#FFB020', '#FF6A1A'],
  iconOnly = false,
}: {
  label: string;
  size: number;
  /** Yalnızca oynat simgesi (yazı yok; yazı ekran okuyucu için kalır) */
  iconOnly?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  colors?: [string, string];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.playBtn,
        { width: size, height: size, borderRadius: size / 2, shadowColor: grad[1] },
        disabled && styles.playOff,
        pressed && styles.playPressed,
      ]}
    >
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fillAbs, { borderRadius: size / 2 }]}
      />
      <View style={[styles.playRing, { borderRadius: size / 2 }]} />
      <Ionicons name="play" size={size * (iconOnly ? 0.46 : 0.36)} color="#1A1200" style={styles.playIcon} />
      {iconOnly ? null : (
        <Text style={[styles.playLabel, { fontSize: Math.max(11, Math.round(size / 11)) }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Joker küçük rozeti (sandık içeriğinde ve joker çubuğunda) */
export function JokerBadge({ kind, count, size = 'md' }: { kind: JokerKind; count?: number; size?: 'sm' | 'md' }) {
  const j = JOKER_INFO[kind];
  const small = size === 'sm';
  return (
    <View style={[styles.badge, { borderColor: j.color }, small && styles.badgeSm]}>
      <Ionicons name={j.icon} size={small ? 12 : 16} color={j.color} />
      <Text style={[styles.badgeText, small && styles.badgeTextSm]}>{j.label}</Text>
      {count !== undefined && count > 1 ? (
        <Text style={[styles.badgeText, { color: j.color }]}>{`×${count}`}</Text>
      ) : null}
    </View>
  );
}

/**
 * Gizli sandık. Kapalıyken hafifçe sallanır; açılınca içindeki jokerler görünür.
 * Görsel (quizImages.chestClosed / chestOpen) eklenmemişse kodla çizilen sandık gösterilir.
 */
export function QuizChest({
  open,
  contents,
  picked = false,
  disabled = false,
  onPress,
  size = 96,
  label,
}: {
  open: boolean;
  contents?: JokerSet | null;
  picked?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  size?: number;
  label?: string;
}) {
  const [wobble] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (open) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 120, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1, duration: 240, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 120, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [open, wobble]);
  const rotate = wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] });
  const img = open ? quizImages.chestOpen : quizImages.chestClosed;
  const kinds = contents ? (Object.keys(contents) as JokerKind[]).filter((k) => (contents[k] ?? 0) > 0) : [];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? (open ? 'Açık sandık' : 'Kapalı sandık')}
      style={({ pressed }) => [styles.chestWrap, { width: size + 8 }, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ rotate: open ? '0deg' : rotate }] }}>
        {img ? (
          <Image source={img} contentFit="contain" style={{ width: size, height: size }} />
        ) : (
          <LinearGradient
            colors={open ? ['#7A4A12', '#3B2208'] : ['#C47A1E', '#6B3E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.chest, { width: size, height: size * 0.82 }, picked && styles.chestPicked]}
          >
            <View style={[styles.chestLid, open && styles.chestLidOpen]} />
            <View style={styles.chestLock}>
              <Ionicons name={open ? 'sparkles' : 'lock-closed'} size={size * 0.22} color="#FFD36B" />
            </View>
          </LinearGradient>
        )}
      </Animated.View>
      {open ? (
        <View style={styles.contents}>
          {kinds.length === 0 ? (
            <Text style={styles.empty}>Boş</Text>
          ) : (
            kinds.map((k) => <JokerBadge key={k} kind={k} size="sm" />)
          )}
        </View>
      ) : null}
      {picked ? <Text style={styles.pickedText}>Senin</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  infinity: { color: '#FF4D6D', fontFamily: fonts.black, fontSize: 22, lineHeight: 24 },
  unlimitedSub: { color: colors.highlight },
  previewWrap: { gap: 6 },
  previewTitle: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  previewRowTight: { gap: 5 },
  previewBig: { alignItems: 'center', gap: spacing.md },
  previewDesc: { color: colors.text, fontSize: fontSizes.md, lineHeight: 23, textAlign: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  fillAbs: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  playBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  playOff: { opacity: 0.5 },
  playPressed: { transform: [{ scale: 0.95 }] },
  playRing: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  playIcon: { marginLeft: 8 },
  playLabel: { color: '#1A1200', fontFamily: fonts.black, letterSpacing: 1, marginTop: -2 },
  lives: { flexDirection: 'row', gap: spacing.sm },
  lifeBox: {
    flex: 1,
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  lifeBoxHearts: { borderColor: 'rgba(255, 77, 109, 0.45)' },
  lifeBoxDay: { borderColor: 'rgba(34, 211, 197, 0.45)' },
  lifeBoxDone: { borderColor: colors.danger },
  boxLabel: { color: colors.textMuted, fontFamily: fonts.black, fontSize: 10, letterSpacing: 1.2 },
  hearts: { flexDirection: 'row', gap: 2, flexWrap: 'wrap' },
  livesSub: { color: colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  dayValue: { color: colors.primary, fontFamily: fonts.black, fontSize: 22, lineHeight: 26 },
  dayOf: { color: colors.textMuted, fontSize: 13 },
  dayTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  dayFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12 },
  badgeTextSm: { fontSize: 10 },
  chestWrap: { alignItems: 'center', gap: 6 },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
  },
  cardOff: { opacity: 0.38 },
  cardCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.3)' },
  cardLabel: { color: colors.text, fontFamily: fonts.black, textAlign: 'center' },
  cardShort: { color: colors.textMuted, textAlign: 'center' },
  countBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: '#E5252A',
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeZero: { backgroundColor: '#5A2A2E' },
  countText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
  rewardCards: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: 10,
    marginBottom: spacing.md,
  },
  rewardRow: {
    gap: 4,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  rewardEmptyBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rewardTitle: { fontFamily: fonts.black, fontSize: fontSizes.xl, textAlign: 'center' },
  rewardTag: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.semi,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  rewardDesc: { color: colors.text, fontSize: fontSizes.md, lineHeight: 23, textAlign: 'center' },
  rewardEmpty: { color: colors.textMuted, fontSize: fontSizes.lg, textAlign: 'center', paddingVertical: spacing.xl },
  rewardNote: { color: colors.primary, fontSize: fontSizes.md, textAlign: 'center', fontFamily: fonts.extra },
  goal: { gap: 6 },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalLabel: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  goalValue: {
    color: colors.textMuted,
    fontFamily: fonts.extra,
    fontSize: fontSizes.sm,
    fontVariant: ['tabular-nums'],
  },
  goalTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    overflow: 'visible',
  },
  goalFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  goalFlag: {
    position: 'absolute',
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalFlagDone: { backgroundColor: colors.success, borderColor: colors.success },
  goalSub: { color: colors.textMuted, fontSize: 11 },
  chest: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFD36B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chestPicked: { borderColor: '#FFFFFF', borderWidth: 3 },
  chestLid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderBottomWidth: 2,
    borderBottomColor: '#FFD36B',
  },
  chestLidOpen: { height: '18%', backgroundColor: 'rgba(255, 211, 107, 0.35)' },
  chestLock: {
    width: '34%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '12%',
  },
  contents: { alignItems: 'center', gap: 3 },
  empty: { color: colors.textMuted, fontSize: 11 },
  pickedText: { color: colors.primary, fontFamily: fonts.extra, fontSize: 11 },
});

/**
 * Oyun başlatma ekranlarında jokerlerin küçük kartları. Bir karta dokununca büyük hali ve ne işe yaradığı açılır.
 */
export function JokerPreview({
  title = 'Jokerler',
  items,
  size = 'xs',
}: {
  title?: string;
  items: { key: string; look: CardLook; desc: string; tag?: string }[];
  /** Kart boyutu: 'xxs' ile 5 kart dar ekranda da tek sıraya sığar */
  size?: 'xxs' | 'xs';
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = items.find((i) => i.key === open) ?? null;
  return (
    <View style={styles.previewWrap}>
      <Text style={styles.previewTitle}>{`${title} · ne işe yaradığını görmek için dokun`}</Text>
      <View style={[styles.previewRow, size === 'xxs' && styles.previewRowTight]}>
        {items.map((i) => (
          <JokerCard
            key={i.key}
            look={i.look}
            size={size}
            onPress={() => setOpen(i.key)}
            testID={`joker-preview-${i.key}`}
          />
        ))}
      </View>
      {cur ? (
        <Popup title={cur.look.label} subtitle={cur.tag} icon="sparkles" onClose={() => setOpen(null)}>
          <View style={styles.previewBig}>
            <JokerCard look={cur.look} size="lg" />
            <Text style={styles.previewDesc}>{cur.desc}</Text>
          </View>
        </Popup>
      ) : null}
    </View>
  );
}
