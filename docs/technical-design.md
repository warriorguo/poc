# Personal Planner & Tracker — Technical Design

| Field | Value |
| --- | --- |
| Status | Draft for implementation |
| Version | 0.1 |
| Last updated | 2026-09-13 |
| Audience | Product engineer, frontend engineer, backend engineer, future maintainers |

This document specifies the target product across the rollout phases. **The v0.1 delivery scope is Phase 0:** a working UI with project filtering, month navigation, day inspection, and manual activity logging. Project CRUD, plan CRUD, timers, authentication, and integrations are follow-on phases unless explicitly promoted into scope.

**Amendment, 2026-09-13 — local persistence promoted into v0.1.** Phase 0 originally ran against an in-memory adapter, which discarded every entry on reload. v0.1 now persists to the browser's IndexedDB behind the same `TrackerApi` boundary (`src/api/indexeddb-tracker-api.ts`). This keeps the app serverless and single-device: there is still no account system, and multi-device sync remains a later phase that will supply a second `TrackerApi` implementation rather than change anything above it. When the browser denies IndexedDB, the app falls back to the in-memory adapter and tells the user their entries will not be kept.

## 1. Summary

Personal Planner & Tracker is a calendar-based system for planning personal projects, recording actual effort, and reviewing how time was spent. Its primary interface is a month calendar, but the domain model treats the calendar as a projection rather than the source of truth.

Three concepts remain separate:

- **Project** describes a long-lived area of work and owns a display color.
- **Plan** describes intended work for one project on one local calendar date.
- **Activity** records work that actually occurred and its duration.

The month calendar combines them into a daily project heatmap:

- project color identifies the project;
- a colored outline with no fill means planned but not done;
- a filled block means actual activity exists;
- fill intensity increases with actual duration;
- an activity may exist without a plan and still appears as a filled block.

This separation supports planning accuracy, unplanned work, multiple sessions per day, later reporting, and integrations without reducing the model to a single check-in boolean.

## 2. Goals and non-goals

### 2.1 Goals

1. Show an understandable six-week month view of planned and actual work.
2. Make incomplete plans visible without conflating them with completed work.
3. Encode duration consistently while keeping projects visually distinguishable.
4. Support multiple plans and activity sessions for the same project and date.
5. Provide a stable typed API boundary for a future persistent backend.
6. Keep common interactions fast: filter projects, move between months, inspect a day, and record time.
7. Maintain accessible text labels and tooltips so color is not the only carrier of meaning.

### 2.2 Non-goals for v0.1

- social features, shared projects, or team permissions;
- billing, subscriptions, or public profiles;
- automatic time tracking or desktop activity monitoring;
- full recurrence editing and complex calendar rules;
- two-way synchronization with Google Calendar or Apple Calendar;
- prescriptive scoring of productivity or personal performance;
- offline conflict resolution across multiple devices.

## 3. Product behavior

### 3.1 Primary workflow

1. The user creates or selects projects such as OZX, Workout, Reading, and English.
2. The user places a plan on a local calendar date with an intended duration.
3. The user records one or more activities, manually or through a timer.
4. The month calendar aggregates the plans and activities by `(date, projectId)`.
5. The user filters the calendar by project and opens a day for details.

### 3.2 Calendar visual grammar

The visual system assigns one meaning to each channel:

| Visual channel | Meaning |
| --- | --- |
| Hue | Project identity |
| Border | A plan exists |
| Fill | Actual activity exists |
| Fill intensity | Actual duration relative to the project's intensity target |
| Text | Project name and exact duration/status |

The canonical states are:

| Plan | Activity | Rendering | Meaning |
| --- | --- | --- | --- |
| No | No | No block | Nothing recorded |
| Yes | No | Transparent block with colored border | Planned, not done |
| No | Yes | Filled block, no semantic border requirement | Unplanned work happened |
| Yes | Yes | Filled block; optional colored edge | Planned work happened |

The border does not mean “failed.” It only states that intent existed. Completion rate and overdue semantics belong in derived analytics rather than the basic calendar glyph.

### 3.3 Intensity function

Each project has `intensityTargetMinutes`, the duration at which its color reaches maximum display intensity. This value is visual configuration, not a goal.

For actual duration `a` and target `t`:

```text
if a <= 0: intensity = 0
if t <= 0: intensity = 1
otherwise: intensity = min(1, 0.24 + (a / t) × 0.76)
```

The non-zero floor of `0.24` ensures a short session remains visible. The value is capped at `1`, so long sessions do not distort the scale. Exact minutes remain available as text and in the day inspector.

Future analytics may use discrete buckets for cross-month comparability, but the stored data remains raw minutes.

### 3.4 Date and time rules

- A plan belongs to an ISO local date (`YYYY-MM-DD`).
- An activity stores its attributed local date and may additionally store start/end timestamps.
- The API must use the user's configured IANA timezone when deriving an activity date from timestamps.
- Month boundaries are evaluated in that timezone, not in UTC.
- `startedAt` and `endedAt` are either both present or both absent. Manual duration-only entries omit both.
- A timed activity crossing local midnight is split by the service into one activity segment per local date before persistence and aggregation.
- `date` is the immutable attribution date captured in the user's timezone at record time. Changing the account timezone does not retroactively move historical entries; an explicit edit is required.
- Calendar weeks begin on Sunday in the initial template; this becomes a user preference later.

## 4. Information architecture

### 4.1 Month screen

The initial screen contains:

1. **Project rail** — project list, color keys, visibility toggles, and the visual legend.
2. **Month toolbar** — Today, previous/next month, current month label, monthly totals, and Log time.
3. **Calendar grid** — fixed six-week grid with daily project heatmap blocks.
4. **Day inspector** — selected date, planned/actual totals, per-project states, and a Log time action.
5. **Log time dialog** — project, date, duration, and optional note.

Filtering only changes the presentation. It does not delete or modify projects, plans, activities, or totals returned by the service.

### 4.2 Responsive behavior

- Desktop keeps the project rail fixed and gives the calendar the remaining width.
- Narrow screens move the project rail above the calendar and make project filters horizontally scrollable.
- The dense month grid preserves a readable minimum width and may scroll horizontally on small devices.
- The day inspector and entry dialog use viewport-bounded overlays.

## 5. Domain model

### 5.1 Project

```ts
interface Project {
  id: string
  name: string
  color: string                 // six-digit hex in v0.1
  intensityTargetMinutes: number
  icon: string                  // display monogram in v0.1
  isArchived: boolean
}
```

Rules:

- `name` is required and limited to 80 Unicode characters.
- `color` must pass contrast checks when paired with the application's text strategy.
- `intensityTargetMinutes` must be positive and should normally be between 15 and 480.
- archived projects remain resolvable for historical records but are hidden from new-entry defaults.

### 5.2 Plan

```ts
interface Plan {
  id: string
  projectId: string
  date: ISODate
  plannedMinutes: number
  note?: string
}
```

Rules:

- multiple plans for the same project and date are allowed;
- month projections sum `plannedMinutes` for the same `(date, projectId)`;
- deleting a plan never deletes activity;
- `plannedMinutes` must be an integer from 1 to 1,440.

### 5.3 Activity

```ts
interface Activity {
  id: string
  projectId: string
  date: ISODate
  durationMinutes: number
  note?: string
  startedAt?: string
  endedAt?: string
  source: 'manual' | 'timer' | 'import'
}
```

Rules:

- multiple activities for the same project and date are expected;
- month projections sum their duration and retain an activity count;
- `durationMinutes` must be an integer from 1 to 1,440 after date splitting;
- a manual record need not have `startedAt`;
- changing a project's color updates all historical projections without rewriting activities.

### 5.4 Derived month projection

```ts
interface ProjectDaySummary {
  projectId: string
  plannedMinutes: number
  actualMinutes: number
  activityCount: number
}

interface DaySummary {
  date: ISODate
  projects: ProjectDaySummary[]
}

interface MonthOverview {
  month: MonthKey
  projects: Project[]
  days: Record<ISODate, DaySummary>
  totals: {
    plannedMinutes: number
    actualMinutes: number
    activeDays: number
  }
}
```

This read model is optimized for a single month request. The client should not fetch every raw activity and reconstruct years of history on each load.

## 6. API design

### 6.1 Client contract

The frontend depends on a `TrackerApi` interface rather than on mock arrays or transport-specific code:

```ts
interface TrackerApi {
  listProjects(options?: RequestOptions): Promise<Project[]>
  getMonthOverview(month: MonthKey, options?: RequestOptions): Promise<MonthOverview>
  createActivity(input: CreateActivityInput, options?: MutationOptions): Promise<Activity>
  createPlan(input: CreatePlanInput, options?: MutationOptions): Promise<Plan>
}
```

```ts
interface CreateActivityInput {
  projectId: string
  date: ISODate
  durationMinutes: number
  note?: string
}

interface CreatePlanInput {
  projectId: string
  date: ISODate
  plannedMinutes: number
  note?: string
}

interface RequestOptions {
  signal?: AbortSignal
}

interface MutationOptions extends RequestOptions {
  idempotencyKey?: string
}
```

Manual create calls always produce `source: 'manual'`; timer and import sources use dedicated future endpoints or trusted server-side integrations. PATCH request types are deferred with those out-of-scope CRUD screens and must be added to the shared contract before Phase 1 implementation.

The current in-memory implementation is replaceable with an HTTP adapter. Both adapters must preserve the same validation and error semantics.

### 6.2 Proposed HTTP resources

Base path: `/api/v1`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/projects?includeArchived=false` | List projects |
| `POST` | `/projects` | Create a project |
| `PATCH` | `/projects/{projectId}` | Rename, recolor, configure, or archive a project |
| `GET` | `/months/{YYYY-MM}` | Fetch the month projection |
| `GET` | `/plans?from={date}&to={date}` | Fetch raw plans in a range |
| `POST` | `/plans` | Create a plan |
| `PATCH` | `/plans/{planId}` | Update a plan |
| `DELETE` | `/plans/{planId}` | Delete a plan |
| `GET` | `/activities?from={date}&to={date}` | Fetch raw activities in a range |
| `POST` | `/activities` | Record activity |
| `PATCH` | `/activities/{activityId}` | Correct activity |
| `DELETE` | `/activities/{activityId}` | Delete activity |

### 6.3 Example: create activity

```http
POST /api/v1/activities
Idempotency-Key: 01K...
Content-Type: application/json

{
  "projectId": "ozx",
  "date": "2026-09-12",
  "durationMinutes": 43,
  "note": "Calendar interaction pass"
}
```

```json
{
  "data": {
    "id": "act_01K...",
    "projectId": "ozx",
    "date": "2026-09-12",
    "durationMinutes": 43,
    "note": "Calendar interaction pass",
    "source": "manual",
    "createdAt": "2026-09-12T13:10:11Z",
    "updatedAt": "2026-09-12T13:10:11Z"
  }
}
```

### 6.4 Example: month projection

```json
{
  "data": {
    "month": "2026-09",
    "projects": [
      {
        "id": "ozx",
        "name": "OZX",
        "color": "#E4573D",
        "intensityTargetMinutes": 90,
        "icon": "O",
        "isArchived": false
      }
    ],
    "days": {
      "2026-09-12": {
        "date": "2026-09-12",
        "projects": [
          {
            "projectId": "ozx",
            "plannedMinutes": 90,
            "actualMinutes": 43,
            "activityCount": 1
          }
        ]
      }
    },
    "totals": {
      "plannedMinutes": 1680,
      "actualMinutes": 1160,
      "activeDays": 18
    }
  },
  "meta": {
    "timezone": "Asia/Singapore",
    "generatedAt": "2026-09-12T13:10:11Z"
  }
}
```

### 6.5 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "durationMinutes must be between 1 and 1440",
    "fieldErrors": {
      "durationMinutes": "OUT_OF_RANGE"
    },
    "requestId": "req_01K..."
  }
}
```

The client maps transport failures to `TrackerApiError` codes. User-facing messages should not expose internal stack traces or database errors.

### 6.6 API operational rules

- Mutating endpoints accept an idempotency key to prevent duplicate manual submissions.
- List endpoints use inclusive `from` and `to` local dates.
- Month projections may be cached privately with ETags; writes invalidate affected months.
- All resource identifiers are opaque strings.
- Optimistic concurrency can be introduced through version fields or `If-Match` headers when multi-device editing is added.
- The first release assumes a single authenticated owner, but every record still carries an internal `userId` for data isolation.

## 7. Proposed persistence model

A relational database is sufficient and favors reporting consistency.

### 7.1 Tables

```text
users
  id, timezone, week_starts_on, created_at, updated_at

projects
  id, user_id, name, color, intensity_target_minutes,
  icon, archived_at, created_at, updated_at

plans
  id, user_id, project_id, local_date, planned_minutes,
  note, created_at, updated_at

activities
  id, user_id, project_id, local_date, duration_minutes,
  started_at, ended_at, source, note, created_at, updated_at
```

### 7.2 Indexes and constraints

- index `projects(user_id, archived_at)`;
- index `plans(user_id, local_date)` and `plans(project_id, local_date)`;
- index `activities(user_id, local_date)` and `activities(project_id, local_date)`;
- foreign keys from plans and activities to projects;
- check constraints for positive, bounded durations;
- a partial uniqueness rule for active project names may be added after product validation;
- do not create a uniqueness constraint on `(project_id, local_date)` because multiple entries are valid.

Month projections can be calculated with grouped queries initially. Add a materialized daily summary only after measurement shows a need.

## 8. Frontend architecture

```text
src/
  api/
    tracker-api.ts          transport-independent contract and errors
    mock-tracker-api.ts     in-memory demo adapter and seed data
  components/
    ProjectFilter.tsx       project visibility controls and legend
    MonthCalendar.tsx       month grid and heat blocks
    DayInspector.tsx        selected-day read model
    LogTimeDialog.tsx       activity creation form
  domain/
    calendar.ts             dates, aggregation, and color intensity
    calendar.test.ts        deterministic domain tests
  types/
    tracker.ts              shared domain DTOs
  App.tsx                   view orchestration and request lifecycle
```

Key boundaries:

- components consume typed data and callbacks, never import seed arrays;
- aggregation and intensity calculations are pure domain functions;
- the app talks to `TrackerApi`, so an HTTP adapter can replace the mock adapter;
- `AbortSignal` prevents an old month request from overwriting a newer navigation result;
- presentation-only filter state remains local to the client.

For production, create a query hook around the API contract (or adopt the repository's chosen server-state library) and move dialog state to route/search state only if deep linking is needed.

## 9. Accessibility and visual safety

- Every day cell is a real button with a descriptive accessible label.
- Every project filter exposes pressed state.
- Project name and exact duration/status accompany color blocks.
- The “planned” state uses both outline and the word `planned`.
- Keyboard focus has a visible high-contrast ring.
- Animations respect `prefers-reduced-motion`.
- Project color selection should warn when a hue becomes indistinguishable at supported intensity levels.
- A future high-contrast or pattern mode should add hatch/dot patterns for users who cannot distinguish hues reliably.

## 10. Security and privacy

Personal activity history is sensitive behavioral data.

- authorize every query by the authenticated owner; never trust a client-provided `userId`;
- encrypt transport and use managed encryption at rest;
- redact notes from operational logs and analytics events;
- retain only the minimum telemetry required to operate the service;
- provide export and permanent deletion flows before a hosted public release;
- validate note length and render it as text to prevent injection;
- protect mutation endpoints against cross-site request forgery when cookie authentication is used;
- make calendar integrations opt-in and scope their tokens to the minimum permissions.

## 11. Performance and reliability

Initial budgets for a normal month with up to 50 projects and 2,000 raw activities:

- month projection API p95 under 300 ms in-region;
- initial route JavaScript under 200 KB compressed where practical;
- month interaction ready within 2 seconds on a mid-range mobile device;
- month navigation must cancel or ignore stale requests;
- UI operations remain responsive with all 42 date cells rendered.

The 42-cell grid does not need virtualization. The API should aggregate raw records server-side, bound range requests, and return only projects referenced by the requested projection plus active projects needed for entry controls.

## 12. Observability

Recommended structured events:

- `month_overview_loaded` with latency and record counts, but no note content;
- `activity_created` with source and duration bucket;
- `plan_created` with duration bucket;
- `project_filter_changed` with visible count;
- server metrics for request rate, p50/p95 latency, error code, and cache hit rate.

Correlate client and server errors with a request ID. Do not attach project names, activity notes, or exact daily histories to third-party analytics by default.

## 13. Testing strategy

### 13.1 Unit tests

- calendar grid boundaries for months starting on each weekday;
- leap year and year transition behavior;
- aggregation of multiple plans and activities;
- planned-only, actual-only, and combined states;
- intensity floor, interpolation, cap, and invalid target fallback;
- duration and date validation.

### 13.2 Component tests

- project filter toggles only visibility;
- month navigation requests the correct month;
- selecting an outside-month date navigates and selects it;
- planned-only blocks expose text status and outline styling;
- entry form validates duration and refreshes the selected month after success;
- aborted requests do not show an error.

### 13.3 End-to-end tests

- create a project, plan work, record activity, and verify the month projection;
- record unplanned activity and verify it appears filled;
- edit and delete entries and verify totals;
- navigate across a timezone-sensitive month boundary;
- operate the primary workflow with keyboard only.

### 13.4 Visual regression

Capture desktop and narrow-width snapshots for:

- populated month;
- empty month;
- inspector open;
- planned-only and maximum-intensity states;
- long project names and four blocks in a cell.

## 14. Rollout plan

### Phase 0 — UI template (this repository state)

- month grid, project filters, day inspector, and activity dialog;
- typed client API and in-memory adapter;
- deterministic mock data for OZX, Workout, Reading, and English;
- domain tests for aggregation and intensity.

### Phase 1 — Local persistence

- persistent projects, plans, activities, and preferences;
- CRUD forms and validation;
- migration strategy and local export/import;
- basic weekly and monthly summaries.

### Phase 2 — Authenticated service

- owner authentication and row isolation;
- HTTP adapter matching `TrackerApi`;
- idempotent writes, request tracing, backups, and deletion/export;
- responsive and accessibility acceptance testing.

### Phase 3 — Advanced planning

- recurring plans and exceptions;
- timers and optional calendar imports;
- plan-versus-actual insights;
- user-configurable week start, timezone, and intensity scales.

## 15. Risks and decisions

| Risk / decision | Current position | Mitigation / follow-up |
| --- | --- | --- |
| Color overload | Hue only identifies project | Keep status in border/fill/text; add patterns later |
| Duration is not comparable across projects | Each project owns a visual target | Show exact minutes and document the scale |
| A missed plan may feel punitive | Border means intent, not failure | Avoid negative labels in the base calendar |
| Timezone changes alter historical interpretation | Store attributed local date and timestamps | Define explicit re-attribution behavior before sync |
| Recurring plans can complicate edits | Out of scope for v0.1 | Model recurrence separately from generated instances |
| Month payload may grow | Return daily summaries | Keep raw-entry range endpoints separate |
| Mock adapter diverges from service | Shared interface and contract fixtures | Run both adapters against the same contract tests |

## 16. Acceptance criteria for the template

- The template always opens on September 2026 and displays mock data for all four named projects, independent of the system date. Today navigates to the real current month.
- At least one cell shows a planned-only outlined block.
- Filled blocks visibly change intensity with actual duration.
- Project filters hide and restore blocks without changing data.
- Previous, next, and Today controls work.
- Selecting a day opens exact planned and actual totals.
- Logging time through the dialog updates the in-memory month projection.
- Types, mock adapter, pure domain functions, and components are separated.
- `npm run lint`, `npm run test`, and `npm run build` pass.
- The primary screen remains usable at desktop and narrow viewport sizes.

## 17. Open questions

1. Should plan completion compare actual duration with planned duration, or only require any actual activity?
2. Is `intensityTargetMinutes` a per-project preference, a global scale, or derived from history?
3. Should missed plans remain indefinitely visible, or fade after a configurable review window?
4. Which storage target should Phase 1 use: browser-local database, a local service, or a hosted API?
5. Should notes support Markdown, attachments, or plain text only?
6. What is the required export format for long-term ownership: JSON, CSV, iCalendar, or all three?
