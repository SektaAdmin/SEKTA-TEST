# Як додати нову довідкову сутність (від міграції до сторінки)

Приклад: додаємо сутність `rooms` (кімнати). Замінюй назви скрізь.

---

## 1. Міграція — `supabase/migrations/<timestamp>_add_rooms.sql`

```sql
CREATE TABLE rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  capacity    int  NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ОБОВ'ЯЗКОВО: RLS + політика + GRANT.
-- Пропустити будь-який з трьох пунктів = таблиця недоступна для застосунку.

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON rooms
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON rooms TO anon, authenticated;
```

> ⚠️ **RLS без політики = deny-all** (так зламувались halls). `ENABLE ROW LEVEL SECURITY` сам по собі блокує всі запити — потрібна явна `POLICY`.

> Нові RPC — обов'язково `SET search_path = public, pg_temp` в тілі функції (вимога security advisor).

Застосувати міграцію — через Supabase MCP (`mcp__supabase__apply_migration`). Supabase CLI у цьому проєкті не встановлено.

---

## 2. Регенерація типів

```bash
npm run sync:schema
```

Потребує `SUPABASE_ACCESS_TOKEN` в оточенні. Регенерує `types/database.types.ts`. Після цього TypeScript «бачить» нову таблицю.

Якщо потрібен доменний тип у `types/index.ts` — додай там:
```ts
export type Room = Database['public']['Tables']['rooms']['Row']
```

---

## 3. Запити — `lib/queries/rooms.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Room } from '@/types'
import { refEntityQueries } from './_refEntity'

// refEntityQueries<T>(tableName, 'колонки для SELECT', { orderBy })
const q = refEntityQueries<Room>('rooms', 'id, name, capacity, description, is_active', { orderBy: 'name' })

export const listRooms      = q.list        // listFn для useRefEntity
export const listActiveRooms = q.listActive  // для RefsContext / селектів
export const toggleRoom     = q.toggle      // toggleFn для useRefEntity

// Кастомний INSERT — якщо потрібна валідація/трансформація понад q.insert:
export async function insertRoom(
  supabase: SupabaseClient,
  payload: { name: string; capacity: number; description: string | null; is_active: boolean }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}
```

---

## 4. Хук — `hooks/useRooms.ts`

Тонка обгортка: перейменовує `data` → `rooms` (іменована властивість, а не масив).

```ts
'use client'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listRooms, toggleRoom } from '@/lib/queries/rooms'
import type { Room } from '@/types'

export function useRooms() {
  const { data, ...rest } = useRefEntity<Room>('rooms', listRooms, toggleRoom)
  return { rooms: data, ...rest }
}
```

### Якщо потрібно додати в RefsContext (`contexts/RefsContext.tsx`)

Тільки якщо ця сутність потрібна у глобальних довідниках (як halls/tickets/trainers/trainingTypes). Додай:

```tsx
// 1. import
import { useRooms } from '@/hooks/useRooms'
import type { Room } from '@/types'

// 2. RefsContextValue
rooms: Room[]
refetchRooms: () => Promise<void>

// 3. У RefsProvider
const { rooms, refetch: refetchRooms } = useRooms()

// 4. У <RefsContext.Provider value={...}>
rooms, refetchRooms,
```

---

## 5. Модалка — `components/RoomModal.tsx`

Копіюй за шаблоном `docs/templates/new-modal.md`. Для довідника достатньо форми «Додати» (без редагування) — якщо потрібне редагування, прийми `existing?: Room | null` і заповни `defaultValues`.

---

## 6. Сторінка — `app/settings/rooms/page.tsx`

```tsx
'use client'
import RoomModal from '@/components/RoomModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listRooms, toggleRoom } from '@/lib/queries/rooms'
import { MSG } from '@/lib/messages'
import { RefEntityPage, type RefColumn } from '../_RefEntityPage'
import styles from '../settings.module.css'
import type { Room } from '@/types'

// Перша колонка — завжди назва (cardRow у мобілці), БЕЗ поля `card`.
const columns: RefColumn<Room>[] = [
  { header: 'Назва',     cell: r => r.name,                                    tdClassName: styles.name },
  { header: 'Місткість', cell: r => `${r.capacity} осіб`, card: r => `${r.capacity} осіб`, tdClassName: styles.mono },
  { header: 'Опис',      cell: r => r.description ?? '—', card: r => (r.description ? r.description : null), tdClassName: styles.description },
]

export default function RoomsPage() {
  return (
    <RefEntityPage<Room>
      title="Кімнати"
      addLabel="+ Додати кімнату"
      archiveLabel="Архів кімнат"
      emptyMsg={MSG.empty.halls}           // або додай MSG.empty.rooms у lib/messages.ts
      useEntity={() => useRefEntity<Room>('rooms', listRooms, toggleRoom)}
      columns={columns}
      renderModal={({ editing, onClose, onSaved }) =>
        <RoomModal existing={editing} onClose={onClose} onSaved={onSaved} />
      }
      editable   // prop: показує кнопку «Редагувати» і передає editing=row у renderModal
    />
  )
}
```

> `editable` — додай лише якщо модалка підтримує редагування (приймає `existing`). Без нього рядки мають лише toggle.

Додай таб у `SETTINGS_TABS` в `app/settings/_RefEntityPage.tsx`:
```tsx
{ href: '/settings/rooms', label: 'Кімнати' },
```

---

## 7. RPC-обгортки

Якщо бізнес-логіка йде через RPC (а не прямий INSERT) — використовуй `callRpc()`:

```ts
import { callRpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

const { row, success, error } = await callRpc<{ success: boolean; error_message?: string }>(
  () => supabase.rpc('my_rpc', { p_room_id: id })
)
if (!success) {
  setServerError(error ?? 'Помилка')
  return
}
// row містить інші повернуті поля RPC
```

Усі бізнес-RPC повертають `TABLE(success boolean, error_message text, …)`. `callRpc` об'єднує SQL-error і `success=false` в один канал.

---

## Збірка та перевірка

```bash
npm run build        # type-check + production build (єдиний "тест")
```

> ⚠️ Якщо вже запущено `npm run dev` — **НЕ запускай `npm run build`** паралельно: обидва процеси діляться `.next/` і конфліктують. Замість build — лише `npx tsc --noEmit` для перевірки типів.
