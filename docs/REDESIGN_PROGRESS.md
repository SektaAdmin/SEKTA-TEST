# REDESIGN_PROGRESS — перехід на Vercel Geist design system

Масштабна поетапна задача. UI має стати як **Vercel Dashboard**: щільність, читабельність, без брендової емоційності (свідома відмова від червоного неону SEKTA; `--accent: #000`). Робиться посесійно: **1 сесія = 1 захід → коміт → Vercel preview → скрін-перевірка 3 ролей**.

**Рішення:** тёмна тема НЕ потрібна — токени одиночні, не парами light/dark.

Джерело істини по значеннях/шкалах — `DESIGN.md`. Історія й технічні перевірки (шрифт, кирилиця, PDF) — memory `project_redesign_vercel`.

## Джерело дизайну — `Vercel_DS/` (звірка з бандлом Geist)

**Ми НЕ вигадуємо значення на око — ми копіюємо їх з автентичного Geist.** Перед кожною сесією юзер зберігає потрібні сторінки з **https://vercel.com/geist** (меню `Components` / `Getting Started`) через «Зберегти сторінку повністю» у теку **`Vercel_DS/`**. Виходить `<Компонент>.html` + `<Компонент>_files/` з CSS-бандлами й JS.

**Робочий цикл звірки (як робилось у Сесіях 0–1):**
1. Юзер кладе сторінку(и) сесії у `Vercel_DS/` (напр. `Button.html`, `Typography.html`, `Grid.html`).
2. Я `grep` по `Vercel_DS/**/*.css` (і за потреби по HTML на inline-класи `geist-new-*`/`.geist-*`) → дістаю **точні** значення: розміри, радіуси, кольори (Geist gray = HSL 0,0%), font-size/line-height/weight/tracking, spacing-рампу, тіні, стани (hover/active/disabled/focus).
3. Оцифровую в токени `globals.css` + примітив; фіксую в `DESIGN.md` з приміткою «звірено з `Vercel_DS/<Компонент>`».
4. Хардкоди значень (не «на око») — тільки ті, що знайдено в бандлі.

**`Vercel_DS/` — gitignored, НЕ комітити** (важкі HTML/JS, лише робочий референс). Якщо потрібної сторінки в теці нема — я зупиняюсь і прошу юзера підвантажити її перед звіркою, а не апроксимую.

Наявне в теці зараз: `Button`, `Copy Button`, `Typography`, `Grid` (Сесії 0–1), `Table`, `Badge`, `Status Dot`, `Pagination` (Сесія 2).

**⚠️ Готча зі збереженими сторінками:** демо-компоненти на vercel.com/geist (Table/Badge/Status Dot/Pagination) рендеряться **клієнтом (JS)**, тож у статичному `<Компонент>.html` їхньої розмітки НЕМА, а скомпільований CSS не потрапляє в `*_files/*.css` як іменовані класи. Точні значення дістаються з **JS-чанків** (`*_files/*.js`): шукати cva-визначення (`badgeVariants`, `p_=cva(...)`) та рядки `data-slot`/`className` компонента. Так у Сесії 2 знято автентичні: Table (`data-slot` th `h-10 px-2 font-medium`, td `px-2 py-2.5`, hover `bg-gray-100`), Badge (`badgeVariants` sm: `rounded-full h-5 px-1.5 gap-1 text-[11px] tracking-[0.2px] tabular-nums`, low-contrast `-200/-900`), StatusDot (`size-2.5 rounded-full`), Pagination (Geist = лише prev/next nav, номерного пейджера нема).

## Принцип

Спочатку **примітиви** (токени → кнопка/поле/таблиця/бейдж/модалка), потім **сторінки** як збірка з готових деталей. Не «сторінка за сторінкою» з нуля — інакше буде 8 різних «Geist».

## Ритм кожної сесії

1. **Референс:** юзер підвантажує потрібні Geist-сторінки в `Vercel_DS/` (перелік — у рядку кожної сесії нижче, поле «📥 Geist»).
2. Гілка на сесію (не все в `main` — дрібний diff легко відкотити).
3. Звірка з бандлом (`grep Vercel_DS/`) → правки → `build` → скріни до/після 3 ролей (`review:browser`, моки rest/v1).
4. `commit` + push → Vercel preview.
5. Відмітка тут (`[x]`) + оновлення `DESIGN.md` з приміткою про звірку.

---

## Фаза A — Фундамент

Правки в токенах зачіпають усі екрани одразу → скрін-перевірка всіх ролей обов'язкова.

- [x] **Сесія 0 — Оцифровка Geist у токени.** Значення звірено з CSS-бандлом vercel.com/geist (юзер підвантажив `Vercel_DS/` — НЕ комітити). Geist gray = чисто ахроматичний (HSL 0,0%). Тепле off-white → нейтральні сірі, кілька токенів лягли точно в Geist: `--bg #fafafa` = `--ds-background-200`, `--bg-2 #fff` = `--ds-background-100`, `--bg-3 #eeede9→#f2f2f2` = gray-100, `--text #1a1917→#171717` = gray-1000, `--accent-hover →#171717`. Радіуси (Geist materials: base/small=6, medium=12, fullscreen=16): `--radius 10px→12px` (Geist medium — контейнери), `--radius-sm=6px` (Geist base — контроли). Мертву `--brand-*` (0 споживачів) оцифровано в аутентичну рампу Geist gray. Семантичні кольори без змін. **Типографіка (докрутка Session 0):** юзер зберіг `vercel.com/geist/typography` (`Vercel_DS/Typography*`, gitignored) → grep класів `.text-heading/.text-copy/.text-label/.text-button` з CSS-бандла дав точну шкалу Geist (font-size/line-height/weight/tracking). Оцифровано в токени `--fs-*`/`--lh-*`/`--tracking-*` + ваги `--fw-normal/medium/semibold` (400/500/600): xs 12/16 · sm 13/18 · base 14/20 · md 16/24 · lg 20/26 (−0.4px) · xl 24/32 (−0.96px) · 2xl 32/40 (−1.28px). **Підпис Geist:** semibold-заголовки з негативним tracking (≈ −0.06×size), copy/label — normal. Токени лише ДОДАНО (не переписував наявні хардкоди font-size — це робота Сесій 1–11). `DESIGN.md` § Typography оновлено (шкала + правила). **Обмеження:** spacing-числа джерело ховає за Figma, але spacing-рампу Geist уже дістав з Grid-бандла (див. memory). type-scale — закрито. **Доступність:** середні сірі Geist (700 #8f8f8f=3.0:1, 800 #7d7d7d=3.5:1) НЕ проходять AA на дрібному тексті → текст лишається на `--text/-2/-3` (темніші за Geist mids). Синхронено: inline-bg `app/layout.tsx`, коментар `client.module.css`, `DESIGN.md`. Шрифт Geist уже стояв (f1a8dc4). Гілка `redesign/session-0-tokens`.
- [x] **Сесія 1 — Кнопки + поля.** Система кнопок у `globals.css`, **звірено з автентичним Geist Button** (`Vercel_DS/Button`, класи `geist-new-*`): `.btn-primary` + `.btn-secondary`/`.btn-ghost`/`.btn-danger` (кожна самодостатня, одна класа) + модифікатор `.btn-sm`. Спільна база: `--control-h` (=Geist small 32px), `--radius-sm` (6px=`rounded-md`), 14/500, `--motion-fast`. **Модель Geist (4 варіанти):** primary=default (чорна заливка #000, hover світлішає); **secondary=outline** (білий фон + `1px --border` ≈ gray-400, hover gray-100) — це «Скасувати»; **ghost=tertiary** (прозорий, БЕЗ рамки у спокої, fill+рамка на hover); danger=error. **Disabled=приглушені кольори** (gray-100 фон + `--text-3` текст + `--border`), НЕ opacity. `ModalFooter` → глобальні класи (cancel→**secondary**, save→primary, danger→danger); `ModalFooter.module.css` видалено. Поля (`FormField`): padding 8/12, focus-glow `0 0 0 3px rgba(0,0,0,.08)`, `aria-invalid` → червона рамка + `--danger-dim` glow, errorHint → `--danger-text` (4.5:1 на 11px), disabled → `--border-strong` + `--text-3`. Хардкоди кнопок по сторінках НЕ мігровано — робота Сесій 4–11. `DESIGN.md` §Buttons/Inputs + frontmatter звірено. Гілка `redesign/session-1-buttons-fields`.
- [x] **Сесія 2 — Таблиця + бейджі + пагінація.** Автентичні значення з JS-чанків Geist (демо рендеряться клієнтом — див. готчу вище). **Table** (`.data-table`): thead БЕЗ заливки (лише нижня рамка), `th` normal-case 14/500 висота 40px (Geist `h-10 px-2 font-medium` — не uppercase-мікрокапс), `td` верт. 10px (Geist `py-2.5`), гориз. 12px (Geist `px-2`=8px borderless; у картці-обгортці 12px для дихання), hover-рядок `--bg-3`=Geist gray-100. НЕ переносив Geist `last:text-right` (у нас різні останні колонки). **Badge** (`.badge`): геометрія Geist sm — `rounded-full` (`--radius-full`), h20/px8/gap4, 11/500, `letter-spacing:0.2px`, `tabular-nums`. Кольори лишив (семантику заморожено в S0); 1px рамку лишив як задокументоване відхилення (Geist badge borderless) — щоб бліді Dim-заливки читались без ретинту. `--badge-radius` (мертвий) прибрано. **Status Dot** (новий примітив `.status-dot`+`-neutral/-success/-warning/-danger/-info`, `.status-dot-item`): Geist `size-2.5`=10px коло, label 14/gap8. **Pagination** (`components/ui/Pagination.tsx`): Geist має лише prev/next — номерний пейджер = наша композиція на кнопкових токенах S1; стрілки → lucide `ChevronLeft/Right`, `.btn` flex-center висота `--control-h`. DESIGN.md §Tables/Badges/Status Dot/Pagination оновлено. Хардкоди по сторінках НЕ мігровано (робота Фази B). Гілка `redesign/session-2-tables-badges`.
  📥 **Geist:** `Table`, `Badge` (+ `Status Dot`), `Pagination`. ✅
- [ ] **Сесія 3 — Модалки + фільтри/чипи.** `ModalShell`, `ModalFooter`, `FilterSelect`, `.filterChips`.
  📥 **Geist:** `Modal`, `Select`, `Menu` (dropdown), `Choicebox`/`Tabs` (чипи-фільтри).

## Фаза B — Сторінки

У Фазі B примітиви вже готові (звірені в A) — Geist-сторінки тут потрібні лише для **композиційних** патернів (layout, відступи між блоками, тулбари, порожні стани). Якщо новий примітив не потрібен — нову сторінку в `Vercel_DS/` можна не тягнути.

- [ ] **Сесія 4 — 🎯 Пілот: /sales.** Найщільніша таблична сторінка, калібрує всю Фазу A.
  📥 **Geist:** `Grid` (вже є), за потреби `Input`/`Select` для тулбара фільтрів.
- [ ] **Сесія 5 — /accounting** (+ `/accounting/trainers`, `/rates`, `/salary`, `StudioExpenseModal`).
  📥 **Geist:** з A; за потреби `Tabs`, `Description List`.
- [ ] **Сесія 6 — /clients + /clients/[id]** (+ `ClientModal`).
  📥 **Geist:** з A; за потреби `Avatar`, `Description List`, `Tabs`.
- [ ] **Сесія 7 — /schedule** (+ `/schedule/templates`, `[classId]`, `ClassDetailModal`, mobile-таймлайн).
  📥 **Geist:** з A; композиція власна (календарна сітка).
- [ ] **Сесія 8 — /dashboard** (найвидиміший екран, фінал адмінки).
  📥 **Geist:** за потреби `Card`-патерни зі сторінки Getting Started.
- [ ] **Сесія 9 — Кабінет тренера** (`/trainer`, `/schedule`, `/clients`, `/my`, `CabinetHeader`, `BottomNav`).
  📥 **Geist:** з A; mobile-навігація власна.
- [ ] **Сесія 10 — Кабінет клієнта** (`/client`, `/schedule`, `/subscriptions`, `/visits`).
  📥 **Geist:** з A.
- [ ] **Сесія 11 — Settings + хвіст** (`/settings/*`, `/halls`, `/tickets`, `/training-types`, `/journal`, `/audit`, `/login`).
  📥 **Geist:** за потреби `Switch`, `Radio`, `Checkbox`, `Toggle` для форм налаштувань.

## Фаза C — Полірування

- [ ] **Сесія 12 — Фінальний прохід.** Наскрізна консистентність, видалення мертвого CSS, оновлення `DESIGN.md`.
  📥 **Geist:** без нових — фінальна звірка з уже завантаженим у `Vercel_DS/`.
