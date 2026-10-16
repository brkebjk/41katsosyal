import { useCallback, useEffect, useState } from 'react';

import { publicUrl, supabase } from '../supabase';
import { Button, Card, Empty, errText, when, type Notice } from '../ui';

const CITIES: { value: string; label: string }[] = [
  { value: 'istanbul', label: 'İstanbul' },
  { value: 'kocaeli', label: 'Kocaeli' },
  { value: 'izmir', label: 'İzmir' },
];

const BANNER_COLORS: { value: string; label: string; hex: string }[] = [
  { value: 'primary', label: 'Turkuaz (ana renk)', hex: '#0E9F93' },
  { value: 'accent', label: 'Lavanta', hex: '#5A67E8' },
  { value: 'highlight', label: 'Sarı', hex: '#FFC83D' },
  { value: 'event', label: 'Etkinlik turkuazı', hex: '#35D6C3' },
  { value: 'game', label: 'Oyun moru', hex: '#A98BFF' },
  { value: 'venue', label: 'Mekân mercanı', hex: '#FF9F6B' },
];

const FEATURES: { key: string; label: string; note: string }[] = [
  { key: 'feature_akis', label: 'Akış', note: 'Kapalıyken Akış sekmesi gizlenir, gönderi ve yorum yazılamaz.' },
  { key: 'feature_etkinlik_acma', label: 'Etkinlik açma', note: 'Kapalıyken üyeler etkinlik açamaz (katılım sürer).' },
  { key: 'feature_yan_yana', label: 'Yan yana oyunlar', note: 'Etkinlik oyunları dahil yan yana odalar kapanır.' },
  { key: 'feature_uzaktan', label: 'Uzaktan oyunlar', note: 'Köpekbalığı ve Vampir–Köylü eşleştirmesi kapanır.' },
  { key: 'feature_bilgi_yarismasi', label: 'Bilgi Yarışması', note: 'Bütün Bilgi Yarışması modları kapanır.' },
  { key: 'feature_mesajlar', label: 'Özel mesajlar', note: 'Yeni mesaj yazılamaz, mesaj kutusu açılmaz.' },
  { key: 'feature_hazine', label: 'Hazine avı', note: 'Hazine kodu girilemez.' },
];

/** Hazır özel gün temaları (istersen renkleri değiştirip kaydedebilirsin) */
const PRESETS: { name: string; primary: string; accent: string; highlight: string }[] = [
  { name: 'Yılbaşı', primary: '#D62839', accent: '#1B998B', highlight: '#F5C518' },
  { name: '23 Nisan', primary: '#E30A17', accent: '#2E86DE', highlight: '#F9A825' },
  { name: '29 Ekim Cumhuriyet Bayramı', primary: '#E30A17', accent: '#B71C1C', highlight: '#F5C518' },
  { name: 'Ramazan Bayramı', primary: '#2E7D6B', accent: '#7E57C2', highlight: '#E0B04A' },
  { name: 'Sevgililer Günü', primary: '#E0457B', accent: '#9C27B0', highlight: '#FF8A65' },
  { name: 'Yaz', primary: '#00A8E8', accent: '#FF6F59', highlight: '#FFD166' },
];

type Banner = {
  id: string;
  text: string;
  link: string | null;
  color: string;
  city: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
};

type Theme = { name?: string; primary?: string; accent?: string; highlight?: string; from?: string; to?: string };

const cityLabel = (c: string | null) => (c ? (CITIES.find((x) => x.value === c)?.label ?? c) : 'Bütün şehirler');
/** <input type="datetime-local"> değerini ISO zamana çevirir (boşsa null) */
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
/** ISO zamanı <input type="date"> değerine çevirir */
const toDate = (iso?: string) => (iso ? iso.slice(0, 10) : '');

/**
 * Görünüm: kampanya / duyuru şeridi, özel gün teması, şehir açılış görselleri ve özellik aç/kapa. Değişiklikler
 * uygulamaya açılışta ve şehir değişince ulaşır; özel gün teması üyenin telefonunda bir sonraki açılışta görünür.
 */
export function LookPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  return (
    <section>
      <h2>Görünüm</h2>
      <p className="muted small">
        Buradaki değişiklikler uygulamaya açılışta ulaşır. Özel gün teması üyenin telefonunda bir sonraki açılışta görünür.
      </p>
      <Banners onNotice={onNotice} />
      <ThemeCard onNotice={onNotice} />
      <Splash onNotice={onNotice} />
      <Features onNotice={onNotice} />
    </section>
  );
}

function Banners({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Banner[] | null>(null);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [color, setColor] = useState('primary');
  const [city, setCity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('promo_banners').select('*').order('created_at', { ascending: false });
    if (error) onNotice({ text: errText(error, 'Şeritler okunamadı.'), error: true });
    setRows((data as Banner[]) ?? []);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!supabase || busy) return;
    const t = text.trim();
    const l = link.trim();
    if (t.length < 3) return onNotice({ text: 'Şerit yazısı en az 3 karakter olmalı.', error: true });
    if (l && !l.startsWith('/') && !l.startsWith('https://')) {
      return onNotice({ text: 'Bağlantı “/” ile (uygulama içi) ya da “https://” ile başlamalı.', error: true });
    }
    setBusy(true);
    const { error } = await supabase.from('promo_banners').insert({
      text: t,
      link: l || null,
      color,
      city: city || null,
      starts_at: toIso(from),
      ends_at: toIso(to),
    });
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Şerit eklenemedi.'), error: true });
    setText('');
    setLink('');
    setFrom('');
    setTo('');
    onNotice({ text: 'Şerit yayında.', error: false });
    void load();
  }

  async function toggle(b: Banner) {
    if (!supabase) return;
    const { error } = await supabase.from('promo_banners').update({ active: !b.active }).eq('id', b.id);
    if (error) return onNotice({ text: errText(error), error: true });
    void load();
  }

  async function remove(b: Banner) {
    if (!supabase || !window.confirm('Şerit silinecek. Emin misin?')) return;
    const { error } = await supabase.from('promo_banners').delete().eq('id', b.id);
    if (error) return onNotice({ text: errText(error), error: true });
    void load();
  }

  return (
    <Card>
      <h3>Kampanya / duyuru şeridi</h3>
      <p className="muted small">
        Harita ve Akış ekranında ince bir şerit olarak görünür; üye çarpıyla kendi telefonunda kapatabilir. Aynı anda en
        yeni şerit gösterilir. Bağlantı örnekleri: /events (Etkinlik), /games (Oyun), /kurallar, /oduller ya da https://…
      </p>
      <div className="stack">
        <input placeholder="Şerit yazısı (en çok 140 karakter)" value={text} maxLength={140} onChange={(e) => setText(e.target.value)} />
        <input placeholder="Bağlantı (isteğe bağlı)" value={link} onChange={(e) => setLink(e.target.value)} />
        <label>
          Renk
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            {BANNER_COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Şehir
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Bütün şehirler</option>
            {CITIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Başlangıç (isteğe bağlı)
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bitiş (isteğe bağlı)
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button disabled={busy || text.trim().length < 3} onClick={() => void create()}>
          Şeridi yayınla
        </Button>
      </div>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Şerit yok.</Empty>
      ) : (
        rows.map((b) => (
          <div key={b.id} className="card">
            <div className="row-head">
              <strong>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    marginRight: 6,
                    background: BANNER_COLORS.find((c) => c.value === b.color)?.hex ?? '#888',
                  }}
                />
                {b.text}
              </strong>
              <span className="muted small">{b.active ? 'yayında' : 'kapalı'}</span>
            </div>
            <p className="muted small">
              {[
                cityLabel(b.city),
                b.link ? `bağlantı: ${b.link}` : null,
                b.starts_at ? `başlangıç ${when(b.starts_at)}` : null,
                b.ends_at ? `bitiş ${when(b.ends_at)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="actions">
              <Button kind="ghost" onClick={() => void toggle(b)}>
                {b.active ? 'Kapat' : 'Yeniden yayınla'}
              </Button>
              <Button kind="danger" onClick={() => void remove(b)}>
                Sil
              </Button>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

async function readSetting<T>(key: string): Promise<T | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  return ((data as { value: T } | null)?.value ?? null) as T | null;
}

async function writeSetting(key: string, value: unknown): Promise<string | null> {
  if (!supabase) return 'Bağlantı yok.';
  const { error } = await supabase.from('app_settings').update({ value }).eq('key', key);
  return error ? errText(error, 'Kaydedilemedi.') : null;
}

function ThemeCard({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [theme, setTheme] = useState<Theme>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readSetting<Theme>('look_theme').then((t) => {
      setTheme(t && typeof t === 'object' ? t : {});
      setLoaded(true);
    });
  }, []);

  const on = Boolean(theme.primary || theme.accent || theme.highlight);

  async function save(next: Theme) {
    const clean: Theme = {};
    if (next.name) clean.name = next.name.slice(0, 60);
    for (const k of ['primary', 'accent', 'highlight'] as const) {
      if (next[k] && /^#[0-9A-Fa-f]{6}$/.test(next[k] as string)) clean[k] = next[k];
    }
    if (next.from) clean.from = next.from;
    if (next.to) clean.to = next.to;
    const err = await writeSetting('look_theme', clean);
    if (err) return onNotice({ text: err, error: true });
    setTheme(clean);
    onNotice({
      text: clean.primary || clean.accent || clean.highlight ? 'Tema kaydedildi.' : 'Özel gün teması kapatıldı.',
      error: false,
    });
  }

  if (!loaded) return null;
  return (
    <Card>
      <h3>Özel gün teması</h3>
      <p className="muted small">
        Uygulamanın ana rengi, ikinci vurgu rengi ve dikkat rengi geçici olarak değişir. Tarih verirsen yalnızca o aralıkta
        uygulanır. Üye uygulamayı bir sonraki açışında yeni renkleri görür.
      </p>
      <div className="actions">
        {PRESETS.map((p) => (
          <Button key={p.name} kind="ghost" onClick={() => setTheme({ ...theme, ...p })}>
            {p.name}
          </Button>
        ))}
      </div>
      <div className="stack">
        <input placeholder="Tema adı (ör. Yılbaşı)" value={theme.name ?? ''} onChange={(e) => setTheme({ ...theme, name: e.target.value })} />
        {(['primary', 'accent', 'highlight'] as const).map((k) => (
          <label key={k}>
            {k === 'primary' ? 'Ana renk (düğmeler, seçili sekme)' : k === 'accent' ? 'İkinci vurgu' : 'Dikkat rengi (puan, göstergeler)'}
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={theme[k] ?? '#0E9F93'}
                onChange={(e) => setTheme({ ...theme, [k]: e.target.value.toUpperCase() })}
                style={{ width: 56, padding: 2 }}
              />
              <span className="muted small">{theme[k] ?? 'değişmez'}</span>
              {theme[k] ? (
                <button className="link" onClick={() => setTheme({ ...theme, [k]: undefined })}>
                  Kaldır
                </button>
              ) : null}
            </span>
          </label>
        ))}
        <label>
          Başlangıç günü (isteğe bağlı)
          <input type="date" value={toDate(theme.from)} onChange={(e) => setTheme({ ...theme, from: e.target.value ? `${e.target.value}T00:00:00+03:00` : undefined })} />
        </label>
        <label>
          Bitiş günü (isteğe bağlı)
          <input type="date" value={toDate(theme.to)} onChange={(e) => setTheme({ ...theme, to: e.target.value ? `${e.target.value}T23:59:59+03:00` : undefined })} />
        </label>
        <div className="actions">
          <Button onClick={() => void save(theme)}>Temayı kaydet</Button>
          {on ? (
            <Button kind="ghost" onClick={() => void save({})}>
              Özel gün temasını kapat
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Splash({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await readSetting<Record<string, string>>('look_splash');
    setMap(v && typeof v === 'object' ? v : {});
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(city: string, file: File | undefined) {
    if (!supabase || !file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return onNotice({ text: 'Yalnızca jpg, png ya da webp yükleyebilirsin.', error: true });
    }
    if (file.size > 3 * 1024 * 1024) return onNotice({ text: 'Görsel en çok 3 MB olabilir.', error: true });
    setBusy(city);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `splash/${city}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('app-look').upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(null);
      return onNotice({ text: errText(up.error, 'Görsel yüklenemedi.'), error: true });
    }
    const old = map[city];
    const next = { ...map, [city]: path };
    const err = await writeSetting('look_splash', next);
    setBusy(null);
    if (err) return onNotice({ text: err, error: true });
    if (old) await supabase.storage.from('app-look').remove([old]);
    setMap(next);
    onNotice({ text: `${cityLabel(city)} açılış görseli kaydedildi.`, error: false });
  }

  async function remove(city: string) {
    if (!supabase || !window.confirm(`${cityLabel(city)} açılış görseli kaldırılacak. Emin misin?`)) return;
    const old = map[city];
    const next = { ...map };
    delete next[city];
    const err = await writeSetting('look_splash', next);
    if (err) return onNotice({ text: err, error: true });
    if (old) await supabase.storage.from('app-look').remove([old]);
    setMap(next);
  }

  return (
    <Card>
      <h3>Şehir açılış görselleri</h3>
      <p className="muted small">
        Uygulama açılınca şehrin görseli 2 saniye tam ekran görünür (dokununca kapanır). Dikey (telefon boyu) bir görsel
        seç; en çok 3 MB, jpg / png / webp.
      </p>
      <div className="grid">
        {CITIES.map((c) => {
          const url = publicUrl('app-look', map[c.value]);
          return (
            <div key={c.value} className="card">
              <strong>{c.label}</strong>
              {url ? (
                <img src={url} alt={`${c.label} açılış görseli`} style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />
              ) : (
                <p className="muted small">Görsel yok.</p>
              )}
              <label>
                {url ? 'Değiştir' : 'Yükle'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy !== null}
                  onChange={(e) => void upload(c.value, e.target.files?.[0])}
                />
              </label>
              {url ? (
                <div className="actions">
                  <Button kind="danger" onClick={() => void remove(c.value)}>
                    Kaldır
                  </Button>
                </div>
              ) : null}
              {busy === c.value ? <p className="muted small">Yükleniyor…</p> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Features({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [vals, setVals] = useState<Record<string, boolean> | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('app_settings').select('key, value').like('key', 'feature\\_%');
    if (error) onNotice({ text: errText(error, 'Özellikler okunamadı.'), error: true });
    const out: Record<string, boolean> = {};
    for (const r of (data as { key: string; value: unknown }[]) ?? []) out[r.key] = r.value !== false && r.value !== 'false';
    setVals(out);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function set(key: string, on: boolean) {
    const f = FEATURES.find((x) => x.key === key);
    if (!on && !window.confirm(`“${f?.label}” bütün üyeler için kapanacak (moderatörler kullanmaya devam eder). Emin misin?`)) return;
    const err = await writeSetting(key, on);
    if (err) return onNotice({ text: err, error: true });
    onNotice({ text: `${f?.label} ${on ? 'açıldı' : 'kapatıldı'}.`, error: false });
    void load();
  }

  return (
    <Card>
      <h3>Özellik aç / kapa</h3>
      <p className="muted small">
        Bir bölümü güncelleme göndermeden kapatıp açabilirsin. Kapalı bölüme sunucu da izin vermez; moderatörler denemek
        için kullanmaya devam eder.
      </p>
      {vals === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : (
        FEATURES.map((f) => {
          const on = vals[f.key] !== false;
          return (
            <div key={f.key} className="row-head" style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #ddd)' }}>
              <span>
                <strong>{f.label}</strong>
                <br />
                <span className="muted small">{f.note}</span>
              </span>
              <Button kind={on ? 'ghost' : 'primary'} onClick={() => void set(f.key, !on)}>
                {on ? 'Açık · kapat' : 'Kapalı · aç'}
              </Button>
            </div>
          );
        })
      )}
    </Card>
  );
}
