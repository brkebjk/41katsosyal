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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { notify, showDialog } from '@/lib/dialog';
import { getVoiceClip, postVoiceClip, type SkClip } from '@/lib/shark';
import { setSoundMuted } from '@/lib/sounds';
import { fonts } from '@/theme';

// Köpekbalığı Kafesi bas-konuş: basılı tutunca en çok 10 sn ses kaydedilir ve odaya gönderilir. Gelen ses mesajları
// sırayla çalınır; biri konuşurken başkası da kaydedebilir, onun mesajı sıradakinin ardından çalar. Ses sunucuda geçici
// durur: en geç 10 dakika sonra silinir (şikâyet edilen en çok 14 gün). Expo Go'da da çalışır.

const MAX_MS = 10000;
const INFO_KEY = 'peoplehere.pttInfo';
/** Bilgi penceresi bir kez görüldüyse tekrar diskten okunmaz (kayıt düğmeye basar basmaz başlasın) */
let infoSeen = false;

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
  'Bas-konuş düğmesine yalnızca basılı tuttuğunda kaydedilir. Her tartışmada toplam 10 saniye konuşabilirsin. Ses mesajın odadakilere sırayla çalınır ve en geç 10 dakika sonra sunucudan silinir (şikâyet edilirse moderatör bakana kadar en çok 14 gün saklanır). Mikrofonun başka hiçbir zaman açılmaz.';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 yazıyı baytlara çevirir (dosyaya ham bayt olarak yazılır; kodlama seçeneğine güvenilmez) */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** Mikrofon açılırken ve açıkken ses modu "yalnızca çalma"ya çevrilmez: iPhone'da kaydı anında keser */
let micBusy = false;
/** Şu anki ses modu (aynı modu tekrar tekrar kurmamak için; boş = bilinmiyor) */
let modeRec: boolean | null = null;

/** Çalma sırasında ses telefon sessizdeyken de hoparlörden duyulsun (kayıt açıkken de) */
function playbackMode(recording: boolean, force = false): Promise<void> {
  if (!recording && micBusy) return Promise.resolve();
  if (!force && modeRec === recording) return Promise.resolve();
  modeRec = recording;
  return setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    allowsRecording: recording,
    shouldRouteThroughEarpiece: false,
  }).catch(() => {
    modeRec = null;
  });
}

/**
 * Gelen ses mesajlarını sırayla çalar. Ekrana girmeden önceki mesajlar çalınmaz; kendi mesajın çalınmaz.
 * Sen kaydederken de çalmaya devam eder (başkasının sesi kesilmez).
 */
export function useClipQueue(clips: SkClip[] | undefined, myId: string | null, enabled: boolean, recording: boolean) {
  const played = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  const queue = useRef<SkClip[]>([]);
  const busy = useRef(false);
  const recordingRef = useRef(recording);
  const player = useRef<AudioPlayer | null>(null);
  const [now, setNow] = useState<SkClip | null>(null);
  const [waiting, setWaiting] = useState(0);
  /** Son çalma hatası (ekranda kısa süre görünür; sorun bildirmek için) */
  const [error, setError] = useState<string | null>(null);
  const pumpRef = useRef<() => void>(() => {});
  /** Çalan sesi duraklat / sürdür (kayıt sırasında) */
  const pauseRef = useRef<(on: boolean) => void>(() => {});

  // Uzaktan oyunda ses mesajları telefon sessizdeyken de duyulsun
  useEffect(() => {
    if (!enabled) return;
    void playbackMode(false, true);
    return () => {
      modeRec = null;
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
    pauseRef.current = () => {};
    setNow(null);
    setWaiting(queue.current.length);
    pumpRef.current();
  }, []);

  const pump = useCallback(async () => {
    // Sen kaydederken yeni ses başlamaz (mikrofona girmesin); kayıt bitince sıradaki çalar
    if (busy.current || queue.current.length === 0 || recordingRef.current) return;
    busy.current = true;
    const clip = queue.current.shift() as SkClip;
    setWaiting(queue.current.length);
    setNow(clip);
    setError(null);
    let file: File | null = null;
    let step = 'indirilemedi';
    try {
      const b64 = await getVoiceClip(clip.id);
      if (!b64) throw new Error('fetch');
      step = 'kaydedilemedi';
      file = new File(Paths.cache, `sk-${clip.id}.m4a`);
      if (file.exists) file.delete();
      file.create();
      file.write(base64ToBytes(b64));
      step = 'çalınamadı';
      if (!recordingRef.current) await playbackMode(false);
      const p = createAudioPlayer({ uri: file.uri });
      player.current = p;
      const f = file;
      let done = false;
      let started = false;
      let startedAt = 0;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const end = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        sub.remove();
        finish(f);
      };
      const start = () => {
        if (started || done) return;
        started = true;
        startedAt = Date.now();
        if (!recordingRef.current) p.play();
        // Ses bildirilen sürenin sonunda kesilir (uzun ses gönderilse bile); bitti haberi gelmezse de sıradakine geçilir.
        // Sen kaydederken ses duraklar; süre sayacı da durur, bırakınca kaldığı yerden devam eder.
        let left = clip.ms + 800;
        let armedAt = Date.now();
        const arm = () => {
          armedAt = Date.now();
          timers.push(setTimeout(end, left));
        };
        if (!recordingRef.current) arm();
        pauseRef.current = (on: boolean) => {
          if (done) return;
          if (on) {
            timers.forEach(clearTimeout);
            timers.length = 0;
            left = Math.max(300, left - (Date.now() - armedAt));
            try {
              p.pause();
            } catch {
              // yok say
            }
          } else {
            p.play();
            arm();
          }
        };
      };
      const sub = p.addListener('playbackStatusUpdate', (st) => {
        // Ses yüklenince çalınır; yüklenmeden gelen "bitti" haberi (bazı telefonlarda hemen gelir) yok sayılır
        if (st.isLoaded) start();
        if (st.didJustFinish && started && Date.now() - startedAt > 250) end();
      });
      // Yüklendi haberi gelmezse 1,5 sn sonra yine de çalmayı dene
      timers.push(setTimeout(start, 1500));
    } catch {
      setError(`Ses ${step}`);
      setTimeout(() => setError(null), 3000);
      finish(file);
    }
  }, [finish]);

  useEffect(() => {
    pumpRef.current = () => void pump();
  }, [pump]);

  // Kayıt başlayınca çalan ses mesajı duraklar (hoparlörden mikrofona, oradan karşı tarafa gitmesin); kayıt bitince
  // kaldığı yerden devam eder ve sıradakiler çalar
  // Ses modu burada DEĞİŞTİRİLMEZ: kayıt sürerken ses modunu değiştirmek iPhone'da kaydı hemen keser (bas-konuş düğmesi
  // modu kayıttan önce açar, kayıt bitince kapatır)
  useEffect(() => {
    recordingRef.current = recording;
    if (player.current) pauseRef.current(recording);
    else if (!recording) pumpRef.current();
  }, [recording]);

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

  return { speaking: now, waiting, error };
}

/** Basılı tut, konuş düğmesi. `canTalk` değilse kapalı görünür ve nedeni yazar. */
/**
 * Benim ses mesajım şu an diğerlerinde çalıyor mu: herkes sesleri geliş sırasıyla, üst üste binmeden dinler. Her sesin
 * başlama anı = max(geliş anı, önceki sesin bitişi). Sunucu saatine göre hesaplanır (offsetMs = sunucu − telefon).
 */
export function useListeningToMe(
  clips: SkClip[] | undefined,
  myId: string | null,
  offsetMs: number,
  enabled: boolean,
): boolean {
  const [now, setNow] = useState(() => Date.now());
  const list = clips ?? [];
  const mine = enabled && !!myId && list.some((c) => c.from === myId);
  useEffect(() => {
    if (!mine) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [mine]);
  if (!mine) return false;
  const t = now + offsetMs;
  let end = 0;
  for (const c of [...list].sort((a, b) => a.at.localeCompare(b.at))) {
    const start = Math.max(Date.parse(c.at), end);
    end = start + c.ms + 300;
    if (c.from === myId && t >= start && t <= end) return true;
  }
  return false;
}

export function PushToTalk({
  roomId,
  canTalk,
  closedText,
  channelText,
  leftMs = MAX_MS,
  onRecording,
  onSent,
  listening,
  side,
}: {
  /** Mikrofon kutusunun sağında duran küçük düğme (ör. tartışmayı geç) */
  side?: ReactNode;
  /** Ses mesajım şu an diğerlerinde çalıyor: düğmenin üstünde "Seni dinliyorlar" */
  listening?: boolean;
  roomId: string;
  canTalk: boolean;
  closedText: string;
  /** Bu tartışmada kalan konuşma süresi (ms): kayıt en çok bu kadar sürer */
  leftMs?: number;
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
  /** Bu kaydın üst sınırı: 5 sn ya da tartışmada kalan süre (hangisi azsa) */
  const cap = useRef(MAX_MS);

  const stop = useCallback(async () => {
    if (!active.current) return;
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation();
    const ms = Math.min(cap.current, Date.now() - startedAt.current);
    try {
      await recorder.stop();
    } catch {
      // kayıt zaten bitmiş olabilir (süre dolunca kendiliğinden durur)
    }
    micBusy = false;
    setRec(false);
    onRecording(false);
    setSoundMuted(false);
    void playbackMode(false);
    let uri = recorder.uri;
    if (!uri) {
      try {
        uri = recorder.getStatus().url;
      } catch {
        uri = null;
      }
    }
    if (!uri) {
      await notify('Ses gönderilemedi', 'Kayıt alınamadı. Tekrar basılı tutup konuş.', { icon: null });
      return;
    }
    const file = new File(uri);
    try {
      if (ms < 400) {
        await notify('Basılı tut', 'Konuşmak için düğmeye basılı tut, bitince bırak.', { icon: null });
        return;
      }
      setSending(true);
      const b64 = await file.base64();
      const err = await postVoiceClip(roomId, b64, Math.max(300, ms));
      if (err) await notify('Ses gönderilemedi', err, { icon: null });
      else onSent();
    } catch {
      await notify('Ses gönderilemedi', 'Kayıt okunamadı. Tekrar dene.', { icon: null });
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
    let seen = infoSeen;
    if (!seen) {
      try {
        seen = (await AsyncStorage.getItem(INFO_KEY)) === '1';
      } catch {
        seen = false;
      }
      infoSeen = seen;
    }
    if (!seen) {
      holding.current = false;
      const ok = await showDialog<boolean>({
        title: 'Bas-konuş',
        message: PTT_REASON,
        icon: null,
        buttons: [
          { label: 'Anladım', value: true, style: 'primary' },
          { label: 'Vazgeç', value: false, style: 'ghost' },
        ],
        cancelValue: false,
      });
      if (!ok) return;
      infoSeen = true;
      void AsyncStorage.setItem(INFO_KEY, '1').catch(() => {});
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        await notify('Mikrofon izni yok', 'Telefonunun ayarlarından PeopleHere için mikrofon iznini açabilirsin.', {
          icon: null,
        });
      }
      return; // izin verildiyse kullanıcı tekrar basıp konuşur
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      await notify('Mikrofon izni yok', 'Telefonunun ayarlarından PeopleHere için mikrofon iznini açabilirsin.', {
        icon: null,
      });
      return;
    }
    if (!holding.current) return; // izin sorulurken parmak kalktı
    cap.current = Math.max(300, Math.min(MAX_MS, leftMs));
    // Bu andan sonra gelen ses mesajları ses modunu değiştiremez (kayıt kesilmesin)
    micBusy = true;
    // Çalan ses mesajı ve oyun sesleri mikrofon açılmadan ÖNCE susar: hoparlörden mikrofona girip yansıma yapmasın.
    // Kayıt bitince ses mesajı kaldığı yerden devam eder.
    onRecording(true);
    setSoundMuted(true);
    try {
      await playbackMode(true, true);
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: cap.current / 1000 });
    } catch {
      micBusy = false;
      onRecording(false);
      setSoundMuted(false);
      void playbackMode(false);
      await notify('Mikrofon açılamadı', 'Tekrar dene.', { icon: null });
      return;
    }
    active.current = true;
    startedAt.current = Date.now();
    setRec(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: cap.current, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => void stop(), cap.current + 50);
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
        micBusy = false;
        setSoundMuted(false);
        void recorder.stop().catch(() => {});
      }
    },
    [recorder],
  );

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.pttWrap}>
      <View style={styles.pttHintBox}>
        <Text style={[styles.pttHint, listening && styles.pttListening]} numberOfLines={1}>
          {listening ? '👂 Seni dinliyorlar' : 'Oyun zevkini arttırmak için sırayla konuş.'}
        </Text>
      </View>
      <View style={styles.pttRow}>
        {/* Basılı tutma: parmak düğmede biraz kaysa ya da üstteki bir alan dokunuşu istese de kayıt kesilmez */}
        <View
          onStartShouldSetResponder={() => canTalk || rec}
          onResponderTerminationRequest={() => false}
          onResponderGrant={() => void start()}
          onResponderRelease={release}
          onResponderTerminate={release}
          accessibilityRole="button"
          accessibilityLabel={canTalk ? 'Basılı tut ve konuş' : closedText}
          testID="sk-ptt"
          style={[styles.ptt, !canTalk && styles.pttOff, rec && styles.pttRec]}
        >
          {rec ? <Animated.View style={[styles.pttFill, { width }]} /> : null}
          <View style={styles.pttIcon}>
            <Ionicons name={canTalk ? 'mic' : 'mic-off'} size={22} color={rec ? '#FFFFFF' : canTalk ? '#2B1400' : '#9AA4B2'} />
          </View>
          <View style={styles.pttTexts}>
            <Text style={[styles.pttTitle, !canTalk && styles.pttTitleOff, rec && styles.pttTitleRec]} numberOfLines={1}>
              {sending
                ? 'Gönderiliyor…'
                : rec
                  ? 'KAYDEDİYOR · bırakınca gider'
                  : canTalk
                    ? `BASILI TUT, KONUŞ (${Math.max(1, Math.round(Math.min(MAX_MS, leftMs) / 1000))} sn)`
                    : closedText}
            </Text>
            {canTalk && !rec ? <Text style={styles.pttSub}>{channelText}</Text> : null}
          </View>
        </View>
        {side}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pttWrap: { gap: 3 },
  pttRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pttHintBox: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  pttHint: { color: '#0E9F6E', fontFamily: fonts.extra, fontSize: 11.5, textAlign: 'center' },
  pttListening: { color: '#057A55', fontFamily: fonts.black, fontSize: 13 },
  ptt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 27,
    // Turuncu: deniz ve gökyüzünün maviliğinden ayrılsın
    backgroundColor: '#FF9F1C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
  pttTitle: { color: '#2B1400', fontFamily: fonts.black, fontSize: 14 },
  pttTitleOff: { color: '#9AA4B2', fontFamily: fonts.semi, fontSize: 12.5 },
  pttTitleRec: { color: '#FFFFFF' },
  pttSub: { color: '#2B1400', fontFamily: fonts.semi, fontSize: 11 },
});
