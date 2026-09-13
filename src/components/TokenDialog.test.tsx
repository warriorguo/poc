import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ApiToken, TokenApi } from '../api/token-api'
import { TrackerApiError } from '../api/tracker-api'
import { TokenDialog } from './TokenDialog'

const EXISTING: ApiToken = {
  id: 'tok-1',
  name: 'claude',
  prefix: 'tempo_abc123',
  createdAt: '2026-09-01T10:00:00Z',
  lastUsedAt: '2026-09-12T08:00:00Z',
}

function tokenApiWith(overrides: Partial<TokenApi> = {}): TokenApi {
  return {
    list: vi.fn().mockResolvedValue([EXISTING]),
    create: vi.fn().mockResolvedValue({ ...EXISTING, id: 'tok-2', name: 'chatgpt', token: 'tempo_THE_SECRET' }),
    revoke: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderDialog(tokenApi: TokenApi, onClose = vi.fn()) {
  return { user: userEvent.setup(), onClose, ...render(<TokenDialog tokenApi={tokenApi} onClose={onClose} />) }
}

describe('TokenDialog', () => {
  it('lists existing tokens with their prefix and usage', async () => {
    renderDialog(tokenApiWith())
    expect(await screen.findByText('claude')).toBeTruthy()
    expect(screen.getByText(/tempo_abc123/)).toBeTruthy()
  })

  it('says so when there are none', async () => {
    renderDialog(tokenApiWith({ list: vi.fn().mockResolvedValue([]) }))
    expect(await screen.findByText('No tokens yet.')).toBeTruthy()
  })

  // The secret is unrecoverable, so showing it exactly once has to work.
  it('reveals the secret once after creating', async () => {
    const { user } = renderDialog(tokenApiWith())
    await screen.findByText('claude')

    await user.type(screen.getByLabelText(/new token name/i), 'chatgpt')
    await user.click(screen.getByRole('button', { name: /create/i }))

    const reveal = await screen.findByRole('status')
    expect(within(reveal).getByText('tempo_THE_SECRET')).toBeTruthy()
    expect(within(reveal).getByText(/not shown again/i)).toBeTruthy()
  })

  it('will not submit an empty name', async () => {
    const create = vi.fn()
    const { user } = renderDialog(tokenApiWith({ create }))
    await screen.findByText('claude')

    expect(screen.getByRole('button', { name: /create/i })).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: /create/i }))
    expect(create).not.toHaveBeenCalled()
  })

  it('revokes a token and refreshes the list', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined)
    const list = vi.fn()
      .mockResolvedValueOnce([EXISTING])
      .mockResolvedValue([])
    const { user } = renderDialog(tokenApiWith({ revoke, list }))
    await screen.findByText('claude')

    await user.click(screen.getByRole('button', { name: /revoke/i }))

    expect(revoke).toHaveBeenCalledWith('tok-1')
    expect(await screen.findByText('No tokens yet.')).toBeTruthy()
  })

  it('reports a failure instead of pretending the token was created', async () => {
    const create = vi.fn().mockRejectedValue(
      new TrackerApiError('Sign in with your password to manage API tokens.', 'UNAUTHENTICATED'))
    const { user } = renderDialog(tokenApiWith({ create }))
    await screen.findByText('claude')

    await user.type(screen.getByLabelText(/new token name/i), 'chatgpt')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent', 'Sign in with your password to manage API tokens.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('closes on Escape', async () => {
    const { user, onClose } = renderDialog(tokenApiWith())
    await screen.findByText('claude')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
