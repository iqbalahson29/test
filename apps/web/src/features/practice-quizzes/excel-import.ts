import * as XLSX from 'xlsx'
import {
  ALL_QUESTION_DIFFICULTIES,
  ALL_QUESTION_TYPES,
  ALL_QUIZ_MODULES,
  QUIZ_MODULE_SHORT_LABELS,
  QuestionType,
} from '@quiz-platform/shared'
import type { QuestionDifficulty, QuizModule } from '@quiz-platform/shared'
import type { CreateQuestionInput } from './types'

const QUESTIONS_SHEET = 'Questions'

// Mirrors the "Export as Excel" column layout on the Questions tab, so a
// downloaded export can be edited and re-uploaded as-is. '#' is display-only
// and ignored on import; Module is required (every question belongs to one
// of the 4 fixed SAT modules); Difficulty is optional; Case Sensitive /
// Tolerance are the two extra columns needed to cover every question type.
const HEADER_ROW = [
  '#',
  'Module',
  'Type',
  'Difficulty',
  'Points',
  'Prompt',
  'Options',
  'Correct answer(s)',
  'Case Sensitive',
  'Tolerance',
  'Image filename',
]

const EXAMPLE_ROWS: (string | number)[][] = [
  [1, 'R&W Module 1', 'MCQ_SINGLE', 'Easy', 1, 'What is the capital of France?', 'Paris; London; Berlin; Madrid', 'Paris', '', '', ''],
  [2, 'R&W Module 1', 'MCQ_MULTI', 'Medium', 2, 'Which of these are primary colors?', 'Red; Green; Blue; Orange', 'Red; Blue', '', '', ''],
  [3, 'R&W Module 2', 'TRUE_FALSE', 'Easy', 1, 'The sun rises in the east.', '', 'True', '', '', ''],
  [4, 'R&W Module 2', 'SHORT_TEXT', 'Medium', 1, 'Name the largest planet in the solar system.', '', 'Jupiter; jupiter', 'False', '', ''],
  [5, 'Math Module 1', 'NUMERIC', 'Medium', 1, 'What is 6 times 7?', '', '42', '', 0, ''],
  [6, 'Math Module 1', 'ESSAY', 'Hard', 5, 'Explain the causes of World War I in 200 words.', '', '', '', '', ''],
  [7, 'Math Module 2', 'FILE_UPLOAD', '', 5, 'Upload your lab report as a PDF.', '', '', '', '', ''],
  [8, 'Math Module 2', 'MATCHING', 'Hard', 3, 'Match each animal to the sound it makes.', '', 'Cat=Meow; Dog=Bark; Cow=Moo', '', '', ''],
  [9, 'Math Module 2', 'FILL_BLANK', 'Medium', 2, 'The capital of {{1}} is {{2}}.', '', 'France; france|Paris; paris', 'False', '', 'chart.png'],
]

const MODULE_LOOKUP = new Map<string, QuizModule>()
for (const m of ALL_QUIZ_MODULES) {
  MODULE_LOOKUP.set(m.toLowerCase(), m)
  MODULE_LOOKUP.set(QUIZ_MODULE_SHORT_LABELS[m].toLowerCase(), m)
}

export function downloadQuestionsTemplate(filename = 'questions-import-template', bankMode = false) {
  const workbook = XLSX.utils.book_new()
  const rows = bankMode
    ? EXAMPLE_ROWS.filter((r) => r[2] !== QuestionType.ESSAY && r[2] !== QuestionType.FILE_UPLOAD)
    : EXAMPLE_ROWS
  const sheet = XLSX.utils.aoa_to_sheet([HEADER_ROW, ...rows])
  sheet['!cols'] = HEADER_ROW.map((h) => ({
    wch: h === 'Prompt' || h === 'Options' || h === 'Correct answer(s)' ? 36 : Math.max(h.length + 2, 10),
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, QUESTIONS_SHEET)
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function splitTop(raw: string, sep: string): string[] {
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function isTruthy(raw: string): boolean {
  return /^(true|yes|y|1)$/i.test(raw.trim())
}

interface ParsedRow {
  line: number
  question?: CreateQuestionInput
  error?: string
}

function buildQuestion(cells: Record<string, string>, line: number, bankMode: boolean): ParsedRow {
  const typeRaw = (cells['type'] ?? '').trim().toUpperCase()
  const moduleRaw = (cells['module'] ?? '').trim()
  const prompt = (cells['prompt'] ?? '').trim()
  const pointsRaw = (cells['points'] ?? '').trim()
  const optionsRaw = cells['options'] ?? ''
  const answerRaw = (cells['correct answer(s)'] ?? '').trim()
  const caseSensitive = isTruthy(cells['case sensitive'] ?? '')
  const toleranceRaw = (cells['tolerance'] ?? '').trim()
  const difficultyRaw = (cells['difficulty'] ?? '').trim().toUpperCase()

  if (!ALL_QUESTION_TYPES.includes(typeRaw as QuestionType)) {
    return {
      line,
      error: `Unsupported type "${cells['type'] ?? ''}". Use one of: ${ALL_QUESTION_TYPES.join(', ')}.`,
    }
  }
  if (bankMode && (typeRaw === QuestionType.ESSAY || typeRaw === QuestionType.FILE_UPLOAD)) {
    return {
      line,
      error: `${typeRaw} questions aren't allowed on a question-bank quiz — every bank question must be auto-gradable.`,
    }
  }
  const module = MODULE_LOOKUP.get(moduleRaw.toLowerCase())
  if (!module) {
    return {
      line,
      error: `Module must be one of: ${ALL_QUIZ_MODULES.map((m) => QUIZ_MODULE_SHORT_LABELS[m]).join(', ')} (got "${cells['module'] ?? ''}").`,
    }
  }
  if (!prompt) return { line, error: 'Prompt is required.' }
  if (pointsRaw === '') return { line, error: 'Points is required.' }
  const points = Number(pointsRaw)
  if (!Number.isFinite(points) || points < 0) {
    return { line, error: `Points must be a non-negative number (got "${pointsRaw}").` }
  }
  let difficulty: QuestionDifficulty | undefined
  if (difficultyRaw !== '') {
    if (!ALL_QUESTION_DIFFICULTIES.includes(difficultyRaw as QuestionDifficulty)) {
      return {
        line,
        error: `Difficulty must be one of: ${ALL_QUESTION_DIFFICULTIES.join(', ')} (or left blank), got "${cells['difficulty']}".`,
      }
    }
    difficulty = difficultyRaw as QuestionDifficulty
  }
  if (bankMode && !difficulty) {
    return { line, error: 'Difficulty is required for a question-bank quiz.' }
  }

  const type = typeRaw as QuestionType

  if (type === QuestionType.MCQ_SINGLE || type === QuestionType.MCQ_MULTI) {
    const optionTexts = splitTop(optionsRaw, ';')
    if (optionTexts.length < 2) {
      return { line, error: 'MCQ questions need an "Options" column with at least 2 values, separated by ";".' }
    }
    const correctNames = new Set(splitTop(answerRaw, ';').map((a) => a.toLowerCase()))
    if (correctNames.size === 0) {
      return { line, error: 'Correct answer(s) must name at least one option (separate multiple with ";").' }
    }
    const options = optionTexts.map((text) => ({
      text,
      isCorrect: correctNames.has(text.toLowerCase()),
    }))
    const correctCount = options.filter((o) => o.isCorrect).length
    if (correctCount === 0) {
      return { line, error: 'None of the values in "Correct answer(s)" match an option in "Options".' }
    }
    if (type === QuestionType.MCQ_SINGLE && correctCount !== 1) {
      return { line, error: 'MCQ_SINGLE requires exactly one correct answer.' }
    }
    return { line, question: { type, module, prompt, points, config: {}, difficulty, options } }
  }

  if (type === QuestionType.TRUE_FALSE) {
    const normalized = answerRaw.toLowerCase()
    if (normalized !== 'true' && normalized !== 'false') {
      return { line, error: 'TRUE_FALSE Correct answer(s) must be "True" or "False".' }
    }
    const isTrue = normalized === 'true'
    return {
      line,
      question: {
        type,
        module,
        prompt,
        points,
        config: {},
        difficulty,
        options: [
          { text: 'True', isCorrect: isTrue },
          { text: 'False', isCorrect: !isTrue },
        ],
      },
    }
  }

  if (type === QuestionType.SHORT_TEXT) {
    const acceptedAnswers = splitTop(answerRaw, ';')
    if (acceptedAnswers.length === 0) {
      return {
        line,
        error: 'SHORT_TEXT needs at least one accepted answer in "Correct answer(s)" (separate multiple with ";").',
      }
    }
    return {
      line,
      question: { type, module, prompt, points, config: { acceptedAnswers, caseSensitive }, difficulty },
    }
  }

  if (type === QuestionType.NUMERIC) {
    if (answerRaw === '') {
      return { line, error: 'NUMERIC needs a "Correct answer(s)".' }
    }
    const correctAnswer = Number(answerRaw)
    if (!Number.isFinite(correctAnswer)) {
      return { line, error: `NUMERIC Correct answer(s) must be a number (got "${answerRaw}").` }
    }
    const tolerance = toleranceRaw ? Number(toleranceRaw) : 0
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      return { line, error: `Tolerance must be a non-negative number (got "${toleranceRaw}").` }
    }
    return {
      line,
      question: { type, module, prompt, points, config: { correctAnswer, tolerance }, difficulty },
    }
  }

  if (type === QuestionType.ESSAY || type === QuestionType.FILE_UPLOAD) {
    return { line, question: { type, module, prompt, points, config: {}, difficulty } }
  }

  if (type === QuestionType.MATCHING) {
    const pairTokens = splitTop(answerRaw, ';')
    if (pairTokens.length < 2) {
      return {
        line,
        error: 'MATCHING needs at least 2 pairs in "Correct answer(s)", formatted as left=right and separated by ";".',
      }
    }
    const pairs: { left: string; right: string }[] = []
    for (const token of pairTokens) {
      const eq = token.indexOf('=')
      if (eq === -1) {
        return { line, error: `Each MATCHING pair must be "left=right" (got "${token}").` }
      }
      const left = token.slice(0, eq).trim()
      const right = token.slice(eq + 1).trim()
      if (!left || !right) {
        return { line, error: `Each MATCHING pair needs both a left and right value (got "${token}").` }
      }
      pairs.push({ left, right })
    }
    return { line, question: { type, module, prompt, points, config: { pairs }, difficulty } }
  }

  // FILL_BLANK — blanks separated by "|", accepted answers within a blank separated by ";"
  const blankTokens = splitTop(answerRaw, '|')
  if (blankTokens.length === 0) {
    return {
      line,
      error:
        'FILL_BLANK needs at least one blank in "Correct answer(s)", separated by "|" (use ";" for multiple accepted answers per blank).',
    }
  }
  const blanks = blankTokens.map((token) => ({
    acceptedAnswers: splitTop(token, ';'),
    caseSensitive,
  }))
  if (blanks.some((b) => b.acceptedAnswers.length === 0)) {
    return { line, error: 'Each FILL_BLANK blank needs at least one accepted answer.' }
  }
  return { line, question: { type, module, prompt, points, config: { blanks }, difficulty } }
}

export interface ExcelImportResult {
  questions: CreateQuestionInput[]
  /** Parallel to `questions` (same index) — the "Image filename" cell for
   * that row, still needing to be resolved against an uploaded zip of
   * images before the question can be created with an image attached. */
  pendingImageFilenames: (string | undefined)[]
  /** Parallel to `questions` (same index) — original spreadsheet row number,
   * for reporting image-resolution errors against the right row. */
  lines: number[]
  errors: { line: number; message: string }[]
}

/** Parses an uploaded questions workbook (see downloadQuestionsTemplate for
 * the expected format). Pass `bankMode: true` for a question-bank quiz to
 * reject ESSAY/FILE_UPLOAD rows and require a Difficulty on every row. */
export function parseQuestionsExcel(buffer: ArrayBuffer, bankMode = false): ExcelImportResult {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    return {
      questions: [],
      pendingImageFilenames: [],
      lines: [],
      errors: [{ line: 1, message: 'Could not read that file as an Excel workbook.' }],
    }
  }

  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === QUESTIONS_SHEET.toLowerCase()) ??
    workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) {
    return {
      questions: [],
      pendingImageFilenames: [],
      lines: [],
      errors: [{ line: 1, message: 'The workbook has no sheets.' }],
    }
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  if (rows.length === 0) {
    return {
      questions: [],
      pendingImageFilenames: [],
      lines: [],
      errors: [{ line: 1, message: 'The Questions sheet is empty.' }],
    }
  }

  const header = (rows[0] as unknown[]).map(normalizeHeader)
  const required = ['module', 'type', 'prompt', 'points', 'correct answer(s)']
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    return {
      questions: [],
      pendingImageFilenames: [],
      lines: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.join(', ')}.` }],
    }
  }

  const questions: CreateQuestionInput[] = []
  const pendingImageFilenames: (string | undefined)[] = []
  const lines: number[] = []
  const errors: { line: number; message: string }[] = []

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r] as unknown[]
    if (raw.every((v) => String(v ?? '').trim() === '')) continue
    const line = r + 1
    const cells: Record<string, string> = {}
    header.forEach((col, i) => {
      cells[col] = String(raw[i] ?? '').trim()
    })
    const result = buildQuestion(cells, line, bankMode)
    if (result.error) errors.push({ line, message: result.error })
    else if (result.question) {
      questions.push(result.question)
      pendingImageFilenames.push(cells['image filename'] || undefined)
      lines.push(line)
    }
  }

  return { questions, pendingImageFilenames, lines, errors }
}
