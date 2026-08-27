import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Repeat2,
  Search,
  Sparkles,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react'
import { authApi } from './api'
import { useAuth } from './auth-context'
import { homePathForRole } from './types'
import type { Membership } from './types'
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
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
        match: (p) => p.startsWith('/teacher'),
      },
      { label: 'Members', href: '/admin/members', icon: Users },
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
    { label: 'Join workspace', href: '/student/join-workspace', icon: UserPlus },
  ]
}

interface NotificationItem {
  id: string
  icon: typeof Bell
  badgeClass: string
  title: string
  body: string
  time: string
  unread: boolean
}

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    icon: ClipboardList,
    badgeClass: 'bg-primary-50 text-primary-600',
    title: 'New quiz assigned',
    body: 'You have a new quiz waiting to be started.',
    time: '5m ago',
    unread: true,
  },
  {
    id: '2',
    icon: Check,
    badgeClass: 'bg-emerald-50 text-emerald-600',
    title: 'Join request approved',
    body: 'Your request to join a workspace was approved.',
    time: '2h ago',
    unread: true,
  },
  {
    id: '3',
    icon: Users,
    badgeClass: 'bg-gray-100 text-gray-600',
    title: 'New member joined',
    body: 'A new member joined your workspace.',
    time: '1d ago',
    unread: false,
  },
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

export function AppShell({ children }: { children: ReactNode }) {
  const { membership, logout, switchWorkspace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const { data: allMemberships } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: authApi.myMemberships,
  })
  const otherMemberships =
    allMemberships?.filter((m) => m.membershipId !== membership?.membershipId) ?? []

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
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

  const role = membership?.role ?? 'STUDENT'
  const navItems = getNavItems(role)
  const tenantName = membership?.tenantName ?? ''
  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length

  return (
    <SidebarProvider>
      <header className="fixed top-0 right-0 left-0 z-30 flex h-10 items-center border-b border-gray-200 bg-gray-100 px-4">
        <Link to={homePathForRole(role)} className="flex h-full shrink-0 items-center gap-2 px-1">
          <div className="flex h-full w-7 items-center justify-center rounded-md bg-primary-600 text-white">
            <Sparkles size={14} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-gray-900">Quiz Platform</span>
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
            <div className="flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-[12px] text-gray-500 shadow-sm md:w-[480px] lg:w-[660px]">
              <Search size={13} className="shrink-0" />
              <span className="flex-1 truncate text-left">Search here...</span>
              <kbd className="shrink-0 rounded bg-gray-100 px-1 font-mono text-[10px]">&#8984;K</kbd>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Apps"
            aria-label="Apps"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-200"
          >
            <LayoutGrid size={17} />
          </button>

          <DropdownMenu>
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
                {NOTIFICATIONS.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-5 py-3.5',
                      n.unread && 'bg-primary-50/40',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        n.badgeClass,
                      )}
                    >
                      <n.icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-800">{n.title}</p>
                      <p className="text-[12px] text-gray-500">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{n.time}</p>
                    </div>
                    {n.unread && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary-600" />
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 px-5 py-3">
                <button type="button" className="text-[12.5px] font-semibold text-primary-600">
                  View all notifications
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex items-center gap-1 rounded-md py-1 pr-1.5 pl-1 hover:bg-gray-100"
              >
                <Avatar className="size-7 rounded-md">
                  <AvatarFallback className="rounded-md bg-primary-600 text-[10px] font-bold text-white">
                    {initials(tenantName || role)}
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
                  <AvatarFallback className="rounded-md bg-primary-600 text-xs font-bold text-white">
                    {initials(tenantName || role)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-gray-800">{tenantName}</p>
                  <p className="truncate text-[11px] text-gray-400">@{role.toLowerCase()}</p>
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
                      setSwitchOpen(true)
                    }}
                    className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px] text-gray-700 focus:bg-gray-50 focus:text-gray-700"
                  >
                    <Repeat2 size={16} />
                    Switch workspace
                  </DropdownMenuItem>
                )}
              </div>
              <div className="border-t border-gray-100 py-1">
                <DropdownMenuItem
                  onClick={onLogout}
                  variant="destructive"
                  className="flex items-center gap-2.5 rounded-none px-4 py-2.5 text-[13px]"
                >
                  <LogOut size={16} />
                  Log out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sidebar collapsible="icon" className="pt-10">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
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
                      <AvatarFallback className="rounded-md bg-primary/10 text-xs text-primary">
                        {initials(tenantName || role)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{tenantName}</span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {role}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{tenantName}</span>
                      <Badge variant="secondary" className="w-fit text-xs">
                        {role}
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
                  <DropdownMenuItem onClick={onLogout} variant="destructive">
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
      <SidebarInset className="pt-10">
        <main className="flex-1 p-6">{children}</main>
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
    </SidebarProvider>
  )
}
