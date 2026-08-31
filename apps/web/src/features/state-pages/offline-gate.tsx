import type { ReactNode } from 'react'
import { OfflinePage } from './offline-page'
import { useOnlineStatus } from './use-online-status'

/** Swaps the whole app for `OfflinePage` while `navigator.onLine` is false,
 * so any in-flight work is just paused rather than failing requests one by
 * one — the app underneath is left mounted, not unmounted. */
export function OfflineGate({ children }: { children: ReactNode }) {
  const online = useOnlineStatus()
  if (!online) {
    return <OfflinePage />
  }
  return <>{children}</>
}
