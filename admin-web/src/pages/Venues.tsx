import { useCallback, useEffect, useState } from 'react';

import { adminListSponsors, adminRemoveVenueFromMap, adminSaveVenue, starsText, type SponsorRow } from '@/lib/venues';

import { publicUrl } from '../supabase';
import { Button, Card, Empty, type Notice } from '../ui';

type Draft = { userId: string; name: string; address: string; phone: string; hours: string; quota: string; q: string; r: string };

/** Mekânlar: sponsor (mekân) hesapları, bilgileri, haritadaki yeri ve kod kotası */
export function VenuesPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<SponsorRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await adminListSponsors();
    if (res.error) onNotice({ text: res.error, error: true });
    setRows(res.data);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    const res = await adminSaveVenue({
      userId: draft.userId,
      name: draft.name,
      address: draft.address,
      phone: draft.phone,
      hours: draft.hours,
      codeQuota: draft.quota.trim() ? Number(draft.quota) : null,
      cell: draft.q && draft.r ? { q: Number(draft.q), r: Number(draft.r) } : undefined,
    });
    setBusy(false);
    if (res.error) return onNotice({ text: res.error, error: true });
    onNotice({ text: 'Mekân kaydedildi.', error: false });
    setDraft(null);
    void load();
  }

  async function removeFromMap(v: SponsorRow) {
    if (!window.confirm(`“${v.name}” haritadan kaldırılsın mı? Hesap silinmez.`)) return;
    const res = await adminRemoveVenueFromMap(v.user_id);
    onNotice(res.error ? { text: res.error, error: true } : { text: 'Mekân haritadan kaldırıldı.', error: false });
    void load();
  }

  const input = (k: keyof Draft, label: string) =>
    draft ? (
      <label>
        {label}
        <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      </label>
    ) : null;

  return (
    <section>
      <h2>Mekânlar</h2>
      <p className="muted small">
        Mekân hesabı uygulamada normal kayıtla açılır, rolü sunucuda “sponsor” yapılır. Resim ekleme ve haritada nokta seçme
        uygulamadaki moderatör ekranından da yapılabilir.
      </p>
      {draft ? (
        <Card>
          <div className="stack">
            {input('name', 'Mekân adı')}
            {input('address', 'Adres')}
            {input('phone', 'Telefon (isteğe bağlı)')}
            {input('hours', 'Kapanış saati / çalışma saatleri')}
            {input('quota', 'Aylık kod kotası (boş = varsayılan)')}
            <div className="inline-form inline-2">
              {input('q', 'Petek q (isteğe bağlı)')}
              {input('r', 'Petek r')}
            </div>
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
        <Empty>Mekân hesabı yok.</Empty>
      ) : (
        rows.map((v) => (
          <Card key={v.user_id}>
            <div className="detail-head">
              {v.image_path ? <img className="photo" src={publicUrl('venue-images', v.image_path) ?? ''} alt="" /> : null}
              <div>
                <strong>{v.name}</strong>
                <div className="muted small">
                  {[
                    v.has_venue ? v.address : 'bilgi girilmemiş',
                    v.closing_hours,
                    v.cell_q !== null ? `petek (${v.cell_q}, ${v.cell_r})` : 'haritada değil',
                    `★ ${starsText(v.avg_stars)} (${v.review_count})`,
                    `${v.visit_count} ziyaret`,
                    `bu ay ${v.codes_month}/${v.quota_limit} kod`,
                    v.is_banned ? 'ASKIDA' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
            <div className="actions">
              <Button
                kind="ghost"
                onClick={() =>
                  setDraft({
                    userId: v.user_id,
                    name: v.name,
                    address: v.address ?? '',
                    phone: v.phone ?? '',
                    hours: v.closing_hours ?? '',
                    quota: v.code_quota === null ? '' : String(v.code_quota),
                    q: v.cell_q === null ? '' : String(v.cell_q),
                    r: v.cell_r === null ? '' : String(v.cell_r),
                  })
                }
              >
                Düzenle
              </Button>
              {v.cell_q !== null ? (
                <Button kind="danger" onClick={() => void removeFromMap(v)}>
                  Haritadan kaldır
                </Button>
              ) : null}
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
