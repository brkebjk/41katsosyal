import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { CELL_NAME_RE, cellName, cleanCellName, generatedCellName, setCellName } from '@/lib/cellNames';
import { EVENT_CATEGORIES } from '@/lib/eventCategories';
import { GAMES } from '@/lib/gameCatalog';
import { areaOf, type Cell } from '@/lib/hex';
import { checkInHere, getPresence, type Presence } from '@/lib/map';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

// ---------------------------------------------------------------------------------------------
// Harita filtresi
// ---------------------------------------------------------------------------------------------

/** Gizlenen katmanlar. Boş = her şey görünür. PeopleHere Özel etkinlik ve oyunlar filtreden etkilenmez. */
export type MapFilter = { hiddenCats: string[]; hiddenGames: string[]; hideVenues: boolean };
export const EMPTY_FILTER: MapFilter = { hiddenCats: [], hiddenGames: [], hideVenues: false };

export function filterActive(f: MapFilter): boolean {
  return f.hiddenCats.length > 0 || f.hiddenGames.length > 0 || f.hideVenues;
}

const GAME_KEYS = (Object.keys(GAMES) as (keyof typeof GAMES)[]).filter((k) => k !== 'raffle');

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export function MapFilterSheet({
  value,
  onChange,
  onClose,
}: {
  value: MapFilter;
  onChange: (f: MapFilter) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Haritada ne görünsün?"
      subtitle="Başka sekmeye geçince filtre sıfırlanır. PeopleHere Özel etkinlik ve oyunlar her zaman görünür."
      onClose={onClose}
    >
      <Text style={styles.group}>Etkinlik kategorileri</Text>
      <View style={styles.chips}>
        {EVENT_CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            icon={c.icon}
            label={c.title}
            on={!value.hiddenCats.includes(c.key)}
            onPress={() => onChange({ ...value, hiddenCats: toggle(value.hiddenCats, c.key) })}
          />
        ))}
      </View>
      <Text style={styles.group}>Oyunlar</Text>
      <View style={styles.chips}>
        {GAME_KEYS.map((k) => (
          <Chip
            key={k}
            icon={GAMES[k].icon}
            label={GAMES[k].title}
            on={!value.hiddenGames.includes(k)}
            onPress={() => onChange({ ...value, hiddenGames: toggle(value.hiddenGames, k) })}
          />
        ))}
      </View>
      <Text style={styles.group}>Diğer</Text>
      <View style={styles.chips}>
        <Chip
          icon="storefront"
          label="Mekânlar"
          on={!value.hideVenues}
          onPress={() => onChange({ ...value, hideVenues: !value.hideVenues })}
        />
      </View>
      <PrimaryButton label="Hepsini göster" variant="ghost" onPress={() => onChange(EMPTY_FILTER)} />
      <PrimaryButton label="Tamam" onPress={onClose} />
    </Sheet>
  );
}

function Chip({
  icon,
  label,
  on,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Ionicons name={on ? icon : 'eye-off-outline'} size={14} color={on ? colors.primary : colors.textMuted} />
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Petekteki kişi sayısı ve “Buradayım”
// ---------------------------------------------------------------------------------------------

export function PresenceSheet({
  cell,
  canCheckIn,
  presenceOpen,
  autoCheckIn = false,
  onClose,
}: {
  cell: Cell;
  canCheckIn: boolean;
  presenceOpen: boolean;
  /** “Buradayım”a basılarak açıldıysa bildirim hemen başlar */
  autoCheckIn?: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Presence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!presenceOpen) return;
    const res = await getPresence(cell);
    setData(res.data);
    setError(res.error);
  }, [cell, presenceOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  async function checkIn() {
    if (busy || !canCheckIn) return;
    setBusy(true);
    setMsg(null);
    const res = await checkInHere(cell, (c) => cellName(c));
    setBusy(false);
    if (!res) return;
    if (!res.ok) return setMsg({ text: res.message, error: true });
    setMsg({ text: 'Bildirimin alındı. Bu petekte olduğun, kimse görünmeden sayıya eklendi.', error: false });
    void load();
  }

  // “Buradayım”a basılarak açıldıysa bildirim pencere açılınca bir kez başlar
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoCheckIn || autoStarted.current) return;
    autoStarted.current = true;
    void checkIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca pencere açılırken bir kez çalışır
  }, []);

  return (
    <Sheet title={cellName(cell)} subtitle={`${areaOf(cell.q, cell.r)} · şu an burada kim var?`} onClose={onClose}>
      {presenceOpen ? (
        <View style={styles.countBox} testID="presence-count">
          <Ionicons name="people" size={26} color={colors.primary} />
          <View style={styles.flex}>
            {error ? (
              <Text style={styles.error}>{error}</Text>
            ) : !data ? (
              <Text style={styles.muted}>Yükleniyor…</Text>
            ) : (
              <>
                <Text style={styles.count}>{`${data.count} kişi`}</Text>
                <Text style={styles.muted}>
                  {`Son ${data.minutes} dakikada bu petekte konum bildiren ya da oyuna / etkinliğe katılan üye sayısı.${data.me ? ' Sen de bu sayının içindesin.' : ''}`}
                </Text>
              </>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>Petekteki kişi sayısı şu an üyelere açık değil.</Text>
      )}
      <Text style={styles.note}>
        Kimin burada olduğu gösterilmez; ne gerçek adlar ne rumuzlar görünür, yalnızca sayı.
      </Text>
      {canCheckIn ? (
        <>
          <PrimaryButton label="Buradayım (konumumu bildir)" onPress={() => void checkIn()} loading={busy} />
          <Text style={styles.note}>
            Yalnızca gerçekten bulunduğun peteğe bildirim yapabilirsin; konumuna bir kez bakılır. 10 dakikada bir
            bildirilebilir.
          </Text>
        </>
      ) : null}
      {msg ? <Text style={msg.error ? styles.error : styles.ok}>{msg.text}</Text> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Moderatör: petek adını değiştir
// ---------------------------------------------------------------------------------------------

export function RenameCellSheet({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  const [name, setName] = useState(cellName(cell));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generated = generatedCellName(cell.q, cell.r);

  async function save(value: string) {
    if (busy) return;
    const v = cleanCellName(value);
    if (v && (v.length < 3 || v.length > 40 || !CELL_NAME_RE.test(v))) {
      return setError('Ad 3–40 karakter olmalı; küçük harf ve rakam, kelimeler arasında tire (ör. adalar-sahili).');
    }
    setBusy(true);
    setError(null);
    const res = await setCellName(cell, v);
    setBusy(false);
    if (res.error) return setError(res.error);
    onClose();
  }

  return (
    <Sheet title="Petek adını değiştir" subtitle={`${areaOf(cell.q, cell.r)} · herkes bu adı görür`} onClose={onClose}>
      <TextField
        label="Petek adı"
        icon="pricetag-outline"
        value={name}
        onChangeText={(t) => setName(t.toLocaleLowerCase('tr-TR'))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        placeholder="ör. adalar-sahili"
      />
      <Text style={styles.note}>Küçük harf ve rakam; kelimeler arasına tire koy. Boşluklar tireye çevrilir.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Kaydet" onPress={() => void save(name)} loading={busy} />
      {generated ? (
        <PrimaryButton
          label={`Varsayılan ada dön (${generated})`}
          variant="ghost"
          onPress={() => void save('')}
          disabled={busy}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  group: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'line-through' },
  chipTextOn: { color: colors.text, textDecorationLine: 'none' },
  pressed: { opacity: 0.8 },
  countBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  count: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  ok: { color: colors.success, fontSize: fontSizes.sm, lineHeight: 20 },
});
