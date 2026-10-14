// supabase/schema.sql dosyasını, Supabase SQL Editor'ın kabul ettiği boyutta parçalara böler
// (supabase/parcalar/1.sql, 2.sql, ...). Komutlar ortadan bölünmez: yalnızca en dıştaki ';' işaretlerinden kesilir
// (yazı, yorum ve $$ ... $$ fonksiyon gövdelerinin içindekiler sayılmaz). Komut: node tools/sema-parcala.mjs
import fs from 'node:fs';
import path from 'node:path';

const LIMIT = 380_000; // her parça en çok ~380 KB
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');

// Komutlara ayır
const stmts = [];
let start = 0;
let i = 0;
const n = src.length;
while (i < n) {
  const c = src[i];
  const d = src[i + 1];
  if (c === '-' && d === '-') {
    const e = src.indexOf('\n', i);
    i = e < 0 ? n : e + 1;
  } else if (c === '/' && d === '*') {
    const e = src.indexOf('*/', i + 2);
    i = e < 0 ? n : e + 2;
  } else if (c === "'") {
    i++;
    while (i < n) {
      if (src[i] === "'" && src[i + 1] === "'") i += 2;
      else if (src[i] === "'") {
        i++;
        break;
      } else i++;
    }
  } else if (c === '"') {
    const e = src.indexOf('"', i + 1);
    i = e < 0 ? n : e + 1;
  } else if (c === '$') {
    const m = /^\$[A-Za-z_]*\$/.exec(src.slice(i, i + 64));
    if (m) {
      const e = src.indexOf(m[0], i + m[0].length);
      if (e < 0) throw new Error(`Kapanmayan ${m[0]} (karakter ${i})`);
      i = e + m[0].length;
    } else i++;
  } else if (c === ';') {
    i++;
    stmts.push(src.slice(start, i));
    start = i;
  } else i++;
}
const tail = src.slice(start);
if (tail.trim()) stmts.push(tail);

// Parçalara topla
const parts = [];
let cur = '';
for (const s of stmts) {
  if (cur.length + s.length > LIMIT && cur.trim()) {
    parts.push(cur);
    cur = '';
  }
  cur += s;
}
if (cur.trim()) parts.push(cur);

const dir = path.join(root, 'supabase/parcalar');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
parts.forEach((p, k) => {
  const head =
    `-- PARÇA ${k + 1} / ${parts.length} — supabase/schema.sql dosyasından otomatik üretildi, elle değiştirme.\n` +
    `-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run. Parçaları 1'den başlayarak SIRAYLA çalıştır.\n\n`;
  fs.writeFileSync(path.join(dir, `${k + 1}.sql`), head + p.replace(/^\n+/, '') + '\n');
});
if (parts.join('') !== src.slice(0, src.length - (tail.trim() ? 0 : tail.length))) {
  throw new Error('Parçalar birleşince orijinal dosya çıkmıyor');
}
console.log(`${parts.length} parça: ${parts.map((p) => Math.round(p.length / 1024) + ' KB').join(', ')}`);
