import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react'

import { computeGridLayout } from './computeGridLayout'
import { useVirtualWindow } from './useVirtualWindow'
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
} {
  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

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
  const resolvedAspectRatio = options.aspectRatio ?? 1

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

  let virtualWindow: VirtualWindow | null = null

  if (options.virtualize && virtualRange !== null && prevRowsRef.current.length > 0) {
    const totalRows = prevRowsRef.current.length
    const overscan = options.overscan ?? cellHeight * 2
    const visibleTop = virtualRange.top - overscan
    const visibleBottom = virtualRange.bottom + overscan

    // All rows have uniform height — compute range directly without scanning
    const rowStride = cellHeight + resolvedGap
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
  }
}
