import type { Activity, DaySummary, ISODate, MonthKey, Plan, Project, ProjectDaySummary } from '../types/tracker'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Storage returns projects in key order, so display order is applied explicitly. */
export function byDisplayOrder(a: Project, b: Project): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

export function toISODate(date: Date): ISODate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as ISODate
}

export function toMonthKey(date: Date): MonthKey {
  return toISODate(date).slice(0, 7) as MonthKey
}

export function monthKeyToDate(month: MonthKey): Date {
  return new Date(`${month}-01T12:00:00`)
}

export function shiftMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
}

export function getMonthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex
  const value = Number.parseInt(normalized, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(alpha, 1))})`
}

export function intensityFor(actualMinutes: number, targetMinutes: number): number {
  if (actualMinutes <= 0) return 0
  if (targetMinutes <= 0) return 1
  return Math.min(1, 0.24 + (actualMinutes / targetMinutes) * 0.76)
}

export function aggregateDays(plans: Plan[], activities: Activity[]): Record<ISODate, DaySummary> {
  const byDate = new Map<ISODate, Map<string, ProjectDaySummary>>()

  const ensureSummary = (date: ISODate, projectId: string) => {
    if (!DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`)
    if (!byDate.has(date)) byDate.set(date, new Map())
    const projects = byDate.get(date)!
    if (!projects.has(projectId)) {
      projects.set(projectId, { projectId, plannedMinutes: 0, actualMinutes: 0, activityCount: 0 })
    }
    return projects.get(projectId)!
  }

  for (const plan of plans) {
    ensureSummary(plan.date, plan.projectId).plannedMinutes += plan.plannedMinutes
  }

  for (const activity of activities) {
    const summary = ensureSummary(activity.date, activity.projectId)
    summary.actualMinutes += activity.durationMinutes
    summary.activityCount += 1
  }

  return Object.fromEntries(
    [...byDate.entries()].map(([date, projects]) => [
      date,
      { date, projects: [...projects.values()].sort((a, b) => a.projectId.localeCompare(b.projectId)) },
    ]),
  ) as Record<ISODate, DaySummary>
}
