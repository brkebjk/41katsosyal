import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { CloseX } from '@/components/CloseX';
import {
  NEARBY_MAX_METERS,
  distanceMeters,
  distanceText,
  findNearbyPlaces,
  requestPostFix,
  searchPlaces,
  tooFarText,
  type Place,
} from '@/lib/map';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Row = Place & { meters?: number };

type Props = {
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Konum önceden alındıysa: yakındaki yerler hemen listelenir (izin penceresi tekrar açılmaz) */
  preset?: { places: Row[]; fix: { lat: number; lon: number } } | null;
  /** true ise “Konum ekle” düğmesi atlanır, seçim kutusu açık başlar */
  startOpen?: boolean;
  /** Kutunun kendi kapat düğmesine basılınca (ör. üst pencereyi de kapatmak için) */
  onClose?: () => void;
};

/**
 * Gönderiye yer ekleme: yakındaki yerleri bul (konuma TEK SEFER bakılır, öncesinde uyarı gösterilir) ya da
 * yer adını yazıp ara. Yalnızca listedeki mekânlar seçilebilir; ev ya da serbest adres seçilemez.
 * Hangi yoldan seçilirse seçilsin yer, bulunduğun yerin 500 metre (kuş uçuşu) çevresinde olmalıdır; adla aranan bir
 * yer seçilirken konuma o anda 1 kez bakılıp uzaklık kontrol edilir. Konum yalnızca telefonda tutulur, sunucuya gitmez.
 */
export function PlacePicker({ value, onChange, preset = null, startOpen = false, onClose }: Props) {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Row[] | null>(null);
  const [nearby, setNearby] = useState<Row[] | null>(preset ? preset.places : null);
  const [busy, setBusy] = useState<'search' | 'nearby' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Bu pencere açıkken alınan tek seferlik konum; pencere kapanınca ya da yer seçilince silinir, hiçbir yere gönderilmez
  const [fix, setFix] = useState<{ lat: number; lon: number } | null>(preset ? preset.fix : null);
  const seq = useRef(0);

  // Yazarken kısa bir bekleyişten sonra aranır (her harfte sunucuya gidilmez)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(() => {
      setBusy('search');
      void searchPlaces(q).then((res) => {
        if (my !== seq.current) return;
        setBusy(null);
        setMessage(res.error);
        setFound(res.error ? null : res.data);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  async function onNearby() {
    if (busy) return;
    setMessage(null);
    setBusy('nearby');
    try {
      const res = await findNearbyPlaces();
      if (!res) return; // “Yer adını yazarım” dedi: konuma bakılmadı
      if (!res.ok) return setMessage(res.message);
      setFix(res.fix);
      setNearby(res.places);
      if (res.places.length === 0)
        setMessage(`${NEARBY_MAX_METERS} metre çevrende listede paylaşılabilecek bir yer bulunamadı.`);
    } finally {
      setBusy(null);
    }
  }

  function close() {
    onClose?.();
    setOpen(false);
    setFix(null);
    setFound(null);
    setNearby(null);
    setQuery('');
    setMessage(null);
  }

  function pick(p: Row) {
    onChange({
      id: p.id,
      name: p.name,
      cat_label: p.cat_label,
      district: p.district,
      address: p.address,
      lat: p.lat,
      lon: p.lon,
    });
    close();
  }

  // Seçilen yer 500 m içinde değilse paylaşılamaz. Konum henüz alınmadıysa (adla aranan yer) burada 1 kez alınır.
  async function onPick(p: Row) {
    if (busy) return;
    setMessage(null);
    let at = fix;
    if (!at) {
      setBusy('nearby');
      const res = await requestPostFix();
      setBusy(null);
      if (!res) return; // “Yer adını yazarım” dedi
      if (!res.ok) return setMessage(res.message);
      at = res.fix;
      setFix(at);
    }
    const meters = distanceMeters(at.lat, at.lon, p.lat, p.lon);
    if (meters > NEARBY_MAX_METERS) return setMessage(tooFarText(p.name, meters));
    pick({ ...p, meters });
  }

  if (value) {
    return (
      <View style={styles.chip} testID="place-selected">
        <Ionicons name="location" size={18} color={colors.primary} />
        <View style={styles.chipText}>
          <Text style={styles.chipName} numberOfLines={1}>
            {value.name}
          </Text>
          <Text style={styles.chipMeta} numberOfLines={1}>
            {[value.cat_label, value.district].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable
          onPress={() => onChange(null)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Yeri kaldır"
          testID="place-remove"
        >
          <Ionicons name="close-circle" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Konum ekle"
        testID="place-add"
        style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
      >
        <Ionicons name="location-outline" size={20} color={colors.primary} />
        <Text style={styles.addText}>Konum ekle</Text>
        <Text style={styles.addHint}>isteğe bağlı</Text>
      </Pressable>
    );
  }

  const list = query.trim().length >= 2 ? found : nearby;
  return (
    <View style={styles.card} testID="place-picker">
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Yer ekle</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
          <CloseX size={16} />
        </Pressable>
      </View>
      {preset ? (
        <Text style={styles.note}>{`Yakınındaki yerler (${preset.places.length}). Birine dokun ya da adını ara.`}</Text>
      ) : (
        <PrimaryButton
          label="Yakınımdaki yerleri bul"
          variant="ghost"
          onPress={() => void onNearby()}
          loading={busy === 'nearby'}
        />
      )}
      <View style={styles.reach} testID="place-reach-note">
        <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
        <Text style={styles.reachText}>
          Yalnızca bulunduğun yerin {NEARBY_MAX_METERS} metre çevresindeki yerler paylaşılabilir.
        </Text>
      </View>
      <Text style={styles.note}>
        Konumuna yalnızca sen basınca ve 1 kez bakılır; sürekli takip edilmez. Tam konumun kaydedilmez.
        Seçtiğin yer, kimse görünmeden haritadaki yoğunluğa da sayılır.
      </Text>
      <TextField
        label="Ya da yer adını yaz"
        icon="search"
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setMessage(null);
        }}
        placeholder="Örn. Starbucks, Kent Meydanı, Sahil Parkı"
        autoCorrect={false}
        testID="place-search-input"
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {busy === 'search' ? <Text style={styles.note}>Aranıyor…</Text> : null}
      {busy === 'nearby' ? <Text style={styles.note}>Konumun kontrol ediliyor…</Text> : null}
      {list && list.length === 0 && !message && busy !== 'search' ? (
        <Text style={styles.note}>
          Bu adla bir yer bulunamadı. Yazımı değiştirip tekrar dene ya da yersiz paylaş.
        </Text>
      ) : null}
      {list && list.length > 0 ? (
        <View style={styles.list}>
          {list.map((p, i) => {
            const meters = p.meters ?? (fix ? distanceMeters(fix.lat, fix.lon, p.lat, p.lon) : undefined);
            const far = meters !== undefined && meters > NEARBY_MAX_METERS;
            return (
              <Pressable
                key={p.id}
                onPress={() => void onPick(p)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name} yerini seç`}
                accessibilityState={{ disabled: far }}
                testID="place-result"
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivider,
                  far && styles.rowFarDim,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[p.cat_label, p.district, meters !== undefined ? distanceText(meters) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {far ? (
                    <Text style={styles.rowFar}>{NEARBY_MAX_METERS} m’den uzak, paylaşılamaz</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  addText: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  addHint: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.75 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 176, 32, 0.1)',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  chipText: { flex: 1, gap: 1 },
  chipName: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  chipMeta: { color: colors.textMuted, fontSize: 12 },
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  list: { borderRadius: radii.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 1 },
  rowName: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  rowFar: { color: colors.danger, fontSize: 11 },
  rowFarDim: { opacity: 0.6 },
  reach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 176, 32, 0.1)',
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  reachText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },
});
