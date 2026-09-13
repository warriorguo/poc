import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project, RunningTimer } from '../types/tracker'
import { elapsedLabel } from '../domain/elapsed'
import { RunningTimerBar } from './RunningTimerBar'

const projects: Project[] = [
  { id: 'ozx', name: 'OZX', color: '#e4573d', icon: 'O', intensityTargetMinutes: 90, isArchived: false, sortOrder: 0 },
]

const START = '2026-09-13T10:00:00.000Z'
const startMs = new Date(START).getTime()

describe('elapsedLabel', () => {
  it('counts up in minutes and seconds', () => {
    expect(elapsedLabel(START, startMs)).toBe('0:00')
    expect(elapsedLabel(START, startMs + 65_000)).toBe('1:05')
    expect(elapsedLabel(START, startMs + 59 * 60_000 + 59_000)).toBe('59:59')
  })

  it('adds an hours field past an hour', () => {
    expect(elapsedLabel(START, startMs + 3_600_000)).toBe('1:00:00')
    expect(elapsedLabel(START, startMs + 26 * 3_600_000)).toBe('26:00:00')
  })

  // Derived from startedAt, not counted up, so a clock that jumps backwards
  // (sleep, NTP correction) cannot show a negative timer.
  it('never goes negative', () => {
    expect(elapsedLabel(START, startMs - 5000)).toBe('0:00')
  })
})

describe('RunningTimerBar', () => {
  const timer: RunningTimer = { projectId: 'ozx', date: '2026-09-13', startedAt: START }

  it('names the running project and offers stop and discard', () => {
    render(<RunningTimerBar timer={timer} projects={projects} isBusy={false} onStop={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('OZX')).toBeTruthy()
    expect(screen.getByRole('button', { name: /stop/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy()
  })

  it('falls back to the id when the project is not in the list', () => {
    render(<RunningTimerBar timer={{ ...timer, projectId: 'gone' }} projects={projects} isBusy={false} onStop={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('gone')).toBeTruthy()
  })

  it('disables both controls while a request is in flight', () => {
    render(<RunningTimerBar timer={timer} projects={projects} isBusy onStop={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByRole('button', { name: /saving/i })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /discard/i })).toHaveProperty('disabled', true)
  })
})
