import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function ExportMenu({
  onExportPdf,
  onExportExcel,
  disabled,
  size = 'sm',
  className,
}: {
  onExportPdf: () => void
  onExportExcel: () => void
  disabled?: boolean
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          className={cn(className)}
        >
          <Download />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onExportPdf} className="gap-2">
          <FileText />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportExcel} className="gap-2">
          <FileSpreadsheet />
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
