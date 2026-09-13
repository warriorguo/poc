import type {
  Activity,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  Plan,
  Project,
} from '../types/tracker'

export interface RequestOptions {
  signal?: AbortSignal
}

export interface MutationOptions extends RequestOptions {
  idempotencyKey?: string
}

export interface TrackerApi {
  listProjects(options?: RequestOptions): Promise<Project[]>
  getMonthOverview(month: MonthKey, options?: RequestOptions): Promise<MonthOverview>
  createActivity(input: CreateActivityInput, options?: MutationOptions): Promise<Activity>
  createPlan(input: CreatePlanInput, options?: MutationOptions): Promise<Plan>
}

export type TrackerApiErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNAUTHENTICATED'
  | 'CONFLICT'
  | 'UNKNOWN'

export class TrackerApiError extends Error {
  constructor(
    message: string,
    public readonly code: TrackerApiErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'TrackerApiError'
  }
}
