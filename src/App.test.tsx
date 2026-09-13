import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMockTrackerApi } from './api/mock-tracker-api'
import { TrackerApiError, type TrackerApi } from './api/tracker-api'
import { App } from './App'
import { activityOn, planOn, TODAY } from './test/factories'

const ACCOUNT = { email: 'andrew@example.com' }

function renderApp(api: TrackerApi, onSignOut = vi.fn()) {
  return {
    user: userEvent.setup(),
    onSignOut,
    ...render(<App api={api} account={ACCOUNT} onSignOut={onSignOut} />),
  }
}

function emptyApi(overrides: Partial<TrackerApi> = {}): TrackerApi {
  return { ...createMockTrackerApi({ latencyMs: 0, plans: [], activities: [] }), ...overrides }
}

async function openLogDialog(user: ReturnType<typeof userEvent.setup>) {
  const triggers = await screen.findAllByRole('button', { name: /log time/i })
  await user.click(triggers[0]!)
  return screen.findByRole('dialog')
}

describe('App', () => {
  it('opens on the current month rather than a hardcoded one', async () => {
    renderApp(emptyApi())
    const expected = new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })
    expect(await screen.findByRole('heading', { level: 1, name: expected })).toBeTruthy()
  })

  it('shows the month totals once loaded', async () => {
    const api = createMockTrackerApi({
      latencyMs: 0,
      plans: [planOn(TODAY, 'ozx', 60)],
      activities: [activityOn(TODAY, 'ozx', 90)],
    })
    renderApp(api)
    const summary = await screen.findByLabelText('Monthly summary')
    expect(within(summary).getByText('1.5h')).toBeTruthy()
  })

  it('saves a logged activity and reflects it in the day inspector', async () => {
    const { user } = renderApp(emptyApi())
    const dialog = await openLogDialog(user)

    await user.clear(within(dialog).getByLabelText(/minutes/i))
    await user.type(within(dialog).getByLabelText(/minutes/i), '45')
    await user.click(within(dialog).getByRole('button', { name: /add to the day/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const inspector = await screen.findByLabelText(/^Details for/)
    expect(within(inspector).getByText('45m done', { exact: false })).toBeTruthy()
  })

  it('reports a save failure and leaves the dialog usable', async () => {
    const api = emptyApi({
      createActivity: vi.fn().mockRejectedValue(new TrackerApiError('Project does not exist or is archived.', 'NOT_FOUND')),
    })
    const { user } = renderApp(api)
    const dialog = await openLogDialog(user)
    const submit = within(dialog).getByRole('button', { name: /add to the day/i })

    await user.click(submit)

    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Project does not exist or is archived.')
    // The regression this guards: the button used to stay on "Saving…" forever.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /add to the day/i })).toHaveProperty('disabled', false)
  })

  it('explains an empty minutes field instead of silently doing nothing', async () => {
    const createActivity = vi.fn()
    const { user } = renderApp(emptyApi({ createActivity }))
    const dialog = await openLogDialog(user)

    await user.clear(within(dialog).getByLabelText(/minutes/i))
    await user.click(within(dialog).getByRole('button', { name: /add to the day/i }))

    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Enter a duration in minutes.')
    expect(createActivity).not.toHaveBeenCalled()
  })

  it('closes the dialog on Escape and restores focus to the trigger', async () => {
    const { user } = renderApp(emptyApi())
    const triggers = await screen.findAllByRole('button', { name: /log time/i })
    const trigger = triggers[0]!
    await user.click(trigger)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps focus inside the dialog when tabbing', async () => {
    const { user } = renderApp(emptyApi())
    const dialog = await openLogDialog(user)
    for (let press = 0; press < 8; press += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('starts a timer from a project and shows it running', async () => {
    const { user } = renderApp(emptyApi())
    await screen.findByLabelText('Monthly activity calendar')

    await user.click(screen.getByRole('button', { name: /start a timer for ozx/i }))

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('button', { name: /stop the timer for ozx/i })).toBeTruthy()
  })

  // Only one timer can run, so every other project's control must say why.
  it('blocks starting a second timer while one runs', async () => {
    const { user } = renderApp(emptyApi())
    await screen.findByLabelText('Monthly activity calendar')
    await user.click(screen.getByRole('button', { name: /start a timer for ozx/i }))
    await screen.findByRole('status')

    const other = screen.getByRole('button', { name: /start a timer for reading/i })
    expect(other).toHaveProperty('disabled', true)
    expect(other.getAttribute('title')).toContain('Another timer is running')
  })

  it('stops a timer and folds the time into the month', async () => {
    const api = emptyApi()
    const { user } = renderApp(api)
    await screen.findByLabelText('Monthly activity calendar')

    await user.click(screen.getByRole('button', { name: /start a timer for ozx/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /^stop$/i }))

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    const summary = screen.getByLabelText('Monthly summary')
    // A sub-minute timer still records one minute rather than nothing.
    await waitFor(() => expect(within(summary).getByText('1')).toBeTruthy())
  })

  it('discards a timer without recording anything', async () => {
    const api = emptyApi()
    const createActivity = vi.spyOn(api, 'createActivity')
    const { user } = renderApp(api)
    await screen.findByLabelText('Monthly activity calendar')

    await user.click(screen.getByRole('button', { name: /start a timer for ozx/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(createActivity).not.toHaveBeenCalled()
    const summary = screen.getByLabelText('Monthly summary')
    expect(within(summary).getByText('0h')).toBeTruthy()
  })

  it('restores a timer that was already running on the server', async () => {
    const api = emptyApi({
      getRunningTimer: vi.fn().mockResolvedValue({
        projectId: 'ozx', date: TODAY, startedAt: new Date(Date.now() - 90_000).toISOString(),
      }),
    })
    renderApp(api)

    // A timer survives a reload because it lives on the server, not the tab.
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(await screen.findByText('1:30')).toBeTruthy()
  })

  it('explains a capped timer instead of silently logging a different number', async () => {
    const api = emptyApi({
      getRunningTimer: vi.fn().mockResolvedValue({ projectId: 'ozx', date: TODAY, startedAt: new Date().toISOString() }),
      stopTimer: vi.fn().mockResolvedValue({
        activity: { id: 'a1', projectId: 'ozx', date: TODAY, durationMinutes: 1440, source: 'timer' },
        elapsedMinutes: 1560,
        truncated: true,
      }),
    })
    const { user } = renderApp(api)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: /^stop$/i }))

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('caps at 24 hours')
    expect(notice.textContent).toContain('1440 minutes')
  })

  it('keeps an empty project filter when the month changes', async () => {
    const { user } = renderApp(emptyApi())
    await screen.findByLabelText('Monthly activity calendar')

    const filters = screen.getAllByRole('button', { pressed: true })
    for (const filter of filters) await user.click(filter)
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /next month/i }))

    // The regression: an empty set read as "uninitialised" and every project
    // was silently switched back on.
    await waitFor(() => expect(screen.getByLabelText('Monthly activity calendar')).toBeTruthy())
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('surfaces a load failure with a retry that succeeds', async () => {
    const working = createMockTrackerApi({ latencyMs: 0, plans: [], activities: [] })
    const getMonthOverview = vi.fn()
      .mockRejectedValueOnce(new TrackerApiError('nope', 'NETWORK'))
      .mockImplementation(working.getMonthOverview)
    const { user } = renderApp({ ...working, getMonthOverview })

    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('The month could not be loaded')

    await user.click(within(banner).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByLabelText('Monthly activity calendar')).toBeTruthy()
  })

  it('hands back to sign-in when the session has expired', async () => {
    const onSignOut = vi.fn()
    const working = createMockTrackerApi({ latencyMs: 0, plans: [], activities: [] })
    const getMonthOverview = vi.fn().mockRejectedValue(new TrackerApiError('Sign in to continue.', 'UNAUTHENTICATED'))
    renderApp({ ...working, getMonthOverview }, onSignOut)

    // An expired cookie must not surface as a retry that can never succeed.
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the signed-in account and offers a way out', async () => {
    const { user, onSignOut } = renderApp(emptyApi())
    expect(await screen.findByText('andrew@example.com')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
