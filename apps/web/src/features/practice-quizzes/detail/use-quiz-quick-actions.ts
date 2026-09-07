import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/api-client'
import { practiceQuizzesApi } from '../api'
import type { QuizDetail } from '../types'

/**
 * Duplicate/export/archive/restore/delete for a quiz, shared by the header
 * "..." dropdown and the sidebar Quick actions card so both trigger the
 * same mutations instead of duplicating the logic.
 */
/**
 * Accepts `quiz` before it has loaded so the hook can be called
 * unconditionally at the top of the detail page (React's rules of hooks
 * forbid calling it only once `quiz` is defined). Every action here is only
 * ever wired to a button that isn't rendered until `quiz` is loaded, so the
 * non-null id/status access inside the mutation callbacks is safe at
 * call-time even though `quiz` itself is optional here.
 */
export function useQuizQuickActions(quiz: QuizDetail | undefined) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice-quiz', quiz!.id] })
    queryClient.invalidateQueries({ queryKey: ['practice-quizzes'] })
  }

  const duplicateMutation = useMutation({
    mutationFn: () => practiceQuizzesApi.duplicate(quiz!.id),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['practice-quizzes'] })
      navigate(`/teacher/practice-quizzes/${copy.id}`)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not duplicate quiz'),
  })

  const archiveMutation = useMutation({
    mutationFn: () => practiceQuizzesApi.updateStatus(quiz!.id, 'ARCHIVED'),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not archive quiz'),
  })

  const restoreMutation = useMutation({
    mutationFn: () => practiceQuizzesApi.updateStatus(quiz!.id, 'DRAFT'),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not restore quiz'),
  })

  const removeMutation = useMutation({
    mutationFn: () => practiceQuizzesApi.remove(quiz!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-quizzes'] })
      navigate('/teacher/practice-quizzes', { replace: true })
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not delete quiz'),
  })

  const previewQuiz = () => {
    window.open(`/teacher/practice-quizzes/${quiz!.id}/print`, '_blank', 'noopener,noreferrer')
  }

  const exportPdf = () => {
    window.open(
      `/teacher/practice-quizzes/${quiz!.id}/print?autoprint=1`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return {
    error,
    previewQuiz,
    exportPdf,
    duplicate: duplicateMutation,
    archive: archiveMutation,
    canArchive: quiz?.status === 'PUBLISHED' || quiz?.status === 'SCHEDULED',
    restore: restoreMutation,
    canRestore: quiz?.status === 'ARCHIVED',
    remove: removeMutation,
  }
}
