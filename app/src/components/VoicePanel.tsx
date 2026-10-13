import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { confirmAction, notify, showDialog } from '@/lib/dialog';
import {
  getVoiceState,
  kickNeeded,
  setVoiceFlags,
  VoiceClient,
  voiceSupported,
  voteKick,
  yieldTurn,
  type VoiceMember,
  type VoiceState,
} from '@/lib/voice';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const POLL_MS = 2000;
const MIC_INFO_KEY = 'kat41.voiceMicInfo';

/** Mikrofon izni istenmeden önce bir kez gösterilen açıklama */
const MIC_REASON =
  'Sesli sohbet yalnızca uzaktan oyunlarda ve yalnızca sıran geldiğinde mikrofonunu kullanır. Sesin kaydedilmez, hiçbir yerde saklanmaz. İstediğin an mikrofonunu kapatabilirsin; ses filtresiyle sesinin tonunu değiştirebilirsin.';

/**
 * Uzaktan odanın sesli sohbet paneli. Oyuncular sırayla konuşur (sırayı sunucu belirler); sırası gelen kişinin mikrofonu
 * açılır, süre bitince kapanır. Herkes mikrofonunu kapatabilir ve ses filtresini açabilir (filtre herkeste görünür).
 * Odadakilerin çoğunluğu isterse bir oyuncu oylamayla atılır. Uygulama arka plana alınınca sıra atlanır.
 */
export function VoicePanel({ roomId, myId }: { roomId: string; myId: string }) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const client = useRef<VoiceClient | null>(null);
  const supported = voiceSupported();

  const me = state?.members?.find((m) => m.user_id === myId) ?? null;
  const micOn = me?.mic_on ?? true;
  const filterOn = me?.filter_on ?? false;

  const refresh = useCallback(async () => {
    const s = await getVoiceState(roomId);
    if (s) setState(s);
    setNow(Date.now());
  }, [roomId]);

  // Durum birkaç saniyede bir okunur (sıra, süre, mikrofon/filtre, atma oyları)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Geri sayım her saniye
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Ekrandan çıkınca sesli sohbetten de çıkılır
  useEffect(
    () => () => {
      client.current?.leave();
      client.current = null;
    },
    [],
  );

  // Uygulama arka plana alınınca (ya da telefon çağrısı gelince) sıra atlanır ve mikrofon kapanır
  useEffect(() => {
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
    await setVoiceFlags(roomId, { mic: !micOn });
    void refresh();
  }

  async function toggleFilter() {
    await setVoiceFlags(roomId, { filter: !filterOn });
    void refresh();
  }

  async function kick(m: VoiceMember) {
    if (!state) return;
    const need = kickNeeded(state.players_active ?? 0);
    if (!m.my_kick_vote) {
      const ok = await confirmAction(
        `${m.name} odadan atılsın mı?`,
        `Odadakilerin çoğunluğu (${need} kişi) isterse ${m.name} odadan çıkarılır ve bu odaya geri giremez. Oyunu geri alabilirsin.`,
        'Atılsın',
        true,
      );
      if (!ok) return;
    }
    const res = await voteKick(roomId, m.user_id);
    if (res.error) return void notify('Oy verilemedi', res.error, { icon: 'alert-circle' });
    if (res.data?.kicked) void notify('Oyuncu atıldı', `${m.name} oylamayla odadan çıkarıldı.`, { icon: 'exit' });
    void refresh();
  }

  if (!state?.allowed) return null;
  const members = state.members ?? [];
  const speaker = members.find((m) => m.user_id === state.speaker) ?? null;
  const left = state.turn_ends_at ? Math.max(0, Math.ceil((Date.parse(state.turn_ends_at) - now) / 1000)) : 0;
  const iSpeak = state.speaker === myId;
  const isNarrator = state.narrator === myId;
  const need = kickNeeded(state.players_active ?? 0);

  return (
    <View style={styles.card} testID="voice-panel">
      <View style={styles.head}>
        <Ionicons name="mic" size={18} color={colors.primary} />
        <Text style={styles.title}>Sesli sohbet</Text>
        {joined ? (
          <Pressable onPress={leave} hitSlop={8} accessibilityRole="button" style={styles.leaveBtn}>
            <Text style={styles.leaveText}>Ayrıl</Text>
          </Pressable>
        ) : null}
      </View>

      {!state.enabled ? (
        <Text style={styles.muted}>Bu ayın ücretsiz sesli sohbet süresi doldu. Gelecek ay yeniden açılır.</Text>
      ) : !supported ? (
        <Text style={styles.muted}>
          Sesli sohbet uygulamanın kendi sürümünde çalışır (Expo Go’da yok). Sıra ve oylama yine burada görünür.
        </Text>
      ) : !joined ? (
        <>
          <Pressable
            onPress={() => void join()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}
            testID="voice-join"
          >
            <Ionicons name="headset" size={18} color={colors.primaryText} />
            <Text style={styles.joinText}>Sesli sohbete katıl</Text>
          </Pressable>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
        </>
      ) : null}

      {/* Sıra */}
      {speaker ? (
        <View style={[styles.turn, iSpeak && styles.turnMine]}>
          <Ionicons name={iSpeak ? 'mic' : 'volume-high'} size={18} color={iSpeak ? colors.primaryText : colors.primary} />
          <Text style={[styles.turnText, iSpeak && styles.turnTextMine]} numberOfLines={1}>
            {iSpeak ? `Sıra sende · ${left} sn` : `Konuşuyor: ${speaker.name} · ${left} sn`}
          </Text>
          {iSpeak ? (
            <Pressable onPress={() => void yieldTurn(roomId).then(refresh)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.yieldText}>Sözümü bitir</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>
          {state.phase === 'dawn'
            ? 'Herkes konuştu; oylama başlıyor.'
            : 'Sabah tartışmasında herkes sırayla konuşur. Şu an konuşma sırası yok.'}
          {isNarrator ? ' Anlatıcı olarak her zaman konuşabilirsin.' : ''}
        </Text>
      )}

      {/* Kendi düğmelerim: mikrofon ve filtre */}
      {joined ? (
        <View style={styles.controls}>
          <Pressable
            onPress={() => void toggleMic()}
            accessibilityRole="button"
            accessibilityLabel={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
            style={({ pressed }) => [styles.ctrl, !micOn && styles.ctrlOff, pressed && styles.pressed]}
            testID="voice-mic"
          >
            <Ionicons name={micOn ? 'mic' : 'mic-off'} size={18} color={micOn ? colors.primary : colors.danger} />
            <Text style={styles.ctrlText}>{micOn ? 'Mikrofon açık' : 'Mikrofon kapalı'}</Text>
          </Pressable>
          <Pressable
            onPress={() => void toggleFilter()}
            accessibilityRole="button"
            accessibilityLabel={filterOn ? 'Ses filtresini kapat' : 'Ses filtresini aç'}
            style={({ pressed }) => [styles.ctrl, filterOn && styles.ctrlFilter, pressed && styles.pressed]}
            testID="voice-filter"
          >
            <Ionicons name="color-filter" size={18} color={filterOn ? '#1A1200' : colors.text} />
            <Text style={[styles.ctrlText, filterOn && styles.ctrlTextFilter]}>
              {filterOn ? 'Filtre açık' : 'Ses filtresi'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Oyuncular: mikrofon ve filtre durumu (herkes görür), atma oylaması */}
      <View style={styles.list}>
        {members.map((m) => (
          <View key={m.user_id} style={[styles.row, m.user_id === state.speaker && styles.rowSpeaking]}>
            <Ionicons
              name={!m.connected ? 'cloud-offline-outline' : m.mic_on ? 'mic' : 'mic-off'}
              size={16}
              color={!m.connected ? colors.textMuted : m.mic_on ? colors.primary : colors.danger}
            />
            {m.filter_on ? (
              <View style={styles.filterBadge} accessibilityLabel="Ses filtresi açık">
                <Ionicons name="color-filter" size={11} color="#1A1200" />
                <Text style={styles.filterBadgeText}>Filtre</Text>
              </View>
            ) : null}
            <Text style={[styles.name, !m.alive && styles.nameDead]} numberOfLines={1}>
              {m.name}
              {m.user_id === myId ? ' (sen)' : ''}
              {m.away ? ' · uzakta' : ''}
            </Text>
            {state.kick_enabled && m.kickable ? (
              <Pressable
                onPress={() => void kick(m)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${m.name} atılsın oyu`}
                style={[styles.kick, m.my_kick_vote && styles.kickOn]}
              >
                <Ionicons name="exit-outline" size={13} color={m.my_kick_vote ? colors.primaryText : colors.danger} />
                <Text style={[styles.kickText, m.my_kick_vote && styles.kickTextOn]}>
                  {`${m.kick_votes}/${need}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <Text style={styles.hint}>
        Ses kaydedilmez. Uygulamadan çıkarsan ya da telefonun çalarsa sıran atlanır. Atmak için kişinin yanındaki düğmeye
        bas; çoğunluk isterse odadan çıkar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  leaveBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  leaveText: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 12 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 19 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  joinText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.md },
  pressed: { opacity: 0.7 },
  turn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  turnMine: { backgroundColor: colors.primary },
  turnText: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  turnTextMine: { color: colors.primaryText },
  yieldText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: 12, textDecorationLine: 'underline' },
  controls: { flexDirection: 'row', gap: spacing.sm },
  ctrl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctrlOff: { borderColor: colors.danger },
  ctrlFilter: { backgroundColor: '#FFC93C', borderColor: '#FFC93C' },
  ctrlText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12.5 },
  ctrlTextFilter: { color: '#1A1200', fontFamily: fonts.extra },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 6, borderRadius: radii.sm },
  rowSpeaking: { backgroundColor: colors.bg },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: '#FFC93C',
  },
  filterBadgeText: { color: '#1A1200', fontFamily: fonts.extra, fontSize: 10 },
  name: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
  nameDead: { color: colors.textMuted, textDecorationLine: 'line-through' },
  kick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  kickOn: { backgroundColor: colors.danger },
  kickText: { color: colors.danger, fontFamily: fonts.extra, fontSize: 11 },
  kickTextOn: { color: colors.primaryText },
  hint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16 },
});
