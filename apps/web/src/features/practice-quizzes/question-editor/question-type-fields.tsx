import { QuestionType } from '@quiz-platform/shared'
import type { OptionInput } from '../types'
import type { ConfigEditorProps } from './config-editor-props'
import { EssayEditor } from './essay-editor'
import { FileUploadEditor } from './file-upload-editor'
import { FillBlankEditor } from './fill-blank-editor'
import { MatchingEditor } from './matching-editor'
import { NumericEditor } from './numeric-editor'
import { OptionsEditor } from './options-editor'
import { ShortTextEditor } from './short-text-editor'
import { TrueFalseEditor } from './true-false-editor'

export function QuestionTypeFields({
  type,
  config,
  onChange,
  options,
  onOptionsChange,
  quizId,
  questionId,
}: ConfigEditorProps & {
  type: QuestionType
  options: OptionInput[]
  onOptionsChange: (options: OptionInput[]) => void
  quizId: string
  questionId?: string
}) {
  switch (type) {
    case QuestionType.MCQ_SINGLE:
      return (
        <OptionsEditor
          mode="single"
          quizId={quizId}
          questionId={questionId}
          options={options}
          onChange={onOptionsChange}
        />
      )
    case QuestionType.MCQ_MULTI:
      return (
        <OptionsEditor
          mode="multi"
          quizId={quizId}
          questionId={questionId}
          options={options}
          onChange={onOptionsChange}
        />
      )
    case QuestionType.TRUE_FALSE:
      return <TrueFalseEditor options={options} onChange={onOptionsChange} />
    case QuestionType.SHORT_TEXT:
      return <ShortTextEditor config={config} onChange={onChange} />
    case QuestionType.NUMERIC:
      return <NumericEditor config={config} onChange={onChange} />
    case QuestionType.ESSAY:
      return <EssayEditor config={config} onChange={onChange} />
    case QuestionType.MATCHING:
      return <MatchingEditor config={config} onChange={onChange} />
    case QuestionType.FILL_BLANK:
      return <FillBlankEditor config={config} onChange={onChange} />
    case QuestionType.FILE_UPLOAD:
      return <FileUploadEditor config={config} onChange={onChange} />
  }
}
