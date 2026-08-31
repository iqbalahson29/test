import { getAccessToken } from '../auth/token-store'

const API_BASE = '/api'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { message?: string })
    throw new ApiError(
      res.status,
      body.message ?? `Request to ${path} failed with ${res.status}`,
    )
  }
  if (res.status === 204) {
    return undefined as T
  }
  return res.json() as Promise<T>
}

export const apiGet = <T>(path: string) => request<T>(path)

export const apiPost = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })

export const apiPatch = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: 'PATCH',
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })

export const apiDelete = <T>(path: string, data?: unknown) =>
  request<T>(path, {
    method: 'DELETE',
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })
