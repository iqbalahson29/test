import { useQuery } from '@tanstack/react-query'
import { Role } from '@quiz-platform/shared'
import { membershipsApi } from './api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value?.trim() ? value : '—'}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

export function MemberProfileDialog({
  membershipId,
  onOpenChange,
}: {
  membershipId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['membership', membershipId],
    queryFn: () => membershipsApi.get(membershipId!),
    enabled: !!membershipId,
  })

  return (
    <Dialog open={membershipId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {isLoading || !profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar className="size-14 rounded-md">
                  <AvatarImage
                    src={profile.user.avatarUrl ?? undefined}
                    alt=""
                    className="rounded-md"
                  />
                  <AvatarFallback className="rounded-md text-base">
                    {initials(profile.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="truncate">{profile.user.name}</DialogTitle>
                  <p className="truncate text-sm text-muted-foreground">{profile.user.email}</p>
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{profile.role}</Badge>
              <span className="text-[12px] text-muted-foreground">
                Joined {formatDate(profile.joinedAt)}
              </span>
              <span className="text-[12px] text-muted-foreground">
                · Last active {formatDate(profile.user.lastLoginAt)}
              </span>
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-4">
              <SectionTitle>Personal information</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" value={profile.user.firstName} />
                <Field label="Last name" value={profile.user.lastName} />
                <Field label="Date of birth" value={formatDate(profile.user.dateOfBirth)} />
              </div>
              {profile.user.bio?.trim() && (
                <div>
                  <p className="text-[11px] text-gray-400">Bio</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{profile.user.bio}</p>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-4">
              <SectionTitle>Contact</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" value={profile.user.phone} />
                <Field label="Location" value={profile.user.location} />
                <Field label="Timezone" value={profile.user.timezone} />
                <Field label="Language" value={profile.user.locale} />
              </div>
            </div>

            {profile.role === Role.STUDENT && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <SectionTitle>Academic</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Grade level" value={profile.user.gradeLevel} />
                  <Field label="Student ID" value={profile.user.studentId} />
                  <Field label="Guardian name" value={profile.user.guardianName} />
                  <Field label="Guardian contact" value={profile.user.guardianContact} />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-gray-400">Classes / groups</p>
                  {profile.groups.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.groups.map((g) => (
                        <Badge key={g.id} variant="secondary">
                          {g.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not assigned to any group.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
