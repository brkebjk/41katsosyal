import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { JoinByCodeModal } from '@/components/JoinByCodeModal';
import { RoomCodeModal } from '@/components/RoomCodeModal';
import { RoomPlaceModal, type PlaceRequest } from '@/components/RoomPlaceModal';
import { notify, showDialog } from '@/lib/dialog';
import { GAMES, gameTitle } from '@/lib/gameCatalog';
import type { Cell } from '@/lib/hex';
import type { GameKey } from '@/lib/images';
import { prefetchGameLocation, requireGameLocation } from '@/lib/map';
import { leaveLiveGames } from '@/lib/presence';
import { confirmMeetupSafety } from '@/lib/safety';
import {
  createRoom,
  getJoinMaxDistance,
  getRoom,
  joinRemoteRoom,
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

/** Belirli süre bekler, sonra boş döner (konumu ya da ayarı en çok bu kadar beklemek için) */
const wait = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

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
  const lock = useRef(false);
  /** Menüye dönünce çalışan "oyunlardan çık" isteği; oda açmadan/katılmadan önce bitmesi beklenir */
  const leaveDone = useRef<Promise<void>>(Promise.resolve());

  /**
   * Ekran açılınca çağrılır: oyun ekranından menüye dönmüş (ya da uygulamayı yeniden açmış) olabiliriz. Yan yana
   * oyunlarda menüye dönmek oyundan ayrılmaktır; sunucu bizi içinde olduğumuz oyunlardan çıkarır. `after` bitince çalışır.
   */
  const beginFocus = useCallback((after?: () => void) => {
    // Yalnızca çıkma isteği beklenir; ekranın tazelenmesi (after) beklenmez, pencereler gecikmeden açılsın
    const leaving = leaveLiveGames();
    leaveDone.current = leaving.catch(() => {});
    void leaving.finally(() => after?.());
  }, []);

  /** Oyunun ekranına geçer. Şimdilik çekiliş ve Vampir–Köylü ekranları hazır. */
  const openGameScreen = useCallback((roomId: string, gameType: string) => {
    if (gameType === 'raffle') {
      router.push({ pathname: '/cekilis', params: { id: roomId } });
    } else if (gameType === 'vampire_villager') {
      router.push({ pathname: '/vampir', params: { id: roomId } });
    } else if (gameType === 'shark_cage') {
      router.push({ pathname: '/kopekbaligi', params: { id: roomId } });
    } else if (gameType === 'okey' || gameType === 'okey101') {
      router.push({ pathname: '/okey', params: { id: roomId } });
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
    // Uzaktan oda: kod gerekmez, listeden katılınır
    if (room.remote) {
      void joinRemote(room);
      return;
    }
    // Katılım kodu girilmeden önce güvenlik uyarısı
    void confirmMeetupSafety('game').then((ok) => {
      if (ok) setCodeRoom(room);
    });
  }

  async function joinRemote(room: OpenRoom) {
    if (lock.current) return;
    const ok = await showDialog<boolean>({
      title: 'Bekleyen odaya uzaktan katıl',
      message:
        room.game_type === 'shark_cage'
          ? `${room.host_name} odasında herkes kendi telefonundan oynar. Su üstünde bas-konuş ses mesajlarıyla konuşulur. Uzaktan oyunda bu oyundan ayda en çok 250 puan kazanılır; yan yana oyunda hedef daha yüksektir (ayda 1.750).`
          : `${room.host_name} odasında herkes kendi telefonundan oynar. Sabah tartışmasında bas-konuş ses mesajlarıyla konuşulur. Uzaktan oyunda bu oyundan ayda en çok 250 puan kazanılır; yan yana oyunda hedef daha yüksektir (ayda 1.750).`,
      icon: 'headset',
      buttons: [
        { label: 'Katıl', value: true, style: 'primary' },
        { label: 'Vazgeç', value: false, style: 'ghost' },
      ],
      cancelValue: false,
    });
    if (!ok) return;
    lock.current = true;
    try {
      await leaveDone.current;
      const res = await joinRemoteRoom(room.id);
      if (res.error || !res.roomId) {
        await notify('Odaya katılınamadı', res.error ?? 'Biraz sonra tekrar dene.', { tone: 'danger', icon: 'alert-circle' });
        return;
      }
      onChanged?.();
      openGameScreen(res.roomId, room.game_type);
    } finally {
      lock.current = false;
    }
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
    const first = await showDialog<'auto' | 'host' | null>({
      title: 'Vampir–Köylü nasıl oynansın?',
      message: `Otomatik Oyun: yönetici gerekmez; gece, tartışma ve oylama süreleri dolunca oyun kendiliğinden ilerler.\n\nBen Yöneticiyim: geceyi ve oylamayı sen başlatıp bitirirsin.\n\nİkisinde de sen de oynarsın.`,
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
   * Köpekbalığı Kafesi nasıl oynansın? Otomatik ya da Ben Yöneticiyim (ikisinde de oynarsın). Anlatıcı yalnızca etkinlik
   * oyununda ve yalnızca etkinlik sahibine sunulur (oynamaz, herkesin rolünü görür; puan yok).
   */
  async function askSharkMode(event = false): Promise<RoomMode | null> {
    const buttons: { label: string; value: RoomMode | null; style: 'primary' | 'ghost' }[] = [
      { label: 'Otomatik Oyun', value: 'auto', style: 'primary' },
      { label: 'Ben Yöneticiyim', value: 'host', style: 'ghost' },
    ];
    if (event) buttons.push({ label: 'Anlatıcı olurum (oynamam)', value: 'narrator', style: 'ghost' });
    buttons.push({ label: 'Vazgeç', value: null, style: 'ghost' });
    return showDialog<RoomMode | null>({
      title: 'Köpekbalığı Kafesi nasıl oynansın?',
      message: `Otomatik Oyun: yönetici gerekmez; dalış, su üstü ve oylama süreleri dolunca oyun kendiliğinden ilerler.\n\nBen Yöneticiyim: aşamaları sen ilerletirsin; sen de oynarsın ama rolleri görmezsin.${
        event
          ? '\n\nAnlatıcı: oynamazsın, herkesin rolünü görür ve oyunu sen anlatırsın. Anlatıcılı oyunda kimse puan almaz.'
          : ''
      }`,
      icon: 'water',
      buttons,
      cancelValue: null,
    });
  }

  /**
   * Seçilen oyun için yeni oda açar. Vampir–Köylü’de sıra: nasıl oynansın → (anlatıcı değilse) bulunduğun bölge →
   * odanın bölgesi + adres tarifi → oda. Odayı açan kişi (anlatıcı moderatör hariç) oyuncu olarak odaya da girer.
   */
  async function createForGame(key: GameKey, preset?: 'side' | 'remote') {
    if (lock.current) return;
    setHint(null);
    if (key === 'raffle') {
      if (isModerator) router.push('/cekilis');
      else {
        setHint('Çekilişe katılmak için moderatörün verdiği oda kodunu “Katıl” düğmesinden gir.');
      }
      return;
    }
    if (key === 'okey' || key === 'okey101') {
      await createOkey(key, preset);
      return;
    }
    if (key !== 'vampire_villager' && key !== 'shark_cage') {
      setHint(`${gameTitle(key)} hazırlanıyor, çok yakında burada olacak.`);
      return;
    }
    const shark = key === 'shark_cage';
    lock.current = true;
    // Pencereler hemen açılır; menüye dönüşte başlayan "oyundan çık" isteği oda açmadan hemen önce beklenir
    const leaving = leaveDone.current;
    try {
      // Nerede oynanacak? Yan yana (aynı masada; yüksek aylık hedef, konum doğrulanır) ya da uzaktan (eşleştirmeyle)
      const where = preset ?? await showDialog<'side' | 'remote' | null>({
        title: 'Nasıl oynanacak?',
        message: shark
          ? 'Yan yana. Aynı masada oturursunuz, konum doğrulanır. Puanı uzaktanla aynıdır, aylık hedefi yüksektir (ayda en çok 1.750). Mekân koduyla mekânda oynarsan +%25.\n\nUzaktan eşleş. Haritadan oyuncu aranır, herkes kendi telefonundan oynar ve su üstünde bas-konuş ses mesajlarıyla konuşulur. Ayda en çok 250 puan.'
          : 'Yan yana. Aynı masada oturursunuz, konum doğrulanır. Puanı uzaktanla aynıdır, aylık hedefi yüksektir (ayda en çok 1.750). Mekân koduyla mekânda oynarsan +%25.\n\nUzaktan eşleş. Haritadan oyuncu aranır, herkes kendi telefonundan oynar ve sabah tartışmasında bas-konuş ses mesajlarıyla konuşulur. Ayda en çok 250 puan.',
        icon: 'people',
        buttons: [
          { label: 'Yan yana · Büyük hedef', value: 'side', style: 'primary' },
          { label: 'Uzaktan eşleş', value: 'remote', style: 'ghost' },
          { label: 'Vazgeç', value: null, style: 'ghost' },
        ],
        cancelValue: null,
      });
      if (!where) return;
      if (where === 'remote') {
        // Uzaktan oda açılmaz: uzaktan oyun eşleştirmeyle başlar
        router.push({ pathname: '/kopekbaligi-ara', params: { oyun: key } });
        return;
      }
      // İzin varsa konum ve uzaklık sınırı, oyun şekli sorulurken arka planda bulunur. Hiçbir pencere konumu beklemez:
      // konum çabuk geldiyse oda yeri haritası bulunduğun petekten açılır, gelmediyse yer seçildikten sonra alınır.
      const earlyP = prefetchGameLocation();
      const maxP = getJoinMaxDistance();
      const mode = shark ? await askSharkMode() : await askVampireMode();
      if (!mode) return;
      const quick = await Promise.race([earlyP, wait(300)]);
      const maxDistance = await Promise.race([maxP, wait(300).then(() => 1)]);
      const place = await askPlace(GAMES[key].title, quick?.ok ? quick.cell : null, maxDistance);
      if (!place) return;
      // Yan yana oynanan oyunu açarken (oyuncu olarak girecekse) konum izni zorunludur; izin yoksa oda hiç açılmaz.
      let phone: Cell | undefined;
      if (mode !== 'narrator') {
        const early = quick ?? (await earlyP);
        const loc = early ?? (await requireGameLocation());
        if (!loc.ok) {
          await notify('Oda açılamadı', loc.message, { tone: 'danger', icon: 'location' });
          return;
        }
        phone = loc.cell;
      }
      await leaving;
      const res = await createRoom(key, mode, phone, place);
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
      openGameScreen(res.room.id, key);
    } finally {
      lock.current = false;
    }
  }

  /**
   * Okey / 101 Okey masası. Yan yana: bölge + adres tarifi → masa (ayarlar bekleme odasında seçilir; oda sahibi de
   * oyuncudur). Uzaktan: masa açılmaz, eşleşme ekranına geçilir (4 kişi olunca masa kurulur).
   */
  async function createOkey(key: 'okey' | 'okey101', preset?: 'side' | 'remote') {
    lock.current = true;
    const leaving = leaveDone.current;
    try {
      const where =
        preset ??
        (await showDialog<'side' | 'remote' | null>({
          title: 'Nasıl oynanacak?',
          message:
            'Yan yana. Aynı masada oturursunuz, konum doğrulanır. Herkes yalnızca kendi ıstakasını görür. Aylık hedef yüksektir (ayda en çok 1.750). Mekân koduyla mekânda oynarsan +%25.\n\nUzaktan eşleş. 4 kişi olunca masa kurulur, herkes kendi telefonundan oynar. Ayda en çok 250 puan.',
          icon: 'grid',
          buttons: [
            { label: 'Yan yana · Büyük hedef', value: 'side', style: 'primary' },
            { label: 'Uzaktan eşleş', value: 'remote', style: 'ghost' },
            { label: 'Vazgeç', value: null, style: 'ghost' },
          ],
          cancelValue: null,
        }));
      if (!where) return;
      if (where === 'remote') {
        router.push({ pathname: '/okey-ara', params: { oyun: key } });
        return;
      }
      const earlyP = prefetchGameLocation();
      const maxP = getJoinMaxDistance();
      const quick = await Promise.race([earlyP, wait(300)]);
      const maxDistance = await Promise.race([maxP, wait(300).then(() => 1)]);
      const place = await askPlace(GAMES[key].title, quick?.ok ? quick.cell : null, maxDistance);
      if (!place) return;
      const early = quick ?? (await earlyP);
      const loc = early ?? (await requireGameLocation());
      if (!loc.ok) {
        await notify('Masa açılamadı', loc.message, { tone: 'danger', icon: 'location' });
        return;
      }
      await leaving;
      const res = await createRoom(key, undefined, loc.cell, place);
      if (res.error || !res.room) {
        await notify('Masa açılamadı', res.error ?? 'Biraz sonra tekrar dene.', { tone: 'danger', icon: 'alert-circle' });
        return;
      }
      const joined = await joinRoomWithLocation(res.room.code, undefined, loc.cell);
      if (joined.error) await notify('Masaya oturulamadı', joined.error, { tone: 'danger', icon: 'alert-circle' });
      onChanged?.();
      openGameScreen(res.room.id, key);
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
    const game = await showDialog<'vampire_villager' | 'shark_cage' | null>({
      title: 'Etkinlik oyunu aç',
      message: `“${ev.title}” etkinliğinde oyun odası açılır.\n\nOda kodu, katılımını doğrulamış katılımcılara bildirimle gider; odaya yalnızca onlar girebilir. Oyun Geceleri’nde puan 1,5 kat, Sosyal Buluşmalar ve Müzik & Eğlence’de 1,25 kat.\n\nKöpekbalığı Kafesi’nde anlatıcı olabilirsin (oynamazsın; anlatıcılı oyunda puan yok).`,
      icon: 'game-controller',
      buttons: [
        { label: 'Köpekbalığı Kafesi', value: 'shark_cage', style: 'primary' },
        { label: 'Vampir–Köylü', value: 'vampire_villager', style: 'ghost' },
        { label: 'Vazgeç', value: null, style: 'ghost' },
      ],
      cancelValue: null,
    });
    if (!game) return;
    lock.current = true;
    try {
      await leaveDone.current;
      const mode = game === 'shark_cage' ? await askSharkMode(true) : await askVampireMode();
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
        game,
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
      openGameScreen(res.room.id, game);
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
