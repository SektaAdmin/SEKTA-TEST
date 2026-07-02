import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS_DIR = path.join(ROOT, 'Vercel_raw/geist-docs/vercel.com/vc-ap-b3331f/_next/static/immutable/chunks');
const OUT = path.join(ROOT, 'docs/geist/tokens.md');
mkdirSync(path.dirname(OUT), { recursive: true });

const css = readdirSync(CSS_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(path.join(CSS_DIR, f), 'utf8'))
  .join('\n');

// light/dark -> Map(token -> value)
const store = { light: new Map(), dark: new Map() };

// classify a selector into which theme roots it defines
function themesOf(selector) {
  const out = new Set();
  for (let frag of selector.split(',')) {
    frag = frag.trim();
    if (frag === ':root' || frag === ':host' || frag === '.light-theme') out.add('light');
    else if (frag === '.dark' || frag === '.dark-theme') out.add('dark');
    // descendant combos (.dark .invert-theme, .dark .geist-*) are NOT roots -> ignored
  }
  return out;
}

// prefer concrete hex; then hsla/rgb/px/number; lab/oklch/color() only as last resort
function rank(v) {
  if (/^#([0-9a-f]{3,8})$/i.test(v)) return 0;
  if (/^(hsla?|rgba?)\(/i.test(v) && !v.includes('var(')) return 1;
  if (/^var\(/.test(v)) return 2;
  if (/lab\(|oklch\(|color\(/i.test(v)) return 5;
  return 3; // px, numbers, keywords, cubic-bezier...
}

// leaf blocks: selector text with no nested braces, then a body with no braces
const leaf = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = leaf.exec(css))) {
  const selector = m[1].trim();
  const themes = themesOf(selector);
  if (!themes.size) continue;
  for (const decl of m[2].split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!name.startsWith('--') || !value) continue;
    for (const t of themes) {
      const cur = store[t].get(name);
      if (cur === undefined || rank(value) < rank(cur)) store[t].set(name, value);
    }
  }
}

// group key from token name
function groupOf(name) {
  const n = name.replace(/^--/, '');
  const COLORS = ['gray', 'red', 'blue', 'amber', 'purple', 'teal', 'green', 'pink'];
  for (const c of COLORS) {
    if (n === `ds-${c}` || n.startsWith(`ds-${c}-`)) {
      return n.includes('alpha') ? `color · ${c} (alpha)` : `color · ${c}`;
    }
  }
  if (/^ds-(background|page|overlay|contrast|black|white)/.test(n)) return 'surfaces & contrast';
  if (/^ds-focus/.test(n)) return 'focus ring';
  if (/^ds-shadow/.test(n)) return 'shadow';
  if (/^ds-motion|^default-transition|^animate-/.test(n)) return 'motion';
  if (/^geist-space|^geist-gap/.test(n)) return 'spacing';
  if (/radius/.test(n)) return 'radius';
  if (/^text-|^leading-|^tracking-|font-family|^default-font/.test(n)) return 'typography';
  if (/^breakpoint-|^ds-page-width|^blur-/.test(n)) return 'layout & breakpoints';
  if (/^geist-(foreground|background|selection|success|error|warning|violet|cyan|highlight|secondary|link|marketing)/.test(n)) return 'geist semantic (legacy)';
  if (/^accents-/.test(n)) return 'accents (legacy)';
  if (/^geist-/.test(n)) return 'geist misc (legacy)';
  return 'other';
}

// only keep tokens that differ or need documenting; skip lab/oklch-only leftovers
function usable(v) {
  return v !== undefined && !/lab\(|oklch\(|color\(/i.test(v);
}

// union of all token names
const names = new Set([...store.light.keys(), ...store.dark.keys()]);
const groups = new Map();
for (const name of names) {
  const g = groupOf(name);
  if (!groups.has(g)) groups.set(g, []);
  const l = store.light.get(name);
  const d = store.dark.get(name);
  groups.get(g).push({ name, light: usable(l) ? l : l ?? '', dark: usable(d) ? d : d ?? '' });
}

// stable numeric-aware sort inside group
function natCompare(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

// order groups: geometry first, then colors, then legacy
const GROUP_ORDER = [
  'typography', 'spacing', 'radius', 'shadow', 'layout & breakpoints',
  'focus ring', 'motion', 'surfaces & contrast',
  'color · gray', 'color · gray (alpha)',
  'color · blue', 'color · red', 'color · amber', 'color · green',
  'color · purple', 'color · teal', 'color · pink',
  'geist semantic (legacy)', 'accents (legacy)', 'geist misc (legacy)', 'other',
];
const orderedKeys = [...groups.keys()].sort((a, b) => {
  const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});

let out = `# Geist Design Tokens\n\n`;
out += `> Автозгенеровано з CSS-бандлів Geist (\`Vercel_raw/geist-docs\`) скриптом \`scripts/geist/extract-tokens.mjs\` (\`npm run geist:tokens\`).\n`;
out += `> Значення light/dark. \`var(--x)\` = аліас на інший токен. lab()/oklch()-дублікати відкинуто на користь hex.\n`;
out += `> **Не редагувати вручну** — перегенерувати зі скрипта.\n\n`;
out += `**Джерело:** 3 CSS-файли, ${names.size} унікальних токенів.\n\n`;

for (const g of orderedKeys) {
  const rows = groups.get(g).sort(natCompare);
  out += `## ${g}\n\n`;
  out += `| Токен | Light | Dark |\n|---|---|---|\n`;
  for (const r of rows) {
    const L = r.light ? `\`${r.light}\`` : '—';
    const D = r.dark ? `\`${r.dark}\`` : '—';
    out += `| \`${r.name}\` | ${L} | ${D} |\n`;
  }
  out += `\n`;
}

writeFileSync(OUT, out);
console.log(`tokens: ${names.size}, groups: ${orderedKeys.length}`);
console.log('groups:', orderedKeys.join(' | '));
console.log('written ->', OUT);
