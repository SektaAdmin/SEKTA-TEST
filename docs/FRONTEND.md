# Frontend

Деталі верстки, компонентів і mobile-адаптації. Інваріанти й карта коду — в [../CLAUDE.md](../CLAUDE.md).

## Структура

```
app/
  layout.tsx        — RefsProvider + <Toaster/> (sonner)
  globals.css       — CSS-токени, shared layout-класи, @keyframes, бейджі
  [route]/page.tsx + [route]/*.module.css

components/
  *Modal.tsx        — SaleModal, ClientModal, ClassModal, SeriesModal, EnrollClientModal,
                      ClassDetailModal, HallModal, TicketModal, TrainerModal,
                      TrainingTypeModal, StudioExpenseModal
  Sidebar, BottomNav, HallWeekGrid, ScheduleRightPanel
  Date*: DatePicker, DateRangePicker, DateTimePicker, DateTimeInput,
         SalesDateRangePicker, CalendarPopover, MonthNav
  features/ClientSearchCombobox.tsx
  icons/navigation.tsx       — усі навігаційні SVG як React-компоненти
  ui/
    ModalShell, ModalFooter, FormField — обгортки всіх модалок
    Pagination, ActionSelect, FilterSelect, SocialHandleInput
    button/calendar/command/dialog/popover/select/table — shadcn
```

## Спільні UI-компоненти

- **ModalShell** (`ui/ModalShell.tsx`) — обгортка ВСІХ модалок: overlay + header (title + close) + body + footer. Props: `title`, `onClose`, `footer`, `children`, `size`('form'|'detail'=form), `modalClassName`, `bodyClassName`, `headerActions`.
  - **Ширина — лише два токени** (`SIZE_WIDTH` у ModalShell): `form`=440 (форми/довідники/підтвердження — дефолт), `detail`=760 (перегляд деталей, лише ClassDetailModal). НЕ передавати довільний `width` — уніфіковано до двох розмірів.
  - **На ≤640px ВСІ модалки — bottom sheet** (`max-height: 92dvh`, `width:100%`, анімація `bottomSheetIn`, footer з `safe-area-inset-bottom`). Єдина поведінка: завжди читається як шар поверх, ніколи не плутається зі сторінкою. (Колишній `mobileFullScreen` — модалка на весь екран без overlay — видалено: він візуально був неотличний від окремої сторінки.)
  - z-index: overlay `300` > BottomNav `200`.
- **ModalFooter** (`ui/ModalFooter.tsx`) — кнопки Скасувати/Зберегти. Props: `onCancel`, `onSave?`, `saveLabel`, `cancelLabel`, `loading`, `saveType`('button'|'submit'), `disabled`. Save рендериться лише при `onSave`.
- **FormField** (`ui/FormField.tsx`) — label + control + errorHint + hint. ⚠️ `input[type=time]` має браузерний padding → нормалізовано `height:39px; padding-top/bottom:0`.
- **ActionSelect** (`ui/ActionSelect.tsx`) — Radix SelectPrimitive + CSS Modules (не shadcn Select — той тягне Tailwind-vars, яких у проекті нема). Використовується в ClassDetailModal для зміни статусу запису.
- **FilterSelect** (`ui/FilterSelect.tsx`) — inline Radix Select для фільтрів. ⚠️ Radix не приймає `value=""` → пустий мапиться в sentinel `'__all__'`.
- **Pagination** (`ui/Pagination.tsx`) — page size (20/50/100) + range з «…» + Prev/Next.

## CSS Design System (globals.css)

Теми: світла (`:root`) + темна (`@media prefers-color-scheme: dark`). У `*.module.css` — **тільки `var()`-токени**, ніяких HEX/rgba.

- **Фони:** `--bg`, `--bg-2`, `--bg-3` · **Текст:** `--text`, `--text-2`, `--text-3`
- **Бордери:** `--border`, `--border-hover`, `--border-strong` — товщина **скрізь `1px`** (`0.5px` дає баг рендерингу Chrome mobile)
- **Акцент:** `--accent`, `--accent-dim`, `--accent-text`, `--accent-border*` (зелений)
- **Стани:** `--danger/dim/border*`, `--success/dim`, `--warning/dim`
- **Оплата:** `--fop/dim`, `--card/dim`, `--deposit/dim`
- **Анімації:** `--motion-fast: .12s ease-out`, `--motion-standard: .18s ease-in-out`. @keyframes: `dotPulse`, `overlayIn`, `modalIn`, `bottomSheetIn`
- **Layout:** `--control-h: 32px` (44px mobile), `--topbar-h: 64px`, `--topbar-py: 16px`, `--topbar-px: 28px`, `--sidebar-w: 196px`, `--right-panel-w: 280px`, `--bottom-nav-h: 56px`, `--radius: 10px`, `--radius-sm: 6px`

**Shared utilities:** `.btn-primary`, `.loading-dots`, `.data-table-wrap`+`.data-table`. Нестандартні таблиці (accounting/salary/rates) лишаються в module.css через унікальні overrides.

**Бейджі:** CSS у globals.css, логіка в `lib/badges.ts`. Класи `.badge` + `.badge-{cash,fop,card,deposit,enrolled,attended,...,type,danger,class-cancelled,completed}`. Не оголошувати локальні `.badge` в module.css; не патерн `${styles.badge} ${styles[..]}`.

## Layout-механіка (globals.css)

**Глобально:** `html, body { overflow: hidden }` — **ніколи не міняти через JS**.

**Shared page layout** — для всіх сторінок крім `/schedule*`:

| Клас | Desktop | ≤640px |
|------|---------|--------|
| `.page-layout` | flex-row (sidebar+main) | `height: calc(100svh - var(--bottom-nav-h) - safe-area); overflow:hidden` — жорстко обрізає висоту над BottomNav |
| `.page-main` | flex-col, `margin-left: var(--sidebar-w)`, `min-height:100vh` | `margin-left:0; height:100%` |
| `.page-head` | `flex-shrink:0; sticky top:0; z:10` | `position:static`. Містить topbar + filterBar/tabNav |
| `.page-body` | `flex:1; min-height:0; overflow-y:auto` | `padding-bottom:16px` (звичайний, НЕ компенсація BottomNav) |
| `.page-foot` | `flex-shrink:0; border-top` | `padding-bottom:8px` |

- Нова сторінка **не задає** margin-left/height/overflow/padding-bottom під BottomNav — усе вже в цих класах.
- **НЕ додавати** `padding-bottom: calc(--bottom-nav-h + ...)` на page-body/foot — застарілий патерн, перекривав пагінацію. Висота обрізана на рівні `.page-layout`.
- **BottomNav**: `position:fixed; z:200; bottom:0` — поза потоком. Контент фізично не доходить під нього (height обрізана).
- `.page-content` — застарілий клас, лишається для сумісності (accounting/trainers/*).
- Module.css сторінок: мобільна `@media` тільки специфіка (topbar/flex-wrap/padding), не дублювати висоту/overflow.

**Mobile filterbar — два патерни:**
- **Стопка** (`flex-wrap:wrap`, кожен `width:100%`) — сторінки з ≤3 полями вводу: `/sales`, `/clients`.
- **Горизонтальний скрол** (`overflow-x:auto; overflow-y:hidden; flex-wrap:nowrap`) — 4+ фільтрів-кнопок: `/journal`, `/accounting`. `overflow-y:hidden` блокує вертикальний скрол при touch-свайпі.
- Інтерактивні елементи: `height: var(--control-h)`.
- ⚠️ `@media`-блок завжди в **кінці** module.css.
- Десктоп/мобайл таблиці: `.tableDesktop` / `.cardList` обидва в JSX, перемикання `display:none/flex`.

---

## Per-page деталі

### /schedule
Власна scroll-архітектура (не page-layout). `main { height:100svh }`, скролиться лише `bodyGridWrapper`.

- **View:** Day (всі зали в колонку + ScheduleRightPanel з інлайн-календарем) / Week (7 днів Пн–Нд, right-panel прихована, авто-вибір першого залу). Mobile — лише day (форс через `useEffect(isMobile)`).
- **Константи:** `MIN_HOUR=8`, `MAX_HOUR=22`, `HOUR_HEIGHT=83`.
- **Navigation:** назад ≤30 днів (інакше редірект на сьогодні, кнопка disabled на межі). ± день у day, ± тиждень у week.
- **ClassCard** (в page.tsx): повний режим (≥60px: title→час→тренер→місця+progress) / компакт (<60px). Ліва смуга 3px кольору типу + обводка 1px. Progress bar знизу 2.5px (зелений/жовтий/червоний). Now line: full-width у day, per-column у week.
- **Week headers:** `.weekDayHeader` (Пн 18…), сьогодні — зелений pill. `.weekFilterLabel` під датами.
- **Click** скрізь → `ClassDetailModal`.
- **Mobile:** topbar = назва дня+дата + іконка-число (сьогодні) + 📅. Свайп ←/→ міняє день (`touchstart/move passive:false` на bodyGridWrapper, slide-out .18s). Календар → bottom sheet. FAB `bottom: calc(--bottom-nav-h + 16px); z:250`. ClassModal завжди fullScreen, ClassDetailModal fullScreen.
- **⚠️ Mobile day-view — два дропдауни (зал + тренер), як на десктопі.** Вибір залу в `FilterSelect` керує двома режимами:
  - **«Всі зали» (overview, `filterHall=''`)** — усі зали одночасно у вузьких колонках (~85px). Картки → `overview`-вигляд: **абревіатура типу** (`ticketTypeAbbr` з badges.ts — G/I/ID/IT/H/SH/P/S, латиниця-значок кольором типу) + **місця `зайнято/всього`** (червоним коли повно) у верхньому рядку, **тренер** нижче; без часу (він у гутері). Класи `.cardOverview`/`.cardOverviewTop`/`.cardAbbr`/`.cardOverviewSlots`(`.cardOverviewSlotsFull`)/`.cardOverviewTrainer`, тісніший padding через `.card:has(.cardOverview)`. Повна сітка дня з першого погляду.
  - **Один зал (`filterHall=id`)** — на весь екран із повними деталями (як десктоп).
  - `overview`-прапор = `isMobile && viewMode==='day' && hallColumns.length>1`, прокидається page→HallSubCol→ClassCard. Тап у будь-якому режимі → ClassDetailModal.
  - Гориз. скрол **колонок** залів НЕ годиться — конфліктує зі свайпом зміни дня (будь-який гориз. свайп `preventDefault`+міняє день); тому overview = вузькі колонки в межах viewport, а не скрол.

### /schedule/templates
View: День / Тиждень / Список. Mobile — форс day.
- **HallWeekGrid:** week = 7 колонок-днів, кожна з підколонками залів (HallSubCol). Day = той самий грід з `singleDayDow`. `HOUR_HEIGHT=83`. `min-width:0` на dayCol/header/hallSubCol щоб day fills width.
- **TemplateCard** — як ClassCard. Клік → SeriesModal; клік на пустий слот → prefill (dow+time+hallId).
- **SeriesModal порядок полів:** День+Час → Тип → Тренер+Зал → Тривалість+Ліміт → Назва → Нотатки → Постійники. `fullScreen={isMobile}`.
- **Mobile:** topbar → `mobileTopNav` (← [день] →, navBtn 44×44). FAB як у /schedule. Filterbar static + горизонт. скрол з дропдаунами (зал+тренер+пошук). Як у /schedule: **«Всі зали»** = overview всіх залів (вузькі колонки, картки абревіатура+місця+тренер — `HallWeekGrid` prop `overview`), або **один зал** на весь екран (`filterHall` звужує `dayTemplates` → грід рендерить лише обрану колонку). `overview` = `isMobile && day && !filterHall && activeHalls>1`, прокидається HallWeekGrid→DayColumn→HallSubCol→TemplateCard.

### /clients
- Filterbar — стопка. Card: ім'я + депозит-бейдж у рядку; phone як `<a tel:>` + соцмережі (тільки заповнені). Тап → `/clients/[id]`.

### /sales
- Filterbar — стопка: пошук (100%) + `SalesDateRangePicker` (у `.filterDateWrap`, 100%) + «Скинути» (при hasFilters).
- **SalesDateRangePicker mobile:** bottom sheet, пресети горизонт. скрол, один місяць.
- Card: клієнт+дата / операція / оплачено+метод / Δдепозит (якщо ≠0) / тренер (якщо є) / Змінити+Видалити. SaleModal fullScreen. Confirm: `width: calc(100% - 32px); max-width:360px`.

### /journal
- Власний `journal.module.css` (`.layout/.main/.topbar/.stickyHead`), `main { min-width:0 }`. `.stickyHead` = topbar+filterBar (desktop sticky / mobile static).
- Filterbar: DatePicker×2 + FilterSelect×4 (тренер/зал/тип/статус) + × (при активних).
- Table 20/стор: Дата|Час|Тип|Назва|Тренер|Зал|Записів|Статус. Pagination ‹› + counter. Клік → ClassDetailModal.
- Query `listPastClasses` (lib/queries/classes.ts): `starts_at < today`, фільтри dateFrom/To/hall/trainer/ticketType/isCancelled, повертає `{data, count, error}`.
- Mobile: filterbar горизонт. скрол; card: тип+дата·час / тренер·зал·N·статус.

### /accounting
Full-width (без max-width — звірка поруч із банком).
- **Topbar:** заголовок + кнопки підсумків (кнопка «+ Витрата/Дохід» — у `/sales`).
- **Filterbar (sticky):** пресети Сьогодні/Тиждень/Місяць + DatePicker від/до + таби методу (Всі/Готівка/ФОП/Картка/Депозит) + dropdown тренера (тільки при Готівка).
- **Summary cards:** Готівка/ФОП/Картка/Депозит/Витрати/Надходження. Готівка/ФОП/Картка враховують витрати (зменшуються). «Надходження» = cash+fop+card після витрат, без deposit.
- **Feed:** sales + studio_expenses + trainer_payments, сорт за датою. Колонки: ✓|Дата+час|Клієнт|Абонемент/Коментар|Ціна|На депозит|Сума|Метод.
- **studio_expenses рядок:** ShoppingBag (expense, червоний) / TrendingUp (income, зелений); «Витрата/Дохід студії»; Trash2. Mobile card: ліва смуга `3px var(--danger)` для expense.
- **saleRevenue(s)** = `ticket_id ? price_paid : max(0, amount_given)`.
- **Чекбокси:** локальний `Set<string>` (скидається при reload), тільки для sales. Header — indeterminate/checked.
- **accountKey → фільтр:** `fop`/`personal_card` → метод; інакше cash + `cash_holder=accountKey`.
- Фільтрація на клієнті після fetch. Зміна методу скидає тренера. Deposit ховає expenses.

### /settings/*
- `settings/layout.tsx` (Sidebar+BottomNav+main), shared `settings.module.css`.
- Topbar: заголовок + «+ Додати…», `height: var(--topbar-h)`, sticky.
- **tabNav** (mobile): окремий рядок під topbar, sticky `top: var(--topbar-h)`, горизонт. скрол, `<a href>` (hard nav), desktop `display:none`.
- Активні + архів (`ArchiveSection` з chevron+лічильником). `.tableDesktop`/`.cardList`.
- **ToggleBtns** — inline пара TRUE/FALSE для `is_active` (`.toggleActiveTrue/False`).
- Карта архіву: `opacity:.65` + «Відновити». training-types: + «Редагувати» → TrainingTypeModal.
