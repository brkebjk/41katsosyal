import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, type Notice } from '../ui';

type Q = {
  id: string;
  category: string;
  question: string;
  options: string[];
  correct: number;
  is_active: boolean;
  times_shown: number;
  times_correct: number;
  difficulty: number;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'genel', label: 'Genel kültür' },
  { value: 'tarih', label: 'Tarih' },
  { value: 'cografya', label: 'Coğrafya' },
  { value: 'bilim', label: 'Bilim' },
  { value: 'spor', label: 'Spor' },
  { value: 'sanat', label: 'Sanat' },
  { value: 'eglence', label: 'Eğlence' },
  { value: 'kocaeli', label: 'Kocaeli' },
];

type Draft = { id: string | null; category: string; question: string; options: string[]; correct: number; difficulty: number };
const EMPTY: Draft = { id: null, category: 'genel', question: '', options: ['', '', '', ''], correct: 0, difficulty: 2 };

/** Bilgi Yarışması soruları: ara, ekle, düzenle, yayından kaldır */
export function QuizPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<Q[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (off: number) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('admin_list_quiz_questions', {
        p_search: search.trim() || null,
        p_category: category || null,
        p_limit: 50,
        p_offset: off,
      });
      if (error) onNotice({ text: errText(error, 'Sorular okunamadı.'), error: true });
      setRows((data as Q[]) ?? []);
      setOffset(off);
    },
    [search, category, onNotice],
  );
  useEffect(() => {
    void load(0);
  }, [category]);

  async function save() {
    if (!supabase || !draft || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_save_quiz_question', {
      p_id: draft.id,
      p_category: draft.category,
      p_question: draft.question,
      p_options: draft.options.map((o) => o.trim()),
      p_correct: draft.correct,
      p_difficulty: draft.difficulty,
    });
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Kaydedilemedi.'), error: true });
    onNotice({ text: 'Soru kaydedildi.', error: false });
    setDraft(null);
    void load(offset);
  }

  async function toggle(q: Q) {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_set_quiz_question_active', { p_id: q.id, p_active: !q.is_active });
    onNotice(error ? { text: errText(error), error: true } : { text: q.is_active ? 'Soru yayından kaldırıldı.' : 'Soru yayında.', error: false });
    void load(offset);
  }

  return (
    <section>
      <h2>Yarışma soruları</h2>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <input placeholder="Soruda ara" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Ara
        </button>
      </form>
      <div className="actions">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Bütün kategoriler</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Button onClick={() => setDraft({ ...EMPTY, options: ['', '', '', ''] })}>Yeni soru</Button>
      </div>

      {draft ? (
        <Card>
          <h3>{draft.id ? 'Soruyu düzenle' : 'Yeni soru'}</h3>
          <div className="stack">
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <textarea rows={2} placeholder="Soru" value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            {draft.options.map((o, i) => (
              <label key={i} className="option">
                <input type="radio" checked={draft.correct === i} onChange={() => setDraft({ ...draft, correct: i })} />
                <input
                  placeholder={`Seçenek ${i + 1}${draft.correct === i ? ' (doğru cevap)' : ''}`}
                  value={o}
                  onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </label>
            ))}
            <label>
              Zorluk
              <select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) })}>
                <option value={1}>Kolay</option>
                <option value={2}>Orta</option>
                <option value={3}>Zor</option>
              </select>
            </label>
            <div className="actions">
              <Button disabled={busy} onClick={() => void save()}>
                Kaydet
              </Button>
              <Button kind="ghost" onClick={() => setDraft(null)}>
                Vazgeç
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Soru yok.</Empty>
      ) : (
        rows.map((q) => (
          <Card key={q.id} className={q.is_active ? '' : 'quote-hidden'}>
            <div className="row-head">
              <strong>{q.question}</strong>
              <span className="muted small">{CATEGORIES.find((c) => c.value === q.category)?.label ?? q.category}</span>
            </div>
            <ol className="small">
              {q.options.map((o, i) => (
                <li key={i} className={i === q.correct ? 'ok-text' : ''}>
                  {o}
                </li>
              ))}
            </ol>
            <p className="muted small">
              {q.times_shown} kez soruldu · %{q.times_shown ? Math.round((100 * q.times_correct) / q.times_shown) : 0} doğru ·{' '}
              {q.is_active ? 'yayında' : 'kaldırıldı'}
            </p>
            <div className="actions">
              <Button
                kind="ghost"
                onClick={() =>
                  setDraft({ id: q.id, category: q.category, question: q.question, options: [...q.options], correct: q.correct, difficulty: q.difficulty ?? 2 })
                }
              >
                Düzenle
              </Button>
              <Button kind="ghost" onClick={() => void toggle(q)}>
                {q.is_active ? 'Yayından kaldır' : 'Yayınla'}
              </Button>
            </div>
          </Card>
        ))
      )}
      <div className="actions">
        {offset > 0 ? (
          <Button kind="ghost" onClick={() => void load(Math.max(0, offset - 50))}>
            ← Önceki 50
          </Button>
        ) : null}
        {rows && rows.length === 50 ? (
          <Button kind="ghost" onClick={() => void load(offset + 50)}>
            Sonraki 50 →
          </Button>
        ) : null}
      </div>
    </section>
  );
}
