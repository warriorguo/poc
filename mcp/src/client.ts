/** Thin typed client for the Tempo API, authenticated with a personal token. */

export interface Project {
  id: string
  name: string
  color: string
  icon: string
  intensityTargetMinutes: number
  isArchived: boolean
  sortOrder: number
}

export interface ProjectDaySummary {
  projectId: string
  plannedMinutes: number
  actualMinutes: number
  activityCount: number
}

export interface MonthOverview {
  month: string
  projects: Project[]
  days: Record<string, { date: string; projects: ProjectDaySummary[] }>
  totals: { plannedMinutes: number; actualMinutes: number; activeDays: number }
}

export class TempoError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message)
    this.name = 'TempoError'
  }
}

export interface TempoClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class TempoClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: TempoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      })
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new TempoError(
        aborted
          ? `Tempo did not respond within ${this.timeoutMs}ms at ${this.baseUrl}.`
          : `Could not reach Tempo at ${this.baseUrl}. Is the API running and on this network?`,
        aborted ? 'TIMEOUT' : 'NETWORK',
      )
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 204) return undefined as T

    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = payload as { error?: { code?: string; message?: string } } | null
      // 401 is by far the most likely failure in an agent context, so name the
      // cause rather than passing "Sign in to continue" to a tool caller.
      const message = response.status === 401
        ? 'Tempo rejected the API token. It may have been revoked or expired; create a new one.'
        : body?.error?.message ?? `Tempo returned HTTP ${response.status}.`
      throw new TempoError(message, body?.error?.code ?? 'UNKNOWN', response.status)
    }
    return payload as T
  }

  listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects')
  }

  createProject(input: {
    name: string
    id?: string
    color?: string
    icon?: string
    intensityTargetMinutes?: number
  }): Promise<Project> {
    return this.request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) })
  }

  updateProject(id: string, patch: Record<string, unknown>): Promise<Project> {
    return this.request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  logTime(input: { projectId: string; date: string; durationMinutes: number; note?: string }) {
    return this.request<{ id: string }>('/activities', { method: 'POST', body: JSON.stringify(input) })
  }

  planTime(input: { projectId: string; date: string; plannedMinutes: number; note?: string }) {
    return this.request<{ id: string }>('/plans', { method: 'POST', body: JSON.stringify(input) })
  }

  monthOverview(month: string): Promise<MonthOverview> {
    return this.request<MonthOverview>(`/months/${encodeURIComponent(month)}`)
  }
}
