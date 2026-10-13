import { useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Card } from '../ui';

type Counts = Record<string, number | undefined>;

const ITEMS: { key: string; label: string; page: string }[] = [
  { key: 'mod_reports', label: 'Açık şikayet', page: 'reports' },
  { key: 'mod_approvals', label: 'Onay bekleyen (etkinlik, görsel, profil resmi)', page: 'approvals' },
  { key: 'mod_close_requests', label: 'Etkinlik kapatma isteği', page: 'close' },
  { key: 'mod_leader_apps', label: 'Etkinlik lideri başvurusu', page: 'leaders' },
  { key: 'mod_messages', label: 'Cevap bekleyen üye mesajı', page: 'messages' },
  { key: 'mod_cell_candidates', label: 'Yeni petek adı adayı', page: 'cells' },
  { key: 'mod_treasures', label: 'Yeni bulunan hazine', page: 'treasures' },
];

/** Özet: moderatörün yapılacak işleri */
export function OverviewPage({ onGo }: { onGo: (page: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [problems, setProblems] = useState<number | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('my_notice_counts').then(({ data }) => setCounts((data as Counts) ?? {}));
    void supabase
      .rpc('admin_list_problem_reports', { p_status: 'open' })
      .then(({ data }) => setProblems(Array.isArray(data) ? data.length : 0));
  }, []);

  return (
    <section>
      <h2>Özet</h2>
      <div className="grid">
        {ITEMS.map((i) => {
          const n = counts?.[i.key] ?? 0;
          return (
            <Card key={i.key} className={n > 0 ? 'stat stat-on' : 'stat'}>
              <div className="stat-n">{counts ? n : '…'}</div>
              <div className="stat-l">{i.label}</div>
              {n > 0 ? (
                <button className="link" onClick={() => onGo(i.page)}>
                  Aç →
                </button>
              ) : null}
            </Card>
          );
        })}
        <Card className={problems ? 'stat stat-on' : 'stat'}>
          <div className="stat-n">{problems ?? '…'}</div>
          <div className="stat-l">Açık sorun bildirimi</div>
          {problems ? (
            <button className="link" onClick={() => onGo('problems')}>
              Aç →
            </button>
          ) : null}
        </Card>
      </div>
    </section>
  );
}
