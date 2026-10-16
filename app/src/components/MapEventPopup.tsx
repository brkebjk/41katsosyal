import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { cellName } from '@/lib/cellNames';
import { confirmAction, notify } from '@/lib/dialog';
import { ageText, categoryInfo } from '@/lib/eventCategories';
import { eventImageUrl } from '@/lib/eventImage';
import { attendeeCount, registerForEvent, showsImageOnMap, type EventItem } from '@/lib/events';
import { formatWhen } from '@/lib/labels';
import { syncEventReminders } from '@/lib/localNotify';
import { confirmMeetupSafety } from '@/lib/safety';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/** Kartın köşesindeki etiket: PeopleHere Özel, Konser & Festival ya da Tanıtım & İşbirliği */
function ribbonOf(e: EventItem): { label: string; color: string } | null {
  if (e.is_official) return { label: 'PeopleHere Özel', color: '#FFC83D' };
  if (e.category === 'konser_festival') return { label: 'Konser & Festival', color: '#FF7AD9' };
  if (e.tag === 'tanitim_isbirligi') return { label: 'Tanıtım & İşbirliği', color: colors.accent };
  return null;
}

/**
 * Haritadaki etkinlik görseline dokununca: harita ekranından çıkmadan etkinliğin penceresi açılır. Bir petekte
 * birden çok görselli etkinlik varsa hepsi alt alta listelenir. Buradan doğrudan katılınabilir.
 */
export function MapEventPopup({
  events,
  onClose,
  onChanged,
  onEnterCode,
}: {
  events: EventItem[];
  onClose: () => void;
  /** Katılım sonrası liste tazelensin */
  onChanged: () => void;
  /** Kod girişi açıkken katılım kodunu girme (pencere kapanır, kod penceresi açılır) */
  onEnterCode?: (ev: EventItem) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(ev: EventItem) {
    if (busy) return;
    if (ev.min_age > 0) {
      const ok = await confirmAction(
        'Yaş sınırı',
        `Bu etkinlik ${ev.min_age} yaş ve üzeri içindir. ${ev.min_age} yaşından büyük olduğunu onaylıyor musun?`,
        'Onaylıyorum, katıl',
      );
      if (!ok) return;
    }
    // Tanımadığın kişilerle buluşma uyarısı ve sorumluluk notu (Etkinlikler sekmesiyle aynı)
    if (!(await confirmMeetupSafety('event'))) return;
    setBusy(ev.id);
    setError(null);
    const res = await registerForEvent(ev.id);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    onChanged();
    void syncEventReminders();
    await notify(
      'Katılımın kaydedildi',
      'Etkinlik başlamadan 30 dakika önce telefonuna hatırlatma gelir (bildirim izni ve hatırlatma tercihi açıksa).\n\nKatılım kodu girişi etkinlik başlamadan 5 dakika önce açılır. Etkinlik yerinde düzenleyenin söylediği kodu haritadaki bu pencereden girdiğinde katılımın doğrulanır ve puan kazanırsın.',
      { icon: 'checkmark-circle', tone: 'success' },
    );
  }

  return (
    <Popup
      title={events.length > 1 ? `Bu petekte ${events.length} etkinlik` : 'Etkinlik'}
      subtitle={
        events[0]?.cell_q != null && events[0]?.cell_r != null
          ? cellName({ q: events[0].cell_q, r: events[0].cell_r })
          : undefined
      }
      icon="calendar"
      onClose={onClose}
      testID="map-event-popup"
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {events.length === 0 ? <Text style={styles.muted}>Bu etkinlik artık listede değil.</Text> : null}
      {events.map((ev) => {
        const ribbon = ribbonOf(ev);
        const info = categoryInfo(ev.category);
        const count = attendeeCount(ev);
        const full = count >= ev.capacity;
        const uri = showsImageOnMap(ev) ? eventImageUrl(ev.image_path) : null;
        return (
          <View key={ev.id} style={styles.card} testID="map-event-card">
            {uri ? (
              <View>
                <Image source={{ uri }} contentFit="cover" style={styles.image} />
                {ribbon ? (
                  <View style={[styles.ribbon, { backgroundColor: ribbon.color }]}>
                    <Text style={styles.ribbonText}>{ribbon.label}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={styles.body}>
              <View style={styles.catRow}>
                <CategoryIcon info={info} size={15} color={colors.event} />
                <Text style={styles.cat}>{info.title}</Text>
              </View>
              <Text style={styles.title}>{ev.title}</Text>
              <Line icon="time-outline" text={formatWhen(new Date(ev.starts_at))} />
              <Line icon="location-outline" text={ev.location} />
              <Line icon="person-outline" text={`Düzenleyen: ${ev.host_name}`} />
              <Line
                icon="people-outline"
                text={`${count}/${ev.capacity} kişi · ${ev.fee_amount > 0 ? `${ev.fee_amount} ₺` : 'Ücretsiz'} · ${ageText(ev.min_age)}`}
              />
              <Text style={styles.desc}>{ev.description}</Text>
              {ev.is_mine ? (
                <Text style={styles.state}>Bu etkinliği sen düzenliyorsun.</Text>
              ) : ev.is_registered ? (
                <>
                  <View style={styles.joined}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.joinedText}>
                      {ev.checked_in
                        ? 'Katılımın doğrulandı.'
                        : 'Katılıyorsun. Kod girişi açılınca düzenleyenin söylediği kodu buradan gir.'}
                    </Text>
                  </View>
                  {onEnterCode && !ev.checked_in && ev.checkin_open ? (
                    <PrimaryButton
                      label="Katılım kodunu gir"
                      onPress={() => {
                        onClose();
                        onEnterCode(ev);
                      }}
                      testID="map-event-code"
                    />
                  ) : null}
                </>
              ) : full ? (
                <Text style={styles.state}>Kontenjan dolu.</Text>
              ) : (
                <PrimaryButton
                  label="Katıl"
                  onPress={() => void join(ev)}
                  loading={busy === ev.id}
                  disabled={busy !== null}
                  testID="map-event-join"
                />
              )}
              <PrimaryButton
                label="Etkinliği gör"
                variant="ghost"
                onPress={() => {
                  onClose();
                  router.navigate({ pathname: '/events', params: { ev: ev.id, t: String(Date.now()) } });
                }}
                testID="map-event-open"
              />
            </View>
          </View>
        );
      })}
    </Popup>
  );
}

function Line({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: '100%', aspectRatio: 16 / 9 },
  ribbon: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  ribbonText: { color: '#1A1200', fontFamily: fonts.black, fontSize: 11 },
  body: { padding: spacing.md, gap: 6 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cat: { color: colors.event, fontFamily: fonts.semi, fontSize: 12 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 19 },
  desc: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20, marginTop: 4 },
  state: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: 6 },
  joined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  joinedText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center' },
});
