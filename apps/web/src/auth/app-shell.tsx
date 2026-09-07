import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Repeat2,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react'
import { authApi } from './api'
import { useAuth } from './auth-context'
import { homePathForRole } from './types'
import type { Membership } from './types'
import { GlobalSearch } from '@/features/search/global-search'
import { NotificationRow } from '@/features/notifications/notification-row'
import { NotificationsDialog } from '@/features/notifications/notifications-dialog'
import { useMarkNotificationRead, useRecentNotifications, useUnreadCount } from '@/features/notifications/use-notifications'
import type { NotificationItem, NotificationsPage } from '@/features/notifications/types'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  match?: (pathname: string) => boolean
}

function getNavItems(role: 'ADMIN' | 'STUDENT'): NavItem[] {
  if (role === 'ADMIN') {
    return [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      {
        label: 'Quizzes',
        href: '/teacher',
        icon: ClipboardList,
        match: (p) => p.startsWith('/teacher') && !p.startsWith('/teacher/practice-quizzes'),
      },
      {
        label: 'Practice Quizzes',
        href: '/teacher/practice-quizzes',
        icon: NotebookPen,
        match: (p) => p.startsWith('/teacher/practice-quizzes'),
      },
      { label: 'Members', href: '/admin/members', icon: Users },
      { label: 'Workspace settings', href: '/admin/workspace-settings', icon: Globe },
    ]
  }
  return [
    {
      label: 'My quizzes',
      href: '/student',
      icon: ClipboardList,
      match: (p) => p === '/student' || p.startsWith('/student/attempts'),
    },
    { label: 'Analytics', href: '/student/analytics', icon: BarChart3 },
    {
      label: 'Practice Quizzes',
      href: '/student/practice-quizzes',
      icon: NotebookPen,
      match: (p) => p.startsWith('/student/practice-quizzes') || p.startsWith('/student/practice-attempts'),
    },
    { label: 'Practice Analytics', href: '/student/practice-analytics', icon: TrendingUp },
    { label: 'Join workspace', href: '/student/join-workspace', icon: UserPlus },
  ]
}

const superAdminNavItems: NavItem[] = [
  { label: 'Workspace requests', href: '/superadmin', icon: Inbox },
  { label: 'Workspaces', href: '/superadmin/workspaces', icon: Building2 },
  { label: 'Users', href: '/superadmin/users', icon: Users },
]

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function NotificationsBell({
  open,
  onOpenChange,
  unreadCount,
  recentNotifications,
  onSelectNotification,
  onViewAll,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unreadCount: number
  recentNotifications: NotificationsPage | undefined
  onSelectNotification: (n: NotificationItem) => void
  onViewAll: () => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          className="relative rounded-md p-2 text-gray-500 hover:bg-gray-200"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-2xl border border-gray-200 p-0 ring-0 shadow-2xl"
      >
        <div className="border-b border-gray-100 px-5 pt-4 pb-3">
          <h3 className="text-[15px] font-bold text-gray-900">Notifications</h3>
        </div>
        <div>
          {!recentNotifications || recentNotifications.items.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-gray-400">
              No notifications yet.
            </p>
          ) : (
            recentNotifications.items.map((n) => (
              <NotificationRow key={n.id} notification={n} onSelect={onSelectNotification} />
            ))
          )}
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onViewAll}
            className="text-[12.5px] font-semibold text-primary-600"
          >
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenu({
  displayName,
  subtitle,
  avatarUrl,
  otherMemberships,
  impersonating,
  exiting,
  onSwitchWorkspace,
  onExitToSuperAdmin,
  onLogout,
}: {
  displayName: string
  subtitle: string
  avatarUrl: string | null | undefined
  otherMemberships: Membership[]
  impersonating: boolean
  exiting: boolean
  onSwitchWorkspace: () => void
  onExitToSuperAdmin: () => void
  onLogout: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-1 rounded-md p-1 hover:bg-gray-100"
        >
          <Avatar className="size-6 rounded-md">
            <AvatarImage src={avatarUrl ?? undefined} alt="" className="rounded-md" />
            <AvatarFallback className="rounded-md bg-primary-600 text-[10px] font-bold text-white">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown size={11} className="text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-xl border border-gray-200 p-0 ring-0 shadow-xl"
      >
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3">
          <Avatar className="size-9 rounded-md">
            <AvatarImage src={avatarUrl ?? undefined} alt="" className="rounded-md" />
            <AvatarFallback className="rounded-md bg-primary-600 text-xs font-bold text-white">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-gray-800">{displayName}</p>
            <p className="truncate text-[11px] text-gray-400">{subtitle}</p>
          </div>
        </div>
        <div className="py-1">
          <DropdownMenuItem
            asChild
            className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px] text-gray-700 focus:bg-gray-50 focus:text-gray-700"
          >
            <Link to="/profile">
              <UserCircle size={16} />
              Profile
            </Link>
          </DropdownMenuItem>
          {otherMemberships.length > 0 && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onSwitchWorkspace()
              }}
              className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px] text-gray-700 focus:bg-gray-50 focus:text-gray-700"
            >
              <Repeat2 size={16} />
              Switch workspace
            </DropdownMenuItem>
          )}
          {impersonating && (
            <DropdownMenuItem
              onClick={onExitToSuperAdmin}
              disabled={exiting}
              className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px] text-gray-700 focus:bg-gray-50 focus:text-gray-700"
            >
              <ArrowLeftRight size={16} />
              Back to Super Admin
            </DropdownMenuItem>
          )}
        </div>
        <div className="border-t border-gray-100 py-1">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onLogout()
            }}
            variant="destructive"
            className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px]"
          >
            <LogOut size={16} />
            Log out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, membership, logout, switchWorkspace, exitToSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [notifMenuOpenDesktop, setNotifMenuOpenDesktop] = useState(false)
  const [notifMenuOpenMobile, setNotifMenuOpenMobile] = useState(false)
  const [notifDialogOpen, setNotifDialogOpen] = useState(false)

  const hasWorkspace = !!membership
  const isSuperAdminHome = status === 'superadmin'

  const { data: allMemberships } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: authApi.myMemberships,
    enabled: hasWorkspace,
  })
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: authApi.profile,
  })
  const notificationsEnabled = hasWorkspace || isSuperAdminHome
  const { data: unreadData } = useUnreadCount(notificationsEnabled)
  const { data: recentNotifications } = useRecentNotifications(6, notificationsEnabled)
  const markNotificationRead = useMarkNotificationRead()
  const otherMemberships =
    allMemberships?.filter((m) => m.membershipId !== membership?.membershipId) ?? []

  const onLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
      setLogoutOpen(false)
    }
  }

  const onSwitch = async (target: Membership) => {
    setSwitching(true)
    try {
      await switchWorkspace(target.membershipId)
      setSwitchOpen(false)
      navigate(homePathForRole(target.role), { replace: true })
    } finally {
      setSwitching(false)
    }
  }

  // A super admin who has entered a workspace looks exactly like that
  // workspace's own admin (same token/membership) — `profile.isSuperAdmin`
  // is what distinguishes "really this tenant's admin" from "platform
  // super admin currently acting as one", so the banner and exit link only
  // show up for the latter.
  const impersonating = !!profile?.isSuperAdmin && hasWorkspace

  const onExitToSuperAdmin = async () => {
    setExiting(true)
    try {
      await exitToSuperAdmin()
      navigate('/superadmin', { replace: true })
    } finally {
      setExiting(false)
    }
  }

  const role = membership?.role ?? 'STUDENT'
  const navItems = hasWorkspace ? getNavItems(role) : isSuperAdminHome ? superAdminNavItems : []
  const tenantName = membership?.tenantName ?? ''
  const displayName = hasWorkspace
    ? tenantName
    : isSuperAdminHome
      ? 'Super Admin'
      : (profile?.name ?? 'Account')
  const roleLabel = hasWorkspace ? role : isSuperAdminHome ? 'Super Admin' : 'No workspace'
  const homeHref = hasWorkspace
    ? homePathForRole(role)
    : isSuperAdminHome
      ? '/superadmin'
      : '/no-workspace'
  const unreadCount = unreadData?.count ?? 0

  const onSelectNotification = (n: NotificationItem) => {
    setNotifMenuOpenDesktop(false)
    setNotifMenuOpenMobile(false)
    if (!n.read) markNotificationRead.mutate(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <SidebarProvider>
      <header className="fixed top-0 right-0 left-0 z-30 hidden h-10 items-center border-b border-gray-200 bg-gray-100 px-4 md:flex">
        <Link to={homeHref} className="flex h-full shrink-0 items-center gap-2 px-1">
          <img src="/brand.png" alt="Test Platform" className="h-7 w-7 object-contain" />
          <span className="text-[15px] font-bold tracking-tight text-gray-900">Test Platform</span>
        </Link>

        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 disabled:text-gray-300"
              aria-label="Back"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 disabled:text-gray-300"
              aria-label="Forward"
            >
              <ChevronRight size={15} />
            </button>
            <GlobalSearch />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {notificationsEnabled && (
            <NotificationsBell
              open={notifMenuOpenDesktop}
              onOpenChange={setNotifMenuOpenDesktop}
              unreadCount={unreadCount}
              recentNotifications={recentNotifications}
              onSelectNotification={onSelectNotification}
              onViewAll={() => {
                setNotifMenuOpenDesktop(false)
                setNotifDialogOpen(true)
              }}
            />
          )}

          <AccountMenu
            displayName={displayName}
            subtitle={hasWorkspace ? `@${role.toLowerCase()}` : (profile?.email ?? '')}
            avatarUrl={profile?.avatarUrl}
            otherMemberships={otherMemberships}
            impersonating={impersonating}
            exiting={exiting}
            onSwitchWorkspace={() => setSwitchOpen(true)}
            onExitToSuperAdmin={onExitToSuperAdmin}
            onLogout={() => setLogoutOpen(true)}
          />
        </div>
      </header>

      {impersonating && (
        <div className="fixed top-0 right-0 left-0 z-20 flex h-8 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 text-[12px] font-medium text-amber-800 md:top-10">
          <span>
            Acting as Admin of <strong>{tenantName}</strong>
          </span>
          <button
            type="button"
            onClick={onExitToSuperAdmin}
            disabled={exiting}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <ArrowLeftRight size={12} />
            Back to Super Admin
          </button>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-gray-200 bg-gray-100 px-2 pt-1.5 md:hidden"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        <SidebarTrigger />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-200"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => navigate(1)}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-200"
          aria-label="Forward"
        >
          <ChevronRight size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <GlobalSearch dropdownPosition="top" />
        </div>
        {notificationsEnabled && (
          <NotificationsBell
            open={notifMenuOpenMobile}
            onOpenChange={setNotifMenuOpenMobile}
            unreadCount={unreadCount}
            recentNotifications={recentNotifications}
            onSelectNotification={onSelectNotification}
            onViewAll={() => {
              setNotifMenuOpenMobile(false)
              setNotifDialogOpen(true)
            }}
          />
        )}
        <AccountMenu
          displayName={displayName}
          subtitle={hasWorkspace ? `@${role.toLowerCase()}` : (profile?.email ?? '')}
          avatarUrl={profile?.avatarUrl}
          otherMemberships={otherMemberships}
          impersonating={impersonating}
          exiting={exiting}
          onSwitchWorkspace={() => setSwitchOpen(true)}
          onExitToSuperAdmin={onExitToSuperAdmin}
          onLogout={() => setLogoutOpen(true)}
        />
      </div>

      <Sidebar
        collapsible="icon"
        className={impersonating ? 'pt-8 md:pt-[72px]' : 'pt-0 md:pt-10'}
      >
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              {hasWorkspace ? 'Workspace' : isSuperAdminHome ? 'Super Admin' : 'Workspace'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {navItems.length > 0 ? (
                <SidebarMenu>
                  {navItems.map((item) => {
                    const isActive = item.match
                      ? item.match(location.pathname)
                      : location.pathname === item.href
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link to={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              ) : (
                <p className="px-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                  You&apos;re not part of a workspace yet.
                </p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-6 rounded-md">
                      <AvatarImage src={profile?.avatarUrl ?? undefined} alt="" className="rounded-md" />
                      <AvatarFallback className="rounded-md bg-primary/10 text-xs text-primary">
                        {initials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{displayName}</span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {roleLabel}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{displayName}</span>
                      <Badge variant="secondary" className="w-fit text-xs">
                        {roleLabel}
                      </Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <UserCircle />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  {otherMemberships.length > 0 && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setSwitchOpen(true)
                      }}
                    >
                      <Repeat2 />
                      Switch workspace
                    </DropdownMenuItem>
                  )}
                  {impersonating && (
                    <DropdownMenuItem onClick={onExitToSuperAdmin} disabled={exiting}>
                      <ArrowLeftRight />
                      Back to Super Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setLogoutOpen(true)
                    }}
                    variant="destructive"
                  >
                    <LogOut />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset
        className={impersonating ? 'pt-8 md:pt-[72px]' : 'pt-0 md:pt-10'}
      >
        <main className="flex-1 px-6 pt-6 pb-24 md:pb-6">{children}</main>
      </SidebarInset>

      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch workspace</DialogTitle>
            <DialogDescription>
              Pick another workspace you belong to. You&apos;ll be switched over without
              logging out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {otherMemberships.map((m) => (
              <button
                key={m.membershipId}
                type="button"
                disabled={switching}
                onClick={() => onSwitch(m)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <span className="font-medium">{m.tenantName}</span>
                <Badge variant="secondary">{m.role}</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {notificationsEnabled && (
        <NotificationsDialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen} />
      )}

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Log out"
        description="Are you sure you want to log out?"
        confirmLabel="Log out"
        destructive
        loading={loggingOut}
        onConfirm={onLogout}
      />
    </SidebarProvider>
  )
}
