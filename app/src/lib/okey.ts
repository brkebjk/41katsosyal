// Okey ve 101 Okey: sunucudaki oyun motorunun uygulama tarafı. Bütün kurallar ve gizli bilgiler (deste, diğer
// ıstakalar) sunucuda durur; uygulama `ok_view` ile kişiye özel görünümü okur, hamleyi sunucuya gönderir.
// Bu dosyadaki per denetimi ve dizme yalnızca yardımlı masada ipucu ve ıstakayı dizmek içindir; asıl karar sunucunundur.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type OkeyGame = 'okey' | 'okey101';

export const OKEY_GAMES: OkeyGame[] = ['okey', 'okey101'];
export const isOkeyGame = (g: string | null | undefined): g is OkeyGame => g === 'okey' || g === 'okey101';

/** Masa ayarları (oda sahibi bekleme odasında seçer) */
export type OkeyOpts = {
  /** Eşli (1–3 ve 2–4 eş) */
  pairs: boolean;
  /** Yardımlı: okey, işlek taş ve açış toplamı gösterilir, ıstaka dizilebilir */
  helper: boolean;
  /** Okey: başlangıç puanı (10 ya da 20) */
  target?: number;
  /** 101: cezalı */
  penalty?: boolean;
  /** 101: katlamalı */
  fold?: boolean;
  /** 101: el sayısı */
  hands?: number;
};

export type OkeyPlayer = {
  seat: number;
  id: string;
  name: string;
  avatar: number | null;
  is_me: boolean;
  bot: boolean;
  left: boolean;
  tiles: number;
};

export type OkeyMeld = {
  id: number;
  seat: number;
  kind: 'run' | 'set' | 'pair';
  tiles: number[];
  /** Her taşın yerine geçtiği [renk, sayı] (okeyler için de) */
  reps?: [number | null, number][];
  value?: number;
};

export type OkeyOpened = { kind: 'run' | 'pair'; value: number; pairs: number; tn: number };

export type OkeyHist = {
  hand: number;
  fin: number | null;
  mult: number;
  okey: boolean;
  elden: boolean;
  pairs: boolean;
  /** Bu elde puana eklenen (Okey: kaybedilen puan eksi; 101: yazılan ceza; eşlide takım toplamı) */
  d: Record<string, number>;
  /** 101: kişinin kendi yazdığı (eşlide takıma eklenmeden önce) */
  ind?: Record<string, number> | null;
  /** 101: elde kalan taşların toplamı */
  rem?: Record<string, number> | null;
  /** 101: bu eldeki cezalar */
  pen?: Record<string, number> | null;
};

export type OkeyLog = {
  k: 'deal' | 'draw' | 'take' | 'return' | 'discard' | 'open' | 'lay' | 'add' | 'swap' | 'show' | 'finish' | 'hand_end' | 'left' | 'end';
  i: number;
  s?: number | null;
  t?: number;
  pen?: number;
  why?: 'okey' | 'isler' | null;
  kind?: 'run' | 'pair';
  v?: number;
  m?: number;
  n?: number;
  hand?: number;
};

export type OkeyView = {
  game: OkeyGame;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  phase: 'lobby' | 'play' | 'hand_end' | 'ended' | 'cancelled';
  remote: boolean;
  match: boolean;
  test: boolean;
  event: boolean;
  close_reason: string | null;
  code: string | null;
  opts: OkeyOpts;
  host: { id: string; name: string; is_me: boolean };
  me: { id: string; seat: number | null; is_player: boolean; left: boolean; is_host: boolean; is_admin: boolean };
  players: OkeyPlayer[];
  hand: number | null;
  starter: number | null;
  turn: number | null;
  tn: number | null;
  turn_secs: number;
  turn_age: number | null;
  drew: boolean | null;
  /** 101: açmamışken yandan alınan taş (bu turda o taşla açılmalı) */
  side: number | null;
  ind: number | null;
  okc: number | null;
  okn: number | null;
  deck_n: number | null;
  disc: Record<string, number[]> | null;
  melds: OkeyMeld[] | null;
  opened: Record<string, OkeyOpened> | null;
  /** Bu elde en az bir taş atmış koltuklar (Okey: gösterge yalnızca ilk turda) */
  first: number[] | null;
  shown: number[] | null;
  pen: Record<string, number> | null;
  scores: Record<string, number> | null;
  hist: OkeyHist[] | null;
  /** Oyundan ayrılan, yerine sunucunun oynadığı koltuklar */
  auto: number[] | null;
  log: OkeyLog[] | null;
  evn: number | null;
  ready: number[] | null;
  fin: {
    seat: number | null;
    okey: boolean;
    elden: boolean;
    pairs: boolean;
    groups: OkeyMeld[] | null;
    tile: number | null;
    mult: number;
  } | null;
  /** El sonunda herkesin ıstakasında kalanlar */
  reveal: Record<string, number[]> | null;
  end_age: number | null;
  pause_secs: number;
  winner: number[] | null;
  next_room: string | null;
  /** 101: açmak için gereken (katlamalıda yükselir) */
  need: { run: number; pair: number } | null;
  /** Kendi ıstakan: 30 yuva (2 sıra × 15), boş yuva null */
  rack: (number | null)[] | null;
};

export const RACK_COLS = 15;
export const RACK_ROWS = 2;
export const RACK_SLOTS = RACK_COLS * RACK_ROWS;

const TEXT: Record<string, string> = {
  room_not_found: 'Bu masa artık yok.',
  not_your_turn: 'Sıra sende değil.',
  already_drew: 'Bu tur zaten taş aldın.',
  draw_first: 'Önce ortadan ya da yandan bir taş al.',
  pile_empty: 'Yanda alınacak taş yok.',
  side_must_open:
    'Yandan aldığın taşla bu tur elini açmalısın. Açamıyorsan “Geri koy”a bas (cezalı masada 101 ceza), sonra ortadan çekilir.',
  tile_not_in_hand: 'Bu taş ıstakanda değil.',
  wrong_tile_count: 'Taş sayısı tutmuyor. Bitirmek için 14 taşı dizip 15. taşı ortaya atmalısın.',
  invalid_finish: 'Bu dizilişle bitemezsin: 14 taşın hepsi perlere (ya da 7 çifte) dizilmiş olmalı.',
  invalid_groups: 'Taş grupları okunamadı. Istakayı yeniden dizip tekrar dene.',
  invalid_meld: 'Yan yana dizdiğin taşlardan biri geçerli bir per değil. Per olmayan taşları boşlukla ayır.',
  need_more_points: 'Açmak için perlerinin toplamı yetmiyor.',
  need_more_pairs: 'Çift açmak için yeterli çiftin yok.',
  side_not_used: 'Yandan aldığın taş açtığın perlerin içinde olmalı.',
  keep_one: 'Elinde atacak en az bir taş kalmalı.',
  already_opened: 'Elini zaten açtın.',
  not_opened: 'Önce elini açmalısın.',
  meld_not_found: 'Bu per artık yok.',
  cannot_add: 'Bu taş bu pere işlenmez.',
  cannot_swap: 'Bu taşla buradaki okey alınamaz.',
  not_first_turn: 'Göstergeyi yalnızca ilk turunda gösterebilirsin.',
  already_shown: 'Göstergeyi zaten gösterdin.',
  no_indicator: 'Istakanda göstergenin eşi yok.',
  wrong_phase: 'Şu an bunu yapamazsın.',
  not_in_room: 'Bu masada oyuncu değilsin.',
  match_room: 'Uzaktan eşleşme masasının ayarları değiştirilemez.',
  invalid_options: 'Bu ayar geçersiz.',
  invalid_seat: 'Böyle bir koltuk yok.',
  not_enough_players: 'Başlamak için masada 4 kişi olmalı.',
  remote_match_only: 'Uzaktan oyunda yeni masa “Uzaktan eşleş” ile kurulur.',
  nothing_to_return: 'Geri koyacak taş yok.',
  deck_empty: 'Ortada taş kalmadı.',
  wrong_game: 'Bu hamle bu oyunda yok.',
  invalid_slots: 'Istaka kaydedilemedi.',
  invalid_transition: 'Masa bu duruma geçemez.',
};

export const OK_ROOM_GONE = 'Bu masa artık yok.';

export async function getOkeyView(roomId: string): Promise<{ data: OkeyView | null; error: string | null }> {
  return callRpc<OkeyView>('ok_view', { p_room_id: roomId }, TEXT);
}

type ViewRes = Promise<{ data: OkeyView | null; error: string | null }>;
const act = (name: string, args: Record<string, unknown>): ViewRes => callRpc<OkeyView>(name, args, TEXT);

export const okSetOptions = (roomId: string, opts: Partial<OkeyOpts>) => act('ok_set_options', { p_room_id: roomId, p_opts: opts });
export const okSit = (roomId: string, seat: number) => act('ok_sit', { p_room_id: roomId, p_seat: seat });
export const okStart = (roomId: string) => act('ok_start', { p_room_id: roomId });
export const okDraw = (roomId: string) => act('ok_draw', { p_room_id: roomId });
export const okTake = (roomId: string) => act('ok_take', { p_room_id: roomId });
export const okReturn = (roomId: string) => act('ok_return', { p_room_id: roomId });
export const okDiscard = (roomId: string, tile: number) => act('ok_discard', { p_room_id: roomId, p_tile: tile });
export const okFinish = (roomId: string, groups: number[][], tile: number) =>
  act('ok_finish', { p_room_id: roomId, p_groups: groups, p_tile: tile });
export const okShow = (roomId: string) => act('ok_show', { p_room_id: roomId });
export const okOpen = (roomId: string, groups: number[][], pairs: boolean) =>
  act('ok_open', { p_room_id: roomId, p_groups: groups, p_pairs: pairs });
export const okLay = (roomId: string, groups: number[][]) => act('ok_lay', { p_room_id: roomId, p_groups: groups });
export const okAdd = (roomId: string, meld: number, tile: number, side: 'start' | 'end' | null) =>
  act('ok_add', { p_room_id: roomId, p_meld: meld, p_tile: tile, p_side: side });
export const okSwap = (roomId: string, meld: number, tile: number) =>
  act('ok_swap', { p_room_id: roomId, p_meld: meld, p_tile: tile });
export const okReady = (roomId: string) => act('ok_ready', { p_room_id: roomId });
export const okArrange = (roomId: string, slots: (number | null)[]): Promise<Result> =>
  callRpcVoid('ok_arrange', { p_room_id: roomId, p_slots: slots }, TEXT);
export async function okRematch(roomId: string): Promise<{ data: string | null; error: string | null }> {
  return callRpc<string>('ok_rematch', { p_room_id: roomId }, TEXT);
}

// ---------------------------------------------------------------------------
// Taşlar
// ---------------------------------------------------------------------------

/** Renkler: 0 sarı, 1 mavi, 2 siyah, 3 kırmızı */
export const TILE_COLORS = ['#D99A00', '#1E6FD9', '#1B2430', '#D7263D'] as const;
export const COLOR_NAMES = ['Sarı', 'Mavi', 'Siyah', 'Kırmızı'] as const;

export const isFake = (t: number) => t >= 104;
export const tileColor = (t: number, okc: number) => (t >= 104 ? okc : Math.floor(t / 26));
export const tileNum = (t: number, okn: number) => (t >= 104 ? okn : (t % 26) % 13 + 1);
/** Gerçek renk ve sayı (sahte okey için null) */
export const rawColor = (t: number) => (t >= 104 ? null : Math.floor(t / 26));
export const rawNum = (t: number) => (t >= 104 ? null : (t % 26) % 13 + 1);
export const isWild = (t: number, okc: number, okn: number) =>
  t < 104 && Math.floor(t / 26) === okc && (t % 26) % 13 + 1 === okn;

export function tileName(t: number, okc: number | null, okn: number | null): string {
  if (okc !== null && okn !== null && isWild(t, okc, okn)) return 'Okey';
  if (t >= 104) return 'Sahte okey';
  return `${COLOR_NAMES[Math.floor(t / 26)]} ${(t % 26) % 13 + 1}`;
}

/** Göstergeden okey: aynı renk, bir üstü (13'ün üstü 1) */
export function okeyOf(ind: number): { c: number; n: number } {
  return { c: Math.floor(ind / 26), n: (((ind % 26) % 13) + 1) % 13 + 1 };
}

// ---------------------------------------------------------------------------
// Per denetimi (sunucudakinin aynısı)
// ---------------------------------------------------------------------------

export type Meld = { kind: 'run' | 'set'; tiles: number[]; value: number; reps: [number | null, number][] };

/** Taş dizisi per mi? Önce verilen sıra (artan/azalan seri), sonra aynı sayı, sonra (strict değilse) karışık sıra. */
export function meldOf(t: number[], okc: number, okn: number, wrap: boolean, strict = false): Meld | null {
  const n = t.length;
  if (n < 3 || n > 13 || new Set(t).size !== n) return null;
  let w = 0;
  let rc: number | null = null;
  let sn: number | null = null;
  let runOk = true;
  let setOk = true;
  const nums: number[] = [];
  const cols: number[] = [];
  const wl: number[] = [];
  for (const x of t) {
    if (x < 0 || x > 105) return null;
    if (isWild(x, okc, okn)) {
      w++;
      wl.push(x);
      continue;
    }
    const c = tileColor(x, okc);
    const v = tileNum(x, okn);
    if (rc === null) rc = c;
    else if (rc !== c) runOk = false;
    if (sn === null) sn = v;
    else if (sn !== v) setOk = false;
    if (nums.includes(v)) runOk = false;
    if (cols.includes(c)) setOk = false;
    nums.push(v);
    cols.push(c);
  }
  if (w === n || rc === null || sn === null) return null;
  const lim = wrap ? 14 : 13;
  const asRun = (ord: number[], seq: number[]): Meld => ({
    kind: 'run',
    tiles: ord,
    reps: seq.map((q) => [rc, q === 14 ? 1 : q]),
    value: seq.reduce((a, q) => a + (q === 14 ? 1 : q), 0),
  });
  if (runOk) {
    const i0 = t.findIndex((x) => !isWild(x, okc, okn));
    const x0 = tileNum(t[i0], okn);
    for (const d of [1, -1]) {
      for (const m of wrap && x0 === 1 ? [1, 14] : [x0]) {
        let good = true;
        const seq: number[] = [];
        for (let i = 0; i < n; i++) {
          const e = m + d * (i - i0);
          if (e < 1 || e > lim) {
            good = false;
            break;
          }
          if (!isWild(t[i], okc, okn)) {
            const k = tileNum(t[i], okn);
            if (!(k === e || (wrap && k === 1 && e === 14))) {
              good = false;
              break;
            }
          }
          seq.push(e);
        }
        if (good) return d === 1 ? asRun(t, seq) : asRun([...t].reverse(), [...seq].reverse());
      }
    }
  }
  if (setOk && n <= 4) {
    return {
      kind: 'set',
      tiles: t,
      reps: t.map((x) => [isWild(x, okc, okn) ? null : tileColor(x, okc), sn as number]),
      value: (sn as number) * n,
    };
  }
  if (runOk && !strict) {
    for (const m of wrap && nums.includes(1) ? [0, 1] : [0]) {
      const mp = nums.map((q) => (m === 1 && q === 1 ? 14 : q));
      const mn = Math.min(...mp);
      const mx = Math.max(...mp);
      let extra = w - (mx - mn + 1 - (n - w));
      if (extra < 0) continue;
      let top = mx;
      let bot = mn;
      while (extra > 0 && top < lim) {
        top++;
        extra--;
      }
      while (extra > 0 && bot > 1) {
        bot--;
        extra--;
      }
      if (extra > 0) continue;
      const ord: number[] = [];
      const seq: number[] = [];
      let k = 0;
      for (let e = bot; e <= top; e++) {
        const ft = t.find((x) => !isWild(x, okc, okn) && (m === 1 && tileNum(x, okn) === 1 ? 14 : tileNum(x, okn)) === e);
        ord.push(ft ?? wl[k++]);
        seq.push(e);
      }
      return asRun(ord, seq);
    }
  }
  return null;
}

export function isPair(a: number, b: number, okc: number, okn: number): boolean {
  return (
    a !== b &&
    (isWild(a, okc, okn) || isWild(b, okc, okn) || (tileColor(a, okc) === tileColor(b, okc) && tileNum(a, okn) === tileNum(b, okn)))
  );
}

/** Istakada yan yana duran grubu perlere böler (sunucudaki gibi); bölünemezse null */
export function splitChunk(t: number[], okc: number, okn: number, wrap: boolean, pairs: boolean): Meld[] | null {
  const n = t.length;
  if (n === 0) return [];
  if (pairs) {
    if (n % 2) return null;
    const out: Meld[] = [];
    for (let i = 0; i < n; i += 2) {
      if (!isPair(t[i], t[i + 1], okc, okn)) return null;
      out.push({ kind: 'set', tiles: [t[i], t[i + 1]], value: 0, reps: [] });
    }
    return out;
  }
  const ok: boolean[] = Array(n + 1).fill(false);
  const prv: number[] = Array(n + 1).fill(0);
  ok[0] = true;
  for (let i = 3; i <= n; i++) {
    for (let l = 3; l <= Math.min(13, i); l++) {
      const j = i - l;
      if (ok[j] && meldOf(t.slice(j, i), okc, okn, wrap) !== null) {
        ok[i] = true;
        prv[i] = j;
        break;
      }
    }
  }
  if (!ok[n]) return null;
  const out: Meld[] = [];
  let i = n;
  while (i > 0) {
    const j = prv[i];
    out.unshift(meldOf(t.slice(j, i), okc, okn, wrap) as Meld);
    i = j;
  }
  return out;
}

/** Istakadaki yan yana taş grupları (her sıra ayrı; boş yuva grubu böler) */
export function rackChunks(rack: (number | null)[]): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < RACK_ROWS; r++) {
    let cur: number[] = [];
    for (let c = 0; c < RACK_COLS; c++) {
      const t = rack[r * RACK_COLS + c];
      if (t === null || t === undefined) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(t);
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

/** Istakadaki geçerli perler (açış / per indirme için): her grup ayrı denetlenir */
export function validChunks(
  rack: (number | null)[],
  okc: number,
  okn: number,
  wrap: boolean,
  pairs: boolean,
): { groups: number[][]; melds: Meld[]; value: number; pairCount: number; bad: number[][] } {
  const groups: number[][] = [];
  const melds: Meld[] = [];
  const bad: number[][] = [];
  for (const ch of rackChunks(rack)) {
    if (pairs ? ch.length < 2 : ch.length < 3) continue;
    const sp = splitChunk(ch, okc, okn, wrap, pairs);
    if (sp) {
      groups.push(ch);
      melds.push(...sp);
    } else bad.push(ch);
  }
  return {
    groups,
    melds,
    value: pairs ? 0 : melds.reduce((a, m) => a + m.value, 0),
    pairCount: pairs ? melds.length : 0,
    bad,
  };
}

/** Okey: bitiş denemesi. Bitiş taşı dışındaki bütün gruplar perlere ya da 7 çifte bölünüyor mu? */
export function finishGroups(
  rack: (number | null)[],
  tile: number,
  okc: number,
  okn: number,
): { groups: number[][]; pairs: boolean } | null {
  const without = rack.map((x) => (x === tile ? null : x));
  const ch = rackChunks(without);
  const total = ch.reduce((a, g) => a + g.length, 0);
  if (total !== 14) return null;
  if (ch.every((g) => splitChunk(g, okc, okn, true, false))) return { groups: ch, pairs: false };
  const pr = ch.map((g) => splitChunk(g, okc, okn, true, true));
  if (pr.every(Boolean) && pr.reduce((a, p) => a + (p?.length ?? 0), 0) === 7) return { groups: ch, pairs: true };
  return null;
}

/** 101: bu taş yerdeki bir pere işlenir mi? (cezalı masada atılırsa 101) */
export function canAddTo(m: OkeyMeld, t: number, okc: number, okn: number): ('start' | 'end')[] {
  if (m.kind === 'pair') return [];
  if (m.kind === 'set') {
    const r = meldOf([...m.tiles, t], okc, okn, false, true);
    return r?.kind === 'set' ? ['end'] : [];
  }
  const out: ('start' | 'end')[] = [];
  if (meldOf([...m.tiles, t], okc, okn, false, true)?.kind === 'run') out.push('end');
  if (meldOf([t, ...m.tiles], okc, okn, false, true)?.kind === 'run') out.push('start');
  return out;
}

export function isIsler(melds: OkeyMeld[] | null, t: number, okc: number, okn: number): boolean {
  return (melds ?? []).some((m) => canAddTo(m, t, okc, okn).length > 0);
}

/** 101: yerdeki bu perdeki okey bu taşla alınabilir mi? */
export function canSwap(m: OkeyMeld, t: number, okc: number, okn: number): boolean {
  if (m.kind === 'pair' || isWild(t, okc, okn)) return false;
  return m.tiles.some((x, i) => {
    if (!isWild(x, okc, okn)) return false;
    const t2 = [...m.tiles];
    t2[i] = t;
    return meldOf(t2, okc, okn, false, true)?.kind === m.kind;
  });
}

// ---------------------------------------------------------------------------
// Yardımlı masa: ıstakayı diz
// ---------------------------------------------------------------------------

/** Perleri sırayla ıstakaya yerleştirir (her per tek sırada, aralarında boşluk), kalanları sona dizer */
function layout(groups: number[][], rest: number[]): (number | null)[] {
  const slots: (number | null)[] = Array(RACK_SLOTS).fill(null);
  let row = 0;
  let col = 0;
  const leftovers = [...rest];
  for (const g of groups) {
    if (col > 0 && col + g.length > RACK_COLS) {
      row++;
      col = 0;
    }
    if (row >= RACK_ROWS || g.length > RACK_COLS) {
      leftovers.push(...g);
      continue;
    }
    g.forEach((t, i) => (slots[row * RACK_COLS + col + i] = t));
    col += g.length + 1;
    if (col >= RACK_COLS) {
      row++;
      col = 0;
    }
  }
  // Kalanlar: ikinci sıranın sonundan geriye doğru boş yuvalara
  let idx = RACK_SLOTS - 1;
  for (const t of [...leftovers].reverse()) {
    while (idx >= 0 && slots[idx] !== null) idx--;
    if (idx < 0) break;
    slots[idx] = t;
    idx--;
  }
  // Yer kalmadıysa (çok nadir) ilk boş yuvalara
  for (const t of leftovers) {
    if (!slots.includes(t)) {
      const i = slots.indexOf(null);
      if (i >= 0) slots[i] = t;
    }
  }
  return slots;
}

const sortKey = (t: number, okc: number, okn: number) =>
  isWild(t, okc, okn) ? 1000 : tileColor(t, okc) * 20 + tileNum(t, okn);

/** Seri diz için tek tur: kalan taşlarla en çok taşı (eşitlikte en yüksek toplamı) perlere sokan seçim */
function bestGroups(tiles: number[], okc: number, okn: number, wrap: boolean): number[][] {
  const wilds = tiles.filter((t) => isWild(t, okc, okn));
  const reals = tiles.filter((t) => !isWild(t, okc, okn));
  // Aday perler: her renk için ardışık seriler (boşluklara okey), her sayı için renk grupları
  type Cand = { tiles: number[]; wild: number; value: number };
  const cands: Cand[] = [];
  const byKey = new Map<string, number>();
  for (const t of reals) {
    const k = `${tileColor(t, okc)}-${tileNum(t, okn)}`;
    if (!byKey.has(k)) byKey.set(k, t);
  }
  const has = (c: number, n: number) => byKey.get(`${c}-${n === 14 ? 1 : n}`);
  const top = wrap ? 14 : 13;
  for (let c = 0; c < 4; c++) {
    for (let s = 1; s <= top - 2; s++) {
      const seq: (number | null)[] = [];
      let gaps = 0;
      for (let e = s; e <= top && seq.length < 13; e++) {
        const t = has(c, e);
        if (t === undefined) {
          gaps++;
          if (gaps > wilds.length) break;
          seq.push(null);
        } else seq.push(t);
        if (seq.length >= 3 && seq[0] !== null && seq[seq.length - 1] !== null) {
          cands.push({
            tiles: seq.map((x) => (x === null ? -1 : x)),
            wild: gaps,
            value: seq.reduce<number>((a, _x, i) => a + (s + i === 14 ? 1 : s + i), 0),
          });
        }
      }
    }
  }
  for (let n = 1; n <= 13; n++) {
    const avail: number[] = [];
    for (let c = 0; c < 4; c++) {
      const t = has(c, n);
      if (t !== undefined) avail.push(t);
    }
    if (avail.length >= 3) cands.push({ tiles: avail, wild: 0, value: n * avail.length });
    if (avail.length === 4) {
      for (let i = 0; i < 4; i++) cands.push({ tiles: avail.filter((_, j) => j !== i), wild: 0, value: n * 3 });
    }
    if (wilds.length >= 1 && avail.length >= 2 && avail.length <= 3) {
      cands.push({ tiles: [...avail, -1], wild: 1, value: n * (avail.length + 1) });
    }
  }
  // Sınırlı arama: çakışmayan perlerle en çok taş / en yüksek toplam
  cands.sort((a, b) => b.tiles.length - a.tiles.length || b.value - a.value);
  let best: { picks: Cand[]; count: number; value: number } = { picks: [], count: 0, value: 0 };
  let nodes = 0;
  const used = new Set<number>();
  const pick: Cand[] = [];
  const dfs = (from: number, wildLeft: number, count: number, value: number) => {
    if (++nodes > 6000) return;
    if (count > best.count || (count === best.count && value > best.value)) best = { picks: [...pick], count, value };
    for (let i = from; i < cands.length && nodes <= 6000; i++) {
      const c = cands[i];
      if (c.wild > wildLeft) continue;
      if (c.tiles.some((t) => t >= 0 && used.has(t))) continue;
      c.tiles.forEach((t) => t >= 0 && used.add(t));
      pick.push(c);
      dfs(i + 1, wildLeft - c.wild, count + c.tiles.length, value + c.value);
      pick.pop();
      c.tiles.forEach((t) => t >= 0 && used.delete(t));
    }
  };
  dfs(0, wilds.length, 0, 0);
  const wl = [...wilds];
  return best.picks.map((c) => c.tiles.map((t) => (t >= 0 ? t : (wl.shift() as number))));
}

/** Seri diz: perleri bulup (aynı taşın ikinci kopyası için birkaç tur) ıstakaya yan yana dizer, kalanları sona */
export function arrangeRuns(tiles: number[], okc: number, okn: number, wrap: boolean): (number | null)[] {
  let rest = [...tiles];
  const groups: number[][] = [];
  for (let pass = 0; pass < 3; pass++) {
    const g = bestGroups(rest, okc, okn, wrap);
    if (!g.length) break;
    groups.push(...g);
    const used = new Set(g.flat());
    rest = rest.filter((t) => !used.has(t));
  }
  rest.sort((a, b) => sortKey(a, okc, okn) - sortKey(b, okc, okn));
  return layout(groups, rest);
}

/** Çift diz: aynı taşları yan yana, okeyleri tek kalanların yanına koyar */
export function arrangePairs(tiles: number[], okc: number, okn: number): (number | null)[] {
  const wilds = tiles.filter((t) => isWild(t, okc, okn));
  const reals = tiles
    .filter((t) => !isWild(t, okc, okn))
    .sort((a, b) => sortKey(a, okc, okn) - sortKey(b, okc, okn));
  const groups: number[][] = [];
  const singles: number[] = [];
  for (let i = 0; i < reals.length; i++) {
    const a = reals[i];
    const b = reals[i + 1];
    if (b !== undefined && isPair(a, b, okc, okn)) {
      groups.push([a, b]);
      i++;
    } else singles.push(a);
  }
  // Okeyler en yüksek tek taşlarla eşleşir
  singles.sort((a, b) => tileNum(b, okn) - tileNum(a, okn));
  while (wilds.length && singles.length) groups.push([singles.shift() as number, wilds.shift() as number]);
  if (wilds.length === 2) groups.push([wilds[0], wilds[1]]);
  else if (wilds.length === 1) singles.push(wilds[0]);
  // Çiftler sıraya 2'şer, aralarında boşlukla (sıra başına 5 çift)
  return layout(groups, singles.sort((a, b) => sortKey(a, okc, okn) - sortKey(b, okc, okn)));
}

/** Koltuk numarasından bana göre konum: 0 ben, 1 sağım (sonraki), 2 karşım, 3 solum (önceki) */
export function relPos(seat: number, mySeat: number): 0 | 1 | 2 | 3 {
  return (((seat - mySeat) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
}

export const teamOf = (seat: number) => ((seat - 1) % 2) + 1;
