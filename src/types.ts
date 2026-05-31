import type { RefObject } from 'react'

export type ScrollContainerRef = RefObject<HTMLElement | null> | HTMLElement | null

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
}

export type GalleryItem<T> = T & {
  key: string | number
}

export type GridLayoutRow<T> = {
  items: GalleryItem<T>[]
  width: number
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
