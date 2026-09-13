import { useId, useState, type FormEvent } from 'react'
import type { Account, AuthApi } from '../api/auth-api'
import { TrackerApiError } from '../api/tracker-api'
import { Icon } from './Icon'

interface AuthScreenProps {
  authApi: AuthApi
  onAuthenticated: (account: Account) => void
}

const MIN_PASSWORD = 10

export function AuthScreen({ authApi, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const errorId = useId()

  const isRegister = mode === 'register'

  function switchMode() {
    setMode(isRegister ? 'signIn' : 'register')
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSubmitting) return

    if (isRegister && password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${MIN_PASSWORD} characters.`)
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const account = isRegister
        ? await authApi.register(email, password)
        : await authApi.signIn(email, password)
      onAuthenticated(account)
    } catch (caught: unknown) {
      setError(caught instanceof TrackerApiError
        ? caught.message
        : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} aria-labelledby={titleId}>
        <div className="brand" aria-label="Tempo">
          <span className="brand-mark">T</span>
          <div>
            <strong>tempo</strong>
            <small>make time visible</small>
          </div>
        </div>

        <h1 id={titleId}>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-lede">
          {isRegister
            ? 'Your projects and entries are private to your account.'
            : 'Sign in to see your month.'}
        </p>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? errorId : undefined}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? errorId : undefined}
          />
        </label>

        {isRegister && <p className="auth-hint">At least {MIN_PASSWORD} characters.</p>}
        {error && <p className="form-error" id={errorId} role="alert">{error}</p>}

        <button className="primary-button full-width" type="submit" disabled={isSubmitting}>
          <Icon name="check" />
          {isSubmitting
            ? (isRegister ? 'Creating…' : 'Signing in…')
            : (isRegister ? 'Create account' : 'Sign in')}
        </button>

        <button type="button" className="text-button auth-switch" onClick={switchMode}>
          {isRegister ? 'I already have an account' : 'Create an account instead'}
        </button>
      </form>
    </main>
  )
}
