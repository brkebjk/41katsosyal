import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, when, type Notice } from '../ui';
import type { Page } from './index';

type Stat = { count: number; oldest: string | null; days?: number; threads?: number; verified?: number };
type Status = Record<'traffic' | 'audit' | 'dm' | 'posts' | 'reports' | 'notifications' | 'members', Stat>;

const ROWS: { key: keyof Status; title: string; where: string; why: string; setting?: string }[] = [
  {
    key: 'traffic',
    title: 'Trafik kayıtları (IP, zaman, kim)',
    where: 'traffic_log',
    why: '5651 sayılı Kanun: yer sağlayıcı trafik bilgisini en az 1, en çok 2 yıl saklar. Hesap silinse de süre boyunca kalır.',
    setting: 'retention_traffic_days',
  },
  {
    key: 'audit',
    title: 'Moderatör işlem günlüğü',
    where: 'admin_audit_log',
    why: 'Hesap verebilirlik ve olası uyuşmazlıklarda ispat (meşru menfaat).',
    setting: 'retention_audit_days',
  },
  {
    key: 'dm',
    title: 'Özel mesajlar',
    where: 'dm_threads / dm_messages',
    why: 'Yasal saklama zorunluluğu yok. Hizmetin sunulması için tutulur; son mesajdan bu kadar gün sonra silinir. Hesap silinince hemen silinir.',
    setting: 'retention_dm_days',
  },
  {
    key: 'posts',
    title: 'Akış gönderileri ve yorumlar',
    where: 'posts / comments',
    why: 'Hizmetin sunulması. Bu süreden eski gönderiler silinir; hesap silinince hemen silinir.',
    setting: 'feed_archive_days',
  },
  {
    key: 'reports',
    title: 'Sonuçlanmış şikayetler ve sorun bildirimleri',
    where: 'reports / problem_reports',
    why: 'Kötüye kullanımla mücadele ve ispat; açık olanlar sonuçlanana kadar kalır.',
    setting: 'retention_reports_days',
  },
  { key: 'notifications', title: 'Bildirimler', where: 'notifications', why: 'Hizmetin sunulması; 60 gün sonra kendiliğinden silinir.' },
];

/** Veri saklama ve imha (KVKK) + hukuki özet */
export function RetentionPage({ onNotice, onGo }: { onNotice: (n: Notice) => void; onGo: (p: Page) => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_retention_status');
    if (error) onNotice({ text: errText(error, 'Durum okunamadı.'), error: true });
    setSt((data as Status) ?? null);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    if (!supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_run_retention');
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Temizlik yapılamadı.'), error: true });
    const d = (data ?? {}) as Record<string, number>;
    const total = Object.values(d).reduce((a, b) => a + (Number(b) || 0), 0);
    onNotice({ text: `Temizlik tamamlandı: süresi dolan ${total} kayıt silindi.`, error: false });
    void load();
  }

  return (
    <section>
      <h2>Veri saklama ve imha (KVKK)</h2>
      <Card>
        <p>
          Süresi dolan kayıtlar <strong>kendiliğinden</strong> silinir (üyeler giriş yaptıkça arka planda çalışır; KVKK'nın
          “en geç 6 ayda bir periyodik imha” kuralından çok daha sık). İstersen hemen de çalıştırabilirsin.
        </p>
        <div className="actions">
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? 'Temizleniyor…' : 'Süresi dolanları şimdi temizle'}
          </Button>
          <Button kind="ghost" onClick={() => onGo('settings')}>
            Saklama sürelerini değiştir (Ayarlar → retention)
          </Button>
        </div>
      </Card>

      {st === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Veri</th>
                <th>Kayıt</th>
                <th>En eski</th>
                <th>Saklama</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const s = st[r.key];
                return (
                  <tr key={r.key}>
                    <td>
                      <strong>{r.title}</strong>
                      <div className="muted small">{r.why}</div>
                    </td>
                    <td>
                      {s?.count ?? 0}
                      {r.key === 'dm' && s?.threads !== undefined ? <div className="muted small">{s.threads} yazışma</div> : null}
                    </td>
                    <td className="nowrap">{when(s?.oldest)}</td>
                    <td className="nowrap">{s?.days ? `${s.days} gün` : '—'}</td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <strong>Üye hesapları</strong>
                  <div className="muted small">
                    Hesap açık kaldıkça tutulur. Üye hesabını silince profili, gönderileri, mesajları ve oyun kayıtları hemen
                    silinir; yalnızca trafik kayıtları ve işlem günlüğü yasal süre boyunca kalır.
                  </div>
                </td>
                <td>
                  {st.members?.count ?? 0}
                  <div className="muted small">{st.members?.verified ?? 0} doğrulanmış</div>
                </td>
                <td>—</td>
                <td>hesap açıkken</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      <h3>Hukuki özet (bilgi amaçlı; yayından önce bir avukatla kontrol et)</h3>
      <Card>
        <h4>1. KVKK (6698 sayılı Kanun)</h4>
        <ul className="legal">
          <li>Veri sorumlusu sensin (ya da şirketin). Aydınlatma metni, açık rıza metni ve gizlilik politikası uygulamada var; “Uygulama metinleri” sayfasından güncel tut.</li>
          <li>Her veri türü için bir saklama süresi olmalı ve süre dolunca silinmeli: yukarıdaki tablo bunu yapıyor. Bu tabloyu bir “Kişisel Veri Saklama ve İmha Politikası” belgesine dönüştürmen iyi olur.</li>
          <li>
            <strong>Yurt dışına aktarım:</strong> Supabase (veritabanı) ve Cloudflare (panel) sunucuları yurt dışında. 2024 değişikliğiyle bunun için
            genellikle Kurul'un yayımladığı <em>standart sözleşmenin</em> karşı tarafla imzalanması ve imzadan sonra 5 iş günü içinde Kurul'a
            bildirilmesi gerekir. Bunu mutlaka bir avukatla netleştir.
          </li>
          <li>VERBİS kaydı: çalışan sayısı ve yıllık bilançosu belirli eşiğin altındaki işletmeler çoğunlukla muaftır; güncel eşikleri VERBİS sitesinden kontrol et.</li>
          <li>Üye “verilerimi ver” derse: uygulamada Profil → Kişisel Verilerim'den kendi dosyasını indirebiliyor (KVKK m.11). Silme talebi: hesabı silmek yeterli; en geç 30 gün içinde cevap verilmeli.</li>
          <li>TC kimlik numarası hiç saklanmıyor (yalnızca geri çevrilemeyen özeti). Kimlik doğrulama sırasında NVİ'ye bir kez gönderiliyor; bu aydınlatma metninde yazmalı.</li>
        </ul>
        <h4>2. 5651 sayılı Kanun (internet yayınları)</h4>
        <ul className="legal">
          <li>Üyelerin içerik yayınladığı bir platform “yer sağlayıcı” sayılır: içeriği önceden denetleme zorunluluğun yok, ama hukuka aykırı içerikten haberdar olunca (şikayet, mahkeme / BTK kararı) yayından kaldırmalısın. Şikayetler ve Akış sayfasındaki “Gizle” bunu sağlar.</li>
          <li>Trafik bilgisi (kim, ne zaman, hangi IP) <strong>en az 1, en çok 2 yıl</strong> saklanmalı; doğruluğu ve gizliliği korunmalı. “Trafik kayıtları” bunu tutuyor: kimse değiştiremez, her arama günlüğe yazılır, süre dolunca silinir.</li>
          <li>Mahkeme ya da savcılık bilgi isterse: “Trafik kayıtları” sayfasında kişiyi ya da IP'yi ara, Excel (CSV) indir ve resmi yazıya cevap olarak gönder. Talep yazısını ve gönderdiğin dosyayı sakla.</li>
          <li>Günlük erişimi 1 milyonu aşan “sosyal ağ sağlayıcı” yükümlülükleri (temsilci atama, raporlama) şimdilik sana uygulanmaz.</li>
        </ul>
        <h4>3. Mesaj geçmişi nasıl saklanmalı?</h4>
        <ul className="legal">
          <li>Kanun mesaj <em>içeriğini</em> saklamanı istemez; saklanması gereken trafik bilgisidir (kim, kime değil, ne zaman, hangi IP). Bu yüzden mesajlar son mesajdan {st?.dm?.days ?? 365} gün sonra silinir. Süreyi Ayarlar'dan değiştirebilirsin.</li>
          <li>Uygulamada ve panelde moderatör özel mesajları göremez; yalnızca <strong>şikayet edilen</strong> mesajı görür. Bu, üyelerin mahremiyeti için önemli; aydınlatma metninde de böyle yazmalı. Yedek dosyası ise bütün mesajları içerir: bu yüzden yedeğin şifresini yalnızca sen bilmelisin.</li>
          <li>Mesaj içeriğini isteyen bir mahkeme kararı gelirse, ilgili yazışma silinmeden önce “Yedekleme”den yedek alıp yalnızca istenen kısmı ilet.</li>
        </ul>
        <h4>4. Ödemeler ve ticari kayıtlar</h4>
        <ul className="legal">
          <li>Abonelik ödemeleri App Store / Google Play üzerinden alınır; kart bilgisi sende hiç olmaz. Mağaza satış raporlarını muhasebe için sakla (vergi kayıtları genelde 5 yıl, ticari defterler 10 yıl). Bunlar uygulamanın dışında, muhasebecinde durmalı.</li>
          <li>Kampanya / duyuru bildirimleri için üyeden ayrı izin alınıyor (Kişisel Verilerim → kampanya bildirimleri). Bu izni kapatan üyeye kampanya gönderilmez.</li>
        </ul>
        <h4>5. Yedek dosyaları</h4>
        <ul className="legal">
          <li>Yedek dosyası bütün üyelerin kişisel verisini içerir: şifreli iner, şifresini kimseyle paylaşma.</li>
          <li>Yedekler de saklama süresine tabidir: eski yedekleri (ör. 30 günden eskileri) sil; yoksa silinmiş hesapların verisi yedekte kalmaya devam eder.</li>
          <li>Yedeği bilgisayarında ve şifreli bir bulut klasöründe (iki ayrı yerde) tut.</li>
        </ul>
      </Card>
    </section>
  );
}
