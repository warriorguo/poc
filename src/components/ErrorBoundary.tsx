import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Without this, any exception thrown during render unmounts the whole tree and
 * leaves a blank page with no way back.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Tempo failed to render.', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-screen" role="alert">
        <span className="eyebrow">Something went wrong</span>
        <h1>Tempo could not draw this screen.</h1>
        <p>Your saved entries are untouched. Reloading usually clears it.</p>
        <pre>{error.message}</pre>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>
          Reload Tempo
        </button>
      </div>
    )
  }
}
