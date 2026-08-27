import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { quizzesApi } from './api'
import { StatusBadge } from './status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function QuizListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['quizzes'],
    queryFn: quizzesApi.list,
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[17px] font-bold text-gray-900">Quizzes</h1>
        <Button asChild>
          <Link to="/teacher/quizzes/new">
            <Plus />
            New quiz
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="max-w-2xl space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {data?.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No quizzes yet.</p>
              </CardContent>
            </Card>
          )}
          {data?.map((q) => (
            <Link key={q.id} to={`/teacher/quizzes/${q.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{q.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {q.questionCount} question{q.questionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <StatusBadge status={q.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
