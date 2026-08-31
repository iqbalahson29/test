const STORAGE_KEY = 'post-auth-redirect'

// Set by a page like /join/:slug before bouncing an unauthenticated visitor
// to /register or /login, so they land back where they started once signed in.
export function setPostAuthRedirect(path: string) {
  localStorage.setItem(STORAGE_KEY, path)
}

export function consumePostAuthRedirect(): string | null {
  const path = localStorage.getItem(STORAGE_KEY)
  if (path) {
    localStorage.removeItem(STORAGE_KEY)
  }
  return path
}
