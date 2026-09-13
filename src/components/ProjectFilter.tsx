import type { Project } from '../types/tracker'
import { Icon } from './Icon'

interface ProjectFilterProps {
  projects: Project[]
  visibleProjectIds: Set<string>
  onToggle: (projectId: string) => void
  onShowAll: () => void
}

export function ProjectFilter({ projects, visibleProjectIds, onToggle, onShowAll }: ProjectFilterProps) {
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
            return (
              <button
                key={project.id}
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

      <p className="sidebar-note">A quiet record of intention and attention.</p>
    </aside>
  )
}
