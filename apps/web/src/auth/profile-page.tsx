import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Upload } from 'lucide-react'
import { ApiError, apiGet, apiPatch } from '../lib/api-client'
import { resizeImageToDataUrl } from '../lib/image-resize'
import { useAuth } from './auth-context'
import { AppShell } from './app-shell'
import { setAccessToken } from './token-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProfileUpdateResponse {
  accessToken?: string
}

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

const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024

function ChangePasswordCard() {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match")
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPatch<ProfileUpdateResponse>('/auth/profile', {
        currentPassword,
        newPassword,
      })
      if (res.accessToken) {
        // The server rotated this session's tokens onto the new
        // tokenVersion (every other session was just signed out) — keep
        // this tab in sync with its own new access token.
        setAccessToken(res.accessToken)
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="rounded-none">
        <CardHeader className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Changing your password signs you out of every other device and browser — this
              one stays signed in.
            </CardDescription>
          </div>
          <CollapsibleTrigger className="group shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert>
                  <AlertDescription>
                    Password changed. Every other session has been signed out.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={72}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={72}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={passwordsMismatch}
                  />
                  {passwordsMismatch && (
                    <p className="text-xs text-destructive">Passwords don't match.</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 10 characters, with an uppercase letter, a lowercase letter, and a
                number. Can't reuse a recent password.
              </p>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? 'Changing password…' : 'Change password'}
              </Button>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

export function ProfilePage() {
  const { membership } = useAuth()
  const isStudent = membership?.role === 'STUDENT'
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<ProfileResponse>('/auth/profile'),
  })

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [initialEmail, setInitialEmail] = useState('')
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('')
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [resizingAvatar, setResizingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
      setInitialEmail(profile.email)
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

  const onAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError(null)
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file')
      return
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setAvatarError('Image must be smaller than 8MB')
      return
    }
    setResizingAvatar(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      setDetails((d) => ({ ...d, avatarUrl: dataUrl }))
    } catch {
      setAvatarError('Could not process this image')
    } finally {
      setResizingAvatar(false)
    }
  }

  const changingEmail = email !== initialEmail

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSubmitting(true)
    try {
      await apiPatch('/auth/profile', {
        name,
        email,
        currentPassword: emailCurrentPassword || undefined,
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
      setEmailCurrentPassword('')
      setInitialEmail(email)
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
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
    <>
    <form id="profile-form" onSubmit={onSubmit} className="space-y-6">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:grid-flow-row-dense lg:items-start">
      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your login identity.</CardDescription>
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
          {changingEmail && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="email-current-password">Current password</Label>
                <Input
                  id="email-current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="sm:w-1/2"
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Required to confirm an email change.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-none lg:col-span-2">
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>How you're identified across the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-md">
              <AvatarImage src={details.avatarUrl || undefined} alt="" className="rounded-md" />
              <AvatarFallback className="rounded-md text-base">
                {initials(name || email)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <Label>Profile photo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resizingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload />
                  {resizingAvatar ? 'Processing…' : 'Upload photo'}
                </Button>
                {details.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetails((d) => ({ ...d, avatarUrl: '' }))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarFileChange}
              />
              {avatarError ? (
                <p className="text-xs text-destructive">{avatarError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">JPG or PNG, up to 8MB.</p>
              )}
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

      <Card className="rounded-none">
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
        <Card className="rounded-none">
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

      <Card className="rounded-none">
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

          <div className="flex items-center justify-between rounded-none border px-3 py-2.5">
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

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Member since <span className="font-medium text-foreground">{memberSince ?? '—'}</span>
          </p>
        </CardContent>
      </Card>
      </div>
    </form>

    <div className="mt-6">
      <ChangePasswordCard />
    </div>
    </>
  )

  return (
    <AppShell>
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-bold text-gray-900">My profile</h1>
            <p className="mt-1 text-[12px] text-gray-400">
              Manage your personal information, contact details, and preferences.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Link>
            <Button type="submit" form="profile-form" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
        {form}
      </div>
    </AppShell>
  )
}
