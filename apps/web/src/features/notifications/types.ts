export type NotificationType =
  | 'QUIZ_ASSIGNED'
  | 'JOIN_REQUEST_APPROVED'
  | 'JOIN_REQUEST_REJECTED'
  | 'MEMBER_JOINED'
  | 'INVITE_ACCEPTED'
  | 'RESPONSE_GRADED'
  | 'GRADING_PENDING'
  | 'WORKSPACE_REQUEST_SUBMITTED'
  | 'USER_REGISTERED'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

export interface NotificationsPage {
  items: NotificationItem[]
  nextCursor: string | null
}
