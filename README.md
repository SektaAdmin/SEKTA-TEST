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

## Структура проекту

```
app/
  login/        — сторінка авторизації
  sales/        — сторінка продажів
components/
  Sidebar       — бічне меню
  SaleModal     — модалка нової/редагування продажі
lib/
  supabase.ts   — клієнт Supabase
types/
  index.ts      — TypeScript типи
```

## Таблиці Supabase

Проект використовує:
- `public.clients` — клієнти
- `public.tickets` — абонементи (is_active = true)
- `public.trainers` — тренери (is_active = true)
- `public.sales` — продажі

## Деплой на Vercel

```bash
npx vercel
```

Додай змінні оточення NEXT_PUBLIC_SUPABASE_URL і NEXT_PUBLIC_SUPABASE_ANON_KEY у налаштуваннях Vercel.
