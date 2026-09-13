import { toISODate, toMonthKey } from '../domain/calendar'
import type { Activity, ISODate, MonthKey, Plan } from '../types/tracker'

/**
 * Tests build their fixtures around the real current date so they keep passing
 * once the calendar moves past the month the demo data was written for.
 */
export const TODAY: ISODate = toISODate(new Date())
export const THIS_MONTH: MonthKey = toMonthKey(new Date())

export function planOn(date: ISODate, projectId: string, plannedMinutes: number): Plan {
  return { id: `plan-${projectId}-${date}`, projectId, date, plannedMinutes }
}

export function activityOn(date: ISODate, projectId: string, durationMinutes: number): Activity {
  return { id: `activity-${projectId}-${date}`, projectId, date, durationMinutes, source: 'manual' }
}
