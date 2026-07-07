# Frontend

Інваріанти → [../CLAUDE.md](../CLAUDE.md), карта коду → [ARCHITECTURE.md](ARCHITECTURE.md). Тут — верстка, компоненти, mobile.

## Структура

```
app/layout.tsx        RefsProvider + <Toaster/> (sonner)
app/globals.css       CSS-токени, shared layout-класи, @keyframes, бейджі
app/[route]/page.tsx + [route]/*.module.css
components/*Modal.tsx  Sale/Client/Class/Series/EnrollClient/ClassDetail/Hall/Ticket/Trainer/TrainingType/StudioExpense/SlotFinder
components/            Sidebar, BottomNav, HallWeekGrid, ScheduleRightPanel
components/Date*       DatePicker, DateRangePicker, DateTimePicker, DateTimeInput, SalesDateRangePicker, CalendarPopover, MonthNav
components/features/   ClientSearchCombobox
components/icons/navigation.tsx   усі нав-SVG як React-компоненти
components/ui/         ModalShell, ModalFooter, FormField, Pagination, ActionSelect, FilterSelect, SocialHandleInput
components/ui/         shadcn: button/calendar/command/dialog/popover/select/table
```

## UI-компоненти

- **ModalShell** (`ui/ModalShell.tsx`) — обгортка ВСІХ модалок (overlay+header+body+footer). Props: `title`, `onClose`, `footer`, `children`, `size`('form'|'detail'), `modalClassName`, `bodyClassName`, `headerActions`.
  - Ширина — **лише 2 токени** (`SIZE_WIDTH`): `form`=440 (дефолт), `detail`=760 (лише ClassDetailModal). Довільний `width` НЕ передавати.
  - ≤640px → **bottom sheet** (`max-height:92dvh`, `width:100%`, анім `bottomSheetIn`, footer `safe-area-inset-bottom`). `mobileFullScreen` видалено.
  - z-index: overlay `300` > BottomNav `200`. Поповери дат (CalendarPopover/SalesDateRangePicker) і hover-тултіп розкладу — `400` (над модалкою; НЕ `9999`).
- **ModalFooter** (`ui/ModalFooter.tsx`) — Скасувати/Зберегти. Props: `onCancel`, `onSave?`, `saveLabel`, `cancelLabel`, `loading`, `saveType`('button'|'submit'), `disabled`. Save лише при `onSave`.
- **FormField** (`ui/FormField.tsx`) — label+control+errorHint+hint. ⚠️ `input[type=time]` нормалізовано `height:39px; padding-top/bottom:0`.
- **ActionSelect** (`ui/ActionSelect.tsx`) — Radix SelectPrimitive + CSS Modules (НЕ shadcn Select — тягне Tailwind-vars, яких нема). У ClassDetailModal для зміни статусу.
- **FilterSelect** (`ui/FilterSelect.tsx`) — inline Radix для фільтрів. ⚠️ Radix не приймає `value=""` → пусте мапиться в sentinel `'__all__'`.
- **Pagination** (`ui/Pagination.tsx`) — page size 20/50/100 + range з «…» + Prev/Next.
- **CopyButton** (`ui/CopyButton.tsx`) — Geist Copy Button (звірено з `Vercel_DS/Copy Button`): outline-стиль, **розмір точно як Geist — 40px** (`--geist-form-height`), **іконка 16px заливна** (точні Geist-паси copy/check), кросфейд Copy↔Check (opacity+scale 200ms, галочка в кольорі тексту — НЕ зелена). Props: `text` (string | `() => string` — ліниво), `label?` (без нього → квадратна icon-only 40×40), `copiedLabel?`, `title?`, `ariaLabel?`, `className?`. Помилка → `toast.error`. Єдина копі-кнопка: ClassDetailModal header, dashboard (SessionDebtBlock/FreeSlotsBlock). НЕ плодити локальні `.copyBtn`/`.btnCopy`.

## CSS токени (globals.css)

Теми: світла `:root` + темна `@media prefers-color-scheme: dark`. У `*.module.css` — **тільки `var()`-токени**, НІ HEX/rgba.

- Фони `--bg/-2/-3` · Текст `--text/-2/-3`
- Бордери `--border/-hover/-strong` — товщина **скрізь `1px`** (`0.5px` = баг Chrome mobile)
- Акцент `--accent/-dim/-text/-border*` (зелений) · Стани `--danger/-dim/-border*`, `--success/-dim`, `--warning/-dim`
- Оплата `--fop/-dim`, `--card/-dim`, `--deposit/-dim`
- Анім `--motion-fast:.12s ease-out`, `--motion-standard:.18s ease-in-out`. @keyframes: `dotPulse`, `overlayIn`, `modalIn`, `bottomSheetIn`
- Layout: `--control-h:32px`(44 mobile), `--topbar-h:64px`, `--topbar-py:16px`, `--topbar-px:28px`, `--sidebar-w:196px`, `--right-panel-w:280px`, `--bottom-nav-h:56px`, `--radius-xs:4px`, `--radius:10px`, `--radius-sm:6px`, `--radius-full:999px`

Shared utils: `.btn-primary`, `.loading-dots`, `.data-table-wrap`+`.data-table`. Нестандартні таблиці (accounting/salary/rates) — у module.css.

**Бейджі:** CSS у globals.css, логіка `lib/badges.ts`. Класи `.badge` + `.badge-{cash,fop,card,deposit,enrolled,attended,…,type,danger,class-cancelled,completed}`. НЕ оголошувати локальний `.badge`; НЕ патерн `${styles.badge} ${styles[..]}`.

**Бейджі балансу** (депозит ₴ / залишок занять год) — квадратні чіпи `border-radius:4px`, 3 стани (єдині для грошей і сесій): `balance-ok` (зел, `>0`), `balance-zero` (жовт, `=0`), `balance-warn` (черв, `<0`). Локальні варіанти НЕ плодити.

## Layout-механіка (globals.css)

**Глобально:** `html,body{overflow:hidden}` — **ніколи не міняти через JS**.

Shared page layout (всі сторінки крім `/schedule*`):

| Клас | Desktop | ≤640px |
|------|---------|--------|
| `.page-layout` | flex-row | `height:calc(100svh - --bottom-nav-h - safe-area); overflow:hidden` |
| `.page-main` | flex-col, `margin-left:--sidebar-w`, `min-height:100vh` | `margin-left:0; height:100%` |
| `.page-head` | `flex-shrink:0; sticky top:0; z:10` | `position:static`; topbar+filterBar/tabNav |
| `.page-body` | `flex:1; min-height:0; overflow-y:auto` | `padding-bottom:16px` |
| `.page-foot` | `flex-shrink:0; border-top` | `padding-bottom:8px` |

- Нова сторінка **не задає** margin-left/height/overflow/padding-bottom під BottomNav — усе в класах.
- **НЕ** `padding-bottom:calc(--bottom-nav-h+…)` на body/foot (застаріле, перекривало пагінацію). Висота обрізана на `.page-layout`.
- BottomNav: `position:fixed; z:200; bottom:0` — поза потоком.
- `.page-content` — застарілий, лишається для accounting/trainers/*.
- Module.css: мобільна `@media` тільки специфіка (topbar/flex-wrap/padding), НЕ дублювати height/overflow. ⚠️ `@media`-блок завжди в **кінці** файлу.

**Mobile filterbar — 2 патерни:**
- Стопка (`flex-wrap:wrap`, кожен `width:100%`) — ≤3 поля: `/clients`.
- Гориз. скрол (`overflow-x:auto; overflow-y:hidden; flex-wrap:nowrap`) — 4+ кнопок: `/journal`, `/accounting`. `overflow-y:hidden` блокує верт. скрол при touch.
- Інтерактив: `height:--control-h`.

**Filter chips — спільний словник `.filterChips`/`.filterChip`/`.filterChipActive` (globals.css):** смуга пілюль single-select, гориз. скрол, активний = `--accent-dim`, «Всі»/«Всі тренери» = скид. Використовують `/schedule` mobile (`.mobileTl*Chips` тепер тримають лише `border-bottom`, композять глобальні класи) і `/sales` mobile (метод+тренер). НЕ плодити локальні копії chip-візуалу.

Desktop/mobile таблиці: `.tableDesktop`/`.cardList` обидва в JSX, перемикання `display:none/flex`.

---

## Per-page

### /schedule
**Desktop:** scroll-архітектура (не page-layout), `main{height:100svh}`, скролиться `bodyGridWrapper`. Day (всі зали + ScheduleRightPanel календар) / Week (7 дн, right-panel скрита). Константи: `MIN_HOUR=8`, `MAX_HOUR=22`, `HOUR_HEIGHT=83`.

**SlotFinderModal («Підбір слота»)** — візард запису на індив: клієнт (ClientSearchCombobox + залишок `client_session_balances`, попередження при 0 — НЕ блокує) → тренер («Будь-який»=null)/дата(min=сьогодні)/тривалість 60-90-120 → матриця зал×година (`computeSlotMatrix` у `lib/slotFinder.ts`: free/hall_busy/trainer_busy/selftraining/past; самотрен = жовтий «за домовленістю», некликабельний) → confirm: `checkClassConflicts` (серверна перепроверка) → `insertClassReturningId` (`ticket_type='individual'`, capacity=1) → `enrollClient`; фейл запису після створення = warning-тост, клас лишається. Тригери: btn-secondary «Підбір слота» в topbarRight (desktop) + `.fabSlotFinder` (3-й FAB, лупа, над FAB-календарем). ModalShell `detail`, тости sonner.

**Mobile:** `MobileScheduleTimeline` (page.tsx:508–807), вбудована компонента з власною логікою. Не використовує `page-layout` або desktop grid.

⚠️ **Дубль із розбіжністю.** Друга копія `MobileScheduleTimeline` живе в `app/trainer/schedule/TrainerSchedule.tsx` (інтерфейс L454, ф-ція L478, рендер L1023). Це **НЕ точна копія** — фільтр-модель навмисно інша:

| | /schedule (адмінка) | /trainer/schedule |
|---|---|---|
| Фільтр залу | `filterHall` (чипи) | `filterChip` (`'all'` \| hallId, чипи) |
| Фільтр тренера | `filterTrainer` (чипи) | `filterTrainer` (чипи, окремий від `filterChip`) |
| Колбек | `onHallFilter` + `onTrainerFilter` | `onFilterChip` + `onTrainerFilter` |
| Своє заняття | — | `viewerTrainerId` → `isOwn` (підсвітка свого) |

Спільні: розмітка `.mobileTl*`, утиліти (`weekOf`/`classCoversHour`/`freeHallsByHour`/`nowTop`), `TL_HOURS [8..22]`, свайп. CSS `.mobileTl*` дубльований у двох module.css. **Правиш одну — звіряй другу.** Виносити в спільний компонент НЕ варто, поки фільтр-моделі не зведені до спільної (інакше абстракція обростає прапорцями).

| Елемент | Desktop | Mobile |
|---------|---------|--------|
| **Топбар** | Дата + кнопки ← → Сьогодні | Місяць + неділя-полоса (7 днів, анім свайпу) |
| **Фільтрбар** | FilterSelect зал + тренер (sticky); `.filterBar` `display:none` на mobile | Дві смуги чипів: зали (`.mobileTlHallChips`) + тренери (`.mobileTlTrainerChips`), горизонтальний скрол кожна |
| **Основа** | Grid колонок залів × рядків часу | Тайм-лайн: `.mobileTlGrid` → `.mobileTlRow` для TL_HOURS [8..22] |
| **Картка заняття** | ClassCard із типом/часом/тренером | `.mobileTlCard`: назва + час·зал·тренер·місця (повна інформація) |
| **Вільні слоти** | — | `.mobileTlFreeSlot` (пунктирна рамка, + Зал/Вільно) |
| **Now line** | Per-column | `.mobileTlNowLine` у поточній годині (точка + лінія) |

**MobileScheduleTimeline структура:**
- `.mobileTlShell` обгортка
  - `.mobileTlStripWrap`: `.mobileTlMonth` + `.mobileTlDays` (7 днів, кнопки `.mobileTlDay`, анім `.mobileTlSlideLeft/Right`)
  - `.mobileTlHallChips`: кнопки «Всі» + по залу (`.mobileTlHallChipActive` = вибраний; ховається при ≤1 залі)
  - `.mobileTlTrainerChips`: «Всі тренери» + по тренеру (ті ж `.mobileTlHallChip*` класи; ховається при ≤1 тренері)
  - `.mobileTlScroll` → `.mobileTlGrid` (TL_HOURS.map)
    - `.mobileTlRow` = `.mobileTlGutter` (час `.mobileTlHourLabel`) + `.mobileTlRowBody`
      - `.mobileTlRowLine` (сірий розділювач)
      - `.mobileTlNowLine` (якщо час зараз): `.mobileTlNowDot` (точка) + `.mobileTlNowLineLine` (лінія)
      - Картки: `.mobileTlCard` + `.mobileTlCardBody` = `.mobileTlCardRow` + `.mobileTlCardMeta`. Стани: `.mobileTlCardCancelled`, `.mobileTlCardSlotsFull` (червоний), `.mobileTlCardWaitlist` (жовтий)
      - Вільні: `.mobileTlFreeSlot` → `.mobileTlFreeSlotBody` = `.mobileTlFreeSlotRow` + `.mobileTlFreeSlotMeta`
    - `.mobileTlEmpty` (якщо немає занять)

**Props MobileScheduleTimelineProps (admin):** classes, selectedDate, today, typeLabels, activeHalls, activeTrainers, filterHall, filterTrainer, onDateSelect, onHallFilter, onTrainerFilter, onCardClick, onFreeSlotClick. Trainer-варіант: `filterChip`/`onFilterChip` замість `filterHall`/`onHallFilter`, + `viewerTrainerId`.

**Логіка:**
- `week = weekOf(anchorDate)`: масив 7 днів
- Свайп на полосі: `touchstart/move/end` (dx < −40 → next week, dx > 40 → prev week), анім `.mobileTlSlideLeft/Right`
- `classCoversHour(cls, h)`: час старту + тривалість перекривають годину h
- `freeHallsByHour`: Map<hour, Hall[]>, залу без занять у слоті. Окремо для `filterHall=""` (всі) vs `filterHall=id` (конкретний)
- `nowTop`: залишок + хвилини в поточній годині (оновлюється кожні 60 сек)

### /schedule/templates
View: День/Тиждень/Список. Mobile — форс day.
- **HallWeekGrid:** week = 7 колонок-днів з підколонками залів (HallSubCol). Day = той самий грід з `singleDayDow`. `HOUR_HEIGHT=83`. `min-width:0` на dayCol/header/hallSubCol щоб day fills width.
- **TemplateCard** — як ClassCard. Клік → SeriesModal; клік пустого слота → prefill (dow+time+hallId).
- **SeriesModal порядок:** День+Час → Тип → Тренер+Зал → Тривалість+Ліміт → Назва → Нотатки → Постійники. `fullScreen={isMobile}`.
- Mobile: topbar → `mobileTopNav` (← [день] →, 44×44). FAB як /schedule. Filterbar static + гориз. скрол (зал+тренер+пошук). `overview`=«Всі зали» (вузькі колонки, картки абревіатура+місця+тренер, prop `overview`) / один зал на весь екран (`filterHall` звужує `dayTemplates`). `overview`=`isMobile && day && !filterHall && activeHalls>1`, прокидається HallWeekGrid→DayColumn→HallSubCol→TemplateCard.

### /clients
Filterbar стопка. Card: ім'я + депозит-бейдж у рядку; phone `<a tel:>` + соцмережі (тільки заповнені). Тап → `/clients/[id]`.

### /sales
Topbar: «+ Студійна операція» (завжди) + «+ Продаж» (`.saleBtnDesktop`, схована на mobile). Mobile: FAB `+` справа внизу (`.fab`, патерн /schedule) дублює «+ Продаж».
Filterbar: desktop — таби(Всі/Продажі/Операції) + пошук + FilterSelect метод + FilterSelect тренер + `SalesDateRangePicker` + «Скинути». **Mobile — лише пошук + кнопка «Фільтри»** (`.filterToggleBtn`, бейдж `.filterToggleBadge` = `activeFilterCount`: таб≠all + метод + тренер + дата). Решта (таби, чипи методу/тренера, дата, «Скинути») у **bottom-sheet** `.advancedFilters`/`.sheetBody` (стан `filtersOpen`; overlay z:300 + `bottomSheetIn` + `safe-area-inset-bottom` + «Готово» `.sheetDone`).
⚠️ **Desktop незмінний через `display:contents`:** `.advancedFilters` + `.sheetBody` = `display:contents` → діти течуть у `.filters` як раніше; sheet-хром (`.sheetOverlay/.sheetHeader/.sheetDone`) + `.tabsMobileSheet` сховані; таби рендеряться двічі — `.tabsDesktopOnly` (desktop) і `.tabsMobileSheet` (у sheet). FilterSelect метод/тренер сховані на mobile (`.filterDesktopOnly`→`none`), натомість 2 смуги чипів `.salesChipsMobile` (глобальні `.filterChips`) у sheet. Стан спільний із desktop (`useSales`), тап → `setPage(0)`. SalesDateRangePicker mobile: bottom sheet, пресети гориз. скрол, 1 місяць. Card: клієнт+дата / операція / оплачено+метод / Δдепозит(якщо ≠0) / тренер / Змінити+Видалити. SaleModal fullScreen. Confirm: `width:calc(100% - 32px); max-width:360px`.

### /journal
Власний `journal.module.css` (`.layout/.main/.topbar/.stickyHead`), `main{min-width:0}`. `.stickyHead`=topbar+filterBar (desktop sticky/mobile static). Filterbar: DatePicker×2 + FilterSelect×4 (тренер/зал/тип/статус) + ×. Table 20/стор: Дата|Час|Тип|Назва|Тренер|Зал|Записів|Статус. Pagination ‹›+counter. Клік → ClassDetailModal. Query `listPastClasses` (lib/queries/classes.ts): `starts_at<today`, фільтри dateFrom/To/hall/trainer/ticketType/isCancelled → `{data,count,error}`. Mobile: filterbar гориз. скрол; card: тип+дата·час / тренер·зал·N·статус.

### /accounting
Full-width (звірка поруч із банком).
- Topbar: заголовок + кнопки підсумків («+ Витрата/Дохід» — у `/sales`).
- Filterbar sticky: пресети Сьогодні/Тиждень/Місяць + DatePicker від/до + таби методу (Всі/Готівка/ФОП/Картка/Депозит) + dropdown тренера (тільки при Готівка).
- Summary cards: Готівка/ФОП/Картка/Депозит/Витрати/Надходження. Готівка/ФОП/Картка враховують витрати. «Надходження»=cash+fop+card після витрат, без deposit.
- Feed: sales+studio_expenses+trainer_payments, сорт за датою. Колонки: ✓|Дата+час|Клієнт|Абонемент/Коментар|Ціна|На депозит|Сума|Метод.
- studio_expenses рядок: ShoppingBag(expense,черв)/TrendingUp(income,зел); «Витрата/Дохід студії»; Trash2. Mobile card: ліва смуга `3px var(--danger)` для expense.
- `saleRevenue(s)` = `ticket_id ? price_paid : max(0, amount_given)`.
- Чекбокси: локальний `Set<string>` (скид при reload), тільки sales. Header indeterminate/checked.
- `accountKey`→фільтр: `fop`/`personal_card`→метод; інакше cash + `cash_holder=accountKey`.
- Фільтрація на клієнті після fetch. Зміна методу скидає тренера. Deposit ховає expenses.

### /settings/*
- `settings/layout.tsx` (Sidebar+BottomNav+main), shared `settings.module.css`. Topbar: заголовок + «+ Додати…», `height:--topbar-h`, sticky.
- **tabNav** (mobile): рядок під topbar, sticky `top:--topbar-h`, гориз. скрол, `<a href>` (hard nav), desktop `display:none`.
- Активні + архів (`ArchiveSection` chevron+лічильник). `.tableDesktop`/`.cardList`.
- **ToggleBtns** — inline пара TRUE/FALSE для `is_active` (`.toggleActiveTrue/False`).
- Карта архіву: `opacity:.65` + «Відновити». training-types: + «Редагувати» → TrainingTypeModal.

---

## Scaffold (готові шаблони — `docs/templates/`, не винаходити)

- **Форм-модалка** → копіювати `TrainerModal` (RHF+FormField+ModalShell+ModalFooter+VM). **НЕ** `SaleModal` (спец `useSaleForm`/`useSaleSubmit`). → [templates/new-modal.md](templates/new-modal.md).
- **Довідкова сутність** (`{id,…,is_active}` + сторінка /settings) → міграція (RLS+policy+GRANT, інакше deny-all) → `sync:schema` → `refEntityQueries` → `useRefEntity`-обгортка → модалка → `RefEntityPage`. → [templates/new-feature.md](templates/new-feature.md).
- **/settings довідник-сторінка** → `RefEntityPage` (`app/settings/_RefEntityPage.tsx`) + масив `RefColumn`, образець `app/settings/halls/page.tsx`. Editable → prop `editable` + модалці `existing={editing}`, образець `training-types`.
- **RPC-виклик** → обгортка в `lib/queries/`, розпаковка `callRpc()` (`lib/rpc.ts`).
- **Type-check під час `npm run dev`** → `npx tsc --noEmit` (НЕ `npm run build` — ділить `.next` з dev, ламає чанки).
