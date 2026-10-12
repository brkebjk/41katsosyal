// Oyun ses efektleri: Bilgi Yarışması ve Vampir–Köylü (kısa, uygulamanın içinde üretilmiş WAV dosyaları).
// Telefon sessiz moddaysa çalmaz. Kullanıcı Bilgi Yarışması ekranındaki hoparlör düğmesiyle kapatabilir (bu telefonda
// hatırlanır). Ses çalınamazsa (desteklenmeyen ortam vb.) oyun sessizce devam eder.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  tap: require('../../assets/sounds/tap.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  chest: require('../../assets/sounds/chest.wav'),
  card: require('../../assets/sounds/card.wav'),
  chaos: require('../../assets/sounds/chaos.wav'),
  bomb: require('../../assets/sounds/bomb.wav'),
  start: require('../../assets/sounds/start.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  steal: require('../../assets/sounds/steal.wav'),
  match: require('../../assets/sounds/match.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  // Vampir–Köylü
  vv_night: require('../../assets/sounds/vv_night.wav'),
  vv_day: require('../../assets/sounds/vv_day.wav'),
  vv_clock: require('../../assets/sounds/vv_clock.wav'),
  vv_kill: require('../../assets/sounds/vv_kill.wav'),
  vv_vote: require('../../assets/sounds/vv_vote.wav'),
  vv_exile: require('../../assets/sounds/vv_exile.wav'),
  vv_reveal: require('../../assets/sounds/vv_reveal.wav'),
  vv_whisper: require('../../assets/sounds/vv_whisper.wav'),
  vv_win: require('../../assets/sounds/vv_win.wav'),
  vv_lose: require('../../assets/sounds/vv_lose.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const KEY = 'quiz_sound_on';
let enabled = true;
let ready: Promise<void> | null = null;
const players: Partial<Record<SoundName, AudioPlayer>> = {};
const listeners = new Set<(on: boolean) => void>();

/** Ses ayarını yükler (bir kez). Sessiz modda çalmaz, başka uygulamanın müziğini kesmez. */
export function initSounds(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        enabled = (await AsyncStorage.getItem(KEY)) !== '0';
        await setAudioModeAsync({
          playsInSilentMode: false,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
        });
      } catch {
        // ses ayarı yüklenemezse varsayılan: açık
      }
      notify();
    })();
  }
  return ready;
}

function notify() {
  for (const l of listeners) l(enabled);
}

export function soundOn(): boolean {
  return enabled;
}

export function setSoundOn(on: boolean) {
  enabled = on;
  void AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  notify();
}

/** Ses açık/kapalı değişince haber verir; aboneliği kaldıran fonksiyonu döner */
export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Kısa bir ses çalar (aynı ses tekrar çalınırsa baştan başlar) */
export function playSound(name: SoundName, volume = 0.8) {
  if (!enabled) return;
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      players[name] = p;
    }
    p.volume = volume;
    const player = p;
    if (player.currentTime > 0) {
      void player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {});
    } else {
      player.play();
    }
  } catch {
    // ses çalınamazsa oyun etkilenmez
  }
}

/** Ekrandan çıkarken çalarları serbest bırak */
export function releaseSounds() {
  for (const k of Object.keys(players) as SoundName[]) {
    try {
      players[k]?.remove();
    } catch {
      // yok say
    }
    delete players[k];
  }
}
