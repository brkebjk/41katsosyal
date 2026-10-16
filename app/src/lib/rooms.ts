// Oyun odaları ve çekiliş. Oda açmak ve çekiliş yapmak sunucuda yetki kontrolünden geçer.
//
// Oda kodu GİZLİDİR: sunucuda ayrı bir tabloda durur ve yalnızca odayı açan kişiye verilir.
// Açık odalar listesinde, oda ekranlarında ve diğer oyuncuların cevaplarında kod hiç yoktur;
// böylece kimse oda sahibinin yanında oturmadan odaya katılamaz.

import type { Cell } from '@/lib/hex';
import { requireGameLocation, type GameCell } from '@/lib/map';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type Room = {
  id: string;
  game_type: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  state: { winner_user_id?: string; winner_name?: string; drawn_at?: string };
  created_at: string;
};

export type RoomPlayer = { user_id: string; display_name: string; joined_at: string };

/** Yeni açılan odanın cevabı. Kod yalnızca burada (ve `getRoomCode` ile) odayı açan kişiye gelir. */
export type CreatedRoom = {
  id: string;
  code: string;
  game_type: string;
  event_id: string | null;
  host_id: string;
  status: Room['status'];
  created_at: string;
};

/** Vampir–Köylü oyun şekli: otomatik (yönetici yok), oda sahibi yönetir, ya da moderatör anlatıcı olur. */
export type RoomMode = 'auto' | 'host' | 'narrator';

/** Oyunlar ekranındaki "açık odalar" listesinin bir satırı. Kod yoktur. */
export type OpenRoom = {
  id: string;
  game_type: string;
  game_title: string;
  /** Moderatör açtıysa "PeopleHere", üye açtıysa üyenin adı */
  host_name: string;
  is_official: boolean;
  is_mine: boolean;
  player_count: number;
  joined: boolean;
  event_title: string | null;
  created_at: string;
  /** Oda sahibinin geçerli oyun şampiyonu ünvanı (varsa) */
  host_title: string | null;
  /** Odanın kurulduğu bölge (petek). Eski odalarda ve çekilişte boştur. */
  place_q: number | null;
  place_r: number | null;
  /** Oda sahibinin yazdığı adres tarifi (ör. “Cafe Nova'nın üst katı”) */
  place_note: string | null;
  /** Uzaktan oda: herkes kendi telefonundan, sesli sohbetle oynar; listeden kodsuz katılınır */
  remote?: boolean;
  /** GEÇİCİ: deneme odası (botlu, puansız) */
  is_test?: boolean;
  /** Etkinlik oyunu ise etkinliğin kimliği (etikete dokununca etkinlik penceresi açılır) */
  event_id?: string | null;
};

/** Oda açarken seçilen yer: haritadan seçilen petek ve adres tarifi. */
export type RoomPlace = { cell: Cell; note: string };

/** Adres tarifinin uzunluk sınırları (sunucuyla aynı: 3–120 karakter). */
export const PLACE_NOTE_MIN = 3;
export const PLACE_NOTE_MAX = 120;

/** Benim açtığım, henüz bitmemiş oda (kodu ile). */
export type HostedRoom = {
  id: string;
  code: string;
  game_type: string;
  status: 'lobby' | 'playing';
  created_at: string;
};

/** Odanın sahibi. Katılımcı listesinde "Oda sahibi" olarak gösterilir. */
export type RoomHost = { id: string; name: string; is_moderator: boolean; is_me: boolean };

/** `leave_all_rooms` cevabındaki bir satır: hangi odadan, nasıl çıkarıldın. */
export type LeftRoom = { room_id: string; game: string; result: 'closed' | 'removed' | 'eliminated' };

const ROOM_TEXT: Record<string, string> = {
  premium_required: 'Bu odaya katılmak için abonelik gerekiyor.',
  room_closed: 'Bu oda artık katılıma açık değil.',
  kicked_from_room: 'Bu odadan oylamayla çıkarıldın; yeniden giremezsin.',
  remote_match_only: 'Uzaktan oyun “Uzaktan Eşleş” ile açılır; arkadaşlarını lobiden davet edebilirsin.',
  remote_not_allowed:
    'Bu oda uzaktan açılamadı. Uzaktan oda yalnızca Vampir–Köylü ve Köpekbalığı Kafesi’nde açılır; etkinlik oyunları yan yana oynanır. Köpekbalığı Kafesi’nde bu yazıyı görüyorsan sunucu güncel değildir: Supabase’de parcalar/1.sql, 2.sql, 3.sql dosyalarını sırayla çalıştır.',
  narrator_event_only: 'Anlatıcı modu yalnızca etkinlik oyununda ve yalnızca etkinliğin sahibine açıktır.',
  invalid_mode: 'Geçersiz oyun şekli.',
  quota_exceeded: 'Bu ayki oyun başlatma hakkını kullandın. Hak her ay başında yenilenir.',
  room_not_found: 'Bu kodla bir oda bulunamadı. Kodu kontrol edip tekrar dene.',
  wrong_code: 'Bu kod bu odanın kodu değil. Kodu oda sahibinden tekrar sor.',
  too_many_attempts: 'Çok fazla yanlış kod denedin. Güvenlik için 10 dakika sonra tekrar dene.',
  already_hosting: 'Bu oyundan zaten açık bir odan var. Önce onu bitir ya da kapat.',
  location_required:
    'Bu oyun yan yana oynanır; girmek için bulunduğun bölgeyi bir kez almam gerekiyor. Konum izni vermeden girilemez.',
  invalid_cell: 'Haritadan oyunun oynanacağı bölgeyi (peteği) seçmelisin.',
  invalid_place_note: 'Adres tarifi 3 ile 120 karakter arasında olmalı.',
  room_too_far:
    'Oda sahibinden uzaktasın. Yan yana oyunlara yalnızca oda sahibine yaklaşık 100 metre yakınken girilebilir (konum hatası dahil en çok 150 m). Kapalı mekândaysan pencereye yaklaşıp tekrar dene.',
  event_not_found: 'Bu etkinlik bulunamadı ya da iptal edildi.',
  event_games_only:
    'Başka bir şehirde yalnızca etkinlik oyunlarına girebilirsin; bu oyunlardan puan yazılmaz. Diğer yan yana oyunları kendi şehrinde oynarsın.',
  city_required: 'Bu oyun için bir şehrimizde üye olman gerekiyor.',
  event_over: 'Etkinlik bitti; etkinlik odası açılamaz.',
  event_needs_verified: 'Etkinlik odası için en az 4 kişinin katılımını kodla doğrulaması gerekiyor.',
  event_raffle_exists: 'Bu etkinlikte en çok 5 çekiliş yapılabilir; hakkın doldu.',
  event_raffle_open: 'Bu etkinlikte zaten açık bir çekiliş odası var. Önce onu yap ya da iptal et.',
  event_no_games: 'Bu etkinlikte oyun açılamaz. Etkinlik oyunu yalnızca oyunlu açılan Oyun Geceleri, Sosyal Buluşmalar ve Müzik & Eğlence etkinliklerinde açılır.',
  event_not_started: 'Etkinlik oyunu etkinlik başlayınca açılabilir.',
  event_game_not_allowed: 'Etkinlikte yalnızca en az 4 kişilik yan yana oyunlar açılabilir.',
  event_game_exists: 'Bu etkinlikte zaten açık bir oyun odası var. Önce o bitsin.',
  event_attendees_only: 'Bu etkinlik odasına yalnızca etkinliğe katılımını kodla doğrulayanlar girebilir.',
  forbidden: 'Bunu yapmaya yetkin yok.',
  no_players: 'Çekilişe henüz kimse katılmadı.',
  already_drawn: 'Bu çekiliş zaten yapıldı.',
};

/** Düzenleyenin çekiliş açabileceği etkinlik (en az 4 doğrulanmış katılımcı). room_id boşsa çekiliş açılmadı. */
export type EventRaffle = {
  event_id: string;
  title: string;
  starts_at: string;
  verified: number;
  room_id: string | null;
  room_status: Room['status'] | null;
  /** Bu etkinlikte açılan (iptal edilmemiş) çekiliş sayısı */
  done: number;
  /** En çok kaç çekiliş (sunucu ayarı, 5) */
  max_raffles: number;
};

export async function listMyEventRaffles(): Promise<{ data: EventRaffle[]; error: string | null }> {
  const { data, error } = await callRpc<EventRaffle[]>('my_event_raffles', {}, ROOM_TEXT);
  return { data: data ?? [], error };
}

const ROOM_COLUMNS = 'id, game_type, host_id, status, state, created_at';

/**
 * Katılıma açık odalar. Moderatörün açtıkları ("PeopleHere Özel") listenin başında gelir.
 * `gameType` verilirse yalnızca o oyunun odaları gelir (oyunun “Açık odalar” ekranı).
 */
/** city: yan yana odalar şehre özeldir (boş = kendi şehrim); uzaktan odalar bütün illere açıktır */
export async function listOpenRooms(
  gameType?: string,
  city?: string | null,
): Promise<{ data: OpenRoom[]; error: string | null }> {
  const { data, error } = await callRpc<OpenRoom[]>(
    'list_open_rooms',
    { ...(gameType ? { p_game_type: gameType } : {}), ...(city ? { p_city: city } : {}) },
    ROOM_TEXT,
  );
  return { data: error ? [] : (data ?? []), error };
}

/** Yan yana oyun: kesin konum (varsa) ~100 metre yakınlık kontrolü için eklenir; sunucu katılanınkini saklamaz */
function addPrecise(args: Record<string, unknown>, cell: Cell | GameCell) {
  if ('lat' in cell && typeof cell.lat === 'number' && typeof cell.lon === 'number') {
    args.p_lat = cell.lat;
    args.p_lng = cell.lon;
    if (typeof cell.acc === 'number') args.p_acc = Math.round(cell.acc);
  }
}

/** Kullanıcının yazdığı oda kodunu temizler: harf ve rakam kalır, büyük harfe çevrilir. */
export function cleanRoomCode(text: string): string {
  return text
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

/**
 * Oda koduna katılır; odanın kimliğini döndürür.
 * Listeden bir odaya dokunulduysa `listedRoomId` verilir: kod o odanın kodu değilse hiçbir odaya girilmez.
 * Yanlış kod sunucuda sayılır; çok fazla yanlış denemede bir süre yeni deneme kabul edilmez.
 * Yan yana oynanan oyunlarda sunucu telefonun bulunduğu peteği (`cell`) ister; yoksa `needsLocation` döner.
 */
export async function joinRoom(
  code: string,
  listedRoomId?: string,
  cell?: Cell,
): Promise<{ roomId: string | null; error: string | null; needsLocation?: boolean }> {
  const args: Record<string, unknown> = { p_code: code };
  if (listedRoomId) args.p_room_id = listedRoomId;
  if (cell) {
    args.p_cell_q = cell.q;
    args.p_cell_r = cell.r;
    addPrecise(args, cell);
  }
  const { data, error } = await callRpc<string>('join_room', args, ROOM_TEXT);
  if (error) return { roomId: null, error, needsLocation: error === ROOM_TEXT.location_required };
  if (!data) return { roomId: null, error: listedRoomId ? ROOM_TEXT.wrong_code : ROOM_TEXT.room_not_found };
  return { roomId: data, error: null };
}

/**
 * Odaya girer. Oyun yan yana oynanıyorsa (sunucu konum isterse) konum bir kez sorulur: “1 kez isteyeceğim” uyarısı,
 * izin ve tek seferlik konum. İzin verilmezse odaya girilmez. `knownCell` önceden alınmış bölgedir (ör. oda açarken).
 */
export async function joinRoomWithLocation(
  code: string,
  listedRoomId?: string,
  knownCell?: Cell,
): Promise<{ roomId: string | null; error: string | null }> {
  const first = await joinRoom(code, listedRoomId, knownCell);
  if (!first.needsLocation) return first;
  const loc = await requireGameLocation();
  if (!loc.ok) return { roomId: null, error: loc.message };
  return joinRoom(code, listedRoomId, loc.cell);
}

/** Uzaktan odaya listeden kodsuz katılır (yalnızca bekleme salonundaki uzaktan Vampir–Köylü odası) */
export async function joinRemoteRoom(roomId: string): Promise<{ roomId: string | null; error: string | null }> {
  const { data, error } = await callRpc<string>('join_remote_room', { p_room_id: roomId }, ROOM_TEXT);
  return { roomId: error ? null : (data ?? null), error };
}

/**
 * Odadan ayrılır. Oda sahibiysen oda kapanır; oyun başlamışsa oyuncu elenir ve geri dönemez.
 * (Yan yana oynanan oyunlarda bu kural geçerlidir; çekilişte bekleme salonundan çıkılır.)
 */
export async function leaveRoom(roomId: string): Promise<Result> {
  return callRpcVoid('leave_room', { p_room_id: roomId }, ROOM_TEXT);
}

/**
 * Menüye dönen ya da uygulamayı yeniden açan kişiyi içinde olduğu bütün yan yana oyunlardan çıkarır.
 * Döner: çıkarıldığı odalar (boşsa zaten hiçbir oyunda değildi).
 */
/** remoteOnly: uygulama açılışında yalnızca uzaktan oyunlardan çıkılır (yan yana oyuna geri dönülür) */
export async function leaveAllRooms(remoteOnly = false): Promise<{ left: LeftRoom[]; error: string | null }> {
  const { data, error } = await callRpc<LeftRoom[]>('leave_all_rooms', { p_remote_only: remoteOnly }, ROOM_TEXT);
  return { left: error ? [] : (data ?? []), error };
}

export type SideRoom = { id: string; game_type: string; status: 'lobby' | 'playing' };

/** İçinde olduğum (süresi dolmamış) yan yana oyun odası; yoksa boş */
export async function mySideRoom(): Promise<SideRoom | null> {
  const { data } = await callRpc<SideRoom | null>('my_side_room');
  return data ?? null;
}

/**
 * Genel "buradayım" işareti: kendi canlı akışı olmayan oyun ekranları birkaç saniyede bir çağırır.
 * Işaret `room_presence_grace_seconds` (45 sn) boyunca gelmezse kişi odadan çıkarılır.
 */
export async function roomHeartbeat(
  roomId: string,
): Promise<{ active: boolean; left: boolean; status: string | null; error: string | null }> {
  const { data, error } = await callRpc<{ active: boolean; left?: boolean; status: string | null }>(
    'room_heartbeat',
    { p_room_id: roomId },
    ROOM_TEXT,
  );
  return { active: data?.active ?? false, left: data?.left ?? false, status: data?.status ?? null, error };
}

/**
 * Yeni oda açar (moderatör çekiliş de açabilir). `mode` yalnızca Vampir–Köylü içindir.
 * Yan yana oynanan oyunlarda `cell` (telefonun bulunduğu petek) ve `place` (haritadan seçilen petek + adres tarifi)
 * zorunludur; yoksa sunucu odayı açmaz. Dönen cevaptaki `code` sadece odayı açan kişiye gösterilir.
 */
export async function createRoom(
  gameType: string,
  mode?: RoomMode,
  cell?: Cell,
  place?: RoomPlace,
  eventId?: string,
  remote = false,
): Promise<{ room: CreatedRoom | null; error: string | null }> {
  const args: Record<string, unknown> = { p_game_type: gameType };
  if (remote) args.p_remote = true;
  if (eventId) args.p_event_id = eventId;
  if (mode) args.p_mode = mode;
  if (cell) {
    args.p_cell_q = cell.q;
    args.p_cell_r = cell.r;
    addPrecise(args, cell);
  }
  if (place) {
    args.p_place_q = place.cell.q;
    args.p_place_r = place.cell.r;
    args.p_place_note = place.note;
  }
  const { data, error } = await callRpc<CreatedRoom>('create_room', args, ROOM_TEXT);
  return { room: data, error };
}

/** Oda kodunu getirir; yalnızca odayı açan kişiye cevap verir, başkasına boş döner. */
export async function getRoomCode(roomId: string): Promise<string | null> {
  const { data } = await callRpc<string>('get_room_code', { p_room_id: roomId });
  return typeof data === 'string' && data.length > 0 ? data : null;
}

/** Odanın sahibi (katılımcı listesinin başında "Oda sahibi" olarak gösterilir). */
export async function getRoomHost(roomId: string): Promise<RoomHost | null> {
  const { data } = await callRpc<RoomHost>('room_host', { p_room_id: roomId });
  return data ?? null;
}

export async function setRoomStatus(roomId: string, status: Room['status']): Promise<Result> {
  return callRpcVoid('set_room_status', { p_room_id: roomId, p_status: status }, ROOM_TEXT);
}

export async function getRoom(roomId: string): Promise<{ data: Room | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase.from('game_rooms').select(ROOM_COLUMNS).eq('id', roomId).maybeSingle();
  if (error) return { data: null, error: 'Oda okunamadı. Bağlantını kontrol et.' };
  return { data: (data as Room | null) ?? null, error: null };
}

export async function listPlayers(roomId: string): Promise<{ data: RoomPlayer[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase
    .from('room_players')
    .select('user_id, display_name, joined_at')
    .eq('room_id', roomId)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  if (error) return { data: [], error: 'Oyuncu listesi okunamadı.' };
  return { data: (data ?? []) as RoomPlayer[], error: null };
}

/** Moderatörün açtığı, henüz bitmemiş çekiliş odaları (kodlarıyla; yeniden açıp devam etmek için). */
export async function listMyOpenRaffles(): Promise<{ data: HostedRoom[]; error: string | null }> {
  const { data, error } = await callRpc<HostedRoom[]>('my_hosted_rooms', { p_game_type: 'raffle' }, ROOM_TEXT);
  return { data: error ? [] : (data ?? []), error: error ? 'Odalar okunamadı.' : null };
}

/** Çekilişi yapar; kazananı döndürür. Yalnızca moderatör çağırabilir. */
export async function drawRaffle(
  roomId: string,
): Promise<{ winner: { winner_user_id: string; winner_name: string } | null; error: string | null }> {
  const { data, error } = await callRpc<{ winner_user_id: string; winner_name: string }>(
    'admin_draw_raffle',
    { p_room_id: roomId },
    ROOM_TEXT,
  );
  return { winner: data, error };
}

/**
 * Bir odaya girebilmek (ve oda açabilmek) için telefonun bulunduğu petek, odanın bölgesine en çok kaç petek uzakta
 * olabilir? Sunucu ayarı `game_join_max_cell_distance`; -1 = kontrol kapalı. Okunamazsa varsayılan 1.
 */
export async function getJoinMaxDistance(): Promise<number> {
  if (!supabase) return 1;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'game_join_max_cell_distance')
    .maybeSingle();
  if (error || !data) return 1;
  const n = Number(data.value);
  return Number.isFinite(n) ? n : 1;
}

/** Haritaya konacak oyun bölgeleri: petek başına açık oda sayısı. */
export type GameCellMark = { q: number; r: number; count: number };

export function gameCellMarks(rooms: readonly OpenRoom[]): GameCellMark[] {
  const by = new Map<string, GameCellMark>();
  for (const r of rooms) {
    if (r.place_q === null || r.place_r === null || r.place_q === undefined || r.place_r === undefined) continue;
    const k = `${r.place_q},${r.place_r}`;
    const cur = by.get(k);
    if (cur) cur.count += 1;
    else by.set(k, { q: r.place_q, r: r.place_r, count: 1 });
  }
  return [...by.values()];
}

/** Her oyunda şu an odada olan (bekleme salonu + oynayan) kişi sayısı. Kim olduğu gelmez. */
export async function getGamePlayerCounts(): Promise<Record<string, number>> {
  const { data, error } = await callRpc<{ game_type: string; players: number }[]>('game_player_counts');
  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.game_type, Number(r.players) || 0]));
}
