import { aggregateDays, byDisplayOrder } from '../domain/calendar'
import { createId } from '../domain/id'
import type {
  Activity,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  Plan,
  Project,
} from '../types/tracker'
import { DEFAULT_PROJECTS, DEMO_ACTIVITIES, DEMO_PLANS } from './seed-data'
import { type RequestOptions, type TrackerApi } from './tracker-api'
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
 * In-memory adapter. Used by tests and as the fallback when the browser denies
 * IndexedDB; state is per-instance, so tests cannot leak into one another.
 */
export function createMockTrackerApi(options: MockTrackerApiOptions = {}): TrackerApi {
  const projects = structuredClone(options.projects ?? DEFAULT_PROJECTS)
  const plans = structuredClone(options.plans ?? DEMO_PLANS)
  const activities = structuredClone(options.activities ?? DEMO_ACTIVITIES)
  const latencyMs = options.latencyMs ?? 80

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
  }
}
