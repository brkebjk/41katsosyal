import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/AppText';
import { MemberCardModal } from '@/components/MemberCardModal';
import { PerkForm } from '@/components/PerkForm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth';
import { formatDate, isSubscriptionActive } from '@/lib/labels';
import { listPerks, perkExpired, type Perk } from '@/lib/perks';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

/**
 * Abonelik ayrıcalıkları: anlaşmalı işletmelerin abonelere özel avantajları.
 * Abone olmayan üye işletme adını ve başlığı görür, ayrıntılar kilitlidir (sunucu hiç göndermez).
 * Moderatör ayrıcalık ekler, düzenler, gizler ve siler.
 */
export default function PerksScreen() {
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const subscribed = isSubscriptionActive(profile?.premium_until);
  const canSee = subscribed || isModerator;
  const [perks, setPerks] = useState<Perk[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formPerk, setFormPerk] = useState<Perk | null>(null);
  const [cardPerk, setCardPerk] = useState<Perk | null>(null);

  const load = useCallback(async () => {
    const res = await listPerks();
    setError(res.error);
    if (!res.error) setPerks(res.data);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openForm(p: Perk | null) {
    setFormPerk(p);
    setFormOpen(true);
  }

  return (
    <Screen
      title="Ayrıcalıklar"
      subtitle="Anlaşmalı işletmelerde abonelere özel"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => void load()}
    >
      {!canSee ? (
        <View style={styles.lockBox} testID="perks-locked-banner">
          <Ionicons name="lock-closed" size={22} color={colors.primary} />
          <View style={styles.lockText}>
            <Text style={styles.lockTitle}>Bu ayrıcalıklar abonelere özel</Text>
            <Text style={styles.text}>
              Anlaşmalı işletmeleri görebilirsin. Ayrıntıları ve nasıl kullanılacağını abonelik açar.
            </Text>
          </View>
        </View>
      ) : null}
      {!canSee ? <PrimaryButton label="Abone ol" onPress={() => router.push('/abonelik')} /> : null}
      {isModerator ? <PrimaryButton label="Ayrıcalık ekle" onPress={() => openForm(null)} /> : null}

      {error ? (
        <View style={styles.stateBox}>
          <Text style={styles.error}>{error}</Text>
          <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void load()} />
        </View>
      ) : !loaded ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : perks.length === 0 ? (
        <View style={styles.stateBox} testID="perks-empty">
          <Ionicons name="storefront-outline" size={42} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Henüz ayrıcalık yok</Text>
          <Text style={styles.muted}>
            {isModerator
              ? 'Anlaşmalı bir işletme eklemek için yukarıdaki “Ayrıcalık ekle”ye dokun.'
              : 'Anlaşmalı işletmeler eklendikçe ayrıcalıklar burada görünecek.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {perks.map((p) => (
            <PerkCard
              key={p.id}
              perk={p}
              open={expanded === p.id}
              isModerator={isModerator}
              canUseCard={subscribed && !isModerator}
              onToggle={() => setExpanded((cur) => (cur === p.id ? null : p.id))}
              onEdit={() => openForm(p)}
              onShowCard={() => setCardPerk(p)}
            />
          ))}
        </View>
      )}

      <PerkForm
        visible={formOpen}
        perk={formPerk}
        onClose={() => setFormOpen(false)}
        onChanged={() => {
          setFormOpen(false);
          void load();
        }}
      />
      <MemberCardModal
        visible={cardPerk !== null}
        onClose={() => setCardPerk(null)}
        name={profile?.full_name ?? ''}
        subscriptionUntil={profile?.premium_until ?? null}
        perkLine={cardPerk ? `${cardPerk.business_name} · ${cardPerk.title}` : null}
      />
    </Screen>
  );
}

function PerkCard({
  perk,
  open,
  isModerator,
  canUseCard,
  onToggle,
  onEdit,
  onShowCard,
}: {
  perk: Perk;
  open: boolean;
  isModerator: boolean;
  canUseCard: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onShowCard: () => void;
}) {
  const expired = perkExpired(perk.valid_until);
  const hidden = !perk.is_active;
  const meta = [
    perk.district,
    perk.valid_until ? `${formatDate(perk.valid_until)} tarihine kadar` : 'Süresiz',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, (hidden || expired) && styles.cardDim]} testID="perk-card">
      <Pressable
        onPress={perk.locked ? undefined : onToggle}
        disabled={perk.locked}
        accessibilityRole={perk.locked ? undefined : 'button'}
        accessibilityState={perk.locked ? undefined : { expanded: open }}
        style={styles.cardHead}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="storefront" size={20} color={colors.primaryText} />
        </View>
        <View style={styles.cardTitleBox}>
          <Text style={styles.business} numberOfLines={1}>
            {perk.business_name}
          </Text>
          <Text style={styles.perkTitle} numberOfLines={open ? undefined : 2}>
            {perk.title}
          </Text>
          {isModerator && (hidden || expired) ? (
            <Text style={styles.flag}>{hidden ? 'Üyelere gizli' : 'Süresi doldu, üyeler görmüyor'}</Text>
          ) : null}
        </View>
        <Ionicons
          name={perk.locked ? 'lock-closed' : open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={perk.locked ? colors.primary : colors.textMuted}
        />
      </Pressable>
      {perk.locked ? (
        <Text style={styles.lockedNote}>Ayrıntılar abonelere açık.</Text>
      ) : open ? (
        <View style={styles.body}>
          {perk.description ? <Text style={styles.text}>{perk.description}</Text> : null}
          {perk.how_to ? (
            <View style={styles.howTo}>
              <Text style={styles.howToTitle}>Nasıl kullanılır?</Text>
              <Text style={styles.text}>{perk.how_to}</Text>
            </View>
          ) : null}
          <Text style={styles.meta}>{meta}</Text>
          {canUseCard ? <PrimaryButton label="Üyelik kartını göster" onPress={onShowCard} /> : null}
          {isModerator ? <PrimaryButton label="Düzenle" variant="ghost" onPress={onEdit} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSizes.sm, textAlign: 'center' },
  lockBox: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
  },
  lockText: { flex: 1, gap: 4 },
  lockTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  stateTitle: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardDim: { opacity: 0.7 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBox: { flex: 1, gap: 2 },
  business: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 12 },
  perkTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md, lineHeight: 22 },
  flag: { color: colors.accent, fontSize: 12, fontFamily: fonts.semi },
  lockedNote: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  body: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  howTo: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  howToTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  meta: { color: colors.textMuted, fontSize: 12 },
});
