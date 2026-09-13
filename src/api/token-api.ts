import { requestJson } from './http'

export interface ApiToken {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt?: string
  expiresAt?: string
}

/** Returned only by create: the secret is never retrievable again. */
export interface CreatedApiToken extends ApiToken {
  token: string
}

export interface TokenApi {
  list(options?: { signal?: AbortSignal }): Promise<ApiToken[]>
  create(name: string): Promise<CreatedApiToken>
  revoke(id: string): Promise<void>
}

export function createTokenApi(): TokenApi {
  return {
    list(options) {
      return requestJson<ApiToken[]>('/tokens', { signal: options?.signal })
    },
    create(name) {
      return requestJson<CreatedApiToken>('/tokens', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    },
    revoke(id) {
      return requestJson<void>(`/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}
