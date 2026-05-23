import type { ReactEventHandler, ReactNode } from 'react'

import { useGridGallery } from './useGridGallery'
import type { GalleryItem, GridOptions, ScrollContainerRef } from './types'

type Props<T> = {
  items: GalleryItem<T>[]
  renderItem: (
    item: GalleryItem<T>,
    layout: { loaded: boolean },
    handlers: { onLoad: ReactEventHandler<HTMLImageElement>; onError: ReactEventHandler<HTMLImageElement> },
  ) => ReactNode
  scrollContainerRef?: ScrollContainerRef
} & GridOptions

export function GridGallery<T>({ items, renderItem, scrollContainerRef, ...options }: Props<T>): ReactNode {
  const { containerRef, rows, cellWidth, cellHeight, gap, onLoad, onError, virtualWindow } = useGridGallery(
    items,
    options,
    scrollContainerRef,
  )

  const firstIndex = virtualWindow?.firstIndex ?? 0
  const lastIndex = virtualWindow?.lastIndex ?? rows.length - 1
  const visibleRows = virtualWindow ? rows.slice(firstIndex, lastIndex + 1) : rows

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {virtualWindow && virtualWindow.topSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.topSpacerHeight, contain: 'layout' }} />
      )}
      {visibleRows.map((row, i) => {
        const rowIndex = firstIndex + i
        return (
          <div key={rowIndex} style={{ display: 'flex', gap: `${gap}px`, contain: 'layout' }}>
            {row.items.map(({ item, loaded }) => (
              <div key={item.key} style={{ flex: `0 0 ${cellWidth}px`, height: `${cellHeight}px` }}>
                {renderItem(
                  item,
                  { loaded },
                  {
                    onLoad: () => onLoad(item.key),
                    onError: () => onError(item.key),
                  },
                )}
              </div>
            ))}
          </div>
        )
      })}
      {virtualWindow && virtualWindow.bottomSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.bottomSpacerHeight, contain: 'layout' }} />
      )}
    </div>
  )
}
