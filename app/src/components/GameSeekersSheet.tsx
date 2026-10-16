import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { ActionSheet, type ActionOption } from '@/components/ActionSheet';
import { Avatar } from '@/components/Avatar';
import { goToDm } from '@/components/DirectMessages';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { cellName } from '@/lib/cellNames';
import { confirmAction, notify } from '@/lib/dialog';
import { openDm } from '@/lib/dm';
import { FRIEND_CONSEQUENCE, FRIEND_WARNING } from '@/lib/friends';
import {
  joinGameSeek,
  leaveGameSeek,
  listGameSeekers,
  listSeekGames,
  seekBlock,
  seekFriendRequest,
  type GameSeeker,
  type SeekGame,
} from '@/lib/gameSeek';
import { areaOf, type Cell } from '@/lib/hex';
import { timeAgo } from '@/lib/labels';
import { anchorOf, type MenuAnchor } from '@/lib/menuAnchor';
import { locateMyCell, nearCell } from '@/lib/myCell';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** “Oyun arayanlar” düğmesinin ve penceresinin mor rengi (iki temada da okunur) */
export const SEEK_PURPLE = '#8B5CF6';

/**
 * Petek menüsü > Oyun arayanlar: bu petekte bugün yan yana oynanan bir oyun için oyun arkadaşı arayanlar (rumuzla).
 * “Listeye adımı yazdır” ile oyun seçilir; kayıt için peteğin içinde ya da hemen yanında olmak gerekir ve kayıt gece
 * yarısına kadar görünür. Bir rumuza dokununca akıştaki gibi seçenekler açılır.
 */
export function GameSeekersSheet({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  const [rows, setRows] = useState<GameSeeker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<SeekGame[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [menu, setMenu] = useState<{ row: GameSeeker; anchor: MenuAnchor } | null>(null);

  const load = useCallback(async () => {
    const res = await listGameSeekers(cell);
    setError(res.error);
    setRows(res.data);
  }, [cell]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  /** Tek seferde tek işlem: işlem sürerken yeni basışlar bir şey başlatmaz */
  async function guard(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  async function openPicker() {
    setMsg(null);
    setPicking(true);
    if (games === null) setGames(await listSeekGames());
  }

  const join = (g: SeekGame) =>
    guard(async () => {
      setMsg(null);
      const my = await locateMyCell('gameseek');
      if (!my) return;
      if (!nearCell(my, cell)) {
        setMsg({ text: 'Listeye yazılmak için bu peteğin içinde ya da hemen yanında olmalısın.', error: true });
        return;
      }
      const res = await joinGameSeek(cell, my, g.key);
      if (res.error) return setMsg({ text: res.error, error: true });
      setPicking(false);
      setMsg({ text: `${g.title} için listeye yazıldın. Kaydın bu gece yarısına kadar görünür.`, error: false });
      void load();
    });

  const leave = () =>
    guard(async () => {
      const res = await leaveGameSeek();
      if (res.error) return setMsg({ text: res.error, error: true });
      setMsg({ text: 'Adın listeden silindi.', error: false });
      void load();
    });

  function menuOptions(r: GameSeeker): ActionOption[] {
    const close = () => setMenu(null);
    return [
      {
        label: 'Profile git',
        icon: 'person-circle-outline',
        onPress: () => {
          close();
          onClose();
          router.push({ pathname: '/rumuz', params: { alias: r.alias } });
        },
      },
      {
        label: 'Özel mesaj gönder',
        icon: 'chatbubbles-outline',
        onPress: () =>
          void guard(async () => {
            close();
            const res = await openDm({ alias: r.alias });
            if (res.error || !res.id) {
              void notify('Mesaj gönderilemiyor', res.error ?? 'Biraz sonra tekrar dene.', { icon: 'chatbubbles' });
              return;
            }
            onClose();
            goToDm(res.id);
          }),
      },
      ...(r.is_friend
        ? []
        : [
            {
              label: 'Arkadaşlık isteği gönder',
              icon: 'person-add-outline' as const,
              onPress: () =>
                void guard(async () => {
                  close();
                  const ok = await confirmAction(
                    'Arkadaşlık isteği gönder',
                    `İstek ${r.alias} rumuzlu kişiye gidecek. ${FRIEND_CONSEQUENCE}`,
                    'İsteği gönder',
                    false,
                    { icon: 'person-add', tone: 'friend', warning: FRIEND_WARNING },
                  );
                  if (!ok) return;
                  const res = await seekFriendRequest(r.id);
                  if (res.error) return setMsg({ text: res.error, error: true });
                  setMsg({
                    text: res.outcome === 'accepted' ? 'Artık arkadaşsınız.' : 'Arkadaşlık isteğin gönderildi.',
                    error: false,
                  });
                  void load();
                }),
            },
          ]),
      {
        label: 'Bu kişiyi engelle',
        icon: 'remove-circle-outline',
        destructive: true,
        onPress: () =>
          void guard(async () => {
            close();
            const ok = await confirmAction(
              'Bu kişiyi engelle',
              `${r.alias} rumuzlu kişinin gönderi ve yorumlarını artık görmeyeceksin; bu listede de görünmeyecek. Engeli profilinden kaldırabilirsin.`,
              'Engelle',
              true,
            );
            if (!ok) return;
            const res = await seekBlock(r.id);
            if (res.error) return setMsg({ text: res.error, error: true });
            setMsg({ text: 'Kişi engellendi.', error: false });
            void load();
          }),
      },
    ];
  }

  const mine = rows?.find((r) => r.is_mine) ?? null;
  const others = rows?.filter((r) => !r.is_mine) ?? [];

  return (
    <>
      <Sheet
        title="Oyun arayanlar"
        subtitle={`${cellName(cell)} · ${areaOf(cell.q, cell.r)} · bugün`}
        onClose={onClose}
      >
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows === null ? (
          <ActivityIndicator color={SEEK_PURPLE} style={styles.loader} />
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="game-controller-outline" size={30} color={colors.textMuted} />
            <Text style={styles.muted}>Bu petekte bugün oyun arayan yok. İlk sen yaz!</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {mine ? (
              <View style={[styles.row, styles.rowMine]} testID="seek-mine">
                <Avatar index={mine.avatar_index} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.alias} numberOfLines={1}>{`${mine.alias} (sen)`}</Text>
                  <Text style={styles.game} numberOfLines={1}>{`${mine.game_title} · ${timeAgo(mine.created_at)}`}</Text>
                </View>
                <Pressable
                  onPress={() => void leave()}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Listeden çık"
                  hitSlop={8}
                  style={styles.leave}
                >
                  <Text style={styles.leaveText}>Listeden çık</Text>
                </Pressable>
              </View>
            ) : null}
            {others.map((r) => (
              <Pressable
                key={r.id}
                onPress={(e) => setMenu({ row: r, anchor: anchorOf(e) })}
                accessibilityRole="button"
                accessibilityLabel={`${r.alias}, ${r.game_title} oynamak istiyor`}
                testID="seek-row"
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Avatar index={r.avatar_index} size={40} />
                <View style={styles.rowText}>
                  <View style={styles.aliasRow}>
                    <Text style={styles.alias} numberOfLines={1}>
                      {r.alias}
                    </Text>
                    {r.is_friend ? <Ionicons name="people" size={14} color={colors.success} /> : null}
                  </View>
                  <Text style={styles.game} numberOfLines={1}>{`${r.game_title} · ${timeAgo(r.created_at)}`}</Text>
                </View>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {picking ? (
          <View style={styles.pickBox}>
            <Text style={styles.pickTitle}>Hangi oyunu oynamak istiyorsun?</Text>
            {games === null ? (
              <ActivityIndicator color={SEEK_PURPLE} />
            ) : games.length === 0 ? (
              <Text style={styles.muted}>Şu an yan yana oynanan açık bir oyun yok.</Text>
            ) : (
              <View style={styles.chips}>
                {games.map((g) => (
                  <Pressable
                    key={g.key}
                    onPress={() => void join(g)}
                    disabled={busy}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.chip, (pressed || busy) && styles.pressed]}
                  >
                    <Ionicons name="game-controller" size={15} color="#FFFFFF" />
                    <Text style={styles.chipText}>{g.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.note}>
              Yalnızca yan yana oynanan oyunlar seçilebilir. Bunun için konumuna bir kez bakılır; bu peteğin içinde ya da
              hemen yanında olmalısın.
            </Text>
            <PrimaryButton label="Vazgeç" variant="ghost" onPress={() => setPicking(false)} disabled={busy} />
          </View>
        ) : (
          <Pressable
            onPress={() => void openPicker()}
            disabled={busy}
            accessibilityRole="button"
            testID="seek-join"
            style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="hand-right" size={18} color="#FFFFFF" />
                <Text style={styles.joinText}>{mine ? 'Oyunumu değiştir' : 'Listeye adımı yazdır'}</Text>
              </>
            )}
          </Pressable>
        )}
        {msg ? <Text style={msg.error ? styles.error : styles.ok}>{msg.text}</Text> : null}
        <Text style={styles.note}>
          Listede yalnızca bu haftaki rumuzlar görünür; gerçek adlar görünmez. Kayıtlar gece yarısı silinir.
        </Text>
      </Sheet>
      {menu ? (
        <ActionSheet
          title="Oyun arayan"
          subtitle={menu.row.alias}
          options={menuOptions(menu.row)}
          onClose={() => setMenu(null)}
          anchor={menu.anchor}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: spacing.lg },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowMine: { borderWidth: 1.5, borderColor: SEEK_PURPLE },
  rowText: { flex: 1, gap: 2 },
  aliasRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alias: { flexShrink: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  game: { color: colors.textMuted, fontSize: 12 },
  leave: { paddingHorizontal: 10, paddingVertical: 6 },
  leaveText: { color: colors.danger, fontFamily: fonts.semi, fontSize: 12 },
  pressed: { opacity: 0.75 },
  pickBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: SEEK_PURPLE,
  },
  pickTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: SEEK_PURPLE,
  },
  chipText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 14 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: SEEK_PURPLE,
  },
  joinText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: fontSizes.md },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  ok: { color: colors.success, fontSize: fontSizes.sm, lineHeight: 20 },
});
