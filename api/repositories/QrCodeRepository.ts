import { JsonRepository } from './JsonRepository.js'
import type { QrCode } from '../../shared/types.js'

export const qrCodeRepository = new JsonRepository<QrCode>('qrcodes.json')
