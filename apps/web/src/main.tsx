import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/auth-context'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'
import 'katex/dist/katex.min.css'
// Side-effect import — registers the <math-field> custom element used by
// EquationEditorDialog (apps/web/src/components/math/equation-editor-dialog.tsx).
import 'mathlive'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <App />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
