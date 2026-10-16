import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions, type ScrollViewInstance, type TextInputInstance } from 'react-native';

import { Text } from '@/components/AppText';
import { KeyboardLift } from '@/components/KeyboardLift';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { DialogHost } from '@/components/DialogHost';
import { HelpLabel } from '@/components/HelpLabel';
import { CategoryIcon } from '@/components/CategoryIcon';
import { DateTimeField } from '@/components/DateTimeField';
import { EventCellPicker } from '@/components/EventCellPicker';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { TextField } from '@/components/TextField';
import { CloseX } from '@/components/CloseX';
import { cellName } from '@/lib/cellNames';
import { notify, showDialog } from '@/lib/dialog';
import { clearDraft, loadDraft, saveDraft } from '@/lib/drafts';
import { pickEventImage, uploadEventImage, type PickedImage } from '@/lib/eventImage';
import { createEvent, eventCellMarks, listEvents, setEventOfficial, type EventCellMark } from '@/lib/events';
import { AGE_OPTIONS, EVENT_CATEGORIES, type EventCategory } from '@/lib/eventCategories';
import { areaOf, type Cell } from '@/lib/hex';
import { DEFAULT_RULES, getPointRules } from '@/lib/ranking';
import { REAL_NAME } from '@/lib/realName';
import { gameCellMarks, listOpenRooms, type GameCellMark } from '@/lib/rooms';
import { getSponsorPanel } from '@/lib/venues';
import { contentCity } from '@/lib/city';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** pending: moderatör onayı bekliyor (Konser & Festival); imageError: görsel yüklenemediyse nedeni */
  onCreated: (pending: boolean, imageError: string | null) => void;
  /** Görsel yükleme klasörü için üye kimliği */
  userId: string;
  /** Etkinlikte düzenleyen olarak görünecek ad (moderatörse marka adı, üyeyse gerçek adı) */
  hostName: string;
  isModerator: boolean;
  /** Mekân (sponsor) hesabı: etkinlik kendiliğinden mekânın peteğinde açılır, petek değiştirilemez */
  isSponsor?: boolean;
};

const MAX_FEE = 100000;

type FieldKey = 'title' | 'desc' | 'loc' | 'cell' | 'time' | 'cap' | 'cat' | 'age' | 'fee';

/** Alanların kaydırma alanı içindeki yerleri (eksik alanı ekranın ortasına getirmek için) */
class FieldLayouts {
  private map = new Map<string, { y: number; h: number }>();
  private view = 0;
  set(k: string, y: number, h: number) {
    this.map.set(k, { y, h });
  }
  setView(h: number) {
    this.view = h;
  }
  centerOffset(k: string): number | null {
    const p = this.map.get(k);
    if (!p) return null;
    return Math.max(0, Math.round(p.y + p.h / 2 - this.view / 2));
  }
}

/** Kaydırma alanının doğrudan çocuğu olan alan kutusu: yerini kaydeder, hatalıysa altında hatayı yazar */
function Slot({
  id,
  layouts,
  error,
  children,
}: {
  id: FieldKey;
  layouts: FieldLayouts;
  /** Bu alan hatalıysa hata yazısı */
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <View onLayout={(e) => layouts.set(id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)} style={styles.slot}>
      {children}
      {error ? (
        <View style={styles.fieldError}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ücret kutusuna yazılanı temizler: sadece rakam ve en fazla bir virgül kalır (nokta virgüle
 * çevrilir), virgülden sonra en fazla 2 hane. Yanlış tuşlar sessizce yok sayılır.
 */
function cleanFee(text: string, previous: string): string {
  const t = text.replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const parts = t.split(',');
  if (parts.length > 2) return previous;
  if (parts.length === 2 && parts[1].length > 2) return previous;
  return t;
}

/** Etkinlik oluştur penceresinin taslağı (uygulama arka planda kapatılsa da yazılanlar kaybolmaz; görsel saklanmaz) */
export const EVENT_DRAFT_KEY = 'event-form';
type EventDraft = {
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  capacity: string;
  category: EventCategory | null;
  minAge: number | null;
  withGames: boolean;
  paid: boolean;
  fee: string;
  cell: Cell | null;
};

function parseFee(text: string): number {
  return Number(text.trim().replace(',', '.'));
}

export function EventForm({ visible, onClose, onCreated, userId, hostName, isModerator, isSponsor = false }: Props) {
  const { height: winH } = useWindowDimensions();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState('');
  const [category, setCategory] = useState<EventCategory | null>(null);
  // Oyunlu etkinlik yalnızca Oyun Geceleri, Sosyal Buluşmalar ve Müzik & Eğlence’de açılır (sunucu da denetler)
  const gamesAllowed = category === 'oyun_gecesi' || category === 'sosyal' || category === 'muzik';
  const [minAge, setMinAge] = useState<number | null>(null);
  /** Oyunlu etkinlik: etkinlik başlayınca en az 4 doğrulamayla etkinlik oyunu açılabilir (Oyun Geceleri ×1,5; Sosyal Buluşmalar, Müzik & Eğlence ×1,25) */
  const [withGames, setWithGames] = useState(false);
  const [paid, setPaid] = useState(false);
  const [fee, setFee] = useState('');
  const [cell, setCell] = useState<Cell | null>(null);
  /** Sponsor: mekânın peteği (yüklenene kadar undefined, mekân haritada değilse null) */
  const [venueCell, setVenueCell] = useState<Cell | null | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [marks, setMarks] = useState<EventCellMark[]>([]);
  const [gameMarks, setGameMarks] = useState<GameCellMark[]>([]);
  // Puan verilebilmesi için etkinliğe gereken en az kişi sayısı (sunucu ayarından gelir; kontenjan bundan az olamaz)
  const [minCap, setMinCap] = useState(DEFAULT_RULES.eventMinAttendees);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Boş bırakılan / hatalı zorunlu alan (kırmızı çerçeve ve altında hata yazısı) */
  const [invalid, setInvalid] = useState<FieldKey | null>(null);
  const [layouts] = useState(() => new FieldLayouts());
  const scrollRef = useRef<ScrollViewInstance>(null);
  const descRef = useRef<TextInputInstance>(null);
  const locRef = useRef<TextInputInstance>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Pencere açılınca kayıtlı taslak varsa yazılanlar geri gelir
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void loadDraft<EventDraft>(EVENT_DRAFT_KEY).then((d) => {
      if (!alive) return;
      if (d) {
        setTitle(d.title ?? '');
        setDescription(d.description ?? '');
        setLocation(d.location ?? '');
        const at = d.startsAt ? new Date(d.startsAt) : null;
        setStartsAt(at && !Number.isNaN(at.getTime()) ? at : null);
        setCapacity(d.capacity ?? '');
        setCategory(d.category ?? null);
        setMinAge(d.minAge ?? null);
        setWithGames(!!d.withGames);
        setPaid(!!d.paid);
        setFee(d.fee ?? '');
        // Mekân hesabında petek mekânın peteğidir, taslaktan gelmez
        if (!isSponsor && d.cell) setCell(d.cell);
      }
      setDraftReady(true);
    });
    return () => {
      alive = false;
    };
  }, [visible, isSponsor]);

  // Yazıldıkça taslak kaydedilir (boş formda taslak tutulmaz)
  useEffect(() => {
    if (!visible || !draftReady) return;
    const empty =
      !title.trim() && !description.trim() && !location.trim() && !startsAt && !capacity.trim() && !category && !fee.trim();
    saveDraft(
      EVENT_DRAFT_KEY,
      empty
        ? null
        : ({
            title,
            description,
            location,
            startsAt: startsAt ? startsAt.toISOString() : null,
            capacity,
            category,
            minAge,
            withGames,
            paid,
            fee,
            cell: isSponsor ? null : cell,
          } satisfies EventDraft),
    );
  }, [visible, draftReady, isSponsor, title, description, location, startsAt, capacity, category, minAge, withGames, paid, fee, cell]);

  /** Çarpı: bilerek kapatıldı, taslak silinir (dışarı dokunma ya da geri tuşu taslağı korur) */
  function closeAndDiscard() {
    clearDraft(EVENT_DRAFT_KEY);
    onClose();
  }

  // Form açılınca haritada gösterilecek mevcut etkinlik bölgeleri yüklenir
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void listEvents(contentCity() ?? undefined).then((res) => {
      if (active && !res.error) setMarks(eventCellMarks(res.data));
    });
    void listOpenRooms(undefined, contentCity()).then((res) => {
      if (active && !res.error) setGameMarks(gameCellMarks(res.data));
    });
    void getPointRules().then((r) => {
      if (active) setMinCap(Math.max(1, r.eventMinAttendees));
    });
    if (isSponsor) {
      void getSponsorPanel().then((res) => {
        if (!active) return;
        const p = res.data;
        const c =
          p && p.cell_q !== null && p.cell_q !== undefined && p.cell_r !== null && p.cell_r !== undefined
            ? { q: p.cell_q, r: p.cell_r }
            : null;
        setVenueCell(c);
        setCell(c);
      });
    }
    return () => {
      active = false;
    };
  }, [visible, isSponsor]);

  /** Alanı kaydırma alanının ortasına getirir */
  function focusField(k: FieldKey) {
    const y = layouts.centerOffset(k);
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: true });
  }

  /** Kişi hatalı alanı düzeltmeye başlayınca kırmızı çerçeve kalkar */
  function touched(k: FieldKey) {
    if (invalid === k) {
      setInvalid(null);
      setError(null);
    }
  }

  async function onSubmit() {
    if (submitting) return;
    const t = title.trim();
    const d = description.trim();
    const l = location.trim();
    // Eksik ya da hatalı alan: kutu kırmızı çerçeveyle ekranın ortasına getirilir, hata altında yazar
    const bad = (k: FieldKey, msg: string) => {
      setError(msg);
      setInvalid(k);
      focusField(k);
    };
    if (t.length < 3 || t.length > 120) return bad('title', 'Başlık 3 ile 120 karakter arasında olmalı.');
    if (d.length < 10) return bad('desc', 'Açıklama zorunlu: en az 10 karakter yaz.');
    if (d.length > 1000) return bad('desc', 'Açıklama en fazla 1000 karakter olabilir.');
    if (l.length < 3 || l.length > 120) {
      return bad('loc', 'Adres tarifi zorunlu: etkinliğe gelenlerin yeri bulabilmesi için 3–120 karakterle yaz.');
    }
    if (isSponsor && !venueCell) {
      return bad(
        'cell',
        'Mekânın henüz haritada değil. Etkinlik açabilmek için moderatörden mekânını haritaya eklemesini iste.',
      );
    }
    if (!cell) return bad('cell', 'Harita zorunlu: etkinliğin bölgesini haritadan seç.');
    if (!startsAt) return bad('time', 'Zaman zorunlu: tarih ve saat seç.');
    if (startsAt.getTime() <= Date.now() + 60_000) return bad('time', 'Etkinlik zamanı ileri bir saat olmalı.');
    const cap = Number(capacity.trim());
    if (!capacity.trim() || !Number.isInteger(cap) || cap < minCap || cap > 10000) {
      return bad('cap', `Kontenjan zorunlu: ${minCap} ile 10.000 arasında bir sayı yaz.`);
    }
    if (!category) return bad('cat', 'Kategori zorunlu: etkinliğin kategorisini seç.');
    if (minAge === null) return bad('age', 'Yaş sınırı zorunlu: bir seçenek seç (sınır yoksa “Yaş sınırı yok”).');
    let amount = 0;
    if (paid) {
      amount = parseFee(fee);
      if (!fee.trim() || !Number.isFinite(amount) || amount <= 0 || amount > MAX_FEE) {
        return bad('fee', 'Ücretli etkinlik için fiyatı yaz (0’dan büyük bir tutar).');
      }
      amount = Math.round(amount * 100) / 100;
    }

    setInvalid(null);
    setError(null);
    setSubmitting(true);
    const result = await createEvent({
      title: t,
      description: d,
      location: l,
      startsAt,
      capacity: cap,
      fee: amount,
      category,
      minAge,
      cell,
      withGames: withGames && gamesAllowed,
    });
    if (result.error) {
      setSubmitting(false);
      // Aynı petekte günlük etkinlik sınırı: petek kutusu gösterilir
      if (result.error.startsWith('Aynı petekte')) return bad('cell', result.error);
      return setError(result.error);
    }
    // Moderatör Konser & Festival açtıysa: PeopleHere Özel mi, normal konser mi?
    if (isModerator && category === 'konser_festival' && result.id) {
      const official = await showDialog<boolean>({
        title: 'Nasıl yayınlansın?',
        message:
          'PeopleHere Özel etkinliği seçersen PeopleHere Özel olarak listelenir ve herkese duyuru gider. Seçmezsen Konser & Festival olarak listelenir.',
        icon: 'mic',
        buttons: [
          { label: 'PeopleHere Özel etkinliği', value: true, style: 'primary' },
          { label: 'Normal Konser & Festival', value: false, style: 'ghost' },
        ],
        cancelValue: false,
      });
      await setEventOfficial(result.id, official);
    }
    let imageError: string | null = null;
    if (image && result.id && userId) {
      imageError = (await uploadEventImage(userId, result.id, image)).error;
    }
    setSubmitting(false);
    clearDraft(EVENT_DRAFT_KEY);
    onCreated(result.pending === true, imageError);
  }

  const errFor = (k: FieldKey) => (invalid === k ? error : null);

  async function chooseImage() {
    const res = await pickEventImage();
    if (res.error) return setError(res.error);
    if (res.image) setImage(res.image);
  }

  function chooseCategory(key: EventCategory) {
    setCategory(key);
    touched('cat');
    if (key === 'konser_festival' && !isModerator) {
      void notify(
        'Konser & Festival onaya tabi',
        'Bu kategorideki etkinlikler moderatör onayından sonra yayına girer. Onaylanana kadar yalnızca sen görürsün; reddedilirse aylık hakkından düşmez.',
        { icon: 'mic' },
      );
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Ekranın ortasında açılan, içinde kayan pencere */}
      <KeyboardLift style={styles.popupRoot} inModal>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.popupCard, { height: Math.round(winH * 0.86) }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Etkinlik oluştur
            </Text>
            <Pressable
              onPress={closeAndDiscard}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <CloseX size={18} />
            </Pressable>
          </View>

          <View style={styles.flex}>
            <KeyboardAwareScroll
              ref={scrollRef}
              onLayout={(e) => layouts.setView(e.nativeEvent.layout.height)}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {isModerator ? (
                <View style={styles.hostBox}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
                  <Text style={styles.hostText}>Etkinlik “PeopleHere” adıyla yayınlanır.</Text>
                </View>
              ) : (
                <RealNameNotice text={`${REAL_NAME.eventHost} Görünecek ad: ${hostName}.`} />
              )}

              <Slot id="title" layouts={layouts} error={errFor('title')}>
                <TextField
                  label="Başlık *"
                  help="Etkinliğin kısa ve net adı (3–120 karakter). Örn. Vampir–Köylü Gecesi."
                  compact
                  invalid={invalid === 'title'}
                  icon="text-outline"
                  value={title}
                  onChangeText={(v) => {
                    setTitle(v);
                    touched('title');
                  }}
                  placeholder="Örn. Vampir–Köylü Gecesi"
                  maxLength={120}
                  returnKeyType="next"
                  onSubmitEditing={() => descRef.current?.focus()}
                />
              </Slot>
              <Slot id="desc" layouts={layouts} error={errFor('desc')}>
                <TextField
                  ref={descRef}
                  label={`Açıklama * · ${description.trim().length}/1000`}
                  help="Neler yapılacak, kimler gelmeli, nelere dikkat edilmeli? En az 10, en çok 1000 karakter."
                  compact
                  invalid={invalid === 'desc'}
                  icon="document-text-outline"
                  value={description}
                  onChangeText={(v) => {
                    setDescription(v);
                    touched('desc');
                  }}
                  placeholder="Neler yapılacak, kimler gelmeli?"
                  multiline
                  maxLength={1000}
                  style={styles.multiline}
                  textAlignVertical="top"
                />
              </Slot>
              <Slot id="loc" layouts={layouts} error={errFor('loc')}>
                <TextField
                  ref={locRef}
                  label="Adres Tarifi *"
                  help="Gelenlerin yeri kolayca bulması için mekânın adını ve nasıl bulunacağını (kat, giriş, işaret) yaz."
                  compact
                  invalid={invalid === 'loc'}
                  icon="location-outline"
                  value={location}
                  onChangeText={(v) => {
                    setLocation(v);
                    touched('loc');
                  }}
                  placeholder="Örn. Kent Meydanı Kafe, 2. kat"
                  maxLength={120}
                  returnKeyType="next"
                />
              </Slot>
              <Slot id="cell" layouts={layouts} error={errFor('cell')}>
                <HelpLabel
                  label="Haritada bölge *"
                  help={
                    isSponsor
                      ? 'Mekân hesabının etkinlikleri her zaman mekânının peteğinde açılır; değiştirilemez.'
                      : 'Etkinliğin yaklaşık bölgesi haritada görünür. Tam tarifi “Adres Tarifi” kutusuna yazarsın.'
                  }
                />
                {isSponsor ? (
                  <View
                    style={[styles.cellBtn, venueCell ? styles.cellBtnOn : null, invalid === 'cell' && styles.invalid]}
                    testID="event-cell-locked"
                  >
                    <Ionicons
                      name={venueCell ? 'storefront' : 'alert-circle-outline'}
                      size={20}
                      color={venueCell ? colors.success : colors.danger}
                    />
                    <Text style={styles.cellTitle}>
                      {venueCell === undefined
                        ? 'Mekânının peteği yükleniyor…'
                        : venueCell
                          ? `${cellName(venueCell)} · ${areaOf(venueCell.q, venueCell.r)}`
                          : 'Mekânın haritada değil'}
                    </Text>
                    <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Haritadan etkinlik bölgesini seç"
                    testID="event-cell-open"
                    style={({ pressed }) => [
                      styles.cellBtn,
                      cell && styles.cellBtnOn,
                      invalid === 'cell' && styles.invalid,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={cell ? 'checkmark-circle' : 'map-outline'}
                      size={20}
                      color={cell ? colors.success : colors.primary}
                    />
                    <Text style={styles.cellTitle}>
                      {cell ? `${cellName(cell)} · ${areaOf(cell.q, cell.r)}` : 'Haritadan petek seç'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </Slot>
              <Slot id="time" layouts={layouts} error={errFor('time')}>
                <DateTimeField
                  label="Zaman *"
                  help="Etkinlik başladıktan 3 saat sonra (Konser & Festival 2 saat sonra) kapanır ve listeden kalkar. Katılımcılardan biri kodu girdiyse etkinliği kendin kaldıramazsın; açıklamalı bir kapatma talebi gönderirsin."
                  compact
                  invalid={invalid === 'time'}
                  value={startsAt}
                  onChange={(d) => {
                    setStartsAt(d);
                    touched('time');
                  }}
                />
              </Slot>
              <Slot id="cap" layouts={layouts} error={errFor('cap')}>
                <TextField
                  label="Katılımcı kontenjanı *"
                  help={`En az ${minCap} kişi. Puanlar, etkinlikte en az ${minCap} kişinin katılımı kodla ve bölge bilgisiyle doğrulanınca verilir.`}
                  compact
                  invalid={invalid === 'cap'}
                  icon="people-outline"
                  value={capacity}
                  onChangeText={(v) => {
                    setCapacity(v.replace(/[^0-9]/g, ''));
                    touched('cap');
                  }}
                  placeholder="Örn. 20"
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </Slot>

              <Slot id="cat" layouts={layouts} error={errFor('cat')}>
                <HelpLabel
                  label="Kategori *"
                  help="Etkinliğine en uygun kategoriyi seç. Konser & Festival etkinlikleri moderatör onayından sonra yayına girer."
                />
                <View style={[styles.chipWrap, invalid === 'cat' && styles.invalidGroup]}>
                  {EVENT_CATEGORIES.map((c) => {
                    const active = category === c.key;
                    return (
                      <Pressable
                        key={c.key}
                        onPress={() => chooseCategory(c.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <CategoryIcon info={c} size={14} color={active ? colors.primaryText : colors.accent} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Slot>

              <Slot id="age" layouts={layouts} error={errFor('age')}>
                <HelpLabel
                  label="Yaş sınırı *"
                  help="Uygulama yaş doğrulaması yapmaz. Katılımcılar yaş sınırını sağladıklarını katılırken onaylar."
                />
                <View style={[styles.chipWrap, invalid === 'age' && styles.invalidGroup]}>
                  {AGE_OPTIONS.map((o) => {
                    const active = minAge === o.value;
                    return (
                      <Pressable
                        key={o.value}
                        onPress={() => {
                          setMinAge(o.value);
                          touched('age');
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Slot>

              {gamesAllowed ? (
              <View style={styles.feeBlock}>
                <HelpLabel
                  label="Etkinlikte oyun *"
                  help="Oyunlu: etkinlik başlayınca ve en az 4 kişi katılımını kodla doğrulayınca etkinlik oyunu açabilirsin. Oyun Geceleri’nde puan 1,5 kat, Sosyal Buluşmalar ve Müzik & Eğlence’de 1,25 kat! Odaya yalnızca doğrulanmış katılımcılar girer. Oyunlu etkinlik yalnızca bu üç kategoride açılır. Oyunsuz: etkinlikte oyun odası açılmaz. Etkinlik çekilişi her etkinlikte açılabilir."
                />
                <View style={styles.segment}>
                  <Pressable
                    onPress={() => setWithGames(false)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: !withGames }}
                    testID="event-form-no-games"
                    style={[styles.segmentItem, !withGames && styles.segmentActive]}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={!withGames ? colors.primaryText : colors.text}
                    />
                    <Text style={[styles.segmentText, !withGames && styles.segmentTextActive]}>Oyunsuz</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setWithGames(true)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: withGames }}
                    testID="event-form-with-games"
                    style={[styles.segmentItem, withGames && styles.segmentActive]}
                  >
                    <Ionicons name="game-controller" size={16} color={withGames ? colors.primaryText : colors.text} />
                    <Text style={[styles.segmentText, withGames && styles.segmentTextActive]}>Oyunlu</Text>
                  </Pressable>
                </View>
              </View>
              ) : null}

              <Slot id="fee" layouts={layouts} error={errFor('fee')}>
                <HelpLabel
                  label="Katılım ücreti *"
                  help="Ücretli seçersen kişi başı ücreti yaz. Ücret, etkinlik kartında katılımcılara gösterilir."
                />
                <View style={styles.segment}>
                  <Pressable
                    onPress={() => {
                      setPaid(false);
                      touched('fee');
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: !paid }}
                    style={[styles.segmentItem, !paid && styles.segmentActive]}
                  >
                    <Ionicons name="gift-outline" size={16} color={!paid ? colors.primaryText : colors.text} />
                    <Text style={[styles.segmentText, !paid && styles.segmentTextActive]}>Ücretsiz</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPaid(true)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: paid }}
                    style={[styles.segmentItem, paid && styles.segmentActive]}
                  >
                    <Ionicons name="cash-outline" size={16} color={paid ? colors.primaryText : colors.text} />
                    <Text style={[styles.segmentText, paid && styles.segmentTextActive]}>Ücretli</Text>
                  </Pressable>
                </View>
                {paid ? (
                  <TextField
                    label="Kişi başı ücret (₺)"
                    compact
                    invalid={invalid === 'fee'}
                    icon="pricetag-outline"
                    value={fee}
                    onChangeText={(v) => {
                      setFee((prev) => cleanFee(v, prev));
                      touched('fee');
                    }}
                    placeholder="Örn. 150"
                    keyboardType="decimal-pad"
                    maxLength={9}
                  />
                ) : null}
              </Slot>

              <View style={styles.feeBlock}>
                <HelpLabel
                  label="Görsel (isteğe bağlı)"
                  help={
                    isModerator
                      ? 'Görsel hemen yayına girer. En çok 2 MB.'
                      : 'En çok 2 MB. Görsel bir kez eklenir; sonra değiştirilemez ve kaldırılamaz. Etkinlik hemen yayınlanır, görsel moderatör onayından sonra görünür.'
                  }
                />
                {image ? (
                  <View style={styles.imageBox}>
                    <Image source={{ uri: image.uri }} contentFit="cover" style={styles.imagePreview} />
                    <View style={styles.imageBtns}>
                      <View style={styles.flex}>
                        <PrimaryButton label="Değiştir" variant="ghost" onPress={() => void chooseImage()} />
                      </View>
                      <View style={styles.flex}>
                        <PrimaryButton label="Kaldır" variant="ghost" onPress={() => setImage(null)} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <PrimaryButton label="Görsel seç" variant="ghost" onPress={() => void chooseImage()} />
                )}
              </View>

              {category === 'konser_festival' && !isModerator ? (
                <Text style={styles.imageNote}>
                  Konser & Festival: moderatör onayından sonra yayına girer. Katılım kodu otomatik oluşur ve katıl
                  diyenler kodu kendisi görür; kod başlamadan 5 dakika önceden başlangıçtan 15 dakika sonrasına kadar
                  girilir. Etkinlik başlangıçtan 2 saat sonra listeden kalkar.
                </Text>
              ) : null}
              {error && invalid === null ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton
                label={category === 'konser_festival' && !isModerator ? 'Onaya gönder' : 'Etkinliği yayınla'}
                onPress={onSubmit}
                loading={submitting}
              />
              <Text style={styles.footnote}>* ile işaretli alanların hepsi zorunludur.</Text>
            </KeyboardAwareScroll>
          </View>
        </View>
      </KeyboardLift>
      <EventCellPicker
        visible={pickerOpen}
        initial={cell}
        eventCells={marks}
        gameCells={gameMarks}
        onClose={() => setPickerOpen(false)}
        onPick={(c, name) => {
          setCell(c);
          setPickerOpen(false);
          setError(null);
          if (name && location.trim().length === 0) setLocation(name.slice(0, 120));
        }}
      />
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  redClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBox: { gap: spacing.sm },
  imagePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md },
  imageBtns: { flexDirection: 'row', gap: spacing.sm },
  imageNote: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  flex: { flex: 1 },
  popupRoot: { flex: 1, justifyContent: 'center', padding: spacing.md },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5, 7, 14, 0.8)' },
  popupCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  slot: { gap: spacing.xs },
  fieldError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 92, 122, 0.12)',
  },
  fieldErrorText: { flex: 1, color: colors.danger, fontSize: fontSizes.sm, lineHeight: 19, fontWeight: '700' },
  invalid: { borderColor: colors.danger, borderWidth: 2 },
  invalidGroup: { padding: 4, borderRadius: radii.md, borderWidth: 2, borderColor: colors.danger },
  hostBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  hostText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  multiline: { minHeight: 64, paddingTop: 6 },
  feeBlock: { gap: spacing.xs },
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.primaryText },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  segmentTextActive: { color: colors.primaryText },
  cellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 42,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  cellBtnOn: { borderColor: colors.success },
  cellTitle: { flex: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  footnote: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
});
