// Bildirim noktaları: alt sekmelerde ve ilgili ekranlarda kırmızı uyarı için ortak sayaçlar.
// Sayılar sunucudaki tek bir fonksiyondan (my_notice_counts) gelir; moderatör sayıları üyelerde her zaman 0'dır.

import { useSyncExternalStore } from 'react';

import { callRpc } from '@/lib/rpc';

export type Notices = {
  /** Yanıtımı bekleyen arkadaşlık istekleri */
  friendRequests: number;
  /** Katıldığım ve şu an kod girişi açık olan, henüz doğrulamadığım etkinlikler */
  checkinEvents: number;
  /** Moderatör: açık şikayetler */
  modReports: number;
  /** Moderatör: bekleyen etkinlik kapatma talepleri */
  modCloseRequests: number;
  /** Moderatör: bekleyen etkinlik lideri başvuruları */
  modLeaderApps: number;
  /** Moderatör: yeni petek adı adayları */
  modCellCandidates: number;
  /** Moderatör: bulunan, henüz görülmemiş hazineler */
  modTreasures: number;
  /** Moderatör: onay bekleyen Konser & Festival etkinlikleri ve etkinlik görselleri */
  modApprovals: number;
  /** Moderatör: cevap bekleyen Kat Görevlisi yazışmaları */
  modMessages: number;
  /** Bildirim kutusunda (harita ekranı) okunmamış bildirim ve duyuru */
  notifications: number;
};

const EMPTY: Notices = {
  friendRequests: 0,
  checkinEvents: 0,
  modReports: 0,
  modCloseRequests: 0,
  modLeaderApps: 0,
  modApprovals: 0,
  modTreasures: 0,
  modCellCandidates: 0,
  modMessages: 0,
  notifications: 0,
};

let current: Notices = EMPTY;
const listeners = new Set<() => void>();

function same(a: Notices, b: Notices): boolean {
  return (
    a.friendRequests === b.friendRequests &&
    a.checkinEvents === b.checkinEvents &&
    a.modReports === b.modReports &&
    a.modCloseRequests === b.modCloseRequests &&
    a.modLeaderApps === b.modLeaderApps &&
    a.modApprovals === b.modApprovals &&
    a.modTreasures === b.modTreasures &&
    a.modCellCandidates === b.modCellCandidates &&
    a.modMessages === b.modMessages &&
    a.notifications === b.notifications
  );
}

/** Verilen alanları günceller; değişmediyse ekranları yeniden çizdirmez. */
export function patchNotices(patch: Partial<Notices>): void {
  const next = { ...current, ...patch };
  if (same(current, next)) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useNotices(): Notices {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => EMPTY,
  );
}

type NoticeRow = {
  friend_requests?: number;
  checkin_events?: number;
  mod_reports?: number;
  mod_close_requests?: number;
  mod_leader_apps?: number;
  mod_approvals?: number;
  mod_treasures?: number;
  mod_cell_candidates?: number;
  mod_messages?: number;
  notifications?: number;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * Sayıları sunucudan okur. Sunucu henüz yeni sürüme güncellenmediyse yalnızca arkadaşlık istekleri okunur.
 * Hata olursa eski sayılar aynı kalır (nokta yanlışlıkla kaybolmaz).
 */
export async function refreshNotices(): Promise<void> {
  const { data, error } = await callRpc<NoticeRow>('my_notice_counts');
  if (!error && data) {
    patchNotices({
      friendRequests: num(data.friend_requests),
      checkinEvents: num(data.checkin_events),
      modReports: num(data.mod_reports),
      modCloseRequests: num(data.mod_close_requests),
      modLeaderApps: num(data.mod_leader_apps),
      modApprovals: num(data.mod_approvals),
      modTreasures: num(data.mod_treasures),
      modCellCandidates: num(data.mod_cell_candidates),
      modMessages: num(data.mod_messages),
      notifications: num(data.notifications),
    });
    return;
  }
  const old = await callRpc<number>('my_friend_request_count');
  if (!old.error && typeof old.data === 'number') patchNotices({ friendRequests: num(old.data) });
}

/** Çıkış yapılınca önceki hesabın noktaları kalmasın. */
export function resetNotices(): void {
  patchNotices(EMPTY);
}
