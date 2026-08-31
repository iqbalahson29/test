import { apiGet } from '../lib/api-client'
import type { Membership } from './types'

export interface ProfileSummary {
  avatarUrl: string | null
  name: string
  email: string
  isSuperAdmin: boolean
}

export const authApi = {
  myMemberships: () => apiGet<Membership[]>('/auth/my-memberships'),
  profile: () => apiGet<ProfileSummary>('/auth/profile'),
}
