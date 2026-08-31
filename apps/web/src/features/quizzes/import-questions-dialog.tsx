import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileUp, Loader2 } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { quizzesApi, questionsApi } from './api'
import type { ImportQuestionsResult } from './api'
import type { CreateQuestionInput } from './types'
import { CSV_TEMPLATE, parseQuestionsCsv } from './csv-import'
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

const TEMPLATE_HREF =
  'data:text/csv;charset=utf-8,' + encodeURIComponent(CSV_TEMPLATE)

export function ImportQuestionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: quizzes } = useQuery({ queryKey: ['quizzes'], queryFn: quizzesApi.list })
  const draftQuizzes = useMemo(() => (quizzes ?? []).filter((q) => q.status === 'DRAFT'), [quizzes])

  const [quizId, setQuizId] = useState<string>('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([])
  const [ready, setReady] = useState<CreateQuestionInput[]>([])
  const [result, setResult] = useState<ImportQuestionsResult | null>(null)
  const [readError, setReadError] = useState<string | null>(null)

  const reset = () => {
    setQuizId('')
    setFileName(null)
    setParseErrors([])
    setReady([])
    setResult(null)
    setReadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const importMutation = useMutation({
    mutationFn: () => questionsApi.import(quizId, ready),
    onSuccess: (res) => {
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] })
    },
    onError: (err: unknown) =>
      setReadError(err instanceof ApiError ? err.message : 'Could not import questions'),
  })

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setResult(null)
    setReadError(null)
    if (!file) {
      setFileName(null)
      setReady([])
      setParseErrors([])
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const { questions, errors } = parseQuestionsCsv(String(reader.result ?? ''))
      setReady(questions)
      setParseErrors(errors)
    }
    reader.onerror = () => setReadError('Could not read that file.')
    reader.readAsText(file)
  }

  const close = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            Upload a CSV of questions to add to a draft quiz. Supports MCQ (single/multi),
            true/false, short text, and numeric types.{' '}
            <a href={TEMPLATE_HREF} download="questions-template.csv">
              Download a template
            </a>
            .
          </DialogDescription>
        </DialogHeader>

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
            <div className="space-y-1.5">
              <Label htmlFor="import-quiz">Target quiz</Label>
              {draftQuizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No draft quizzes available. Create a quiz first — questions can only be
                  added while it's a draft.
                </p>
              ) : (
                <Select value={quizId} onValueChange={setQuizId}>
                  <SelectTrigger id="import-quiz" className="w-full">
                    <SelectValue placeholder="Choose a draft quiz" />
                  </SelectTrigger>
                  <SelectContent>
                    {draftQuizzes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">CSV file</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={draftQuizzes.length === 0}
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
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFileChange}
                disabled={draftQuizzes.length === 0}
              />
            </div>

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
                    {parseErrors.map((e) => (
                      <p key={e.line} className="text-xs text-muted-foreground">
                        Line {e.line}: {e.message}
                      </p>
                    ))}
                  </div>
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
                disabled={!quizId || ready.length === 0 || importMutation.isPending}
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
