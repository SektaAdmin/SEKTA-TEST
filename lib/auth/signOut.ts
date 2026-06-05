import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { createClient } from '@/lib/supabase'

/**
 * Вийти з акаунта і перейти на /login. Спільний хендлер для кабінетів
 * (CabinetHeader і меню-лаунчер ClientHome викликали ідентичний код).
 * `refresh()` скидає server-кеш роутера, щоб middleware не пустив назад по
 * стейл-сесії.
 */
export async function signOutAndRedirect(router: AppRouterInstance): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  router.push('/login')
  router.refresh()
}
