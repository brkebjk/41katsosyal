// Petek (altıgen) ızgarası: konumu "hangi petekte" bilgisine çevirir.
//
// Telefonun ham konumu sunucuya hiç gitmez; yalnızca bulunduğu peteğin numarası (q, r) gider.
// Aynı matematik `tools/hexgrid.py` içinde de vardır (yer listesindeki yerlerin peteklerini orada hesaplıyoruz);
// ikisi birebir aynı sonucu vermelidir. Petek boyutunu ya da başlangıç noktasını değiştirirsen ikisini birlikte
// değiştir ve yer listesini yeniden hazırla.

import raw from '@/lib/kocaeliCells.json';

type CellsFile = {
  v: number;
  /** Peteğin merkezden köşeye uzunluğu (metre) */
  size: number;
  lon0: number;
  lat0: number;
  districts: string[];
  /** [satır r, ilk q, son q, ilçe sırası] */
  ranges: [number, number, number, number][];
  /** İlçe adı, x, y (metre; y kuzeye doğru), alan (km²) */
  labels: [string, number, number, number][];
  /** İlçe sınırları: [x0, y0, x1, y1, …] ×ringUnit metre */
  rings: number[][];
  ringUnit: number;
};

const DATA = raw as unknown as CellsFile;

export type Cell = { q: number; r: number };

export const HEX_SIZE = DATA.size;
const SQ3 = Math.sqrt(3);
const M_LAT = 110574;
const M_LON = 111320 * Math.cos((DATA.lat0 * Math.PI) / 180);

/** Enlem/boylamı başlangıç noktasına göre metreye çevirir (x doğuya, y kuzeye). */
export function project(lon: number, lat: number): { x: number; y: number } {
  return { x: (lon - DATA.lon0) * M_LON, y: (lat - DATA.lat0) * M_LAT };
}

export function cellOfXY(x: number, y: number): Cell {
  const qf = ((SQ3 / 3) * x - y / 3) / HEX_SIZE;
  const rf = ((2 / 3) * y) / HEX_SIZE;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 }; // "+ 0": -0 değerini 0 yapar
}

/** Bir konumun bulunduğu petek. */
export function cellOf(lon: number, lat: number): Cell {
  const { x, y } = project(lon, lat);
  return cellOfXY(x, y);
}

/** Peteğin merkezi (metre; y kuzeye doğru). */
export function cellCenter(q: number, r: number): { x: number; y: number } {
  return { x: HEX_SIZE * SQ3 * (q + r / 2), y: HEX_SIZE * 1.5 * r };
}

/** İki petek arası adım sayısı (komşu = 1). */
export function hexDistance(a: Cell, b: Cell): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const key = (q: number, r: number) => (r + 1000) * 10000 + (q + 1000);

const LAND = new Map<number, number>();
const LAND_LIST: Cell[] = [];
for (const [r, q0, q1, d] of DATA.ranges) {
  for (let q = q0; q <= q1; q++) {
    LAND.set(key(q, r), d);
    LAND_LIST.push({ q, r });
  }
}

export function isLand(q: number, r: number): boolean {
  return LAND.has(key(q, r));
}

/** Petek Kocaeli'nin hangi ilçesinde? (deniz/dışarıdaysa null) */
export function districtOf(q: number, r: number): string | null {
  const d = LAND.get(key(q, r));
  return d === undefined ? null : DATA.districts[d];
}

export const LAND_CELLS: readonly Cell[] = LAND_LIST;

/** Ekrana sığdırmak için kara alanının sınırları (metre). */
export const BOUNDS = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of LAND_LIST) {
    const p = cellCenter(c.q, c.r);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX: minX - HEX_SIZE, maxX: maxX + HEX_SIZE, minY: minY - HEX_SIZE, maxY: maxY + HEX_SIZE };
})();

export type DistrictLabel = { name: string; x: number; y: number; areaKm2: number };

export const DISTRICT_LABELS: readonly DistrictLabel[] = DATA.labels.map(([name, x, y, areaKm2]) => ({
  name,
  x,
  y,
  areaKm2,
}));

const f1 = (n: number) => Math.round(n * 10) / 10;

/**
 * SVG yol (path) metni üretir. Çizim uzayında y aşağı doğrudur (kuzey yukarıda olsun diye y ters çevrilir).
 * Her petek tek bir kapalı altıgendir; aynı seviyedeki bütün petekler tek yolda toplanır.
 * `inset` 1'den küçükse altıgenler hafifçe küçülür; aralarında ince boşluk kalır (çizgi çizmeden ızgara görünümü).
 */
export function hexPath(cells: readonly Cell[], inset = 1): string {
  const parts: string[] = [];
  const h = HEX_SIZE * inset;
  const dx = (h * SQ3) / 2;
  for (const c of cells) {
    const { x, y } = cellCenter(c.q, c.r);
    const cx = x;
    const cy = -y;
    parts.push(
      `M${f1(cx)} ${f1(cy - h)}L${f1(cx + dx)} ${f1(cy - h / 2)}L${f1(cx + dx)} ${f1(cy + h / 2)}` +
        `L${f1(cx)} ${f1(cy + h)}L${f1(cx - dx)} ${f1(cy + h / 2)}L${f1(cx - dx)} ${f1(cy - h / 2)}Z`,
    );
  }
  return parts.join('');
}

/**
 * Petek kenarlarının yalnızca bir yarısı (açık çizgi): `right` = sağ yarı (üst köşe → sağ kenar → alt köşe),
 * `left` = sol yarı. Bir peteğin iki ayrı renkle (ör. etkinlik + oyun) çerçevelenmesi için kullanılır.
 */
export function hexHalfPath(cells: readonly Cell[], side: 'left' | 'right', inset = 1): string {
  const parts: string[] = [];
  const h = HEX_SIZE * inset;
  const dx = (h * SQ3) / 2;
  const s = side === 'right' ? 1 : -1;
  for (const c of cells) {
    const { x, y } = cellCenter(c.q, c.r);
    const cx = x;
    const cy = -y;
    parts.push(
      `M${f1(cx)} ${f1(cy - h)}L${f1(cx + s * dx)} ${f1(cy - h / 2)}L${f1(cx + s * dx)} ${f1(cy + h / 2)}` +
        `L${f1(cx)} ${f1(cy + h)}`,
    );
  }
  return parts.join('');
}

/** Izgaranın görünen küçük altıgen boşluk oranı (komşu petekler arasında ince çizgi gibi görünür). */
export const HEX_INSET = 0.94;

export type Tile = {
  key: string;
  /** Çizim uzayında (y aşağı) sınırlar, metre */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  path: string;
};

const TILE_M = 10_000;

/**
 * Kara petekleri 10 km'lik karelere (parçalara) bölünür. Harita yakınlaşınca yalnızca ekrana değen parçalar
 * çizilir; bu sayede kaydırırken ve yakınlaştırırken telefon 5 binden fazla altıgeni her karede yeniden çizmez.
 */
export const LAND_TILES: readonly Tile[] = (() => {
  const groups = new Map<string, Cell[]>();
  for (const c of LAND_LIST) {
    const { x, y } = cellCenter(c.q, c.r);
    const k = `${Math.floor(x / TILE_M)}:${Math.floor(y / TILE_M)}`;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const out: Tile[] = [];
  const half = (HEX_SIZE * SQ3) / 2;
  for (const [key, cells] of groups) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cells) {
      const { x, y } = cellCenter(c.q, c.r);
      minX = Math.min(minX, x - half);
      maxX = Math.max(maxX, x + half);
      minY = Math.min(minY, -y - HEX_SIZE);
      maxY = Math.max(maxY, -y + HEX_SIZE);
    }
    out.push({ key, minX, maxX, minY, maxY, path: hexPath(cells, HEX_INSET) });
  }
  return out;
})();

/** İlçe sınırlarının yolu (çizim uzayında). */
export const OUTLINE_PATH: string = DATA.rings
  .map((ring) => {
    const pts: string[] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) {
      pts.push(`${ring[i] * DATA.ringUnit} ${-ring[i + 1] * DATA.ringUnit}`);
    }
    return `M${pts.join('L')}Z`;
  })
  .join('');
