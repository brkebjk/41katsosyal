import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EVENT_COLOR, GAME_COLOR, HoneycombMap, SEA } from '@/components/HoneycombMap';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { DragGrab, DragScreen } from '@/components/Sheet';
import { CloseX } from '@/components/CloseX';
import type { EventCellMark } from '@/lib/events';
import { cellOf, districtOf, isLand, type Cell } from '@/lib/hex';
import { searchPlaces, type Place } from '@/lib/map';
import type { GameCellMark } from '@/lib/rooms';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  /** Daha önce seçilmiş petek (varsa harita ona açılır) */
  initial: Cell | null;
  /** Haritada işaretlenecek, etkinlik olan petekler */
  eventCells: readonly EventCellMark[];
  /** Haritada işaretlenecek, açık oyun odası olan petekler (ikisi aynı petekteyse çerçeve iki renge bölünür) */
  gameCells?: readonly GameCellMark[];
  /** Üst başlık (varsayılan: etkinlik bölgesi) */
  title?: string;
  /** Hiçbir yer seçilmemişken altta çıkan yönerge */
  hint?: string;
  /** Onay düğmesinin yazısı */
  confirmLabel?: string;
  onClose: () => void;
  /** Seçilen petek ve (yer adıyla bulunduysa) yerin adı */
  onPick: (cell: Cell, placeName: string | null) => void;
};

const NO_DENSITY: never[] = [];
const BOTTOM_CARD = 150;

/**
 * Etkinlik ya da oyun odası açarken bölge seçme: tam ekran petek haritası. Bir peteğe dokunulur ya da yer adı yazılıp aranır.
 * Etkinlik olan petekler turkuaz, açık oyun odası olan petekler mor işaretle görünür; seçilen petekte kaç etkinlik
 * ve oda olduğu yazılır.
 * Konuma hiç bakılmaz; yer adı araması sunucudaki yer listesinde yapılır.
 */
export function EventCellPicker(props: Props) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
      statusBarTranslucent
      navigationBarTranslucent
      transparent={false}
    >
      {props.visible ? <PickerBody {...props} /> : null}
    </Modal>
  );
}

const DEFAULT_HINT =
  'Etkinliğin yapılacağı bölgeye dokun. Turkuaz işaretli petekler etkinlik, mor işaretli petekler açık oyun olan bölgelerdir.';

function PickerBody({
  initial,
  eventCells,
  gameCells,
  title = 'Etkinliğin bölgesini seç',
  hint = DEFAULT_HINT,
  confirmLabel = 'Bu bölgeyi seç',
  onClose,
  onPick,
}: Props) {
  const [selected, setSelected] = useState<Cell | null>(initial);
  const [focus, setFocus] = useState<{ cell: Cell; key: number } | null>(initial ? { cell: initial, key: 1 } : null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const seq = useRef(0);

  // Yazarken kısa bir bekleyişten sonra aranır
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(() => {
      setSearching(true);
      void searchPlaces(q).then((res) => {
        if (my !== seq.current) return;
        setSearching(false);
        setMessage(res.error);
        setFound(res.error ? null : res.data.slice(0, 6));
      });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  function pickPlace(p: Place) {
    const cell = cellOf(p.lon, p.lat);
    if (!isLand(cell.q, cell.r)) {
      setMessage('Bu yer Kocaeli haritasının dışında görünüyor. Başka bir yer dene.');
      return;
    }
    setMessage(null);
    setSelected(cell);
    setPlaceName(p.name);
    setFocus((f) => ({ cell, key: (f?.key ?? 0) + 1 }));
    setFound(null);
    setQuery('');
  }

  const showResults = query.trim().length >= 2;
  const count = selected ? (eventCells.find((e) => e.q === selected.q && e.r === selected.r)?.count ?? 0) : 0;
  const gameCount = selected
    ? ((gameCells ?? []).find((g) => g.q === selected.q && g.r === selected.r)?.count ?? 0)
    : 0;
  const district = selected ? (districtOf(selected.q, selected.r) ?? 'Kocaeli') : null;

  return (
    <View style={styles.root}>
      <DragScreen onClose={onClose}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <DragGrab />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Kapat">
              <CloseX size={20} />
            </Pressable>
          </View>

          <View style={styles.search}>
            <TextField
              label="Yer adıyla bul (isteğe bağlı)"
              icon="search"
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setMessage(null);
              }}
              placeholder="Örn. Kent Meydanı, Sahil Parkı"
              autoCorrect={false}
              testID="cell-search-input"
            />
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {showResults && searching ? <Text style={styles.note}>Aranıyor…</Text> : null}
            {showResults && found && found.length === 0 && !searching && !message ? (
              <Text style={styles.note}>Bu adla bir yer bulunamadı. Haritadan dokunarak seçebilirsin.</Text>
            ) : null}
            {showResults && found && found.length > 0 ? (
              <View style={styles.list}>
                {found.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onPress={() => pickPlace(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name} bölgesini seç`}
                    testID="cell-search-result"
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.pressed]}
                  >
                    <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[p.cat_label, p.district].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.mapArea}>
            <HoneycombMap
              density={NO_DENSITY}
              selected={selected}
              onSelect={(c) => {
                if (c) {
                  setSelected(c);
                  setPlaceName(null);
                }
              }}
              bottomInset={BOTTOM_CARD}
              eventCells={eventCells}
              gameCells={gameCells}
              focus={focus}
            />
            <View style={styles.bottomCard} testID="cell-picker-card">
              {selected ? (
                <View style={styles.info}>
                  <Ionicons
                    name={gameCount > 0 ? 'game-controller' : count > 0 ? 'calendar' : 'location-outline'}
                    size={20}
                    color={gameCount > 0 ? GAME_COLOR : count > 0 ? EVENT_COLOR : colors.textMuted}
                  />
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle}>{`${district} bölgesi`}</Text>
                    <Text style={styles.infoSub} testID="cell-picker-count">
                      {count > 0 || gameCount > 0
                        ? [
                            count > 0 ? `${count} yaklaşan etkinlik` : null,
                            gameCount > 0 ? `${gameCount} açık oyun odası` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') + ' var.'
                        : 'Bu petekte henüz yaklaşan etkinlik ya da açık oyun yok.'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.hint}>{hint}</Text>
              )}
              <PrimaryButton
                label={confirmLabel}
                disabled={!selected}
                onPress={() => selected && onPick(selected, placeName)}
                testID="cell-picker-confirm"
              />
            </View>
          </View>
        </SafeAreaView>
      </DragScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SEA },
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  search: { padding: spacing.md, gap: spacing.sm },
  message: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  list: { borderRadius: radii.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 1 },
  rowName: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.75 },
  mapArea: { flex: 1 },
  bottomCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20, 26, 43, 0.95)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  info: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  infoText: { flex: 1, gap: 2 },
  infoTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  infoSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  hint: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18, textAlign: 'center' },
});
