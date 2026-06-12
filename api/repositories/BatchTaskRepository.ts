import { JsonRepository } from './JsonRepository.js'
import type { BatchTask } from '../../shared/types.js'

export const batchTaskRepository = new JsonRepository<BatchTask>('batches.json')
