// GEÇİCİ (yazı düzenleme modu): moderatör bir yazıya uzun basınca açılan düzenleme penceresi.
// Bu pencerenin kendi yazıları düzenlenemez (react-native Text kullanır).

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import {
  closeTextEditor,
  getTextEditState,
  isTextEditWanted,
  loadUiTexts,
  saveUiText,
  setTextEditAdmin,
  setTextEditMode,
  subscribeTextEdit,
} from '@/lib/textEdit';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

export function TextEditHost() {
  const { profile } = useAuth();
  const st = useSyncExternalStore(subscribeTextEdit, getTextEditState, getTextEditState);

  useEffect(() => {
    void loadUiTexts();
  }, []);
  useEffect(() => {
    setTextEditAdmin(profile?.role === 'admin');
  }, [profile?.role]);

  if (!st.pending) return null;
  return <Editor key={st.pending} source={st.pending} current={st.overrides.get(st.pending) ?? null} />;
}

/** Moderatör paneli: yazı düzenleme modunu aç / kapat */
export function TextEditToggle() {
  const st = useSyncExternalStore(subscribeTextEdit, getTextEditState, getTextEditState);
  const on = st.editing || isTextEditWanted();
  return (
    <View style={styles.toggle} testID="text-edit-toggle">
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>Yazı düzenleme modu</Text>
        <Text style={styles.toggleSub}>
          {on
            ? 'Açık: altı noktalı çizili yazılara uzun bas ve düzelt. Düğme yazısına dokunmak düğmeyi çalıştırmayabilir; işin bitince kapat.'
            : `Açınca uygulamadaki yazılara uzun basıp düzeltebilirsin (herkeste görünür). Şu an ${st.overrides.size} düzeltme var.`}
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={setTextEditMode}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityLabel="Yazı düzenleme modu"
      />
    </View>
  );
}

function Editor({ source, current }: { source: string; current: string | null }) {
  const [draft, setDraft] = useState(current ?? source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(text: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveUiText(source, text);
    setBusy(false);
    if (res.error) setError(res.error);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={closeTextEditor} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Pressable style={styles.backdrop} onPress={closeTextEditor} accessibilityLabel="Kapat" />
        <View style={styles.card}>
          <Text style={styles.title}>Yazıyı düzenle</Text>
          <ScrollView style={styles.origBox} contentContainerStyle={styles.origPad}>
            <Text style={styles.label}>Orijinal</Text>
            <Text style={styles.orig} selectable>
              {source}
            </Text>
          </ScrollView>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            autoFocus
            style={styles.input}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.hint}>
            Kaydedince herkeste görünür. Boş bırakırsan ya da orijinalle aynı yaparsan orijinale döner.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable onPress={closeTextEditor} style={[styles.btn, styles.ghost]} disabled={busy}>
              <Text style={styles.ghostText}>Vazgeç</Text>
            </Pressable>
            {current ? (
              <Pressable onPress={() => void save(null)} style={[styles.btn, styles.ghost]} disabled={busy}>
                <Text style={styles.ghostText}>Orijinale dön</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => void save(draft)} style={[styles.btn, styles.primary]} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? '…' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E8A400',
    backgroundColor: colors.surface,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.md },
  toggleSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  root: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: fontSizes.lg },
  origBox: { maxHeight: 120, borderRadius: radii.sm, backgroundColor: colors.bg },
  origPad: { padding: spacing.sm, gap: 2 },
  label: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semi },
  orig: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 19 },
  input: {
    minHeight: 90,
    maxHeight: 220,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    color: colors.text,
    fontSize: fontSizes.md,
    textAlignVertical: 'top',
  },
  hint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16 },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill },
  ghost: { borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.text, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  primary: { backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.sm },
});
