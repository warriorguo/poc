import { describe, expect, it } from 'vitest'
import { createMockTrackerApi } from '../api/mock-tracker-api'
import { aggregateDays, getMonthGrid, intensityFor, toISODate } from './calendar'

describe('calendar domain helpers', () => {
  it('builds a fixed six-week calendar grid', () => {
    const days = getMonthGrid(new Date(2026, 8, 1, 12))
    expect(days).toHaveLength(42)
    expect(toISODate(days[0])).toBe('2026-08-30')
    expect(toISODate(days[41])).toBe('2026-10-10')
  })

  it('combines planned and actual work per project and day', () => {
    const days = aggregateDays(
      [{ id: 'p1', projectId: 'ozx', date: '2026-09-12', plannedMinutes: 60 }],
      [
        { id: 'a1', projectId: 'ozx', date: '2026-09-12', durationMinutes: 25, source: 'manual' },
        { id: 'a2', projectId: 'ozx', date: '2026-09-12', durationMinutes: 15, source: 'timer' },
      ],
    )
    expect(days['2026-09-12'].projects[0]).toEqual({
      projectId: 'ozx',
      plannedMinutes: 60,
      actualMinutes: 40,
      activityCount: 2,
    })
  })

  it('keeps non-zero activity visible and caps intensity', () => {
    expect(intensityFor(0, 60)).toBe(0)
    expect(intensityFor(10, 60)).toBeGreaterThan(0.24)
    expect(intensityFor(120, 60)).toBe(1)
  })

  it('keeps the mock adapter aligned with entry validation semantics', async () => {
    const api = createMockTrackerApi()
    await expect(api.createActivity({
      projectId: 'missing',
      date: '2026-09-12',
      durationMinutes: 30,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(api.createPlan({
      projectId: 'ozx',
      date: '2026-02-30',
      plannedMinutes: 30,
    })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
