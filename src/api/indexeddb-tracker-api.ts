import { aggregateDays, byDisplayOrder } from '../domain/calendar'
import { createId } from '../domain/id'
import type {
  Activity,
  CreateActivityInput,
  CreatePlanInput,
  MonthKey,
  MonthOverview,
  Plan,
  Project,
} from '../types/tracker'
import { DEFAULT_PROJECTS } from './seed-data'
import { TrackerApiError, type RequestOptions, type TrackerApi } from './tracker-api'
import { assertValidEntry } from './validation'

export const DB_NAME = 'tempo'
export const DB_VERSION = 1

const PROJECT_STORE = 'projects'
const PLAN_STORE = 'plans'
const ACTIVITY_STORE = 'activities'
const DATE_INDEX = 'by-date'

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result

      // oldVersion 0 means a brand new database: the one moment we seed.
      if (event.oldVersion < 1) {
        const projects = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
        for (const project of DEFAULT_PROJECTS) projects.add(project)

        for (const name of [PLAN_STORE, ACTIVITY_STORE]) {
          const store = db.createObjectStore(name, { keyPath: 'id' })
          store.createIndex(DATE_INDEX, 'date', { unique: false })
        }
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // A newer tab upgrading the schema would otherwise block on this handle.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open the database'))
    request.onblocked = () => reject(new Error('Another tab is holding an older version of the database open'))
  })
}

function monthRange(month: MonthKey): IDBKeyRange {
  return IDBKeyRange.bound(`${month}-01`, `${month}-31`)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
}

function asTrackerApiError(error: unknown, message: string): TrackerApiError {
  if (error instanceof TrackerApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') throw error
  return new TrackerApiError(message, 'STORAGE', error)
}

export function createIndexedDbTrackerApi(): TrackerApi {
  let connection: Promise<IDBDatabase> | null = null

  function connect(): Promise<IDBDatabase> {
    // Retry on the next call if opening failed, rather than caching the failure.
    if (!connection) {
      connection = openDatabase().catch((error: unknown) => {
        connection = null
        throw error
      })
    }
    return connection
  }

  async function readProjects(db: IDBDatabase): Promise<Project[]> {
    const rows = await promisify<Project[]>(db.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).getAll())
    return rows.sort(byDisplayOrder)
  }

  async function write<T>(storeName: string, record: T): Promise<T> {
    const db = await connect()
    const transaction = db.transaction(storeName, 'readwrite')
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Write failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Write aborted'))
    })
    transaction.objectStore(storeName).add(record)
    await done
    return record
  }

  return {
    async listProjects(options?: RequestOptions) {
      try {
        throwIfAborted(options?.signal)
        const db = await connect()
        throwIfAborted(options?.signal)
        return await readProjects(db)
      } catch (error) {
        throw asTrackerApiError(error, 'Saved projects could not be read.')
      }
    },

    async getMonthOverview(month: MonthKey, options?: RequestOptions) {
      try {
        throwIfAborted(options?.signal)
        const db = await connect()
        throwIfAborted(options?.signal)

        const transaction = db.transaction([PROJECT_STORE, PLAN_STORE, ACTIVITY_STORE], 'readonly')
        const range = monthRange(month)
        // All three requests are issued before the first await so the
        // transaction cannot auto-commit between them.
        const projectsRequest = transaction.objectStore(PROJECT_STORE).getAll()
        const plansRequest = transaction.objectStore(PLAN_STORE).index(DATE_INDEX).getAll(range)
        const activitiesRequest = transaction.objectStore(ACTIVITY_STORE).index(DATE_INDEX).getAll(range)

        const [allProjects, plans, activities] = await Promise.all([
          promisify<Project[]>(projectsRequest),
          promisify<Plan[]>(plansRequest),
          promisify<Activity[]>(activitiesRequest),
        ])
        throwIfAborted(options?.signal)

        const overview: MonthOverview = {
          month,
          projects: allProjects.filter((project) => !project.isArchived).sort(byDisplayOrder),
          days: aggregateDays(plans, activities),
          totals: {
            plannedMinutes: plans.reduce((total, plan) => total + plan.plannedMinutes, 0),
            actualMinutes: activities.reduce((total, activity) => total + activity.durationMinutes, 0),
            activeDays: new Set(activities.map((activity) => activity.date)).size,
          },
        }
        return overview
      } catch (error) {
        throw asTrackerApiError(error, 'This month could not be read from storage.')
      }
    },

    async createActivity(input: CreateActivityInput) {
      try {
        const db = await connect()
        assertValidEntry(await readProjects(db), input.projectId, input.date, input.durationMinutes)
        const activity: Activity = { ...input, id: createId(), source: 'manual' }
        return await write(ACTIVITY_STORE, activity)
      } catch (error) {
        throw asTrackerApiError(error, 'This activity could not be saved.')
      }
    },

    async createPlan(input: CreatePlanInput) {
      try {
        const db = await connect()
        assertValidEntry(await readProjects(db), input.projectId, input.date, input.plannedMinutes)
        const plan: Plan = { ...input, id: createId() }
        return await write(PLAN_STORE, plan)
      } catch (error) {
        throw asTrackerApiError(error, 'This plan could not be saved.')
      }
    },
  }
}
