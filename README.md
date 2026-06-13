# Sekta CRM

CRM система для студії танців. Next.js 14 + Supabase.

## Швидкий старт

### 1. Встановити залежності

```bash
npm install
```

### 2. Налаштувати Supabase

Скопіюй файл `.env.local.example` → `.env.local`:

```bash
cp .env.local.example .env.local
```

Відкрий `.env.local` і встав свої ключі з Supabase Dashboard → Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### 3. Запустити проект

```bash
npm run dev
```

Відкрий http://localhost:3000

## Команди

```bash
npm run dev      # localhost:3000
npm run build    # production build
npm run start    # production server
```

## Документація

Канон бізнес-логіки й інваріантів — [CLAUDE.md](./CLAUDE.md). Тематичні живі документи в [docs/](./docs/):

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — карта коду, стек, осі централізації
- [docs/DATABASE.md](./docs/DATABASE.md) — схема, RPC, інваріанти даних
- [docs/SECURITY.md](./docs/SECURITY.md) — ролі, RLS, гранти, RPC-гейти
- [docs/FRONTEND.md](./docs/FRONTEND.md) — модалки, CSS-система, layout, mobile
- [docs/CHANGELOG.md](./docs/CHANGELOG.md) — помітні віхи (повна історія — `git log`)
- [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) — правило синхронізації docs↔код
- [docs/DRIFT_CHECK_PROMPT.md](./docs/DRIFT_CHECK_PROMPT.md) — переіспользуваний чек дрейфу
- [docs/archive/](./docs/archive/) — заморожені звіти · [docs/legacy/](./docs/legacy/) — старі робочі документи

## Деплой на Vercel

```bash
npx vercel
```

Додай змінні оточення `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_ANON_KEY` у налаштуваннях Vercel.
