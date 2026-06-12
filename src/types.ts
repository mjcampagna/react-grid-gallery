import type { ReactEventHandler, RefObject } from 'react'

export type ScrollContainerRef = RefObject<HTMLElement | null> | HTMLElement | null

export type GridRenderMetrics = {
  virtualized: boolean
  mountedItemCount: number
  mountedRowCount: number
  totalItemCount: number
  totalRowCount: number
  firstMountedRowIndex: number | null
  lastMountedRowIndex: number | null
}

export type GridOptions = {
  columns: number | ((containerWidth: number) => number)
  gap?: number | ((containerWidth: number) => number)
  aspectRatio?: number | ((containerWidth: number) => number)
  padding?: number
  virtualize?: boolean
  overscan?: number
  navigable?: boolean
  focusedIndex?: number
  onFocusedIndexChange?: (index: number) => void
  onActivate?: (index: number, shiftKey: boolean) => void
  /** Should be stable (e.g. `useCallback`) — called on every render where metrics change. */
  onRenderMetricsChange?: (metrics: GridRenderMetrics) => void
}

export type GridItemLayout = {
  loaded: boolean
  focused: boolean
}

export type GridItemImageProps = {
  onLoad: ReactEventHandler<HTMLImageElement>
  onError: ReactEventHandler<HTMLImageElement>
}

export type GridItemRenderHandlers = {
  /** Stable props to spread onto the rendered `<img>` (`{...handlers.imageProps}`). */
  imageProps: GridItemImageProps
}

export type GalleryItem<T> = T & {
  key: string | number
}

export type GridLayoutRow<T> = {
  items: GalleryItem<T>[]
  /**
   * Uniform cell width in px. This is the floored integer width; cells are
   * actually laid out with `1fr` tracks, so the rendered width is the exact
   * fractional `(containerWidth - gaps) / columns`. Use this as an approximation
   * for `sizes`/`srcset` math, not a pixel-exact measurement.
   */
  cellWidth: number
  height: number
}

export type GridRow<T> = {
  rowIndex: number
  startIndex: number
  items: Array<{
    item: GalleryItem<T>
    itemIndex: number
    colIndex: number
    width: number
    height: number
    loaded: boolean
  }>
  height: number
}
