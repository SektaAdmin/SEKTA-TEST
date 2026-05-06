'use client'
import { createContext, useContext } from 'react'
import { useTickets } from '@/hooks/useTickets'
import { useTrainers } from '@/hooks/useTrainers'
import { useHalls } from '@/hooks/useHalls'
import { useTrainingTypes } from '@/hooks/useTrainingTypes'
import type { Ticket, Trainer, Hall, TrainingType } from '@/types'

interface RefsContextValue {
  tickets: Ticket[]
  refetchTickets: () => Promise<void>
  trainers: Trainer[]
  refetchTrainers: () => Promise<void>
  halls: Hall[]
  refetchHalls: () => Promise<void>
  trainingTypes: TrainingType[]
  refetchTrainingTypes: () => Promise<void>
}

const RefsContext = createContext<RefsContextValue | null>(null)

export function RefsProvider({ children }: { children: React.ReactNode }) {
  const { tickets, refetch: refetchTickets } = useTickets()
  const { trainers, refetch: refetchTrainers } = useTrainers()
  const { halls, refetch: refetchHalls } = useHalls()
  const { trainingTypes, refetch: refetchTrainingTypes } = useTrainingTypes()

  return (
    <RefsContext.Provider value={{ tickets, refetchTickets, trainers, refetchTrainers, halls, refetchHalls, trainingTypes, refetchTrainingTypes }}>
      {children}
    </RefsContext.Provider>
  )
}

export function useRefs(): RefsContextValue {
  const ctx = useContext(RefsContext)
  if (!ctx) throw new Error('useRefs must be used within RefsProvider')
  return ctx
}
