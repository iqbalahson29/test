import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { gradingApi } from './api'
import type { GradingQueueItem } from './types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

function GradingQueueRow({ item, quizId }: { item: GradingQueueItem; quizId: string }) {
  const queryClient = useQueryClient()
  const [points, setPoints] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)

  const gradeMutation = useMutation({
    mutationFn: () =>
      gradingApi.grade(item.responseId, {
        awardedPoints: Number(points),
        feedback: feedback || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grading-queue', quizId] })
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not save grade'),
  })

  const [downloading, setDownloading] = useState(false)
  const onDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      const { downloadUrl } = await gradingApi.getDownloadUrl(item.responseId)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not fetch file')
    } finally {
      setDownloading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (points === '') return
    gradeMutation.mutate()
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.studentName}</p>
            <Badge variant="secondary" className="font-medium">
              {item.questionType === 'ESSAY' ? 'Essay' : 'File upload'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{item.questionPrompt}</p>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            {item.questionType === 'ESSAY' ? (
              item.answer?.text || (
                <span className="text-muted-foreground">No answer submitted.</span>
              )
            ) : item.fileKey ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDownload}
                disabled={downloading}
              >
                <Download />
                {downloading ? 'Fetching link…' : 'Download file'}
              </Button>
            ) : (
              <span className="text-muted-foreground">No file uploaded.</span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor={`points-${item.responseId}`}>Points (max {item.points})</Label>
              <Input
                id={`points-${item.responseId}`}
                type="number"
                min="0"
                max={item.points}
                step="0.5"
                required
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor={`feedback-${item.responseId}`}>Feedback (optional)</Label>
              <Textarea
                id={`feedback-${item.responseId}`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-8"
                rows={1}
              />
            </div>
            <Button type="submit" disabled={gradeMutation.isPending}>
              {gradeMutation.isPending ? 'Saving…' : 'Save grade'}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export function GradingQueuePage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['grading-queue', id],
    queryFn: () => gradingApi.queue(id!),
    enabled: !!id,
  })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        Grading queue{data && ` (${data.length} pending)`}
      </h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to grade.</p>
          )}
          {data?.map((item) => (
            <GradingQueueRow key={item.responseId} item={item} quizId={id!} />
          ))}
        </div>
      )}
    </div>
  )
}
