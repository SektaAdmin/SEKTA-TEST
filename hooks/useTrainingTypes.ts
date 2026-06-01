'use client'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTrainingTypes, toggleTrainingType } from '@/lib/queries/training-types'
import type { TrainingType } from '@/types'

export function useTrainingTypes() {
  const { data, ...rest } = useRefEntity<TrainingType>('training_types', listTrainingTypes, toggleTrainingType)
  return { trainingTypes: data, ...rest }
}
