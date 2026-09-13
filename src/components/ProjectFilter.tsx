import type { Account } from '../api/auth-api'
import type { Project } from '../types/tracker'
import { Icon } from './Icon'

interface ProjectFilterProps {
  projects: Project[]
  visibleProjectIds: Set<string>
  onToggle: (projectId: string) => void
  onShowAll: () => void
  account: Account
  onManageTokens: () => void
  onSignOut: () => void
  runningProjectId: string | null
  isTimerBusy: boolean
  onStartTimer: (projectId: string) => void
  onStopTimer: () => void
}

export function ProjectFilter({
  projects,
  visibleProjectIds,
  onToggle,
  onShowAll,
  account,
  onManageTokens,
  onSignOut,
  runningProjectId,
  isTimerBusy,
  onStartTimer,
  onStopTimer,
}: ProjectFilterProps) {
  // Compared by membership, not size: the visible set can still hold ids from
  // a project that has since been archived.
  const allVisible = projects.length > 0 && projects.every((project) => visibleProjectIds.has(project.id))

  return (
    <aside className="sidebar">
      <div className="brand" aria-label="Tempo home">
        <span className="brand-mark">T</span>
        <div>
          <strong>tempo</strong>
          <small>make time visible</small>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-heading">
          <span>Projects</span>
          <button className="text-button" type="button" onClick={onShowAll} disabled={allVisible}>
            Show all
          </button>
        </div>
        <div className="project-list">
          {projects.map((project) => {
            const isVisible = visibleProjectIds.has(project.id)
            const isRunning = runningProjectId === project.id
            const blockedByOther = runningProjectId !== null && !isRunning
            return (
              // A row, not a single button: the timer control cannot be nested
              // inside the filter button.
              <div className={`project-row ${isRunning ? 'is-running' : ''}`} key={project.id}>
                <button
                  type="button"
                  className={`project-filter ${isVisible ? 'is-active' : ''}`}
                  onClick={() => onToggle(project.id)}
                  aria-pressed={isVisible}
                >
                  <span className="project-swatch" style={{ '--project-color': project.color } as React.CSSProperties}>
                    {isVisible && <Icon name="check" />}
                  </span>
                  <span>{project.name}</span>
                  <span className="project-monogram">{project.icon}</span>
                </button>
                <button
                  type="button"
                  className={`timer-button ${isRunning ? 'is-running' : ''}`}
                  onClick={() => (isRunning ? onStopTimer() : onStartTimer(project.id))}
                  disabled={isTimerBusy || blockedByOther}
                  title={blockedByOther ? 'Another timer is running. Stop it first.' : undefined}
                  aria-label={isRunning ? `Stop the timer for ${project.name}` : `Start a timer for ${project.name}`}
                >
                  <Icon name={isRunning ? 'stop' : 'play'} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="legend-card">
        <span className="eyebrow">How to read</span>
        <div className="legend-row"><i className="legend-chip planned" /> Planned, not done</div>
        <div className="legend-row"><i className="legend-chip light" /> Short session</div>
        <div className="legend-row"><i className="legend-chip deep" /> Deep session</div>
      </div>

      {/* The account controls live here rather than in the topbar: the day
          inspector is fixed to the top-right and covered them there, leaving
          them unclickable whenever it was open. */}
      <div className="account-menu">
        <span className="account-email" title={account.email}>{account.email}</span>
        <div className="account-actions">
          <button type="button" className="text-button" onClick={onManageTokens}>API tokens</button>
          <button type="button" className="text-button" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
  )
}
