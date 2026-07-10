# CLAUDE.md

## Stack

Next.js 14.2.3 (App Router) · React 18 · TypeScript (strict) · Supabase (PostgreSQL + Auth) · Tailwind CSS 4 + shadcn/ui · react-hook-form + zod. **UI — тільки українською.**

## Critical Invariants

1. **Баланс клієнта (`clients.balance`) — тільки через `update_client_balance()` RPC.** Ніколи не `UPDATE` напряму.
2. **Залишок занять (`client_session_balances`) — тільки через RPC** (`mark_attendance`/`change_enrollment_status`). Ніколи не `UPDATE` напряму.
3. **Статуси/скасування занять — тільки через RPC** (`change_enrollment_status`, `cancel_class_and_restore_sessions`). Прямий `UPDATE` ламає баланс.
4. **М'які видалення скрізь** (`is_active`/`is_cancelled`). Ніколи не `DELETE` доменні рядки.
5. **Гроші — в гривнях (₴), integer.** Не ділити на 100.

## Context Dispatcher — ОБОВ'ЯЗКОВО

Перед написанням коду я **ЗАВЖДИ** спершу читаю відповідний файл:

- Робота з БД / схемою / RPC / запитами → **`docs/DATABASE.md`**
- UI / компоненти / модалки / CSS / сторінки → **`docs/FRONTEND.md`**
- Ролі / RLS / auth / доступи → **`docs/SECURITY.md`**

**ЗАБОРОНЕНО** без прямого наказу: читати логи та будь-які файли з **`docs/archive/`**.

## Субагенти (`.claude/agents/`, запуск вручну на запит)

- **docs-sync** — актуалізація+ущільнення docs/CLAUDE.md за реальним кодом/прод-БД (мозок — `scripts/sync-docs.prompt.md`, спільний з `npm run sync:docs`).
- **db-guard** — аудит diff на інваріанти БД + пастки SQL-міграцій (read-only).
- **ui-reviewer** — Geist-консистентність змінених компонентів (read-only).
- **security-auditor** — RLS/гранти/advisors + дрейф prod↔SECURITY.md (read-only).
- **geist-migrator** — тріаж-аудитор ОДНІЄЇ сторінки: працює СТРОГО за звітом прескану `scripts/geist/audit-page.sh` (власний пошук заборонено, тулів Grep/Glob немає), додає структурний рівень, веде трекер `docs/geist-migration.md` (коду не редагує; sonnet).
- **geist-fixer** — застосовує знахідки аудиту після тріажу оркестратором; лише механічні правки за file:line зі списку, без власного grep (sonnet; повністю механічні списки — override `model: "haiku"`).

**Geist-міграція:** слово «поїхали» → навичка `geist-session` (протокол етапу + модельна матриця + гарди haiku). Механічний пошук (хардкоди/px/motion/dead CSS) — ТІЛЬКИ скриптом `bash scripts/geist/audit-page.sh <page> [-o звіт]`, не grep-ом.
