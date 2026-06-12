import type { GalleryItem, GridLayoutRow } from './types'

export function computeGridLayout<T>(
  items: GalleryItem<T>[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
): GridLayoutRow<T>[] {
  if (
    items.length === 0 ||
    !Number.isFinite(columns) ||
    !Number.isFinite(cellWidth) ||
    !Number.isFinite(cellHeight) ||
    columns <= 0 ||
    cellWidth <= 0 ||
    cellHeight < 0
  ) return []

  const columnCount = Math.max(1, Math.floor(columns))
  const rows: GridLayoutRow<T>[] = []
  for (let i = 0; i < items.length; i += columnCount) {
    rows.push({
      items: items.slice(i, i + columnCount),
      cellWidth,
      height: cellHeight,
    })
  }
  return rows
}
