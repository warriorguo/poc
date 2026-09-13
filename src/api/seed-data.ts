import type { Activity, Plan, Project } from '../types/tracker'

/**
 * Written into the database on first run only. Never re-seeded, so a user who
 * archives or clears these keeps their choice.
 */
export const DEFAULT_PROJECTS: Project[] = [
  { id: 'ozx', sortOrder: 0, name: 'OZX', color: '#e4573d', intensityTargetMinutes: 90, icon: 'O', isArchived: false },
  { id: 'workout', sortOrder: 1, name: 'Workout', color: '#1f8a62', intensityTargetMinutes: 60, icon: 'W', isArchived: false },
  { id: 'reading', sortOrder: 2, name: 'Reading', color: '#bc8b19', intensityTargetMinutes: 45, icon: 'R', isArchived: false },
  { id: 'english', sortOrder: 3, name: 'English', color: '#2879a8', intensityTargetMinutes: 45, icon: 'E', isArchived: false },
]

/**
 * Illustrative September 2026 data. Used by the in-memory adapter for tests and
 * for the storage-unavailable fallback — never written to the database, so a
 * real install starts empty.
 */
export const DEMO_PLANS: Plan[] = [
  { id: 'p01', projectId: 'workout', date: '2026-09-01', plannedMinutes: 45, note: 'Strength day' },
  { id: 'p02', projectId: 'english', date: '2026-09-02', plannedMinutes: 30, note: 'Shadowing' },
  { id: 'p03', projectId: 'ozx', date: '2026-09-03', plannedMinutes: 90, note: 'Inventory system' },
  { id: 'p04', projectId: 'reading', date: '2026-09-04', plannedMinutes: 30, note: 'Finish chapter 6' },
  { id: 'p05', projectId: 'workout', date: '2026-09-05', plannedMinutes: 60 },
  { id: 'p06', projectId: 'ozx', date: '2026-09-07', plannedMinutes: 120, note: 'Combat prototype' },
  { id: 'p07', projectId: 'english', date: '2026-09-08', plannedMinutes: 30 },
  { id: 'p08', projectId: 'reading', date: '2026-09-09', plannedMinutes: 45 },
  { id: 'p09', projectId: 'workout', date: '2026-09-10', plannedMinutes: 50 },
  { id: 'p10', projectId: 'ozx', date: '2026-09-11', plannedMinutes: 90 },
  { id: 'p11', projectId: 'ozx', date: '2026-09-12', plannedMinutes: 120, note: 'Calendar prototype' },
  { id: 'p12', projectId: 'workout', date: '2026-09-12', plannedMinutes: 45, note: 'Easy run' },
  { id: 'p13', projectId: 'reading', date: '2026-09-13', plannedMinutes: 40 },
  { id: 'p14', projectId: 'english', date: '2026-09-14', plannedMinutes: 30 },
  { id: 'p15', projectId: 'ozx', date: '2026-09-15', plannedMinutes: 90 },
]

export const DEMO_ACTIVITIES: Activity[] = [
  { id: 'a01', projectId: 'workout', date: '2026-09-01', durationMinutes: 54, source: 'timer', note: 'Strength A' },
  { id: 'a02', projectId: 'english', date: '2026-09-02', durationMinutes: 18, source: 'manual', note: 'Podcast notes' },
  { id: 'a03', projectId: 'ozx', date: '2026-09-03', durationMinutes: 104, source: 'timer', note: 'Item model + tests' },
  { id: 'a04', projectId: 'reading', date: '2026-09-04', durationMinutes: 12, source: 'manual', note: 'Chapter 6' },
  { id: 'a05', projectId: 'ozx', date: '2026-09-06', durationMinutes: 36, source: 'timer', note: 'Unplanned bug fix' },
  { id: 'a06', projectId: 'ozx', date: '2026-09-07', durationMinutes: 72, source: 'timer', note: 'Combat prototype' },
  { id: 'a07', projectId: 'english', date: '2026-09-08', durationMinutes: 34, source: 'manual' },
  { id: 'a08', projectId: 'reading', date: '2026-09-09', durationMinutes: 51, source: 'manual', note: 'Finished chapter 7' },
  { id: 'a09', projectId: 'ozx', date: '2026-09-11', durationMinutes: 24, source: 'timer' },
  { id: 'a10', projectId: 'ozx', date: '2026-09-12', durationMinutes: 78, source: 'timer', note: 'Calendar layout' },
  { id: 'a11', projectId: 'reading', date: '2026-09-12', durationMinutes: 25, source: 'manual', note: 'Design systems' },
  { id: 'a12', projectId: 'english', date: '2026-09-14', durationMinutes: 8, source: 'manual' },
  { id: 'a13', projectId: 'ozx', date: '2026-09-15', durationMinutes: 132, source: 'timer', note: 'Save system spike' },
]
