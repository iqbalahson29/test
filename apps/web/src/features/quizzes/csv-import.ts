import { QuestionType } from '@quiz-platform/shared'
import type { CreateQuestionInput } from './types'

const IMPORTABLE_TYPES = new Set<string>([
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE,
  QuestionType.SHORT_TEXT,
  QuestionType.NUMERIC,
])

export const CSV_TEMPLATE = `type,prompt,points,options,answer,tolerance
MCQ_SINGLE,"What is the capital of France?",1,"Paris|London|Berlin|Madrid",Paris,
MCQ_MULTI,"Which of these are primary colors?",2,"Red|Green|Blue|Orange",Red|Blue,
TRUE_FALSE,"The sun rises in the east.",1,,true,
SHORT_TEXT,"Name the largest planet in the solar system.",1,,Jupiter|jupiter,
NUMERIC,"What is 6 times 7?",1,,42,0
`

/** Parses RFC4180-ish CSV text (quoted fields, escaped "" quotes) into rows of raw string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\n') {
      pushRow()
    } else if (c === '\r') {
      // skip; \n (or end of text) handles the row break
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

interface ParsedRow {
  line: number
  question?: CreateQuestionInput
  error?: string
}

const REQUIRED_COLUMNS = ['type', 'prompt', 'points'] as const

function splitList(raw: string): string[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildQuestion(cells: Record<string, string>, line: number): ParsedRow {
  const typeRaw = (cells.type ?? '').trim().toUpperCase()
  const prompt = (cells.prompt ?? '').trim()
  const pointsRaw = (cells.points ?? '').trim()
  const optionsRaw = cells.options ?? ''
  const answerRaw = (cells.answer ?? '').trim()
  const toleranceRaw = (cells.tolerance ?? '').trim()

  if (!IMPORTABLE_TYPES.has(typeRaw)) {
    return {
      line,
      error: `Unsupported type "${cells.type}". Use MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, SHORT_TEXT, or NUMERIC.`,
    }
  }
  if (!prompt) return { line, error: 'Prompt is required.' }

  const points = Number(pointsRaw)
  if (!Number.isFinite(points) || points < 0) {
    return { line, error: `Points must be a non-negative number (got "${pointsRaw}").` }
  }

  const type = typeRaw as QuestionType

  if (type === QuestionType.MCQ_SINGLE || type === QuestionType.MCQ_MULTI) {
    const optionTexts = splitList(optionsRaw)
    if (optionTexts.length < 2) {
      return { line, error: 'MCQ questions need an "options" column with at least 2 values, pipe-separated.' }
    }
    const correct = new Set(splitList(answerRaw).map((a) => a.toLowerCase()))
    if (correct.size === 0) {
      return { line, error: 'The "answer" column must name at least one correct option.' }
    }
    const options = optionTexts.map((text) => ({
      text,
      isCorrect: correct.has(text.toLowerCase()),
    }))
    const correctCount = options.filter((o) => o.isCorrect).length
    if (correctCount === 0) {
      return { line, error: 'None of the values in "answer" match an option in "options".' }
    }
    if (type === QuestionType.MCQ_SINGLE && correctCount !== 1) {
      return { line, error: 'MCQ_SINGLE requires exactly one correct answer.' }
    }
    return { line, question: { type, prompt, points, config: {}, options } }
  }

  if (type === QuestionType.TRUE_FALSE) {
    const normalized = answerRaw.toLowerCase()
    if (normalized !== 'true' && normalized !== 'false') {
      return { line, error: 'TRUE_FALSE answer must be "true" or "false".' }
    }
    const isTrue = normalized === 'true'
    return {
      line,
      question: {
        type,
        prompt,
        points,
        config: {},
        options: [
          { text: 'True', isCorrect: isTrue },
          { text: 'False', isCorrect: !isTrue },
        ],
      },
    }
  }

  if (type === QuestionType.SHORT_TEXT) {
    const acceptedAnswers = splitList(answerRaw)
    if (acceptedAnswers.length === 0) {
      return { line, error: 'SHORT_TEXT needs at least one accepted answer in "answer".' }
    }
    return {
      line,
      question: {
        type,
        prompt,
        points,
        config: { acceptedAnswers, caseSensitive: false },
      },
    }
  }

  // NUMERIC
  const correctAnswer = Number(answerRaw)
  if (!Number.isFinite(correctAnswer)) {
    return { line, error: `NUMERIC answer must be a number (got "${answerRaw}").` }
  }
  const tolerance = toleranceRaw ? Number(toleranceRaw) : 0
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return { line, error: `Tolerance must be a non-negative number (got "${toleranceRaw}").` }
  }
  return {
    line,
    question: { type, prompt, points, config: { correctAnswer, tolerance } },
  }
}

export interface CsvImportResult {
  questions: CreateQuestionInput[]
  errors: { line: number; message: string }[]
}

export function parseQuestionsCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length === 0) {
    return { questions: [], errors: [{ line: 1, message: 'File is empty.' }] }
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    return {
      questions: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.join(', ')}.` }],
    }
  }

  const questions: CreateQuestionInput[] = []
  const errors: { line: number; message: string }[] = []

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1
    const cells: Record<string, string> = {}
    header.forEach((col, idx) => {
      cells[col] = rows[i][idx] ?? ''
    })
    const result = buildQuestion(cells, line)
    if (result.error) errors.push({ line, message: result.error })
    else if (result.question) questions.push(result.question)
  }

  return { questions, errors }
}
