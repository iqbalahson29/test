import { apiGet } from '../../lib/api-client'
import type { SearchResponse } from './types'

export const searchApi = {
  search: (q: string) => apiGet<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
}
