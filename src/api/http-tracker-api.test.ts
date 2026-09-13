import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthApi } from './auth-api'
import { createHttpTrackerApi } from './http-tracker-api'
import { TrackerApiError } from './tracker-api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HTTP tracker adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the month endpoint and returns the overview', async () => {
    const overview = { month: '2026-09', projects: [], days: {}, totals: { plannedMinutes: 0, actualMinutes: 0, activeDays: 0 } }
    fetchMock.mockResolvedValue(jsonResponse(200, overview))

    await expect(createHttpTrackerApi().getMonthOverview('2026-09')).resolves.toEqual(overview)
    expect(fetchMock).toHaveBeenCalledWith('/api/months/2026-09', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('posts an activity as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'a1' }))
    await createHttpTrackerApi().createActivity({ projectId: 'ozx', date: '2026-09-13', durationMinutes: 45 })

    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/activities')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ projectId: 'ozx', date: '2026-09-13', durationMinutes: 45 })
  })

  // The UI's error handling is written against these codes, so the mapping is
  // the contract that keeps a transport change invisible above src/api/.
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHENTICATED'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [500, 'UNKNOWN'],
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code, message: 'nope' } }))
    await expect(createHttpTrackerApi().listProjects()).rejects.toMatchObject({ code, message: 'nope' })
  })

  it('falls back to the status when the body carries no code', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 404 }))
    await expect(createHttpTrackerApi().listProjects()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('reports an unreachable server as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await createHttpTrackerApi().listProjects().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TrackerApiError)
    expect(error).toMatchObject({ code: 'NETWORK' })
  })

  it('lets an abort propagate untouched', async () => {
    fetchMock.mockRejectedValue(new DOMException('Request aborted', 'AbortError'))
    await expect(createHttpTrackerApi().listProjects()).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('auth client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports no account instead of throwing when signed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }))
    await expect(createAuthApi().me()).resolves.toBeNull()
  })

  it('returns the account when signed in', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { email: 'andrew@example.com' }))
    await expect(createAuthApi().me()).resolves.toEqual({ email: 'andrew@example.com' })
  })

  it('still surfaces a network failure from the session check', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createAuthApi().me()).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('sends credentials to the login endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { email: 'andrew@example.com' }))
    await createAuthApi().signIn('Andrew@Example.com ', 'correct horse battery')

    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/auth/login')
    expect(JSON.parse(init.body)).toEqual({ email: 'Andrew@Example.com ', password: 'correct horse battery' })
  })

  it('treats a 204 logout as success', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(createAuthApi().signOut()).resolves.toBeUndefined()
  })
})
