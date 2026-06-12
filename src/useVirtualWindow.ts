import { useLayoutEffect, useRef, useState } from 'react'

import type { ScrollContainerRef } from './types'

export function resolveScrollEl(ref: ScrollContainerRef | undefined): HTMLElement | null {
  if (ref == null) return null
  if ('current' in ref) return ref.current
  return ref
}

/**
 * Tracks the visible pixel range within a gallery container relative to its
 * top edge. Returns `{ top, bottom }` where both values are in container-local
 * coordinates (i.e. scroll-adjusted relative to the container's top).
 *
 * When `enabled` is false, no scroll listener is attached and the hook returns
 * null. The hook is always called (Rules of Hooks), but does nothing.
 *
 * When `scrollContainerRef` is provided, the scroll listener is attached to
 * that element instead of `window`. Use this when the gallery lives inside a
 * scrollable div rather than the page itself. The ref is re-resolved on every
 * render, so it may be populated after mount or point at a remounted element;
 * listeners re-attach whenever the resolved element changes.
 */
export function useVirtualWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  scrollContainerRef?: ScrollContainerRef,
): { top: number; bottom: number } | null {
  const [range, setRange] = useState<{ top: number; bottom: number } | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const rafIdRef = useRef<number | null>(null)

  // No dependency array: the ref's element may appear after this hook's first
  // effect (late mount) or change identity (remount), neither of which changes
  // the ref object itself. The setState bails out when the element is the same.
  useLayoutEffect(() => {
    setScrollEl(resolveScrollEl(scrollContainerRef))
  })

  useLayoutEffect(() => {
    if (!enabled) return

    const publishRange = () => {
      const el = containerRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()

      let top: number
      let bottom: number
      if (scrollEl) {
        top = scrollEl.getBoundingClientRect().top - rect.top
        bottom = top + scrollEl.clientHeight
      } else {
        top = -rect.top
        bottom = top + window.innerHeight
      }

      setRange(prev => (prev && prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    }

    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        publishRange()
        rafIdRef.current = null
      })
    }

    publishRange()

    const target: HTMLElement | Window = scrollEl ?? window
    target.addEventListener('scroll', scheduleUpdate, { passive: true })
    if (target === window) {
      window.addEventListener('resize', scheduleUpdate, { passive: true })
    }

    const ro = new ResizeObserver(publishRange)
    const containerEl = containerRef.current
    if (containerEl) ro.observe(containerEl)
    if (scrollEl) ro.observe(scrollEl)

    return () => {
      target.removeEventListener('scroll', scheduleUpdate)
      if (target === window) window.removeEventListener('resize', scheduleUpdate)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      ro.disconnect()
    }
  }, [enabled, containerRef, scrollEl])

  return enabled ? range : null
}
