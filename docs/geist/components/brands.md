# Brands

> Автозгенеровано з `Vercel_raw/geist-docs/vercel.com/geist/brands.html` скриптом `scripts/geist/extract-components.mjs` (`npm run geist:components`). Не редагувати вручну.
> Класи — автентичні Geist (Tailwind), значення дивись у [tokens.md](../tokens.md).

## Структура сторінки (розділи)

- Brands
  - Vercel
  - Symbol & unicode
  - Spacing considerations
  - Next.js
  - Next.js symbol
  - Next.js spelling
  - Turbo
  - Turbo symbol
  - Turborepo
  - Turborepo Symbol
  - Turbopack
  - Turbopack Symbol
  - v0
  - AI SDK
  - General Information
  - Usage
  - Misuse

## ⚠️ Варіанти-кольори — у themed-системі, не в HTML

Цей компонент керує варіантами через `data-*`-атрибути + themed-CSS (`.geist-new-<color>-fill/-contrast`, `[--themed-bg:var(--ds-<color>)]`), тому у відрендереному HTML класи однакові для всіх варіантів. **Кольори варіантів (base/fill/contrast/dark, light+dark) — у [theming.md](../theming.md).** Структуру (розмір/радіус/відступи) цей компонент тримає як single-instance utility-класи у відрендереному HTML сторінки (не згруповано тут); значення токенів — у [tokens.md](../tokens.md).

## Приклади коду зі сторінки

```
import { LogoVercelLogotype } from '@vercel/geistcn-assets/logos' ; < LogoVercelLogotype height = { 32 } />
```

```
import { LogoVercel } from '@vercel/geistcn-assets/logos' ; < LogoVercel height = { 16 } />
```

```
import { LogoNextjsLogotype } from '@vercel/geistcn-assets/logos' ; < LogoNextjsLogotype height = { 50 } />
```

```
import { LogoNextJs } from '@vercel/geistcn-assets/logos' ; < LogoNextJs height = { 40 } />
```

```
import { LogoTurboLogotype } from '@vercel/geistcn-assets/logos' ; < LogoTurboLogotype height = { 50 } />
```

```
import { LogoTurbo } from '@vercel/geistcn-assets/logos' ; < LogoTurbo height = { 40 } />
```

```
import { LogoTurborepoLogotype } from '@vercel/geistcn-assets/logos' ; < LogoTurborepoLogotype height = { 50 } />
```

```
import { LogoTurbopackLogotype } from '@vercel/geistcn-assets/logos' ; < LogoTurbopackLogotype height = { 50 } />
```

```
import { LogoTurbopack } from '@vercel/geistcn-assets/logos' ; < LogoTurbopack height = { 40 } />
```

```
import { LogoAiSdk } from '@vercel/geistcn-assets/logos' ; < LogoAiSdk />
```

