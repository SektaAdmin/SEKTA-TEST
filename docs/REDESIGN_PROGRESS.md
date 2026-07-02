# REDESIGN_PROGRESS — перехід на Vercel Geist design system

Масштабна поетапна задача. UI має стати як **Vercel Dashboard**: щільність, читабельність, без брендової емоційності (свідома відмова від червоного неону SEKTA; `--accent: #000`). Робиться посесійно: **1 сесія = 1 захід → коміт → Vercel preview → скрін-перевірка 3 ролей**.

**Рішення:** тёмна тема НЕ потрібна — токени одиночні, не парами light/dark.

Джерело істини по значеннях/шкалах — `DESIGN.md`. Історія й технічні перевірки (шрифт, кирилиця, PDF) — memory `project_redesign_vercel`.

## Принцип

Спочатку **примітиви** (токени → кнопка/поле/таблиця/бейдж/модалка), потім **сторінки** як збірка з готових деталей. Не «сторінка за сторінкою» з нуля — інакше буде 8 різних «Geist».

## Ритм кожної сесії

1. Гілка на сесію (не все в `main` — дрібний diff легко відкотити).
2. Правки → `build` → скріни до/після 3 ролей (`review:browser`, моки rest/v1).
3. `commit` + push → Vercel preview.
4. Відмітка тут (`[x]`) + оновлення `DESIGN.md`.

---

## Фаза A — Фундамент

Правки в токенах зачіпають усі екрани одразу → скрін-перевірка всіх ролей обов'язкова.

- [x] **Сесія 0 — Оцифровка Geist у токени.** Значення звірено з першоджерелом (vercel.com/geist). Нейтралі теплі→холодні: `--bg #f5f5f2→#fafafa` (= Geist `--ds-background-200`), `--bg-2 #fff` (= `--ds-background-100`), `--bg-3 #eeede9→#f2f2f2`, `--text #1a1917→#171717`, `--accent-hover →#171717`. Радіуси — шкала Geist materials (base/small=6, medium=12, fullscreen=16): `--radius 10px→12px` (Geist medium — контейнери), `--radius-sm=6px` (Geist base — контроли). Семантичні кольори й brand-шкала (ахроматична) без змін. **Обмеження:** raw-hex сірих `--ds-gray-*` і числа type-scale джерело ховає (Figma/SVG-свотчі), тому середні кроки сірого — вірна апроксимація, а не точний Geist; підтверджені точно лише backgrounds + радіуси. Синхронено: inline-bg `app/layout.tsx`, коментар `client.module.css`, `DESIGN.md`. Шрифт Geist уже стояв (f1a8dc4). Гілка `redesign/session-0-tokens`.
- [ ] **Сесія 1 — Кнопки + поля.** `.btn-primary` (+ secondary/ghost/danger), `input/select/textarea`, `components/ui/FormField.tsx`.
- [ ] **Сесія 2 — Таблиця + бейджі + пагінація.** `.data-table`, `.badge-*` (`lib/badges.ts`), `components/ui/Pagination.tsx`.
- [ ] **Сесія 3 — Модалки + фільтри/чипи.** `ModalShell`, `ModalFooter`, `FilterSelect`, `.filterChips`.

## Фаза B — Сторінки

- [ ] **Сесія 4 — 🎯 Пілот: /sales.** Найщільніша таблична сторінка, калібрує всю Фазу A.
- [ ] **Сесія 5 — /accounting** (+ `/accounting/trainers`, `/rates`, `/salary`, `StudioExpenseModal`).
- [ ] **Сесія 6 — /clients + /clients/[id]** (+ `ClientModal`).
- [ ] **Сесія 7 — /schedule** (+ `/schedule/templates`, `[classId]`, `ClassDetailModal`, mobile-таймлайн).
- [ ] **Сесія 8 — /dashboard** (найвидиміший екран, фінал адмінки).
- [ ] **Сесія 9 — Кабінет тренера** (`/trainer`, `/schedule`, `/clients`, `/my`, `CabinetHeader`, `BottomNav`).
- [ ] **Сесія 10 — Кабінет клієнта** (`/client`, `/schedule`, `/subscriptions`, `/visits`).
- [ ] **Сесія 11 — Settings + хвіст** (`/settings/*`, `/halls`, `/tickets`, `/training-types`, `/journal`, `/audit`, `/login`).

## Фаза C — Полірування

- [ ] **Сесія 12 — Фінальний прохід.** Наскрізна консистентність, видалення мертвого CSS, оновлення `DESIGN.md`.
