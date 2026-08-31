export interface SearchResultItem {
  id: string
  title: string
  subtitle: string
  path: string
  /** Set when opening this result requires switching into a workspace
   * other than the currently active one. */
  membershipId?: string
}

export interface SearchResponse {
  workspaces: SearchResultItem[]
  quizzes: SearchResultItem[]
  members: SearchResultItem[]
  attempts: SearchResultItem[]
}
