import { apiGet } from '../lib/api-client'
import type { Membership } from './types'

export const authApi = {
  myMemberships: () => apiGet<Membership[]>('/auth/my-memberships'),
}
