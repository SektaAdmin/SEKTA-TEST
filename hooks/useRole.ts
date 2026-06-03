'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { roleFromUser, type Role } from '@/lib/auth/role'

/**
 * Роль поточного користувача на клієнті. `null` поки сесія не завантажилась.
 * Слухає auth-зміни (логін/логаут/refresh токена), щоб роль лишалась актуальною.
 */
export function useRole(): Role | null {
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setRole(roleFromUser(user))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setRole(roleFromUser(session?.user))
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return role
}
