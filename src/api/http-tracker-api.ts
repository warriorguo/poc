import type {
  Activity,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  Plan,
  Project,
} from '../types/tracker'
import { requestJson } from './http'
import type { RequestOptions, TrackerApi } from './tracker-api'

/** Talks to the Go API, which owns the PostgreSQL database. */
export function createHttpTrackerApi(): TrackerApi {
  return {
    listProjects(options?: RequestOptions) {
      return requestJson<Project[]>('/projects', { signal: options?.signal })
    },
    getMonthOverview(month: MonthKey, options?: RequestOptions) {
      return requestJson<MonthOverview>(`/months/${month}`, { signal: options?.signal })
    },
    createActivity(input: CreateActivityInput, options?: RequestOptions) {
      return requestJson<Activity>('/activities', {
        method: 'POST',
        body: JSON.stringify(input),
        signal: options?.signal,
      })
    },
    createPlan(input: CreatePlanInput, options?: RequestOptions) {
      return requestJson<Plan>('/plans', {
        method: 'POST',
        body: JSON.stringify(input),
        signal: options?.signal,
      })
    },
  }
}
