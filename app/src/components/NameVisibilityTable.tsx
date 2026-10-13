import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { colors, fonts } from '@/theme';

const ROWS: { place: string; real: boolean }[] = [
  { place: 'Puan sıralaması', real: true },
  { place: 'Açtığın etkinlikler ve akıştaki paylaşımı', real: true },
  { place: 'Etkinlik ve mekân yorumları', real: true },
  { place: 'Oyun odaları ve oyun davetleri', real: true },
  { place: 'Etkinlikte ekip arama', real: true },
  { place: 'Arkadaşların', real: true },
  { place: 'Akıştaki gönderi ve yorumların', real: false },
  { place: 'Petek akışı', real: false },
];

/** Kayıt ekranı: gerçek adın ve rumuzun nerede göründüğünü gösteren küçük tablo. */
export function NameVisibilityTable() {
  return (
    <View style={styles.box} accessibilityRole="summary" testID="name-visibility-table">
      <View style={styles.headRow}>
        <Ionicons name="eye" size={15} color={colors.alert} />
        <Text style={styles.title}>Adın nerede görünür?</Text>
      </View>
      <View style={[styles.row, styles.rowHead]}>
        <Text style={[styles.place, styles.colHead]}>Yer</Text>
        <Text style={[styles.col, styles.colHead]}>Gerçek ad</Text>
        <Text style={[styles.col, styles.colHead]}>Rumuz</Text>
      </View>
      {ROWS.map((r) => (
        <View key={r.place} style={styles.row} accessibilityLabel={`${r.place}: ${r.real ? 'gerçek adın' : 'rumuzun'} görünür`}>
          <Text style={styles.place}>{r.place}</Text>
          <View style={styles.col}>
            {r.real ? <Ionicons name="checkmark-circle" size={15} color={colors.alert} /> : <Text style={styles.dash}>–</Text>}
          </View>
          <View style={styles.col}>
            {!r.real ? <Ionicons name="checkmark-circle" size={15} color={colors.success} /> : <Text style={styles.dash}>–</Text>}
          </View>
        </View>
      ))}
      <Text style={styles.note}>Rumuzun her hafta kendiliğinden değişir. Yalnızca arkadaş olduğun kişiler akıştaki gönderilerini gerçek adınla görür.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 2,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: 'rgba(255, 59, 59, 0.08)',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  title: { color: colors.alert, fontFamily: fonts.black, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 59, 59, 0.25)',
  },
  rowHead: { borderTopWidth: 0 },
  place: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 15, paddingVertical: 2 },
  col: { width: 62, alignItems: 'center', textAlign: 'center' },
  colHead: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 10.5 },
  dash: { color: colors.textMuted, fontSize: 12 },
  note: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 4 },
});
