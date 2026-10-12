#!/usr/bin/env node
// 41. Kat Sosyal — indirme boyutu ölçümü
//
// Kullanım (proje klasöründen):
//   node tools/boyut-olc.mjs            -> android + ios paketini derler, tablo basar
//   node tools/boyut-olc.mjs --json     -> sonucu JSON olarak da yazar (boyut-gecmisi için)
//
// Ne ölçer? `expo export` ile üretilen JavaScript paketi (Hermes) + görseller + yazı tipleri.
// Bu, uygulamanın KENDİ parçasıdır. Mağazadan inen dosya ayrıca telefonun/React Native'in hazır
// parçalarını (yaklaşık 25-35 MB, bkz. BOYUT_TAKIBI.md) ve sıkıştırmayı içerir; o kısım burada ölçülemez.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const appDir = resolve(import.meta.dirname, '..', 'app');
const asJson = process.argv.includes('--json');
const mb = (n) => (n / 1024 / 1024).toFixed(2).replace('.', ',') + ' MB';

const result = {};
const work = mkdtempSync(join(tmpdir(), 'kat41-boyut-'));

for (const platform of ['android', 'ios']) {
  const out = join(work, platform);
  console.log(`\n${platform} paketi derleniyor (1-2 dakika sürer)...`);
  execFileSync('npx', ['expo', 'export', '--platform', platform, '--output-dir', out], {
    cwd: appDir,
    stdio: 'ignore',
    env: {
      ...process.env,
      CI: '1',
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'olcum',
    },
  });
  const meta = JSON.parse(readFileSync(join(out, 'metadata.json'), 'utf8')).fileMetadata[platform];
  const bundleBytes = statSync(join(out, meta.bundle)).size;
  const kinds = {};
  const files = [];
  for (const a of meta.assets) {
    const size = statSync(join(out, a.path)).size;
    const kind =
      a.ext === 'ttf' || a.ext === 'otf'
        ? 'Yazı tipleri'
        : ['png', 'jpg', 'jpeg', 'webp'].includes(a.ext)
          ? 'Görseller'
          : 'Diğer';
    kinds[kind] = (kinds[kind] ?? 0) + size;
    files.push({ size, ext: a.ext, path: a.path });
  }
  const assetBytes = Object.values(kinds).reduce((s, n) => s + n, 0);
  const raw = bundleBytes + assetBytes;
  // Mağaza paketi zip benzeri sıkıştırır; PNG/JPG/TTF'nin çoğu zaten sıkışık olduğundan kabaca bir tahmin:
  const gz = gzipSync(readFileSync(join(out, meta.bundle))).length;
  const approxStore =
    gz + (kinds['Görseller'] ?? 0) + Math.round((kinds['Yazı tipleri'] ?? 0) * 0.55) + (kinds['Diğer'] ?? 0);
  result[platform] = {
    bundleBytes,
    kinds,
    assetBytes,
    raw,
    approxStore,
    topFiles: files.sort((a, b) => b.size - a.size).slice(0, 5),
  };
  console.log(`  Kod (Hermes)      : ${mb(bundleBytes)}`);
  for (const [k, v] of Object.entries(kinds)) console.log(`  ${k.padEnd(17)} : ${mb(v)}`);
  console.log(`  TOPLAM (ham)      : ${mb(raw)}`);
  console.log(`  Sıkıştırılmış tah.: ${mb(approxStore)}`);
}

// Kaynak görsellerin klasör bazında dökümü (hangi grup kaç MB?)
const imgRoot = join(appDir, 'assets', 'images');
if (existsSync(imgRoot)) {
  console.log('\nGörsel klasörleri (kaynak):');
  const dirs = execFileSync('du', ['-sb', ...['avatars', 'games', 'vampire'].map((d) => join(imgRoot, d))], {
    encoding: 'utf8',
  });
  for (const line of dirs.trim().split('\n')) {
    const [bytes, p] = line.split('\t');
    console.log(`  ${p.split('/').pop().padEnd(10)} ${mb(Number(bytes))}`);
  }
}

if (asJson) {
  const file = join(resolve(import.meta.dirname, '..'), 'boyut-son-olcum.json');
  writeFileSync(file, JSON.stringify({ tarih: new Date().toISOString(), ...result }, null, 2));
  console.log(`\nSonuç yazıldı: ${file}`);
}
rmSync(work, { recursive: true, force: true });
