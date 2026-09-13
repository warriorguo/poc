import { colorWithAlpha, getMonthGrid, intensityFor, toISODate } from '../domain/calendar'
import type { DaySummary, ISODate, MonthOverview, Project } from '../types/tracker'

interface MonthCalendarProps {
  monthDate: Date
  overview: MonthOverview
  visibleProjectIds: Set<string>
  selectedDate: ISODate
  today: ISODate
  onSelectDate: (date: ISODate) => void
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_BLOCKS_PER_DAY = 4

function HeatBlock({ project, plannedMinutes, actualMinutes }: {
  project: Project
  plannedMinutes: number
  actualMinutes: number
}) {
  const isPlannedOnly = plannedMinutes > 0 && actualMinutes === 0
  const alpha = intensityFor(actualMinutes, project.intensityTargetMinutes)
  const title = `${project.name}: ${plannedMinutes ? `${plannedMinutes}m planned` : 'unplanned'}, ${actualMinutes}m actual`

  return (
    <span
      className={`heat-block ${isPlannedOnly ? 'is-planned-only' : ''}`}
      style={{
        '--project-color': project.color,
        '--project-fill': colorWithAlpha(project.color, alpha),
      } as React.CSSProperties}
      title={title}
    >
      <span className="heat-label">{project.name}</span>
      <span className="heat-time">{actualMinutes > 0 ? `${actualMinutes}m` : 'planned'}</span>
    </span>
  )
}

export function MonthCalendar({
  monthDate,
  overview,
  visibleProjectIds,
  selectedDate,
  today,
  onSelectDate,
}: MonthCalendarProps) {
  const days = getMonthGrid(monthDate)
  const projectMap = new Map(overview.projects.map((project) => [project.id, project]))

  return (
    <section className="calendar-shell" aria-label="Monthly activity calendar">
      <div className="weekday-row">
        {weekdayLabels.map((weekday) => <div key={weekday}>{weekday}</div>)}
      </div>
      <div className="calendar-grid">
        {days.map((date, index) => {
          const isoDate = toISODate(date)
          const isOutsideMonth = date.getMonth() !== monthDate.getMonth()
          const isToday = isoDate === today
          const isSelected = isoDate === selectedDate
          const day: DaySummary | undefined = overview.days[isoDate]
          const visibleSummaries = day?.projects.filter((summary) => visibleProjectIds.has(summary.projectId)) ?? []
          const shownSummaries = visibleSummaries.slice(0, MAX_BLOCKS_PER_DAY)
          const overflowCount = visibleSummaries.length - shownSummaries.length
          // Describes what is actually rendered, including the overflow, so the
          // label never promises detail the cell does not show.
          const activityDescription = [
            ...shownSummaries.map((summary) => {
              const project = projectMap.get(summary.projectId)
              const state = summary.actualMinutes > 0 ? `${summary.actualMinutes} minutes actual` : 'planned only'
              return `${project?.name ?? 'Unknown project'}: ${state}`
            }),
            ...(overflowCount > 0 ? [`${overflowCount} more not shown`] : []),
          ].join(', ')

          return (
            <button
              className={`calendar-day ${isOutsideMonth ? 'is-outside' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
              key={isoDate}
              type="button"
              onClick={() => onSelectDate(isoDate)}
              aria-label={`${date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}${activityDescription ? `, ${activityDescription}` : ''}`}
              style={{ '--cell-order': index } as React.CSSProperties}
            >
              <span className="day-number">{date.getDate()}</span>
              <span className="heat-stack">
                {shownSummaries.map((summary) => {
                  const project = projectMap.get(summary.projectId)
                  return project ? <HeatBlock key={summary.projectId} project={project} {...summary} /> : null
                })}
                {overflowCount > 0 && <span className="heat-overflow">+{overflowCount} more</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
