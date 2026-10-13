import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { ActionSheet } from '@/components/ActionSheet';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RealNameNotice } from '@/components/RealNameNotice';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { confirmAction, notifyReportSent } from '@/lib/dialog';
import { REPORT_REASONS, reportContent } from '@/lib/feed';
import { timeAgo } from '@/lib/labels';
import { setHidden } from '@/lib/moderation';
import { REAL_NAME } from '@/lib/realName';
import {
  deleteMyVenueReview,
  getVenue,
  listVenueReviews,
  REVIEW_MAX,
  saveVenueReview,
  starsText,
  type Venue,
  type VenueReview,
} from '@/lib/venues';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';
import { Avatar } from '@/components/Avatar';
import { venueImageUrl } from '@/lib/venueImage';

type Props = {
  venueId: string;
  isModerator: boolean;
  onClose: () => void;
};

/**
 * Mekân profili: adres, telefon, kapanış saati, yıldız ortalaması ve yorumlar. Alttan açılan panel olarak çıkar
 * (ayrı bir pencere açmaz), bu yüzden bir pencerenin içinde de kullanılır. Kapsayıcı ekranın `flex: 1` olması gerekir.
 */
export function VenueSheet({ venueId, isModerator, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [reviews, setReviews] = useState<VenueReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, r] = await Promise.all([getVenue(venueId), listVenueReviews(venueId)]);
    if (v.error || !v.data) {
      setError(v.error ?? 'Mekân bilgisi alınamadı.');
    } else {
      setVenue(v.data);
      setError(null);
    }
    setReviews(r.data);
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- veri yükleme: durum sunucudan gelen cevapla güncellenir
    void load();
  }, [load]);

  function startEdit() {
    setStars(venue?.my_review?.stars ?? 0);
    setBody(venue?.my_review?.body ?? '');
    setFormError(null);
    setEditing(true);
  }

  async function onSave() {
    if (saving) return;
    if (stars < 1) {
      setFormError('Önce 1 ile 5 arasında yıldız seç.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await saveVenueReview(venueId, stars, body);
    setSaving(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    setEditing(false);
    setNotice('Değerlendirmen kaydedildi.');
    void load();
  }

  async function onDeleteMine() {
    const ok = await confirmAction('Değerlendirmeni sil', 'Puanın ve yorumun kaldırılır.', 'Sil', true);
    if (!ok) return;
    const res = await deleteMyVenueReview(venueId);
    setEditing(false);
    setNotice(res.error ?? 'Değerlendirmen silindi.');
    void load();
  }

  async function onReport(reviewId: string, reason: string) {
    setReportFor(null);
    const res = await reportContent('venue_review', reviewId, reason);
    if (res.error) setNotice(res.error);
    else await notifyReportSent();
  }

  async function onToggleHidden(r: VenueReview) {
    const res = await setHidden('venue_review', r.id, !r.is_hidden);
    setNotice(res.error ?? (r.is_hidden ? 'Yorum yeniden gösterildi.' : 'Yorum gizlendi.'));
    void load();
  }

  const phoneDigits = venue?.phone ? venue.phone.replace(/[^0-9+]/g, '') : '';

  return (
    <>
      <Sheet title={venue?.name ?? 'Mekân'} subtitle={venue ? 'Mekân hesabı' : undefined} onClose={onClose}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : error || !venue ? (
          <Text style={styles.muted}>{error ?? 'Mekân bilgisi alınamadı.'}</Text>
        ) : (
          <View style={styles.wrap} testID="venue-sheet">
            {venue.image_path ? (
              <View style={styles.imageRow}>
                <Avatar index={1} size={88} uri={venueImageUrl(venue.image_path)} />
              </View>
            ) : null}
            <View style={styles.infoBox}>
              <InfoLine icon="location" text={venue.address} />
              {venue.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${phoneDigits}`).catch(() => undefined)}
                  accessibilityRole="link"
                  accessibilityLabel={`Ara: ${venue.phone}`}
                >
                  <InfoLine icon="call" text={venue.phone} link />
                </Pressable>
              ) : null}
              <InfoLine icon="time" text={`Kapanış: ${venue.closing_hours}`} />
            </View>

            <View style={styles.scoreBox}>
              <Text style={styles.scoreBig}>{starsText(venue.avg_stars)}</Text>
              <View style={styles.scoreSide}>
                <Stars value={venue.avg_stars ?? 0} size={18} />
                <Text style={styles.scoreMeta}>
                  {venue.review_count > 0 ? `${venue.review_count} değerlendirme` : 'Henüz değerlendirme yok'}
                  {` · ${venue.visit_count} kez kod kullanıldı`}
                </Text>
              </View>
            </View>

            {notice ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}

            {editing ? (
              <View style={styles.form}>
                <Text style={styles.formTitle}>
                  {venue.my_review ? 'Değerlendirmeni düzenle' : 'Puan ver'}
                </Text>
                <StarPicker value={stars} onChange={setStars} />
                <TextField
                  label="Yorum (isteğe bağlı)"
                  icon="chatbox-ellipses-outline"
                  value={body}
                  onChangeText={setBody}
                  placeholder="Deneyimini kısaca yaz"
                  multiline
                  maxLength={REVIEW_MAX}
                  style={styles.multiline}
                  textAlignVertical="top"
                  testID="venue-review-input"
                />
                <RealNameNotice text={REAL_NAME.venueReview} />
                {formError ? (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {formError}
                  </Text>
                ) : null}
                <PrimaryButton
                  label="Kaydet"
                  onPress={() => void onSave()}
                  loading={saving}
                  testID="venue-review-save"
                />
                {venue.my_review ? (
                  <PrimaryButton
                    label="Değerlendirmemi sil"
                    variant="ghost"
                    onPress={() => void onDeleteMine()}
                    disabled={saving}
                  />
                ) : null}
                <PrimaryButton
                  label="Vazgeç"
                  variant="ghost"
                  onPress={() => setEditing(false)}
                  disabled={saving}
                />
              </View>
            ) : venue.can_review ? (
              <PrimaryButton
                label={venue.my_review ? 'Değerlendirmeni düzenle' : 'Puan ver ve yorum yaz'}
                onPress={startEdit}
                testID="venue-review-start"
              />
            ) : venue.needs_visit ? (
              <Text style={styles.hint}>
                Puan vermek için önce bu mekânın oyun hakkı kodunu bir kez kullanmış olman gerekir. Kodu
                mekândan isteyip Oyunlar sekmesindeki hak göstergesine yazabilirsin.
              </Text>
            ) : null}

            <Text style={styles.section}>Yorumlar</Text>
            {reviews.length === 0 ? (
              <Text style={styles.muted}>Henüz yorum yok.</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={[styles.review, r.is_hidden && styles.reviewHidden]}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewName} numberOfLines={1}>
                      {r.author_name}
                    </Text>
                    <Stars value={r.stars} size={13} />
                    <Text style={styles.reviewTime}>{timeAgo(r.created_at)}</Text>
                  </View>
                  {r.is_hidden ? (
                    <Text style={styles.hiddenText}>Gizli · yalnızca moderatörler görür</Text>
                  ) : null}
                  {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                  <View style={styles.reviewActions}>
                    {r.is_mine ? (
                      <Pressable onPress={startEdit} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.link}>Düzenle</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => setReportFor(r.id)} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.link}>Bildir</Text>
                      </Pressable>
                    )}
                    {isModerator ? (
                      <Pressable
                        onPress={() => void onToggleHidden(r)}
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <Text style={styles.link}>{r.is_hidden ? 'Göster' : 'Gizle'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </Sheet>
      {reportFor ? (
        <ActionSheet
          title="Şikayet nedeni"
          subtitle="Şikayetin yalnızca moderatörlere gider. Şikayet ettiğin kişi bunu bilmez."
          options={REPORT_REASONS.map((reason) => ({
            label: reason,
            icon: 'flag-outline' as const,
            onPress: () => void onReport(reportFor, reason),
          }))}
          onClose={() => setReportFor(null)}
        />
      ) : null}
    </>
  );
}

function InfoLine({
  icon,
  text,
  link = false,
}: {
  icon: 'location' | 'call' | 'time';
  text: string;
  link?: boolean;
}) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={16} color={colors.venue} />
      <Text style={[styles.infoText, link && styles.infoLink]}>{text}</Text>
    </View>
  );
}

/** Dolu / yarım / boş yıldızlarla gösterim (salt okunur) */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={styles.starsRow} accessibilityLabel={`${value.toFixed(1)} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
        return <Ionicons key={i} name={name} size={size} color={colors.primary} />;
      })}
    </View>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.pickerRow} testID="venue-star-picker">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${i} yıldız`}
          accessibilityState={{ selected: value === i }}
          testID={`venue-star-${i}`}
        >
          <Ionicons name={value >= i ? 'star' : 'star-outline'} size={36} color={colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  imageRow: { alignItems: 'center' },
  wrap: { gap: spacing.md },
  loader: { paddingVertical: spacing.xl },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  hint: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 21 },
  notice: { color: colors.success, fontSize: fontSizes.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  infoBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, lineHeight: 20 },
  infoLink: { color: colors.venue, textDecorationLine: 'underline' },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scoreBig: { color: colors.text, fontFamily: fonts.black, fontSize: 32, lineHeight: 38 },
  scoreSide: { flex: 1, gap: 4 },
  scoreMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  starsRow: { flexDirection: 'row', gap: 2 },
  pickerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  form: { gap: spacing.md },
  formTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  multiline: { minHeight: 80, paddingTop: spacing.sm },
  section: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, marginTop: spacing.sm },
  review: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewHidden: { opacity: 0.6 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewName: { flexShrink: 1, color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  reviewTime: { color: colors.textMuted, fontSize: 12 },
  reviewBody: { color: colors.text, fontSize: fontSizes.sm, lineHeight: 21 },
  reviewActions: { flexDirection: 'row', gap: spacing.lg, marginTop: 2 },
  link: { color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  hiddenText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
