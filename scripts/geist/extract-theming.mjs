import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS_DIR = path.join(ROOT, 'Vercel_raw/geist-docs/vercel.com/vc-ap-b3331f/_next/static/immutable/chunks');
const OUT = path.join(ROOT, 'docs/geist/theming.md');
mkdirSync(path.dirname(OUT), { recursive: true });

const css = readdirSync(CSS_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(path.join(CSS_DIR, f), 'utf8'))
  .join('\n');

// theme of a selector: light | dark | both
function themeOf(sel) {
  if (/\.dark-theme(?!\s*\.invert)/.test(sel) && !/html:not\(\.dark-theme\)/.test(sel)) return 'dark';
  if (/html:not\(\.dark-theme\)|:root/.test(sel)) return 'light';
  return 'both';
}

// modifier from the class chain
function modifierOf(sel) {
  const has = (s) => sel.includes(s);
  if (has('-contrast')) return 'contrast (subtle)';
  if (has('-dark')) return 'dark-fill';
  if (has('-tooltip')) return 'tooltip';
  if (has('-fill')) return 'fill (solid)';
  return 'base (outline)';
}

// { system -> color -> modifier -> { light:{}, dark:{}, both:{} } }
const data = { new: {}, legacy: {} };

const leaf = /([^{}]+)\{([^{}]*--themed-[^{}]*)\}/g;
let m;
while ((m = leaf.exec(css))) {
  const sel = m[1].trim();
  // must be a themed color rule
  const cm = sel.match(/\.geist-(new-)?themed[^,{]*\.geist-(new-)?([a-z]+)\b/);
  if (!cm) continue;
  const system = cm[1] || cm[2] ? 'new' : 'legacy';
  const color = cm[3];
  if (['themed', 'tooltip', 'toolt'].includes(color)) continue;
  const themeKind = themeOf(sel);
  const mod = modifierOf(sel);
  const vars = {};
  for (const d of m[2].split(';')) {
    const mm = d.match(/(--themed-[a-z]+)\s*:\s*(.+)/);
    if (mm) vars[mm[1].replace('--themed-', '')] = mm[2].trim();
  }
  if (!Object.keys(vars).length) continue;
  const bucket = system === 'new' ? data.new : data.legacy;
  ((bucket[color] ??= {})[mod] ??= {})[themeKind] = {
    ...(((bucket[color] ??= {})[mod] ??= {})[themeKind] || {}),
    ...vars,
  };
}

const MOD_ORDER = ['base (outline)', 'fill (solid)', 'contrast (subtle)', 'dark-fill', 'tooltip'];
function cell(v) {
  if (!v) return '—';
  const parts = ['bg', 'fg', 'border'].filter((k) => v[k]).map((k) => `${k}: \`${v[k]}\``);
  return parts.join('<br>') || '—';
}

function renderSystem(title, bucket, note) {
  let out = `## ${title}\n\n${note}\n\n`;
  const colors = Object.keys(bucket).sort();
  for (const color of colors) {
    out += `### \`.geist-${title.includes('new') ? 'new-' : ''}${color}\`\n\n`;
    out += `| Модифікатор | Light | Dark |\n|---|---|---|\n`;
    const mods = Object.keys(bucket[color]).sort(
      (a, b) => (MOD_ORDER.indexOf(a) + 1 || 99) - (MOD_ORDER.indexOf(b) + 1 || 99),
    );
    for (const mod of mods) {
      const rec = bucket[color][mod];
      const base = rec.both || {};
      let light = { ...base, ...(rec.light || {}) };
      let dark = { ...base, ...(rec.dark || {}) };
      if (!Object.keys(light).length) light = dark; // shared → mirror
      if (!Object.keys(dark).length) dark = light;
      out += `| ${mod} | ${cell(light)} | ${cell(dark)} |\n`;
    }
    out += `\n`;
  }
  return out;
}

let out = `# Geist — themed-система варіантів (кольори компонентів)\n\n`;
out += `> Автозгенеровано з CSS-бандлів Geist скриптом \`scripts/geist/extract-theming.mjs\` (\`npm run geist:theming\`). Не редагувати вручну.\n`;
out += `> **Це закриває 🟡 «тонкі» компоненти**, чиї варіанти-кольори живуть у CSS, а не в класах HTML (Button, Toast, Note, Alert, Tooltip тощо).\n`;
out += `> Компонент застосовує \`.geist-new-themed\` + один клас кольору (\`.geist-new-<color>\`) ± модифікатор (\`-fill\`/\`-contrast\`/\`-dark\`), а CSS виставляє \`--themed-bg/fg/border\`. Значення \`var(--ds-*)\`/\`var(--geist-*)\` дивись у [tokens.md](tokens.md).\n\n`;
out += `**Модифікатори:** \`base\` = аутлайн (прозорий фон + кольорова рамка/текст) · \`-fill\` = суцільна заливка · \`-contrast\` = приглушена (світлий фон + темний текст) · \`-dark\` = темніша заливка.\n\n`;
out += `**Як застосувати інлайн (Tailwind-arbitrary, як у Button):** \`[--themed-bg:var(--ds-<color>)] [--themed-fg:var(--ds-contrast-fg)]\` — компонент читає ці CSS-змінні.\n\n`;

out += renderSystem('new themed (актуальна, на `--ds-*`)', data.new, 'Сучасна система. «success» = синій (default-дія), «error» = червоний, «warning» = амбер.');
out += renderSystem('legacy themed (стара, на `--geist-*`)', data.legacy, 'Стара система (сумісність). Мапиться на legacy `--geist-*` семантичні токени.');

writeFileSync(OUT, out);
const nc = Object.keys(data.new).length, lc = Object.keys(data.legacy).length;
console.log(`themed colors — new: ${nc}, legacy: ${lc}`);
console.log('new:', Object.keys(data.new).sort().join(', '));
console.log('written ->', OUT);
