import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAuthApi, type Account, type AuthApi } from './api/auth-api'
import { createHttpTrackerApi } from './api/http-tracker-api'
import type { TrackerApi } from './api/tracker-api'
import { App } from './App'
import { AuthScreen } from './components/AuthScreen'

interface AuthGateProps {
  /** Injected by tests; production resolves the real clients. */
  authApi?: AuthApi
  trackerApi?: TrackerApi
}

type Session = Account | null | 'loading'

/**
 * Decides between the sign-in screen and the calendar. The session is checked
 * against the server on load, so a cookie that has expired or been revoked
 * elsewhere does not leave a stale-looking app on screen.
 */
export function AuthGate({ authApi, trackerApi }: AuthGateProps = {}) {
  const auth = useMemo(() => authApi ?? createAuthApi(), [authApi])
  const tracker = useMemo(() => trackerApi ?? createHttpTrackerApi(), [trackerApi])
  const [session, setSession] = useState<Session>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    auth.me({ signal: controller.signal })
      .then((account) => {
        if (!controller.signal.aborted) setSession(account)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        // Unreachable server: show the sign-in screen with the reason rather
        // than a spinner that never resolves.
        setError(caught instanceof Error ? caught.message : 'Could not reach the server.')
        setSession(null)
      })
    return () => controller.abort()
  }, [auth])

  const signOut = useCallback(async () => {
    try {
      await auth.signOut()
    } catch (caught: unknown) {
      // Callers fire this without awaiting, so a rejection here would surface
      // as an unhandled rejection. The local session is cleared either way;
      // if the request never reached the server the cookie may still be live,
      // and the next load's /auth/me check settles it.
      console.warn('Sign out request failed; clearing the session locally.', caught)
    } finally {
      setSession(null)
    }
  }, [auth])

  if (session === 'loading') {
    return <div className="calendar-loading" aria-label="Loading Tempo"><span /><span /><span /></div>
  }

  if (session === null) {
    return (
      <>
        {error && <div className="error-banner auth-banner" role="alert">{error}</div>}
        <AuthScreen authApi={auth} onAuthenticated={setSession} />
      </>
    )
  }

  return <App api={tracker} account={session} onSignOut={signOut} />
}
