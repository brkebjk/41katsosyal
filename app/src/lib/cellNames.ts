// Petek adları: her peteğin bir adı vardır (ör. “adalar-sahili”, “yıldız-geçidi”).
//
// Ad, peteğin haritadaki sırasından kendiliğinden üretilir; aynı ad iki petekte çıkmaz. Moderatör bir peteğe başka ad
// verirse (sunucudaki map_cell_names) o ad kullanılır. Moderatör adları uygulama açıkken bir kez okunur.

import { LAND_CELLS, type Cell } from '@/lib/hex';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

const FIRST = [
  'adalar', 'akıncı', 'altın', 'anka', 'arı', 'asma', 'aslan', 'ayaz', 'ayva', 'badem', 'bakır', 'balık',
  'başak', 'bayrak', 'bulut', 'ceviz', 'ceylan', 'çakıl', 'çam', 'çay', 'çınar', 'çiçek', 'dalga', 'defne',
  'demir', 'deniz', 'doğan', 'dolunay', 'duman', 'elma', 'erik', 'fener', 'fırtına', 'gelincik', 'gök',
  'gümüş', 'güneş', 'hilal', 'ılgın', 'ırmak', 'ilkbahar', 'inci', 'kale', 'kanarya', 'kaplan', 'kartal',
  'kavak', 'kelebek', 'keklik', 'kestane', 'kırlangıç', 'kızılcık', 'kumru', 'kuzey', 'lale', 'leylek',
  'martı', 'mehtap', 'menekşe', 'mercan', 'meşe', 'nar', 'nergis', 'ok', 'papatya', 'poyraz', 'rüzgar',
  'sakız', 'serçe', 'servi', 'sis', 'söğüt', 'sümbül', 'şafak', 'şahin', 'şimşek', 'turna', 'yakamoz',
  'yaprak', 'yıldız', 'yunus', 'zeytin',
];

const SECOND = [
  'sahili', 'tepesi', 'geçidi', 'koyu', 'yamacı', 'meydanı', 'korusu', 'vadisi', 'çarşısı', 'bayırı',
  'burnu', 'sırtı', 'yolu', 'köşesi', 'durağı', 'bahçesi', 'limanı', 'iskelesi', 'kapısı', 'çeşmesi',
  'köprüsü', 'ovası', 'yaylası', 'düzlüğü', 'yokuşu', 'kıyısı', 'deresi', 'pınarı', 'kuyusu', 'kulesi',
  'avlusu', 'sokağı', 'mahallesi', 'semti', 'obası', 'harmanı', 'bağı', 'bostanı', 'tarlası', 'çayırı',
  'ormanı', 'gölü', 'adası', 'körfezi', 'boğazı', 'kayası', 'mağarası', 'zirvesi', 'eteği', 'kanyonu',
  'kenarı', 'ucu', 'başı', 'dibi', 'yatağı', 'çatısı', 'konağı', 'hanı', 'sarayı', 'kalesi', 'surları',
  'bendi', 'şelalesi', 'kumsalı', 'feneri', 'yuvası', 'otağı', 'çadırı', 'sofrası', 'pazarı', 'değirmeni',
  'ambarı',
];

const TOTAL = FIRST.length * SECOND.length;
/** TOTAL ile aralarında asal: sıradaki petekler birbirine benzemeyen adlar alır, hiçbir ad tekrar etmez */
const STRIDE = 7919;

let indexByKey: Map<string, number> | null = null;
function cellIndex(q: number, r: number): number | null {
  if (!indexByKey) {
    indexByKey = new Map();
    LAND_CELLS.forEach((c, i) => indexByKey?.set(`${c.q},${c.r}`, i));
  }
  return indexByKey.get(`${q},${r}`) ?? null;
}

/** Peteğin uygulamanın ürettiği adı (moderatör adı yoksa kullanılır). Kara dışındaki petekte boş döner. */
export function generatedCellName(q: number, r: number): string | null {
  const i = cellIndex(q, r);
  if (i === null) return null;
  const k = (i * STRIDE + 17) % TOTAL;
  return `${FIRST[Math.floor(k / SECOND.length)]}-${SECOND[k % SECOND.length]}`;
}

let overrides = new Map<string, string>();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Moderatörün verdiği adları sunucudan okur (uygulama açıkken bir kez; force ile yeniden). */
export function loadCellNames(force = false): Promise<void> {
  if (loaded && !force) return loaded;
  loaded = (async () => {
    const { data, error } = await callRpc<{ q: number; r: number; name: string }[]>('list_cell_names');
    if (error || !data) {
      loaded = null;
      return;
    }
    overrides = new Map(data.map((n) => [`${n.q},${n.r}`, n.name]));
    listeners.forEach((l) => l());
  })();
  return loaded;
}

export function onCellNamesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Peteğin adı: moderatörün verdiği ad, yoksa üretilen ad. */
export function cellName(cell: Cell | { q: number; r: number }): string {
  return overrides.get(`${cell.q},${cell.r}`) ?? generatedCellName(cell.q, cell.r) ?? 'adsız-petek';
}

export const CELL_NAME_RE = /^[a-zçğıöşüâîû0-9]+(-[a-zçğıöşüâîû0-9]+)*$/;

/** Yazılan adı biçime sokar: küçük harf, boşluklar tire. */
export function cleanCellName(text: string): string {
  return text.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '-').replace(/-+/g, '-');
}

const NAME_TEXT: Record<string, string> = {
  invalid_cell_name: 'Ad 3–40 karakter olmalı; küçük harf ve rakam, kelimeler arasında tire (ör. adalar-sahili).',
  cell_name_taken: 'Bu ad başka bir peteğe verilmiş. Başka bir ad seç.',
  invalid_cell: 'Bu petek Kocaeli haritasında değil.',
};

/** Moderatör: peteğe ad ver. Boş ad = moderatörün adı silinir, üretilen ada dönülür. */
export async function setCellName(cell: Cell, name: string): Promise<Result> {
  const res = await callRpcVoid('admin_set_cell_name', { p_q: cell.q, p_r: cell.r, p_name: name }, NAME_TEXT);
  if (!res.error) await loadCellNames(true);
  return res;
}
