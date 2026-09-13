import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MonthOverview, Project } from '../types/tracker'
import { MonthCalendar } from './MonthCalendar'

const projects: Project[] = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map((id, index) => ({
  id,
  name: id.toUpperCase(),
  color: '#123456',
  intensityTargetMinutes: 60,
  icon: id[0]!.toUpperCase(),
  isArchived: false,
  sortOrder: index,
}))

const DATE = '2026-09-12'

function overviewWith(projectIds: string[]): MonthOverview {
  return {
    month: '2026-09',
    projects,
    days: {
      [DATE]: {
        date: DATE,
        projects: projectIds.map((projectId) => ({
          projectId,
          plannedMinutes: 30,
          actualMinutes: 30,
          activityCount: 1,
        })),
      },
    },
    totals: { plannedMinutes: 0, actualMinutes: 0, activeDays: 1 },
  }
}

function renderCalendar(overview: MonthOverview, visible: string[]) {
  render(
    <MonthCalendar
      monthDate={new Date(2026, 8, 1, 12)}
      overview={overview}
      visibleProjectIds={new Set(visible)}
      selectedDate={DATE}
      today={DATE}
      onSelectDate={vi.fn()}
    />,
  )
  return screen.getByRole('button', { name: /Saturday, September 12/ })
}

describe('MonthCalendar', () => {
  it('shows every project when a day has four or fewer', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta']
    const cell = renderCalendar(overviewWith(ids), ids)
    expect(within(cell).queryByText(/more$/)).toBeNull()
    for (const id of ids) expect(within(cell).getByText(id.toUpperCase())).toBeTruthy()
  })

  it('counts the remainder instead of dropping it silently', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
    const cell = renderCalendar(overviewWith(ids), ids)
    expect(within(cell).getByText('+2 more')).toBeTruthy()
  })

  it('mentions the hidden remainder in the accessible name', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
    const cell = renderCalendar(overviewWith(ids), ids)
    expect(cell.getAttribute('aria-label')).toContain('2 more not shown')
  })

  it('counts overflow after the project filter, not before', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
    const cell = renderCalendar(overviewWith(ids), ['alpha', 'beta'])
    expect(within(cell).queryByText(/more$/)).toBeNull()
    expect(within(cell).queryByText('GAMMA')).toBeNull()
  })
})
