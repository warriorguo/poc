import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account, AuthApi } from './api/auth-api'
import { createMockTrackerApi } from './api/mock-tracker-api'
import { TrackerApiError } from './api/tracker-api'
import { AuthGate } from './AuthGate'

const ACCOUNT: Account = { email: 'andrew@example.com' }

function authApiWith(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    me: vi.fn().mockResolvedValue(null),
    register: vi.fn().mockResolvedValue(ACCOUNT),
    signIn: vi.fn().mockResolvedValue(ACCOUNT),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderGate(authApi: AuthApi) {
  const trackerApi = createMockTrackerApi({ latencyMs: 0, plans: [], activities: [] })
  return {
    user: userEvent.setup(),
    ...render(<AuthGate authApi={authApi} trackerApi={trackerApi} />),
  }
}

describe('AuthGate', () => {
  it('shows the calendar when a session is already valid', async () => {
    renderGate(authApiWith({ me: vi.fn().mockResolvedValue(ACCOUNT) }))
    expect(await screen.findByLabelText('Monthly activity calendar')).toBeTruthy()
  })

  it('shows the sign-in screen when nobody is signed in', async () => {
    renderGate(authApiWith())
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeTruthy()
    expect(screen.queryByLabelText('Monthly activity calendar')).toBeNull()
  })

  it('signs in and reveals the calendar', async () => {
    const signIn = vi.fn().mockResolvedValue(ACCOUNT)
    const { user } = renderGate(authApiWith({ signIn }))
    await screen.findByRole('heading', { name: /welcome back/i })

    await user.type(screen.getByLabelText(/email/i), 'andrew@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByLabelText('Monthly activity calendar')).toBeTruthy()
    expect(signIn).toHaveBeenCalledWith('andrew@example.com', 'correct horse battery')
  })

  it('reports bad credentials and stays on the form', async () => {
    const signIn = vi.fn().mockRejectedValue(
      new TrackerApiError('That email and password do not match.', 'UNAUTHENTICATED'))
    const { user } = renderGate(authApiWith({ signIn }))
    await screen.findByRole('heading', { name: /welcome back/i })

    await user.type(screen.getByLabelText(/email/i), 'andrew@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong password here')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'That email and password do not match.')
    expect(screen.getByRole('button', { name: /^sign in$/i })).toHaveProperty('disabled', false)
    expect(screen.queryByLabelText('Monthly activity calendar')).toBeNull()
  })

  it('registers a new account', async () => {
    const register = vi.fn().mockResolvedValue(ACCOUNT)
    const { user } = renderGate(authApiWith({ register }))
    await screen.findByRole('heading', { name: /welcome back/i })

    await user.click(screen.getByRole('button', { name: /create an account instead/i }))
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'a long enough password')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(await screen.findByLabelText('Monthly activity calendar')).toBeTruthy()
    expect(register).toHaveBeenCalledWith('new@example.com', 'a long enough password')
  })

  it('rejects a short password before calling the server', async () => {
    const register = vi.fn()
    const { user } = renderGate(authApiWith({ register }))
    await screen.findByRole('heading', { name: /welcome back/i })

    await user.click(screen.getByRole('button', { name: /create an account instead/i }))
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Use a password of at least 10 characters.')
    expect(register).not.toHaveBeenCalled()
  })

  it('falls back to the sign-in screen when the server is unreachable', async () => {
    const me = vi.fn().mockRejectedValue(new TrackerApiError('Could not reach the server. Check your connection.', 'NETWORK'))
    renderGate(authApiWith({ me }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not reach the server. Check your connection.')
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeTruthy()
  })

  it('signs out back to the form', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const { user } = renderGate(authApiWith({ me: vi.fn().mockResolvedValue(ACCOUNT), signOut }))
    await screen.findByLabelText('Monthly activity calendar')

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /welcome back/i })).toBeTruthy())
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('returns to the form even when the sign-out request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signOut = vi.fn().mockRejectedValue(new TrackerApiError('offline', 'NETWORK'))
    const { user } = renderGate(authApiWith({ me: vi.fn().mockResolvedValue(ACCOUNT), signOut }))
    await screen.findByLabelText('Monthly activity calendar')

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /welcome back/i })).toBeTruthy())
  })
})
