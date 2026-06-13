> ⚠️ **LEGACY (заморожено, не редагувати).** Ранній беклог UI-kit / архітектурних порад (травень 2026).
> Більшість пунктів уже впроваджено (FormField, бейджі, пагінація, токени). Лишено для історії;
> актуальні патерни — у [../ARCHITECTURE.md](../ARCHITECTURE.md) і кореневому `CLAUDE.md`.

# Рекомендації з розвитку архітектури та UI (sekta-crm)

Цей файл містить стратегічні поради щодо покращення кодової бази та інтерфейсу користувача.

## 1. Компонентний підхід (UI Kit)
Для уникнення дублювання коду та забезпечення цілісності дизайну, рекомендується винести наступні елементи в окремі компоненти в `components/ui/`:

- **Button**: Універсальна кнопка з варіантами `primary`, `secondary`, `accent`, `danger`. (Вже в процесі впровадження).
- **FormField**: Обгортка для `input`/`select`, яка включає в себе `label` та вивід помилок валідації.
- **StatusBadge**: Для відображення статусів оплати (`cash`, `fop`, `deposit`) та статусів запису (`enrolled`, `attended`).
- **Pagination**: Винести логіку `getPageRange` та верстку пагінації з `sales/page.tsx` та `clients/page.tsx`.
- **Loader**: Анімовані крапки або спінер для станів завантаження.

## 2. Оптимізація CSS та Стилів
- **Використання змінних**: Продовжувати використовувати змінні з `globals.css`. Уникати "магічних" чисел (наприклад, `margin: 13px`).
- **Z-index Management**: Створити змінні для `z-index` (наприклад, `--z-modal`, `--z-overlay`, `--z-sidebar`), щоб уникнути конфліктів накладання елементів.
- **Адаптивність**: Додати медіа-запити для мобільних пристроїв, особливо для `Sidebar` та таблиць (використовувати горизонтальний скрол або перехід до "карток" на малих екранах).

## 3. Якість коду (TypeScript & React)
- **DRY (Don't Repeat Yourself)**: Спільні типи даних (наприклад, типи для пагінації) перенести в `types/index.ts`.
- **Custom Hooks**: Логіку завантаження даних (fetch) та фільтрації, яка зараз дублюється на сторінках клієнтів та продажів, можна винести в універсальний хук `useTableData`.
- **Семантика**: Використовувати `<main>`, `<header>`, `<footer>` та семантичні кнопки замість `div` з `onClick` для покращення доступності (Accessibility).

## 4. UX покращення
- **Skeleton Loaders**: Замість трьох крапок при завантаженні таблиць використовувати "скелетони" (сірі блоки, що імітують рядки таблиці), щоб зменшити візуальне сіпання контенту.
- **Confirm Dialogs**: Використовувати універсальний модальний компонент для підтвердження видалення, щоб користувач завжди розумів наслідки своїх дій.
- **Empty States**: Покращити вигляд повідомлень "Нічого не знайдено", додавши іконки або швидкі кнопки дії (наприклад, "Додати клієнта").

## 5. Теми для майбутнього обговорення
Глибокі архітектурні питання для розвитку проекту:

- **Data Access Layer (DAL)**: Винесення прямих запитів `supabase.from()` у сервісні функції (наприклад, `services/clientService.ts`). Це спростить тестування та зміну схеми БД.
- **Управління станом та кешування**: Впровадження SWR або React Query для автоматичного оновлення даних між різними сторінками (наприклад, оновлення балансу в списку клієнтів після продажу).
- **Обробка помилок**: Створення глобального обробника помилок та Error Boundaries для запобігання повному падінню інтерфейсу при помилках API.
- **Безпека та масштабування (Supabase)**: Налаштування гранулярних RLS політик (розподіл прав Адмін/Тренер) та індексація бази для швидкого пошуку.
- **Продуктивність інтерфейсу**: Віртуалізація довгих списків та оптимізація ререндерів (`useMemo`, `useCallback`) у складних формах.
- **Advanced UX**: Впровадження гарячих клавіш (Hotkeys) та Skeleton Screens для покращення сприйняття швидкості системи.

## 6. Технічні специфікації (Blueprints)
*Цей розділ містить готовий код для майбутнього впровадження, щоб не засмічувати проект новими файлами під час аналізу.*

### 6.1. Компонент Pagination
```tsx
// components/ui/Pagination.tsx
import React from 'react'
import styles from './Pagination.module.css'

interface PaginationProps {
  page: number; pageSize: number; total: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const pages: (number | '...')[] = [0]
  if (current > 2) pages.push('...')
  const start = Math.max(1, current - 1)
  const end = Math.min(total - 2, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 3) pages.push('...')
  pages.push(total - 1)
  return pages
}

export default function Pagination({ page, pageSize, total, pageSizeOptions, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const from = page * pageSize
  const pageRange = getPageRange(page, totalPages)
  return (
    <div className={styles.pagination}>
      <div className={styles.paginationLeft}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>{total === 0 ? '0' : `${from + 1}–${Math.min(from + pageSize, total)}`} з {total}</span>
      </div>
      {totalPages > 1 && (
        <div className={styles.paginationBtns}>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 0}>←</button>
          {pageRange.map((p, i) => p === '...' ? <span key={i}>…</span> : <button key={p} className={p === page ? styles.active : ''} onClick={() => onPageChange(p as number)}>{(p as number) + 1}</button>)}
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}>→</button>
        </div>
      )}
    </div>
  )
}
```

### 6.2. Компонент Button
```tsx
// components/ui/Button.tsx
import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export default function Button({ children, variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button className={`${styles.button} ${styles[variant]} ${styles[size]} ${className || ''}`} {...props}>
      {children}
    </button>
  );
}
```

### 6.3. Компонент FormField
```tsx
// components/ui/FormField.tsx
import React from 'react'
import styles from './FormField.module.css'

interface FormFieldProps {
  id: string;
  label?: string;
  error?: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function FormField({ 
  id, 
  label, 
  error, 
  required, 
  hint, 
  children, 
  className 
}: FormFieldProps) {
  return (
    <div className={`${styles.field} ${className || ''}`}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span className={styles.required}>* обов'язково</span>}
        </label>
      )}
      {children}
      {hint && <div className={styles.hint}>{hint}</div>}
      {error && (
        <p className={styles.errorHint} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

## 7. Поточний статус аналізу
1. **Виявлено дублювання**: Функція `getPageRange` та верстка пагінації в `app/sales/page.tsx` та `app/clients/page.tsx` ідентичні на 95%.
2. **Виявлено потенціал для спрощення**: Використання `Button.tsx` (який ми обговорювали) дозволить уніфікувати кнопки "+ Додати" та кнопки навігації.
3. **Ризики**: Прямі запити до Supabase в компонентах (`supabase.from('clients').select(...)`) ускладнять підтримку при зміні схеми БД.
4. **FormField специфікація**: Аналіз `SaleModal.tsx` показав потребу в гнучкому компоненті, що підтримує кастомні "підказки" (hints) для відображення балансу.

## 8. План подальшого аналізу
1. **Завершено: Аналіз FormField**: Специфікацію підготовлено та додано в розділ 6.3.
2. **Аналіз мобільної адаптивності таблиць**: Перевірити, як поточні таблиці в `app/clients/page.tsx` та `app/sales/page.tsx` поводяться на екранах менше 768px. Виявити місця, де потрібен горизонтальний скрол або зміна відображення на "картки".
3. **Аналіз дублювання логіки завантаження даних**: Порівняти `fetchClients` в `app/clients/page.tsx` та логіку в `useSales` з `app/sales/page.tsx`, щоб визначити спільні патерни для потенційного `useTableData` хука.

---
*Документ створено автоматично Gemini Code Assist для аналізу проекту sekta-crm.*