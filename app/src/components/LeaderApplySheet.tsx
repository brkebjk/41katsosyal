import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { EVENT_CATEGORIES } from '@/lib/eventCategories';
import { AUDIENCE_OPTIONS, applyEventLeader, type Audience } from '@/lib/leader';
import { colors, fonts, fontSizes, radii } from '@/theme';

/**
 * Etkinlik lideri başvuru formu: ad soyad, düzenlediği etkinlik türleri, ortalama kitle, telefon.
 * Telefon yalnızca moderatörlere görünür; onaylanınca aylık etkinlik hakkı artar ve profilde rozet çıkar.
 */
export function LeaderApplySheet({
  initialName,
  onClose,
  onDone,
}: {
  initialName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const n = name.trim().replace(/\s+/g, ' ');
    const p = phone.replace(/[^0-9+]/g, '');
    if (n.length < 2 || n.length > 60) return setError('Ad soyad 2 ile 60 karakter arasında olmalı.');
    if (cats.length === 0) return setError('En az bir etkinlik türü seç.');
    if (!audience) return setError('Ortalama kitleni seç.');
    if (!/^[0-9+]{10,16}$/.test(p)) return setError('Telefon numarasını başında 0 ile, yalnızca rakam olarak yaz.');
    setError(null);
    setBusy(true);
    const res = await applyEventLeader({ fullName: n, phone: p, categories: cats, audience });
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
  }

  return (
    <Sheet
      title="Etkinlik lideri başvurusu"
      subtitle="Onaylanırsan her ay daha çok etkinlik açabilir, profilinde Etkinlik Lideri rozeti taşırsın."
      onClose={onClose}
    >
      <TextField
        label="Gerçek adın soyadın"
        icon="person-outline"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={60}
      />

      <Text style={styles.group}>Hangi etkinlikleri düzenliyorsun?</Text>
      <View style={styles.chips}>
        {EVENT_CATEGORIES.map((c) => {
          const on = cats.includes(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => setCats((p) => (on ? p.filter((x) => x !== c.key) : [...p, c.key]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Ionicons name={c.icon} size={14} color={on ? colors.primaryText : colors.textMuted} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.title}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.group}>Etkinliklerine ortalama kaç kişi geliyor?</Text>
      <View style={styles.chips}>
        {AUDIENCE_OPTIONS.map((a) => {
          const on = audience === a.value;
          return (
            <Pressable
              key={a.value}
              onPress={() => setAudience(a.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.chip, styles.chipWide, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${a.label} kişi`}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Telefon numaran"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={20}
        placeholder="05xx xxx xx xx"
      />
      <Text style={styles.note}>
        Telefonun yalnızca moderatörlere görünür ve yalnızca başvurunu doğrulamak için kullanılır. Başka hiçbir üye görmez.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Başvuruyu gönder" onPress={() => void submit()} loading={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipWide: { paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: fontSizes.xs + 1 },
  chipTextOn: { color: colors.primaryText, fontFamily: fonts.semi },
  pressed: { opacity: 0.8 },
  note: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
});
