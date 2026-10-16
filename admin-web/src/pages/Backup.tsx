import { useRef, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, downloadFile, stamp, when, type Notice } from '../ui';

type Backup = {
  format: string;
  created_at: string;
  project: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};
type Sealed = {
  format: 'peoplehere-yedek-sifreli-v1';
  created_at: string;
  project: string;
  counts: Record<string, number>;
  iter: number;
  salt: string;
  iv: string;
  data: string;
};

const ITER = 250_000;

const RESULT: Record<string, string> = {
  not_configured: 'Yedekleme işlevi sunucuda eksik kurulmuş.',
  forbidden: 'Bu işlem yalnızca moderatörler içindir.',
  web_panel_only: 'Yedekleme yalnızca web panelden yapılabilir. Çıkış yapıp yeniden gir.',
  invalid_backup: 'Bu dosya geçerli bir PeopleHere yedeği değil.',
  wrong_project: 'Bu yedek başka bir projeye (başka bir Supabase veritabanına) ait; yüklenemez.',
  backup_has_no_members: 'Yedekte hiç üye yok; yüklenmedi.',
  invalid_request: 'İstek anlaşılamadı.',
};

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function keyFrom(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function seal(b: Backup, password: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITER);
  const enc = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(b))),
  );
  return {
    format: 'peoplehere-yedek-sifreli-v1',
    created_at: b.created_at,
    project: b.project,
    counts: b.counts,
    iter: ITER,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(enc),
  };
}
async function unseal(s: Sealed, password: string): Promise<Backup> {
  const key = await keyFrom(password, unb64(s.salt), s.iter);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource }, key, unb64(s.data) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as Backup;
}

async function callBackup(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Sunucu bağlantısı yok.' };
  const { data, error } = await supabase.functions.invoke('admin-backup', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 404) return { data: null, error: 'Yedekleme işlevi sunucuda yok: Supabase\'de “admin-backup” işlevi yayınlanmalı (test rehberine bak).' };
    return { data: null, error: `Yedekleme işlevine ulaşılamadı${status ? ` (HTTP ${status})` : ''}.` };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.result !== 'ok') {
    const code = String(d.result ?? '');
    return { data: null, error: RESULT[code] ?? `İşlem yapılamadı (${code || 'bilinmeyen'}${d.detail ? `: ${String(d.detail)}` : ''}).` };
  }
  return { data: d, error: null };
}

/** Yedekleme: bütün verinin şifreli yedeğini bilgisayara indir; yedekten geri yükle */
export function BackupPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<Sealed | null>(null);
  const [rpass, setRpass] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportTo(password: string, prefix: string): Promise<boolean> {
    const res = await callBackup({ action: 'export' });
    if (res.error || !res.data) {
      onNotice({ text: res.error ?? 'Yedek alınamadı.', error: true });
      return false;
    }
    const sealed = await seal(res.data.backup as Backup, password);
    downloadFile(`${prefix}-${stamp()}.json`, JSON.stringify(sealed));
    return true;
  }

  async function doExport() {
    if (pass.length < 10) return onNotice({ text: 'Şifre en az 10 karakter olmalı.', error: true });
    if (pass !== pass2) return onNotice({ text: 'Şifreler aynı değil.', error: true });
    setBusy('export');
    const ok = await exportTo(pass, 'peoplehere-yedek');
    setBusy(null);
    if (ok) {
      setLast(new Date().toISOString());
      onNotice({ text: 'Yedek bilgisayarına indi. Şifreyi unutursan yedek açılamaz.', error: false });
    }
  }

  async function pick(f: File | undefined) {
    setFile(null);
    if (!f) return;
    try {
      const s = JSON.parse(await f.text()) as Sealed;
      if (s.format !== 'peoplehere-yedek-sifreli-v1') throw new Error('format');
      setFile(s);
    } catch {
      onNotice({ text: 'Bu dosya bir PeopleHere yedek dosyası değil.', error: true });
    }
  }

  async function doRestore() {
    if (!file) return;
    if (confirmText.trim().toLocaleUpperCase('tr-TR') !== 'GERİ YÜKLE') {
      return onNotice({ text: 'Onay için kutuya GERİ YÜKLE yaz.', error: true });
    }
    setBusy('restore');
    let backup: Backup;
    try {
      backup = await unseal(file, rpass);
    } catch {
      setBusy(null);
      return onNotice({ text: 'Şifre yanlış ya da dosya bozuk.', error: true });
    }
    // Önce şu anki durumun yedeği alınır (aynı şifreyle): geri yükleme beklenmedik sonuç verirse buna dönülebilir
    const safe = await exportTo(rpass, 'peoplehere-yedek-geri-yukleme-oncesi');
    if (!safe) {
      setBusy(null);
      return;
    }
    const res = await callBackup({ action: 'restore', data: backup });
    setBusy(null);
    if (res.error || !res.data) return onNotice({ text: res.error ?? 'Geri yükleme yapılamadı. Hiçbir şey değişmedi.', error: true });
    const sum = (res.data.summary ?? {}) as { kept_new_accounts?: number };
    setFile(null);
    setConfirmText('');
    setRpass('');
    if (fileRef.current) fileRef.current.value = '';
    onNotice({
      text: `Yedek geri yüklendi (${when(backup.created_at)} tarihli). Yedekten sonra açılan ${sum.kept_new_accounts ?? 0} hesap korundu. Geri yükleme öncesi yedeği de bilgisayarına indi.`,
      error: false,
    });
  }

  const total = file ? Object.values(file.counts ?? {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <section>
      <h2>Yedekleme</h2>
      <Card>
        <h3>Yedek al</h3>
        <p className="muted small">
          Bütün veriler (üyeler, gönderiler, mesajlar, oyunlar, etkinlikler, puanlar, ayarlar) tek bir dosyaya şifreli olarak
          bilgisayarına iner. Giriş şifreleri ve resim dosyaları yedeğe girmez (resimler sunucuda durur).
        </p>
        <div className="stack">
          <input type="password" placeholder="Yedek şifresi (en az 10 karakter)" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          <input type="password" placeholder="Şifre tekrar" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          <Button disabled={busy !== null} onClick={() => void doExport()}>
            {busy === 'export' ? 'Yedek hazırlanıyor…' : 'Yedek al ve indir'}
          </Button>
          {last ? <p className="muted small">Son yedek: {when(last)}</p> : null}
          <p className="warn small">
            Şifreyi bir yere yaz: şifre sunucuya gitmez, unutursan yedek kimse tarafından açılamaz. Eski yedekleri (ör. 30
            günden eski) sil.
          </p>
        </div>
      </Card>

      <Card>
        <h3>Yedekten geri yükle</h3>
        <ul className="legal small">
          <li>Bütün içerik yedeğin alındığı ana döner; yedekten sonra eklenen gönderi, mesaj, puan vb. silinir.</li>
          <li>Yedekten sonra açılan hesaplar korunur (yalnızca o tarihten sonraki içerikleri gider).</li>
          <li>Yedekten sonra silinmiş hesaplar geri gelmez (KVKK).</li>
          <li>İşlem günlüğü ve trafik kayıtları hiç silinmez.</li>
          <li>Başlamadan önce şu anki durumun yedeği otomatik alınıp bilgisayarına iner.</li>
          <li>İşlem tek seferde yapılır: bir hata olursa hiçbir şey değişmez.</li>
        </ul>
        <div className="stack">
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => void pick(e.target.files?.[0])} />
          {file ? (
            <>
              <p className="small">
                Yedek tarihi: <strong>{when(file.created_at)}</strong> · {total} kayıt · {file.counts?.profiles ?? 0} üye ·{' '}
                {file.counts?.posts ?? 0} gönderi
              </p>
              <input type="password" placeholder="Yedeğin şifresi" value={rpass} onChange={(e) => setRpass(e.target.value)} autoComplete="off" />
              <input placeholder="Onay için GERİ YÜKLE yaz" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              <Button kind="danger" disabled={busy !== null || !rpass} onClick={() => void doRestore()}>
                {busy === 'restore' ? 'Geri yükleniyor… (sayfayı kapatma)' : 'Yedeği geri yükle'}
              </Button>
            </>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
