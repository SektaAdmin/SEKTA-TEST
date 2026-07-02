# Geist — витягнута документація

> Автозгенеровано зі збереженого дампу `Vercel_raw/geist-docs` (vercel.com/geist).
> Скрипти: `scripts/geist/extract-tokens.mjs` (`npm run geist:tokens`), `scripts/geist/extract-components.mjs` (`npm run geist:components`).
> **Не редагувати вручну** — перегенерувати зі скриптів.

## Фундамент

- [tokens.md](tokens.md) — 405 токенів (колір light/dark, spacing, radius, shadow, typography, motion).
- [theming.md](theming.md) — themed-система варіантів (кольори компонентів: base/fill/contrast/dark × light/dark). **Закриває 🟡 «тонкі» компоненти.**

## Компоненти (77)

Легенда: 🟢 = структура/варіанти витягнуто з HTML · 🟡 = варіанти-кольори керуються `data-*`+themed-CSS (у HTML не видно) → див. [theming.md](theming.md) для їхніх кольорів.

| Компонент | Розділів | data-slot | Форм-варіантів | Покриття |
|---|---:|---:|---:|---|
| [avatar](components/avatar.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [badge](components/badge.md) | 6 | 0 | 3 | 🟢 варіанти |
| [banner](components/banner.md) | 2 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [book](components/book.md) | 13 | 1 | 0 | 🟢 DOM-контракт |
| [brands](components/brands.md) | 18 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [breadcrumbs](components/breadcrumbs.md) | 4 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [browser](components/browser.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [button](components/button.md) | 12 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [calendar](components/calendar.md) | 14 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [card](components/card.md) | 7 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [checkbox](components/checkbox.md) | 9 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [choicebox](components/choicebox.md) | 10 | 2 | 0 | 🟢 DOM-контракт |
| [clearable-input](components/clearable-input.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [code](components/code.md) | 2 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [code-block](components/code-block.md) | 14 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [collapse](components/collapse.md) | 17 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [colors](components/colors.md) | 7 | 0 | 1 | 🟢 варіанти |
| [combobox](components/combobox.md) | 19 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [command-menu](components/command-menu.md) | 9 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [context-card](components/context-card.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [context-menu](components/context-menu.md) | 10 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [copy-button](components/copy-button.md) | 2 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [description](components/description.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [destructive-action-modal](components/destructive-action-modal.md) | 10 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [dots-menu](components/dots-menu.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [drawer](components/drawer.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [empty-state](components/empty-state.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [entity](components/entity.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [error](components/error.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [error-card](components/error-card.md) | 3 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [feedback](components/feedback.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [fieldset](components/fieldset.md) | 12 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [file-tree](components/file-tree.md) | 2 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [gauge](components/gauge.md) | 13 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [geistcn-icons](components/geistcn-icons.md) | 1 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [grid](components/grid.md) | 17 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [input](components/input.md) | 15 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [introduction](components/introduction.md) | 1 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [keyboard-input](components/keyboard-input.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [label](components/label.md) | 4 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [load-more-button](components/load-more-button.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [loading-dots](components/loading-dots.md) | 7 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [materials](components/materials.md) | 4 | 7 | 0 | 🟢 DOM-контракт |
| [menu](components/menu.md) | 15 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [middle-truncate](components/middle-truncate.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [modal](components/modal.md) | 15 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [multi-select](components/multi-select.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [note](components/note.md) | 18 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [pagination](components/pagination.md) | 3 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [phone](components/phone.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [progress](components/progress.md) | 13 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [project-banner](components/project-banner.md) | 9 | 0 | 1 | 🟢 варіанти |
| [radio](components/radio.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [relative-time-card](components/relative-time-card.md) | 3 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [scroller](components/scroller.md) | 10 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [search-input](components/search-input.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [select](components/select.md) | 9 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [separator](components/separator.md) | 8 | 1 | 0 | 🟢 DOM-контракт |
| [sheet](components/sheet.md) | 8 | 1 | 0 | 🟢 DOM-контракт |
| [show-more](components/show-more.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [skeleton](components/skeleton.md) | 14 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [slider](components/slider.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [snippet](components/snippet.md) | 9 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [spinner](components/spinner.md) | 8 | 0 | 1 | 🟢 варіанти |
| [split-button](components/split-button.md) | 6 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [status-dot](components/status-dot.md) | 8 | 0 | 1 | 🟢 варіанти |
| [switch](components/switch.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [table](components/table.md) | 11 | 10 | 0 | 🟢 DOM-контракт |
| [tabs](components/tabs.md) | 11 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [text-with-copy-button](components/text-with-copy-button.md) | 3 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [textarea](components/textarea.md) | 8 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [theme-switcher](components/theme-switcher.md) | 5 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [toast](components/toast.md) | 16 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [toggle](components/toggle.md) | 7 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [tooltip](components/tooltip.md) | 13 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |
| [typography](components/typography.md) | 6 | 7 | 0 | 🟢 DOM-контракт |
| [video](components/video.md) | 4 | 0 | 0 | 🟡 тонкий (варіанти в CSS) |

**Підсумок покриття:** 🟢 12 компонентів зі структурою/варіантами з HTML · 🟡 65 themed (структура з HTML, кольори варіантів — у [theming.md](theming.md)).
