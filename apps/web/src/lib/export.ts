import { jsPDF } from 'jspdf'
import autoTable, { applyPlugin } from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// autoTable() only self-registers onto a global `window.jsPDF`, which isn't
// how we import it — apply it explicitly so `doc.getLastAutoTable()` works.
applyPlugin(jsPDF)

export type CellValue = string | number | null | undefined

export interface ExportSection {
  heading?: string
  columns: string[]
  rows: CellValue[][]
}

const PRIMARY_RGB: [number, number, number] = [3, 4, 94]
const MARGIN_X = 14

function toCell(v: CellValue): string | number {
  return v ?? ''
}

/** Renders one or more titled tables into a downloadable PDF report. */
export function exportSectionsToPdf(
  filename: string,
  title: string,
  sections: ExportSection[],
  subtitle?: string,
) {
  const doc = new jsPDF()
  let cursorY = 16

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(title, MARGIN_X, cursorY)
  cursorY += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  const stamp = `Exported ${new Date().toLocaleString()}`
  doc.text(subtitle ? `${subtitle} · ${stamp}` : stamp, MARGIN_X, cursorY)
  doc.setTextColor(20)
  cursorY += 8

  for (const section of sections) {
    const pageHeight = doc.internal.pageSize.getHeight()
    if (cursorY > pageHeight - 40) {
      doc.addPage()
      cursorY = 16
    }
    if (section.heading) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(section.heading, MARGIN_X, cursorY)
      cursorY += 5
    }
    autoTable(doc, {
      startY: cursorY,
      head: [section.columns],
      body: section.rows.map((row) => row.map(toCell)),
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: PRIMARY_RGB, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 247, 251] },
      margin: { left: MARGIN_X, right: MARGIN_X },
      theme: 'grid',
    })
    cursorY = (doc.getLastAutoTable()?.finalY ?? cursorY) + 10
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

export interface ExportSheet {
  name: string
  columns: string[]
  rows: CellValue[][]
}

/** Writes one or more properly-columned sheets into a downloadable .xlsx workbook. */
export function exportSheetsToExcel(filename: string, sheets: ExportSheet[]) {
  const workbook = XLSX.utils.book_new()

  sheets.forEach((sheet) => {
    const aoa: (string | number)[][] = [sheet.columns, ...sheet.rows.map((row) => row.map(toCell))]
    const worksheet = XLSX.utils.aoa_to_sheet(aoa)

    worksheet['!cols'] = sheet.columns.map((colName, colIdx) => {
      const maxLen = aoa.reduce((max, row) => {
        const v = row[colIdx]
        return Math.max(max, v == null ? 0 : String(v).length)
      }, colName.length)
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) }
    })

    if (sheet.columns.length > 0) {
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: sheet.columns.length - 1 } }),
      }
    }

    // Sheet names are capped at 31 chars and can't contain []:*?/\.
    const safeName = sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet'
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName)
  })

  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
