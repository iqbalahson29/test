export type MembershipStatus = 'MEMBER' | 'PENDING' | null

export interface DirectoryEntry {
  tenantId: string
  name: string
  slug: string
  description: string | null
  memberCount: number
  membershipStatus: MembershipStatus
}

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface MyJoinRequest {
  id: string
  tenantName: string
  status: JoinRequestStatus
  createdAt: string
}

export interface PendingJoinRequest {
  id: string
  user: { name: string; email: string }
  createdAt: string
}

export interface PublicTenantInfo {
  id: string
  name: string
  description: string | null
  bannerImageUrl: string | null
  memberCount: number
}

export interface OwnTenantInfo {
  id: string
  name: string
  slug: string
  description: string | null
  bannerImageUrl: string | null
  joinCode: string | null
}

export interface UpdateTenantProfileInput {
  description?: string
  bannerImageUrl?: string
}

export interface JoinByCodeResult {
  membershipId: string
  tenantId: string
  tenantName: string
}
