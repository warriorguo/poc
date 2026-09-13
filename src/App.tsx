import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Account } from './api/auth-api'
import { TrackerApiError, type TrackerApi } from './api/tracker-api'
import { DayInspector } from './components/DayInspector'
import { Icon } from './components/Icon'
import { LogTimeDialog } from './components/LogTimeDialog'
import { MonthCalendar } from './components/MonthCalendar'
import { ProjectFilter } from './components/ProjectFilter'
import { monthKeyToDate, shiftMonth, toISODate, toMonthKey } from './domain/calendar'
import type { CreateActivityInput, ISODate, MonthKey, MonthOverview } from './types/tracker'

interface AppProps {
  api: TrackerApi
  account: Account
  onSignOut: () => void
}

function formatHours(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function App({ api, account, onSignOut }: AppProps) {
  const today = useMemo(() => toISODate(new Date()), [])
  const [monthDate, setMonthDate] = useState(() => shiftMonth(new Date(), 0))
  const [overview, setOverview] = useState<MonthOverview | null>(null)
  const [visibleProjectIds, setVisibleProjectIds] = useState<Set<string>>(new Set())
  const [hasInitialisedFilter, setHasInitialisedFilter] = useState(false)
  const [selectedDate, setSelectedDate] = useState<ISODate>(today)
  const [showInspector, setShowInspector] = useState(true)
  const [showLogDialog, setShowLogDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const monthKey = toMonthKey(monthDate)

  // One loader for both the month change and the post-write refresh, so a slow
  // response can never overwrite a newer month's data.
  useEffect(() => {
    const controller = new AbortController()

    api.getMonthOverview(monthKey, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setError(null)
        setOverview(data)
        setVisibleProjectIds((current) => {
          if (hasInitialisedFilter) return current
          return new Set(data.projects.map((project) => project.id))
        })
        setHasInitialisedFilter(true)
      })
      .catch((loadError: unknown) => {
        if (isAbortError(loadError) || controller.signal.aborted) return
        if (loadError instanceof TrackerApiError && loadError.code === 'UNAUTHENTICATED') {
          // The cookie expired or was revoked; hand back to the sign-in screen
          // rather than showing a retry that can never succeed.
          onSignOut()
          return
        }
        setError('The month could not be loaded. Please try again.')
      })

    return () => controller.abort()
    // hasInitialisedFilter is read, not tracked: re-running on its change would
    // duplicate the request that just set it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, monthKey, reloadToken, onSignOut])

  const changeMonth = useCallback((amount: number) => {
    const nextMonth = shiftMonth(monthDate, amount)
    setMonthDate(nextMonth)
    setSelectedDate(toISODate(nextMonth))
    setShowInspector(false)
  }, [monthDate])

  function goToToday() {
    setMonthDate(monthKeyToDate(toMonthKey(new Date())))
    setSelectedDate(today)
    setShowInspector(true)
  }

  function toggleProject(projectId: string) {
    setVisibleProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function selectDate(date: ISODate) {
    if (date.slice(0, 7) !== monthKey) {
      setMonthDate(monthKeyToDate(date.slice(0, 7) as MonthKey))
    }
    setSelectedDate(date)
    setShowInspector(true)
  }

  // Errors propagate to the dialog, which owns the message and its own retry.
  async function logTime(input: CreateActivityInput) {
    await api.createActivity(input)
    setShowLogDialog(false)
    setReloadToken((token) => token + 1)
  }

  const monthLabel = monthDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })
  const selectedDay = overview?.days[selectedDate]

  return (
    <div className="app-shell">
      <ProjectFilter
        projects={overview?.projects ?? []}
        visibleProjectIds={visibleProjectIds}
        onToggle={toggleProject}
        onShowAll={() => setVisibleProjectIds(new Set(overview?.projects.map((project) => project.id) ?? []))}
      />

      <main className="main-content">
        <header className="topbar">
          <div className="month-navigation">
            <button className="today-button" type="button" onClick={goToToday}>Today</button>
            <div className="arrow-group">
              <button className="icon-button" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><Icon name="arrow-left" /></button>
              <button className="icon-button" type="button" onClick={() => changeMonth(1)} aria-label="Next month"><Icon name="arrow-right" /></button>
            </div>
            <div>
              <span className="eyebrow">Monthly field notes</span>
              <h1>{monthLabel}</h1>
            </div>
          </div>

          <div className="month-summary" aria-label="Monthly summary">
            <div><strong>{overview ? formatHours(overview.totals.actualMinutes) : '—'}</strong><span>focused</span></div>
            <div><strong>{overview?.totals.activeDays ?? '—'}</strong><span>active days</span></div>
            <button type="button" className="primary-button" onClick={() => setShowLogDialog(true)} disabled={!overview}>
              <Icon name="plus" /> Log time
            </button>
            <div className="account-menu">
              <span className="account-email" title={account.email}>{account.email}</span>
              <button type="button" className="text-button" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" className="text-button" onClick={() => setReloadToken((token) => token + 1)}>Retry</button>
          </div>
        )}
        {!overview && !error ? (
          <div className="calendar-loading" aria-label="Loading calendar"><span /><span /><span /></div>
        ) : overview ? (
          <MonthCalendar
            monthDate={monthDate}
            overview={overview}
            visibleProjectIds={visibleProjectIds}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={selectDate}
          />
        ) : null}

        <footer className="calendar-footer">
          <span><Icon name="calendar" /> Six-week overview</span>
          <span>{visibleProjectIds.size} of {overview?.projects.length ?? 0} projects visible</span>
        </footer>
      </main>

      {showInspector && overview && (
        <DayInspector
          date={selectedDate}
          day={selectedDay}
          projects={overview.projects}
          visibleProjectIds={visibleProjectIds}
          onClose={() => setShowInspector(false)}
          onLogTime={() => setShowLogDialog(true)}
        />
      )}

      {showLogDialog && overview && (
        <LogTimeDialog
          date={selectedDate}
          projects={overview.projects}
          onCancel={() => setShowLogDialog(false)}
          onSubmit={logTime}
        />
      )}
    </div>
  )
}
