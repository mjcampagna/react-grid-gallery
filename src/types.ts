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
  onActivate?: (index: number) => void
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
  items: Array<{
    item: GalleryItem<T>
    width: number
    height: number
    loaded: boolean
  }>
  height: number
}
