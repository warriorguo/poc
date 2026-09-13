import { aggregateDays, byDisplayOrder } from '../domain/calendar'
import { createId } from '../domain/id'
import type {
  Activity,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  ISODate,
  Plan,
  Project,
  RunningTimer,
} from '../types/tracker'
import { DEFAULT_PROJECTS, DEMO_ACTIVITIES, DEMO_PLANS } from './seed-data'
import { TrackerApiError, type RequestOptions, type TrackerApi } from './tracker-api'
import { assertValidEntry } from './validation'

export interface MockTrackerApiOptions {
  /** Seed rows. Defaults to the illustrative September 2026 data. */
  plans?: Plan[]
  activities?: Activity[]
  projects?: Project[]
  /** Simulated latency in milliseconds. Set to 0 in tests. */
  latencyMs?: number
}

function waitForMock(latencyMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }
    const timeoutId = globalThis.setTimeout(resolve, latencyMs)
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timeoutId)
        reject(new DOMException('Request aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * In-memory adapter used as the test double for the HTTP client. State is
 * per-instance, so tests cannot leak into one another.
 */
export function createMockTrackerApi(options: MockTrackerApiOptions = {}): TrackerApi {
  const projects = structuredClone(options.projects ?? DEFAULT_PROJECTS)
  const plans = structuredClone(options.plans ?? DEMO_PLANS)
  const activities = structuredClone(options.activities ?? DEMO_ACTIVITIES)
  const latencyMs = options.latencyMs ?? 80
  let runningTimer: RunningTimer | null = null

  function buildOverview(month: MonthKey): MonthOverview {
    const monthPlans = plans.filter((plan) => plan.date.startsWith(month))
    const monthActivities = activities.filter((activity) => activity.date.startsWith(month))
    return {
      month,
      projects: projects.filter((project) => !project.isArchived).sort(byDisplayOrder),
      days: aggregateDays(monthPlans, monthActivities),
      totals: {
        plannedMinutes: monthPlans.reduce((total, plan) => total + plan.plannedMinutes, 0),
        actualMinutes: monthActivities.reduce((total, activity) => total + activity.durationMinutes, 0),
        activeDays: new Set(monthActivities.map((activity) => activity.date)).size,
      },
    }
  }

  return {
    async listProjects(options?: RequestOptions) {
      await waitForMock(latencyMs, options?.signal)
      return structuredClone(projects).sort(byDisplayOrder)
    },
    async getMonthOverview(month: MonthKey, options?: RequestOptions) {
      await waitForMock(latencyMs, options?.signal)
      return structuredClone(buildOverview(month))
    },
    async createActivity(input: CreateActivityInput) {
      assertValidEntry(projects, input.projectId, input.date, input.durationMinutes)
      const activity: Activity = { ...input, id: createId(), source: 'manual' }
      activities.push(activity)
      return structuredClone(activity)
    },
    async createPlan(input: CreatePlanInput) {
      assertValidEntry(projects, input.projectId, input.date, input.plannedMinutes)
      const plan: Plan = { ...input, id: createId() }
      plans.push(plan)
      return structuredClone(plan)
    },

    async getRunningTimer() {
      return runningTimer ? structuredClone(runningTimer) : null
    },

    async startTimer(input: { projectId: string; date: ISODate; note?: string }) {
      if (runningTimer) {
        throw new TrackerApiError('A timer is already running. Stop it before starting another.', 'CONFLICT')
      }
      const exists = projects.some((project) => project.id === input.projectId && !project.isArchived)
      if (!exists) throw new TrackerApiError('Project does not exist or is archived.', 'NOT_FOUND')

      runningTimer = { ...input, startedAt: new Date().toISOString() }
      return structuredClone(runningTimer)
    },

    async stopTimer(input: { note?: string } = {}) {
      if (!runningTimer) throw new TrackerApiError('No timer is running.', 'NOT_FOUND')

      const elapsedMinutes = Math.max(1, Math.round(
        (Date.now() - new Date(runningTimer.startedAt).getTime()) / 60_000))
      const truncated = elapsedMinutes > 1440
      const activity: Activity = {
        id: createId(),
        projectId: runningTimer.projectId,
        date: runningTimer.date,
        durationMinutes: truncated ? 1440 : elapsedMinutes,
        note: input.note ?? runningTimer.note,
        source: 'timer',
      }
      activities.push(activity)
      runningTimer = null
      return { activity: structuredClone(activity), elapsedMinutes, truncated }
    },

    async discardTimer() {
      if (!runningTimer) throw new TrackerApiError('No timer is running.', 'NOT_FOUND')
      runningTimer = null
    },
  }
}
