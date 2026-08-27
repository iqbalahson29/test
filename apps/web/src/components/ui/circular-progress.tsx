import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function CircularProgress({
  value,
  size = 112,
  strokeWidth = 10,
  className,
  trackClassName,
  indicatorClassName,
  children,
}: {
  value: number
  size?: number
  strokeWidth?: number
  className?: string
  trackClassName?: string
  indicatorClassName?: string
  children?: ReactNode
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn('stroke-gray-100', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('stroke-primary-600 transition-[stroke-dashoffset] duration-500', indicatorClassName)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
