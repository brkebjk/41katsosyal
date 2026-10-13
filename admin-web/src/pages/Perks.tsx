import { useCallback, useEffect, useState } from 'react';

import { deletePerk, inputToIso, isoToInput, listPerks, savePerk, type Perk, type PerkInput } from '@/lib/perks';

import { Button, Card, Empty, type Notice } from '../ui';

const EMPTY: PerkInput = {
  id: null,
  businessName: '',
  title: '',
  description: '',
  howTo: '',
  district: '',
  validUntil: null,
  isActive: true,
  sortOrder: 100,
};

/** Abone ayrıcalıkları (işletme indirimleri) */
export function PerksPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Perk[] | null>(null);
  const [draft, setDraft] = useState<(PerkInput & { until: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listPerks();
    if (res.error) onNotice({ text: res.error, error: true });
    setRows(res.data);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || busy) return;
    const until = inputToIso(draft.until);
    if (until === undefined) return onNotice({ text: 'Son geçerlilik günü 5.11.2026 biçiminde olmalı (ya da boş).', error: true });
    setBusy(true);
    const res = await savePerk({ ...draft, validUntil: until });
    setBusy(false);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: 'Ayrıcalık kaydedildi.', error: false });
    setDraft(null);
    void load();
  }

  async function remove(p: Perk) {
    if (!window.confirm(`“${p.title}” silinsin mi?`)) return;
    const res = await deletePerk(p.id);
    onNotice(res.error ? { text: res.error, error: true } : { text: 'Silindi.', error: false });
    void load();
  }

  const f = (k: keyof PerkInput | 'until', label: string, multi = false) =>
    draft ? (
      <label>
        {label}
        {multi ? (
          <textarea rows={3} value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        ) : (
          <input value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        )}
      </label>
    ) : null;

  return (
    <section>
      <h2>Abone ayrıcalıkları</h2>
      <div className="actions">
        <Button onClick={() => setDraft({ ...EMPTY, until: '' })}>Yeni ayrıcalık</Button>
      </div>
      {draft ? (
        <Card>
          <div className="stack">
            {f('businessName', 'İşletme adı')}
            {f('title', 'Başlık')}
            {f('description', 'Açıklama', true)}
            {f('howTo', 'Nasıl kullanılır', true)}
            {f('district', 'Bölge (isteğe bağlı)')}
            {f('until', 'Son geçerlilik günü (ör. 31.12.2026; boş = süresiz)')}
            <label>
              Sıra (küçük olan üstte)
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="option">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              Yayında
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
        <Empty>Ayrıcalık yok.</Empty>
      ) : (
        rows.map((p) => (
          <Card key={p.id} className={p.is_active ? '' : 'quote-hidden'}>
            <div className="row-head">
              <strong>
                {p.business_name} · {p.title}
              </strong>
              <span className="muted small">{p.valid_until ? `${isoToInput(p.valid_until)} tarihine kadar` : 'süresiz'}</span>
            </div>
            <p className="pre small">{p.description}</p>
            <div className="actions">
              <Button
                kind="ghost"
                onClick={() =>
                  setDraft({
                    id: p.id,
                    businessName: p.business_name,
                    title: p.title,
                    description: p.description ?? '',
                    howTo: p.how_to ?? '',
                    district: p.district ?? '',
                    validUntil: p.valid_until,
                    isActive: p.is_active,
                    sortOrder: p.sort_order,
                    until: isoToInput(p.valid_until),
                  })
                }
              >
                Düzenle
              </Button>
              <Button kind="danger" onClick={() => void remove(p)}>
                Sil
              </Button>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
