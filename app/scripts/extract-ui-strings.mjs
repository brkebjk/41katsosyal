// GEÇİCİ (yazı düzenleme modu): uygulamadaki sabit yazıların listesini çıkarır → src/lib/uiStrings.generated.ts
// Yalnızca bu listedeki yazılar moderatörce düzenlenebilir; üye içerikleri (gönderi, ad, rumuz) düzenlenemez.
// Çalıştırma: app klasöründe `node scripts/extract-ui-strings.mjs`
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(SRC, 'lib', 'uiStrings.generated.ts');
const out = new Set();

/** JSX metninin derlenmiş hali (React'in boşluk kuralları) */
function jsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let res = '';
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, ' ');
    if (i !== 0) l = l.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) l = l.replace(/[ ]+$/, '');
    if (l) {
      if (res && i !== 0) res += ' ';
      res += l;
    }
  });
  return res;
}

function add(s) {
  if (!s || s.length < 1 || s.length > 2000) return;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) return;
  out.add(s);
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.endsWith('.generated.ts')) scan(p);
  }
}

function scan(file) {
  const code = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // import yolları ve tür adları yazı değildir
      if (!ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isLiteralTypeNode(n.parent)) add(n.text);
    } else if (ts.isJsxText(n)) {
      add(jsxText(n.text));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

walk(SRC);
const list = [...out].sort();
fs.writeFileSync(
  OUT,
  '// GEÇİCİ (yazı düzenleme modu) — scripts/extract-ui-strings.mjs ile üretildi, elle değiştirme.\n' +
    '// Uygulamadaki sabit yazılar: yalnızca bunlar moderatörce düzenlenebilir.\n' +
    `export const UI_STRINGS: ReadonlySet<string> = new Set(${JSON.stringify(list)});\n`,
);
console.log(`${list.length} yazı, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
