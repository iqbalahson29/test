export type MembershipStatus = 'MEMBER' | 'PENDING' | null

export interface DirectoryEntry {
  tenantId: string
  name: string
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
