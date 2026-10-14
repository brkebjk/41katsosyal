import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/AppText';
import { MessageList } from '@/components/SharkStage';
import { getSharkHistory, type SkMsg } from '@/lib/shark';
import { fonts } from '@/theme';

// Köpekbalığı Kafesi yazışması: ekranda sürüklenebilen yüzen baloncuk. Dokununca baloncuğun olduğu yerde, sürüklenebilen
// bir pencere açılır. Pencerede sekmeler var: Genel (herkese açık), Takım (köpekbalıkları), Ölüler (elenenler / Medyum).
// Her sekme oyunun baştan sonra bütün mesaj geçmişini gece / gündüz başlıklarıyla gösterir. Okunmamış mesaj varsa
// baloncukta kırmızı sayı çıkar.

export type ChatTab = 'all' | 'shark' | 'dead';

export type ChatTabInfo = {
  key: ChatTab;
  label: string;
  /** Canlı görünümdeki son mesajlar (geçmiş yüklenene kadar ve okunmamış sayısı için) */
  messages: SkMsg[];
  /** Oyun akışı bilgi satırları (yalnızca bu sekmede; okunmamış sayısına girmez) */
  info?: SkMsg[];
  canWrite: boolean;
  placeholder: string;
  /** Yazamıyorsa nedeni */
  closedText: string;
};

const BUBBLE = 58;

type Pt = { x: number; y: number };

/** Değişebilir küçük kutu: sürükleme konumları burada tutulur (ekranı yeniden çizdirmez) */
function makeBox<T extends object>(initial: T) {
  let v = initial;
  return {
    get: () => v,
    patch: (p: Partial<T>) => {
      v = { ...v, ...p };
    },
  };
}

function latestAt(list: SkMsg[]): number {
  let t = 0;
  for (const m of list) t = Math.max(t, Date.parse(m.at) || 0);
  return t;
}

export function SharkChat({
  roomId,
  tabs,
  openTab,
  onOpenTab,
  startAt,
  seatOf,
  onSend,
  onReport,
  preferTab,
  loadHistory,
}: {
  /** Mesaj geçmişini okur (varsayılan: Köpekbalığı Kafesi) */
  loadHistory?: (roomId: string) => Promise<{ messages: SkMsg[]; error: string | null }>;
  /** Baloncuğa basınca önce açılacak sekme (ör. dalışta köpekbalığına Takım sohbeti) */
  preferTab?: ChatTab | null;
  roomId: string;
  tabs: ChatTabInfo[];
  /** Açık sekme (boş = pencere kapalı) */
  openTab: ChatTab | null;
  onOpenTab: (tab: ChatTab | null) => void;
  /** Ekrana girildiği an (sunucu saati): bundan önceki mesajlar okunmuş sayılır */
  startAt: string;
  seatOf: (id: string | undefined) => number | undefined;
  onSend: (channel: ChatTab, body: string) => Promise<string | null>;
  onReport: (m: SkMsg) => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const winW = Math.min(W - 16, 400);
  const winH = Math.round(Math.min(H * 0.52, 440));

  // ---- Okunmamış mesajlar ---------------------------------------------------------------------------
  const [seen, setSeen] = useState<Record<ChatTab, number>>(() => {
    const t = Date.parse(startAt) || Date.now();
    return { all: t, shark: t, dead: t };
  });
  const unreadOf = (t: ChatTabInfo) =>
    openTab === t.key ? 0 : t.messages.filter((m) => !m.mine && (Date.parse(m.at) || 0) > seen[t.key]).length;
  const unread = tabs.reduce((n, t) => n + unreadOf(t), 0);
  const markSeen = (key: ChatTab | null) => {
    if (!key) return;
    const t = tabs.find((x) => x.key === key);
    if (!t) return;
    const last = latestAt(t.messages);
    setSeen((s) => (last > s[key] ? { ...s, [key]: last } : s));
  };
  const switchTo = (key: ChatTab | null) => {
    markSeen(openTab);
    onOpenTab(key);
  };

  // ---- Baloncuk: sürüklenir, dokununca pencere açılır -----------------------------------------------
  // Konumlar ve sınırlar değişebilir kutuda durur (sürükleme sırasında ekran yeniden çizilmez)
  const [box] = useState(() =>
    makeBox({
      bubble: { x: W - BUBBLE - 10, y: Math.round(H * 0.56) },
      win: { x: 8, y: 80 },
      clampBubble: (p: Pt): Pt => p,
      clampWin: (p: Pt): Pt => p,
      open: null as ChatTab | null,
    }),
  );
  useEffect(() => {
    box.patch({
      clampBubble: (p) => ({
        x: Math.max(6, Math.min(W - BUBBLE - 6, p.x)),
        y: Math.max(insets.top + 50, Math.min(H - BUBBLE - insets.bottom - 70, p.y)),
      }),
      clampWin: (p) => ({
        x: Math.max(4, Math.min(W - winW - 4, p.x)),
        y: Math.max(insets.top + 4, Math.min(H - winH - insets.bottom - 4, p.y)),
      }),
    });
  });
  const [bubble] = useState(() => new Animated.ValueXY(box.get().bubble));
  const [bubbleDrag] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        const b = box.get().bubble;
        bubble.setValue({ x: b.x + g.dx, y: b.y + g.dy });
      },
      onPanResponderRelease: (_, g) => {
        const s0 = box.get();
        const next = s0.clampBubble({ x: s0.bubble.x + g.dx, y: s0.bubble.y + g.dy });
        box.patch({ bubble: next });
        Animated.spring(bubble, { toValue: next, friction: 7, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => bubble.setValue(box.get().bubble),
    }),
  );

  // ---- Pencere: baloncuğun olduğu yerde açılır, başlığından sürüklenir -----------------------------
  const [win] = useState(() => new Animated.ValueXY(box.get().win));
  const [winDrag] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        const w = box.get().win;
        win.setValue({ x: w.x + g.dx, y: w.y + g.dy });
      },
      onPanResponderRelease: (_, g) => {
        const s0 = box.get();
        const next = s0.clampWin({ x: s0.win.x + g.dx, y: s0.win.y + g.dy });
        box.patch({ win: next });
        Animated.spring(win, { toValue: next, friction: 8, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => win.setValue(box.get().win),
    }),
  );

  /** Pencereyi baloncuğun yanına koyar (baloncuk ekranın üst yarısındaysa altına, değilse üstüne) */
  const placeWin = () => {
    const s0 = box.get();
    const b = s0.bubble;
    const below = b.y < H / 2;
    const next = s0.clampWin({ x: b.x + BUBBLE / 2 - winW / 2, y: below ? b.y + BUBBLE + 6 : b.y - winH - 6 });
    box.patch({ win: next });
    win.setValue(next);
  };

  // Pencere kapalıyken açılınca (baloncuğa dokununca ya da Medyum'un düğmesiyle) baloncuğun yanına konur
  useEffect(() => {
    const was = box.get().open;
    box.patch({ open: openTab });
    if (openTab && !was) {
      const s0 = box.get();
      const b = s0.bubble;
      const below = b.y < H / 2;
      const next = s0.clampWin({ x: b.x + BUBBLE / 2 - winW / 2, y: below ? b.y + BUBBLE + 6 : b.y - winH - 6 });
      box.patch({ win: next });
      win.setValue(next);
    }
  }, [openTab, H, winW, winH, win, box]);

  // Klavye açılınca pencere klavyenin üstüne çıkar
  useEffect(() => {
    const ev = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(ev, (e) => {
      const maxY = H - e.endCoordinates.height - winH - 6;
      const w = box.get().win;
      if (w.y > maxY) {
        const next = { x: w.x, y: Math.max(insets.top + 4, maxY) };
        box.patch({ win: next });
        Animated.timing(win, { toValue: next, duration: 180, useNativeDriver: false }).start();
      }
    });
    return () => sub.remove();
  }, [H, winH, insets.top, win, box]);

  // ---- Mesaj geçmişi (pencere açıkken sunucudan; yeni mesaj gelince yenilenir) ----------------------
  const histLoader = useRef(loadHistory);
  useEffect(() => {
    histLoader.current = loadHistory;
  });
  const [hist, setHist] = useState<SkMsg[] | null>(null);
  const histKey = tabs.map((t) => `${t.key}:${t.messages.length ? t.messages[t.messages.length - 1].id : ''}`).join('|');
  useEffect(() => {
    if (!openTab) return;
    let active = true;
    void (histLoader.current ?? getSharkHistory)(roomId).then((res) => {
      if (active && !res.error) setHist(res.messages);
    });
    return () => {
      active = false;
    };
  }, [roomId, openTab, histKey]);

  const current = tabs.find((t) => t.key === openTab) ?? null;
  const base = current ? (hist ? hist.filter((m) => (m.channel ?? 'all') === current.key) : current.messages) : [];
  const list = current?.info?.length
    ? [...base, ...current.info].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
    : base;

  // ---- Yazma ----------------------------------------------------------------------------------------
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = text.trim();
  async function send() {
    if (!current || !body || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSend(current.key, body);
    setBusy(false);
    if (err) setError(err);
    else setText('');
  }
  const scroll = useRef<ScrollView>(null);

  return (
    <>
      {/* Baloncuk hep görünür: kapalıyken açar, açıkken kapatır */}
      <Animated.View
        style={[styles.bubbleWrap, { transform: bubble.getTranslateTransform() }]}
        {...bubbleDrag.panHandlers}
      >
          <Pressable
            onPress={() => {
              if (openTab) {
                switchTo(null);
                return;
              }
              placeWin();
              switchTo(
                preferTab && tabs.some((t) => t.key === preferTab)
                  ? preferTab
                  : (tabs.find((t) => unreadOf(t) > 0)?.key ?? 'all'),
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={openTab ? 'Yazışmayı kapat' : unread ? `Yazışma, ${unread} yeni mesaj` : 'Yazışma'}
            style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
            testID="sk-chat-bubble"
          >
            <Ionicons name={openTab ? 'close' : 'chatbubbles'} size={26} color="#06201D" />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
              </View>
            ) : null}
          </Pressable>
      </Animated.View>
      {openTab ? (
        <>
          {/* Pencerenin dışına dokununca kapanır */}
          <Pressable
            style={styles.backdrop}
            onPress={() => switchTo(null)}
            accessibilityRole="button"
            accessibilityLabel="Yazışmayı kapat"
          />
        <Animated.View
          style={[styles.win, { width: winW, height: winH, transform: win.getTranslateTransform() }]}
          accessibilityViewIsModal
        >
          {/* Başlık: buradan sürüklenir */}
          <View style={styles.head} {...winDrag.panHandlers}>
            <View style={styles.grip} />
            <View style={styles.tabs}>
              {tabs.map((t) => {
                const on = t.key === openTab;
                const n = unreadOf(t);
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => switchTo(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.tab, on && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                      {t.label}
                    </Text>
                    {n > 0 ? (
                      <View style={styles.tabBadge}>
                        <Text style={styles.badgeText}>{String(n)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => switchTo(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={styles.close}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView
            ref={scroll}
            style={styles.flex}
            contentContainerStyle={styles.listInner}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
            {list.length === 0 ? (
              <Text style={styles.empty}>Henüz mesaj yok.</Text>
            ) : (
              <MessageList messages={list} seatOf={seatOf} onReport={onReport} />
            )}
          </ScrollView>
          {current?.canWrite ? (
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={current.placeholder}
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={120}
                style={styles.input}
                onSubmitEditing={() => void send()}
                returnKeyType="send"
                accessibilityLabel={current.placeholder}
              />
              <Pressable
                onPress={() => void send()}
                disabled={!body || busy}
                accessibilityRole="button"
                accessibilityLabel="Gönder"
                style={[styles.send, (!body || busy) && styles.off]}
              >
                <Ionicons name="send" size={18} color="#06201D" />
              </Pressable>
            </View>
          ) : current ? (
            <Text style={styles.closed}>{current.closedText}</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Animated.View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  bubbleWrap: { position: 'absolute', left: 0, top: 0, zIndex: 40, elevation: 40 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 44, elevation: 44 },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34D399',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5383B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 12 },
  win: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 45,
    elevation: 45,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(17, 26, 53, 0.97)',
    borderWidth: 1.5,
    borderColor: 'rgba(72, 202, 228, 0.6)',
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: 'rgba(72, 202, 228, 0.12)',
  },
  grip: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  tabs: { flex: 1, flexDirection: 'row', gap: 6 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tabOn: { backgroundColor: '#48CAE4', borderColor: '#48CAE4' },
  tabText: { color: '#FFFFFF', fontFamily: fonts.extra, fontSize: 13 },
  tabTextOn: { color: '#06201D' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5383B',
  },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  listInner: { gap: 8, padding: 10 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  input: {
    flex: 1,
    height: 42,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#48CAE4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
  closed: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, textAlign: 'center', padding: 10 },
  error: { color: '#FF8A98', fontSize: 12, textAlign: 'center', paddingBottom: 6 },
});
