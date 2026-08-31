import { apiGet } from '../../lib/api-client'
import type { AdminDashboardOverview, CalendarAssignment, DashboardRange } from './types'

export const dashboardApi = {
  adminOverview: (range: DashboardRange) =>
    apiGet<AdminDashboardOverview>(`/dashboard/admin?range=${range}`),
  calendar: () => apiGet<CalendarAssignment[]>('/assignments/calendar'),
}
