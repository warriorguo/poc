import { requestJson } from './http'
import { TrackerApiError } from './tracker-api'

export interface Account {
  email: string
}

export interface AuthApi {
  /** Resolves to null when nobody is signed in, rather than throwing. */
  me(options?: { signal?: AbortSignal }): Promise<Account | null>
  register(email: string, password: string): Promise<Account>
  signIn(email: string, password: string): Promise<Account>
  signOut(): Promise<void>
}

export function createAuthApi(): AuthApi {
  return {
    async me(options) {
      try {
        return await requestJson<Account>('/auth/me', { signal: options?.signal })
      } catch (error) {
        if (error instanceof TrackerApiError && error.code === 'UNAUTHENTICATED') return null
        throw error
      }
    },
    register(email, password) {
      return requestJson<Account>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    },
    signIn(email, password) {
      return requestJson<Account>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    },
    signOut() {
      return requestJson<void>('/auth/logout', { method: 'POST' })
    },
  }
}
