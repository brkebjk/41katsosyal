// Köpekbalığı Kafesi: sunucudaki oyun motorunun istemci tarafı. Bütün kurallar ve gizli bilgiler sunucuda durur;
// uygulama yalnızca `sk_view` ile kişiye özel hazırlanmış görünümü okur ve oyuncunun seçimini sunucuya gönderir.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type SkRole =
  | 'alpha'
  | 'tiger'
  | 'hammer'
  | 'nurse'
  | 'shark'
  | 'lifeguard'
  | 'oceanographer'
  | 'spearman'
  | 'marshal'
  | 'medium'
  | 'tourist'
  | 'squid'
  | 'surfer'
  | 'scavenger';

export type SkTeam = 'shark' | 'human' | 'neutral';

/** Oyun şekli: otomatik, oda sahibi yönetir ve oynar, anlatıcı (yalnızca etkinlik sahibi; oynamaz, puan yok) */
export type SkMode = 'auto' | 'host' | 'narrator';

export type SkPhase = 'lobby' | 'reveal' | 'night' | 'day' | 'vote' | 'vote_result' | 'ended' | 'cancelled';

export type SkWinner = 'human' | 'shark' | 'squid' | 'surfer' | 'scavenger' | 'nobody';

export type SkPlayer = {
  id: string;
  /** Koltuk numarası (1–16): oylarda isim yerine bu numara görünür */
  seat: number;
  name: string;
  avatar: number | null;
  is_alive: boolean;
  left: boolean;
  is_host: boolean;
  is_me: boolean;
  /** Yalnızca görmeye hakkın olan roller dolu gelir */
  role: SkRole | null;
  team: SkTeam | null;
  /** Köpekbalığıysan: bu kişi takım arkadaşın */
  ally: boolean;
  /** Rolü herkese açıklandı (kafes, zıpkın, ayrılma, Komutan) */
  revealed: boolean;
  /** Kimliğini açmış Sahil Güvenlik Komutanı (oyu 2 sayılır) */
  marshal: boolean;
  /** Köpekbalıkları birbirinin bu gecelik av seçimini görür */
  hunt_pick: string | null;
  /** Yalnızca anlatıcıya: gece seçimini yaptı / rolünü gördü */
  acted: boolean | null;
};

export type SkNote = {
  round: number;
  kind: 'saved' | 'blocked' | 'track' | 'scan';
  id?: string;
  name?: string;
  team?: SkTeam | null;
  visits?: { round: number; names: string[] }[];
};

export type SkMsg = { id: string; name: string; body: string; at: string; mine: boolean };

export type SkVote = { from: string; to: string | null; weight: number };

export type SkView = {
  phase: SkPhase;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  round: number;
  winner: SkWinner | null;
  mode: SkMode;
  remote: boolean;
  event: boolean;
  test: boolean;
  code: string | null;
  /** Uzaktan eşleştirme odası (herkes rumuzuyla; 6 kişiden sonra "Hazırım" çoğunluğuyla başlar) */
  match?: boolean;
  /** Eşleştirme lobisinde "Hazırım" diyenlerin kimlikleri */
  lobby_ready?: string[] | null;
  close_reason: string | null;
  counts: { shark: number; human: number; neutral: number };
  players: SkPlayer[];
  host: { id: string; name: string; is_me: boolean; is_moderator: boolean };
  marshal: string | null;
  last_night: { round: number; dead: { id: string; name: string }[] } | null;
  day_event: {
    round: number;
    kind: 'spear' | 'spear_miss';
    id: string;
    name: string;
    role?: SkRole;
  } | null;
  last_vote: {
    round: number;
    caged: { id: string; name: string; role: SkRole } | null;
    tally: { id: string; name: string; votes: number }[];
    skips: number;
    absent: number;
    tie: boolean;
  } | null;
  votes: SkVote[];
  pending: { total: number; done: number } | null;
  ready_count: number;
  phase_limit: number | null;
  phase_age: number;
  force_after: number;
  min_players: number;
  max_players: number;
  me: {
    is_player: boolean;
    left: boolean;
    is_host: boolean;
    is_admin: boolean;
    is_omniscient: boolean;
    can_control: boolean;
    is_alive: boolean;
    role: SkRole | null;
    team: SkTeam | null;
    ready: boolean;
    done: boolean | null;
    /** Bu gece yeteneğini kullandı (ya da pas geçti) */
    ability_done: boolean;
    night_target: string | null;
    ignite: boolean | null;
    hunt_target: string | null;
    voted: boolean;
    vote_target: string | null;
    notes: SkNote[];
    marks: string[];
    self_used: boolean;
    spear_used: boolean;
  };
  /** Herkese açık yazışma (plajda ve oylamada yaşayanlar yazar) */
  chat?: SkMsg[] | null;
  shark_chat: SkMsg[] | null;
  dead_chat: SkMsg[] | null;
  /** "Tartışmayı hızlı geç": plajda kaç kişi işaretledi, kaç gerekli, ben işaretledim mi */
  skip?: { yes: number; alive: number; needed: number; mine: boolean } | null;
  /** Uzaktan oda: son 2 dakikanın dinleyebildiğin ses mesajları (künye; ses ayrıca alınır) */
  voice?: SkClip[];
};

export type SkClip = { id: string; from: string; channel: 'all' | 'shark'; at: string; ms: number };

const TEXT: Record<string, string> = {
  wrong_phase: 'Oyun bu aşamadan çoktan geçmiş. Ekran yenileniyor.',
  you_left: 'Bu oyundan çıkarıldın, geri dönemezsin.',
  not_in_room: 'Bu oyunda oyuncu değilsin.',
  you_are_dead: 'Maskeni kırdılar: artık seçim yapamazsın. Oyunu izleyebilirsin.',
  no_night_action: 'Rolünün bu gece yapacağı bir şey yok.',
  invalid_target: 'Bu kişiyi seçemezsin.',
  cannot_target_ally: 'Kendi takımından birini seçemezsin.',
  sharks_only: 'Hemşire yalnızca köpekbalıklarını koruyabilir.',
  self_used: 'Kendini yalnızca bir kez koruyabilirsin; o hakkı kullandın.',
  already_marked: 'Bu kişiyi zaten işaretledin.',
  no_marks: 'Önce en az bir kişiyi işaretlemelisin.',
  spear_day_one: 'Zıpkın ilk gün atılamaz; 2. günden itibaren kullanabilirsin.',
  spear_used: 'Tek zıpkınını kullandın.',
  no_spear: 'Zıpkın yalnızca Zıpkıncı’da var.',
  not_marshal: 'Bu düğme yalnızca Sahil Güvenlik Komutanı’nda çalışır.',
  already_revealed: 'Kimliğini zaten açtın.',
  not_enough_players: 'Oyunu başlatmak için en az 6 oyuncu gerekir.',
  room_full: 'Oda en çok 16 kişilik.',
  forbidden: 'Bu işlemi yapamazsın.',
  invalid_transition: 'Oyun zaten başlamış ya da bitmiş.',
  auto_mode: 'Bu oyun kendi kendine ilerliyor, elle ilerletilemez.',
  too_early: 'Herkesin seçim yapabilmesi için biraz beklemen gerekiyor.',
  muted: 'Şu an susturulmuşsun, yazamazsın.',
  invalid_body: 'Mesaj 1–120 karakter olmalı.',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz.',
  night_only: 'Köpekbalıkları yalnızca dalışta (gece) yazışabilir.',
  day_only: 'Herkese açık yazışma plajda ve oylamada açıktır; dalışta herkes susar.',
  not_alive: 'Elenenler buraya yazamaz; ölülerin sohbetini kullan.',
  not_dead: 'Bu sohbete yalnızca elenenler (ve plajda Medyum) yazabilir.',
  rate_limited: 'Biraz yavaş: art arda çok hızlı yazıyorsun.',
  chat_limit: 'Bu oyunda yazabileceğin mesaj sınırına ulaştın.',
  room_not_found: 'Bu oyun odası artık yok.',
  match_room: 'Eşleştirme odası “Hazırım” diyenler çoğunluğa geçince kendiliğinden başlar.',
  already_in_game: 'Zaten başka bir oyundasın. Önce o oyundan çık.',
  game_not_available: 'Bu oyun şu an kapalı.',
};

export const SK_NOT_IN_ROOM = 'Bu odaya katılmamışsın. Oda kodunu Oyunlar sekmesinden girerek katıl.';
export const SK_ROOM_GONE = 'Bu oyun odası artık yok.';

export async function getSharkView(roomId: string): Promise<{ view: SkView | null; error: string | null }> {
  const { data, error } = await callRpc<SkView>(
    'sk_view',
    { p_room_id: roomId },
    { forbidden: SK_NOT_IN_ROOM, room_not_found: SK_ROOM_GONE },
  );
  return { view: data, error };
}

const call = (fn: string, roomId: string, extra: Record<string, unknown> = {}): Promise<Result> =>
  callRpcVoid(fn, { p_room_id: roomId, ...extra }, TEXT);

export const startShark = (roomId: string) => call('sk_start', roomId);
export const sharkReady = (roomId: string) => call('sk_ready', roomId);
/** Gece: köpekbalığı av oyu ('hunt'), rol yeteneği ('ability'), Sörfçü'nün "Telsiz Patlat"ı ('ignite'). Hedef boş = pas. */
export const sharkNight = (roomId: string, kind: 'hunt' | 'ability' | 'ignite', target: string | null) =>
  call('sk_night_action', roomId, { p_kind: kind, p_target: target });
export const sharkSpear = (roomId: string, target: string) => call('sk_spear', roomId, { p_target: target });
export const sharkRevealMarshal = (roomId: string) => call('sk_reveal_marshal', roomId);
/** Kafes oyu: hedef boş = pas */
export const sharkVote = (roomId: string, target: string | null) => call('sk_vote', roomId, { p_target: target });
// ---------------------------------------------------------------------------
// Uzaktan eşleştirme
// ---------------------------------------------------------------------------

export type MatchState = { room: string | null; waiting: number; searching?: boolean };

/** Eşleşme sırasına gir (eşleşirse oda kimliği döner) */
export async function matchJoin(): Promise<{ data: MatchState | null; error: string | null }> {
  return callRpc<MatchState>('sk_match_join', {}, TEXT);
}
/** Arama sürerken birkaç saniyede bir: eşleştim mi, sırada kaç kişi var */
export async function matchPoll(): Promise<MatchState | null> {
  const res = await callRpc<MatchState>('sk_match_poll', {}, TEXT);
  return res.data ?? null;
}
export const matchCancel = () => callRpcVoid('sk_match_cancel', {}, TEXT);
/** Eşleştirme lobisinde "Hazırım" / vazgeç */
export const lobbyReady = (roomId: string, on: boolean) => call('sk_lobby_ready', roomId, { p_on: on });
/** GEÇİCİ: moderatör deneme oyuncularını eşleştirme sırasına koyar */
export const queueTestBots = (count: number) => callRpcVoid('admin_queue_test_bots', { p_count: count }, TEXT);

/** "Tartışmayı hızlı geç" işaretini koy / kaldır */
export const sharkSkip = (roomId: string, on: boolean) => call('sk_skip_discussion', roomId, { p_on: on });
/** Yönetici / anlatıcı: sıradaki aşamaya geç */
export const sharkNext = (roomId: string) => call('sk_next', roomId);
export const sharkSay = (roomId: string, channel: 'all' | 'shark' | 'dead', body: string) =>
  call('sk_say', roomId, { p_channel: channel, p_body: body });

const VOICE_TEXT: Record<string, string> = {
  voice_closed: 'Şu an konuşamazsın: dalışta yalnızca köpekbalıkları konuşur, elenenler konuşamaz.',
  invalid_audio: 'Ses kaydı alınamadı. Tekrar dene.',
  rate_limited: 'Biraz bekle: art arda çok hızlı ses gönderiyorsun.',
  chat_limit: 'Bu oyunda gönderebileceğin ses mesajı sınırına ulaştın.',
  muted: 'Şu an susturulmuşsun.',
  clip_not_found: 'Bu ses mesajı artık yok.',
};

export type RemoteCaps = {
  today: number;
  month: number;
  daily_cap: number;
  month_cap: number;
  pct: number;
  top_cap: number;
  min_players: number;
};

/** Uzaktan oyunda bugün / bu ay kullanılan puanlı oyun sayısı ve sınırlar (giriş ekranındaki sayaç) */
export async function getRemoteCaps(): Promise<RemoteCaps | null> {
  const res = await callRpc<RemoteCaps>('my_remote_caps', {});
  return res.data ?? null;
}

/** Bas-konuş: ses mesajını gönderir (base64 AAC, en çok 5 sn) */
export async function postVoiceClip(roomId: string, audio: string, ms: number): Promise<string | null> {
  const res = await callRpc<string>(
    'sk_voice_post',
    { p_room_id: roomId, p_audio: audio, p_duration_ms: Math.round(ms) },
    VOICE_TEXT,
  );
  return res.error;
}

/** Ses mesajının kendisi (base64) */
export async function getVoiceClip(id: string): Promise<string | null> {
  const res = await callRpc<string>('sk_voice_get', { p_id: id }, VOICE_TEXT);
  return typeof res.data === 'string' ? res.data : null;
}

/** Ses mesajını moderatöre bildir (bildirilen mesaj 10 dakikada silinmez, en çok 14 gün saklanır) */
export const reportVoiceClip = (id: string, reason: string) =>
  callRpcVoid(
    'report_content',
    { p_type: 'sk_voice', p_id: id, p_reason: reason },
    { target_not_found: 'Bu ses mesajı artık yok.', invalid_reason: 'Bir neden seç.' },
  );

// ---------------------------------------------------------------------------
// Roller ve takımlar
// ---------------------------------------------------------------------------

export type SkRoleInfo = {
  name: string;
  emoji: string;
  team: SkTeam;
  /** Kısa görev cümlesi */
  goal: string;
  /** Dalışta (gece) ne yaptığı; yoksa boş */
  night: string | null;
  color: string;
};

export const SK_TEAMS: Record<SkTeam, { name: string; color: string; emoji: string }> = {
  shark: { name: 'Köpekbalıkları', color: '#FF4D4D', emoji: '🦈' },
  human: { name: 'İnsanlar', color: '#48CAE4', emoji: '🏖️' },
  neutral: { name: 'Tarafsız', color: '#B98CFF', emoji: '🌀' },
};

export const SK_ROLES: Record<SkRole, SkRoleInfo> = {
  alpha: {
    name: 'Büyük Beyaz (Alfa)',
    emoji: '🦈',
    team: 'shark',
    goal: 'Köpekbalıklarının lideri. Takımınla her dalışta bir av seçersin; oylar eşit çıkarsa senin seçimin geçer.',
    night: 'Avı seç.',
    color: '#FF4D4D',
  },
  tiger: {
    name: 'Kaplan Köpekbalığı',
    emoji: '🐯',
    team: 'shark',
    goal: 'İz sürücü. Her dalışta birini izlersin: o gece kimi ziyaret ettiğini (kimi koruduğunu, kime baktığını) öğrenirsin.',
    night: 'Avı seç ve izleyeceğin kişiyi seç.',
    color: '#FF7A45',
  },
  hammer: {
    name: 'Çekiçbaş',
    emoji: '🔨',
    team: 'shark',
    goal: 'Sabotajcı. Her dalışta bir insanın yeteneğini kilitlersin: o gece koruyamaz, bakamaz, saldıramaz.',
    night: 'Avı seç ve kilitleyeceğin kişiyi seç.',
    color: '#FF5E7A',
  },
  nurse: {
    name: 'Hemşire Köpekbalığı',
    emoji: '🩹',
    team: 'shark',
    goal: 'Takımın doktoru. Her dalışta bir köpekbalığını (kendini de) korursun: Sörfçü patlamasından ve ertesi gün Zıpkıncı’dan kurtulur.',
    night: 'Avı seç ve koruyacağın köpekbalığını seç.',
    color: '#FF8FA3',
  },
  shark: {
    name: 'Köpekbalığı',
    emoji: '🦈',
    team: 'shark',
    goal: 'Avcı. Takımınla birlikte her dalışta bir av seçersin.',
    night: 'Avı seç.',
    color: '#E04848',
  },
  lifeguard: {
    name: 'Kıyı Cankurtaranı',
    emoji: '🛟',
    team: 'human',
    goal: 'Her dalışta birini şamandırayla korursun: köpekbalığı saldırısından ve Sörfçü patlamasından kurtulur. Kendini yalnızca 1 kez koruyabilirsin. Mürekkep Balığı kalkanı deler.',
    night: 'Koruyacağın kişiyi seç.',
    color: '#48CAE4',
  },
  oceanographer: {
    name: 'Oşinograf',
    emoji: '🔭',
    team: 'human',
    goal: 'Her dalışta birine bakarsın: hangi takımda olduğunu ve son 2 gecede kimi ziyaret ettiğini (akıntı haritası) öğrenirsin.',
    night: 'Bakacağın kişiyi seç.',
    color: '#5BD6F0',
  },
  spearman: {
    name: 'Zıpkıncı',
    emoji: '🔱',
    team: 'human',
    goal: 'Tek zehirli zıpkının var. 2. günden itibaren plajda birini anında vurabilirsin; vurulanın rolü açıklanır. Yanlışlıkla masum vursan da sen ölmezsin.',
    night: null,
    color: '#7FDBFF',
  },
  marshal: {
    name: 'Sahil Güvenlik Komutanı',
    emoji: '🎖️',
    team: 'human',
    goal: 'Plajda istediğin an kimliğini açabilirsin. Açınca kafes oyun 2 sayılır ama herkes kim olduğunu bilir.',
    night: null,
    color: '#FFB703',
  },
  medium: {
    name: 'Mercan Medyumu',
    emoji: '🪸',
    team: 'human',
    goal: 'Plajda ve oylamada elenenlerin gizli sohbetini okur, yazarsın. Ölülerin ipuçlarını yaşayanlara taşı.',
    night: null,
    color: '#FF9F80',
  },
  tourist: {
    name: 'Tatilci',
    emoji: '🏖️',
    team: 'human',
    goal: 'Özel yeteneğin yok. Konuş, dinle, köpekbalıklarını bul ve kafese at.',
    night: null,
    color: '#E0A96D',
  },
  squid: {
    name: 'Dev Mürekkep Balığı',
    emoji: '🦑',
    team: 'neutral',
    goal: 'Tek başınasın. Her dalışta birini boğarsın; koruma işe yaramaz. Köpekbalıkları seni ısıramaz. Tek başına ya da biriyle baş başa kalırsan kazanırsın.',
    night: 'Boğacağın kişiyi seç.',
    color: '#B98CFF',
  },
  surfer: {
    name: 'Yalnız Sörfçü',
    emoji: '🏄',
    team: 'neutral',
    goal: 'Tek başınasın. Her dalışta birini işaretlersin ya da “Telsiz Patlat” dersin: işaretli herkes o gece derinlere çekilir (korunan kurtulur). Tek başına ya da biriyle baş başa kalırsan kazanırsın.',
    night: 'İşaretleyeceğin kişiyi seç ya da Telsiz Patlat.',
    color: '#C9A2FF',
  },
  scavenger: {
    name: 'Batık Hazine Avcısı',
    emoji: '💰',
    team: 'neutral',
    goal: 'Tek başınasın. Herkesi tehlikeli bir köpekbalığı olduğuna inandır: oylamayla kafese atılırsan oyun biter ve YALNIZ SEN kazanırsın.',
    night: null,
    color: '#FFD166',
  },
};

/** Rol çarkında görünen sıra */
export const SK_WHEEL: SkRole[] = [
  'alpha',
  'lifeguard',
  'tiger',
  'oceanographer',
  'squid',
  'hammer',
  'spearman',
  'tourist',
  'nurse',
  'marshal',
  'surfer',
  'medium',
  'shark',
  'scavenger',
];

/** Rolün gece yeteneği var mı (av oyu hariç) */
export function hasAbility(role: SkRole | null): boolean {
  return (
    role === 'tiger' ||
    role === 'hammer' ||
    role === 'nurse' ||
    role === 'lifeguard' ||
    role === 'oceanographer' ||
    role === 'squid' ||
    role === 'surfer'
  );
}

/** Yeteneğin düğme fiili */
export function abilityVerb(role: SkRole | null): string {
  switch (role) {
    case 'tiger':
      return 'İzle';
    case 'hammer':
      return 'Kilitle';
    case 'nurse':
      return 'Koru';
    case 'lifeguard':
      return 'Şamandıra at';
    case 'oceanographer':
      return 'Akıntıya bak';
    case 'squid':
      return 'Boğ';
    case 'surfer':
      return 'İşaretle';
    default:
      return 'Seç';
  }
}

export function winnerText(w: SkWinner | null): { title: string; color: string } {
  switch (w) {
    case 'human':
      return { title: 'İnsanlar kazandı', color: SK_TEAMS.human.color };
    case 'shark':
      return { title: 'Köpekbalıkları kazandı', color: SK_TEAMS.shark.color };
    case 'squid':
      return { title: 'Dev Mürekkep Balığı kazandı', color: SK_ROLES.squid.color };
    case 'surfer':
      return { title: 'Yalnız Sörfçü kazandı', color: SK_ROLES.surfer.color };
    case 'scavenger':
      return { title: 'Batık Hazine Avcısı kazandı!', color: SK_ROLES.scavenger.color };
    case 'nobody':
      return { title: 'Okyanus herkesi yuttu', color: '#9AA4B2' };
    default:
      return { title: 'Oyun bitti', color: '#FFFFFF' };
  }
}

/** Bir oyuncu kazananlardan mı? */
export function isWinner(w: SkWinner | null, role: SkRole | null): boolean {
  if (!w || !role) return false;
  const team = SK_ROLES[role].team;
  if (w === 'human') return team === 'human';
  if (w === 'shark') return team === 'shark';
  return role === w;
}
