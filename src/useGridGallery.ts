import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type React from 'react'

import { resolveScrollEl, useVirtualWindow } from './useVirtualWindow'
import type {
  GalleryItem,
  GridItemImageProps,
  GridOptions,
  GridRenderMetrics,
  GridRow,
  ScrollContainerRef,
} from './types'

type VirtualWindow = {
  firstIndex: number
  lastIndex: number
  topSpacerHeight: number
  bottomSpacerHeight: number
}

type BaseGridItem<T> = {
  item: GalleryItem<T>
  itemIndex: number
  colIndex: number
  width: number
  height: number
}

type BaseGridRow<T> = {
  rowIndex: number
  startIndex: number
  items: BaseGridItem<T>[]
  height: number
}

type RenderMetricsRow = {
  rowIndex: number
  items: Array<unknown>
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function buildRenderMetrics(
  rows: RenderMetricsRow[],
  totalItemCount: number,
  totalRowCount: number,
  virtualized: boolean,
): GridRenderMetrics {
  return {
    virtualized,
    mountedItemCount: rows.reduce((sum, row) => sum + row.items.length, 0),
    mountedRowCount: rows.length,
    totalItemCount,
    totalRowCount,
    firstMountedRowIndex: rows[0]?.rowIndex ?? null,
    lastMountedRowIndex: rows.at(-1)?.rowIndex ?? null,
  }
}

function rowsMatch<T>(left: GridRow<T>, right: BaseGridRow<T>): boolean {
  if (
    left.rowIndex !== right.rowIndex ||
    left.startIndex !== right.startIndex ||
    left.height !== right.height ||
    left.items.length !== right.items.length
  ) {
    return false
  }

  for (let i = 0; i < right.items.length; i += 1) {
    const leftItem = left.items[i]
    const rightItem = right.items[i]
    if (
      leftItem == null ||
      leftItem.item !== rightItem.item ||
      leftItem.itemIndex !== rightItem.itemIndex ||
      leftItem.colIndex !== rightItem.colIndex ||
      leftItem.width !== rightItem.width ||
      leftItem.height !== rightItem.height
    ) {
      return false
    }
  }

  return true
}

function pruneMapEntries<T>(
  map: Map<string | number, T>,
  activeKeys: ReadonlySet<string | number>,
): void {
  for (const key of map.keys()) {
    if (!activeKeys.has(key)) {
      map.delete(key)
    }
  }
}

export function useGridGallery<T>(
  items: GalleryItem<T>[],
  options: GridOptions,
  scrollContainerRef?: ScrollContainerRef,
): {
  containerRef: RefObject<HTMLDivElement | null>
  rows: GridRow<T>[]
  totalRows: number
  cellWidth: number
  cellHeight: number
  gap: number
  columns: number
  itemKeys: ReadonlySet<string | number>
  onLoad: (key: string | number) => void
  onError: (key: string | number) => void
  getItemImageProps: (key: string | number) => GridItemImageProps
  virtualWindow: VirtualWindow | null
  focusedIndex: number
  handleItemFocus: (index: number) => void
  handleItemKeyDown: (itemIndex: number, e: React.KeyboardEvent) => void
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const pendingFocusRef = useRef<number | null>(null)
  const [loadedKeys, setLoadedKeys] = useState<ReadonlySet<string | number>>(() => new Set())
  const imagePropsCacheRef = useRef(new Map<string | number, GridItemImageProps>())
  const previousRowsRef = useRef<GridRow<T>[]>([])
  const {
    aspectRatio,
    columns,
    focusedIndex: controlledFocusedIndex,
    gap,
    onActivate,
    onFocusedIndexChange,
    onRenderMetricsChange,
    overscan,
    padding = 0,
    virtualize = false,
  } = options

  const virtualRange = useVirtualWindow(containerRef, virtualize, scrollContainerRef)

  const itemKeys = useMemo(() => new Set(items.map(item => item.key)), [items])

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setContainerWidth(width)
    })
    const el = containerRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    pruneMapEntries(imagePropsCacheRef.current, itemKeys)
    setLoadedKeys(current => {
      let changed = false
      const next = new Set<string | number>()

      for (const key of current) {
        if (itemKeys.has(key)) {
          next.add(key)
        } else {
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [itemKeys])

  const onLoad = useCallback((key: string | number) => {
    setLoadedKeys(current => {
      if (current.has(key)) return current
      const next = new Set(current)
      next.add(key)
      return next
    })
  }, [])

  const onError = useCallback((_key: string | number) => {}, [])

  const getItemImageProps = useCallback((key: string | number): GridItemImageProps => {
    const cached = imagePropsCacheRef.current.get(key)
    if (cached) return cached

    const imageProps = {
      onLoad: () => onLoad(key),
      onError: () => onError(key),
    }
    imagePropsCacheRef.current.set(key, imageProps)
    return imageProps
  }, [onError, onLoad])

  const rawColumns = typeof columns === 'function' ? columns(containerWidth) : columns
  const resolvedColumns = Math.max(1, Math.round(finitePositive(rawColumns, 1)))
  const rawGap = typeof gap === 'function' ? gap(containerWidth) : (gap ?? 0)
  const resolvedGap = finiteNonNegative(rawGap)
  const rawAspectRatio = typeof aspectRatio === 'function' ? aspectRatio(containerWidth) : (aspectRatio ?? 1)
  const resolvedAspectRatio = finitePositive(rawAspectRatio, 1)

  const cellWidth =
    containerWidth > 0
      ? Math.max(0, Math.floor((containerWidth - resolvedGap * (resolvedColumns - 1)) / resolvedColumns))
      : 0
  const cellHeight = cellWidth > 0 ? Math.round(cellWidth / resolvedAspectRatio) : 0
  const hasLayout = cellWidth > 0 && cellHeight >= 0 && items.length > 0
  const totalRows = hasLayout ? Math.ceil(items.length / resolvedColumns) : 0

  const rowStride = cellHeight + resolvedGap

  const virtualWindow = useMemo((): VirtualWindow | null => {
    if (!virtualize || virtualRange === null || totalRows === 0 || rowStride <= 0) return null

    const resolvedOverscan = overscan ?? cellHeight * 4
    const visibleTop = virtualRange.top - resolvedOverscan
    const visibleBottom = virtualRange.bottom + resolvedOverscan

    const maxRowIndex = totalRows - 1
    const firstIndex = Math.min(maxRowIndex, Math.max(0, Math.floor(visibleTop / rowStride)))
    let lastIndex = Math.min(maxRowIndex, Math.max(0, Math.ceil(visibleBottom / rowStride) - 1))

    if (firstIndex > lastIndex) {
      lastIndex = firstIndex
    }

    const topSpacerHeight = firstIndex * rowStride
    const bottomSpacerHeight = (totalRows - 1 - lastIndex) * rowStride

    return { firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight }
  }, [cellHeight, overscan, rowStride, totalRows, virtualRange, virtualize])

  const baseRows = useMemo((): BaseGridRow<T>[] => {
    if (!hasLayout) return []
    if (virtualize && virtualWindow === null) return []

    const firstRowIndex = virtualWindow?.firstIndex ?? 0
    const lastRowIndex = virtualWindow?.lastIndex ?? (totalRows - 1)
    const nextRows: BaseGridRow<T>[] = []

    for (let rowIndex = firstRowIndex; rowIndex <= lastRowIndex; rowIndex += 1) {
      const startIndex = rowIndex * resolvedColumns
      const endIndex = Math.min(startIndex + resolvedColumns, items.length)
      const rowItems: BaseGridItem<T>[] = []

      for (let itemIndex = startIndex; itemIndex < endIndex; itemIndex += 1) {
        rowItems.push({
          item: items[itemIndex],
          itemIndex,
          colIndex: itemIndex - startIndex,
          width: cellWidth,
          height: cellHeight,
        })
      }

      nextRows.push({
        rowIndex,
        startIndex,
        height: cellHeight,
        items: rowItems,
      })
    }

    return nextRows
  }, [
    cellHeight,
    cellWidth,
    hasLayout,
    items,
    resolvedColumns,
    totalRows,
    virtualWindow?.firstIndex,
    virtualWindow?.lastIndex,
    virtualize,
  ])

  const rows = useMemo(() => {
    const previousRows = previousRowsRef.current
    if (baseRows.length === 0) {
      return []
    }
    let allRowsReused = previousRows.length === baseRows.length

    const nextRows = baseRows.map((baseRow, rowOffset) => {
      const previousRow = previousRows[rowOffset]
      let rowReused = previousRow != null && rowsMatch(previousRow, baseRow)

      const nextItems = baseRow.items.map((baseItem, itemOffset) => {
        const loaded = loadedKeys.has(baseItem.item.key)
        const previousItem = previousRow?.items[itemOffset]

        if (
          previousItem != null &&
          previousItem.item === baseItem.item &&
          previousItem.itemIndex === baseItem.itemIndex &&
          previousItem.colIndex === baseItem.colIndex &&
          previousItem.width === baseItem.width &&
          previousItem.height === baseItem.height &&
          previousItem.loaded === loaded
        ) {
          return previousItem
        }

        rowReused = false
        return {
          ...baseItem,
          loaded,
        }
      })

      if (rowReused && previousRow != null) {
        return previousRow
      }

      allRowsReused = false
      return {
        rowIndex: baseRow.rowIndex,
        startIndex: baseRow.startIndex,
        height: baseRow.height,
        items: nextItems,
      }
    })

    if (allRowsReused) {
      return previousRows
    }

    return nextRows
  }, [baseRows, loadedKeys])

  useLayoutEffect(() => {
    previousRowsRef.current = rows
  }, [rows])

  const isControlled = controlledFocusedIndex !== undefined

  const scrollToRow = useCallback((rowIndex: number): void => {
    const rowTop = padding + rowIndex * rowStride
    const rowBottom = rowTop + cellHeight
    const scrollEl = resolveScrollEl(scrollContainerRef)
    if (scrollEl) {
      const visibleTop = scrollEl.scrollTop + padding
      const visibleBottom = scrollEl.scrollTop + scrollEl.clientHeight - padding
      if (rowTop < visibleTop) {
        scrollEl.scrollTop = rowTop - padding
      } else if (rowBottom > visibleBottom) {
        scrollEl.scrollTop = rowBottom - scrollEl.clientHeight + padding
      }
    } else {
      const containerEl = containerRef.current
      if (!containerEl) return
      const absTop = containerEl.getBoundingClientRect().top + window.scrollY + rowTop
      const absBottom = absTop + cellHeight
      const visibleTop = window.scrollY + padding
      const visibleBottom = window.scrollY + window.innerHeight - padding
      if (absTop < visibleTop) {
        window.scrollTo({ top: absTop - padding })
      } else if (absBottom > visibleBottom) {
        window.scrollTo({ top: absBottom - window.innerHeight + padding })
      }
    }
  }, [cellHeight, padding, rowStride, scrollContainerRef])

  const navigateTo = useCallback((newIndex: number): void => {
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(newIndex, items.length - 1))
    if (!isControlled) setFocusedIndex(clamped)
    onFocusedIndexChange?.(clamped)
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-grid-index="${clamped}"]`)
    if (target) {
      target.focus()
    } else {
      scrollToRow(Math.floor(clamped / resolvedColumns))
      pendingFocusRef.current = clamped
    }
  }, [isControlled, items.length, onFocusedIndexChange, resolvedColumns, scrollToRow])

  const handleItemKeyDown = useCallback((itemIndex: number, e: React.KeyboardEvent): void => {
    const col = itemIndex % resolvedColumns
    const rowStart = itemIndex - col
    const rowEnd = Math.min(rowStart + resolvedColumns - 1, items.length - 1)
    switch (e.key) {
      case 'ArrowRight':
        if (e.metaKey) break
        e.preventDefault()
        navigateTo(itemIndex + 1)
        break
      case 'ArrowLeft':
        if (e.metaKey) break
        e.preventDefault()
        navigateTo(itemIndex - 1)
        break
      case 'ArrowDown':
        if (e.metaKey) break
        e.preventDefault()
        navigateTo(itemIndex + resolvedColumns)
        break
      case 'ArrowUp':
        if (e.metaKey) break
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
        onActivate?.(itemIndex, e.shiftKey)
        break
    }
  }, [items.length, navigateTo, onActivate, resolvedColumns])

  useLayoutEffect(() => {
    if (pendingFocusRef.current === null) return
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-grid-index="${pendingFocusRef.current}"]`)
    if (target) {
      target.focus()
      pendingFocusRef.current = null
    }
  })

  const effectiveFocusedIndex = controlledFocusedIndex ?? focusedIndex

  const renderMetrics = useMemo(
    () => buildRenderMetrics(baseRows, items.length, totalRows, virtualize),
    [baseRows, items.length, totalRows, virtualize],
  )

  useEffect(() => {
    onRenderMetricsChange?.(renderMetrics)
  }, [onRenderMetricsChange, renderMetrics])

  const handleItemFocus = useCallback((index: number): void => {
    if (!isControlled) setFocusedIndex(index)
    onFocusedIndexChange?.(index)
  }, [isControlled, onFocusedIndexChange])

  return {
    containerRef,
    rows,
    totalRows,
    cellWidth,
    cellHeight,
    gap: resolvedGap,
    columns: resolvedColumns,
    itemKeys,
    onLoad,
    onError,
    getItemImageProps,
    virtualWindow,
    focusedIndex: effectiveFocusedIndex,
    handleItemFocus,
    handleItemKeyDown,
  }
}
