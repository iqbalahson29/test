import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// MathLive registers `<math-field>` as a custom element on import but ships
// no React/JSX typings for it — this is the minimal ambient declaration
// needed to use it directly in TSX. Interact with the element imperatively
// via a ref typed as `MathfieldElement` (exported from 'mathlive') for
// getValue()/setValue()/focus() rather than through React props.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        'virtual-keyboard-mode'?: string
        'math-virtual-keyboard-policy'?: 'auto' | 'manual' | 'sandboxed'
      }
    }
  }
}
