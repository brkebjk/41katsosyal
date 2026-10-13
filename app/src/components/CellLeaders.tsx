import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import type { Cell } from '@/lib/hex';
import { callRpc } from '@/lib/rpc';
import { colors, fonts } from '@/theme';

type Row = { kind: 'host' | 'player'; place: number; full_name: string; title: string | null; cnt: number };

/** Petek menüsü: bu ay ve geçen ay o petekte en çok etkinlik düzenleyen ve en çok oyun oynayan ilk 3 (küçük). */
export function CellLeaders({ cell }: { cell: Cell }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let active = true;
    void callRpc<Row[]>('cell_leaders', { p_q: cell.q, p_r: cell.r }).then(({ data }) => {
      if (active) setRows(data ?? []);
    });
    return () => {
      active = false;
    };
  }, [cell.q, cell.r]);

  if (!rows || rows.length === 0) return null;
  const hosts = rows.filter((r) => r.kind === 'host');
  const players = rows.filter((r) => r.kind === 'player');
  return (
    <View style={styles.box} testID="cell-leaders">
      <Text style={styles.head}>Bu peteğin enleri · son 2 ay</Text>
      {[
        { list: hosts, icon: 'calendar' as const, label: 'Etkinlik düzenleyen', unit: 'etkinlik' },
        { list: players, icon: 'game-controller' as const, label: 'Oyun oynayan', unit: 'oyun' },
      ].map((g) =>
        g.list.length > 0 ? (
          <View key={g.label} style={styles.group}>
            <View style={styles.groupHead}>
              <Ionicons name={g.icon} size={11} color={colors.textMuted} />
              <Text style={styles.groupLabel}>{g.label}</Text>
            </View>
            {g.list.map((r) => (
              <Text key={`${g.label}-${r.place}`} style={styles.row} numberOfLines={1}>
                <Text style={styles.place}>{`${r.place}. `}</Text>
                {r.full_name}
                {r.title ? <Text style={styles.title}>{` · ${r.title}`}</Text> : null}
                <Text style={styles.cnt}>{`  ${r.cnt} ${g.unit}`}</Text>
              </Text>
            ))}
          </View>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  head: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 11 },
  group: { gap: 1 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupLabel: { color: colors.textMuted, fontSize: 10.5 },
  row: { color: colors.text, fontSize: 11.5 },
  place: { color: colors.primary, fontFamily: fonts.semi },
  title: { color: colors.accent, fontSize: 10.5 },
  cnt: { color: colors.textMuted, fontSize: 10.5 },
});
