import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { DialogHost } from '@/components/DialogHost';
import { EventCellPicker } from '@/components/EventCellPicker';
import { KeyboardLift } from '@/components/KeyboardLift';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { TextField } from '@/components/TextField';
import { eventCellMarks, listEvents, type EventCellMark } from '@/lib/events';
import { areaOf, hexDistance, isLand, type Cell } from '@/lib/hex';
import { REAL_NAME } from '@/lib/realName';
import {
  gameCellMarks,
  listOpenRooms,
  PLACE_NOTE_MAX,
  PLACE_NOTE_MIN,
  type GameCellMark,
  type RoomPlace,
} from '@/lib/rooms';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

export type PlaceRequest = {
  /** Oyunun adı (başlıkta yazılır) */
  gameTitle: string;
  /** Telefonun bulunduğu petek (varsa harita buna açılır ve ilk seçim odur) */
  phoneCell: Cell | null;
  /** Telefon peteğinden en çok kaç petek uzakta oda kurulabilir (-1 = kontrol yok) */
  maxDistance: number;
  /** Seçim bitince (ya da vazgeçilince null) çağrılır */
  resolve: (place: RoomPlace | null) => void;
};

type Props = { request: PlaceRequest | null };

/**
 * Oda açarken yer seçme penceresi: haritadan petek + adres tarifi. Odaya girenler hangi bölgede, nerede
 * buluşacaklarını buradan öğrenir. Oda sahibinin gerçek adı açık odalar listesinde görüneceği için kırmızı uyarı da
 * burada gösterilir.
 */
export function RoomPlaceModal({ request }: Props) {
  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => request?.resolve(null)}
    >
      <KeyboardLift style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => request?.resolve(null)}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />
        {request ? <Card key={request.gameTitle} request={request} /> : null}
      </KeyboardLift>
      <DialogHost />
    </Modal>
  );
}

function Card({ request }: { request: PlaceRequest }) {
  const { phoneCell, maxDistance, gameTitle } = request;
  // Telefonun bulunduğu petek karadaysa ilk seçim odur (haritada değiştirilebilir)
  const [cell, setCell] = useState<Cell | null>(
    phoneCell && isLand(phoneCell.q, phoneCell.r) ? phoneCell : null,
  );
  const [note, setNote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [events, setEvents] = useState<EventCellMark[]>([]);
  const [games, setGames] = useState<GameCellMark[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Harita açılınca etkinlik ve oyun olan petekler işaretli görünsün
  useEffect(() => {
    let active = true;
    void listEvents().then((r) => {
      if (active && !r.error) setEvents(eventCellMarks(r.data));
    });
    void listOpenRooms().then((r) => {
      if (active && !r.error) setGames(gameCellMarks(r.data));
    });
    return () => {
      active = false;
    };
  }, []);

  function submit() {
    const text = note.trim();
    if (!cell) return setError('Haritadan oyunun oynanacağı bölgeyi (peteği) seçmelisin.');
    if (text.length < PLACE_NOTE_MIN || text.length > PLACE_NOTE_MAX) {
      return setError(
        `Adres tarifi zorunlu: ${PLACE_NOTE_MIN} ile ${PLACE_NOTE_MAX} karakter arasında, katılanların seni bulabileceği şekilde yaz.`,
      );
    }
    if (phoneCell && maxDistance >= 0 && hexDistance(phoneCell, cell) > maxDistance) {
      return setError(
        'Seçtiğin bölge bulunduğun yerden uzak. Oda, şu an bulunduğun bölgede ya da hemen yanındaki bölgelerde kurulabilir.',
      );
    }
    request.resolve({ cell, note: text });
  }

  return (
    <View style={styles.card} testID="room-place-modal">
      <Text style={styles.title} accessibilityRole="header">
        Oda nerede kurulacak?
      </Text>
      <Text style={styles.message}>
        {`${gameTitle} odan haritada ve “Açık odalar” listesinde bu bölgeyle görünür. Katılanlar seni bulabilsin diye bölgeyi seç ve adresi tarif et.`}
      </Text>
      <RealNameNotice text={REAL_NAME.roomHost} />

      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Haritadan oda bölgesini seç"
        testID="room-cell-open"
        style={({ pressed }) => [styles.cellBtn, cell && styles.cellBtnOn, pressed && styles.pressed]}
      >
        <Ionicons
          name={cell ? 'checkmark-circle' : 'map-outline'}
          size={22}
          color={cell ? colors.success : colors.primary}
        />
        <View style={styles.cellText}>
          <Text style={styles.cellTitle}>
            {cell ? `${areaOf(cell.q, cell.r)} bölgesi seçildi` : 'Haritadan petek seç'}
          </Text>
          <Text style={styles.cellSub}>
            {cell
              ? phoneCell && cell.q === phoneCell.q && cell.r === phoneCell.r
                ? 'Bulunduğun bölge. Değiştirmek için dokun.'
                : 'Değiştirmek için dokun.'
              : 'Oyunun oynanacağı yaklaşık bölge.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <TextField
        label="Adres Tarifi *"
        icon="location-outline"
        value={note}
        onChangeText={(t) => {
          setNote(t);
          setError(null);
        }}
        placeholder="Örn. Cafe Nova, üst kat, camın yanındaki masa"
        maxLength={PLACE_NOTE_MAX}
        returnKeyType="done"
        testID="room-place-note"
      />
      <Text style={styles.small}>
        Odaya yalnızca bu bölgede ya da hemen yanındaki bölgelerde bulunanlar girebilir. Kod yine yalnızca
        sende görünür.
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Odayı oluştur" onPress={submit} testID="room-place-submit" />
      <PrimaryButton label="Vazgeç" onPress={() => request.resolve(null)} variant="ghost" />

      <EventCellPicker
        visible={pickerOpen}
        initial={cell}
        eventCells={events}
        gameCells={games}
        title="Oyunun bölgesini seç"
        hint="Oyunun oynanacağı bölgeye dokun. Mor işaretli petekler açık oda, turkuaz işaretliler etkinlik olan bölgelerdir."
        confirmLabel="Bu bölgeyi seç"
        onClose={() => setPickerOpen(false)}
        onPick={(c) => {
          setCell(c);
          setPickerOpen(false);
          setError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20, textAlign: 'center' },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  pressed: { opacity: 0.75 },
  cellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
  },
  cellBtnOn: { borderColor: colors.success },
  cellText: { flex: 1, gap: 2 },
  cellTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  cellSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
