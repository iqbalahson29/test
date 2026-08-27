import { QuestionType } from '@quiz-platform/shared'
import type { OptionInput } from '../types'

export function emptyConfigFor(type: QuestionType): Record<string, unknown> {
  switch (type) {
    case QuestionType.SHORT_TEXT:
      return { acceptedAnswers: [''], caseSensitive: false }
    case QuestionType.NUMERIC:
      return { correctAnswer: 0, tolerance: 0 }
    case QuestionType.MATCHING:
      return {
        pairs: [
          { left: '', right: '' },
          { left: '', right: '' },
        ],
      }
    case QuestionType.FILL_BLANK:
      return { blanks: [{ acceptedAnswers: [''], caseSensitive: false }] }
    case QuestionType.FILE_UPLOAD:
      return { allowedExtensions: [], maxSizeMb: 10 }
    default:
      return {}
  }
}

export function emptyOptionsFor(type: QuestionType): OptionInput[] {
  if (type === QuestionType.TRUE_FALSE) {
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ]
  }
  if (type === QuestionType.MCQ_SINGLE || type === QuestionType.MCQ_MULTI) {
    return [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ]
  }
  return []
}
