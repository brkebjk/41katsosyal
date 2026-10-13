// Uzaktan odalarda sesli sohbet (Agora). Ses telefonlar arasında Agora üzerinden taşınır; sunucumuza gelmez ve
// KAYDEDİLMEZ. Konuşma sırasını sunucu belirler (voice_state): uygulama yalnızca sırası gelen kişinin mikrofonunu açar.
// Ses modülü Expo Go'da yoktur: orada `voiceSupported()` false döner ve sesli sohbet yerine bilgi yazısı görünür
// (uygulamanın kendi sürümünde çalışır).

import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

type AgoraModule = typeof import('react-native-agora');

export type VoiceMember = {
  user_id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  mic_on: boolean;
  filter_on: boolean;
  away: boolean;
  agora_uid: number | null;
  kick_votes: number;
  my_kick_vote: boolean;
  kickable: boolean;
};

export type VoiceState = {
  allowed: boolean;
  /** Sesli sohbet açık ve bu ayın kotası dolmadı */
  enabled?: boolean;
  kick_enabled?: boolean;
  phase?: string | null;
  narrator?: string | null;
  speaker?: string | null;
  turn_ends_at?: string | null;
  turn_seconds?: number;
  queue?: string[];
  can_speak?: boolean;
  players_active?: number;
  members?: VoiceMember[];
};

const TEXT: Record<string, string> = {
  kick_disabled: 'Oylamayla atma şu an kapalı.',
  not_kickable: 'Bu oyuncu oylamayla atılamaz.',
  room_not_found: 'Oda artık açık değil.',
};

/** Ses modülü bu uygulamada var mı? (Expo Go'da yok) */
export function voiceSupported(): boolean {
  try {
    return Boolean(TurboModuleRegistry.get('AgoraRtcNg') ?? NativeModules.AgoraRtcNg);
  } catch {
    return false;
  }
}

function agora(): AgoraModule | null {
  if (!voiceSupported()) return null;
  try {
    // Yalnızca modül varken yüklenir (Expo Go'da yüklemek uygulamayı çökertir)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-agora') as AgoraModule;
  } catch {
    return null;
  }
}

export async function getVoiceState(roomId: string): Promise<VoiceState | null> {
  const res = await callRpc<VoiceState>('voice_state', { p_room_id: roomId }, TEXT);
  return res.data ?? null;
}

export async function setVoiceFlags(
  roomId: string,
  flags: { mic?: boolean; filter?: boolean; away?: boolean },
): Promise<Result> {
  return callRpcVoid(
    'voice_set',
    { p_room_id: roomId, p_mic: flags.mic ?? null, p_filter: flags.filter ?? null, p_away: flags.away ?? null },
    TEXT,
  );
}

export async function yieldTurn(roomId: string): Promise<Result> {
  return callRpcVoid('voice_yield', { p_room_id: roomId }, TEXT);
}

export async function voteKick(
  roomId: string,
  target: string,
): Promise<{ data: { kicked: boolean; votes: number; needed: number } | null; error: string | null }> {
  return callRpc('room_vote_kick', { p_room_id: roomId, p_target: target }, TEXT);
}

/** Atılmak için gereken oy: odadaki etkin oyuncuların (atılacak kişi hariç) yarısından fazlası */
export function kickNeeded(playersActive: number): number {
  return Math.floor(Math.max(0, playersActive - 1) / 2) + 1;
}

async function micPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iPhone'da izin penceresini ses modülü ilk konuşmada açar
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

type TokenAnswer = { result: string; appId?: string; channel?: string; uid?: number; token?: string };

const TOKEN_TEXT: Record<string, string> = {
  budget: 'Bu ayın ücretsiz sesli sohbet süresi doldu. Gelecek ay yeniden açılır.',
  forbidden: 'Bu odanın sesli sohbetine katılamazsın.',
  not_configured: 'Sesli sohbet sunucuda henüz kurulmamış (Agora anahtarları eksik).',
};

async function fetchToken(roomId: string): Promise<{ data: TokenAnswer | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase.functions.invoke('voice-token', { method: 'POST', body: { roomId } });
  if (error) return { data: null, error: 'Sesli sohbete bağlanılamadı. İnternet bağlantını kontrol et.' };
  const ans = data as TokenAnswer;
  if (ans.result !== 'ok' || !ans.token || !ans.appId || !ans.channel || !ans.uid) {
    return { data: null, error: TOKEN_TEXT[ans.result] ?? 'Sesli sohbete bağlanılamadı.' };
  }
  return { data: ans, error: null };
}

/**
 * Bir odanın sesli sohbet bağlantısı. Tek seferde tek oda. Dinleyici olarak girer; `setSpeaking(true)` ile (sırası
 * gelince) mikrofonu yayına açar. Anahtar süresi dolmadan kendiliğinden yenilenir.
 */
export class VoiceClient {
  private roomId: string;
  private engine: ReturnType<AgoraModule['createAgoraRtcEngine']> | null = null;
  private mod: AgoraModule | null = null;
  private speaking = false;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private handler: object | null = null;
  onStop: ((reason: string) => void) | null = null;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  get joined(): boolean {
    return this.engine !== null;
  }

  /** Sesli sohbete girer (dinleyici). Hata metni ya da boş döner. */
  async join(): Promise<string | null> {
    if (this.engine) return null;
    const mod = agora();
    if (!mod) return 'Sesli sohbet bu sürümde yok (Expo Go). Uygulamanın kendi sürümünde çalışır.';
    const tok = await fetchToken(this.roomId);
    if (!tok.data) return tok.error;
    const engine = mod.createAgoraRtcEngine();
    engine.initialize({
      appId: tok.data.appId,
      channelProfile: mod.ChannelProfileType.ChannelProfileLiveBroadcasting,
      audioScenario: mod.AudioScenarioType.AudioScenarioChatroom,
    });
    const handler = {
      onTokenPrivilegeWillExpire: () => {
        void fetchToken(this.roomId).then((t) => {
          if (t.data?.token) this.engine?.renewToken(t.data.token);
          else this.stop('token');
        });
      },
    };
    engine.registerEventHandler(handler);
    this.handler = handler;
    engine.enableAudio();
    engine.disableVideo();
    const rc = engine.joinChannel(tok.data.token!, tok.data.channel!, tok.data.uid!, {
      clientRoleType: mod.ClientRoleType.ClientRoleAudience,
      publishMicrophoneTrack: false,
      autoSubscribeAudio: true,
    });
    if (rc < 0) {
      engine.release();
      return 'Sesli sohbete bağlanılamadı.';
    }
    this.engine = engine;
    this.mod = mod;
    // Dakikada bir "bağlıyım" (aylık kota sayacı); sunucu durdur derse çıkılır
    const ping = () =>
      void callRpc<{ stop: boolean; reason?: string }>('voice_ping', { p_room_id: this.roomId }).then((r) => {
        if (r.data?.stop) this.stop(r.data.reason ?? 'stop');
      });
    ping();
    this.pinger = setInterval(ping, 50_000);
    return null;
  }

  /** Sırası gelince mikrofonu yayına açar, bitince kapatır */
  async setSpeaking(on: boolean): Promise<void> {
    if (!this.engine || !this.mod || on === this.speaking) return;
    if (on && !(await micPermission())) return;
    const role = on ? this.mod.ClientRoleType.ClientRoleBroadcaster : this.mod.ClientRoleType.ClientRoleAudience;
    this.engine.setClientRole(role);
    this.engine.updateChannelMediaOptions({ clientRoleType: role, publishMicrophoneTrack: on });
    this.speaking = on;
  }

  /** Ses filtresi: sesin tonunu kalınlaştırır (kim olduğun sesinden anlaşılmasın) */
  setFilter(on: boolean): void {
    this.engine?.setLocalVoicePitch(on ? 0.72 : 1.0);
  }

  private stop(reason: string): void {
    this.leave();
    this.onStop?.(reason);
  }

  leave(): void {
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    const engine = this.engine;
    this.engine = null;
    this.speaking = false;
    if (!engine) return;
    try {
      if (this.handler) engine.unregisterEventHandler(this.handler);
      engine.leaveChannel();
      engine.release();
    } catch {
      // bağlantı zaten kapanmış olabilir
    }
  }
}
