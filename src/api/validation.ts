import type { Project } from '../types/tracker'
import { TrackerApiError } from './tracker-api'

export const MAX_ENTRY_MINUTES = 1440

/** Rejects dates that match the ISO shape but do not exist, such as 2026-02-30. */
export function isValidISODate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return false
  const [, year = '', month = '', day = ''] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12)
  return parsed.getFullYear() === Number(year)
    && parsed.getMonth() === Number(month) - 1
    && parsed.getDate() === Number(day)
}

export function describeInvalidDuration(minutes: number): string | null {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return 'Enter a whole number of minutes.'
  }
  if (minutes < 1) return 'Enter at least 1 minute.'
  if (minutes > MAX_ENTRY_MINUTES) return `A single entry cannot exceed ${MAX_ENTRY_MINUTES} minutes.`
  return null
}

export function assertValidEntry(projects: Project[], projectId: string, date: string, minutes: number): void {
  const projectExists = projects.some((project) => project.id === projectId && !project.isArchived)
  if (!projectExists) throw new TrackerApiError('Project does not exist or is archived.', 'NOT_FOUND')

  const durationProblem = describeInvalidDuration(minutes)
  if (durationProblem) throw new TrackerApiError(durationProblem, 'VALIDATION')

  if (!isValidISODate(date)) throw new TrackerApiError('Date must be a valid ISO local date.', 'VALIDATION')
}
