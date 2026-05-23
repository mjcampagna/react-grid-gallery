import type { GalleryItem, GridLayoutRow } from './types'

export function computeGridLayout<T>(
  items: GalleryItem<T>[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
): GridLayoutRow<T>[] {
  if (items.length === 0 || columns <= 0 || cellWidth <= 0) return []

  const rows: GridLayoutRow<T>[] = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push({
      items: items.slice(i, i + columns),
      width: cellWidth,
      height: cellHeight,
    })
  }
  return rows
}
