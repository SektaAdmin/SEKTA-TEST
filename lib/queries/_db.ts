import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/* Типізований клієнт для шару запитів.

   Усі query-функції приймають `supabase: Db` (НЕ голий SupabaseClient, що =
   SupabaseClient<any> і стирає типізацію всередині). З `<Database>` кожен
   .from()/.select() всередині строго типізований → результат можна звіряти зі
   схемою через QueryData<typeof query> замість `as unknown as RowType`. */
export type Db = SupabaseClient<Database>

/** Row/Insert хелпери для таблиць public-схеми. */
type Tables = Database['public']['Tables']
export type Row<T extends keyof Tables> = Tables[T]['Row']
export type Insert<T extends keyof Tables> = Tables[T]['Insert']
