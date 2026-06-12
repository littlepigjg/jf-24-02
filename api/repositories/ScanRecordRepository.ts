import { JsonRepository } from './JsonRepository.js'
import type { ScanRecord } from '../../shared/types.js'

export const scanRecordRepository = new JsonRepository<ScanRecord>('scans.json')
