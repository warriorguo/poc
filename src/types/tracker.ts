export type ISODate = `${number}-${number}-${number}`
export type MonthKey = `${number}-${number}`

export interface Project {
  id: string
  name: string
  color: string
  intensityTargetMinutes: number
  icon: string
  isArchived: boolean
  /** Display position in the sidebar; storage returns rows in key order. */
  sortOrder: number
}

export interface Plan {
  id: string
  projectId: string
  date: ISODate
  plannedMinutes: number
  note?: string
}

export interface Activity {
  id: string
  projectId: string
  date: ISODate
  durationMinutes: number
  note?: string
  startedAt?: string
  endedAt?: string
  source: 'manual' | 'timer' | 'import'
}

export interface ProjectDaySummary {
  projectId: string
  plannedMinutes: number
  actualMinutes: number
  activityCount: number
}

export interface DaySummary {
  date: ISODate
  projects: ProjectDaySummary[]
}

export interface MonthOverview {
  month: MonthKey
  projects: Project[]
  days: Record<ISODate, DaySummary>
  totals: {
    plannedMinutes: number
    actualMinutes: number
    activeDays: number
  }
}

export interface CreateActivityInput {
  projectId: string
  date: ISODate
  durationMinutes: number
  note?: string
}

export interface CreatePlanInput {
  projectId: string
  date: ISODate
  plannedMinutes: number
  note?: string
}
