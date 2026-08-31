import { Check, X } from 'lucide-react'
import { questionsApi } from '../api'
import type { QuestionDetail } from '../types'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function QuestionDetailDialog({
  quizId,
  question,
  onOpenChange,
}: {
  quizId: string
  question: QuestionDetail | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={question !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {question && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{question.type}</Badge>
                <span className="text-sm text-muted-foreground">
                  {question.points} pts
                </span>
              </div>
              <DialogTitle className="whitespace-pre-wrap font-normal text-[14px]">
                {question.prompt}
              </DialogTitle>
            </DialogHeader>

            {question.attachmentKey && (
              <DocumentViewer
                mimeType={question.attachmentMimeType}
                filename={question.attachmentFilename}
                path={questionsApi.attachmentUrlPath(quizId, question.id)}
              />
            )}

            {question.options.length > 0 ? (
              <ul className="space-y-1.5">
                {question.options.map((o) => (
                  <li
                    key={o.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                      o.isCorrect
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 text-gray-700',
                    )}
                  >
                    {o.isCorrect ? (
                      <Check className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="size-4 shrink-0 text-gray-300" />
                    )}
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                This question type doesn't use fixed options.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
