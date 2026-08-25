import { QuestionType } from '@quiz-platform/shared'
import { EssayAnswer } from './essay-answer'
import { FillBlankAnswer } from './fill-blank-answer'
import { FileUploadAnswer } from './file-upload-answer'
import { MatchingAnswer } from './matching-answer'
import { McqMultiAnswer } from './mcq-multi-answer'
import { McqSingleAnswer } from './mcq-single-answer'
import { NumericAnswer } from './numeric-answer'
import { ShortTextAnswer } from './short-text-answer'
import type { AnswerInputProps } from './types'

export function AnswerInputField(props: AnswerInputProps) {
  switch (props.question.type) {
    case QuestionType.MCQ_SINGLE:
    case QuestionType.TRUE_FALSE:
      return <McqSingleAnswer {...props} />
    case QuestionType.MCQ_MULTI:
      return <McqMultiAnswer {...props} />
    case QuestionType.SHORT_TEXT:
      return <ShortTextAnswer {...props} />
    case QuestionType.NUMERIC:
      return <NumericAnswer {...props} />
    case QuestionType.ESSAY:
      return <EssayAnswer {...props} />
    case QuestionType.MATCHING:
      return <MatchingAnswer {...props} />
    case QuestionType.FILL_BLANK:
      return <FillBlankAnswer {...props} />
    case QuestionType.FILE_UPLOAD:
      return <FileUploadAnswer {...props} />
  }
}
