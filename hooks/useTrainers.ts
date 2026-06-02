'use client'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTrainers, toggleTrainer } from '@/lib/queries/trainers'
import type { Trainer } from '@/types'

export function useTrainers() {
  const { data, ...rest } = useRefEntity<Trainer>('trainers', listTrainers, toggleTrainer)
  return { trainers: data, ...rest }
}
