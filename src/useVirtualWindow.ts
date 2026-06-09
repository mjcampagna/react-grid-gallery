import { useEffect, useRef, useState } from 'react'

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
 * scrollable div rather than the page itself.
 */
export function useVirtualWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  scrollContainerRef?: ScrollContainerRef,
): { top: number; bottom: number } | null {
  const [range, setRange] = useState<{ top: number; bottom: number } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const publishRange = () => {
      const el = containerRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const sc = resolveScrollEl(scrollContainerRef)

      if (sc) {
        const scRect = sc.getBoundingClientRect()
        const top = sc.scrollTop - (rect.top - scRect.top + sc.scrollTop)
        setRange({ top, bottom: top + sc.clientHeight })
        return
      }

      const top = window.scrollY - (rect.top + window.scrollY)
      setRange({ top, bottom: top + window.innerHeight })
    }

    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        publishRange()
        rafIdRef.current = null
      })
    }

    publishRange()

    const target = resolveScrollEl(scrollContainerRef) ?? window
    target.addEventListener('scroll', scheduleUpdate, { passive: true })
    if (target === window) {
      window.addEventListener('resize', publishRange, { passive: true })
    }

    const ro = new ResizeObserver(publishRange)
    const containerEl = containerRef.current
    if (containerEl) ro.observe(containerEl)
    if (target !== window) ro.observe(target as HTMLElement)

    return () => {
      target.removeEventListener('scroll', scheduleUpdate)
      if (target === window) window.removeEventListener('resize', publishRange)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      ro.disconnect()
    }
  }, [enabled, containerRef, scrollContainerRef])

  return enabled ? range : null
}
