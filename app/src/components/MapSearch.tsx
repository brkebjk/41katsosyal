import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Popup } from '@/components/Popup';
import { cellName } from '@/lib/cellNames';
import { categoryInfo, EVENT_CATEGORIES } from '@/lib/eventCategories';
import { GAMES } from '@/lib/gameCatalog';
import { cellOf, districtOf, isLand, type Cell } from '@/lib/hex';
import type { GameKey } from '@/lib/images';
import { searchPlaces, type Place } from '@/lib/map';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const MAX_PLACES = 8;

/** Türkçe harfleri sadeleştirir: “Martı Sahili” → “marti sahili” (petek adındaki tire boşluk sayılır) */
function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(
      /[çğıöşüâîû]/g,
      (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[ch] ?? ch,
    )
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Hit = { kind: 'place'; place: Place; cell: Cell };

/**
 * Haritanın üstünde yüzen, yarı saydam arama çubuğu: yer (mekân, cadde, semt) arar; her sonucun altında bulunduğu
 * peteğin adı küçük sarı yazıyla görünür. Bir sonuca dokununca harita o peteğe gider ve “İncele” düğmesi çıkar.
 */
export function MapSearchBar({
  onPick,
  city,
}: {
  onPick: (cell: Cell, label: string) => void;
  /** Hangi şehrin yerlerinde aranır (haritanın şehri) */
  city?: string | null;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const query = fold(text);

  // Yer araması sunucuda: yazmayı bırakınca (350 ms) bir kez sorulur
  useEffect(() => {
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaces([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      void searchPlaces(query, city).then((res) => {
        if (!alive) return;
        setPlaces(res.error ? [] : res.data);
        setSearching(false);
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, city]);

  // Yalnızca gerçek yerler listelenir; her yerin bulunduğu peteğin adı altında küçük sarı yazıyla görünür
  const hits: Hit[] = useMemo(() => {
    const list: Hit[] = [];
    for (const p of places) {
      const cell = cellOf(p.lon, p.lat);
      if (!isLand(cell.q, cell.r)) continue;
      list.push({ kind: 'place', place: p, cell });
      if (list.length >= MAX_PLACES) break;
    }
    return list;
  }, [places]);

  function choose(h: Hit) {
    Keyboard.dismiss();
    setFocused(false);
    setText(h.place.name);
    onPick(h.cell, `${h.place.name} · ${cellName(h.cell)}`);
  }

  const open = focused && query.length >= 2;

  return (
    <View style={styles.searchWrap} pointerEvents="box-none" testID="map-search">
      <View style={styles.bar}>
        <Ionicons name="search" size={20} color={colors.primary} />
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Yer ara"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          maxLength={60}
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={() => {
            if (hits[0]) choose(hits[0]);
          }}
          accessibilityLabel="Haritada yer ya da petek ara"
          testID="map-search-input"
        />
        {text ? (
          <Pressable
            onPress={() => {
              setText('');
              setPlaces([]);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Aramayı temizle"
            testID="map-search-clear"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View style={styles.results} testID="map-search-results">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.resultsBody}>
            {hits.length === 0 ? (
              <Text style={styles.empty}>{searching ? 'Aranıyor…' : 'Sonuç yok. Başka bir ad dene.'}</Text>
            ) : (
              hits.map((h) => (
                <Pressable
                  key={`p-${h.place.id}`}
                  onPress={() => choose(h)}
                  accessibilityRole="button"
                  testID="map-search-hit"
                  style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
                >
                  <View style={styles.hitIcon}>
                    <Ionicons name="location" size={16} color={colors.text} />
                  </View>
                  <View style={styles.hitText}>
                    <Text style={styles.hitTitle} numberOfLines={1}>
                      {h.place.name}
                    </Text>
                    <Text style={styles.hitSub} numberOfLines={1}>
                      {[h.place.cat_label, h.place.district ?? districtOf(h.cell.q, h.cell.r)]
                        .filter(Boolean)
                        .join(' · ') || 'Yer'}
                    </Text>
                    <Text style={styles.hitCell} numberOfLines={1}>
                      {cellName(h.cell)}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))
            )}
            {searching && hits.length > 0 ? <Text style={styles.empty}>Yerler aranıyor…</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** Büyüteç menüsünde bir seçenek: haritada kaç petekte olduğu */
export type FinderOption = { key: string; title: string; cells: Cell[] };

/** Büyüteç düğmesi (harita düğmelerinin en üstünde, + düğmesinin üstünde) */
export function FinderButton({ onPress, active }: { onPress: () => void; active: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Haritada oyun ya da etkinlik türü bul"
      testID="map-finder"
      style={({ pressed }) => [styles.finderBtn, active && styles.finderBtnOn, pressed && styles.pressed]}
    >
      <Ionicons name="search" size={19} color="#1A1200" />
    </Pressable>
  );
}

/**
 * Büyüteç menüsü: oyunlar ve etkinlik kategorileri. Birine dokununca o oyunun ya da kategorinin olduğu peteklerin
 * üstünde 10 saniye zıplayan ok çıkar.
 */
export function FinderMenu({
  games,
  categories,
  onPick,
  onClose,
}: {
  games: FinderOption[];
  categories: FinderOption[];
  onPick: (o: FinderOption) => void;
  onClose: () => void;
}) {
  return (
    <Popup title="Haritada bul" subtitle="Dokun: o petekler 10 saniye okla gösterilir" icon="search" onClose={onClose}>
      <Text style={styles.section}>Oyunlar</Text>
      <View style={styles.grid}>
        {games.map((g) => (
          <FinderTile
            key={g.key}
            option={g}
            onPick={onPick}
            icon={<Ionicons name={GAMES[g.key as GameKey]?.icon ?? 'game-controller'} size={26} color={colors.game} />}
          />
        ))}
      </View>
      <Text style={styles.section}>Etkinlik kategorileri</Text>
      <View style={styles.grid}>
        {categories.map((c) => (
          <FinderTile
            key={c.key}
            option={c}
            onPick={onPick}
            icon={<CategoryIcon info={categoryInfo(c.key)} size={24} color={colors.event} />}
          />
        ))}
      </View>
    </Popup>
  );
}

function FinderTile({
  option,
  icon,
  onPick,
}: {
  option: FinderOption;
  icon: React.ReactNode;
  onPick: (o: FinderOption) => void;
}) {
  const n = option.cells.length;
  return (
    <Pressable
      onPress={() => onPick(option)}
      disabled={n === 0}
      accessibilityRole="button"
      accessibilityLabel={`${option.title}: ${n} petek`}
      testID={`map-finder-${option.key}`}
      style={({ pressed }) => [styles.tile, n === 0 && styles.tileOff, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.tileTitle} numberOfLines={2}>
        {option.title}
      </Text>
      <Text style={[styles.tileCount, n > 0 && styles.tileCountOn]}>{n > 0 ? `${n} petek` : 'Şu an yok'}</Text>
    </Pressable>
  );
}

/** Menüde gösterilecek etkinlik kategorileri (sıra uygulamadaki sırayla aynı) */
export const FINDER_CATEGORIES = EVENT_CATEGORIES.map((c) => ({ key: c.key, title: c.title }));

const styles = StyleSheet.create({
  searchWrap: { position: 'absolute', top: 22, left: 12, right: 88 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: colors.overlay,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 61, 0.4)',
  },
  input: { flex: 1, color: colors.text, fontSize: fontSizes.md, paddingVertical: 0 },
  results: {
    marginTop: 6,
    maxHeight: 320,
    borderRadius: radii.lg,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 10,
  },
  resultsBody: { padding: 6, gap: 4 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.md },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  hitIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitCell: { color: colors.highlight, fontSize: 11, fontFamily: fonts.semi },
  hitText: { flex: 1, gap: 1 },
  hitTitle: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  hitSub: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.75 },
  finderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFC83D',
    borderWidth: 2,
    borderColor: '#FFF4C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finderBtnOn: { backgroundColor: '#FFE38A' },
  section: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileOff: { opacity: 0.45 },
  tileTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm, textAlign: 'center' },
  tileCount: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi },
  tileCountOn: { color: colors.highlight },
});
