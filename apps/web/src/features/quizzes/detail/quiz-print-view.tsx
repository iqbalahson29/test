import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { quizzesApi } from '../api'
import { formatDuration } from './format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function QuizPrintView() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const autoprint = searchParams.get('autoprint') === '1'

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizzesApi.get(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (autoprint && quiz) {
      const timer = setTimeout(() => window.print(), 300)
      return () => clearTimeout(timer)
    }
  }, [autoprint, quiz])

  if (isLoading || !quiz) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  }

  const totalPoints = quiz.questions.reduce((sum, q) => sum + Number(q.points), 0)

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex items-center justify-end print:hidden">
        <Button type="button" onClick={() => window.print()}>
          <Printer />
          Print / Save as PDF
        </Button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
      {quiz.description && <p className="mt-2 text-sm text-gray-600">{quiz.description}</p>}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
        <span>{quiz.questions.length} questions</span>
        <span>{totalPoints} points total</span>
        <span>{formatDuration(quiz.timeLimitSec)}</span>
        {quiz.passMarkPercent && <span>Pass mark {quiz.passMarkPercent}%</span>}
      </div>

      <hr className="my-6 border-gray-200" />

      <div className="space-y-6">
        {quiz.questions.map((q, i) => (
          <div key={q.id} className="break-inside-avoid">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-900">{i + 1}.</span>
              <Badge variant="outline">{q.type}</Badge>
              <span className="text-xs text-gray-400">{q.points} pts</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{q.prompt}</p>
            {q.options.length > 0 && (
              <ul className="mt-2 space-y-1 pl-4">
                {q.options.map((o) => (
                  <li
                    key={o.id}
                    className={
                      o.isCorrect
                        ? 'font-medium text-emerald-700'
                        : 'text-gray-600'
                    }
                  >
                    {o.isCorrect ? '✓ ' : '• '}
                    {o.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
