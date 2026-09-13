import { TrackerApiError, type TrackerApiErrorCode } from './tracker-api'

const API_BASE = '/api'

const CODES_BY_STATUS: Record<number, TrackerApiErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHENTICATED',
  403: 'UNAUTHENTICATED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

const KNOWN_CODES: readonly TrackerApiErrorCode[] = [
  'NOT_FOUND', 'VALIDATION', 'NETWORK', 'UNAUTHENTICATED', 'CONFLICT', 'UNKNOWN',
]

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Single entry point for every call to the API. Failures arrive as
 * TrackerApiError with the same codes the UI already handles, so a transport
 * change stays invisible above src/api/.
 */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TrackerApiError('Could not reach the server. Check your connection.', 'NETWORK', error)
  }

  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const body = payload as ErrorPayload | null
    const reported = body?.error?.code
    const code = KNOWN_CODES.find((known) => known === reported)
      ?? CODES_BY_STATUS[response.status]
      ?? 'UNKNOWN'
    throw new TrackerApiError(
      body?.error?.message ?? 'Something went wrong. Please try again.',
      code,
    )
  }

  return payload as T
}
