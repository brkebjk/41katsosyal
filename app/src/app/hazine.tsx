import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HoneycombMap } from '@/components/HoneycombMap';
import { InfoModal } from '@/components/InfoModal';
import { KeyboardLift } from '@/components/KeyboardLift';
import { Popup } from '@/components/Popup';
import { TreasureHintModal } from '@/components/TreasureHintModal';
import { useAuth } from '@/lib/auth';
import { cellName } from '@/lib/cellNames';
import { notify } from '@/lib/dialog';
import { HOW_TO_PLAY } from '@/lib/gameInfo';
import { districtOf, type Cell } from '@/lib/hex';
import { formatWhen } from '@/lib/labels';
import { locateMyCell } from '@/lib/myCell';
import {
  DEFAULT_TREASURE_POINTS,
  DIFFICULTIES,
  DIFFICULTY_ICON,
  DIFFICULTY_LABEL,
  getTreasureStatus,
  listTreasures,
  redeemTreasure,
  TREASURE_COLORS,
  type Treasure,
  type TreasureStatus,
} from '@/lib/treasure';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Hazine Avı başarımının basamakları (son basamağın ödülü ömür boyu abonelik) */
const TREASURE_STEPS = [1, 10, 25, 50, 100];

/**
 * Hazine Avı ekranı: üstte “Nasıl oynanır?”, sıralama ve puan/ödül bilgisi; ortada yalnızca hazinelerin göründüğü mini
 * harita ve altında puan göstergesi; sonra gömülü hazinelerin listesi (girişte açık; haritada hazineli peteğe dokununca
 * yalnızca o hazine); en altta sabit kod kutusu.
 */
export default function TreasureScreen() {
  const { profile } = useAuth();
  const canPlay = profile?.role === 'user';
  const [list, setList] = useState<Treasure[]>([]);
  const [status, setStatus] = useState<TreasureStatus | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [hintFor, setHintFor] = useState<Treasure | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [focus, setFocus] = useState<{ cell: Cell; key: number; farPx?: number } | null>(null);
  const { height } = useWindowDimensions();

  const load = useCallback(async () => {
    const [l, st] = await Promise.all([listTreasures(), getTreasureStatus()]);
    setList(l);
    setStatus(st);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cells = useMemo(() => list.map((t) => ({ q: t.cell_q, r: t.cell_r, difficulty: t.difficulty })), [list]);
  const picked = selected ? (list.find((t) => t.cell_q === selected.q && t.cell_r === selected.r) ?? null) : null;
  const points = status?.points ?? DEFAULT_TREASURE_POINTS;
  const left = status ? Math.max(0, status.monthly_limit - status.found_this_month) : null;
  const found = status?.found_total ?? 0;
  const shown = picked ? [picked] : listOpen ? list : [];

  /** Listeden bir hazine: harita o peteğe kayar ve petek seçilir */
  function pick(t: Treasure) {
    const c = { q: t.cell_q, r: t.cell_r };
    setSelected(c);
    setFocus((f) => ({ cell: c, key: (f?.key ?? 0) + 1, farPx: 40 }));
  }

  async function submit() {
    if (busy) return;
    const words = code.trim().split(/\s+/).filter(Boolean);
    if (words.length !== 3) {
      void notify('Kod 3 kelime', 'Hazine kodu 3 kelimeden oluşur. Kâğıtta yazanı aralarında boşlukla yaz.', {
        icon: 'key',
      });
      return;
    }
    setBusy(true);
    const here = await locateMyCell('treasure', false);
    if (!here) {
      setBusy(false);
      return;
    }
    const res = await redeemTreasure(code, here);
    setBusy(false);
    if (res.error) {
      void notify('Kod girilemedi', res.error, { icon: 'alert-circle', tone: 'danger' });
      return;
    }
    if (!res.ok) {
      void notify(
        'Hazine bulunamadı',
        'Kod yanlış ya da hazinenin peteğine yeterince yakın değilsin (en çok 1 petek). Kodu ve bulunduğun yeri kontrol edip tekrar dene.',
        { icon: 'search', tone: 'danger' },
      );
      return;
    }
    setCode('');
    setSelected(null);
    void load();
    await notify(
      'Hazineyi buldun!',
      `${res.difficulty ? DIFFICULTY_LABEL[res.difficulty] : ''} hazine: +${res.points ?? 0} puan genel puanına eklendi. Kod artık geçersiz.`,
      { icon: 'trophy', tone: 'success' },
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <KeyboardLift style={styles.flex}>
          <View style={styles.header}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Oyunlar"
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
              <Text style={styles.backText}>Oyunlar</Text>
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              Hazine Avı
            </Text>
            <Text
              style={styles.sub}
            >{`Haritada ${list.length} hazine${left === null ? '' : ` · bu ay ${left} hakkın kaldı`}`}</Text>
          </View>
          {status?.lifetime ? (
            <View style={styles.lifetime} testID="treasure-lifetime">
              <Ionicons name="trophy" size={18} color="#1A1200" />
              <Text style={styles.lifetimeText}>Hazine Efsanesi: ömür boyu abonelik kazandın!</Text>
            </View>
          ) : null}

          {/* Üst sıra: Nasıl oynanır · Sıralama · Puan ve ödül (bilgi) */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => setHowOpen(true)}
              accessibilityRole="button"
              testID="treasure-how"
              style={({ pressed }) => [styles.howBtn, pressed && styles.pressed]}
            >
              <Ionicons name="help-circle" size={18} color="#0B0F1A" />
              <Text style={styles.howText}>Nasıl oynanır?</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/siralama', params: { game: 'treasure_hunt' } })}
              accessibilityRole="button"
              testID="treasure-rank"
              style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
            >
              <Ionicons name="trophy" size={16} color={colors.primary} />
              <Text style={styles.linkText}>Sıralama</Text>
            </Pressable>
            <Pressable
              onPress={() => setInfoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Puan tablosu ve başarım ödülü"
              testID="treasure-info"
              style={({ pressed }) => [styles.infoBtn, pressed && styles.pressed]}
            >
              <Ionicons name="help" size={22} color="#1A1200" />
            </Pressable>
          </View>

          {/* Mini harita: yalnızca hazineler */}
          <View style={[styles.mapBox, { height: Math.round(height * 0.27) }]}>
            <HoneycombMap
              density={[]}
              selected={picked ? selected : null}
              onSelect={(c) => setSelected(c && list.some((t) => t.cell_q === c.q && t.cell_r === c.r) ? c : null)}
              treasureCells={cells}
              focus={focus}
              controlsTop={8}
            />
            {list.length === 0 ? (
              <View style={styles.emptyOverlay} pointerEvents="none">
                <Text style={styles.emptyText}>Şu an haritada bulunmamış hazine yok.</Text>
              </View>
            ) : null}
          </View>

          {/* Puan göstergesi: haritanın hemen altında */}
          <View style={styles.pointsRow} testID="treasure-points">
            {DIFFICULTIES.map((d) => (
              <View key={d} style={styles.pointItem}>
                <View style={[styles.dot, { backgroundColor: TREASURE_COLORS[d] }]} />
                <Text style={styles.pointText}>{`${DIFFICULTY_LABEL[d]} ${points[d]}`}</Text>
              </View>
            ))}
          </View>

          {/* Gömülü hazineler: girişte açık; haritada petek seçilince yalnızca o hazine */}
          <View style={styles.listHead}>
            <Pressable
              onPress={() => setListOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: listOpen }}
              testID="treasure-list-toggle"
              style={styles.listToggle}
            >
              <Ionicons name="map" size={18} color={colors.primary} />
              <Text style={styles.listTitle}>{picked ? 'Seçilen hazine' : `Gömülü hazineler (${list.length})`}</Text>
              {picked ? null : (
                <Ionicons name={listOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              )}
            </Pressable>
            {picked ? (
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                testID="treasure-show-all"
                style={({ pressed }) => [styles.allChip, pressed && styles.pressed]}
              >
                <Text style={styles.allChipText}>Tümünü göster</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.listBody} keyboardShouldPersistTaps="handled">
            {shown.length === 0 ? (
              <Text style={styles.meta}>
                {list.length === 0 ? 'Şu an gömülü hazine yok. Yenileri eklenince burada görünür.' : ''}
              </Text>
            ) : (
              shown.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => pick(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cellName({ q: t.cell_q, r: t.cell_r })}, ${DIFFICULTY_LABEL[t.difficulty]} hazine`}
                  testID="treasure-row"
                  style={({ pressed }) => [
                    styles.card,
                    { borderColor: TREASURE_COLORS[t.difficulty] },
                    picked?.id === t.id && styles.cardOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.cardHead}>
                    <Ionicons name={DIFFICULTY_ICON[t.difficulty]} size={18} color={TREASURE_COLORS[t.difficulty]} />
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {cellName({ q: t.cell_q, r: t.cell_r })}
                    </Text>
                    <Text style={[styles.cardDiff, { color: TREASURE_COLORS[t.difficulty] }]}>
                      {`${DIFFICULTY_LABEL[t.difficulty]} · ${t.points} puan`}
                    </Text>
                  </View>
                  <View style={styles.cardFoot}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {`${districtOf(t.cell_q, t.cell_r) ?? 'Kocaeli'} · son gün ${formatWhen(new Date(t.expires_at))}`}
                    </Text>
                    <Pressable
                      onPress={() => setHintFor(t)}
                      hitSlop={6}
                      accessibilityRole="button"
                      testID="treasure-hint-open"
                      style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="bulb" size={14} color="#1A1200" />
                      <Text style={styles.hintBtnText}>İpucu</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* Kod kutusu: altta sabit */}
          {canPlay ? (
            <View style={styles.codeBar}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Hazine kodu (3 kelime)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={60}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                style={styles.codeInput}
                accessibilityLabel="Hazine kodu, 3 kelime"
                testID="treasure-code"
              />
              <Pressable
                onPress={() => void submit()}
                disabled={busy || left === 0}
                accessibilityRole="button"
                accessibilityLabel={left === 0 ? 'Bu ayki hakkın doldu' : 'Kodu doğrula'}
                testID="treasure-submit"
                style={({ pressed }) => [styles.codeBtn, (busy || left === 0) && styles.off, pressed && styles.pressed]}
              >
                <Text style={styles.codeBtnText}>{busy ? '…' : left === 0 ? 'Hak doldu' : 'Doğrula'}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.meta, styles.codeNote]}>Hazine kodu yalnızca üye hesaplarıyla girilir.</Text>
          )}
        </KeyboardLift>
      </SafeAreaView>

      <TreasureHintModal key={hintFor?.id ?? 'none'} treasure={hintFor} onClose={() => setHintFor(null)} />
      <InfoModal
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title="Hazine Avı: nasıl oynanır?"
        icon="search-circle"
        items={HOW_TO_PLAY.treasure_hunt ?? []}
        note={`Kodu girmek için hazinenin peteğinde ya da hemen yanındaki petekte olmalısın. Ayda en çok ${status?.monthly_limit ?? 3} hazine. Yanlış denemeler sınırlıdır (saatte 6).`}
      />
      {infoOpen ? (
        <Popup title="Puan ve ödül" subtitle="Hazine Avı" icon="information-circle" onClose={() => setInfoOpen(false)}>
          <Text style={styles.infoSection}>Puan tablosu</Text>
          <View style={styles.table}>
            {DIFFICULTIES.map((d) => (
              <View key={d} style={styles.tableRow}>
                <View style={[styles.dot, { backgroundColor: TREASURE_COLORS[d] }]} />
                <Text style={styles.tableLabel}>{`${DIFFICULTY_LABEL[d]} hazine`}</Text>
                <Text style={styles.tableValue}>{`${points[d]} puan`}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.infoText}>
            {`Puan, kodu ilk giren kişiye bir kez yazılır; kod sonra geçersiz olur. Ayda en çok ${status?.monthly_limit ?? 3} hazine bulunabilir.`}
          </Text>
          <Text style={styles.infoSection}>Başarım ödülü</Text>
          <View style={styles.table}>
            {TREASURE_STEPS.map((n) => {
              const done = found >= n;
              return (
                <View key={n} style={styles.tableRow}>
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={done ? colors.success : colors.textMuted}
                  />
                  <Text style={styles.tableLabel}>{`${n} hazine bul`}</Text>
                  <Text style={[styles.tableValue, !done && styles.tableValueOff]}>
                    {n === TREASURE_STEPS[TREASURE_STEPS.length - 1]
                      ? 'Ömür boyu abonelik'
                      : done
                        ? 'Tamam'
                        : `${found}/${n}`}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.infoText}>
            {status?.lifetime
              ? `Şu ana kadar ${found} hazine buldun ve ödülü kazandın: ömür boyu abonelik hesabına tanımlandı.`
              : `Şu ana kadar ${found} hazine buldun. Ödül son basamakta verilir: ${TREASURE_STEPS[TREASURE_STEPS.length - 1]} hazine bulan üyeye ömür boyu abonelik otomatik tanımlanır.`}
          </Text>
        </Popup>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 2 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -4, paddingVertical: 4 },
  backText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.xl - 2 },
  sub: { color: colors.textMuted, fontSize: fontSizes.xs },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  howBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  howText: { color: '#071622', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  linkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linkText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  infoBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFC83D',
    borderWidth: 2,
    borderColor: '#FFE7A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBox: {
    minHeight: 170,
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyOverlay: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    backgroundColor: 'rgba(11,15,26,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  pointsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pointItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pointText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  listToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  listTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  allChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  allChipText: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  listBody: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  card: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  cardOn: { backgroundColor: colors.surfaceAlt },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  cardDiff: { fontFamily: fonts.semi, fontSize: fontSizes.xs },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardMeta: { flex: 1, color: colors.textMuted, fontSize: fontSizes.xs },
  hintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: '#FFC83D',
  },
  hintBtnText: { color: '#1A1200', fontFamily: fonts.extra, fontSize: fontSizes.xs },
  meta: { color: colors.textMuted, fontSize: fontSizes.xs, paddingHorizontal: spacing.sm },
  codeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  codeInput: {
    flex: 1,
    height: 52,
    color: colors.text,
    fontSize: fontSizes.lg,
    paddingHorizontal: spacing.md,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 61, 0.55)',
    backgroundColor: colors.surface,
  },
  codeBtn: {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBtnText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.md },
  codeNote: { textAlign: 'center', paddingVertical: spacing.md },
  off: { opacity: 0.45 },
  infoSection: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  infoText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  table: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableLabel: { flex: 1, color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  tableValue: { color: colors.highlight, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  tableValueOff: { color: colors.textMuted },
  lifetime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: '#FFC83D',
  },
  lifetimeText: { flex: 1, color: '#1A1200', fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
});
