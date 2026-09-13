import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('calendar exploded')
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>)
    expect(screen.getByText('all good')).toBeTruthy()
  })

  it('shows a recoverable fallback instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('calendar exploded')).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload tempo/i })).toBeTruthy()
  })
})
