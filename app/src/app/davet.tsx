import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as SMS from 'expo-sms';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EventCellPicker } from '@/components/EventCellPicker';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { cellName, cellNameInUse, CELL_NAME_RE, cleanCellName, hasCustomCellName, loadCellNames } from '@/lib/cellNames';
import { confirmAction, notify } from '@/lib/dialog';
import type { Cell } from '@/lib/hex';
import {
  applyCellNameRight,
  buyInviteItem,
  getMyInvite,
  INVITE_ITEM_INFO,
  inviteMessage,
  redeemInviteCode,
  shareInvite,
  type InviteItem,
  type MyInvite,
} from '@/lib/invite';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const NO_CELLS: never[] = [];

/**
 * Arkadaşını davet et: en üstte davet puanı ilerlemesi, altında değiştirilemeyen davet kodu ve paylaşma seçenekleri
 * (bağlantı olarak ya da rehberden SMS ile), en altta davet puanıyla alınan öğeler (her biri hesap başına bir kez).
 */
export default function InviteScreen() {
  const [data, setData] = useState<MyInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [nameCell, setNameCell] = useState<Cell | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyInvite();
    setError(res.error);
    if (res.data) setData(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCellNames();
    }, [load]),
  );

  async function onCopy() {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Rehberden bir kişi seçilir; telefonunun SMS uygulaması hazır davet mesajıyla açılır */
  async function onContacts() {
    if (!data || busy) return;
    setBusy('contacts');
    try {
      const smsOk = await SMS.isAvailableAsync();
      if (!smsOk) {
        await shareInvite(data.code, data.download_url);
        return;
      }
      const perm = await Contacts.requestPermissionsAsync();
      if (!perm.granted) {
        await notify(
          'Rehber izni verilmedi',
          'Rehberden davet için izin gerekiyor. İstersen “Bağlantı olarak paylaş” ile davet edebilirsin.',
          { icon: 'people' },
        );
        return;
      }
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;
      const phone = contact.phoneNumbers?.find((p) => p.number)?.number;
      if (!phone) {
        await notify('Telefon numarası yok', `${contact.name} için kayıtlı bir telefon numarası bulunamadı.`, {
          icon: 'call',
        });
        return;
      }
      await SMS.sendSMSAsync([phone], inviteMessage(data.code, data.download_url));
    } catch {
      await shareInvite(data.code, data.download_url);
    } finally {
      setBusy(null);
    }
  }

  async function onRedeem() {
    if (busy || redeemCode.trim().length < 5) return;
    setBusy('redeem');
    const res = await redeemInviteCode(redeemCode);
    setBusy(null);
    if (res.error) return void notify('Kod kullanılamadı', res.error, { icon: 'alert-circle' });
    setRedeemCode('');
    void load();
    await notify('Davet kodu eklendi', 'Seni davet eden arkadaşın, sen puan kazandıkça ödül kazanacak.', {
      icon: 'checkmark-circle',
      tone: 'success',
    });
  }

  async function onBuy(it: InviteItem) {
    if (!data || busy) return;
    const info = INVITE_ITEM_INFO[it.item];
    const ok = await confirmAction(
      'Satın al',
      `“${info.title}” için ${it.cost} davet puanı harcanacak. Her öğe hesap başına yalnızca bir kez alınabilir.`,
      'Satın al',
    );
    if (!ok) return;
    setBusy(it.item);
    const res = await buyInviteItem(it.item);
    setBusy(null);
    if (res.error) return void notify('Satın alınamadı', res.error, { icon: 'alert-circle' });
    void load();
    await notify(
      'Satın alındı',
      it.item === 'cell_name'
        ? 'Petek adı verme hakkın hazır. “Kullan” ile istediğin zaman bir peteğe ad verebilirsin.'
        : it.item === 'premium_month'
          ? '1 aylık abonelik hesabına eklendi.'
          : '“Elçi” unvanın artık gerçek adının yanında görünüyor.',
      { icon: 'checkmark-circle', tone: 'success' },
    );
  }

  /** Haritadan petek seçildi: özel adı olan petek seçilemez */
  function onPickCell(cell: Cell) {
    setPickOpen(false);
    if (hasCustomCellName(cell.q, cell.r)) {
      void notify('Bu peteğin özel adı var', `“${cellName(cell)}” peteğine daha önce ad verilmiş. Başka bir petek seç.`, {
        icon: 'map',
      });
      return;
    }
    setNameError(null);
    setNewName('');
    setNameCell(cell);
  }

  async function onConfirmName() {
    if (!nameCell || busy) return;
    const name = cleanCellName(newName);
    if (name.length < 3 || name.length > 40 || !CELL_NAME_RE.test(name)) {
      setNameError('Ad 3–40 karakter olmalı; yalnızca küçük harf ve rakam, kelimeler arasında boşluk ya da tire.');
      return;
    }
    if (cellNameInUse(name)) {
      setNameError('Bu ad başka bir petekte kullanılıyor. Başka bir ad seç.');
      return;
    }
    const ok = await confirmAction(
      'Emin misin?',
      `“${cellName(nameCell)}” peteğinin adı “${name}” olacak. Bu hak tek kullanımlıktır ve geri alınamaz.`,
      'Eminim',
    );
    if (!ok) return;
    setBusy('name');
    const res = await applyCellNameRight(nameCell.q, nameCell.r, name);
    setBusy(null);
    if (res.error) {
      setNameError(res.error);
      return;
    }
    setNameCell(null);
    void load();
    await notify('Petek adı değişti', `Peteğin artık haritada “${res.name ?? name}” adıyla görünüyor.`, {
      icon: 'checkmark-circle',
      tone: 'success',
    });
  }

  // İlerleme: en pahalı öğeye göre çubuk, öğelerin fiyatları işaret olarak
  const maxCost = data ? Math.max(1, ...data.items.map((i) => i.cost)) : 3;
  const balance = data ? Math.max(0, data.balance) : 0;
  const ratio = Math.min(1, balance / maxCost);

  return (
    <Screen
      title="Arkadaşlarını davet et"
      subtitle="Davet et, davet puanı kazan, ödülleri al"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      onRefresh={() => void load()}
      overlay={
        nameCell ? (
          <Popup title="Petek adını değiştir" icon="map" onClose={() => setNameCell(null)}>
            <Text style={styles.muted}>
              Seçtiğin petek: <Text style={styles.strong}>{cellName(nameCell)}</Text>
            </Text>
            <TextField
              label="Yeni petek adı"
              icon="create-outline"
              value={newName}
              onChangeText={(t) => {
                setNewName(t);
                setNameError(null);
              }}
              placeholder="ör. mavi kuş tepesi"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
            />
            {newName.trim() ? (
              <Text style={styles.muted}>
                Haritada şöyle görünecek: <Text style={styles.strong}>{cleanCellName(newName)}</Text>
              </Text>
            ) : null}
            {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
            <PrimaryButton label="Onayla" onPress={() => void onConfirmName()} loading={busy === 'name'} />
            <PrimaryButton label="Başka petek seç" variant="ghost" onPress={() => setPickOpen(true)} />
          </Popup>
        ) : null
      }
    >
      {error && !data ? <Text style={styles.error}>{error}</Text> : null}

      {/* 1) İlerleme */}
      <LinearGradient
        colors={['rgba(255, 200, 61, 0.22)', 'rgba(34, 211, 197, 0.12)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.progressCard}
      >
        <View style={styles.progressTop}>
          <Ionicons name="gift" size={22} color={colors.highlight} />
          <Text style={styles.progressLabel}>Davet puanın</Text>
          <Text style={styles.progressValue}>{data ? balance : '…'}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
          {data?.items.map((it) => (
            <View key={it.item} style={[styles.mark, { left: `${Math.round((it.cost / maxCost) * 100)}%` }]} />
          ))}
        </View>
        <View style={styles.markLabels}>
          {data?.items
            .slice()
            .sort((a, b) => a.cost - b.cost)
            .map((it) => (
              <Text key={it.item} style={[styles.markText, balance >= it.cost && styles.markTextOn]} numberOfLines={1}>
                {`${it.cost} · ${INVITE_ITEM_INFO[it.item].title.replace(/“|”/g, '')}`}
              </Text>
            ))}
        </View>
        <View style={styles.stats}>
          <Stat label="Davet ettiğin" value={data?.invited ?? 0} />
          <Stat label="Puan getiren" value={data?.earned ?? 0} />
          <Stat label="Bekleyen" value={data?.pending ?? 0} />
        </View>
        <Text style={styles.rule}>
          {`Arkadaşın kodunla kayıt olup ${data?.reward_days ?? 30} gün içinde ${data?.reward_points ?? 100} puana ulaşınca sana `}
          <Text style={styles.ruleStrong}>1 davet puanı</Text>
          {' yazılır.'}
        </Text>
      </LinearGradient>

      {/* 2) Davet kodu ve paylaşma */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Davet kodun (değiştirilemez)</Text>
        <Pressable
          onPress={() => void onCopy()}
          accessibilityRole="button"
          accessibilityLabel={data ? `Davet kodun ${data.code.split('').join(' ')}. Kopyalamak için dokun` : 'Davet kodu'}
          style={({ pressed }) => [styles.codeBox, pressed && styles.pressed]}
        >
          <Text style={styles.code} selectable>
            {data?.code ?? '·······'}
          </Text>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.shareRow}>
          <Pressable
            onPress={() => data && void shareInvite(data.code, data.download_url)}
            disabled={!data}
            accessibilityRole="button"
            testID="invite-share-link"
            style={({ pressed }) => [styles.shareBtn, styles.shareLink, pressed && styles.pressed]}
          >
            <Ionicons name="link" size={18} color={colors.primaryText} />
            <Text style={styles.shareLinkText}>Bağlantı olarak paylaş</Text>
          </Pressable>
          <Pressable
            onPress={() => void onContacts()}
            disabled={!data || busy === 'contacts'}
            accessibilityRole="button"
            testID="invite-contacts"
            style={({ pressed }) => [styles.shareBtn, styles.shareContacts, pressed && styles.pressed]}
          >
            <Ionicons name="people" size={18} color={colors.text} />
            <Text style={styles.shareContactsText}>Rehberden davet et</Text>
          </Pressable>
        </View>
      </View>

      {/* Davet kodu gir (yalnızca yeni hesaplarda) */}
      {data?.can_redeem ? (
        <View style={styles.redeemCard}>
          <Text style={styles.codeLabel}>Seni biri davet etti mi? Kodunu yaz (kayıttan sonraki 7 gün içinde)</Text>
          <TextField
            label="Davet kodu"
            icon="key-outline"
            value={redeemCode}
            onChangeText={(t) => setRedeemCode(t.replace(/\s/g, '').toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
          />
          <PrimaryButton
            label="Kodu ekle"
            variant="ghost"
            onPress={() => void onRedeem()}
            loading={busy === 'redeem'}
            disabled={redeemCode.trim().length < 5}
          />
        </View>
      ) : null}

      {/* 3) Davet mağazası */}
      <View style={styles.shopHead}>
        <Ionicons name="storefront" size={18} color={colors.highlight} />
        <Text style={styles.shopTitle}>Davet puanıyla al</Text>
      </View>
      <Text style={styles.muted}>Her öğe hesap başına yalnızca bir kez alınabilir.</Text>
      {data?.items.map((it) => {
        const info = INVITE_ITEM_INFO[it.item];
        const canBuy = !it.owned && balance >= it.cost;
        return (
          <View key={it.item} style={[styles.item, it.owned && styles.itemOwned]} testID={`invite-item-${it.item}`}>
            <View style={styles.itemIcon}>
              <Ionicons name={info.icon} size={22} color={colors.highlight} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{info.title}</Text>
              <Text style={styles.itemDesc}>{info.text}</Text>
              {it.item === 'cell_name' && it.used && it.detail ? (
                <Text style={styles.itemDone}>{`Kullanıldı: ${it.detail.name}`}</Text>
              ) : null}
            </View>
            <View style={styles.itemSide}>
              <Text style={styles.itemCost}>{`${it.cost} puan`}</Text>
              {it.item === 'cell_name' && it.owned && !it.used ? (
                <Pressable
                  onPress={() => setPickOpen(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.buyBtn, styles.useBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.buyText}>Kullan</Text>
                </Pressable>
              ) : it.owned ? (
                <View style={styles.ownedChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.ownedText}>Alındı</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => void onBuy(it)}
                  disabled={!canBuy || busy !== null}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.buyBtn, !canBuy && styles.buyOff, pressed && styles.pressed]}
                >
                  <Text style={styles.buyText}>Satın al</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      <EventCellPicker
        visible={pickOpen}
        initial={null}
        eventCells={NO_CELLS}
        title="Adını değiştirmek istediğin petek"
        hint="Haritadan özel adı olmayan bir peteğe dokun."
        confirmLabel="Bu peteği seç"
        onClose={() => setPickOpen(false)}
        onPick={(cell) => onPickCell(cell)}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  strong: { color: colors.text, fontFamily: fonts.extra },
  pressed: { opacity: 0.8 },
  progressCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 61, 0.45)',
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressLabel: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  progressValue: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.xxl },
  track: { height: 12, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'visible' },
  fill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.highlight },
  mark: {
    position: 'absolute',
    top: -3,
    width: 4,
    height: 18,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: colors.text,
    opacity: 0.6,
  },
  markLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  markText: { flexShrink: 1, color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  markTextOn: { color: colors.highlight },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  statLabel: { color: colors.textMuted, fontSize: 11 },
  rule: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  ruleStrong: { color: colors.highlight, fontFamily: fonts.extra },
  codeCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface },
  codeLabel: { color: colors.textMuted, fontSize: fontSizes.sm, fontFamily: fonts.semi },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  code: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.xxl, letterSpacing: 6 },
  shareRow: { flexDirection: 'row', gap: spacing.sm },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  shareLink: { backgroundColor: colors.primary },
  shareLinkText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 13, flexShrink: 1 },
  shareContacts: { borderWidth: 1.5, borderColor: colors.border },
  shareContactsText: { color: colors.text, fontFamily: fonts.extra, fontSize: 13, flexShrink: 1 },
  redeemCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface },
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  shopTitle: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemOwned: { borderColor: 'rgba(52, 211, 153, 0.5)' },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 200, 61, 0.12)',
  },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  itemDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  itemDone: { color: colors.success, fontSize: 12, fontFamily: fonts.semi },
  itemSide: { alignItems: 'center', gap: 6 },
  itemCost: { color: colors.highlight, fontFamily: fonts.black, fontSize: fontSizes.sm },
  buyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.highlight,
  },
  useBtn: { backgroundColor: colors.primary },
  buyOff: { opacity: 0.4 },
  buyText: { color: '#1A1200', fontFamily: fonts.extra, fontSize: 12 },
  ownedChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownedText: { color: colors.success, fontFamily: fonts.extra, fontSize: 12 },
});
