import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type RefObject } from 'react'
import type React from 'react'

import { computeGridLayout } from './computeGridLayout'
import { useVirtualWindow, resolveScrollEl } from './useVirtualWindow'
import type { GalleryItem, GridOptions, GridRow, ScrollContainerRef } from './types'

type VirtualWindow = {
  firstIndex: number
  lastIndex: number
  topSpacerHeight: number
  bottomSpacerHeight: number
}

export function useGridGallery<T>(
  items: GalleryItem<T>[],
  options: GridOptions,
  scrollContainerRef?: ScrollContainerRef,
): {
  containerRef: RefObject<HTMLDivElement | null>
  rows: GridRow<T>[]
  cellWidth: number
  cellHeight: number
  gap: number
  columns: number
  onLoad: (key: string | number) => void
  onError: (key: string | number) => void
  virtualWindow: VirtualWindow | null
  focusedIndex: number
  handleItemFocus: (index: number) => void
  handleItemKeyDown: (itemIndex: number, e: React.KeyboardEvent) => void
} {
  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const pendingFocusRef = useRef<number | null>(null)

  const loadedSet = useRef<Set<string | number>>(new Set())
  const [, rerender] = useReducer(n => n + 1, 0)

  const prevRowsRef = useRef<GridRow<T>[]>([])

  const virtualRange = useVirtualWindow(containerRef, options.virtualize === true, scrollContainerRef)

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setContainerWidth(width)
    })
    const el = containerRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  const onLoad = useCallback((key: string | number) => {
    if (!loadedSet.current.has(key)) {
      loadedSet.current.add(key)
      rerender()
    }
  }, [])

  // No layout implication — exposed for API symmetry and stable ref
  const onError = useCallback((_key: string | number) => {}, [])

  // ─── Layout ────────────────────────────────────────────────────────────────

  const resolvedColumns = Math.max(
    1,
    Math.round(typeof options.columns === 'function' ? options.columns(containerWidth) : options.columns),
  )
  const resolvedGap =
    typeof options.gap === 'function' ? options.gap(containerWidth) : (options.gap ?? 0)
  const resolvedAspectRatio =
    typeof options.aspectRatio === 'function' ? options.aspectRatio(containerWidth) : (options.aspectRatio ?? 1)

  const cellWidth =
    containerWidth > 0
      ? Math.floor((containerWidth - resolvedGap * (resolvedColumns - 1)) / resolvedColumns)
      : 0
  const cellHeight = cellWidth > 0 ? Math.round(cellWidth / resolvedAspectRatio) : 0

  let rows: GridRow<T>[] = []
  if (containerWidth > 0 && cellWidth > 0) {
    const layoutRows = computeGridLayout(items, resolvedColumns, cellWidth, cellHeight)
    rows = layoutRows.map(row => ({
      height: row.height,
      items: row.items.map(item => ({
        item,
        width: row.width,
        height: row.height,
        loaded: loadedSet.current.has(item.key),
      })),
    }))
  }

  // Stabilize the rows reference — only replace when content actually changes
  const isStable =
    rows.length === prevRowsRef.current.length &&
    rows.every((row, i) => {
      const prev = prevRowsRef.current[i]
      return (
        row.height === prev?.height &&
        row.items.length === prev?.items.length &&
        row.items.every(
          (cell, j) =>
            cell.loaded === prev.items[j]?.loaded &&
            cell.item === prev.items[j]?.item,
        )
      )
    })
  if (!isStable) {
    prevRowsRef.current = rows
  }

  // ─── Virtual window ────────────────────────────────────────────────────────

  const rowStride = cellHeight + resolvedGap
  let virtualWindow: VirtualWindow | null = null

  if (options.virtualize && virtualRange !== null && prevRowsRef.current.length > 0) {
    const totalRows = prevRowsRef.current.length
    const overscan = options.overscan ?? cellHeight * 2
    const visibleTop = virtualRange.top - overscan
    const visibleBottom = virtualRange.bottom + overscan

    // All rows have uniform height — compute range directly without scanning
    let firstIndex = Math.max(0, Math.floor(visibleTop / rowStride))
    let lastIndex = Math.min(totalRows - 1, Math.ceil(visibleBottom / rowStride) - 1)

    if (firstIndex > lastIndex) {
      firstIndex = 0
      lastIndex = totalRows - 1
    }

    const topSpacerHeight = firstIndex * rowStride
    const bottomSpacerHeight = (totalRows - 1 - lastIndex) * rowStride

    virtualWindow = { firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight }
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  const padding = options.padding ?? 0

  function scrollToRow(rowIndex: number): void {
    const rowTop = padding + rowIndex * rowStride
    const rowBottom = rowTop + cellHeight
    const scrollEl = resolveScrollEl(scrollContainerRef)
    if (scrollEl) {
      if (rowTop < scrollEl.scrollTop) {
        scrollEl.scrollTop = rowTop
      } else if (rowBottom > scrollEl.scrollTop + scrollEl.clientHeight) {
        scrollEl.scrollTop = rowBottom - scrollEl.clientHeight
      }
    } else {
      const containerEl = containerRef.current
      if (!containerEl) return
      const absTop = containerEl.getBoundingClientRect().top + window.scrollY + rowTop
      const absBottom = absTop + cellHeight
      if (absTop < window.scrollY) {
        window.scrollTo({ top: absTop })
      } else if (absBottom > window.scrollY + window.innerHeight) {
        window.scrollTo({ top: absBottom - window.innerHeight })
      }
    }
  }

  function navigateTo(newIndex: number): void {
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(newIndex, items.length - 1))
    setFocusedIndex(clamped)
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-grid-index="${clamped}"]`)
    if (target) {
      target.focus()
    } else {
      scrollToRow(Math.floor(clamped / resolvedColumns))
      pendingFocusRef.current = clamped
    }
  }

  function handleItemKeyDown(itemIndex: number, e: React.KeyboardEvent): void {
    const col = itemIndex % resolvedColumns
    const rowStart = itemIndex - col
    const rowEnd = Math.min(rowStart + resolvedColumns - 1, items.length - 1)
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        navigateTo(itemIndex + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        navigateTo(itemIndex - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        navigateTo(itemIndex + resolvedColumns)
        break
      case 'ArrowUp':
        e.preventDefault()
        navigateTo(itemIndex - resolvedColumns)
        break
      case 'Home':
        e.preventDefault()
        navigateTo(e.ctrlKey ? 0 : rowStart)
        break
      case 'End':
        e.preventDefault()
        navigateTo(e.ctrlKey ? items.length - 1 : rowEnd)
        break
      case ' ':
      case 'Enter':
        e.preventDefault()
        options.onActivate?.(itemIndex)
        break
    }
  }

  // No deps — runs after every render to detect when a scrolled-to item appears in the DOM and focus it
  useLayoutEffect(() => {
    if (pendingFocusRef.current === null) return
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-grid-index="${pendingFocusRef.current}"]`)
    if (target) {
      target.focus()
      pendingFocusRef.current = null
    }
  })

  return {
    containerRef,
    rows: prevRowsRef.current,
    cellWidth,
    cellHeight,
    gap: resolvedGap,
    columns: resolvedColumns,
    onLoad,
    onError,
    virtualWindow,
    focusedIndex,
    handleItemFocus: setFocusedIndex,
    handleItemKeyDown,
  }
}
