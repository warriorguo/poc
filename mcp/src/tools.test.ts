import { describe, expect, it, vi } from 'vitest'
import { TempoClient, TempoError } from './client.js'
import { createHandlers, today } from './tools.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientWith(fetchImpl: ReturnType<typeof vi.fn>) {
  return new TempoClient({ baseUrl: 'http://tempo.test/', token: 'tempo_secret', fetchImpl: fetchImpl as unknown as typeof fetch })
}

const FIXED_TODAY = '2026-09-13'
const clock = () => FIXED_TODAY

describe('today', () => {
  it('formats a local date, not a UTC one', () => {
    // 23:30 local on the 13th is the 14th in UTC; the calendar is local-date based.
    expect(today(new Date(2026, 8, 13, 23, 30))).toBe('2026-09-13')
  })
})

describe('tool handlers', () => {
  it('lists projects in a form a model can act on', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, [
      { id: 'ozx', name: 'OZX', color: '#e4573d', icon: 'O', intensityTargetMinutes: 90, isArchived: false, sortOrder: 0 },
      { id: 'reading', name: 'Reading', color: '#bc8b19', icon: 'R', intensityTargetMinutes: 45, isArchived: true, sortOrder: 1 },
    ]))
    const text = await createHandlers(clientWith(fetchImpl), clock).list_projects()
    expect(text).toContain('ozx — OZX, target 1h 30m/day')
    expect(text).toContain('(archived)')
  })

  it('says so when there are no projects rather than returning nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, []))
    expect(await createHandlers(clientWith(fetchImpl), clock).list_projects()).toContain('No projects yet')
  })

  it('defaults log_time to today and reports what was written', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'a1' }))
    const text = await createHandlers(clientWith(fetchImpl), clock)
      .log_time({ projectId: 'ozx', durationMinutes: 95 })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://tempo.test/api/activities')
    expect(JSON.parse(init.body)).toEqual({ projectId: 'ozx', durationMinutes: 95, date: FIXED_TODAY })
    expect(init.headers.Authorization).toBe('Bearer tempo_secret')
    expect(text).toBe('Logged 1h 35m on ozx for 2026-09-13.')
  })

  it('honours an explicit date', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'a1' }))
    await createHandlers(clientWith(fetchImpl), clock)
      .log_time({ projectId: 'ozx', durationMinutes: 30, date: '2026-08-01' })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).date).toBe('2026-08-01')
  })

  it('distinguishes planned time from worked time', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'p1' }))
    const text = await createHandlers(clientWith(fetchImpl), clock)
      .plan_time({ projectId: 'reading', plannedMinutes: 45 })
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://tempo.test/api/plans')
    expect(text).toContain('Planned 45m')
  })

  it('reports the new id after creating a project', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, {
      id: 'piano-practice', name: 'Piano Practice', color: '#77766e', icon: 'P',
      intensityTargetMinutes: 60, isArchived: false, sortOrder: 4,
    }))
    const text = await createHandlers(clientWith(fetchImpl), clock).create_project({ name: 'Piano Practice' })
    expect(text).toContain('id piano-practice')
  })

  it('summarises a month by project', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      month: '2026-09',
      projects: [],
      days: {
        '2026-09-13': { date: '2026-09-13', projects: [
          { projectId: 'ozx', plannedMinutes: 0, actualMinutes: 95, activityCount: 1 },
          { projectId: 'reading', plannedMinutes: 30, actualMinutes: 0, activityCount: 0 },
        ] },
        '2026-09-14': { date: '2026-09-14', projects: [
          { projectId: 'ozx', plannedMinutes: 0, actualMinutes: 25, activityCount: 1 },
        ] },
      },
      totals: { plannedMinutes: 30, actualMinutes: 120, activeDays: 2 },
    }))
    const text = await createHandlers(clientWith(fetchImpl), clock).month_overview({})

    expect(fetchImpl.mock.calls[0]![0]).toBe('http://tempo.test/api/months/2026-09')
    expect(text).toContain('2h actual')
    expect(text).toContain('ozx: 2h')
    // reading has a plan but no worked time, so it is not listed as worked.
    expect(text).not.toContain('reading')
  })

  it('explains a revoked token instead of passing through "Sign in to continue"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    }))
    const error = await createHandlers(clientWith(fetchImpl), clock)
      .list_projects().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TempoError)
    expect((error as TempoError).message).toContain('revoked or expired')
  })

  it('surfaces an unknown project rather than reporting a successful log', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, {
      error: { code: 'NOT_FOUND', message: 'Project does not exist or is archived.' },
    }))
    await expect(createHandlers(clientWith(fetchImpl), clock)
      .log_time({ projectId: 'nope', durationMinutes: 30 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('names the host when the API is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const error = await createHandlers(clientWith(fetchImpl), clock)
      .list_projects().catch((caught: unknown) => caught) as TempoError
    expect(error.code).toBe('NETWORK')
    expect(error.message).toContain('http://tempo.test')
  })
})
