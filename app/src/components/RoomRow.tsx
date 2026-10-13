import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TitleBadge } from '@/components/TitleBadge';
import { districtOf } from '@/lib/hex';
import type { OpenRoom } from '@/lib/rooms';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  room: OpenRoom;
  isModerator: boolean;
  onPress: () => void;
};

/** “Açık odalar” listesinin bir satırı: oyun, oda sahibi, bölge + adres tarifi, oyuncu sayısı ve “Katıl” düğmesi. */
export function RoomRow({ room, isModerator, onPress }: Props) {
  // Başkasının odasında "Katıl" kod sorar; kod listede görünmez, oda sahibinden öğrenilir.
  const label = room.is_mine ? 'Senin odan' : room.joined ? 'Odaya dön' : isModerator ? 'Aç' : 'Katıl';
  const needsCode = label === 'Katıl';
  const district = room.place_q !== null && room.place_r !== null ? districtOf(room.place_q, room.place_r) : null;
  const where = [district, room.place_note].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, room.is_official && styles.cardOfficial]} testID="room-row">
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {room.event_title
            ? room.game_type === 'raffle'
              ? 'Etkinlik çekilişi'
              : `Etkinlik oyunu · ${room.game_title}`
            : room.game_title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {room.is_official ? 'Moderatör odası' : `Oda sahibi: ${room.host_name}`}
        </Text>
        <TitleBadge label={room.host_title} />
        {room.event_title ? (
          <Text style={styles.meta} numberOfLines={1}>
            {`Etkinlik: ${room.event_title} · yalnızca doğrulanmış katılımcılar`}
          </Text>
        ) : null}
        {where ? (
          <View style={styles.foot}>
            <Ionicons name="location" size={14} color={colors.game} />
            <Text style={[styles.meta, styles.where]} numberOfLines={3}>
              {where}
            </Text>
          </View>
        ) : null}
        <View style={styles.foot}>
          <Ionicons name="people" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>{room.player_count} oyuncu</Text>
        </View>
        {needsCode ? (
          <View style={styles.foot}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>Kodu oda sahibi söyler</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.action}>
        <PrimaryButton label={label} onPress={onPress} variant={room.joined || room.is_mine ? 'ghost' : 'primary'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  cardOfficial: { borderColor: colors.primary },
  info: { flex: 1, gap: 2 },
  title: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  where: { flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  action: { width: 118 },
});
