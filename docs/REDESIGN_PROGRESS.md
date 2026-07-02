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

- [x] **Сесія 0 — Оцифровка Geist у токени.** Значення звірено з CSS-бандлом vercel.com/geist (юзер підвантажив `Vercel_DS/` — НЕ комітити). Geist gray = чисто ахроматичний (HSL 0,0%). Тепле off-white → нейтральні сірі, кілька токенів лягли точно в Geist: `--bg #fafafa` = `--ds-background-200`, `--bg-2 #fff` = `--ds-background-100`, `--bg-3 #eeede9→#f2f2f2` = gray-100, `--text #1a1917→#171717` = gray-1000, `--accent-hover →#171717`. Радіуси (Geist materials: base/small=6, medium=12, fullscreen=16): `--radius 10px→12px` (Geist medium — контейнери), `--radius-sm=6px` (Geist base — контроли). Мертву `--brand-*` (0 споживачів) оцифровано в аутентичну рампу Geist gray. Семантичні кольори без змін. **Типографіка (докрутка Session 0):** юзер зберіг `vercel.com/geist/typography` (`Vercel_DS/Typography*`, gitignored) → grep класів `.text-heading/.text-copy/.text-label/.text-button` з CSS-бандла дав точну шкалу Geist (font-size/line-height/weight/tracking). Оцифровано в токени `--fs-*`/`--lh-*`/`--tracking-*` + ваги `--fw-normal/medium/semibold` (400/500/600): xs 12/16 · sm 13/18 · base 14/20 · md 16/24 · lg 20/26 (−0.4px) · xl 24/32 (−0.96px) · 2xl 32/40 (−1.28px). **Підпис Geist:** semibold-заголовки з негативним tracking (≈ −0.06×size), copy/label — normal. Токени лише ДОДАНО (не переписував наявні хардкоди font-size — це робота Сесій 1–11). `DESIGN.md` § Typography оновлено (шкала + правила). **Обмеження:** spacing-числа джерело ховає за Figma, але spacing-рампу Geist уже дістав з Grid-бандла (див. memory). type-scale — закрито. **Доступність:** середні сірі Geist (700 #8f8f8f=3.0:1, 800 #7d7d7d=3.5:1) НЕ проходять AA на дрібному тексті → текст лишається на `--text/-2/-3` (темніші за Geist mids). Синхронено: inline-bg `app/layout.tsx`, коментар `client.module.css`, `DESIGN.md`. Шрифт Geist уже стояв (f1a8dc4). Гілка `redesign/session-0-tokens`.
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
