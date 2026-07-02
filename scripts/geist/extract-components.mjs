import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGES_DIR = path.join(ROOT, 'Vercel_raw/geist-docs/vercel.com/geist');
const OUT_DIR = path.join(ROOT, 'docs/geist/components');
mkdirSync(OUT_DIR, { recursive: true });

// which pages to build (arg list) or "all"
const arg = process.argv[2] || 'all';
let pages = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'));
if (arg !== 'all') {
  const want = arg.split(',').map((s) => s.trim());
  pages = pages.filter((f) => want.includes(f.replace('.html', '')));
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function stripTags(s) {
  return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// scope to the doc content: from first <h1 to end of <main> (sidebar nav sits before h1)
function contentRegion(html) {
  const a = html.indexOf('<h1');
  if (a < 0) return html;
  const b = html.lastIndexOf('</main>');
  return html.slice(a, b > a ? b : html.length);
}

// a single class token is "color-ish" (a variant axis) if it paints with a palette/var
// covers: bg-(--ds-gray-900), dark-theme:bg-(--ds-gray-500), bg-[var(--geist-warning)],
//         bg-blue-200, text-black — with optional state prefixes (hover:/dark-theme:/…)
const COLORISH = /^(?:[a-z-]+(?:\[[^\]]*\])?:)*(?:bg|text|border|ring|fill|from|to|via|shadow)-(?:\[var\(--[a-z0-9-]+\)\]|\(--[a-z0-9-]+\)|(?:gray|red|blue|amber|purple|teal|green|pink)-\d{1,4}|black|white)$/;
function isColorish(t) { return COLORISH.test(t); }
// does a class string carry at least one palette/var color token?
function hasColor(cls) { return cls.split(/\s+/).some(isColorish); }

// structural skeleton: class with color tokens removed (groups variants of one shape)
function shapeKey(cls) {
  return cls.split(/\s+/).filter(Boolean).filter((t) => !isColorish(t)).join(' ');
}

// group candidate class strings by shape; each group -> {base, variants}
function shapeGroups(strings, minMembers = 3) {
  const byShape = new Map();
  for (const s of strings) {
    const k = shapeKey(s);
    if (!k) continue;
    if (!byShape.has(k)) byShape.set(k, new Set());
    byShape.get(k).add(s);
  }
  const groups = [];
  for (const [shape, set] of byShape) {
    if (set.size < minMembers) continue;
    const members = [...set];
    const toks = members.map((s) => s.split(/\s+/).filter(Boolean));
    const base = toks[0].filter((t) => toks.every((set2) => set2.includes(t)));
    const baseSet = new Set(base);
    const variants = members
      .map((s) => s.split(/\s+/).filter(Boolean).filter((t) => !baseSet.has(t)).join(' '))
      .filter((v, i, a) => a.indexOf(v) === i);
    groups.push({ base, variants, count: set.size });
  }
  return groups.sort((a, b) => b.count - a.count);
}

function extract(html, slug) {
  html = contentRegion(html);
  // 1) section outline: h1-h3 clean text (drop anchor-icon svg noise)
  const headings = [];
  for (const m of html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const level = Number(m[1][1]);
    const text = stripTags(m[2]);
    if (text) headings.push({ level, text });
  }

  // 2) DOM contract: unique data-slot element signatures (data-slot anywhere in tag)
  const slots = new Map(); // slot -> { tag, variants: Map(class -> count) }
  for (const m of html.matchAll(/<([a-z0-9]+)\s([^>]*?)data-slot="([^"]+)"([^>]*)>/g)) {
    const tag = m[1];
    const slot = m[3];
    if (/^(geist-(icon|logo)|icon)$/.test(slot) || /^geist-(icon|logo)/.test(slot)) continue; // decorative svg/logo
    const attrs = m[2] + ' ' + m[4];
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [, ''])[1];
    if (!slots.has(slot)) slots.set(slot, { tag, variants: new Map() });
    const rec = slots.get(slot);
    const dc = decode(cls).trim();
    rec.variants.set(dc, (rec.variants.get(dc) || 0) + 1);
  }

  // 3) code snippets (<pre>...</pre>) — usage examples
  const snippets = [];
  for (const m of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)) {
    const code = stripTags(m[1]);
    if (code && code.length > 8) snippets.push(code);
  }

  // 4) collect gray/token classes referenced (cross-ref to tokens.md)
  const tokenRefs = new Set();
  const allClasses = [...slots.values()].flatMap((r) => [...r.variants.keys()]).join(' ');
  for (const m of allClasses.matchAll(/\b(?:bg|text|border|ring|fill|shadow|rounded)-[a-z0-9-]*(?:gray|background|blue|red|amber|green|purple|teal|pink)[a-z0-9-]*/g)) {
    tokenRefs.add(m[0]);
  }

  // 5) variant clusters: content class-strings that carry a palette/var color ref
  //    (captures badge/status-dot/button roots that don't use data-slot)
  const cand = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    const c = decode(m[1]).trim();
    if (!hasColor(c)) continue;
    if (/hover:bg-gray-100/.test(c) && /h-10|h-\[40px\]/.test(c)) continue; // stray nav link
    cand.add(c);
  }
  const groups = shapeGroups([...cand]);

  return { headings, slots, snippets, tokenRefs, groups };
}

function render(slug, data) {
  const title = slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  let out = `# ${title}\n\n`;
  out += `> Автозгенеровано з \`Vercel_raw/geist-docs/vercel.com/geist/${slug}.html\` скриптом \`scripts/geist/extract-components.mjs\` (\`npm run geist:components\`). Не редагувати вручну.\n`;
  out += `> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).\n\n`;

  // outline
  if (data.headings.length) {
    out += `## Структура сторінки (розділи)\n\n`;
    for (const h of data.headings) out += `${'  '.repeat(h.level - 1)}- ${h.text}\n`;
    out += `\n`;
  }

  // DOM contract
  if (data.slots.size) {
    out += `## DOM-контракт (data-slot → класи)\n\n`;
    for (const [slot, rec] of data.slots) {
      out += `### \`${slot}\` — \`<${rec.tag}>\`\n\n`;
      const variants = [...rec.variants.entries()].sort((a, b) => b[1] - a[1]);
      if (variants.length === 1) {
        out += `\`\`\`\n${variants[0][0] || '(без класів)'}\n\`\`\`\n\n`;
      } else {
        out += `${variants.length} варіанти класів (× = скільки разів на сторінці):\n\n`;
        for (const [cls, n] of variants) out += `- \`${cls || '(без класів)'}\` ×${n}\n`;
        out += `\n`;
      }
    }
  }

  // variant groups (badge/button/status-dot-style utility roots), by shape
  if (data.groups && data.groups.length) {
    out += `## Варіанти (утилітарні корені, згруповано за формою)\n\n`;
    data.groups.forEach((g, i) => {
      out += `### Форма ${i + 1} (${g.count} варіантів)\n\n`;
      out += `**База:**\n\n\`\`\`\n${g.base.join(' ') || '(порожня)'}\n\`\`\`\n\n`;
      out += `**Відмінності (по одному рядку на варіант):**\n\n`;
      for (const v of g.variants) out += `- \`${v || '(тільки база)'}\`\n`;
      out += `\n`;
    });
  }

  // token cross-ref
  if (data.tokenRefs.size) {
    out += `## Токен-класи, які використовує компонент\n\n`;
    out += [...data.tokenRefs].sort().map((t) => `\`${t}\``).join(' · ') + `\n\n`;
  }

  // coverage note for thin (themed/attribute-driven) components
  const rich = data.slots.size > 0 || (data.groups && data.groups.length > 0);
  if (!rich) {
    out += `## ⚠️ Варіанти-кольори — у themed-системі, не в HTML\n\n`;
    out += `Цей компонент керує варіантами через \`data-*\`-атрибути + themed-CSS `;
    out += `(\`.geist-new-<color>-fill/-contrast\`, \`[--themed-bg:var(--ds-<color>)]\`), тому `;
    out += `у відрендереному HTML класи однакові для всіх варіантів. `;
    out += `**Кольори варіантів (base/fill/contrast/dark, light+dark) — у [theming.md](../theming.md).** `;
    out += `Структуру (розмір/радіус/відступи) цей компонент тримає як single-instance utility-класи `;
    out += `у відрендереному HTML сторінки (не згруповано тут); значення токенів — у [tokens.md](../tokens.md).\n\n`;
  }

  // snippets
  if (data.snippets.length) {
    out += `## Приклади коду зі сторінки\n\n`;
    for (const s of data.snippets.slice(0, 12)) out += `\`\`\`\n${s}\n\`\`\`\n\n`;
  }

  return out;
}

const summary = [];
for (const file of pages) {
  const slug = file.replace('.html', '');
  const html = readFileSync(path.join(PAGES_DIR, file), 'utf8');
  const data = extract(html, slug);
  writeFileSync(path.join(OUT_DIR, `${slug}.md`), render(slug, data));
  const groups = data.groups ? data.groups.length : 0;
  summary.push({ slug, headings: data.headings.length, slots: data.slots.size, groups, snippets: data.snippets.length });
}

// README index with honest coverage classification (only when building the full set)
if (arg === 'all') {
  const cov = (s) =>
    s.slots > 0 ? '🟢 DOM-контракт' : s.groups > 0 ? '🟢 варіанти' : '🟡 тонкий (варіанти в CSS)';
  let idx = `# Geist — витягнута документація\n\n`;
  idx += `> Автозгенеровано зі збереженого дампу \`Vercel_raw/geist-docs\` (vercel.com/geist).\n`;
  idx += `> Скрипти: \`scripts/geist/extract-tokens.mjs\` (\`npm run geist:tokens\`), \`scripts/geist/extract-components.mjs\` (\`npm run geist:components\`).\n`;
  idx += `> **Не редагувати вручну** — перегенерувати зі скриптів.\n\n`;
  idx += `## Фундамент\n\n`;
  idx += `- [tokens.md](tokens.md) — 405 токенів (колір light/dark, spacing, radius, shadow, typography, motion).\n`;
  idx += `- [theming.md](theming.md) — themed-система варіантів (кольори компонентів: base/fill/contrast/dark × light/dark). **Закриває 🟡 «тонкі» компоненти.**\n\n`;
  idx += `## Компоненти (${summary.length})\n\n`;
  idx += `Легенда: 🟢 = структура/варіанти витягнуто з HTML · 🟡 = варіанти-кольори керуються \`data-*\`+themed-CSS `;
  idx += `(у HTML не видно) → див. [theming.md](theming.md) для їхніх кольорів.\n\n`;
  idx += `| Компонент | Розділів | data-slot | Форм-варіантів | Покриття |\n|---|---:|---:|---:|---|\n`;
  for (const s of [...summary].sort((a, b) => a.slug.localeCompare(b.slug))) {
    idx += `| [${s.slug}](components/${s.slug}.md) | ${s.headings} | ${s.slots} | ${s.groups} | ${cov(s)} |\n`;
  }
  const rich = summary.filter((s) => s.slots > 0 || s.groups > 0).length;
  idx += `\n**Підсумок покриття:** 🟢 ${rich} компонентів зі структурою/варіантами з HTML · `;
  idx += `🟡 ${summary.length - rich} themed (структура з HTML, кольори варіантів — у [theming.md](theming.md)).\n`;
  writeFileSync(path.join(OUT_DIR, '..', 'README.md'), idx);
}

console.log(`built ${summary.length} component doc(s):`);
const rich = summary.filter((s) => s.slots > 0 || s.groups > 0);
console.log(`  🟢 rich: ${rich.length}   🟡 thin: ${summary.length - rich.length}`);
for (const s of summary.filter((s) => s.slots || s.groups)) {
  console.log(`  🟢 ${s.slug}: ${s.slots} slots, ${s.groups} groups`);
}
