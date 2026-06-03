import type { User } from '@supabase/supabase-js'

// Ролі системи. Дефолт — найменш привілейований (client), як у БД-хелпері auth_role().
export type Role = 'owner' | 'admin' | 'trainer' | 'client'

const ROLES: readonly Role[] = ['owner', 'admin', 'trainer', 'client']

/** Дістати роль з user.app_metadata (де її зберігає БД, потрапляє в JWT). Невідома/відсутня → 'client'. */
export function roleFromUser(user: User | null | undefined): Role {
  const raw = user?.app_metadata?.role
  return ROLES.includes(raw as Role) ? (raw as Role) : 'client'
}

/** Домашня зона ролі — куди редіректити після логіну / при заході в чужу зону. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case 'owner':
    case 'admin':
      return '/dashboard'
    case 'trainer':
      return '/trainer'
    case 'client':
      return '/client'
  }
}

export const isStaff = (role: Role): boolean => role === 'owner' || role === 'admin'
