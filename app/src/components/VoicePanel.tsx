import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import {
  getVoiceState,
  setVoiceFlags,
  VoiceClient,
  voiceSupported,
  voteKick,
  yieldTurn,
  type VoiceMember,
  type VoiceState,
} from '@/lib/voice';
import { fonts } from '@/theme';

const POLL_MS = 2000;
const MIC_INFO_KEY = 'peoplehere.voiceMicInfo';

/** Mikrofon izni istenmeden önce bir kez gösterilen açıklama */
const MIC_REASON =
  'Sesli sohbet yalnızca uzaktan oyunlarda ve yalnızca sıran geldiğinde mikrofonunu kullanır. Sesin kaydedilmez, hiçbir yerde saklanmaz. İstediğin an mikrofonunu kapatabilirsin; ses filtresiyle sesinin tonunu değiştirebilirsin.';

export type VoiceRoom = {
  state: VoiceState | null;
  joined: boolean;
  joinError: string | null;
  supported: boolean;
  /** Saniyede bir güncellenen saat (geri sayımlar için) */
  now: number;
  member: (id: string) => VoiceMember | undefined;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => Promise<void>;
  toggleFilter: () => Promise<void>;
  yieldTurn: () => void;
  kick: (m: VoiceMember) => Promise<void>;
};

/**
 * Uzaktan odanın sesli sohbeti. Oyuncular sırayla konuşur (sırayı sunucu belirler); sırası gelen kişinin mikrofonu
 * açılır, süre bitince kapanır. Herkes mikrofonunu kapatabilir ve ses filtresini açabilir (filtre herkeste görünür).
 * Atma oylaması yalnızca sabah konuşmalarından hemen sonra açılır. Uygulama arka plana alınınca sıra atlanır.
 * `roomId` boşken hiçbir şey yapmaz (yan yana oda ya da oyun bitti).
 */
export function useVoiceRoom(roomId: string | null, myId: string | null): VoiceRoom {
  const [state, setState] = useState<VoiceState | null>(null);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const client = useRef<VoiceClient | null>(null);
  const supported = voiceSupported();

  const me = myId ? state?.members?.find((m) => m.user_id === myId) : undefined;
  const micOn = me?.mic_on ?? true;
  const filterOn = me?.filter_on ?? false;

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const s = await getVoiceState(roomId);
    if (s) setState(s);
    setNow(Date.now());
  }, [roomId]);

  // Durum birkaç saniyede bir okunur (sıra, süre, mikrofon/filtre, atma oyları); geri sayım her saniye akar
  useEffect(() => {
    if (!roomId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [roomId, refresh]);

  // Oda sesli sohbetten çıkınca (oyun bitti, oyundan çıktım) ya da ekran kapanınca bağlantı kapanır
  useEffect(() => {
    if (!roomId) return;
    return () => {
      client.current?.leave();
      client.current = null;
      setJoined(false);
    };
  }, [roomId]);

  // Uygulama arka plana alınınca (ya da telefon çağrısı gelince) sıra atlanır ve mikrofon kapanır
  useEffect(() => {
    if (!roomId) return;
    const sub = AppState.addEventListener('change', (st) => {
      const away = st !== 'active';
      void setVoiceFlags(roomId, { away });
      if (away) void client.current?.setSpeaking(false);
    });
    return () => sub.remove();
  }, [roomId]);

  // Sırası gelen kişinin mikrofonu yayına açılır; sıra bitince kapanır
  const canSpeak = Boolean(state?.can_speak) && micOn && joined;
  useEffect(() => {
    void client.current?.setSpeaking(canSpeak);
  }, [canSpeak]);

  // Filtre durumu sesin tonuna uygulanır
  useEffect(() => {
    client.current?.setFilter(filterOn);
  }, [filterOn, joined]);

  async function join() {
    if (!roomId) return;
    setJoinError(null);
    let seen = false;
    try {
      seen = (await AsyncStorage.getItem(MIC_INFO_KEY)) === '1';
    } catch {
      seen = false;
    }
    if (!seen) {
      const ok = await showDialog<boolean>({
        title: 'Sesli sohbet',
        message: MIC_REASON,
        icon: 'mic',
        buttons: [
          { label: 'Anladım, katıl', value: true, style: 'primary' },
          { label: 'Vazgeç', value: false, style: 'ghost' },
        ],
        cancelValue: false,
      });
      if (!ok) return;
      void AsyncStorage.setItem(MIC_INFO_KEY, '1').catch(() => {});
    }
    const c = new VoiceClient(roomId);
    c.onStop = (reason) => {
      setJoined(false);
      client.current = null;
      if (reason === 'budget') {
        void notify('Sesli sohbet kapandı', 'Bu ayın ücretsiz sesli sohbet süresi doldu. Gelecek ay yeniden açılır.', {
          icon: 'mic-off',
        });
      }
    };
    const err = await c.join();
    if (err) {
      setJoinError(err);
      return;
    }
    client.current = c;
    setJoined(true);
    void setVoiceFlags(roomId, { away: false });
    void refresh();
  }

  function leave() {
    client.current?.leave();
    client.current = null;
    setJoined(false);
  }

  async function toggleMic() {
    if (!roomId) return;
    await setVoiceFlags(roomId, { mic: !micOn });
    void refresh();
  }

  async function toggleFilter() {
    if (!roomId) return;
    await setVoiceFlags(roomId, { filter: !filterOn });
    void refresh();
  }

  async function kick(m: VoiceMember) {
    if (!roomId || !state) return;
    const need = state.kick_needed;
    const secs = state.kick_seconds ?? 10;
    if (!m.my_kick_vote) {
      if (!need) {
        await notify('Atma oylaması', 'Odada atma oylaması için yeterli kişi yok.', { icon: 'people' });
        return;
      }
      const ok = await confirmAction(
        `${m.name} odadan atılsın mı?`,
        `${need} kişi atmak isterse ${secs} saniye içinde ${m.name} odadan çıkarılır ve bu odaya geri giremez. Süre dolmadan oyunu geri alabilirsin.`,
        'Atılsın',
        true,
      );
      if (!ok) return;
    }
    const res = await voteKick(roomId, m.user_id);
    if (res.error) return void notify('Oy verilemedi', res.error, { icon: 'alert-circle' });
    void refresh();
  }

  return {
    state,
    joined,
    joinError,
    supported,
    now,
    member: (id) => state?.members?.find((m) => m.user_id === id),
    join,
    leave,
    toggleMic,
    toggleFilter,
    yieldTurn: () => {
      if (roomId) void yieldTurn(roomId).then(refresh);
    },
    kick,
  };
}

/** Sesli sohbetin tek satırlık şeridi: katıl / mikrofon / filtre / kimin konuştuğu. */
export function VoiceBar({ voice, myId }: { voice: VoiceRoom; myId: string }) {
  const s = voice.state;
  if (!s?.allowed) return null;
  const members = s.members ?? [];
  const me = members.find((m) => m.user_id === myId);
  const micOn = me?.mic_on ?? true;
  const filterOn = me?.filter_on ?? false;
  const speaker = members.find((m) => m.user_id === s.speaker) ?? null;
  const left = s.turn_ends_at ? Math.max(0, Math.ceil((Date.parse(s.turn_ends_at) - voice.now) / 1000)) : 0;
  const iSpeak = s.speaker === myId;

  const turnText = speaker
    ? iSpeak
      ? `Sıra sende · ${left} sn`
      : `Konuşuyor: ${speaker.name} · ${left} sn`
    : s.narrator === myId
      ? 'Anlatıcısın: her zaman konuşabilirsin'
      : s.phase === 'dawn'
        ? 'Herkes konuştu; oylama başlıyor'
        : s.kick_open && s.kick_enabled
          ? 'Odadan atmak için avatara uzun bas'
          : 'Sabah herkes sırayla konuşur';

  let lead: React.ReactNode;
  if (!s.enabled) {
    lead = <Text style={styles.note}>Bu ayın ücretsiz sesli sohbet süresi doldu</Text>;
  } else if (!voice.supported) {
    lead = <Text style={styles.note}>Ses, uygulamanın kendi sürümünde çalışır (Expo Go’da yok)</Text>;
  } else if (!voice.joined) {
    lead = (
      <Pressable
        onPress={() => void voice.join()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.join, pressed && styles.pressed]}
        testID="voice-join"
      >
        <Ionicons name="headset" size={15} color="#06201D" />
        <Text style={styles.joinText}>Sese katıl</Text>
      </Pressable>
    );
  } else {
    lead = (
      <>
        <Pressable
          onPress={() => void voice.toggleMic()}
          accessibilityRole="button"
          accessibilityLabel={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
          hitSlop={6}
          style={({ pressed }) => [styles.icon, !micOn && styles.iconOff, pressed && styles.pressed]}
          testID="voice-mic"
        >
          <Ionicons name={micOn ? 'mic' : 'mic-off'} size={17} color={micOn ? '#FFFFFF' : '#FF8A98'} />
        </Pressable>
        <Pressable
          onPress={() => void voice.toggleFilter()}
          accessibilityRole="button"
          accessibilityLabel={filterOn ? 'Ses filtresini kapat' : 'Ses filtresini aç'}
          hitSlop={6}
          style={({ pressed }) => [styles.filter, filterOn && styles.filterOn, pressed && styles.pressed]}
          testID="voice-filter"
        >
          <Ionicons name="color-filter" size={14} color={filterOn ? '#1A1200' : '#FFFFFF'} />
          <Text style={[styles.filterText, filterOn && styles.filterTextOn]}>
            {filterOn ? 'Filtre açık' : 'Filtre'}
          </Text>
        </Pressable>
      </>
    );
  }

  return (
    <View style={styles.bar} testID="voice-bar">
      {lead}
      <View style={[styles.turn, iSpeak && styles.turnMine]}>
        <Ionicons name={iSpeak ? 'mic' : speaker ? 'volume-high' : 'chatbubbles-outline'} size={14} color="#FFFFFF" />
        <Text style={styles.turnText} numberOfLines={1}>
          {turnText}
        </Text>
        {iSpeak ? (
          <Pressable onPress={voice.yieldTurn} hitSlop={8} accessibilityRole="button">
            <Text style={styles.yield}>Bitir</Text>
          </Pressable>
        ) : null}
      </View>
      {voice.joined ? (
        <Pressable
          onPress={voice.leave}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Sesli sohbetten ayrıl"
          style={styles.icon}
        >
          <Ionicons name="call" size={15} color="#FF8A98" style={styles.hangup} />
        </Pressable>
      ) : null}
      {voice.joinError ? (
        <Text style={styles.error} numberOfLines={2}>
          {voice.joinError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(8, 10, 20, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 197, 0.45)',
  },
  note: { flexShrink: 1, color: 'rgba(255,255,255,0.75)', fontSize: 11.5 },
  join: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#22D3C5',
  },
  joinText: { color: '#06201D', fontFamily: fonts.extra, fontSize: 12 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  iconOff: { backgroundColor: 'rgba(255, 90, 110, 0.25)' },
  hangup: { transform: [{ rotate: '135deg' }] },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  filterOn: { backgroundColor: '#FFC93C' },
  filterText: { color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 11.5 },
  filterTextOn: { color: '#1A1200', fontFamily: fonts.extra },
  turn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  turnMine: { backgroundColor: 'rgba(34, 211, 197, 0.55)' },
  turnText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.semi, fontSize: 12 },
  yield: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 12, textDecorationLine: 'underline' },
  error: { width: '100%', color: '#FF8A98', fontSize: 11.5 },
});
