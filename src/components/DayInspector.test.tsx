import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DaySummary, Project } from '../types/tracker'
import { DayInspector } from './DayInspector'

const projects: Project[] = [
  { id: 'ozx', name: 'OZX', color: '#e4573d', intensityTargetMinutes: 90, icon: 'O', isArchived: false, sortOrder: 0 },
  { id: 'reading', name: 'Reading', color: '#bc8b19', intensityTargetMinutes: 45, icon: 'R', isArchived: false, sortOrder: 1 },
]

const day: DaySummary = {
  date: '2026-09-12',
  projects: [
    { projectId: 'ozx', plannedMinutes: 60, actualMinutes: 90, activityCount: 1 },
    { projectId: 'reading', plannedMinutes: 30, actualMinutes: 30, activityCount: 1 },
  ],
}

function renderInspector(visible: string[]) {
  render(
    <DayInspector
      date="2026-09-12"
      day={day}
      projects={projects}
      visibleProjectIds={new Set(visible)}
      onClose={vi.fn()}
      onLogTime={vi.fn()}
    />,
  )
}

describe('DayInspector', () => {
  it('lists every project when all are visible', () => {
    renderInspector(['ozx', 'reading'])
    expect(screen.getByText('OZX')).toBeTruthy()
    expect(screen.getByText('Reading')).toBeTruthy()
    expect(screen.getByText('2h')).toBeTruthy()
  })

  // The regression: the calendar hid the project while the inspector still
  // listed it and counted it in the totals.
  it('honours the same filter the calendar applies', () => {
    renderInspector(['ozx'])
    expect(screen.getByText('OZX')).toBeTruthy()
    expect(screen.queryByText('Reading')).toBeNull()
  })

  it('excludes hidden projects from the totals and says how many', () => {
    renderInspector(['ozx'])
    expect(screen.getByText('1h 30m')).toBeTruthy()
    expect(screen.getByText('1 hidden project not counted above.')).toBeTruthy()
  })

  it('falls back to the empty message when everything is filtered out', () => {
    renderInspector([])
    expect(screen.getByText(/Nothing planned yet/)).toBeTruthy()
    expect(screen.getByText('2 hidden projects not counted above.')).toBeTruthy()
  })
})
