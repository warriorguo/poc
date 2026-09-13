import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { TODAY, THIS_MONTH } from '../test/factories'
import { createIndexedDbTrackerApi } from './indexeddb-tracker-api'
import { DEFAULT_PROJECTS } from './seed-data'

describe('IndexedDB tracker adapter', () => {
  beforeEach(() => {
    // A fresh factory per test, so one test's writes cannot seed the next.
    globalThis.indexedDB = new IDBFactory()
  })

  it('seeds the default projects on first run', async () => {
    const api = createIndexedDbTrackerApi()
    const projects = await api.listProjects()
    expect(projects.map((project) => project.id)).toEqual(DEFAULT_PROJECTS.map((project) => project.id))
  })

  it('starts with no plans or activities rather than demo rows', async () => {
    const overview = await createIndexedDbTrackerApi().getMonthOverview(THIS_MONTH)
    expect(overview.days).toEqual({})
    expect(overview.totals).toEqual({ plannedMinutes: 0, actualMinutes: 0, activeDays: 0 })
  })

  it('keeps written activities across a new connection', async () => {
    await createIndexedDbTrackerApi().createActivity({ projectId: 'ozx', date: TODAY, durationMinutes: 45 })

    // A separate adapter stands in for a page reload.
    const overview = await createIndexedDbTrackerApi().getMonthOverview(THIS_MONTH)
    expect(overview.totals.actualMinutes).toBe(45)
    expect(overview.totals.activeDays).toBe(1)
    expect(overview.days[TODAY]?.projects).toEqual([
      { projectId: 'ozx', plannedMinutes: 0, actualMinutes: 45, activityCount: 1 },
    ])
  })

  it('aggregates plans and activities for the same day', async () => {
    const api = createIndexedDbTrackerApi()
    await api.createPlan({ projectId: 'reading', date: TODAY, plannedMinutes: 60 })
    await api.createActivity({ projectId: 'reading', date: TODAY, durationMinutes: 20 })
    await api.createActivity({ projectId: 'reading', date: TODAY, durationMinutes: 25 })

    const summary = (await api.getMonthOverview(THIS_MONTH)).days[TODAY]?.projects[0]
    expect(summary).toEqual({ projectId: 'reading', plannedMinutes: 60, actualMinutes: 45, activityCount: 2 })
  })

  it('excludes days outside the requested month', async () => {
    const api = createIndexedDbTrackerApi()
    await api.createActivity({ projectId: 'ozx', date: '2001-03-04', durationMinutes: 30 })
    const overview = await api.getMonthOverview('2001-04')
    expect(overview.days).toEqual({})
  })

  it('rejects an unknown project and an impossible date', async () => {
    const api = createIndexedDbTrackerApi()
    await expect(api.createActivity({ projectId: 'nope', date: TODAY, durationMinutes: 30 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(api.createPlan({ projectId: 'ozx', date: '2026-02-30', plannedMinutes: 30 }))
      .rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(api.createActivity({ projectId: 'ozx', date: TODAY, durationMinutes: 0 }))
      .rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(api.createActivity({ projectId: 'ozx', date: TODAY, durationMinutes: 1441 }))
      .rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('does not write an activity that failed validation', async () => {
    const api = createIndexedDbTrackerApi()
    await expect(api.createActivity({ projectId: 'ozx', date: TODAY, durationMinutes: -5 })).rejects.toThrow()
    expect((await api.getMonthOverview(THIS_MONTH)).totals.actualMinutes).toBe(0)
  })

  it('honours an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(createIndexedDbTrackerApi().getMonthOverview(THIS_MONTH, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})
