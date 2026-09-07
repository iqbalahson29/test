import { useState } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

type CalcMode = 'basic' | 'scientific'
type AngleUnit = 'deg' | 'rad'
type Operator = '+' | '-' | '*' | '/' | '^'

const MAX_DISPLAY_LEN = 14

const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '^': '^',
}

interface CalcState {
  display: string
  storedValue: number | null
  operator: Operator | null
  waitingForOperand: boolean
}

const initialState: CalcState = {
  display: '0',
  storedValue: null,
  operator: null,
  waitingForOperand: false,
}

function formatResult(value: number): string {
  if (!Number.isFinite(value)) return 'Error'
  let str = value.toPrecision(12)
  if (str.includes('.') && !str.includes('e')) {
    str = str.replace(/0+$/, '').replace(/\.$/, '')
  }
  if (str.replace('-', '').length > MAX_DISPLAY_LEN) {
    str = value.toExponential(6)
  }
  return str
}

function applyOperator(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? NaN : a / b
    case '^':
      return Math.pow(a, b)
  }
}

function CalcKey({
  label,
  onClick,
  className,
  ariaLabel,
}: {
  label: React.ReactNode
  onClick: () => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100',
        className,
      )}
    >
      {label}
    </button>
  )
}

export function Calculator() {
  const [mode, setMode] = useState<CalcMode>('basic')
  const [angleUnit, setAngleUnit] = useState<AngleUnit>('deg')
  const [state, setState] = useState<CalcState>(initialState)

  const inputDigit = (digit: string) => {
    setState((prev) => {
      if (prev.waitingForOperand) return { ...prev, display: digit, waitingForOperand: false }
      if (prev.display === '0') return { ...prev, display: digit }
      if (prev.display.replace('-', '').length >= MAX_DISPLAY_LEN) return prev
      return { ...prev, display: prev.display + digit }
    })
  }

  const inputDecimal = () => {
    setState((prev) => {
      if (prev.waitingForOperand) return { ...prev, display: '0.', waitingForOperand: false }
      if (prev.display.includes('.')) return prev
      return { ...prev, display: prev.display + '.' }
    })
  }

  const clearAll = () => setState(initialState)

  const backspace = () => {
    setState((prev) => {
      if (prev.waitingForOperand) return prev
      const next = prev.display.length > 1 ? prev.display.slice(0, -1) : '0'
      return { ...prev, display: next === '-' ? '0' : next }
    })
  }

  const toggleSign = () => {
    setState((prev) => ({
      ...prev,
      display:
        prev.display === '0'
          ? prev.display
          : prev.display.startsWith('-')
            ? prev.display.slice(1)
            : `-${prev.display}`,
    }))
  }

  const inputPercent = () => {
    setState((prev) => ({ ...prev, display: formatResult(Number(prev.display) / 100) }))
  }

  const setOperator = (nextOperator: Operator) => {
    setState((prev) => {
      const inputValue = Number(prev.display)
      if (prev.storedValue === null) {
        return { display: prev.display, storedValue: inputValue, operator: nextOperator, waitingForOperand: true }
      }
      if (prev.waitingForOperand) {
        return { ...prev, operator: nextOperator }
      }
      const result = applyOperator(prev.storedValue, inputValue, prev.operator ?? nextOperator)
      return { display: formatResult(result), storedValue: result, operator: nextOperator, waitingForOperand: true }
    })
  }

  const equals = () => {
    setState((prev) => {
      if (prev.operator === null || prev.storedValue === null) return prev
      const inputValue = Number(prev.display)
      const result = applyOperator(prev.storedValue, inputValue, prev.operator)
      return { display: formatResult(result), storedValue: null, operator: null, waitingForOperand: true }
    })
  }

  const applyUnary = (fn: (x: number) => number) => {
    setState((prev) => ({ ...prev, display: formatResult(fn(Number(prev.display))), waitingForOperand: true }))
  }

  const insertConstant = (value: number) => {
    setState((prev) => ({ ...prev, display: formatResult(value), waitingForOperand: true }))
  }

  const toRad = (deg: number) => (angleUnit === 'deg' ? (deg * Math.PI) / 180 : deg)

  const pendingOperand = state.storedValue !== null ? formatResult(state.storedValue) : null

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-0.5 text-[11.5px] font-medium">
        <button
          type="button"
          onClick={() => setMode('basic')}
          className={cn('rounded py-1 transition-colors', mode === 'basic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}
        >
          Basic
        </button>
        <button
          type="button"
          onClick={() => setMode('scientific')}
          className={cn(
            'rounded py-1 transition-colors',
            mode === 'scientific' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
          )}
        >
          Scientific
        </button>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-right">
        <p className="h-4 truncate text-[11px] text-gray-400">
          {pendingOperand !== null && state.operator ? `${pendingOperand} ${OPERATOR_SYMBOLS[state.operator]}` : ' '}
        </p>
        <p className="truncate text-xl font-semibold text-gray-900 tabular-nums">{state.display}</p>
      </div>

      {mode === 'scientific' && (
        <div className="grid grid-cols-4 gap-1.5">
          <CalcKey label="sin" onClick={() => applyUnary((x) => Math.sin(toRad(x)))} />
          <CalcKey label="cos" onClick={() => applyUnary((x) => Math.cos(toRad(x)))} />
          <CalcKey label="tan" onClick={() => applyUnary((x) => Math.tan(toRad(x)))} />
          <CalcKey
            label={angleUnit.toUpperCase()}
            ariaLabel="Toggle degrees / radians"
            onClick={() => setAngleUnit((prev) => (prev === 'deg' ? 'rad' : 'deg'))}
            className="border-gray-300 bg-gray-50 text-gray-500"
          />
          <CalcKey label="log" onClick={() => applyUnary((x) => Math.log10(x))} />
          <CalcKey label="ln" onClick={() => applyUnary((x) => Math.log(x))} />
          <CalcKey label="√x" onClick={() => applyUnary((x) => Math.sqrt(x))} />
          <CalcKey label="x²" onClick={() => applyUnary((x) => x * x)} />
          <CalcKey label="1/x" onClick={() => applyUnary((x) => 1 / x)} />
          <CalcKey label="π" onClick={() => insertConstant(Math.PI)} />
          <CalcKey label="e" onClick={() => insertConstant(Math.E)} />
          <CalcKey label="x^y" onClick={() => setOperator('^')} />
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        <CalcKey label="C" onClick={clearAll} className="text-red-500" />
        <CalcKey label={<Delete className="size-4" />} ariaLabel="Backspace" onClick={backspace} />
        <CalcKey label="%" onClick={inputPercent} />
        <CalcKey label="÷" onClick={() => setOperator('/')} className="text-primary-600" />

        <CalcKey label="7" onClick={() => inputDigit('7')} />
        <CalcKey label="8" onClick={() => inputDigit('8')} />
        <CalcKey label="9" onClick={() => inputDigit('9')} />
        <CalcKey label="×" onClick={() => setOperator('*')} className="text-primary-600" />

        <CalcKey label="4" onClick={() => inputDigit('4')} />
        <CalcKey label="5" onClick={() => inputDigit('5')} />
        <CalcKey label="6" onClick={() => inputDigit('6')} />
        <CalcKey label="−" onClick={() => setOperator('-')} className="text-primary-600" />

        <CalcKey label="1" onClick={() => inputDigit('1')} />
        <CalcKey label="2" onClick={() => inputDigit('2')} />
        <CalcKey label="3" onClick={() => inputDigit('3')} />
        <CalcKey label="+" onClick={() => setOperator('+')} className="text-primary-600" />

        <CalcKey label="±" onClick={toggleSign} />
        <CalcKey label="0" onClick={() => inputDigit('0')} />
        <CalcKey label="." onClick={inputDecimal} />
        <CalcKey
          label="="
          onClick={equals}
          className="border-primary-600 bg-primary-600 text-white hover:bg-primary-700"
        />
      </div>
    </div>
  )
}
