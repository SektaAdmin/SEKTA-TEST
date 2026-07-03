# REDESIGN_PROGRESS — перехід на Vercel Geist design system

Масштабна поетапна задача. UI має стати як **Vercel Dashboard**: щільність, читабельність, без брендової емоційності (свідома відмова від червоного неону SEKTA; `--accent: #000`). Робиться посесійно: **1 сесія = 1 захід → коміт у `main` → Vercel деплой → скрін-перевірка 3 ролей**. (Гілки на сесію скасовано 2026-07-03 — усе прямо в main, див. «Ритм кожної сесії».)

**Рішення:** тёмна тема НЕ потрібна — токени одиночні, не парами light/dark.

Джерело істини по значеннях/шкалах — `DESIGN.md`. Історія й технічні перевірки (шрифт, кирилиця, PDF) — memory `project_redesign_vercel`.

## Джерело дизайну — `docs/geist/` (витягнуто з повного дампу Geist)

**Ми НЕ вигадуємо значення на око — ми копіюємо їх з автентичного Geist.**

**🔑 Нове джерело (з 2026-07-03): `Vercel_raw/geist-docs/` → `docs/geist/`.** Юзер зберіг **повний дамп** усього vercel.com/geist (78 сторінок компонентів, гідратований HTML + 3 CSS-бандли). На відміну від старого `Vercel_DS/` — тут розмітка компонентів **Є в HTML** (server-rendered/hydrated), тож `data-slot`/класи дістаються напряму, без копання в JS-чанках (див. готчу нижче — вона знята). Дамп великий і gitignored, тож з нього **одноразово згенеровано легкі markdown-довідники** у `docs/geist/` (комітяться, ~350 КБ проти 23 МБ сирцю):

- **`docs/geist/tokens.md`** — 405 токенів (колір light/dark у hex, spacing, radius, shadow, typography, motion). Ґенерує `scripts/geist/extract-tokens.mjs` (grep CSS-бандлів).
- **`docs/geist/components/<name>.md`** — 77 компонентів: розділи сторінки + DOM-контракт (`data-slot`→класи) + варіанти (згруповані за формою) + крос-реф токенів. Ґенерує `scripts/geist/extract-components.mjs`.
- **`docs/geist/theming.md`** — themed-система варіантів (кольори компонентів): `.geist-new-<color>` × модифікатор (`base`/`-fill`/`-contrast`/`-dark`) × light/dark → `--themed-bg/fg/border`. **Закриває кольори 🟡 «тонких» компонентів** (Button/Toast/Note/Alert…). Ґенерує `scripts/geist/extract-theming.mjs`.
- **`docs/geist/README.md`** — індекс з чесним покриттям: 🟢 структура/варіанти з HTML · 🟡 «тонкий» (кольори варіантів — у `theming.md`, структура — single-instance utility-класи в HTML).

**Робочий цикл звірки (з Сесії 3):**
1. Дивлюсь `docs/geist/components/<Компонент>.md` (НЕ сирий HTML — це вбиває ліміт). Там автентичні класи Geist.
2. Значення класів (gray-400, py-2.5, rounded-full…) → шукаю в `docs/geist/tokens.md`.
3. Оцифровую в токени `globals.css` + примітив; фіксую в `DESIGN.md`.
4. **Компонент 🟡 «тонкий»?** Кольори його варіантів — у `docs/geist/theming.md` (`.geist-new-<color>` → `--themed-*`). Структуру (розмір/радіус/відступи) бери зі single-instance utility-класів у HTML сторінки. Значення токенів — у `tokens.md`.
5. Регенерація за потреби: `npm run geist:docs` (tokens + theming + components).

**`Vercel_raw/` і `Vercel_DS/` — gitignored, НЕ комітити.** Якщо потрібного компонента нема в `docs/geist/` — перегенерувати зі скрипта; якщо нема в дампі — попросити юзера підвантажити, не апроксимувати.

**✅ Готчу знято:** у старому `Vercel_DS/` демо рендерились клієнтом, тож розмітки в HTML не було — доводилось копати cva з JS-чанків. У повному дампі `Vercel_raw/geist-docs` HTML **гідратований**, розмітка є → Table (`data-slot` th `h-10 px-2 font-medium`, td `px-2 py-2.5`, hover `bg-gray-100`), Badge (3 розміри × 17 варіантів fill/subtle/outline), StatusDot (`size-2.5 rounded-full`) знято прямо з HTML. themed-компоненти (Button/Select/Modal/Tabs/Toast…) тримають кольори варіантів у CSS, не в класах HTML → їхні кольори витягнуто окремим CSS-проходом у `theming.md` (🟡 у `.md` = структура з HTML + посилання на `theming.md`).

## Принцип

Спочатку **примітиви** (токени → кнопка/поле/таблиця/бейдж/модалка), потім **сторінки** як збірка з готових деталей. Не «сторінка за сторінкою» з нуля — інакше буде 8 різних «Geist».

## Ритм кожної сесії

1. **Референс:** юзер підвантажує потрібні Geist-сторінки в `Vercel_DS/` (перелік — у рядку кожної сесії нижче, поле «📥 Geist»).
2. **Працюємо прямо в `main`** — жодних гілок на сесію (рішення 2026-07-03: Сесії 0–4 стекувалися в гілках, це виявилось незручним; усе злито в main, далі коміти одразу в main → авто-деплой Vercel з main).
3. Звірка з бандлом (`grep Vercel_DS/`) → правки → `build` → скріни до/після 3 ролей (`review:browser`, моки rest/v1).
4. `commit` + push у `main` → Vercel деплой.
5. Відмітка тут (`[x]`) + оновлення `DESIGN.md` з приміткою про звірку.

---

## Фаза A — Фундамент

Правки в токенах зачіпають усі екрани одразу → скрін-перевірка всіх ролей обов'язкова.

- [x] **Сесія 0 — Оцифровка Geist у токени.** Значення звірено з CSS-бандлом vercel.com/geist (юзер підвантажив `Vercel_DS/` — НЕ комітити). Geist gray = чисто ахроматичний (HSL 0,0%). Тепле off-white → нейтральні сірі, кілька токенів лягли точно в Geist: `--bg #fafafa` = `--ds-background-200`, `--bg-2 #fff` = `--ds-background-100`, `--bg-3 #eeede9→#f2f2f2` = gray-100, `--text #1a1917→#171717` = gray-1000, `--accent-hover →#171717`. Радіуси (Geist materials: base/small=6, medium=12, fullscreen=16): `--radius 10px→12px` (Geist medium — контейнери), `--radius-sm=6px` (Geist base — контроли). Мертву `--brand-*` (0 споживачів) оцифровано в аутентичну рампу Geist gray. Семантичні кольори без змін. **Типографіка (докрутка Session 0):** юзер зберіг `vercel.com/geist/typography` (`Vercel_DS/Typography*`, gitignored) → grep класів `.text-heading/.text-copy/.text-label/.text-button` з CSS-бандла дав точну шкалу Geist (font-size/line-height/weight/tracking). Оцифровано в токени `--fs-*`/`--lh-*`/`--tracking-*` + ваги `--fw-normal/medium/semibold` (400/500/600): xs 12/16 · sm 13/18 · base 14/20 · md 16/24 · lg 20/26 (−0.4px) · xl 24/32 (−0.96px) · 2xl 32/40 (−1.28px). **Підпис Geist:** semibold-заголовки з негативним tracking (≈ −0.06×size), copy/label — normal. Токени лише ДОДАНО (не переписував наявні хардкоди font-size — це робота Сесій 1–11). `DESIGN.md` § Typography оновлено (шкала + правила). **Обмеження:** spacing-числа джерело ховає за Figma, але spacing-рампу Geist уже дістав з Grid-бандла (див. memory). type-scale — закрито. **Доступність:** середні сірі Geist (700 #8f8f8f=3.0:1, 800 #7d7d7d=3.5:1) НЕ проходять AA на дрібному тексті → текст лишається на `--text/-2/-3` (темніші за Geist mids). Синхронено: inline-bg `app/layout.tsx`, коментар `client.module.css`, `DESIGN.md`. Шрифт Geist уже стояв (f1a8dc4). Гілка `redesign/session-0-tokens`.
- [x] **Сесія 1 — Кнопки + поля.** Система кнопок у `globals.css`, **звірено з автентичним Geist Button** (`Vercel_DS/Button`, класи `geist-new-*`): `.btn-primary` + `.btn-secondary`/`.btn-ghost`/`.btn-danger` (кожна самодостатня, одна класа) + модифікатор `.btn-sm`. Спільна база: `--control-h` (=Geist small 32px), `--radius-sm` (6px=`rounded-md`), 14/500, `--motion-fast`. **Модель Geist (4 варіанти):** primary=default (чорна заливка #000, hover світлішає); **secondary=outline** (білий фон + `1px --border` ≈ gray-400, hover gray-100) — це «Скасувати»; **ghost=tertiary** (прозорий, БЕЗ рамки у спокої, fill+рамка на hover); danger=error. **Disabled=приглушені кольори** (gray-100 фон + `--text-3` текст + `--border`), НЕ opacity. `ModalFooter` → глобальні класи (cancel→**secondary**, save→primary, danger→danger); `ModalFooter.module.css` видалено. Поля (`FormField`): padding 8/12, focus-glow `0 0 0 3px rgba(0,0,0,.08)`, `aria-invalid` → червона рамка + `--danger-dim` glow, errorHint → `--danger-text` (4.5:1 на 11px), disabled → `--border-strong` + `--text-3`. Хардкоди кнопок по сторінках НЕ мігровано — робота Сесій 4–11. `DESIGN.md` §Buttons/Inputs + frontmatter звірено. Гілка `redesign/session-1-buttons-fields`.
- [x] **Сесія 2 — Таблиця + бейджі + пагінація.** Автентичні значення з JS-чанків Geist (демо рендеряться клієнтом — див. готчу вище). **Table** (`.data-table`): thead БЕЗ заливки (лише нижня рамка), `th` normal-case 14/500 висота 40px (Geist `h-10 px-2 font-medium` — не uppercase-мікрокапс), `td` верт. 10px (Geist `py-2.5`), гориз. 12px (Geist `px-2`=8px borderless; у картці-обгортці 12px для дихання), hover-рядок `--bg-3`=Geist gray-100. НЕ переносив Geist `last:text-right` (у нас різні останні колонки). **Badge** (`.badge`): геометрія Geist sm — `rounded-full` (`--radius-full`), h20/px8/gap4, 11/500, `letter-spacing:0.2px`, `tabular-nums`. Кольори лишив (семантику заморожено в S0); 1px рамку лишив як задокументоване відхилення (Geist badge borderless) — щоб бліді Dim-заливки читались без ретинту. `--badge-radius` (мертвий) прибрано. **Status Dot** (новий примітив `.status-dot`+`-neutral/-success/-warning/-danger/-info`, `.status-dot-item`): Geist `size-2.5`=10px коло, label 14/gap8. **Pagination** (`components/ui/Pagination.tsx`): Geist має лише prev/next — номерний пейджер = наша композиція на кнопкових токенах S1; стрілки → lucide `ChevronLeft/Right`, `.btn` flex-center висота `--control-h`. DESIGN.md §Tables/Badges/Status Dot/Pagination оновлено. Хардкоди по сторінках НЕ мігровано (робота Фази B). Гілка `redesign/session-2-tables-badges`.
  📥 **Geist:** `Table`, `Badge` (+ `Status Dot`), `Pagination`. ✅
- [x] **Сесія 3 — Модалки + фільтри/чипи.** Джерело — `docs/geist/` (повний дамп; `Modal`/`Select`/`Menu`/`Tabs` — «тонкі» компоненти: структура single-instance в HTML, кольори/тіні в `tokens.md`/`theming.md`; контейнери модалки/поповера рендеряться в портал → значення взято з токенів `--ds-shadow-modal`/`--ds-shadow-menu`/`--ds-overlay-backdrop-color`). **Нові токени** `globals.css`: `--shadow-menu` + `--shadow-modal` (автентичні Geist layered-тіні, перший шар = `0 0 0 1px` ring ≈ `--border` → замінює CSS-рамку; alpha з бандла `#00000005/0a/0f`) та `--modal-backdrop` (Geist backdrop = background-200 `#fafafa` @ .8 — **світлий фрост**, окремий токен бо `--overlay-bg` живить споживачів-тіней HallModal/Combobox). **ModalShell:** бекдроп → `--modal-backdrop`, картка → `box-shadow: --shadow-modal` (прибрано `border`). **FilterSelect (`.fs-*`):** поповер → `--shadow-menu` + radius `--radius`(12) + `padding:4px`, пункти → `rounded-md`+8×10px+gap10, hover gray-100, **selected нейтральний** (`--accent-dim`+500, не кольоровий акцент — Geist `bg-gray-alpha-100`); ~36px замість Geist `h-10`(40) для щільності. **`.filterChip`:** доданий hover неактивного (`--border-hover`+Ink). `ModalFooter` вже на глобальних кнопках з S1 — без змін. DESIGN.md §Elevation/Modals/Filter Select/Filter Chips оновлено. ⚠️ **Найпомітніша зміна — світлий бекдроп** (замість темного scrim): звірити на превʼю. Хардкоди по сторінках НЕ мігровано (Фаза B). Гілка `redesign/session-3-modals-filters`.
  📥 **Geist:** `Modal`, `Select`, `Menu` (dropdown), `Choicebox`/`Tabs` (чипи-фільтри). ✅

## Фаза B — Сторінки

У Фазі B примітиви вже готові (звірені в A) — Geist-сторінки тут потрібні лише для **композиційних** патернів (layout, відступи між блоками, тулбари, порожні стани). Якщо новий примітив не потрібен — нову сторінку в `Vercel_DS/` можна не тягнути.

- [x] **Сесія 4 — 🎯 Пілот: /sales.** Найщільніша таблична сторінка — прогнав крізь неї всю Фазу A, замінив локальні реімплементації примітивів. Гілка `redesign/session-4-sales-pilot`.
  **Мігровано на примітиви:** `.expenseBtn` → `.btn-secondary`; кнопки обох confirm-діалогів → `.btn-secondary`/`.btn-danger` (видалено локальні `.expenseBtn`/`.btnCancel`/`.btnConfirmDel`, ~50 рядків CSS). **Confirm-діалоги** переведено на токени Сесії 3: бекдроп `--overlay-bg` → `--modal-backdrop` (світлий фрост), картка `border` → `box-shadow: --shadow-modal` (1px-ring у тіні). `.confirmError` колір `--danger` → `--danger-text` (4.5:1). **Прибрано мертві оверрайди:** `font-size: 14px !important` з клітинок `.date/.price/.deposit/.sessions/.opTopup/.opDeduction/.depositLabel` — базовий 14px тепер дає примітив `.data-table` (сторінка більше не дублює розмір).
  **Що вже було на примітивах (лише звірено, що тримає щільність):** таблиця `.data-table`, платіжні бейджі `paymentClass()`→`.badge-*`, `Pagination`, `FilterSelect`, mobile `.filterChip`.
  **Калібраційні знахідки (gaps Фази A) — лишено локальним, це НЕ борг:** (1) сегментні таби фіду (`.feedTab`/`.feedTabActive`) — у Фазі A нема tabs-примітива (Session 3 зробив лише chip); тримаються локально на токенах, активний стан нейтральний (`--accent-dim`). (2) inline-дії таблиці (`.btnEdit`/`.btnDel`/`.btnReceipt`) — навмисно локальні: спільна база на `--btn-sm-*`, але з семантичним hover (del→danger, receipt→accent), чого `.btn-*` не покривають; це свідомий патерн «тонкі inline-actions», не реімплементація. (3) `.filterSearchInput` (пошук з іконкою), `.sheetDone`/`.filterToggleBtn` (mobile-хром із `display:none`-на-desktop, застосування `.btn-*` крихке через конфлікт `display`) — лишено. tsc чистий; build не ганяв (dev на :3000, .next-готча) — скрін-перевірка на Vercel preview гілки.
  📥 **Geist:** `Grid` (вже є), за потреби `Input`/`Select` для тулбара фільтрів. ✅
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
