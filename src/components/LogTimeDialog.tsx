import { useId, useState, type FormEvent } from 'react'
import { TrackerApiError } from '../api/tracker-api'
import { describeInvalidDuration, MAX_ENTRY_MINUTES } from '../api/validation'
import type { CreateActivityInput, ISODate, Project } from '../types/tracker'
import { Icon } from './Icon'
import { useModalDialog } from './use-modal-dialog'

interface LogTimeDialogProps {
  date: ISODate
  projects: Project[]
  onCancel: () => void
  onSubmit: (input: CreateActivityInput) => Promise<void>
}

export function LogTimeDialog({ date, projects, onCancel, onSubmit }: LogTimeDialogProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [minutesText, setMinutesText] = useState('30')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const dialogRef = useModalDialog<HTMLFormElement>(onCancel)
  const titleId = useId()
  const errorId = useId()

  // Held as text so an empty field reports a problem instead of silently
  // becoming 0 and making the submit button look broken.
  const durationProblem = minutesText.trim() === ''
    ? 'Enter a duration in minutes.'
    : describeInvalidDuration(Number(minutesText))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSaving) return

    if (!projectId) {
      setFormError('Choose a project.')
      return
    }
    if (durationProblem) {
      setFormError(durationProblem)
      return
    }

    setFormError(null)
    setIsSaving(true)
    try {
      await onSubmit({
        projectId,
        durationMinutes: Number(minutesText),
        date,
        note: note.trim() || undefined,
      })
    } catch (error: unknown) {
      setFormError(error instanceof TrackerApiError
        ? error.message
        : 'This activity could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <form
        className="dialog"
        ref={dialogRef}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="icon-button close-button" onClick={onCancel} aria-label="Close"><Icon name="close" /></button>
        <span className="eyebrow">New activity</span>
        <h2 id={titleId}>Where did your time go?</h2>
        <p>{new Date(`${date}T12:00:00`).toLocaleDateString('en', { month: 'long', day: 'numeric' })}</p>
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>
          Minutes
          <input
            type="number"
            min="1"
            max={MAX_ENTRY_MINUTES}
            inputMode="numeric"
            value={minutesText}
            aria-invalid={Boolean(durationProblem)}
            aria-describedby={formError ? errorId : undefined}
            onChange={(event) => setMinutesText(event.target.value)}
          />
        </label>
        <label>
          Note <span>(optional)</span>
          <input type="text" maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What moved forward?" />
        </label>
        {formError && <p className="form-error" id={errorId} role="alert">{formError}</p>}
        <button className="primary-button full-width" type="submit" disabled={isSaving}>
          <Icon name="clock" /> {isSaving ? 'Saving…' : 'Add to the day'}
        </button>
      </form>
    </div>
  )
}
