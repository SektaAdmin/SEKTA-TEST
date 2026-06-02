'use client'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listHalls, toggleHall } from '@/lib/queries/halls'
import type { Hall } from '@/types'

export function useHalls() {
  const { data, ...rest } = useRefEntity<Hall>('halls', listHalls, toggleHall)
  return { halls: data, ...rest }
}
