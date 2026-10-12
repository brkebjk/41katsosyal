import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { JoinByCodeModal } from '@/components/JoinByCodeModal';
import { RoomCodeModal } from '@/components/RoomCodeModal';
import { RoomPlaceModal, type PlaceRequest } from '@/components/RoomPlaceModal';
import { notify, showDialog } from '@/lib/dialog';
import { GAMES, gameTitle } from '@/lib/gameCatalog';
import type { Cell } from '@/lib/hex';
import type { GameKey } from '@/lib/images';
import { requireGameLocation } from '@/lib/map';
import { DEFAULT_LIMITS, getLimits, type Limits } from '@/lib/membership';
import { leaveLiveGames } from '@/lib/presence';
import { confirmMeetupSafety } from '@/lib/safety';
import {
  createRoom,
  getJoinMaxDistance,
  getRoom,
  joinRoomWithLocation,
  type OpenRoom,
  type RoomMode,
  type RoomPlace,
} from '@/lib/rooms';

type Options = {
  isModerator: boolean;
  /** Oda açılınca / odaya girilince çağrılır (liste ve hak göstergesi tazelensin diye) */
  onChanged?: () => void;
};

/**
 * Oyunlar ekranı ile “Açık odalar” ekranının ortak işleri: kodla katılma, listeden katılma ve yeni oda açma
 * (mod seçimi → konum → bölge + adres tarifi → oda). İki ekran da aynı kuralları kullansın diye tek yerde durur.
 * `modals` ekranın içinde bir yere konur (kod penceresi, oda yeri penceresi).
 */
export function useRoomActions({ isModerator, onChanged }: Options) {
  const [hint, setHint] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  /** Kodu sorulan açık oda (kod penceresi açıkken dolu) */
  const [codeRoom, setCodeRoom] = useState<OpenRoom | null>(null);
  const [placeAsk, setPlaceAsk] = useState<PlaceRequest | null>(null);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const lock = useRef(false);
  /** Menüye dönünce çalışan "oyunlardan çık" isteği; oda açmadan/katılmadan önce bitmesi beklenir */
  const leaveDone = useRef<Promise<void>>(Promise.resolve());

  // Aylık oyun hakları moderatör ayarından okunur
  useEffect(() => {
    let active = true;
    void getLimits().then((l) => {
      if (active) setLimits(l);
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Ekran açılınca çağrılır: oyun ekranından menüye dönmüş (ya da uygulamayı yeniden açmış) olabiliriz. Yan yana
   * oyunlarda menüye dönmek oyundan ayrılmaktır; sunucu bizi içinde olduğumuz oyunlardan çıkarır. `after` bitince çalışır.
   */
  const beginFocus = useCallback((after?: () => void) => {
    leaveDone.current = leaveLiveGames().finally(() => after?.());
  }, []);

  /** Oyunun ekranına geçer. Şimdilik çekiliş ve Vampir–Köylü ekranları hazır. */
  const openGameScreen = useCallback((roomId: string, gameType: string) => {
    if (gameType === 'raffle') {
      router.push({ pathname: '/cekilis', params: { id: roomId } });
    } else if (gameType === 'vampire_villager') {
      router.push({ pathname: '/vampir', params: { id: roomId } });
    } else {
      setHint('Odaya katıldın. Bu oyunun ekranı çok yakında eklenecek.');
    }
  }, []);

  /** “Katıl” penceresinden: yazılan kodla odaya girip oyunun ekranına geçer. Hata yazısı ya da (başarıda) boş döner. */
  async function enterByCode(code: string): Promise<string | null> {
    if (lock.current) return 'Bir işlem sürüyor, birkaç saniye sonra tekrar dene.';
    lock.current = true;
    try {
      await leaveDone.current; // menüye dönüşte başlayan "oyundan çık" isteği bitmeden yeni odaya girilmez
      const res = await joinRoomWithLocation(code);
      if (res.error || !res.roomId) return res.error ?? 'Odaya katılınamadı.';
      const room = await getRoom(res.roomId);
      onChanged?.();
      if (!room.data) {
        return 'Odaya katıldın ama oda şu an açılamadı. Birkaç saniye sonra listeden odaya dokun.';
      }
      setJoinOpen(false);
      // Pencerenin kapanması bitsin, sonra oyun ekranına geçilsin
      await new Promise((resolve) => setTimeout(resolve, 350));
      openGameScreen(res.roomId, room.data.game_type);
      return null;
    } finally {
      lock.current = false;
    }
  }

  /**
   * Listeden bir odaya dokunulur. Kendi odan, katıldığın oda ve (moderatörsen) herhangi bir oda doğrudan açılır.
   * Başkasının odasına "Katıl" denince kod penceresi açılır; kod o odanın kodu değilse içeri girilmez.
   */
  function openListed(room: OpenRoom) {
    if (room.is_mine || room.joined || isModerator) {
      openGameScreen(room.id, room.game_type);
      return;
    }
    // Katılım kodu girilmeden önce güvenlik uyarısı
    void confirmMeetupSafety('game').then((ok) => {
      if (ok) setCodeRoom(room);
    });
  }

  /** Kod penceresinden: yazılan kodla, dokunulan odaya katılmayı dener. Hata yazısı ya da (başarıda) boş döner. */
  async function joinListed(room: OpenRoom, typed: string): Promise<string | null> {
    if (lock.current) return 'Bir işlem sürüyor, birkaç saniye sonra tekrar dene.';
    lock.current = true;
    try {
      await leaveDone.current;
      const res = await joinRoomWithLocation(typed, room.id);
      if (res.error || !res.roomId) return res.error ?? 'Odaya katılınamadı.';
      const got = await getRoom(res.roomId);
      onChanged?.();
      setCodeRoom(null); // pencere kapanır
      if (!got.data) {
        setHint('Odaya katıldın ama oda şu an açılamadı. Birkaç saniye sonra listeden odaya dokun.');
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      openGameScreen(res.roomId, got.data.game_type);
      return null;
    } finally {
      lock.current = false;
    }
  }

  /** Oda yeri penceresini açar; seçilen yer (ya da vazgeçilirse null) ile tamamlanır. */
  function askPlace(title: string, phoneCell: Cell | null, maxDistance: number): Promise<RoomPlace | null> {
    return new Promise((resolve) => {
      setPlaceAsk({
        gameTitle: title,
        phoneCell,
        maxDistance,
        resolve: (place) => {
          setPlaceAsk(null);
          resolve(place);
        },
      });
    });
  }

  /**
   * Vampir–Köylü nasıl oynansın? Otomatik Oyun (yönetici yok, süreler dolunca oyun kendi akar) ya da
   * Ben Yöneticiyim (geceyi/oylamayı oda sahibi ilerletir). Moderatör ayrıca oynayıp oynamayacağını seçer:
   * oynarsa oyuncudur, oynamazsa anlatıcı olur. Vazgeçilirse boş döner.
   */
  async function askVampireMode(): Promise<RoomMode | null> {
    const quota = isModerator
      ? ''
      : ` Üyeler ayda ${limits.freeGames} oda açabilir (abone: ${limits.subscriptionGames}). Başlamadan odayı kapatırsan hakkın geri verilir.`;
    const first = await showDialog<'auto' | 'host' | null>({
      title: 'Vampir–Köylü nasıl oynansın?',
      message: `Otomatik Oyun: yönetici gerekmez; gece, tartışma ve oylama süreleri dolunca oyun kendiliğinden ilerler.\n\nBen Yöneticiyim: geceyi ve oylamayı sen başlatıp bitirirsin.\n\nİkisinde de sen de oynarsın.${quota}`,
      icon: 'moon',
      buttons: [
        { label: 'Otomatik Oyun', value: 'auto', style: 'primary' },
        { label: 'Ben Yöneticiyim', value: 'host', style: 'ghost' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (first === null) return null;
    if (first === 'auto') return 'auto';
    if (!isModerator) return 'host';
    const plays = await showDialog<boolean | null>({
      title: 'Sen de oynayacak mısın?',
      message:
        'Oynarsan sen de bir rol alırsın ve diğer oyuncular gibi yalnızca kendi rolünü görürsün.\n\nOynamazsan anlatıcı olursun: herkesin rolünü görür, oyunu ilerletirsin ama oyuncu sayılmazsın.',
      icon: 'people',
      buttons: [
        { label: 'Evet, ben de oynarım', value: true, style: 'primary' },
        { label: 'Hayır, anlatıcı olurum', value: false, style: 'ghost' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (plays === null) return null;
    return plays ? 'host' : 'narrator';
  }

  /**
   * Seçilen oyun için yeni oda açar. Vampir–Köylü’de sıra: nasıl oynansın → (anlatıcı değilse) bulunduğun bölge →
   * odanın bölgesi + adres tarifi → oda. Odayı açan kişi (anlatıcı moderatör hariç) oyuncu olarak odaya da girer.
   */
  async function createForGame(key: GameKey) {
    if (lock.current) return;
    setHint(null);
    if (key === 'raffle') {
      if (isModerator) router.push('/cekilis');
      else {
        setHint('Çekilişe katılmak için moderatörün verdiği oda kodunu “Katıl” düğmesinden gir.');
      }
      return;
    }
    if (key !== 'vampire_villager') {
      setHint(`${gameTitle(key)} hazırlanıyor, çok yakında burada olacak.`);
      return;
    }
    lock.current = true;
    try {
      await leaveDone.current;
      const mode = await askVampireMode();
      if (!mode) return;
      // Yan yana oynanan oyunu açarken (oyuncu olarak girecekse) konum izni zorunludur; izin yoksa oda hiç açılmaz.
      let phone: Cell | undefined;
      if (mode !== 'narrator') {
        const loc = await requireGameLocation();
        if (!loc.ok) {
          await notify('Oda açılamadı', loc.message, { tone: 'danger', icon: 'location' });
          return;
        }
        phone = loc.cell;
      }
      const maxDistance = await getJoinMaxDistance();
      const place = await askPlace(GAMES.vampire_villager.title, phone ?? null, maxDistance);
      if (!place) return;
      const res = await createRoom('vampire_villager', mode, phone, place);
      if (res.error || !res.room) {
        await notify('Oda açılamadı', res.error ?? 'Biraz sonra tekrar dene.', {
          tone: 'danger',
          icon: 'alert-circle',
        });
        return;
      }
      // Oda sahibi de oyuncudur (anlatıcı moderatör hariç). Katılma başarısız olursa oyun ekranında “Oyuna katıl” düğmesi çıkar.
      if (mode !== 'narrator') {
        const joined = await joinRoomWithLocation(res.room.code, undefined, phone);
        if (joined.error) {
          await notify('Odaya girilemedi', joined.error, { tone: 'danger', icon: 'alert-circle' });
        }
      }
      onChanged?.();
      openGameScreen(res.room.id, 'vampire_villager');
    } finally {
      lock.current = false;
    }
  }

  /**
   * Paket 27: etkinlik oyunu. Oyunlu etkinliğin düzenleyeni, etkinlik başlayınca ve en az 4 kişi katılımını doğrulayınca
   * açar. Oda yeri etkinliğin peteğidir; kod yalnızca doğrulanmış katılımcılara bildirimle gider. Şimdilik Vampir–Köylü.
   */
  async function createEventGame(ev: { id: string; title: string; cell: Cell | null }) {
    if (lock.current) return;
    setHint(null);
    const ok = await showDialog<boolean>({
      title: 'Etkinlik oyunu aç',
      message: `“${ev.title}” etkinliğinde Vampir–Köylü odası açılır.\n\nOda kodu, katılımını doğrulamış katılımcılara bildirimle gider; odaya yalnızca onlar girebilir. Etkinlik oyunlarında puan 1,25 kat. Etkinlik odası aylık oda hakkından yemez.\n\nDiğer oyunlar hazır olunca buraya eklenecek.`,
      icon: 'game-controller',
      buttons: [
        { label: 'Vampir–Köylü aç', value: true, style: 'primary' },
        { label: 'Vazgeç', value: false, style: 'ghost' },
      ],
      cancelValue: false,
    });
    if (!ok) return;
    lock.current = true;
    try {
      await leaveDone.current;
      const mode = await askVampireMode();
      if (!mode) return;
      let phone: Cell | undefined;
      if (mode !== 'narrator') {
        const loc = await requireGameLocation();
        if (!loc.ok) {
          await notify('Oda açılamadı', loc.message, { tone: 'danger', icon: 'location' });
          return;
        }
        phone = loc.cell;
      }
      // Oda yeri sunucuda etkinliğin peteği yapılır; peteği olmayan eski etkinlikte bulunduğun petek kullanılır
      const cell = ev.cell ?? phone;
      if (!cell) {
        await notify('Oda açılamadı', 'Etkinliğin bölgesi bulunamadı.', { tone: 'danger', icon: 'location' });
        return;
      }
      const res = await createRoom(
        'vampire_villager',
        mode,
        phone,
        { cell, note: `Etkinlik: ${ev.title}`.slice(0, 120) },
        ev.id,
      );
      if (res.error || !res.room) {
        await notify('Oda açılamadı', res.error ?? 'Biraz sonra tekrar dene.', {
          tone: 'danger',
          icon: 'alert-circle',
        });
        return;
      }
      if (mode !== 'narrator') {
        const joined = await joinRoomWithLocation(res.room.code, undefined, phone);
        if (joined.error) {
          await notify('Odaya girilemedi', joined.error, { tone: 'danger', icon: 'alert-circle' });
        }
      }
      onChanged?.();
      openGameScreen(res.room.id, 'vampire_villager');
    } finally {
      lock.current = false;
    }
  }

  const modals: ReactNode = (
    <>
      <JoinByCodeModal visible={joinOpen} onClose={() => setJoinOpen(false)} onSubmit={enterByCode} />
      <RoomCodeModal
        key={codeRoom?.id ?? 'kapali'}
        room={codeRoom}
        onClose={() => setCodeRoom(null)}
        onSubmit={joinListed}
      />
      <RoomPlaceModal request={placeAsk} />
    </>
  );

  return {
    hint,
    setHint,
    limits,
    beginFocus,
    openJoin: () => {
      void confirmMeetupSafety('game').then((ok) => {
        if (ok) setJoinOpen(true);
      });
    },
    openListed,
    createForGame,
    createEventGame,
    openGameScreen,
    modals,
  };
}
