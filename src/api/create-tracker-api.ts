import { createIndexedDbTrackerApi, isIndexedDbAvailable } from './indexeddb-tracker-api'
import { createMockTrackerApi } from './mock-tracker-api'
import type { TrackerApi } from './tracker-api'

export interface TrackerApiHandle {
  api: TrackerApi
  /** False when the browser denied IndexedDB and nothing will survive a reload. */
  isPersistent: boolean
}

/**
 * IndexedDB is unavailable in some private-browsing modes and when site data is
 * blocked. Rather than failing to start, fall back to the in-memory adapter and
 * report it, so the UI can warn that entries will not be kept.
 */
export function createTrackerApi(): TrackerApiHandle {
  if (isIndexedDbAvailable()) {
    return { api: createIndexedDbTrackerApi(), isPersistent: true }
  }
  return { api: createMockTrackerApi({ latencyMs: 0 }), isPersistent: false }
}
