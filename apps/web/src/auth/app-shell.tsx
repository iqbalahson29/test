import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAuth } from './auth-context'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  ]
}

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
  const { membership, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const role = membership?.role ?? 'STUDENT'
  const navItems = getNavItems(role)
  const tenantName = membership?.tenantName ?? ''

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="pointer-events-none">
                <div>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Quiz Platform</span>
                    <span className="truncate text-xs text-sidebar-foreground/70">
                      {tenantName}
                    </span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
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
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
