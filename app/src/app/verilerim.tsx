import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { DeleteAccountSheet } from '@/components/DeleteAccountSheet';
import { Screen } from '@/components/Screen';
import type { AppTextKey } from '@/lib/account';
import { confirmAction, notify } from '@/lib/dialog';
import { formatDate } from '@/lib/labels';
import { CONSENTS, exportMyData, getMyPrivacy, setConsent, type ConsentKey, type MyPrivacy } from '@/lib/privacy';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const AGREEMENTS: { key: AppTextKey; title: string }[] = [
  { key: 'legal_terms', title: 'Kullanıcı sözleşmesi' },
  { key: 'legal_kvkk', title: 'KVKK aydınlatma metni' },
  { key: 'legal_consent', title: 'Açık rıza metni' },
  { key: 'legal_privacy', title: 'Gizlilik politikası' },
];

/**
 * Profil > Kişisel Verilerim & Rapor: kullanıcı kimliği ve kayıt tarihi, açılıp kapanabilen açık rızalar, kabul edilen
 * sözleşmeler, KVKK metnini reddetme yolu (yalnızca hesap silme) ve resmi veri dosyasını (.json) indirme.
 */
export default function MyDataScreen() {
  const [data, setData] = useState<MyPrivacy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ConsentKey | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await getMyPrivacy();
    setError(res.error);
    if (res.data) setData(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onToggle(key: ConsentKey, next: boolean) {
    if (!data || saving) return;
    if (!next) {
      const c = CONSENTS.find((x) => x.key === key);
      const ok = await confirmAction(
        'Rızanı geri çek',
        `“${c?.title ?? ''}” için verdiğin açık rıza geri çekilecek. İstediğin zaman yeniden açabilirsin.`,
        'Geri çek',
      );
      if (!ok) return;
    }
    setSaving(key);
    setData({ ...data, consents: { ...data.consents, [key]: next } });
    const res = await setConsent(key, next);
    setSaving(null);
    if (res.error) {
      setData((d) => (d ? { ...d, consents: { ...d.consents, [key]: !next } } : d));
      await notify('Kaydedilemedi', res.error, { icon: 'alert-circle' });
    }
  }

  async function onCopyId() {
    if (!data) return;
    await Clipboard.setStringAsync(data.user_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onRejectKvkk() {
    const ok = await confirmAction(
      'KVKK metnini reddet',
      'Uygulamayı kullanabilmek için kişisel verilerinin KVKK aydınlatma metnindeki şekilde işlenmesi gerekir. Metni reddetmenin uygulamada başka bir yolu yoktur: tek yol hesabını silmektir. Hesabını silmek istiyor musun?',
      'Hesap silmeye git',
      true,
    );
    if (ok) setDeleteOpen(true);
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    const res = await exportMyData();
    setExporting(false);
    if (res.error) await notify('Veri dosyası', res.error, { icon: 'alert-circle' });
  }

  const openText = (doc: AppTextKey) => router.push({ pathname: '/belge', params: { doc } });

  return (
    <Screen
      title="Kişisel Verilerim & Rapor"
      subtitle="Kimlik bilgin, rızaların ve veri dosyan"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      onRefresh={() => void load()}
      overlay={deleteOpen ? <DeleteAccountSheet onClose={() => setDeleteOpen(false)} /> : null}
    >
      {error && !data ? <Text style={styles.error}>{error}</Text> : null}

      {/* Kimlik */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hesap bilgisi</Text>
        <Text style={styles.label}>Kullanıcı kimliği (UUID)</Text>
        <Pressable
          onPress={() => void onCopyId()}
          accessibilityRole="button"
          accessibilityLabel="Kullanıcı kimliğini kopyala"
          style={({ pressed }) => [styles.idRow, pressed && styles.pressed]}
        >
          <Text style={styles.idText} selectable>
            {data?.user_id ?? '…'}
          </Text>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.primary} />
        </Pressable>
        <Text style={styles.label}>Kayıt tarihi</Text>
        <Text style={styles.value}>{data ? formatDate(data.created_at) : '…'}</Text>
      </View>

      {/* Açık rızalar */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Açık rızalar</Text>
        <Text style={styles.muted}>Her birini istediğin an kapatıp açabilirsin. Değişiklik hemen uygulanır.</Text>
        {CONSENTS.map((c) => (
          <View key={c.key} style={styles.consent}>
            <View style={styles.consentText}>
              <Text style={styles.consentTitle}>{c.title}</Text>
              <Text style={styles.consentDesc}>{c.text}</Text>
            </View>
            {saving === c.key ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={data?.consents[c.key] ?? true}
                onValueChange={(v) => void onToggle(c.key, v)}
                disabled={!data}
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityLabel={c.title}
              />
            )}
          </View>
        ))}
      </View>

      {/* Kabul edilen sözleşmeler */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Kabul edilen sözleşmeler</Text>
        {AGREEMENTS.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => openText(a.key)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.agreement, pressed && styles.pressed]}
          >
            <Ionicons name="document-text" size={18} color={colors.primary} />
            <View style={styles.consentText}>
              <Text style={styles.consentTitle}>{a.title}</Text>
              <Text style={styles.consentDesc}>
                {data ? `Kayıt sırasında kabul edildi · ${formatDate(data.created_at)}` : '…'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* KVKK metnini reddetme */}
      <View style={[styles.card, styles.rejectCard]}>
        <Text style={styles.cardTitle}>KVKK aydınlatma metnini reddetmek</Text>
        <Text style={styles.muted}>
          Uygulamanın çalışması için kişisel verilerinin KVKK aydınlatma metnindeki şekilde işlenmesi gerekir. Bu metni
          reddetmenin başka bir yolu yoktur; tek yol hesabını silmektir. Hesap silinince kişisel verilerin silinir ya da
          anonim hâle getirilir.
        </Text>
        <Pressable
          onPress={() => void onRejectKvkk()}
          accessibilityRole="button"
          testID="mydata-reject-kvkk"
          style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={styles.rejectText}>Reddet ve hesabımı silmeye git</Text>
        </Pressable>
      </View>

      {/* Resmi veri dosyası */}
      <Pressable
        onPress={() => void onExport()}
        disabled={exporting}
        accessibilityRole="button"
        testID="mydata-export"
        style={({ pressed }) => [styles.exportWrap, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={['#22D3C5', '#7C8CFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.exportBtn}
        >
          {exporting ? (
            <ActivityIndicator color="#04211F" />
          ) : (
            <Ionicons name="download" size={22} color="#04211F" />
          )}
          <Text style={styles.exportText}>Resmi Veri Dosyasını İndir (.JSON)</Text>
        </LinearGradient>
      </Pressable>
      <Text style={styles.note}>
        Dosyada hesabın, rızaların, gönderilerin, yorumların, gönderdiğin mesajlar, etkinliklerin, puan geçmişin ve
        diğer kayıtların bulunur. Dosya hazırlanınca telefonunun paylaş / kaydet penceresi açılır.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: fontSizes.sm },
  pressed: { opacity: 0.8 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  label: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semi, marginTop: spacing.xs },
  value: { color: colors.text, fontSize: fontSizes.md, fontFamily: fonts.semi },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  idText: { flex: 1, color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  consentText: { flex: 1, gap: 2 },
  consentTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  consentDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  agreement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rejectCard: { borderWidth: 1, borderColor: 'rgba(255, 84, 112, 0.45)' },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  rejectText: { color: colors.danger, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  exportWrap: { borderRadius: radii.lg, overflow: 'hidden' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
  },
  exportText: { color: '#04211F', fontFamily: fonts.black, fontSize: fontSizes.md },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
