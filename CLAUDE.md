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
