import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AudioQuality,
  createAudioPlayer,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
  type RecordingOptions,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { notify, showDialog } from '@/lib/dialog';
import { getVoiceClip, postVoiceClip, type SkClip } from '@/lib/shark';
import { fonts } from '@/theme';

// Köpekbalığı Kafesi bas-konuş: basılı tutunca en çok 5 sn ses kaydedilir ve odaya gönderilir. Gelen ses mesajları
// sırayla çalınır; biri konuşurken başkası da kaydedebilir, onun mesajı sıradakinin ardından çalar. Ses sunucuda geçici
// durur: en geç 10 dakika sonra silinir (şikâyet edilen en çok 14 gün). Expo Go'da da çalışır.

const MAX_MS = 5000;
const INFO_KEY = 'kat41.pttInfo';

/** Küçük ve her iki telefonda da çalınabilen ses biçimi (AAC / m4a, tek kanal, 32 kbit/sn ≈ 5 sn için 20 KB) */
const CLIP_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

const PTT_REASON =
  'Bas-konuş: yalnızca düğmeye basılı tuttuğunda en çok 5 saniye kaydedilir. Ses mesajın odadakilere sırayla çalınır ve en geç 10 dakika sonra sunucudan silinir (şikâyet edilirse moderatör bakana kadar en çok 14 gün saklanır). Mikrofonun başka hiçbir zaman açılmaz.';

/**
 * Gelen ses mesajlarını sırayla çalar. Ekrana girmeden önceki mesajlar çalınmaz; kendi mesajın çalınmaz.
 * `paused` iken (sen kaydederken) sıradaki mesaj beklemeye alınır.
 */
export function useClipQueue(clips: SkClip[] | undefined, myId: string | null, enabled: boolean, paused: boolean) {
  const played = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  const queue = useRef<SkClip[]>([]);
  const busy = useRef(false);
  const pausedRef = useRef(paused);
  const player = useRef<AudioPlayer | null>(null);
  const [now, setNow] = useState<SkClip | null>(null);
  const [waiting, setWaiting] = useState(0);
  const pumpRef = useRef<() => void>(() => {});

  // Uzaktan oyunda ses mesajları telefon sessizdeyken de duyulsun
  useEffect(() => {
    if (!enabled) return;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', allowsRecording: false }).catch(
      () => {},
    );
    return () => {
      void setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false }).catch(() => {});
    };
  }, [enabled]);

  const finish = useCallback((file: File | null) => {
    try {
      player.current?.remove();
    } catch {
      // yok say
    }
    player.current = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // yok say
    }
    busy.current = false;
    setNow(null);
    setWaiting(queue.current.length);
    pumpRef.current();
  }, []);

  const pump = useCallback(async () => {
    if (busy.current || pausedRef.current || queue.current.length === 0) return;
    busy.current = true;
    const clip = queue.current.shift() as SkClip;
    setWaiting(queue.current.length);
    setNow(clip);
    let file: File | null = null;
    try {
      const b64 = await getVoiceClip(clip.id);
      if (!b64) throw new Error('missing');
      file = new File(Paths.cache, `sk-${clip.id}.m4a`);
      if (file.exists) file.delete();
      file.create();
      file.write(b64, { encoding: 'base64' });
      const p = createAudioPlayer({ uri: file.uri });
      player.current = p;
      const f = file;
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        sub.remove();
        finish(f);
      };
      const sub = p.addListener('playbackStatusUpdate', (st) => {
        if (st.didJustFinish) end();
      });
      // Bitti haberi gelmezse en geç süre + 2 sn sonra sıradakine geçilir
      const guard = setTimeout(end, clip.ms + 2000);
      p.play();
    } catch {
      finish(file);
    }
  }, [finish]);

  useEffect(() => {
    pumpRef.current = () => void pump();
  }, [pump]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) player.current?.pause();
    else {
      if (player.current) player.current.play();
      pumpRef.current();
    }
  }, [paused]);

  // Yeni gelen mesajlar sıraya girer
  useEffect(() => {
    if (!enabled || !clips) return;
    if (!ready.current) {
      // Ekrana girildiğinde var olan mesajlar çalınmaz
      for (const c of clips) played.current.add(c.id);
      ready.current = true;
      return;
    }
    let added = false;
    for (const c of clips) {
      if (played.current.has(c.id)) continue;
      played.current.add(c.id);
      if (c.from === myId) continue;
      queue.current.push(c);
      added = true;
    }
    if (added) {
      queue.current.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      setWaiting(queue.current.length);
      pumpRef.current();
    }
  }, [clips, enabled, myId]);

  // Ekrandan çıkınca çalan ses durur
  useEffect(
    () => () => {
      queue.current = [];
      try {
        player.current?.remove();
      } catch {
        // yok say
      }
      player.current = null;
    },
    [],
  );

  return { speaking: now, waiting };
}

/** Basılı tut, konuş düğmesi. `canTalk` değilse kapalı görünür ve nedeni yazar. */
export function PushToTalk({
  roomId,
  canTalk,
  closedText,
  channelText,
  onRecording,
  onSent,
}: {
  roomId: string;
  canTalk: boolean;
  closedText: string;
  /** Kimlerin duyacağı (ör. "Herkes duyar", "Yalnızca köpekbalıkları duyar") */
  channelText: string;
  onRecording: (on: boolean) => void;
  onSent: () => void;
}) {
  const recorder = useAudioRecorder(CLIP_OPTIONS);
  const [rec, setRec] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const startedAt = useRef(0);
  const holding = useRef(false);
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(async () => {
    if (!active.current) return;
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation();
    const ms = Math.min(MAX_MS, Date.now() - startedAt.current);
    try {
      await recorder.stop();
    } catch {
      // kayıt zaten bitmiş olabilir
    }
    setRec(false);
    onRecording(false);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) return;
    const file = new File(uri);
    try {
      if (ms < 400) {
        await notify('Basılı tut', 'Konuşmak için düğmeye basılı tut, bitince bırak (en çok 5 sn).', { icon: 'mic' });
        return;
      }
      setSending(true);
      const b64 = await file.base64();
      const err = await postVoiceClip(roomId, b64, Math.max(300, ms));
      if (err) await notify('Ses gönderilemedi', err, { icon: 'mic-off' });
      else onSent();
    } catch {
      await notify('Ses gönderilemedi', 'Kayıt okunamadı. Tekrar dene.', { icon: 'mic-off' });
    } finally {
      setSending(false);
      try {
        if (file.exists) file.delete();
      } catch {
        // yok say
      }
    }
  }, [recorder, roomId, onRecording, onSent, progress]);

  async function start() {
    holding.current = true;
    if (!canTalk || active.current || sending) return;
    let seen = false;
    try {
      seen = (await AsyncStorage.getItem(INFO_KEY)) === '1';
    } catch {
      seen = false;
    }
    if (!seen) {
      holding.current = false;
      const ok = await showDialog<boolean>({
        title: 'Bas-konuş',
        message: PTT_REASON,
        icon: 'mic',
        buttons: [
          { label: 'Anladım', value: true, style: 'primary' },
          { label: 'Vazgeç', value: false, style: 'ghost' },
        ],
        cancelValue: false,
      });
      if (!ok) return;
      void AsyncStorage.setItem(INFO_KEY, '1').catch(() => {});
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        await notify('Mikrofon izni yok', 'Telefonunun ayarlarından 41. Kat Sosyal için mikrofon iznini açabilirsin.', {
          icon: 'mic-off',
        });
      }
      return; // izin verildiyse kullanıcı tekrar basıp konuşur
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      await notify('Mikrofon izni yok', 'Telefonunun ayarlarından 41. Kat Sosyal için mikrofon iznini açabilirsin.', {
        icon: 'mic-off',
      });
      return;
    }
    if (!holding.current) return; // izin sorulurken parmak kalktı
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_MS / 1000 });
    } catch {
      await notify('Mikrofon açılamadı', 'Tekrar dene.', { icon: 'mic-off' });
      return;
    }
    active.current = true;
    startedAt.current = Date.now();
    setRec(true);
    onRecording(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: MAX_MS, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => void stop(), MAX_MS + 50);
    if (!holding.current) void stop();
  }

  function release() {
    holding.current = false;
    void stop();
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (active.current) {
        active.current = false;
        void recorder.stop().catch(() => {});
      }
    },
    [recorder],
  );

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable
      onPressIn={() => void start()}
      onPressOut={release}
      disabled={!canTalk && !rec}
      accessibilityRole="button"
      accessibilityLabel={canTalk ? 'Basılı tut ve konuş' : closedText}
      testID="sk-ptt"
      style={[styles.ptt, !canTalk && styles.pttOff, rec && styles.pttRec]}
    >
      {rec ? <Animated.View style={[styles.pttFill, { width }]} /> : null}
      <View style={styles.pttIcon}>
        <Ionicons name={canTalk ? 'mic' : 'mic-off'} size={22} color={rec ? '#FFFFFF' : canTalk ? '#06201D' : '#9AA4B2'} />
      </View>
      <View style={styles.pttTexts}>
        <Text style={[styles.pttTitle, !canTalk && styles.pttTitleOff, rec && styles.pttTitleRec]} numberOfLines={1}>
          {sending ? 'Gönderiliyor…' : rec ? 'KAYDEDİYOR · bırakınca gider' : canTalk ? 'BASILI TUT, KONUŞ (5 sn)' : closedText}
        </Text>
        {canTalk && !rec ? <Text style={styles.pttSub}>{channelText}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ptt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 27,
    backgroundColor: '#48CAE4',
    overflow: 'hidden',
  },
  pttOff: { backgroundColor: 'rgba(11, 19, 43, 0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  pttRec: { backgroundColor: '#8E1B2C' },
  pttFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#D9304F' },
  pttIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pttTexts: { flex: 1 },
  pttTitle: { color: '#06201D', fontFamily: fonts.black, fontSize: 14 },
  pttTitleOff: { color: '#9AA4B2', fontFamily: fonts.semi, fontSize: 12.5 },
  pttTitleRec: { color: '#FFFFFF' },
  pttSub: { color: '#06201D', fontFamily: fonts.semi, fontSize: 11 },
});
