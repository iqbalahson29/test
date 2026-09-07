import { Fragment, useMemo } from 'react'
import katex from 'katex'

type Segment =
  | { type: 'text'; content: string }
  | { type: 'math'; content: string; display: boolean }

// Splits on $$...$$ (display math) first, then $...$ (inline math) within
// whatever's left. Content with no "$" at all comes back as a single plain
// text segment, so this is a safe drop-in wherever plain question text was
// rendered before.
function splitSegments(text: string): Segment[] {
  const segments: Segment[] = []
  const blockRe = /\$\$([^$]+?)\$\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushInlineSplit = (chunk: string) => {
    const inlineRe = /\$([^$\n]+?)\$/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = inlineRe.exec(chunk))) {
      if (m.index > last) segments.push({ type: 'text', content: chunk.slice(last, m.index) })
      segments.push({ type: 'math', content: m[1], display: false })
      last = inlineRe.lastIndex
    }
    if (last < chunk.length) segments.push({ type: 'text', content: chunk.slice(last) })
  }

  while ((match = blockRe.exec(text))) {
    if (match.index > lastIndex) pushInlineSplit(text.slice(lastIndex, match.index))
    segments.push({ type: 'math', content: match[1], display: true })
    lastIndex = blockRe.lastIndex
  }
  if (lastIndex < text.length) pushInlineSplit(text.slice(lastIndex))

  return segments
}

function renderKatex(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: display })
  } catch {
    return latex
  }
}

/** Renders plain text with $inline$ and $$display$$ LaTeX math segments
 * beautified via KaTeX — a drop-in replacement for rendering raw
 * prompt/option/answer text wherever it's shown read-only. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitSegments(text), [text])

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <Fragment key={i}>{seg.content}</Fragment>
        ) : (
          <span
            key={i}
            className={seg.display ? 'block my-1' : undefined}
            // KaTeX's output is a controlled, self-contained markup grammar —
            // not a place for arbitrary HTML injection.
            dangerouslySetInnerHTML={{ __html: renderKatex(seg.content, seg.display) }}
          />
        ),
      )}
    </span>
  )
}
