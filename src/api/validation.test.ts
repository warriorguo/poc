import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECTS } from './seed-data'
import { assertValidEntry, describeInvalidDuration, isValidISODate, MAX_ENTRY_MINUTES } from './validation'

describe('isValidISODate', () => {
  it('accepts real dates', () => {
    expect(isValidISODate('2026-09-13')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true)
  })

  it('rejects well-shaped dates that do not exist', () => {
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2025-02-29')).toBe(false)
  })

  it('rejects anything that is not the ISO shape', () => {
    expect(isValidISODate('2026-9-13')).toBe(false)
    expect(isValidISODate('13/09/2026')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })
})

describe('describeInvalidDuration', () => {
  it('accepts whole minutes inside the daily bound', () => {
    expect(describeInvalidDuration(1)).toBeNull()
    expect(describeInvalidDuration(45)).toBeNull()
    expect(describeInvalidDuration(MAX_ENTRY_MINUTES)).toBeNull()
  })

  // The dialog's max attribute stops this at the browser, so these paths are
  // the last line of defence for anything that bypasses the form.
  it('describes what is wrong with the rest', () => {
    expect(describeInvalidDuration(0)).toBe('Enter at least 1 minute.')
    expect(describeInvalidDuration(-5)).toBe('Enter at least 1 minute.')
    expect(describeInvalidDuration(MAX_ENTRY_MINUTES + 1)).toContain('cannot exceed')
    expect(describeInvalidDuration(30.5)).toBe('Enter a whole number of minutes.')
    expect(describeInvalidDuration(Number.NaN)).toBe('Enter a whole number of minutes.')
    expect(describeInvalidDuration(Number.POSITIVE_INFINITY)).toBe('Enter a whole number of minutes.')
  })
})

describe('assertValidEntry', () => {
  it('passes a well-formed entry', () => {
    expect(() => assertValidEntry(DEFAULT_PROJECTS, 'ozx', '2026-09-13', 30)).not.toThrow()
  })

  it('rejects an unknown project before anything else', () => {
    expect(() => assertValidEntry(DEFAULT_PROJECTS, 'nope', '2026-09-13', 30))
      .toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('rejects an archived project', () => {
    const archived = DEFAULT_PROJECTS.map((project) =>
      project.id === 'ozx' ? { ...project, isArchived: true } : project)
    expect(() => assertValidEntry(archived, 'ozx', '2026-09-13', 30))
      .toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('rejects a bad duration and a bad date as validation failures', () => {
    expect(() => assertValidEntry(DEFAULT_PROJECTS, 'ozx', '2026-09-13', 0))
      .toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => assertValidEntry(DEFAULT_PROJECTS, 'ozx', '2026-02-30', 30))
      .toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
})
