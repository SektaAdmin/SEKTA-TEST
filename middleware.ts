import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { roleFromUser, homePathForRole, isStaff, type Role } from '@/lib/auth/role'

/** Чи дозволено роль на цьому шляху. Адмін-зона = корінь; /trainer і /client — окремі зони. */
function canAccess(role: Role, pathname: string): boolean {
  if (pathname.startsWith('/trainer')) return role === 'trainer' || isStaff(role)
  if (pathname.startsWith('/client')) return role === 'client' || isStaff(role)
  // решта (dashboard/sales/clients/schedule/journal/accounting/settings…) — лише owner/admin
  return isStaff(role)
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'

  // Незалогінений → на логін (крім самого логіну).
  if (!user) {
    if (isLoginPage) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = roleFromUser(user)
  const home = homePathForRole(role)

  // Залогінений на /login → у свою домашню зону.
  if (isLoginPage) {
    const redirect = NextResponse.redirect(new URL(home, request.url))
    response.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
    return redirect
  }

  // Корінь → домашня зона ролі.
  if (pathname === '/') {
    const redirect = NextResponse.redirect(new URL(home, request.url))
    response.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
    return redirect
  }

  // Доступ до чужої зони → редирект у свою.
  if (!canAccess(role, pathname)) {
    const redirect = NextResponse.redirect(new URL(home, request.url))
    response.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
    return redirect
  }

  return response
}

export const config = {
  // /api/** виключено: Route Handlers захищають себе самі (telegram-webhook —
  // секретним заголовком; admin/** — getRole()+isStaff). Без цього middleware
  // редиректив би вебхук Telegram (немає cookie-сесії) на /login.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
