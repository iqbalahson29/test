import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileArchive, FileDown, FileUp, Loader2 } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { guessImageMimeType, unzipImagesByFilename } from '@/lib/zip-images'
import { quizzesApi, questionsApi } from './api'
import type { ImportQuestionsResult } from './api'
import type { CreateQuestionInput } from './types'
import { downloadQuestionsTemplate, parseQuestionsExcel } from './excel-import'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ImportQuestionsDialog({
  open,
  onOpenChange,
  quizId: lockedQuizId,
  quizTitle: lockedQuizTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, imports go straight into this quiz and the quiz picker is hidden. */
  quizId?: string
  quizTitle?: string
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const { data: quizzes } = useQuery({
    queryKey: ['quizzes'],
    queryFn: quizzesApi.list,
    enabled: open && !lockedQuizId,
  })

  const [pickedQuizId, setPickedQuizId] = useState<string>('')
  const quizId = lockedQuizId ?? pickedQuizId

  const [fileName, setFileName] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([])
  const [ready, setReady] = useState<CreateQuestionInput[]>([])
  const [pendingImageFilenames, setPendingImageFilenames] = useState<(string | undefined)[]>([])
  const [lines, setLines] = useState<number[]>([])
  const [zipFileName, setZipFileName] = useState<string | null>(null)
  const [zipBuffer, setZipBuffer] = useState<ArrayBuffer | null>(null)
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportQuestionsResult | null>(null)
  const [readError, setReadError] = useState<string | null>(null)

  const imageRowCount = pendingImageFilenames.filter(Boolean).length
  const needsZip = imageRowCount > 0 && !zipBuffer

  const reset = () => {
    setPickedQuizId('')
    setFileName(null)
    setParseErrors([])
    setReady([])
    setPendingImageFilenames([])
    setLines([])
    setZipFileName(null)
    setZipBuffer(null)
    setImageProgress(null)
    setResult(null)
    setReadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (zipInputRef.current) zipInputRef.current.value = ''
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const finalQuestions = [...ready]
      const skip = new Set<number>()
      const newImageErrors: { line: number; message: string }[] = []

      const imageRowIndices = pendingImageFilenames
        .map((f, i) => (f ? i : -1))
        .filter((i) => i !== -1)

      if (imageRowIndices.length > 0 && zipBuffer) {
        const imagesByFilename = unzipImagesByFilename(zipBuffer)
        setImageProgress({ done: 0, total: imageRowIndices.length })
        for (let k = 0; k < imageRowIndices.length; k++) {
          const i = imageRowIndices[k]
          const filename = pendingImageFilenames[i]!
          const bytes = imagesByFilename.get(filename.toLowerCase())
          const mimeType = bytes ? guessImageMimeType(filename) : null
          if (!bytes) {
            newImageErrors.push({
              line: lines[i],
              message: `Image "${filename}" was not found in the uploaded zip.`,
            })
            skip.add(i)
          } else if (!mimeType) {
            newImageErrors.push({
              line: lines[i],
              message: `"${filename}" is not a supported image type (PNG, JPG, GIF, WEBP).`,
            })
            skip.add(i)
          } else {
            const { uploadUrl, attachmentKey } = await questionsApi.getAttachmentUploadUrl(
              quizId,
              filename,
              mimeType,
            )
            const putRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': mimeType },
              body: new Blob([bytes as BlobPart]),
            })
            if (!putRes.ok) {
              newImageErrors.push({ line: lines[i], message: `Could not upload image "${filename}".` })
              skip.add(i)
            } else {
              finalQuestions[i] = {
                ...finalQuestions[i],
                imageKey: attachmentKey,
                imageFilename: filename,
                imageMimeType: mimeType,
              }
            }
          }
          setImageProgress({ done: k + 1, total: imageRowIndices.length })
        }
      }

      if (newImageErrors.length > 0) {
        setParseErrors((prev) => [...prev, ...newImageErrors])
      }
      const toImport = finalQuestions.filter((_, i) => !skip.has(i))
      return questionsApi.import(quizId, toImport)
    },
    onSuccess: (res) => {
      setResult(res)
      setImageProgress(null)
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] })
      queryClient.invalidateQueries({ queryKey: ['quiz-activity', quizId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] })
    },
    onError: (err: unknown) => {
      setImageProgress(null)
      setReadError(err instanceof ApiError ? err.message : 'Could not import questions')
    },
  })

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setResult(null)
    setReadError(null)
    if (!file) {
      setFileName(null)
      setReady([])
      setPendingImageFilenames([])
      setLines([])
      setParseErrors([])
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer
      const { questions, pendingImageFilenames, lines, errors } = parseQuestionsExcel(buffer)
      setReady(questions)
      setPendingImageFilenames(pendingImageFilenames)
      setLines(lines)
      setParseErrors(errors)
    }
    reader.onerror = () => setReadError('Could not read that file.')
    reader.readAsArrayBuffer(file)
  }

  const onZipChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setZipFileName(null)
      setZipBuffer(null)
      return
    }
    setZipFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setZipBuffer(reader.result as ArrayBuffer)
    reader.onerror = () => setReadError('Could not read that zip file.')
    reader.readAsArrayBuffer(file)
  }

  const close = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const noQuizzesYet = !lockedQuizId && (quizzes ?? []).length === 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            Upload an Excel file of questions to add to {lockedQuizTitle ? `"${lockedQuizTitle}"` : 'a quiz'}.
            Supports all question types. Each row's Module column assigns it to one of the 4 SAT
            modules.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">
              New to this? Start from the template — it has the exact columns expected, plus one
              example row per question type.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => downloadQuestionsTemplate()}
            >
              <FileDown />
              Download template
            </Button>
          </div>
        )}

        {result ? (
          <div className="space-y-3">
            <Alert variant={result.created.length > 0 ? 'default' : 'destructive'}>
              <AlertDescription>
                Imported {result.created.length} question
                {result.created.length === 1 ? '' : 's'}
                {result.errors.length > 0 &&
                  ` — ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped.`}
              </AlertDescription>
            </Alert>
            {result.errors.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {result.errors.map((e) => (
                  <p key={e.row} className="text-xs text-muted-foreground">
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {!lockedQuizId && (
              <div className="space-y-1.5">
                <Label htmlFor="import-quiz">Target quiz</Label>
                {noQuizzesYet ? (
                  <p className="text-sm text-muted-foreground">
                    No quizzes yet. Create a quiz first.
                  </p>
                ) : (
                  <Select value={pickedQuizId} onValueChange={setPickedQuizId}>
                    <SelectTrigger id="import-quiz" className="w-full">
                      <SelectValue placeholder="Choose a quiz" />
                    </SelectTrigger>
                    <SelectContent>
                      {(quizzes ?? []).map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="import-file">Excel file</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={noQuizzesYet}
                >
                  <FileUp />
                  {fileName ? 'Choose a different file' : 'Choose file'}
                </Button>
                {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
              </div>
              <input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={onFileChange}
                disabled={noQuizzesYet}
              />
            </div>

            {imageRowCount > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="import-zip">
                  Images ({imageRowCount} row{imageRowCount === 1 ? '' : 's'} reference one)
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => zipInputRef.current?.click()}
                  >
                    <FileArchive />
                    {zipFileName ? 'Choose a different zip' : 'Choose zip of images'}
                  </Button>
                  {zipFileName && (
                    <span className="truncate text-sm text-muted-foreground">{zipFileName}</span>
                  )}
                </div>
                <input
                  ref={zipInputRef}
                  id="import-zip"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={onZipChange}
                />
                <p className="text-xs text-muted-foreground">
                  Each "Image filename" cell is matched by name against a file inside this zip.
                </p>
              </div>
            )}

            {readError && (
              <Alert variant="destructive">
                <AlertDescription>{readError}</AlertDescription>
              </Alert>
            )}

            {fileName && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {ready.length} question{ready.length === 1 ? '' : 's'} ready
                  {parseErrors.length > 0 &&
                    `, ${parseErrors.length} row${parseErrors.length === 1 ? '' : 's'} need fixing`}
                  .
                </p>
                {parseErrors.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {parseErrors.map((e, i) => (
                      <p key={`${e.line}-${i}`} className="text-xs text-muted-foreground">
                        Row {e.line}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
                {imageProgress && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Uploading images: {imageProgress.done}/{imageProgress.total}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => importMutation.mutate()}
                disabled={!quizId || ready.length === 0 || needsZip || importMutation.isPending}
                title={needsZip ? 'Upload a zip of images first' : undefined}
              >
                {importMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
                Import {ready.length > 0 ? ready.length : ''} question
                {ready.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
