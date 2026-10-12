// Vampir–Köylü: sunucudaki oyun motorunun istemci tarafı.
// Oyunun bütün kuralları ve gizli bilgiler sunucuda durur; uygulama yalnızca `vv_view` ile
// kişiye özel hazırlanmış görünümü okur ve oyuncunun seçimini sunucuya gönderir.

import type { VampireImageKey } from '@/lib/images';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type VvRole = 'villager' | 'vampire' | 'doctor' | 'detective';

/** Oyun şekli: otomatik (yönetici yok), oda sahibi yönetir ve oynar, anlatıcı (yalnızca moderatör; oynamaz). */
export type VvMode = 'auto' | 'host' | 'narrator';

export type VvPhase = 'lobby' | 'reveal' | 'night' | 'dawn' | 'vote' | 'vote_result' | 'ended' | 'cancelled';

export type VvPlayer = {
  id: string;
  name: string;
  is_alive: boolean;
  is_host: boolean;
  is_me: boolean;
  /** Oyundan ayrıldı (ekrandan çıktı ya da bağlantısı koptu); elenmiş sayılır, geri dönemez */
  left: boolean;
  /** Yalnızca görmeye hakkın olan roller dolu gelir (kendin, vampirsen dostların, moderatörsen herkes) */
  role: VvRole | null;
  /** Aşağıdaki üç alan yalnızca moderatör (anlatıcı) için dolu gelir */
  night_done: boolean | null;
  voted: boolean | null;
  ready: boolean | null;
};

/** Fısıltı: herkes kimin kime fısıldadığını görür; `body` yalnızca gönderen ve alana dolu gelir */
export type VvWhisper = {
  id: string;
  from: string;
  from_name: string;
  to: string;
  to_name: string;
  /** Bir fısıltıya verilen cevap mı */
  reply: boolean;
  round: number;
  at: string;
  body: string | null;
};

export type VvInvestigation = { round: number; id: string; name: string; is_vampire: boolean };

export type VvView = {
  phase: VvPhase;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  /** Oda kodu yalnızca odayı açan kişiye gelir; başkasında boştur */
  code: string | null;
  round: number;
  winner: 'villager' | 'vampire' | null;
  composition: Record<VvRole, number>;
  last_night: { round: number; killed: { id: string; name: string }[] } | null;
  last_vote: {
    round: number;
    executed: { id: string; name: string; role: VvRole } | null;
    tally: { id: string; name: string; votes: number }[];
    skips: number;
    absent: number;
    tie: boolean;
  } | null;
  players: VvPlayer[];
  /** Odanın sahibi (oyuncu listesinde yoksa, ör. anlatıcı moderatör, ayrıca gösterilir) */
  host: { id: string; name: string; is_moderator: boolean; is_me: boolean };
  mode: VvMode;
  /** Oda kapandıysa nedeni: quit (sahibi ayrıldı), timeout (sahibinin bağlantısı koptu), inactive (kimse oynamadı) */
  close_reason: string | null;
  /** Otomatik oyunda bu aşamanın süresi (sn); öteki modlarda boş */
  phase_limit: number | null;
  /** Aşama başlayalı kaç sn geçti (cevap alındığı an) */
  phase_age: number;
  /** Oyunu açan üye geceyi/oylamayı en erken bu kadar sn sonra elle bitirebilir */
  force_after: number;
  me: {
    is_player: boolean;
    /** Oyundan ayrıldım / atıldım */
    left: boolean;
    is_host: boolean;
    is_admin: boolean;
    /** Her şeyi gören tek kişi: oyuncu olarak katılmamış moderatör (anlatıcı) */
    is_omniscient: boolean;
    /** Oyunu elle ilerletebilir (otomatik oyunda kimse ilerletemez) */
    can_control: boolean;
    is_alive: boolean;
    role: VvRole | null;
    ready: boolean;
    night_target: string | null;
    voted: boolean;
    vote_target: string | null;
    last_protect: string | null;
    investigations: VvInvestigation[];
    allies?: { id: string; name: string; is_alive: boolean; pick: string | null }[];
  };
  pending: { kind: 'night' | 'vote'; total: number; done: number } | null;
  ready_count: number;
  min_players: number;
  max_players: number;
  whispers: VvWhisper[];
  /** Bir oyuncunun bu oyunda gönderebileceği fısıltı sayısı */
  whisper_limit: number;
  whispers_left: number;
  /** Elenenlerin sohbeti: yalnızca elenen oyuncuya (ve oyun bitince) gelir; yoksa boş */
  dead_chat?: VvDeadMsg[] | null;
};

export type VvDeadMsg = { id: string; name: string; body: string; at: string; mine: boolean };

const VV_TEXT: Record<string, string> = {
  wrong_phase: 'Oyun bu aşamadan çoktan geçmiş. Ekran yenileniyor.',
  you_left: 'Bu oyundan çıkarıldın, geri dönemezsin.',
  too_early: 'Herkesin seçim yapabilmesi için biraz beklemen gerekiyor. Süre dolunca düğme açılır.',
  auto_mode: 'Bu oyun otomatik ilerliyor, elle ilerletilemez.',
  not_in_room: 'Bu oyunda oyuncu değilsin.',
  you_are_dead: 'Elendin, artık seçim yapamazsın. Oyunu izleyebilirsin.',
  no_night_action: 'Rolünün gece eylemi yok. Sabahı bekle.',
  invalid_target: 'Bu kişiyi seçemezsin.',
  cannot_target_ally: 'Diğer vampirleri ısıramazsın.',
  same_protect: 'Doktor art arda iki gece aynı kişiyi koruyamaz.',
  already_acted: 'Dedektif her gece yalnızca bir kişiye bakabilir.',
  not_enough_players: 'Oyunu başlatmak için yeterli oyuncu yok.',
  forbidden: 'Bu işlemi yalnızca oyunu açan kişi yapabilir.',
  invalid_transition: 'Oyun zaten başlamış ya da bitmiş.',
  room_closed: 'Bu oyuna artık katılım kapalı.',
  whisper_limit: 'Bu oyundaki fısıltı hakkın bitti.',
  invalid_body: 'Fısıltı 1–120 karakter olmalı.',
  muted: 'Şu an susturulmuşsun, yazamazsın.',
  night_quiet: 'Gece herkes uyuyor; fısıltı sabah açılır.',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz.',
  not_dead: 'Bu sohbete yalnızca elenenler yazabilir.',
  rate_limited: 'Biraz yavaş: art arda çok hızlı yazıyorsun.',
  chat_limit: 'Bu oyunda yazabileceğin mesaj sınırına ulaştın.',
};

/** Odada olmayan ya da odadan çıkarılan kişiye gösterilen cevaplar (ekran bunlardan "çıkarıldın" ekranını açar). */
export const VV_NOT_IN_ROOM = 'Bu odaya katılmamışsın. Oda kodunu Oyunlar sekmesinden girerek katıl.';
export const VV_ROOM_GONE = 'Bu oyun odası artık yok.';

export async function getVampireView(roomId: string): Promise<{ view: VvView | null; error: string | null }> {
  const { data, error } = await callRpc<VvView>(
    'vv_view',
    { p_room_id: roomId },
    { forbidden: VV_NOT_IN_ROOM, room_not_found: VV_ROOM_GONE },
  );
  return { view: data, error };
}

const call = (fn: string, roomId: string, extra: Record<string, unknown> = {}): Promise<Result> =>
  callRpcVoid(fn, { p_room_id: roomId, ...extra }, VV_TEXT);

export const startVampireGame = (roomId: string) => call('vv_start', roomId);
export const markRoleSeen = (roomId: string) => call('vv_ready', roomId);
export const beginNight = (roomId: string) => call('vv_begin_night', roomId);
export const nightAction = (roomId: string, target: string) => call('vv_night_action', roomId, { p_target: target });
export const endNight = (roomId: string) => call('vv_end_night', roomId);
export const beginVote = (roomId: string) => call('vv_begin_vote', roomId);
/** `target` boşsa "oy kullanmıyorum" demektir. */
export const castVote = (roomId: string, target: string | null) => call('vv_cast_vote', roomId, { p_target: target });
export const endVote = (roomId: string) => call('vv_end_vote', roomId);

/** Fısıltı gönder. `replyTo` doluysa bana gelen fısıltıya cevaptır (alıcı onu gönderen kişi olur). */
export const sendWhisper = (roomId: string, to: string, body: string, replyTo: string | null = null) =>
  call('vv_whisper', roomId, { p_to: to, p_body: body, p_reply_to: replyTo });

/** Elenenlerin sohbetine yaz */
export const sayAsDead = (roomId: string, body: string) => call('vv_dead_say', roomId, { p_body: body });

/** Elenenlerin sohbetindeki bir mesajı bildir */
export const reportDeadMessage = (id: string, reason: string) =>
  callRpcVoid(
    'report_content',
    { p_type: 'vv_dead', p_id: id, p_reason: reason },
    { target_not_found: 'Bu mesaj artık yok.', invalid_reason: 'Bir neden seç.' },
  );

/** Bana gelen bir fısıltıyı moderatöre bildir */
export const reportWhisper = (id: string, reason: string) =>
  callRpcVoid(
    'report_content',
    { p_type: 'vv_whisper', p_id: id, p_reason: reason },
    { target_not_found: 'Bu fısıltı artık yok.', invalid_reason: 'Bir neden seç.' },
  );

// ---------------------------------------------------------------------------
// Roller: ad, açıklama, görsel
// ---------------------------------------------------------------------------

export type RoleInfo = {
  name: string;
  /** Kartta gösterilen kısa görev cümlesi */
  goal: string;
  /** Gece ne yaptığını anlatan cümle */
  night: string;
  image: VampireImageKey;
  /** Rolün vurgu rengi */
  color: string;
  team: 'village' | 'vampire';
};

export const ROLES: Record<VvRole, RoleInfo> = {
  villager: {
    name: 'Köylü',
    goal: 'Vampirleri bul ve gündüz oylamasında köyden çıkar.',
    night: 'Gece eylemin yok. Köy uyurken sen de uyu.',
    image: 'role_villager',
    color: '#C98B3C',
    team: 'village',
  },
  vampire: {
    name: 'Vampir',
    goal: 'Her gece bir köylüyü ısır. Vampirler köylülere eşit olunca kazanırsınız.',
    night: 'Her gece ısıracağın kişiyi dostlarınla birlikte seç.',
    image: 'role_vampire',
    color: '#9B7BFF',
    team: 'vampire',
  },
  doctor: {
    name: 'Doktor',
    goal: 'Vampirlerden korumak için her gece bir kişiyi seç. Kendini de koruyabilirsin.',
    night: 'Seçtiğin kişi ısırılsa bile ölmez. Art arda iki gece aynı kişiyi koruyamazsın.',
    image: 'role_doctor',
    color: '#FFB020',
    team: 'village',
  },
  detective: {
    name: 'Dedektif',
    goal: 'Her gece bir kişiye bak ve vampir olup olmadığını öğren.',
    night: 'Bakacağın kişiyi seç; sonucu hemen sadece sen görürsün.',
    image: 'role_detective',
    color: '#5CC8FF',
    team: 'village',
  },
};

export const ROLE_ORDER: VvRole[] = ['vampire', 'doctor', 'detective', 'villager'];

/** "2 vampir · 1 doktor · 1 dedektif · 4 köylü" gibi bir özet cümlesi. */
export function compositionText(c: Record<VvRole, number>): string {
  const label: Record<VvRole, string> = {
    vampire: 'vampir',
    doctor: 'doktor',
    detective: 'dedektif',
    villager: 'köylü',
  };
  return ROLE_ORDER.filter((r) => (c[r] ?? 0) > 0)
    .map((r) => `${c[r]} ${label[r]}`)
    .join(' · ');
}

/** Oyun ilerledikçe hangi sahne görselinin gösterileceği. */
export function sceneFor(phase: VvPhase, winner: VvView['winner']): VampireImageKey {
  if (phase === 'ended') return winner === 'vampire' ? 'win_vampires' : 'win_villagers';
  if (phase === 'dawn' || phase === 'vote' || phase === 'vote_result') return 'scene_day';
  return 'scene_night';
}
