// Petek (altıgen) ızgarası: konumu "hangi petekte" bilgisine çevirir. Üç şehir: İstanbul, Kocaeli, İzmir.
//
// Telefonun ham konumu sunucuya hiç gitmez; yalnızca bulunduğu peteğin numarası (q, r) gider.
// Her şehir kendi merkezine göre metreye çevrilir, böylece her şehirde petek 500 m'dir. Peteğin numarası bütün
// uygulamada tektir: şehrin r değerine kaydırma eklenir (Kocaeli 0, İstanbul 1000, İzmir 2000); şehri r'den anlaşılır.
// Aynı matematik `tools/harita_hazirla.py` içinde de vardır (yer listesindeki yerlerin peteklerini orada hesaplıyoruz);
// ikisi birebir aynı sonucu vermelidir (yuvarlama dahil). Sunucuda şehir: public._cell_city(r).

import istanbulRaw from '@/lib/maps/istanbul.json';
import izmirRaw from '@/lib/maps/izmir.json';
import kocaeliRaw from '@/lib/maps/kocaeli.json';

export type CityKey = 'istanbul' | 'kocaeli' | 'izmir';
/** Seçim ekranlarındaki sıra */
export const CITY_KEYS: readonly CityKey[] = ['istanbul', 'kocaeli', 'izmir'];
export const CITY_NAMES: Record<CityKey, string> = { istanbul: 'İstanbul', kocaeli: 'Kocaeli', izmir: 'İzmir' };

type MapFile = {
  v: number;
  key: CityKey;
  name: string;
  /** Peteğin merkezden köşeye uzunluğu (metre) */
  size: number;
  lon0: number;
  lat0: number;
  /** Bu şehrin r kaydırması */
  rOff: number;
  /** Çizgi koordinatlarının birimi (metre) */
  unit: number;
  /** İlçelerin sunucudaki sıra numarasının başlangıcı */
  d0: number;
  districts: string[];
  /** İlçe adı, x, y (metre; y kuzeye doğru), alan (km²) */
  districtLabels: [string, number, number, number][];
  /** Mahalle adı, ilçe sırası, x, y, alan (km²) */
  hoods: [string, number, number, number, number][];
  /** Petek aralıkları (kısa metin): [satır farkı, q başlangıcı, uzunluk-1, mahalle] */
  ranges: string;
  /** İlçe sınırı ve kıyı çizgileri (kısa metin) */
  districtLines: string[];
  /** Mahalle sınırı çizgileri (kısa metin) */
  /** Mahalle sınırları (artık çizilmez; dosyada boş) */
  hoodLines: string[];
  /** Ana yollar (otoyol, D-yolu): silüet çizgisi */
  roadLines?: string[];
  /** Uzaktan bakınca kara boyaması: halkalar (göller delik) */
  fill: string[];
};

const FILES: Record<CityKey, MapFile> = {
  istanbul: istanbulRaw as unknown as MapFile,
  kocaeli: kocaeliRaw as unknown as MapFile,
  izmir: izmirRaw as unknown as MapFile,
};

export type Cell = { q: number; r: number };

export const HEX_SIZE = 500;
const SQ3 = Math.sqrt(3);
const M_LAT = 110574;

/** Kısa metni tam sayılara çevirir (tools/harita_hazirla.py pack() ile aynı: zigzag, 5 bitlik parçalar) */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_IX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_IX[B64[i]] = i;
function unpack(s: string): number[] {
  const out: number[] = [];
  let z = 0;
  let mul = 1;
  for (let i = 0; i < s.length; i++) {
    const v = B64_IX[s[i]];
    z += (v & 31) * mul;
    mul *= 32;
    if (!(v & 32)) {
      out.push(z % 2 === 0 ? z / 2 : -(z + 1) / 2);
      z = 0;
      mul = 1;
    }
  }
  return out;
}

/** Petek hangi şehirde? (r'den) */
export function cityOfR(r: number): CityKey | null {
  if (r >= -500 && r <= 499) return 'kocaeli';
  if (r >= 500 && r <= 1499) return 'istanbul';
  if (r >= 1500 && r <= 2499) return 'izmir';
  return null;
}

const mLon = (f: MapFile) => 111320 * Math.cos((f.lat0 * Math.PI) / 180);

function cubeRound(qf: number, rf: number): Cell {
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

/** Yerel (şehir) metre koordinatındaki peteğin yerel numarası */
function localCell(x: number, y: number): Cell {
  return cubeRound(((SQ3 / 3) * x - y / 3) / HEX_SIZE, ((2 / 3) * y) / HEX_SIZE);
}

/** Şehrin metre düzlemindeki bir noktanın peteği (genel numara; haritada dokunulan nokta) */
export function cellAtLocal(city: CityKey, x: number, y: number): Cell {
  const c = localCell(x, y);
  return { q: c.q, r: c.r + FILES[city].rOff };
}

/** Peteğin merkezi (kendi şehrinin metre düzleminde; y kuzeye doğru). */
export function cellCenter(q: number, r: number): { x: number; y: number } {
  const city = cityOfR(r);
  const lr = city ? r - FILES[city].rOff : r;
  return { x: HEX_SIZE * SQ3 * (q + lr / 2), y: HEX_SIZE * 1.5 * lr };
}

/** İki petek arası adım sayısı (komşu = 1). Farklı şehirlerin petekleri birbirinden çok uzak sayılır. */
export function hexDistance(a: Cell, b: Cell): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const key = (q: number, r: number) => (r + 5000) * 20000 + (q + 10000);

export type Tile = {
  key: string;
  /** Çizim uzayında (y aşağı) sınırlar, metre */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  path: string;
};

export type DistrictLabel = { name: string; x: number; y: number; areaKm2: number };

export type CityGeo = {
  key: CityKey;
  name: string;
  /** Kara petekleri (genel numara) */
  cells: readonly Cell[];
  /** Ekrana sığdırmak için kara alanının sınırları (metre; y kuzeye) */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Petek ızgarası parçaları (yakınlaşınca yalnızca ekrandakiler çizilir) */
  tiles: readonly Tile[];
  /** Uzaktan kara boyaması (evenodd: göller delik) */
  fillPath: string;
  /** İlçe sınırları ve kıyı (her zaman çizilir) */
  districtPath: string;
  /** Ana yolların (otoyol, D-yolu) silüeti */
  roadPath: string;
  districtLabels: readonly DistrictLabel[];
  /** Açılış (ve ziyaret) görünümü: ortadaki ilçe ve ekrana sığan genişlik (metre) */
  home: { district: string; spanM: number };
};

/**
 * Açılış görünümü: Kocaeli'de Derince, İstanbul'da Kadıköy, İzmir'de Balçova ortada; çevre ilçeler de görünür
 * (genişlik ekranın eni boyunca görünen mesafe).
 */
const HOME: Record<CityKey, { district: string; spanM: number }> = {
  kocaeli: { district: 'Derince', spanM: 30_000 },
  istanbul: { district: 'Kadıköy', spanM: 30_000 },
  izmir: { district: 'Balçova', spanM: 24_000 },
};

const TILE_M = 10_000;
const f1 = (n: number) => Math.round(n * 10) / 10;

type CityData = {
  file: MapFile;
  /** petek → mahalle sırası */
  land: Map<number, number>;
  cells: Cell[];
};

const DATA: Partial<Record<CityKey, CityData>> = {};

/** Şehrin petek listesi (ilk kullanımda çözülür) */
function cityData(city: CityKey): CityData {
  const have = DATA[city];
  if (have) return have;
  const file = FILES[city];
  const land = new Map<number, number>();
  const cells: Cell[] = [];
  const v = unpack(file.ranges);
  let pr = 0;
  let pq1 = 0;
  for (let i = 0; i + 3 < v.length; i += 4) {
    const dr = v[i];
    const r = pr + dr;
    const q0 = dr === 0 ? pq1 + v[i + 1] : v[i + 1];
    const q1 = q0 + v[i + 2];
    const h = v[i + 3];
    for (let q = q0; q <= q1; q++) {
      land.set(key(q, r + file.rOff), h);
      cells.push({ q, r: r + file.rOff });
    }
    pr = r;
    pq1 = q1;
  }
  const d: CityData = { file, land, cells };
  DATA[city] = d;
  return d;
}

export function isLand(q: number, r: number): boolean {
  const city = cityOfR(r);
  return city ? cityData(city).land.has(key(q, r)) : false;
}

/** Petek verilen şehrin karasında mı? (harita yalnızca kendi şehrinin peteklerini çizer) */
export function isLandIn(city: CityKey, q: number, r: number): boolean {
  return cityOfR(r) === city && cityData(city).land.has(key(q, r));
}

function hoodIndex(q: number, r: number): { file: MapFile; h: number } | null {
  const city = cityOfR(r);
  if (!city) return null;
  const d = cityData(city);
  const h = d.land.get(key(q, r));
  return h === undefined ? null : { file: d.file, h };
}

/** Petek hangi ilçede? (deniz/dışarıdaysa null) */
export function districtOf(q: number, r: number): string | null {
  const x = hoodIndex(q, r);
  if (!x) return null;
  const hood = x.file.hoods[x.h];
  return hood ? x.file.districts[hood[1]] : null;
}

/** Peteğin ilçesi; ilçesi yoksa (kıyı peteği) şehrin adı */
export function areaOf(q: number, r: number): string {
  const d = districtOf(q, r);
  if (d) return d;
  const c = cityOfR(r);
  return c ? CITY_NAMES[c] : 'Harita';
}

/** Petek hangi mahallede? (peteğin ortasının düştüğü mahalle; deniz/dışarıdaysa null) */
export function hoodOf(q: number, r: number): string | null {
  const x = hoodIndex(q, r);
  return x ? (x.file.hoods[x.h]?.[0] ?? null) : null;
}

/** Bir konumun bulunduğu petek. Konum hangi şehrin karasındaysa o şehrin peteği; hiçbirinde değilse en yakın şehrinki. */
export function cellOf(lon: number, lat: number): Cell {
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (const city of CITY_KEYS) {
    const f = FILES[city];
    const x = (lon - f.lon0) * mLon(f);
    const y = (lat - f.lat0) * M_LAT;
    const c = localCell(x, y);
    const g = { q: c.q, r: c.r + f.rOff };
    if (cityOfR(g.r) === city && cityData(city).land.has(key(g.q, g.r))) return g;
    const dist = Math.hypot(x, y);
    if (dist < bestDist && cityOfR(g.r) === city) {
      bestDist = dist;
      best = g;
    }
  }
  return best ?? { q: 0, r: 99999 };
}

/** Konum hangi şehrin haritasında? (hiçbirinde değilse null) */
export function cityOfLocation(lon: number, lat: number): CityKey | null {
  const c = cellOf(lon, lat);
  return isLand(c.q, c.r) ? cityOfR(c.r) : null;
}

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

/** Çizgi metnini noktalara çevirir (metre; y kuzeye) */
function linePoints(s: string, unit: number): number[] {
  const v = unpack(s);
  const pts: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < v.length; i += 2) {
    x += v[i];
    y += v[i + 1];
    pts.push(x * unit, y * unit);
  }
  return pts;
}

function svgLine(pts: number[], close: boolean): string {
  let d = '';
  for (let i = 0; i + 1 < pts.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${pts[i]} ${-pts[i + 1]}`;
  return close ? `${d}Z` : d;
}

const GEO: Partial<Record<CityKey, CityGeo>> = {};

/** Şehrin çizim verisi (ilk kullanımda hazırlanır, sonra saklanır) */
export function cityGeo(city: CityKey): CityGeo {
  const have = GEO[city];
  if (have) return have;
  const { file, cells } = cityData(city);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const p = cellCenter(c.q, c.r);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bounds = { minX: minX - HEX_SIZE, maxX: maxX + HEX_SIZE, minY: minY - HEX_SIZE, maxY: maxY + HEX_SIZE };

  // Kara petekleri 10 km'lik karelere (parçalara) bölünür: yakınlaşınca yalnızca ekrana değen parçalar çizilir
  const groups = new Map<string, Cell[]>();
  for (const c of cells) {
    const { x, y } = cellCenter(c.q, c.r);
    const k = `${Math.floor(x / TILE_M)}:${Math.floor(y / TILE_M)}`;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const tiles: Tile[] = [];
  const half = (HEX_SIZE * SQ3) / 2;
  for (const [k, list] of groups) {
    let a = Infinity;
    let b = -Infinity;
    let c0 = Infinity;
    let d = -Infinity;
    for (const c of list) {
      const { x, y } = cellCenter(c.q, c.r);
      a = Math.min(a, x - half);
      b = Math.max(b, x + half);
      c0 = Math.min(c0, -y - HEX_SIZE);
      d = Math.max(d, -y + HEX_SIZE);
    }
    tiles.push({ key: k, minX: a, maxX: b, minY: c0, maxY: d, path: hexPath(list, HEX_INSET) });
  }

  const fillPath = file.fill.map((s) => svgLine(linePoints(s, file.unit), true)).join('');
  const districtPath = file.districtLines.map((s) => svgLine(linePoints(s, file.unit), false)).join('');
  const roadPath = (file.roadLines ?? []).map((s) => svgLine(linePoints(s, file.unit), false)).join('');

  const geo: CityGeo = {
    key: city,
    name: file.name,
    cells,
    bounds,
    tiles,
    fillPath,
    districtPath,
    roadPath,
    districtLabels: file.districtLabels.map(([name, x, y, areaKm2]) => ({ name, x, y, areaKm2 })),
    home: HOME[city],
  };
  GEO[city] = geo;
  return geo;
}

/** Bütün şehirlerin kara petekleri (petek adları gibi şehirden bağımsız işler için) */
export function cityCells(city: CityKey): readonly Cell[] {
  return cityData(city).cells;
}
