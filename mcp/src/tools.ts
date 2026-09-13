import { z } from 'zod'
import type { TempoClient } from './client.js'

/** Today in the local timezone, as the API's ISO date. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM.')

export const schemas = {
  listProjects: {},
  createProject: {
    name: z.string().min(1).max(60).describe('Display name, e.g. "Piano Practice".'),
    id: z.string().optional().describe('Optional slug; derived from the name when omitted.'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex colour, e.g. #e4573d.'),
    icon: z.string().min(1).max(2).optional().describe('One or two characters shown in the sidebar.'),
    intensityTargetMinutes: z.number().int().min(1).max(1440).optional()
      .describe('Daily minutes that count as a full-intensity day. Defaults to 60.'),
  },
  updateProject: {
    id: z.string().min(1).describe('The project id to change.'),
    name: z.string().min(1).max(60).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    icon: z.string().min(1).max(2).optional(),
    intensityTargetMinutes: z.number().int().min(1).max(1440).optional(),
    sortOrder: z.number().int().optional(),
    isArchived: z.boolean().optional().describe('Archive instead of deleting; keeps recorded history.'),
  },
  logTime: {
    projectId: z.string().min(1).describe('Project id, from list_projects.'),
    durationMinutes: z.number().int().min(1).max(1440).describe('Minutes actually worked.'),
    date: isoDate.optional().describe('Defaults to today.'),
    note: z.string().max(120).optional(),
  },
  planTime: {
    projectId: z.string().min(1),
    plannedMinutes: z.number().int().min(1).max(1440).describe('Minutes intended, not yet worked.'),
    date: isoDate.optional().describe('Defaults to today.'),
    note: z.string().max(120).optional(),
  },
  monthOverview: {
    month: isoMonth.optional().describe('Defaults to the current month.'),
  },
  timerStatus: {},
  startTimer: {
    projectId: z.string().min(1).describe('Project id, from list_projects.'),
    note: z.string().max(120).optional(),
  },
  stopTimer: {
    note: z.string().max(120).optional().describe('Overrides any note given at start.'),
  },
  discardTimer: {},
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/**
 * Tool results are read by a model, so each returns a short sentence stating
 * what changed, rather than a JSON blob it has to interpret.
 */
export function createHandlers(client: TempoClient, clock: () => string = today) {
  return {
    async list_projects() {
      const projects = await client.listProjects()
      if (projects.length === 0) return 'No projects yet. Create one with create_project.'
      return projects
        .map((p) => `${p.id} — ${p.name}${p.isArchived ? ' (archived)' : ''}, target ${formatMinutes(p.intensityTargetMinutes)}/day`)
        .join('\n')
    },

    async create_project(input: { name: string; id?: string; color?: string; icon?: string; intensityTargetMinutes?: number }) {
      const project = await client.createProject(input)
      return `Created project "${project.name}" with id ${project.id}. Log against it with projectId "${project.id}".`
    },

    async update_project({ id, ...patch }: { id: string } & Record<string, unknown>) {
      const project = await client.updateProject(id, patch)
      const changed = Object.keys(patch)
      if (changed.length === 0) return `No changes given for ${id}; nothing was updated.`
      return `Updated ${changed.join(', ')} on "${project.name}" (${project.id})${project.isArchived ? '; it is now archived' : ''}.`
    },

    async log_time(input: { projectId: string; durationMinutes: number; date?: string; note?: string }) {
      const date = input.date ?? clock()
      await client.logTime({ ...input, date })
      return `Logged ${formatMinutes(input.durationMinutes)} on ${input.projectId} for ${date}${input.note ? ` — ${input.note}` : ''}.`
    },

    async plan_time(input: { projectId: string; plannedMinutes: number; date?: string; note?: string }) {
      const date = input.date ?? clock()
      await client.planTime({ ...input, date })
      return `Planned ${formatMinutes(input.plannedMinutes)} on ${input.projectId} for ${date}${input.note ? ` — ${input.note}` : ''}.`
    },

    async timer_status() {
      const timer = await client.runningTimer()
      if (!timer) return 'No timer is running.'
      const minutes = Math.max(0, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60_000))
      return `${timer.projectId} has been running for ${formatMinutes(minutes)}, started ${timer.startedAt}.`
    },

    async start_timer(input: { projectId: string; note?: string }) {
      const timer = await client.startTimer({ ...input, date: clock() })
      return `Started timing ${timer.projectId} at ${new Date(timer.startedAt).toLocaleTimeString('en')}.`
    },

    async stop_timer(input: { note?: string }) {
      const stopped = await client.stopTimer(input)
      const base = `Stopped ${stopped.activity.projectId}; logged ` +
        `${formatMinutes(stopped.activity.durationMinutes)} on ${stopped.activity.date}.`
      // Never report the capped number as though it were the elapsed time.
      return stopped.truncated
        ? `${base} The timer had actually run ${formatMinutes(stopped.elapsedMinutes)}, ` +
          'but a single entry caps at 24 hours.'
        : base
    },

    async discard_timer() {
      await client.discardTimer()
      return 'Discarded the running timer. Nothing was logged.'
    },

    async month_overview(input: { month?: string }) {
      const month = input.month ?? clock().slice(0, 7)
      const overview = await client.monthOverview(month)
      const lines = [
        `${month}: ${formatMinutes(overview.totals.actualMinutes)} actual, ` +
        `${formatMinutes(overview.totals.plannedMinutes)} planned, ` +
        `${overview.totals.activeDays} active day${overview.totals.activeDays === 1 ? '' : 's'}.`,
      ]

      const byProject = new Map<string, number>()
      for (const day of Object.values(overview.days)) {
        for (const summary of day.projects) {
          byProject.set(summary.projectId, (byProject.get(summary.projectId) ?? 0) + summary.actualMinutes)
        }
      }
      const worked = [...byProject.entries()].filter(([, minutes]) => minutes > 0)
      if (worked.length > 0) {
        lines.push(...worked
          .sort((a, b) => b[1] - a[1])
          .map(([id, minutes]) => `  ${id}: ${formatMinutes(minutes)}`))
      }
      return lines.join('\n')
    },
  }
}
