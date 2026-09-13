import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import type { ApiToken, CreatedApiToken, TokenApi } from '../api/token-api'
import { TrackerApiError } from '../api/tracker-api'
import { Icon } from './Icon'
import { useModalDialog } from './use-modal-dialog'

interface TokenDialogProps {
  tokenApi: TokenApi
  onClose: () => void
}

function formatDate(value?: string): string {
  if (!value) return 'never'
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function TokenDialog({ tokenApi, onClose }: TokenDialogProps) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const titleId = useId()

  // Used after a create or revoke, where there is no effect to abort.
  const refresh = useCallback(async () => {
    try {
      setTokens(await tokenApi.list())
    } catch (caught: unknown) {
      setError(caught instanceof TrackerApiError ? caught.message : 'Could not load your tokens.')
      setTokens([])
    }
  }, [tokenApi])

  useEffect(() => {
    const controller = new AbortController()
    tokenApi.list({ signal: controller.signal })
      .then((list) => {
        if (!controller.signal.aborted) setTokens(list)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(caught instanceof TrackerApiError ? caught.message : 'Could not load your tokens.')
        setTokens([])
      })
    return () => controller.abort()
  }, [tokenApi])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (isWorking) return

    // The button stays enabled on an empty name and explains the problem on
    // submit. Disabling it made it look broken rather than incomplete.
    if (!name.trim()) {
      setError('Give the token a name first, so you can tell your tokens apart later.')
      return
    }

    setError(null)
    setIsWorking(true)
    try {
      setCreated(await tokenApi.create(name.trim()))
      setName('')
      await refresh()
    } catch (caught: unknown) {
      setError(caught instanceof TrackerApiError ? caught.message : 'Could not create the token.')
    } finally {
      setIsWorking(false)
    }
  }

  async function handleRevoke(id: string) {
    setError(null)
    setIsWorking(true)
    try {
      await tokenApi.revoke(id)
      if (created?.id === id) setCreated(null)
      await refresh()
    } catch (caught: unknown) {
      setError(caught instanceof TrackerApiError ? caught.message : 'Could not revoke the token.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog dialog-wide" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <span className="eyebrow">Account</span>
        <h2 id={titleId}>API tokens</h2>
        <p className="token-lede">
          A token lets an assistant read and write this account. Treat it like a password,
          and revoke it if it leaks.
        </p>

        {created && (
          <div className="token-reveal" role="status">
            <strong>Copy this now — it is not shown again.</strong>
            <code>{created.token}</code>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <form className="token-create" onSubmit={handleCreate}>
          <label>
            New token name
            <input
              type="text"
              maxLength={80}
              value={name}
              placeholder="claude"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={isWorking}>
            <Icon name="plus" /> {isWorking ? 'Working…' : 'Create'}
          </button>
        </form>

        <div className="token-list">
          {tokens === null ? <p className="token-empty">Loading…</p>
            : tokens.length === 0 ? <p className="token-empty">No tokens yet.</p>
            : tokens.map((token) => (
              <div className="token-row" key={token.id}>
                <div>
                  <strong>{token.name}</strong>
                  <span>{token.prefix}… · created {formatDate(token.createdAt)} · last used {formatDate(token.lastUsedAt)}</span>
                </div>
                <button type="button" className="text-button" disabled={isWorking} onClick={() => handleRevoke(token.id)}>
                  Revoke
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
