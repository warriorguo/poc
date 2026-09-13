import type {
  Activity,
  ISODate,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  Plan,
  Project,
  RunningTimer,
  StoppedTimer,
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

  /** Resolves to null when no timer is running; that is a normal state. */
  getRunningTimer(options?: RequestOptions): Promise<RunningTimer | null>
  startTimer(input: { projectId: string; date: ISODate; note?: string }, options?: MutationOptions): Promise<RunningTimer>
  stopTimer(input?: { note?: string }, options?: MutationOptions): Promise<StoppedTimer>
  discardTimer(options?: MutationOptions): Promise<void>
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
