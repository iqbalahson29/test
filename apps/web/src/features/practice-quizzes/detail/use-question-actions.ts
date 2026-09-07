import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api-client'
import { practiceGradingApi } from '../../practice-grading/api'
import { practiceQuestionsApi } from '../api'

/**
 * Duplicate/regrade actions for a quiz's questions, shared by the Overview
 * preview and the Questions tab. Questions can now be edited/removed on a
 * quiz in any status (see quizzes.service.ts / questions.service.ts), so
 * these live alongside that rather than being gated to DRAFT.
 */
export function useQuestionActions(quizId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice-quiz', quizId] })
    queryClient.invalidateQueries({ queryKey: ['practice-quiz-activity', quizId] })
    queryClient.invalidateQueries({ queryKey: ['practice-quiz-results', quizId] })
  }

  const duplicate = useMutation({
    mutationFn: (questionId: string) => practiceQuestionsApi.duplicate(quizId, questionId),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not duplicate question'),
  })

  const regradeQuestion = useMutation({
    mutationFn: (questionId: string) => practiceGradingApi.regradeQuestion(quizId, questionId),
    onSuccess: (result) => {
      invalidate()
      setError(null)
      setMessage(
        result.affectedAttempts === 0
          ? 'No submitted attempts to regrade yet.'
          : `Regraded ${result.regradedResponses} response${result.regradedResponses === 1 ? '' : 's'} across ${result.affectedAttempts} attempt${result.affectedAttempts === 1 ? '' : 's'}.`,
      )
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not regrade this question'),
  })

  const regradeQuiz = useMutation({
    mutationFn: () => practiceGradingApi.regradeQuiz(quizId),
    onSuccess: (result) => {
      invalidate()
      setError(null)
      setMessage(
        result.affectedAttempts === 0
          ? 'No submitted attempts to regrade yet.'
          : `Regraded ${result.regradedResponses} response${result.regradedResponses === 1 ? '' : 's'} across ${result.affectedAttempts} attempt${result.affectedAttempts === 1 ? '' : 's'}.`,
      )
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not regrade this quiz'),
  })

  return { error, message, clearMessage: () => setMessage(null), duplicate, regradeQuestion, regradeQuiz }
}
