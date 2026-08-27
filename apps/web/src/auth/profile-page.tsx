import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { ApiError, apiGet, apiPatch } from '../lib/api-client'
import { useAuth } from './auth-context'
import { AppShell } from './app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProfileResponse {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  bio: string | null
  phone: string | null
  location: string | null
  timezone: string | null
  locale: string | null
  emailNotifications: boolean
  gradeLevel: string | null
  studentId: string | null
  guardianName: string | null
  guardianContact: string | null
  memberSince: string
  groups: { id: string; name: string }[]
}

interface ProfileDetails {
  avatarUrl: string
  firstName: string
  lastName: string
  dateOfBirth: string
  bio: string
  phone: string
  location: string
  timezone: string
  locale: string
  emailNotifications: boolean
  gradeLevel: string
  studentId: string
  guardianName: string
  guardianContact: string
}

const emptyDetails: ProfileDetails = {
  avatarUrl: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  bio: '',
  phone: '',
  location: '',
  timezone: '',
  locale: '',
  emailNotifications: true,
  gradeLevel: '',
  studentId: '',
  guardianName: '',
  guardianContact: '',
}

const GRADE_LEVELS = [
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
  'Undergraduate',
  'Graduate',
  'Other',
]

const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
]

const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
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

export function ProfilePage() {
  const { membership } = useAuth()
  const isStudent = membership?.role === 'STUDENT'

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<ProfileResponse>('/auth/profile'),
  })

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
      setDetails({
        avatarUrl: profile.avatarUrl ?? '',
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
        bio: profile.bio ?? '',
        phone: profile.phone ?? '',
        location: profile.location ?? '',
        timezone: profile.timezone ?? '',
        locale: profile.locale ?? '',
        emailNotifications: profile.emailNotifications,
        gradeLevel: profile.gradeLevel ?? '',
        studentId: profile.studentId ?? '',
        guardianName: profile.guardianName ?? '',
        guardianContact: profile.guardianContact ?? '',
      })
    }
  }, [profile])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSubmitting(true)
    try {
      await apiPatch('/auth/profile', {
        name,
        email,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
        avatarUrl: details.avatarUrl,
        firstName: details.firstName,
        lastName: details.lastName,
        dateOfBirth: details.dateOfBirth || undefined,
        bio: details.bio,
        phone: details.phone,
        location: details.location,
        timezone: details.timezone,
        locale: details.locale,
        emailNotifications: details.emailNotifications,
        gradeLevel: details.gradeLevel,
        studentId: details.studentId,
        guardianName: details.guardianName,
        guardianContact: details.guardianContact,
      })
      setCurrentPassword('')
      setNewPassword('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile')
    } finally {
      setSubmitting(false)
    }
  }

  const memberSince = profile
    ? new Date(profile.memberSince).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const form = (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>Profile updated.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your login identity and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep your current password"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Current password is only required if you're changing your email or password.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>How you're identified across the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarImage src={details.avatarUrl || undefined} alt="" />
              <AvatarFallback className="text-base">{initials(name || email)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="avatar-url">Avatar URL</Label>
              <Input
                id="avatar-url"
                placeholder="https://example.com/photo.jpg"
                value={details.avatarUrl}
                onChange={(e) => setDetails((d) => ({ ...d, avatarUrl: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                value={details.firstName}
                onChange={(e) => setDetails((d) => ({ ...d, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                value={details.lastName}
                onChange={(e) => setDetails((d) => ({ ...d, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              className="sm:w-56"
              value={details.dateOfBirth}
              onChange={(e) => setDetails((d) => ({ ...d, dateOfBirth: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              placeholder="A short introduction about yourself"
              maxLength={500}
              value={details.bio}
              onChange={(e) => setDetails((d) => ({ ...d, bio: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>How the workspace can reach you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={details.phone}
                onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="City, Country"
                value={details.location}
                onChange={(e) => setDetails((d) => ({ ...d, location: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isStudent && (
        <Card>
          <CardHeader>
            <CardTitle>Academic</CardTitle>
            <CardDescription>Student-specific details for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="grade-level">Grade level</Label>
                <Select
                  value={details.gradeLevel}
                  onValueChange={(v) => setDetails((d) => ({ ...d, gradeLevel: v }))}
                >
                  <SelectTrigger id="grade-level" className="w-full">
                    <SelectValue placeholder="Select a grade level" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_LEVELS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="student-id">Student ID</Label>
                <Input
                  id="student-id"
                  value={details.studentId}
                  onChange={(e) => setDetails((d) => ({ ...d, studentId: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Classes / groups</Label>
              <div className="flex flex-wrap gap-1.5">
                {profile && profile.groups.length > 0 ? (
                  profile.groups.map((g) => (
                    <Badge key={g.id} variant="secondary">
                      {g.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Not assigned to any group yet.</p>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guardian-name">Guardian name</Label>
                <Input
                  id="guardian-name"
                  value={details.guardianName}
                  onChange={(e) => setDetails((d) => ({ ...d, guardianName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian-contact">Guardian contact</Label>
                <Input
                  id="guardian-contact"
                  placeholder="Email or phone"
                  value={details.guardianContact}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, guardianContact: e.target.value }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Localization and notification settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={details.timezone}
                onValueChange={(v) => setDetails((d) => ({ ...d, timezone: v }))}
              >
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locale">Language</Label>
              <Select
                value={details.locale}
                onValueChange={(v) => setDetails((d) => ({ ...d, locale: v }))}
              >
                <SelectTrigger id="locale" className="w-full">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">
                Assignment updates, grading results, and deadline reminders.
              </p>
            </div>
            <Switch
              checked={details.emailNotifications}
              onCheckedChange={(v) => setDetails((d) => ({ ...d, emailNotifications: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Member since <span className="font-medium text-foreground">{memberSince ?? '—'}</span>
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>
      </div>
    </form>
  )

  if (membership) {
    return (
      <AppShell>
        <div className="max-w-3xl">
          <h1 className="text-[17px] font-bold text-gray-900">My profile</h1>
          <p className="mt-1 mb-6 text-[12px] text-gray-400">
            Manage your personal information, contact details, and preferences.
          </p>
          {form}
        </div>
      </AppShell>
    )
  }

  return (
    <div className="flex min-h-svh justify-center bg-muted/40 p-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">Quiz Platform</h1>
        </div>
        {form}
      </div>
    </div>
  )
}
