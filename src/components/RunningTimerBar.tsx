import { useEffect, useState } from 'react'
import { elapsedLabel } from '../domain/elapsed'
import type { Project, RunningTimer } from '../types/tracker'
import { Icon } from './Icon'

interface RunningTimerBarProps {
  timer: RunningTimer
  projects: Project[]
  isBusy: boolean
  onStop: () => void
  onDiscard: () => void
}

export function RunningTimerBar({ timer, projects, isBusy, onStop, onDiscard }: RunningTimerBarProps) {
  const [now, setNow] = useState(() => Date.now())

  // Elapsed time is derived from startedAt rather than counted up, so it stays
  // correct after a reload, a sleep, or a slow tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const project = projects.find((candidate) => candidate.id === timer.projectId)

  return (
    <div className="timer-bar" role="status" aria-live="off">
      <span className="timer-pulse" style={{ background: project?.color ?? 'var(--accent)' }} aria-hidden="true" />
      <div className="timer-text">
        <strong>{project?.name ?? timer.projectId}</strong>
        <span>running since {new Date(timer.startedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <time className="timer-elapsed" dateTime={timer.startedAt}>{elapsedLabel(timer.startedAt, now)}</time>
      <button type="button" className="primary-button" onClick={onStop} disabled={isBusy}>
        <Icon name="stop" /> {isBusy ? 'Saving…' : 'Stop'}
      </button>
      <button type="button" className="icon-button" onClick={onDiscard} disabled={isBusy} aria-label="Discard timer without logging">
        <Icon name="trash" />
      </button>
    </div>
  )
}
