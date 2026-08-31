import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Copy, ExternalLink, Eye, RefreshCw, Upload } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { resizeImageToDataUrl } from '../../lib/image-resize'
import { workspaceDirectoryApi } from './api'
import type { OwnTenantInfo } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MAX_BANNER_FILE_BYTES = 8 * 1024 * 1024
const DESCRIPTION_MAX_LENGTH = 2000

type CodeAction = 'generate' | 'custom' | 'disable'

export function WorkspaceSettingsPage() {
  const queryClient = useQueryClient()
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: workspaceDirectoryApi.myTenant,
  })

  const [description, setDescription] = useState('')
  const [bannerImageUrl, setBannerImageUrl] = useState('')
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [resizingBanner, setResizingBanner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const seededTenantId = useRef<string | null>(null)

  useEffect(() => {
    if (tenant && seededTenantId.current !== tenant.id) {
      setDescription(tenant.description ?? '')
      setBannerImageUrl(tenant.bannerImageUrl ?? '')
      seededTenantId.current = tenant.id
    }
  }, [tenant])

  const onBannerFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBannerError(null)
    if (!file.type.startsWith('image/')) {
      setBannerError('Please choose an image file')
      return
    }
    if (file.size > MAX_BANNER_FILE_BYTES) {
      setBannerError('Image must be smaller than 8MB')
      return
    }
    setResizingBanner(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1200, 0.8)
      setBannerImageUrl(dataUrl)
    } catch {
      setBannerError('Could not process this image')
    } finally {
      setResizingBanner(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => workspaceDirectoryApi.updateMyTenant({ description, bannerImageUrl }),
    onSuccess: () => {
      setError(null)
      setSuccess(true)
      setSaveConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['my-tenant'] })
    },
    onError: (err: unknown) => {
      setSuccess(false)
      setSaveConfirmOpen(false)
      setError(err instanceof ApiError ? err.message : 'Could not save changes')
    },
  })

  const onConfirmSave = () => {
    setSuccess(false)
    saveMutation.mutate()
  }

  const [customCode, setCustomCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeSuccess, setCodeSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmCodeAction, setConfirmCodeAction] = useState<CodeAction | null>(null)

  const onCodeMutated = (updated: OwnTenantInfo, message: string) => {
    setCodeError(null)
    setCodeSuccess(message)
    setConfirmCodeAction(null)
    setCustomCode('')
    queryClient.setQueryData(['my-tenant'], updated)
  }
  const onCodeError = (err: unknown, fallback: string) => {
    setCodeSuccess(null)
    setConfirmCodeAction(null)
    setCodeError(err instanceof ApiError ? err.message : fallback)
  }

  const generateCodeMutation = useMutation({
    mutationFn: () => workspaceDirectoryApi.generateJoinCode(),
    onSuccess: (updated) => onCodeMutated(updated, 'New join code generated.'),
    onError: (err: unknown) => onCodeError(err, 'Could not generate a code'),
  })
  const setCodeMutation = useMutation({
    mutationFn: () => workspaceDirectoryApi.setJoinCode(customCode),
    onSuccess: (updated) => onCodeMutated(updated, 'Join code updated.'),
    onError: (err: unknown) => onCodeError(err, 'Could not set that code'),
  })
  const clearCodeMutation = useMutation({
    mutationFn: () => workspaceDirectoryApi.clearJoinCode(),
    onSuccess: (updated) => onCodeMutated(updated, 'Join code disabled.'),
    onError: (err: unknown) => onCodeError(err, 'Could not disable the code'),
  })
  const codeMutationPending =
    generateCodeMutation.isPending || setCodeMutation.isPending || clearCodeMutation.isPending

  const onGenerateClick = () => {
    setCodeSuccess(null)
    if (tenant?.joinCode) {
      setConfirmCodeAction('generate')
    } else {
      generateCodeMutation.mutate()
    }
  }
  const onSaveCustomClick = () => {
    if (!customCode.trim()) return
    setCodeSuccess(null)
    if (tenant?.joinCode) {
      setConfirmCodeAction('custom')
    } else {
      setCodeMutation.mutate()
    }
  }
  const onDisableClick = () => {
    setCodeSuccess(null)
    setConfirmCodeAction('disable')
  }
  const onConfirmCodeAction = () => {
    if (confirmCodeAction === 'generate') generateCodeMutation.mutate()
    else if (confirmCodeAction === 'custom') setCodeMutation.mutate()
    else if (confirmCodeAction === 'disable') clearCodeMutation.mutate()
  }
  const onCopyCode = async () => {
    if (!tenant?.joinCode) return
    await navigator.clipboard.writeText(tenant.joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading || !tenant) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const publicUrl = `${window.location.origin}/join/${tenant.slug}`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Workspace settings</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Set up what students see when they browse or get invited to {tenant.name}.
          </p>
        </div>
        <Button type="button" onClick={() => setSaveConfirmOpen(true)}>
          Save changes
        </Button>
      </div>

      <div className="space-y-6">
        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>Workspace profile updated.</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Landing page</CardTitle>
                <CardDescription>
                  Shown on your public invite link and in the student workspace directory.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye />
                Preview
              </Button>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Banner image</Label>
                {bannerImageUrl ? (
                  <img
                    src={bannerImageUrl}
                    alt=""
                    className="h-32 w-full rounded-lg border object-cover sm:h-40"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground sm:h-40">
                    No banner set
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resizingBanner}
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <Upload />
                    {resizingBanner
                      ? 'Processing…'
                      : bannerImageUrl
                        ? 'Replace image'
                        : 'Upload image'}
                  </Button>
                  {bannerImageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBannerImageUrl('')}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onBannerFileChange}
                />
                {bannerError ? (
                  <p className="text-xs text-destructive">{bannerError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    JPG or PNG, up to 8MB. Wide images work best.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={7}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder="What is this workspace for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-[calc(100%-2rem)] resize-none sm:h-[9.5rem]"
                />
                <p className="text-right text-xs text-muted-foreground">
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public link</CardTitle>
              <CardDescription>
                Share this so students can find and request to join.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    View
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Join code</CardTitle>
            <CardDescription>
              Students who enter this code join instantly — no approval needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              {codeError && (
                <Alert variant="destructive">
                  <AlertDescription>{codeError}</AlertDescription>
                </Alert>
              )}
              {codeSuccess && (
                <Alert>
                  <AlertDescription>{codeSuccess}</AlertDescription>
                </Alert>
              )}

              {tenant.joinCode ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={tenant.joinCode}
                      className="font-mono text-lg tracking-[0.3em]"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button type="button" variant="outline" onClick={onCopyCode}>
                      {copied ? <Check className="text-emerald-600" /> : <Copy />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={codeMutationPending}
                      onClick={onGenerateClick}
                    >
                      <RefreshCw />
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={codeMutationPending}
                      onClick={onDisableClick}
                    >
                      Disable
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No join code set. Students can&apos;t join instantly until you create one.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={codeMutationPending}
                    onClick={onGenerateClick}
                  >
                    {generateCodeMutation.isPending ? 'Generating…' : 'Generate a code'}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5 lg:border-l lg:border-gray-100 lg:pl-6">
              <Label htmlFor="custom-code">Or set a custom code</Label>
              <div className="flex gap-2">
                <Input
                  id="custom-code"
                  placeholder="e.g. ACME2026"
                  maxLength={12}
                  className="uppercase"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!customCode.trim() || codeMutationPending}
                  onClick={onSaveCustomClick}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">4-12 letters and numbers.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>How this looks to a student.</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border">
            {bannerImageUrl && (
              <img src={bannerImageUrl} alt="" className="h-28 w-full object-cover" />
            )}
            <div className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Building2 className="size-4 text-muted-foreground" />
                {tenant.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {description || 'No description set yet.'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveConfirmOpen} onOpenChange={(open) => !saveMutation.isPending && setSaveConfirmOpen(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
            <DialogDescription>
              This updates what students see on your public invite link and in the workspace
              directory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => setSaveConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saveMutation.isPending} onClick={onConfirmSave}>
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmCodeAction !== null}
        onOpenChange={(open) => !open && setConfirmCodeAction(null)}
      >
        <DialogContent className="sm:max-w-sm">
          {confirmCodeAction && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmCodeAction === 'disable'
                    ? 'Disable the join code?'
                    : 'Replace the join code?'}
                </DialogTitle>
                <DialogDescription>
                  {confirmCodeAction === 'disable'
                    ? 'Students will no longer be able to join instantly with the current code.'
                    : "The current code will stop working immediately — anyone who still has it won't be able to use it to join."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmCodeAction(null)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant={confirmCodeAction === 'disable' ? 'destructive' : 'default'}
                  disabled={codeMutationPending}
                  onClick={onConfirmCodeAction}
                >
                  {confirmCodeAction === 'disable'
                    ? 'Disable code'
                    : confirmCodeAction === 'generate'
                      ? 'Generate new code'
                      : 'Save new code'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
