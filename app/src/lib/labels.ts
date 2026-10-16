// Ekranlarda gösterilen Türkçe metin karşılıkları.

export type PackageType = 'daily' | 'monthly' | 'quarterly' | 'yearly';

/** Moderatörün üyeye verebildiği abonelik paketlerinin yazısı */
export const packageRewardText: Record<PackageType, string> = {
  daily: '1 gün abonelik',
  monthly: '1 ay abonelik',
  quarterly: '3 ay abonelik',
  yearly: '1 yıl abonelik',
};

export const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
export const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:30" */
export function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 2026-11-05T... gibi bir tarihi "5 Kasım 2026" biçimine çevirir (telefonun diline bağlı değildir). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Cumartesi, 10 Ekim · 20:30" */
export function formatWhen(d: Date): string {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} · ${formatTime(d)}`;
}

/** Ücreti "150 ₺" ya da "75,50 ₺" biçiminde yazar. */
export function formatMoney(amount: number): string {
  const whole = Number.isInteger(amount);
  const text = whole ? String(amount) : amount.toFixed(2).replace('.', ',');
  return `${text} ₺`;
}

/**
 * Rumuzlar (ve akış, rumuz profilleri) her Pazartesi 00:00'da (Türkiye saati) yenilenir. Bir sonraki yenilenme anını ve
 * ona kalan süreyi döndürür. Türkiye'de yaz saati uygulaması olmadığı için sabit UTC+3 kullanılır.
 */
export function nextAliasChange(now: Date = new Date()): { label: string; remaining: string } {
  const OFFSET = 3 * 3600 * 1000;
  const istanbul = new Date(now.getTime() + OFFSET); // UTC alanları = Türkiye saati
  const dow = istanbul.getUTCDay();
  const daysAhead = (8 - dow) % 7 || 7; // bir sonraki Pazartesi
  const targetIstanbul = Date.UTC(istanbul.getUTCFullYear(), istanbul.getUTCMonth(), istanbul.getUTCDate() + daysAhead);
  const target = new Date(targetIstanbul);
  const label = `${target.getUTCDate()} ${MONTH_NAMES[target.getUTCMonth()]} Pazartesi 00:00`;
  const ms = targetIstanbul - OFFSET - now.getTime();
  const hours = Math.max(1, Math.round(ms / 3600000));
  const remaining = hours >= 48 ? `${Math.round(hours / 24)} gün sonra` : hours >= 24 ? 'yarın' : `${hours} saat sonra`;
  return { label, remaining };
}

/** Verilen zaman henüz gelmediyse true (ör. susturma bitmedi mi?). Boş değer false sayılır. */
export function isFuture(iso: string | null | undefined): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() > Date.now();
}

/** Üyelerin kullanamayacağı adlar: resmi hesabı taklit edenler. Sunucudaki denetimle aynı kural. */
export const RESERVED_NAME_TEXT =
  'Bu ad kullanılamaz. “PeopleHere”, “Moderatör” veya “Yönetici” içeren adlar ayrılmıştır.';

export function isReservedName(name: string): boolean {
  const plain = name.toLowerCase().replace(/[^a-z0-9ğüşıöçâîû]/g, '');
  return /(peoplehere|moderat|yonetici|yönetici)/.test(plain);
}

/** Hazine Avı ödülü: ömür boyu abonelik (bitişi 2100'e yazılır) */
export function isLifetimeSubscription(subscriptionUntil: string | null | undefined): boolean {
  return Boolean(subscriptionUntil) && new Date(subscriptionUntil as string).getFullYear() >= 2099;
}

/** Abonelik bitiş cümlesi: "12.11.2026 tarihine kadar geçerli" ya da "Ömür boyu" */
export function subscriptionUntilText(subscriptionUntil: string, suffix = ' tarihine kadar geçerli.'): string {
  return isLifetimeSubscription(subscriptionUntil)
    ? 'Ömür boyu abonelik.'
    : `${formatDate(subscriptionUntil)}${suffix}`;
}

export function isSubscriptionActive(subscriptionUntil: string | null | undefined): boolean {
  return Boolean(subscriptionUntil) && new Date(subscriptionUntil as string).getTime() > Date.now();
}

/** Gönderi zamanı için kısa ifade: "az önce", "5 dk", "3 sa", "dün", "12 Eki". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} sa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'dün';
  if (days < 7) return `${days} gün`;
  const d = new Date(t);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/** Bir üyelik bitiş tarihini ve saatini "12 Kasım 2026" biçiminde gösterir; yoksa "yok". */
export function subscriptionText(subscriptionUntil: string | null | undefined): string {
  return isSubscriptionActive(subscriptionUntil)
    ? `${formatDate(subscriptionUntil as string)} tarihine kadar`
    : 'Abone değil';
}

/** İstanbul saatiyle (UTC+3) bugünün yıl ve ay numarası. Ay sıfırlanması da bu saate göredir. */
function istanbulMonth(now: Date): { year: number; month: number } {
  const t = new Date(now.getTime() + 3 * 3600 * 1000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() };
}

/** "Ekim 2026": monthsAgo 0 = bu ay, 1 = geçen ay. */
export function monthTitle(monthsAgo: number, now: Date = new Date()): string {
  const { year, month } = istanbulMonth(now);
  const d = new Date(Date.UTC(year, month - monthsAgo, 1));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** İstanbul saatiyle "Pazartesi, 12 Ekim" (sabit UTC+3). Sıralama güncellemeleri gece yarısı olduğu için saat yazılmaz. */
export function formatDayIstanbul(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 3 * 3600 * 1000);
  return `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/**
 * Bir ayın bittiği anın (sonraki ayın 00:00'ı) bir saniye öncesinin günü: "31 Ekim".
 * Ünvanın "son gün"ünü yazmak için kullanılır.
 */
export function lastDayBefore(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t - 1000 + 3 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** Bu ayın bitmesine kalan gün sayısı (son gün 1 döner). */
export function daysLeftInMonth(now: Date = new Date()): number {
  const { year, month } = istanbulMonth(now);
  const nextStart = Date.UTC(year, month + 1, 1) - 3 * 3600 * 1000;
  return Math.max(1, Math.ceil((nextStart - now.getTime()) / 86400000));
}

/**
 * Genel puanı yazıya çevirir: en çok 2 ondalık, gereksiz sıfır yok, nokta ile (309, 309.5, 309.25).
 * Bilgi Yarışması 1.25 gibi puanlar verdiği için puanlar ondalıklı olabilir.
 */
export function fmtPts(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v * 100) / 100);
}

/** İşaretli puan: +1.25 / -3 / 0 */
export function fmtPtsSigned(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v > 0 ? `+${fmtPts(v)}` : fmtPts(v);
}
