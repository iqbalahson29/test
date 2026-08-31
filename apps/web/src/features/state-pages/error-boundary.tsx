import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ServerErrorPage } from './server-error-page'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <ServerErrorPage onRetry={() => window.location.reload()} />
    }
    return this.props.children
  }
}
