// Arkadaşını davet et: davet kodu, davet puanı ve davet mağazası.
// Davet edilen kişi kodla kayıt olur; kayıttan sonraki süre içinde (30 gün) 100 puana ulaşınca davet edene 1 davet
// puanı yazılır. Davet puanıyla alınan öğeler hesap başına bir kez alınabilir. Kurallar sunucuda uygulanır.

import { Share } from 'react-native';

import { brand } from '@/theme';
import { loadCellNames } from '@/lib/cellNames';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type InviteItemKey = 'cell_name' | 'premium_month' | 'title';

export type InviteItem = {
  item: InviteItemKey;
  cost: number;
  owned: boolean;
  used: boolean;
  detail: { q: number; r: number; name: string } | null;
};

export type MyInvite = {
  code: string;
  invited: number;
  earned: number;
  pending: number;
  balance: number;
  reward_points: number;
  reward_days: number;
  can_redeem: boolean;
  download_url: string;
  items: InviteItem[];
};

export const INVITE_ITEM_INFO: Record<InviteItemKey, { title: string; text: string; icon: 'map' | 'diamond' | 'ribbon' }> = {
  cell_name: {
    title: 'Peteğe ad verme hakkı',
    text: 'Haritada henüz özel adı olmayan bir peteğe kendi seçtiğin adı ver. Tek kullanımlık; satın aldıktan sonra istediğin zaman kullanırsın.',
    icon: 'map',
  },
  premium_month: {
    title: '1 aylık abonelik',
    text: 'Satın alınca hesabına hemen 1 aylık abonelik eklenir. Aboneysen süren 1 ay uzar.',
    icon: 'diamond',
  },
  title: {
    title: '“Elçi” unvanı',
    text: 'Gerçek adının göründüğü yerlerde (arkadaşlar, sıralama, etkinlik) adının yanında kalıcı “Elçi” unvanı görünür.',
    icon: 'ribbon',
  },
};

const TEXT: Record<string, string> = {
  already_bought: 'Bu öğeyi zaten aldın. Her öğe hesap başına bir kez alınabilir.',
  not_enough_invite_points: 'Davet puanın yetmiyor. Arkadaşlarını davet etmeye devam et!',
  invalid_item: 'Bu öğe bulunamadı.',
  item_not_owned: 'Önce bu öğeyi davet puanınla almalısın.',
  item_used: 'Bu hakkı zaten kullandın.',
  invalid_cell: 'Bu petek haritada değil.',
  cell_already_named: 'Bu peteğin zaten özel bir adı var. Başka bir petek seç.',
  invalid_cell_name:
    'Ad 3–40 karakter olmalı; yalnızca küçük harf ve rakam, kelimeler arasında tire (ör. mavi-kus-tepesi). Uygunsuz kelime, iletişim bilgisi ya da “PeopleHere”, “Moderatör” içeremez.',
  cell_name_taken: 'Bu ad başka bir peteğe verilmiş. Başka bir ad seç.',
  invite_too_late: 'Davet kodu yalnızca kayıttan sonraki 7 gün içinde girilebilir.',
  invite_already_used: 'Zaten bir davet kodu kullandın.',
  invite_not_found: 'Bu davet kodu bulunamadı. Kodu kontrol et.',
};

export async function getMyInvite(): Promise<{ data: MyInvite | null; error: string | null }> {
  return callRpc<MyInvite>('my_invite', {}, TEXT);
}

export async function buyInviteItem(item: InviteItemKey): Promise<Result> {
  return callRpcVoid('invite_buy', { p_item: item }, TEXT);
}

export async function redeemInviteCode(code: string): Promise<Result> {
  return callRpcVoid('redeem_invite_code', { p_code: code.trim().toUpperCase() }, TEXT);
}

/** Petek adı hakkını kullanır; başarılıysa haritadaki adlar yeniden okunur. */
export async function applyCellNameRight(q: number, r: number, name: string): Promise<{ name: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('invite_use_cell_name', { p_q: q, p_r: r, p_name: name }, TEXT);
  if (!error) await loadCellNames(true);
  return { name: data, error };
}

/** Paylaşılacak davet mesajı (kod + varsa indirme bağlantısı) */
export function inviteMessage(code: string, downloadUrl: string): string {
  return (
    `${brand.name}'a gel, birlikte etkinliklere katılıp oyun oynayalım! ` +
    `Kayıt olurken davet kodumu yaz: ${code}` +
    (downloadUrl ? `\nUygulamayı indir: ${downloadUrl}` : '')
  );
}

export async function shareInvite(code: string, downloadUrl: string): Promise<void> {
  try {
    await Share.share({ message: inviteMessage(code, downloadUrl) });
  } catch {
    // Paylaşım penceresi açılamadıysa kod ekranda zaten görünüyor
  }
}
