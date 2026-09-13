import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Makes a container behave like a modal dialog: focus moves in on open, Tab
 * cycles within it, Escape closes, and focus returns to whatever opened it.
 */
export function useModalDialog<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)

  // Kept in a ref so an inline arrow from the parent does not re-run the effect
  // on every render, which would steal focus back mid-typing.
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const container = containerRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Deliberately not filtered by offsetParent: that reports null for
    // descendants of fixed-position containers and in non-layout environments,
    // which would silently empty the trap. The selector already skips disabled
    // controls; hidden ones are excluded explicitly.
    const focusableItems = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

    focusableItems()[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return

      const items = focusableItems()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [])

  return containerRef
}
