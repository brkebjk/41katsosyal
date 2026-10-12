import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuizRewardsCard } from '@/components/QuizRewardsCard';
import { TextField } from '@/components/TextField';
import { confirmAction } from '@/lib/dialog';
import {
  adminListQuestions,
  adminSaveQuestion,
  adminSetQuestionActive,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  OPTION_LETTERS,
  type AdminQuestion,
  type QuizCategory,
} from '@/lib/quiz';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

type Notice = { text: string; error: boolean };
const CATEGORIES = Object.keys(CATEGORY_LABEL) as QuizCategory[];

/**
 * Moderatör: Bilgi Yarışması soru bankası. Ara, kategoriye göre süz, yeni soru ekle, düzenle, kapat/aç.
 * Kapatılan soru maçlarda çıkmaz ama silinmez (istatistiği kalır).
 */
export function QuizQuestionsTab({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<QuizCategory | null>(null);
  const [rows, setRows] = useState<AdminQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<AdminQuestion | 'new' | null>(null);

  const load = useCallback(async () => {
    const res = await adminListQuestions(search, category);
    setRows(res.data);
    setError(res.error);
  }, [search, category]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function toggle(q: AdminQuestion) {
    if (q.is_active) {
      const ok = await confirmAction('Soruyu kapat', 'Bu soru artık maçlarda çıkmaz. İstediğin zaman yeniden açabilirsin.', 'Kapat');
      if (!ok) return;
    }
    const res = await adminSetQuestionActive(q.id, !q.is_active);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: q.is_active ? 'Soru kapatıldı.' : 'Soru yeniden açıldı.', error: false });
    void load();
  }

  return (
    <>
      <QuizRewardsCard onNotice={onNotice} />
      <Text style={styles.muted}>
        Maçta şıklar her seferinde karıştırılır. Çok kolay ya da çok zor soruları “doğru oranına” bakarak bulabilirsin.
      </Text>
      <PrimaryButton label="Yeni soru ekle" onPress={() => setEdit('new')} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Soru ara"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
        accessibilityLabel="Soru ara"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        <Chip label="Tümü" active={category === null} onPress={() => setCategory(null)} />
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABEL[c]} color={CATEGORY_COLOR[c]} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows === null ? (
        <Text style={styles.muted}>Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Soru bulunamadı.</Text>
      ) : (
        rows.map((q) => (
          <View key={q.id} style={[styles.card, !q.is_active && styles.cardOff]} testID="quiz-question-row">
            <View style={styles.head}>
              <Text style={[styles.cat, { color: CATEGORY_COLOR[q.category] }]}>
                {CATEGORY_LABEL[q.category]}
                <Text style={{ color: DIFFICULTY_COLOR[q.difficulty] ?? colors.textMuted }}>{`  ·  ${DIFFICULTY_LABEL[q.difficulty] ?? 'Orta'}`}</Text>
              </Text>
              <Text style={styles.stat}>
                {q.times_shown > 0
                  ? `${q.times_shown} gösterim · %${Math.round((100 * q.times_correct) / q.times_shown)} doğru`
                  : 'Henüz gösterilmedi'}
              </Text>
            </View>
            <Text style={styles.q}>{q.question}</Text>
            {q.options.map((o, i) => (
              <Text key={i} style={[styles.opt, i === q.correct && styles.optOk]}>
                {`${OPTION_LETTERS[i]}) ${o}${i === q.correct ? '  ✓' : ''}`}
              </Text>
            ))}
            <View style={styles.actions}>
              <Text style={styles.link} onPress={() => setEdit(q)}>
                Düzenle
              </Text>
              <Text style={[styles.link, q.is_active && styles.linkDanger]} onPress={() => void toggle(q)}>
                {q.is_active ? 'Kapat' : 'Yeniden aç'}
              </Text>
            </View>
          </View>
        ))
      )}

      {edit ? (
        <QuestionForm
          initial={edit === 'new' ? null : edit}
          defaultCategory={category ?? 'genel'}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            onNotice({ text: 'Soru kaydedildi.', error: false });
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function Chip({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && { backgroundColor: color ?? colors.primary, borderColor: color ?? colors.primary }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function QuestionForm({
  initial,
  defaultCategory,
  onClose,
  onSaved,
}: {
  initial: AdminQuestion | null;
  defaultCategory: QuizCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<QuizCategory>(initial?.category ?? defaultCategory);
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [options, setOptions] = useState<string[]>(initial?.options ?? ['', '', '', '']);
  const [correct, setCorrect] = useState(initial?.correct ?? 0);
  const [difficulty, setDifficulty] = useState<number>(initial?.difficulty ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await adminSaveQuestion({ id: initial?.id ?? null, category, question, options, correct, difficulty });
    setBusy(false);
    if (res.error) return setError(res.error);
    onSaved();
  }

  return (
    <Popup
      title={initial ? 'Soruyu düzenle' : 'Yeni soru'}
      subtitle="Dört şık yaz ve doğru olanı işaretle. Bilgilerin doğru olduğundan emin ol."
      icon="help-circle"
      onClose={onClose}
      footer={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Kaydet" onPress={() => void save()} loading={busy} />
        </>
      }
    >
      <Text style={styles.label}>Kategori</Text>
      <View style={styles.catsWrap}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABEL[c]} color={CATEGORY_COLOR[c]} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Text style={styles.label}>Zorluk (Solo Maraton kolaydan zora bu sırayla sorar)</Text>
      <View style={styles.catsWrap}>
        {[1, 2, 3].map((d) => (
          <Chip key={d} label={DIFFICULTY_LABEL[d]} color={DIFFICULTY_COLOR[d]} active={difficulty === d} onPress={() => setDifficulty(d)} />
        ))}
      </View>
      <TextField label="Soru" value={question} onChangeText={setQuestion} maxLength={220} multiline placeholder="Ör. Türkiye'nin başkenti neresidir?" />
      <Text style={styles.label}>Şıklar (doğru olanın yanındaki daireye dokun)</Text>
      {options.map((o, i) => (
        <View key={i} style={styles.optRow}>
          <Pressable
            onPress={() => setCorrect(i)}
            accessibilityRole="radio"
            accessibilityState={{ checked: correct === i }}
            accessibilityLabel={`${OPTION_LETTERS[i]} şıkkı doğru`}
            hitSlop={8}
          >
            <Ionicons
              name={correct === i ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={correct === i ? colors.success : colors.textMuted}
            />
          </Pressable>
          <TextInput
            value={o}
            onChangeText={(v) => setOptions((prev) => prev.map((x, k) => (k === i ? v : x)))}
            placeholder={`${OPTION_LETTERS[i]} şıkkı`}
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            style={[styles.optInput, correct === i && styles.optInputOk]}
          />
        </View>
      ))}
    </Popup>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 16 },
  empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: 'center', paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: fontSizes.sm },
  search: {
    height: 42,
    color: colors.text,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cats: { gap: 6 },
  catsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontSize: 12, fontFamily: fonts.semi },
  chipTextOn: { color: '#0B0F1A' },
  card: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOff: { opacity: 0.5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cat: { fontSize: 11, fontFamily: fonts.extra },
  stat: { color: colors.textMuted, fontSize: 11 },
  q: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  opt: { color: colors.textMuted, fontSize: 12 },
  optOk: { color: colors.success, fontFamily: fonts.semi },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  link: { color: colors.primary, fontFamily: fonts.semi, fontSize: fontSizes.sm },
  linkDanger: { color: colors.danger },
  label: { color: colors.textMuted, fontSize: fontSizes.xs, fontFamily: fonts.semi },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optInput: {
    flex: 1,
    height: 42,
    color: colors.text,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  optInputOk: { borderColor: colors.success },
});
