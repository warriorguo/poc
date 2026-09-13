import type { DaySummary, ISODate, Project } from '../types/tracker'
import { Icon } from './Icon'

interface DayInspectorProps {
  date: ISODate
  day?: DaySummary
  projects: Project[]
  visibleProjectIds: Set<string>
  onClose: () => void
  onLogTime: () => void
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function DayInspector({ date, day, projects, visibleProjectIds, onClose, onLogTime }: DayInspectorProps) {
  const formatted = new Date(`${date}T12:00:00`).toLocaleDateString('en', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const projectMap = new Map(projects.map((project) => [project.id, project]))

  // Mirrors the calendar's filter so the same day never reads differently in
  // the two panes, totals included.
  const summaries = day?.projects.filter((item) => visibleProjectIds.has(item.projectId)) ?? []
  const hiddenCount = (day?.projects.length ?? 0) - summaries.length
  const actualTotal = summaries.reduce((total, item) => total + item.actualMinutes, 0)
  const plannedTotal = summaries.reduce((total, item) => total + item.plannedMinutes, 0)

  return (
    <aside className="inspector" aria-label={`Details for ${formatted}`}>
      <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close day details">
        <Icon name="close" />
      </button>
      <span className="eyebrow">Day note</span>
      <h2>{formatted}</h2>
      <div className="day-totals">
        <div><strong>{formatMinutes(actualTotal)}</strong><span>focused</span></div>
        <div><strong>{formatMinutes(plannedTotal)}</strong><span>planned</span></div>
      </div>
      <div className="inspector-list">
        {summaries.length ? summaries.map((item) => {
          const project = projectMap.get(item.projectId)
          if (!project) return null
          return (
            <div className="inspector-item" key={item.projectId}>
              <i style={{ background: project.color }} />
              <div>
                <strong>{project.name}</strong>
                <span>{item.actualMinutes ? `${formatMinutes(item.actualMinutes)} done` : 'Planned only'} · {formatMinutes(item.plannedMinutes)} planned</span>
              </div>
            </div>
          )
        }) : <p className="empty-day">Nothing planned yet. Leave some white space—or give the day a small intention.</p>}
      </div>
      {hiddenCount > 0 && (
        <p className="inspector-hidden-note">
          {hiddenCount} hidden {hiddenCount === 1 ? 'project' : 'projects'} not counted above.
        </p>
      )}
      <button type="button" className="primary-button full-width" onClick={onLogTime}>
        <Icon name="plus" /> Log time
      </button>
    </aside>
  )
}
